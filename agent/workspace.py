"""A per-user, sandboxed directory. Every path from a client goes through resolve()."""
from __future__ import annotations

from pathlib import Path
from typing import Dict, List


class WorkspaceError(Exception):
    """Base error. `status` is the HTTP status the API should return."""

    status = 400


class InvalidPath(WorkspaceError):
    status = 400


class NotFound(WorkspaceError):
    status = 404


class TooLarge(WorkspaceError):
    status = 413


class NotText(WorkspaceError):
    status = 415


_SKIP_DIRS = {"node_modules", "__pycache__", ".git"}
_MAX_TREE_ENTRIES = 2000
_MAX_TREE_DEPTH = 8
_MAX_PATH_CHARS = 240


class Workspace:
    def __init__(self, root: Path, max_file_bytes: int, max_files: int):
        self.root = Path(root)
        self.root.mkdir(parents=True, exist_ok=True)
        self._root = self.root.resolve()
        self.max_file_bytes = max_file_bytes
        self.max_files = max_files

    # -- path safety -------------------------------------------------------
    def resolve(self, rel_path: str) -> Path:
        """Map a client-supplied relative path to an absolute path inside the workspace.

        Rejects: empty, NUL bytes, absolute paths (POSIX, Windows drive letters, UNC),
        anything resolving outside the root (``..``, symlinks).
        """
        if not rel_path or not isinstance(rel_path, str) or "\0" in rel_path:
            raise InvalidPath("Invalid file path")
        if len(rel_path) > _MAX_PATH_CHARS:
            raise InvalidPath("File path is too long")
        normalized = rel_path.replace("\\", "/")
        if normalized.startswith("/"):
            raise InvalidPath("Absolute paths are not allowed")
        # ':' covers drive letters (C:x) and NTFS alternate data streams (a.py:hidden).
        if ":" in normalized:
            raise InvalidPath("Invalid character ':' in path")
        candidate = (self._root / normalized).resolve()
        if candidate == self._root or not candidate.is_relative_to(self._root):
            raise InvalidPath("Path escapes the workspace")
        return candidate

    def relative(self, absolute: Path) -> str:
        return absolute.relative_to(self._root).as_posix()

    # -- operations --------------------------------------------------------
    def read(self, rel_path: str) -> str:
        path = self.resolve(rel_path)
        if not path.exists():
            raise NotFound("File not found")
        if not path.is_file():
            raise InvalidPath("Path is not a file")
        if path.stat().st_size > self.max_file_bytes:
            raise TooLarge("File is too large to open")
        try:
            return path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            raise NotText("File is not UTF-8 text")

    def write(self, rel_path: str, content: str) -> str:
        path = self.resolve(rel_path)
        data = content.encode("utf-8")
        if len(data) > self.max_file_bytes:
            raise TooLarge(f"File exceeds {self.max_file_bytes} bytes")
        if path.is_dir():
            raise InvalidPath("Path is a directory")
        if not path.exists() and self._count_files() >= self.max_files:
            raise TooLarge("Workspace file limit reached")
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
        return self.relative(path)

    def tree(self) -> List[Dict]:
        budget = [_MAX_TREE_ENTRIES]

        def walk(directory: Path, depth: int) -> List[Dict]:
            nodes: List[Dict] = []
            try:
                entries = sorted(directory.iterdir(), key=lambda p: (p.is_file(), p.name.lower()))
            except OSError:
                return nodes
            for entry in entries:
                if budget[0] <= 0:
                    break
                if entry.name.startswith(".") or entry.name in _SKIP_DIRS or entry.is_symlink():
                    continue
                budget[0] -= 1
                node = {
                    "name": entry.name,
                    "path": self.relative(entry),
                    "type": "directory" if entry.is_dir() else "file",
                }
                if entry.is_dir():
                    node["children"] = walk(entry, depth + 1) if depth < _MAX_TREE_DEPTH else []
                nodes.append(node)
            return nodes

        return walk(self._root, 0)

    def _count_files(self) -> int:
        return sum(1 for p in self._root.rglob("*") if p.is_file())
