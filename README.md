# CodeNex AI

Generate, edit and fix code from natural-language prompts. A Next.js UI talks to a FastAPI backend that calls a model of your choice. Each user (API key) gets a private, sandboxed workspace.

## Architecture

```
ui/        Next.js 14 web app (CodeMirror editor, file tree, agent panel, command palette). Design rules: ui/DESIGN.md
agent/     FastAPI backend
  server.py     HTTP API, auth, rate limiting, CORS
  workspace.py  sandboxed per-user file access (all paths go through here)
  service.py    prompts + generate / edit / fix logic
  models.py     model backends: hosted API, local Hugging Face model, mock
  settings.py   environment configuration
tests/     pytest suite (uses a stub model; no network)
```

## Run locally

Requires Python 3.10+ and Node 18+.

```bash
# 1. Backend
pip install -r requirements.txt
# Create .env from .env.example (if you already have a .env, add the variables to it instead
# of overwriting it), then fill in the values - see "Configuration" below.
uvicorn agent.server:create_app --factory --port 8000

# 2. Frontend (new terminal)
cd ui
cp .env.example .env.local   # skip if .env.local already points at your API
npm install
npm run dev                 # http://localhost:3000
```

Quick start without a model or keys (demo output only): in `.env` set `MODEL_BACKEND=mock` and `AUTH_DISABLED=true`.

## Configuration (`.env`)

| Variable | Purpose |
|---|---|
| `MODEL_BACKEND` | `hosted` (API), `local` (Hugging Face model, needs `requirements-local.txt`), or `mock` (canned demo output) |
| `LLM_PROVIDER`, `LLM_API_KEY`, `LLM_MODEL`, `LLM_BASE_URL` | Hosted model. `anthropic` (default), `nvidia` (NVIDIA NIM; key in `NVIDIA_API_KEY`) or `openai` (any OpenAI-compatible endpoint) |
| `LOCAL_MODEL`, `HF_TOKEN` | Local model id and optional Hugging Face token |
| `API_KEYS` | Comma-separated user keys. Required unless `AUTH_DISABLED=true`. One key = one private workspace |
| `AUTH_DISABLED` | `true` only for local single-user development |
| `CORS_ORIGINS` | Allowed web origins (no `*` when auth is on) |
| `RATE_LIMIT_PER_MINUTE` | Per-user limit on generate/edit/fix |
| `WORKSPACES_DIR` | Where user workspaces are stored (default `./workspaces`) |

The UI's backend URL is `NEXT_PUBLIC_API_URL` in `ui/.env.local` (set at build time). If the server requires auth, the app asks for your API key on first load (also under the key icon in the header → Settings).

## API

All routes except `/api/health` need `Authorization: Bearer <API_KEY>` (unless auth is disabled).

| Route | Body / query | Notes |
|---|---|---|
| `GET /api/health` | | backend name, whether auth is required |
| `GET /api/tree` | | your workspace as a nested array |
| `GET /api/files/content` | `?path=` | |
| `POST /api/files/save` | `{path, content}` | |
| `POST /api/generate` | `{prompt}` | creates files |
| `POST /api/edit` | `{prompt, file_path, content?}` | rewrites the file |
| `POST /api/fix` | `{prompt?, file_path, content?}` | Python is syntax-checked before and after |

Errors are JSON `{status: "error", message}`.

## Tests and build

```bash
pip install -r requirements-dev.txt && pytest
cd ui && npm ci && npm run build
```

## Deploying (hosted, multi-user)

- Set `MODEL_BACKEND=hosted`, `LLM_API_KEY`, `API_KEYS`, and `CORS_ORIGINS` to your UI's origin; leave `AUTH_DISABLED` unset.
- Serve behind HTTPS (a reverse proxy or your platform's TLS). API keys are bearer tokens.
- Run a **single** uvicorn worker, or move the rate limiter to a shared store: limits are in-memory per process.
- Persist `WORKSPACES_DIR` on a volume. Model output is untrusted: this service only writes text files and never executes generated code.

## Training

`train.py` / `train.ipynb` / `requirements-training.txt` are an experimental fine-tuning setup and are not used by the app.

## License

MIT
