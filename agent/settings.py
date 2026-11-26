"""Runtime configuration, read from environment variables (and an optional .env)."""
from __future__ import annotations

import hashlib
import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Optional

REPO_ROOT = Path(__file__).resolve().parent.parent


class ConfigError(RuntimeError):
    """Raised when the server is configured unsafely or incompletely."""


def load_dotenv(path: Path) -> None:
    """Minimal .env loader. Existing environment variables always win."""
    try:
        text = path.read_text(encoding="utf-8")
    except OSError:
        return
    for raw in text.splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


def hash_key(api_key: str) -> str:
    return hashlib.sha256(api_key.encode("utf-8")).hexdigest()


def _bool(value: Optional[str], default: bool = False) -> bool:
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _int(value: Optional[str], default: int) -> int:
    try:
        return int(value) if value not in (None, "") else default
    except ValueError:
        raise ConfigError(f"Expected an integer, got {value!r}")


@dataclass
class Settings:
    # Which model answers requests: "mock" (demo only), "hosted" (API) or "local" (HF model).
    model_backend: str = "mock"

    # Hosted LLM API.
    llm_provider: str = "anthropic"  # "anthropic", "openai" (any OpenAI-compatible server) or "nvidia"
    llm_api_key: str = ""
    llm_base_url: str = ""
    llm_model: str = ""
    llm_max_tokens: int = 4096
    llm_timeout_seconds: int = 120

    # Local Hugging Face model.
    local_model: str = "Qwen/Qwen2.5-Coder-1.5B-Instruct"
    hf_token: str = ""

    # Hosting / multi-user.
    workspaces_dir: Path = field(default_factory=lambda: REPO_ROOT / "workspaces")
    # When set, workspace files live in Postgres (needed on serverless hosts with no persistent disk).
    database_url: str = ""
    auth_disabled: bool = False
    # sha256(api_key) -> user id. Each API key is one tenant with its own workspace.
    api_key_hashes: Dict[str, str] = field(default_factory=dict)
    cors_origins: List[str] = field(default_factory=lambda: ["http://localhost:3000"])
    rate_limit_per_minute: int = 20

    # Limits.
    max_prompt_chars: int = 8000
    max_file_bytes: int = 512 * 1024
    max_files_per_workspace: int = 500

    @classmethod
    def from_env(cls) -> "Settings":
        load_dotenv(REPO_ROOT / ".env")
        env = os.environ.get

        keys = [k.strip() for k in (env("API_KEYS") or "").split(",") if k.strip()]
        hashes = {hash_key(k): f"u{hash_key(k)[:16]}" for k in keys}

        origins = [o.strip() for o in (env("CORS_ORIGINS") or "http://localhost:3000").split(",") if o.strip()]

        provider = (env("LLM_PROVIDER") or "anthropic").strip().lower()
        # NVIDIA's key may be stored as NVIDIA_API_KEY or nvidia_llm_api; LLM_API_KEY wins if set.
        nvidia_key = env("NVIDIA_API_KEY") or env("nvidia_llm_api") or ""
        api_key = env("LLM_API_KEY") or (nvidia_key if provider == "nvidia" else "")

        return cls(
            model_backend=(env("MODEL_BACKEND") or "mock").strip().lower(),
            llm_provider=provider,
            llm_api_key=api_key,
            llm_base_url=(env("LLM_BASE_URL") or "").rstrip("/"),
            llm_model=env("LLM_MODEL") or "",
            llm_max_tokens=_int(env("LLM_MAX_TOKENS"), 4096),
            llm_timeout_seconds=_int(env("LLM_TIMEOUT_SECONDS"), 120),
            local_model=env("LOCAL_MODEL") or "Qwen/Qwen2.5-Coder-1.5B-Instruct",
            hf_token=env("HF_TOKEN") or env("HUGGINGFACE_TOKEN") or "",
            workspaces_dir=Path(env("WORKSPACES_DIR") or (REPO_ROOT / "workspaces")),
            database_url=env("DATABASE_URL") or env("POSTGRES_URL") or "",
            auth_disabled=_bool(env("AUTH_DISABLED")),
            api_key_hashes=hashes,
            cors_origins=origins,
            rate_limit_per_minute=_int(env("RATE_LIMIT_PER_MINUTE"), 20),
            max_prompt_chars=_int(env("MAX_PROMPT_CHARS"), 8000),
            max_file_bytes=_int(env("MAX_FILE_BYTES"), 512 * 1024),
            max_files_per_workspace=_int(env("MAX_FILES_PER_WORKSPACE"), 500),
        )

    def validate(self) -> None:
        if self.model_backend not in {"mock", "hosted", "local"}:
            raise ConfigError("MODEL_BACKEND must be one of: mock, hosted, local")
        if self.model_backend == "hosted":
            if self.llm_provider not in {"anthropic", "openai", "nvidia"}:
                raise ConfigError("LLM_PROVIDER must be 'anthropic', 'openai' or 'nvidia'")
            if not self.llm_api_key:
                raise ConfigError("MODEL_BACKEND=hosted requires LLM_API_KEY")
        if not self.auth_disabled and not self.api_key_hashes:
            raise ConfigError(
                "Authentication is enabled but API_KEYS is empty. Set API_KEYS=key1,key2 "
                "(one key per user), or AUTH_DISABLED=true for local single-user development."
            )
        if "*" in self.cors_origins and not self.auth_disabled:
            raise ConfigError("CORS_ORIGINS must list explicit origins, not '*', when auth is enabled")
