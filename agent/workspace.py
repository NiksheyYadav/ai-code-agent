"""A per-user, sandboxed set of text files. Every client-supplied path goes through normalize().

Storage is pluggable: a directory on disk (FsStore, local/VM hosting), Postgres (PgStore,
serverless hosting where the filesystem is ephemeral) or memory (MemoryStore, tests).
"""
from __future__ import annotations

import posixpath
from pathlib import Path
from typing import Dict, List, Optional, Protocol


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


class FileStore(Protocol):
    def read(self, path: str) -> Optional[str]: ...  # None when missing; may raise UnicodeDecodeError
    def write(self, path: str, content: str) -> None: ...
    def exists(self, path: str) -> bool: ...
    def is_dir(self, path: str) -> bool: ...
    def list_files(self) -> List[str]: ...  # relative posix paths of all files


# --------------------------------------------------------------------------- stores
class MemoryStore:
    def __init__(self) -> None:
        self.files: Dict[str, str] = {}

    def read(self, path: str) -> Optional[str]:
        return self.files.get(path)

    def write(self, path: str, content: str) -> None:
        self.files[path] = content

    def exists(self, path: str) -> bool:
        return path in self.files

    def is_dir(self, path: str) -> bool:
        return any(p.startswith(path + "/") for p in self.files)

    def list_files(self) -> List[str]:
        return list(self.files)


class FsStore:
    def __init__(self, root: Path) -> None:
        self.root = Path(root)
        self.root.mkdir(parents=True, exist_ok=True)
        self._root = self.root.resolve()

    def _abs(self, path: str) -> Path:
        candidate = (self._root / path).resolve()  # follows symlinks
        if candidate == self._root or not candidate.is_relative_to(self._root):
            raise InvalidPath("Path escapes the workspace")
        return candidate

    def read(self, path: str) -> Optional[str]:
        p = self._abs(path)
        return p.read_text(encoding="utf-8") if p.is_file() else None

    def write(self, path: str, content: str) -> None:
        p = self._abs(path)
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_bytes(content.encode("utf-8"))

    def exists(self, path: str) -> bool:
        return self._abs(path).is_file()

    def is_dir(self, path: str) -> bool:
        return self._abs(path).is_dir()

    def list_files(self) -> List[str]:
        out: List[str] = []
        for p in self._root.rglob("*"):
            if p.is_file() and not p.is_symlink():
                out.append(p.relative_to(self._root).as_posix())
        return out


class PgStore:
    """Files for ONE user in a shared Postgres table. Works with Neon/Supabase pooled URLs."""

    _ready = False

    def __init__(self, dsn: str, user_id: str) -> None:
        self.dsn, self.user = dsn, user_id
        self._conn = None  # one connection per request (a Workspace lives for one request)

    def _connect(self):
        import psycopg

        if self._conn is not None and not self._conn.closed:
            return self._conn
        conn = self._conn = psycopg.connect(self.dsn, autocommit=True, prepare_threshold=None)
        if not PgStore._ready:
            conn.execute(
                "CREATE TABLE IF NOT EXISTS workspace_files ("
                "user_id text NOT NULL, path text NOT NULL, content text NOT NULL, "
                "updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (user_id, path))"
            )
            PgStore._ready = True
        return conn

    def read(self, path: str) -> Optional[str]:
        c = self._connect()
        if True:
            row = c.execute("SELECT content FROM workspace_files WHERE user_id=%s AND path=%s", (self.user, path)).fetchone()
        return row[0] if row else None

    def write(self, path: str, content: str) -> None:
        c = self._connect()
        if True:
            c.execute(
                "INSERT INTO workspace_files (user_id, path, content) VALUES (%s,%s,%s) "
                "ON CONFLICT (user_id, path) DO UPDATE SET content=EXCLUDED.content, updated_at=now()",
                (self.user, path, content),
            )

    def exists(self, path: str) -> bool:
        c = self._connect()
        if True:
            return c.execute("SELECT 1 FROM workspace_files WHERE user_id=%s AND path=%s", (self.user, path)).fetchone() is not None

    def is_dir(self, path: str) -> bool:
        like = path.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "/%"
        c = self._connect()
        if True:
            return c.execute("SELECT 1 FROM workspace_files WHERE user_id=%s AND path LIKE %s LIMIT 1", (self.user, like)).fetchone() is not None

    def list_files(self) -> List[str]:
        c = self._connect()
        if True:
            return [r[0] for r in c.execute("SELECT path FROM workspace_files WHERE user_id=%s ORDER BY path", (self.user,)).fetchall()]


# ------------------------------------------------------------------------ workspace
class Workspace:
    def __init__(self, store: FileStore, max_file_bytes: int, max_files: int):
        self.store = store
        self.max_file_bytes = max_file_bytes
        self.max_files = max_files

    # -- path safety -------------------------------------------------------
    def normalize(self, rel_path: str) -> str:
        """Validate a client path and return it normalized (posix, relative).

        Rejects: empty, NUL bytes, absolute paths (POSIX, UNC), ':' anywhere (drive letters and
        NTFS alternate data streams), and anything that normalizes to the root or escapes it (``..``).
        """
        if not rel_path or not isinstance(rel_path, str) or "\0" in rel_path:
            raise InvalidPath("Invalid file path")
        if len(rel_path) > _MAX_PATH_CHARS:
            raise InvalidPath("File path is too long")
        s = rel_path.replace("\\", "/")
        if s.startswith("/"):
            raise InvalidPath("Absolute paths are not allowed")
        if ":" in s:
            raise InvalidPath("Invalid character ':' in path")
        norm = posixpath.normpath(s)
        if norm in (".", "") or norm == ".." or norm.startswith("../"):
            raise InvalidPath("Path escapes the workspace")
        return norm

    # kept for callers written against the old filesystem-only API
    def resolve(self, rel_path: str) -> str:
        return self.normalize(rel_path)

    def relative(self, path: str) -> str:
        return path

    # -- operations --------------------------------------------------------
    def read(self, rel_path: str) -> str:
        path = self.normalize(rel_path)
        if self.store.is_dir(path):
            raise InvalidPath("Path is not a file")
        try:
            content = self.store.read(path)
        except UnicodeDecodeError:
            raise NotText("File is not UTF-8 text")
        if content is None:
            raise NotFound("File not found")
        if len(content.encode("utf-8")) > self.max_file_bytes:
            raise TooLarge("File is too large to open")
        return content

    def write(self, rel_path: str, content: str) -> str:
        path = self.normalize(rel_path)
        if len(content.encode("utf-8")) > self.max_file_bytes:
            raise TooLarge(f"File exceeds {self.max_file_bytes} bytes")
        if self.store.is_dir(path):
            raise InvalidPath("Path is a directory")
        if not self.store.exists(path) and len(self.store.list_files()) >= self.max_files:
            raise TooLarge("Workspace file limit reached")
        self.store.write(path, content)
        return path

    def tree(self) -> List[Dict]:
        root: Dict = {}
        for path in sorted(self.store.list_files()):
            parts = path.split("/")
            if any(p.startswith(".") or p in _SKIP_DIRS for p in parts):
                continue
            node = root
            for part in parts[:-1]:
                node = node.setdefault(part, {})
            node[parts[-1]] = None  # file

        budget = [_MAX_TREE_ENTRIES]

        def build(d: Dict, prefix: str, depth: int) -> List[Dict]:
            nodes: List[Dict] = []
            for name in sorted(d, key=lambda n: (d[n] is None, n.lower())):
                if budget[0] <= 0:
                    break
                budget[0] -= 1
                path = f"{prefix}{name}"
                if d[name] is None:
                    nodes.append({"name": name, "path": path, "type": "file"})
                else:
                    kids = build(d[name], path + "/", depth + 1) if depth < _MAX_TREE_DEPTH else []
                    nodes.append({"name": name, "path": path, "type": "directory", "children": kids})
            return nodes

        return build(root, "", 0)
