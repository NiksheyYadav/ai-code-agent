"""Model backends. Each exposes `complete(system, user) -> str`.

* MockClient   - canned demo output, no model. For local UI development only.
* HostedClient - Anthropic Messages API or any OpenAI-compatible chat API (httpx).
* LocalClient  - a Hugging Face causal LM, loaded lazily once per process.
"""
from __future__ import annotations

import re
import threading
from typing import Protocol

from .settings import Settings


DEFAULT_NVIDIA_MODEL = "nvidia/nemotron-3-ultra-550b-a55b"


class ModelError(Exception):
    """The model backend failed. The message is safe to show to users."""


class ModelClient(Protocol):
    name: str

    def complete(self, system: str, user: str) -> str: ...


# --------------------------------------------------------------------------- mock
class MockClient:
    name = "mock"

    def complete(self, system: str, user: str) -> str:
        target = re.search(r"^Target file: (.+)$", user, re.MULTILINE)
        task = user.lower()
        if target:  # edit / fix: echo the current file back unchanged plus a marker
            path = target.group(1).strip()
            current = re.search(r"<current_file>\n(.*?)\n</current_file>", user, re.DOTALL)
            body = current.group(1) if current else ""
            comment = "//" if path.endswith((".js", ".jsx", ".ts", ".tsx")) else "#"
            return f"FILE: {path}\n```\n{body}\n{comment} (mock model: no real edit was made)\n```"
        if "flask" in task:
            return (
                "FILE: app.py\n```python\nfrom flask import Flask, jsonify\n\napp = Flask(__name__)\n\n\n"
                "@app.route('/api/hello')\ndef hello():\n    return jsonify({'message': 'Hello from Flask!'})\n\n\n"
                "if __name__ == '__main__':\n    app.run(debug=True)\n```"
            )
        if "fastapi" in task:
            return (
                "FILE: main.py\n```python\nfrom fastapi import FastAPI\n\napp = FastAPI()\n\n\n"
                "@app.get('/')\nasync def root():\n    return {'message': 'Hello from FastAPI!'}\n```"
            )
        return (
            "FILE: main.py\n```python\ndef main() -> None:\n    print('Hello, World!')\n\n\n"
            "if __name__ == '__main__':\n    main()\n```"
        )


# ------------------------------------------------------------------------- hosted
class HostedClient:
    def __init__(self, settings: Settings):
        self.s = settings
        self.name = f"hosted:{settings.llm_provider}"

    def complete(self, system: str, user: str) -> str:
        import httpx

        s = self.s
        try:
            if s.llm_provider == "anthropic":
                url = (s.llm_base_url or "https://api.anthropic.com") + "/v1/messages"
                headers = {
                    "x-api-key": s.llm_api_key,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json",
                }
                body = {
                    "model": s.llm_model or "claude-sonnet-5-5",
                    "max_tokens": s.llm_max_tokens,
                    "system": system,
                    "messages": [{"role": "user", "content": user}],
                }
            else:  # OpenAI-compatible chat completions (openai, nvidia NIM, ...)
                nvidia = s.llm_provider == "nvidia"
                default_base = "https://integrate.api.nvidia.com/v1" if nvidia else "https://api.openai.com/v1"
                model = s.llm_model or (DEFAULT_NVIDIA_MODEL if nvidia else "")
                if not model:
                    raise ModelError("LLM_MODEL must be set for the openai provider")
                url = (s.llm_base_url or default_base) + "/chat/completions"
                headers = {"authorization": f"Bearer {s.llm_api_key}", "content-type": "application/json"}
                body = {
                    "model": model,
                    "max_tokens": s.llm_max_tokens,
                    "temperature": 0.2,
                    "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
                }

            resp = httpx.post(url, headers=headers, json=body, timeout=s.llm_timeout_seconds)
        except httpx.TimeoutException:
            raise ModelError("The model timed out. Try a smaller request.")
        except httpx.HTTPError:
            raise ModelError("Could not reach the model provider.")

        if resp.status_code >= 400:
            # Never echo provider bodies: they can include request details.
            raise ModelError(f"The model provider returned an error (HTTP {resp.status_code}).")
        try:
            data = resp.json()
            if s.llm_provider == "anthropic":
                return "".join(b.get("text", "") for b in data["content"] if b.get("type") == "text")
            text = data["choices"][0]["message"]["content"] or ""
            if not text.strip():
                raise ModelError("The model returned an empty response. Try again or raise LLM_MAX_TOKENS.")
            return text
        except ModelError:
            raise
        except (KeyError, IndexError, ValueError, TypeError):
            raise ModelError("The model provider returned an unexpected response.")


# -------------------------------------------------------------------------- local
class LocalClient:
    """Loads the model on first use and serialises generation (one GPU/CPU pool)."""

    def __init__(self, settings: Settings):
        self.s = settings
        self.name = f"local:{settings.local_model}"
        self._lock = threading.Lock()
        self._model = None
        self._tokenizer = None

    def _load(self):
        if self._model is not None:
            return
        try:
            import torch
            from transformers import AutoModelForCausalLM, AutoTokenizer
        except ImportError:
            raise ModelError("Local backend needs: pip install -r requirements-local.txt")
        token = self.s.hf_token or None
        try:
            self._tokenizer = AutoTokenizer.from_pretrained(self.s.local_model, token=token)
            cuda = torch.cuda.is_available()
            self._model = AutoModelForCausalLM.from_pretrained(
                self.s.local_model,
                token=token,
                torch_dtype=torch.float16 if cuda else torch.float32,
                device_map="auto" if cuda else None,
                low_cpu_mem_usage=True,
            )
        except Exception:
            self._model = None
            raise ModelError("Failed to load the local model. Check LOCAL_MODEL and HF_TOKEN.")

    def complete(self, system: str, user: str) -> str:
        with self._lock:
            self._load()
            import torch

            tok, model = self._tokenizer, self._model
            messages = [{"role": "system", "content": system}, {"role": "user", "content": user}]
            try:
                prompt = tok.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
            except Exception:
                prompt = f"{system}\n\n{user}\n"
            inputs = tok(prompt, return_tensors="pt").to(model.device)
            with torch.no_grad():
                out = model.generate(
                    **inputs,
                    max_new_tokens=min(self.s.llm_max_tokens, 2048),
                    do_sample=True,
                    temperature=0.2,
                    top_p=0.95,
                    pad_token_id=tok.eos_token_id,
                )
            return tok.decode(out[0][inputs["input_ids"].shape[1]:], skip_special_tokens=True)


def build_client(settings: Settings) -> ModelClient:
    if settings.model_backend == "hosted":
        return HostedClient(settings)
    if settings.model_backend == "local":
        return LocalClient(settings)
    return MockClient()
