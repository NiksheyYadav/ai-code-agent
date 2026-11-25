import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from agent.server import create_app  # noqa: E402
from agent.settings import ConfigError, Settings, hash_key  # noqa: E402

KEY_A, KEY_B = "key-alice", "key-bob"


class StubClient:
    """Returns whatever `reply` is set to; records prompts."""

    name = "stub"

    def __init__(self):
        self.reply = "FILE: main.py\n```python\nprint('hi')\n```"
        self.calls = []

    def complete(self, system, user):
        self.calls.append(user)
        return self.reply


def make_settings(tmp_path, **kw):
    base = dict(
        model_backend="mock",
        workspaces_dir=tmp_path / "ws",
        api_key_hashes={hash_key(KEY_A): "alice", hash_key(KEY_B): "bob"},
        rate_limit_per_minute=1000,
    )
    base.update(kw)
    return Settings(**base)


@pytest.fixture
def stub():
    return StubClient()


@pytest.fixture
def client(tmp_path, stub):
    return TestClient(create_app(make_settings(tmp_path), stub))


def auth(key=KEY_A):
    return {"Authorization": f"Bearer {key}"}


# ---------------------------------------------------------------- basics / auth
def test_health_is_public(client):
    r = client.get("/api/health")
    assert r.status_code == 200 and r.json()["auth_required"] is True


@pytest.mark.parametrize("headers", [{}, {"Authorization": "Bearer nope"}, {"Authorization": "Basic abc"}])
def test_auth_required(client, headers):
    assert client.get("/api/tree", headers=headers).status_code == 401
    assert client.post("/api/generate", json={"prompt": "x"}, headers=headers).status_code == 401


def test_unsafe_config_is_rejected(tmp_path):
    with pytest.raises(ConfigError):
        create_app(make_settings(tmp_path, api_key_hashes={}), StubClient())
    with pytest.raises(ConfigError):
        create_app(make_settings(tmp_path, model_backend="hosted", llm_api_key=""), StubClient())


# ------------------------------------------------------------ generate / tree / io
def test_generate_save_read_roundtrip(client):
    r = client.post("/api/generate", json={"prompt": "hello"}, headers=auth())
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["files"] == ["main.py"] and body["code"] == "print('hi')"

    tree = client.get("/api/tree", headers=auth()).json()
    assert [n["path"] for n in tree] == ["main.py"]

    r = client.post("/api/files/save", json={"path": "pkg/new.py", "content": "x = 1\n"}, headers=auth())
    assert r.status_code == 200
    r = client.get("/api/files/content", params={"path": "pkg/new.py"}, headers=auth())
    assert r.json()["content"] == "x = 1\n"


def test_workspaces_are_isolated_per_user(client):
    client.post("/api/files/save", json={"path": "secret.txt", "content": "alice"}, headers=auth(KEY_A))
    assert client.get("/api/tree", headers=auth(KEY_B)).json() == []
    r = client.get("/api/files/content", params={"path": "secret.txt"}, headers=auth(KEY_B))
    assert r.status_code == 404


# --------------------------------------------------------------- path traversal
BAD_PATHS = [
    "../x", "..\\x", "a/../../x", "C:\\Windows\\x.py", "C:x.py", "/etc/x",
    "\\\\srv\\share\\x", ".", "a/..", "", "a.py:stream", "dir/a.py:$DATA",
]


@pytest.mark.parametrize("path", BAD_PATHS)
def test_traversal_rejected_on_every_file_endpoint(client, tmp_path, path):
    r = client.post("/api/files/save", json={"path": path, "content": "pwn"}, headers=auth())
    assert r.status_code == 400, (path, r.text)
    r = client.get("/api/files/content", params={"path": path}, headers=auth())
    assert r.status_code == 400, (path, r.text)
    for ep in ("edit", "fix"):
        r = client.post(f"/api/{ep}", json={"prompt": "x", "file_path": path, "content": ""}, headers=auth())
        assert r.status_code in (400, 404), (ep, path, r.text)
    assert not (tmp_path / "x").exists() and not (tmp_path / "ws" / "x").exists()


def test_model_returned_traversal_path_is_skipped(client, stub, tmp_path):
    stub.reply = "FILE: ../../evil.py\n```python\nboom\n```\nFILE: ok.py\n```python\nx=1\n```"
    r = client.post("/api/generate", json={"prompt": "x"}, headers=auth())
    assert r.status_code == 200
    assert r.json()["files"] == ["ok.py"] and r.json()["warnings"]
    assert not (tmp_path / "evil.py").exists()


# ------------------------------------------------------------------ edit / fix
def test_edit_uses_editor_content_and_writes_file(client, stub):
    stub.reply = "FILE: a.py\n```python\nprint('new')\n```"
    r = client.post("/api/edit", json={"prompt": "change it", "file_path": "a.py", "content": "print('old')"}, headers=auth())
    assert r.status_code == 200, r.text
    assert "print('old')" in stub.calls[-1]
    assert client.get("/api/files/content", params={"path": "a.py"}, headers=auth()).json()["content"] == "print('new')"


def test_preview_proposes_without_writing_then_save_accepts(client, stub):
    client.post("/api/files/save", json={"path": "a.py", "content": "x = 1\n"}, headers=auth())
    stub.reply = "FILE: a.py\n```python\nx = 2\n```"
    r = client.post("/api/edit", json={"prompt": "bump", "file_path": "a.py", "preview": True}, headers=auth())
    assert r.status_code == 200, r.text
    assert r.json()["preview"] is True and r.json()["code"] == "x = 2"
    # nothing was written
    assert client.get("/api/files/content", params={"path": "a.py"}, headers=auth()).json()["content"] == "x = 1\n"
    # accepting = saving the proposed code
    client.post("/api/files/save", json={"path": "a.py", "content": r.json()["code"]}, headers=auth())
    assert client.get("/api/files/content", params={"path": "a.py"}, headers=auth()).json()["content"] == "x = 2"


def test_fix_preview_does_not_write(client, stub):
    client.post("/api/files/save", json={"path": "bad.py", "content": "def f(:\n"}, headers=auth())
    stub.reply = "FILE: bad.py\n```python\ndef f():\n    pass\n```"
    r = client.post("/api/fix", json={"file_path": "bad.py", "preview": True}, headers=auth())
    assert r.status_code == 200 and r.json()["preview"] is True
    assert client.get("/api/files/content", params={"path": "bad.py"}, headers=auth()).json()["content"] == "def f(:\n"


def test_fix_skips_model_when_python_is_valid(client, stub):
    client.post("/api/files/save", json={"path": "ok.py", "content": "x = 1\n"}, headers=auth())
    r = client.post("/api/fix", json={"prompt": "", "file_path": "ok.py"}, headers=auth())
    assert r.status_code == 200 and "No syntax errors" in r.json()["message"]
    assert stub.calls == []


def test_fix_rejects_model_output_that_is_still_broken(client, stub):
    client.post("/api/files/save", json={"path": "bad.py", "content": "def f(:\n"}, headers=auth())
    stub.reply = "FILE: bad.py\n```python\ndef still(:\n```"
    r = client.post("/api/fix", json={"prompt": "", "file_path": "bad.py"}, headers=auth())
    assert r.status_code == 422
    assert client.get("/api/files/content", params={"path": "bad.py"}, headers=auth()).json()["content"] == "def f(:\n"


def test_fix_repairs_python(client, stub):
    client.post("/api/files/save", json={"path": "bad.py", "content": "def f(:\n"}, headers=auth())
    stub.reply = "FILE: bad.py\n```python\ndef f():\n    pass\n```"
    r = client.post("/api/fix", json={"prompt": "", "file_path": "bad.py"}, headers=auth())
    assert r.status_code == 200 and "syntax error" in stub.calls[-1].lower()


# ---------------------------------------------------------------------- limits
def test_rate_limit(tmp_path, stub):
    c = TestClient(create_app(make_settings(tmp_path, rate_limit_per_minute=2), stub))
    codes = [c.post("/api/generate", json={"prompt": "x"}, headers=auth()).status_code for _ in range(3)]
    assert codes == [200, 200, 429]


def test_prompt_and_file_size_limits(tmp_path, stub):
    c = TestClient(create_app(make_settings(tmp_path, max_prompt_chars=10, max_file_bytes=20), stub))
    assert c.post("/api/generate", json={"prompt": "x" * 11}, headers=auth()).status_code == 413
    assert c.post("/api/files/save", json={"path": "a.txt", "content": "x" * 21}, headers=auth()).status_code == 413


def test_editor_content_is_size_limited_and_never_reaches_model(tmp_path, stub):
    c = TestClient(create_app(make_settings(tmp_path, max_file_bytes=50), stub))
    big = "x" * 51
    for ep in ("edit", "fix"):
        r = c.post(f"/api/{ep}", json={"prompt": "go", "file_path": "a.py", "content": big}, headers=auth())
        assert r.status_code == 413, (ep, r.text)
    assert stub.calls == []


def test_model_failure_is_a_clean_502(client, stub):
    from agent.models import ModelError

    def boom(system, user):
        raise ModelError("The model timed out.")

    stub.complete = boom
    r = client.post("/api/generate", json={"prompt": "x"}, headers=auth())
    assert r.status_code == 502 and r.json()["message"] == "The model timed out."


def test_auth_disabled_mode_uses_single_dev_workspace(tmp_path, stub):
    c = TestClient(create_app(make_settings(tmp_path, auth_disabled=True, api_key_hashes={}), stub))
    assert c.post("/api/generate", json={"prompt": "x"}).status_code == 200
    assert (tmp_path / "ws" / "dev" / "main.py").exists()


# ------------------------------------------------------------- NVIDIA provider
def test_nvidia_key_is_read_from_either_env_name(monkeypatch, tmp_path):
    for name in ("NVIDIA_API_KEY", "nvidia_llm_api", "LLM_API_KEY", "MODEL_BACKEND", "LLM_PROVIDER"):
        monkeypatch.delenv(name, raising=False)
    monkeypatch.setattr("agent.settings.load_dotenv", lambda path: None)
    monkeypatch.setenv("LLM_PROVIDER", "nvidia")
    monkeypatch.setenv("MODEL_BACKEND", "hosted")
    monkeypatch.setenv("nvidia_llm_api", "nvapi-test")
    s = Settings.from_env()
    assert s.llm_provider == "nvidia" and s.llm_api_key == "nvapi-test"


def test_nvidia_hosted_client_request_shape(monkeypatch):
    import httpx

    from agent.models import DEFAULT_NVIDIA_MODEL, HostedClient

    seen = {}

    def fake_post(url, headers, json, timeout):
        seen.update(url=url, headers=headers, body=json)
        return httpx.Response(200, json={"choices": [{"message": {"content": "FILE: a.py\n```python\nx=1\n```"}}]})

    monkeypatch.setattr(httpx, "post", fake_post)
    s = Settings(model_backend="hosted", llm_provider="nvidia", llm_api_key="nvapi-test")
    out = HostedClient(s).complete("sys", "user")
    assert out.startswith("FILE: a.py")
    assert seen["url"] == "https://integrate.api.nvidia.com/v1/chat/completions"
    assert seen["headers"]["authorization"] == "Bearer nvapi-test"
    assert seen["body"]["model"] == DEFAULT_NVIDIA_MODEL


def test_empty_model_reply_is_a_clean_error(monkeypatch):
    import httpx

    from agent.models import HostedClient, ModelError

    monkeypatch.setattr(httpx, "post", lambda *a, **k: httpx.Response(200, json={"choices": [{"message": {"content": "  "}}]}))
    with pytest.raises(ModelError):
        HostedClient(Settings(model_backend="hosted", llm_provider="nvidia", llm_api_key="k")).complete("s", "u")


# ------------------------------------------------------------------ parsing
def test_parse_files_keeps_inner_code_fences_and_drops_truncated_blocks():
    from agent.service import parse_files

    raw = (
        "FILE: README.md\n```markdown\n# T\n\n```bash\npip install x\n```\n\nMore docs.\n```\n\n"
        "FILE: main.py\n```python\nprint(1)\n```\n\nFILE: cut.py\n```python\nprint("
    )
    files = dict(parse_files(raw))
    assert files["README.md"].endswith("More docs.") and "```bash" in files["README.md"]
    assert files["main.py"] == "print(1)"
    assert "cut.py" not in files


def test_edit_never_overwrites_target_with_a_different_files_block(client, stub):
    client.post("/api/files/save", json={"path": "a.py", "content": "x = 1\n"}, headers=auth())
    stub.reply = "FILE: other.py\n```python\ny = 2\n```"
    r = client.post("/api/edit", json={"prompt": "go", "file_path": "a.py"}, headers=auth())
    assert r.status_code == 502
    assert client.get("/api/files/content", params={"path": "a.py"}, headers=auth()).json()["content"] == "x = 1\n"
