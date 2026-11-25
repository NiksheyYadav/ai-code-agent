"""Prompting, response parsing, and the generate / edit / fix operations."""
from __future__ import annotations

import ast
import re
from typing import Dict, List, Optional, Tuple

from .models import ModelClient, ModelError
from .workspace import InvalidPath, NotFound, Workspace, WorkspaceError

SYSTEM_PROMPT = """You are CodeNex, a careful senior software engineer.
Reply with files only, in exactly this format and nothing else (no prose before or after):

FILE: <relative/path/to/file>
```<language>
<complete file contents>
```

Rules:
- Always return COMPLETE files, never diffs or fragments.
- Use relative paths only. Never use absolute paths or '..'.
- Write production-quality, runnable code with sensible error handling.
- Return at most 12 files."""

MAX_FILES_PER_REQUEST = 12

_FILE_BLOCK = re.compile(
    r"^FILE:[ \t]*(?P<path>[^\r\n]+?)[ \t]*\r?\n```[^\r\n]*\r?\n(?P<code>.*?)\r?\n```[ \t]*$",
    re.MULTILINE | re.DOTALL,
)
_ANY_FENCE = re.compile(r"```[^\r\n]*\r?\n(?P<code>.*?)\r?\n```", re.DOTALL)


class ServiceError(Exception):
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status
        self.message = message


def parse_files(text: str) -> List[Tuple[str, str]]:
    """Extract (path, content) pairs from a model response."""
    return [(m.group("path").strip().strip("`"), m.group("code")) for m in _FILE_BLOCK.finditer(text or "")]


def _single_block(text: str) -> Optional[str]:
    blocks = _ANY_FENCE.findall(text or "")
    return blocks[0] if len(blocks) == 1 else None


def _complete(client: ModelClient, user: str) -> str:
    try:
        return client.complete(SYSTEM_PROMPT, user)
    except ModelError as e:
        raise ServiceError(502, str(e))


def _result(message: str, files: List[str], code: str, warnings: Optional[List[str]] = None, preview: bool = False) -> Dict:
    out = {"status": "success", "message": message, "files": files, "file_path": files[0] if files else None, "code": code}
    if preview:
        out["preview"] = True
    if warnings:
        out["warnings"] = warnings
    return out


def generate(ws: Workspace, client: ModelClient, prompt: str) -> Dict:
    if not prompt.strip():
        raise ServiceError(400, "Prompt is required")
    raw = _complete(client, f"Create the following. Task:\n{prompt}")
    written: List[str] = []
    warnings: List[str] = []
    first_code = ""
    for path, code in parse_files(raw)[:MAX_FILES_PER_REQUEST]:
        try:
            rel = ws.write(path, code)
        except WorkspaceError as e:
            warnings.append(f"Skipped {path!r}: {e}")
            continue
        if not written:
            first_code = code
        written.append(rel)
    if not written:
        raise ServiceError(502, "The model did not return any usable files. Try rephrasing the request.")
    return _result(f"Created {len(written)} file(s)", written, first_code, warnings)


def _pick(raw: str, target: str) -> Optional[str]:
    blocks = parse_files(raw)
    for path, code in blocks:
        if path.replace("\\", "/").lstrip("./") == target:
            return code
    if len(blocks) == 1:
        return blocks[0][1]
    return _single_block(raw)


def _load_current(ws: Workspace, file_path: Optional[str], content: Optional[str]) -> Tuple[str, str]:
    if not file_path:
        raise ServiceError(400, "Select a file first")
    try:
        rel = ws.relative(ws.resolve(file_path))
        current = content if content is not None else ws.read(rel)
    except NotFound:
        raise ServiceError(404, "File not found")
    except WorkspaceError as e:
        raise ServiceError(e.status, str(e))
    return rel, current


def edit(ws: Workspace, client: ModelClient, prompt: str, file_path: Optional[str], content: Optional[str], preview: bool = False) -> Dict:
    if not prompt.strip():
        raise ServiceError(400, "Describe the change you want")
    rel, current = _load_current(ws, file_path, content)
    raw = _complete(
        client,
        f"Target file: {rel}\n<current_file>\n{current}\n</current_file>\n\n"
        f"Apply this change and return the complete updated file:\n{prompt}",
    )
    new_code = _pick(raw, rel)
    if new_code is None:
        raise ServiceError(502, "The model did not return an updated file.")
    if preview:  # propose only; the client saves via /api/files/save once the user accepts
        return _result(f"Proposed changes to {rel}", [rel], new_code, preview=True)
    try:
        ws.write(rel, new_code)
    except WorkspaceError as e:
        raise ServiceError(e.status, str(e))
    return _result(f"Updated {rel}", [rel], new_code)


def fix(ws: Workspace, client: ModelClient, prompt: str, file_path: Optional[str], content: Optional[str], preview: bool = False) -> Dict:
    rel, current = _load_current(ws, file_path, content)
    is_python = rel.endswith(".py")
    problem = prompt.strip()
    if is_python:
        try:
            ast.parse(current)
            if not problem:
                return {"status": "success", "message": f"No syntax errors found in {rel}", "files": [rel], "file_path": rel, "code": current}
        except SyntaxError as e:
            problem = f"Python syntax error: {e.msg} (line {e.lineno}). {problem}".strip()
    elif not problem:
        problem = "Find and fix any syntax errors or obvious bugs."

    raw = _complete(
        client,
        f"Target file: {rel}\n<current_file>\n{current}\n</current_file>\n\n"
        f"Fix this problem and return the complete corrected file:\n{problem}",
    )
    fixed = _pick(raw, rel)
    if fixed is None:
        raise ServiceError(502, "The model did not return a fixed file.")
    if is_python:
        try:
            ast.parse(fixed)
        except SyntaxError:
            raise ServiceError(422, "The model's fix still has syntax errors; nothing was saved.")
    if preview:
        return _result(f"Proposed fix for {rel}", [rel], fixed, preview=True)
    try:
        ws.write(rel, fixed)
    except WorkspaceError as e:
        raise ServiceError(e.status, str(e))
    return _result(f"Fixed {rel}", [rel], fixed)
