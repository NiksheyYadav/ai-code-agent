import os
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from agent.workspace import FsStore, InvalidPath, MemoryStore, NotFound, PgStore, TooLarge, Workspace  # noqa: E402

BAD = [
    "../x", "..\\x", "a/../../x", "C:\\Windows\\x.py", "C:x.py", "/etc/x",
    "\\\\srv\\share\\x", "", ".", "a/..", "a.py:s", "a" + chr(0) + "b",
]
PG = bool(os.environ.get("TEST_DATABASE_URL"))


def make_store(name, tmp_path):
    if name == "memory":
        return MemoryStore()
    if name == "fs":
        return FsStore(tmp_path / "ws")
    return PgStore(os.environ["TEST_DATABASE_URL"], "pytest-user")


@pytest.mark.parametrize("name", ["memory", "fs"] + (["pg"] if PG else []))
def test_workspace_behaves_the_same_on_every_store(tmp_path, name):
    ws = Workspace(make_store(name, tmp_path), max_file_bytes=50, max_files=3)
    for p in BAD:
        with pytest.raises(InvalidPath):
            ws.write(p, "x")
        with pytest.raises(InvalidPath):
            ws.read(p)
    assert ws.write("a/../x.py", "1") == "x.py"
    ws.write("pkg/sub/m.py", "2")
    ws.write("pkg/n.py", "3")
    assert ws.read("pkg\\n.py") == "3"
    with pytest.raises(InvalidPath):
        ws.read("pkg")  # directory
    with pytest.raises(InvalidPath):
        ws.write("pkg", "x")  # directory
    with pytest.raises(NotFound):
        ws.read("nope.py")
    with pytest.raises(TooLarge):
        ws.write("x.py", "y" * 51)
    with pytest.raises(TooLarge):
        ws.write("fourth.py", "x")  # file limit (3) hit by a new file
    ws.write("x.py", "overwrite is allowed at the limit")
    tree = ws.tree()
    assert [n["name"] for n in tree] == ["pkg", "x.py"]  # directories first
    assert [c["path"] for c in tree[0]["children"]] == ["pkg/sub", "pkg/n.py"]


def test_tree_hides_dotfiles_and_dependency_dirs():
    ws = Workspace(MemoryStore(), 1000, 100)
    for p in [".env", "node_modules/a.js", "ok/__pycache__/x.pyc", "ok/real.py"]:
        ws.store.write(p, "x")
    tree = ws.tree()
    assert [n["name"] for n in tree] == ["ok"]
    assert [c["name"] for c in tree[0]["children"]] == ["real.py"]
