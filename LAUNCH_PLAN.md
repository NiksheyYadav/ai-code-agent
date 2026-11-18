# CodeNex AI — Launch Audit, Plan & Fix Prompt

Audit date: 2026-11-19. Branch: `master` (nothing committed by the audit).

## 0. Verdict

> **Update (after implementation): see §6.** Owner decisions: *both* hosted-API and local-HF model backends (pluggable), *multi-user hosted* deployment. Sections 1–5 describe the state **before** the rewrite and are kept as the audit record.

**Not launchable at audit time.** The UI builds, but it does not talk to any backend that exists, and the "AI" is a canned mock. Fixing the contract and choosing a real model backend are the real launch blockers; the rest is security and cleanup.

### Verified facts
| Check | Result |
|---|---|
| `cd ui && npm install && npx next build` | **Passes** (after fresh `npm install`; `ui/node_modules` was deleted in the working tree) |
| HF token in git history | **Not committed.** Only `ui/.env.local` (API URL, no secret) is in history. Root `.env` holds the HF token and was untracked but un-ignored (no `.gitignore`) → now ignored. Rotating the token is still advisable if the folder was ever shared/zipped. |
| Tracked files | 26,702 → **56** after untracking `node_modules`, `ui/.next`, `__pycache__`, logs, runtime state (index-only; nothing committed) |
| Path-traversal guard | 12 hostile inputs rejected, 4 legit accepted (`../x`, `..\x`, `C:\Windows\x.py`, `C:x.py`, `/etc/x`, UNC, NUL, `.`, `a/..`) |
| Python env | 3.10.11; fastapi/uvicorn/huggingface_hub/yaml/torch(2.9.1 cpu)/transformers(4.57) installed; **streamlit missing** |
| `import run_server` | **Did not finish within 120 s** (loads torch/transformers and calls `huggingface_hub.login(token=None)` at import time, which can block on an interactive prompt). Not verified as working. |

## 1. Findings

### P0 — blockers / security
1. **UI ↔ backend contract is broken.** `ui/pages/index.jsx` calls `GET /api/tree`, `GET /api/files/content`, `POST /api/files/save`, and `POST /api/{generate,edit,fix}` with `{prompt, file_path}` straight at `localhost:8000`. No backend defines `/api/files/*`. `run_server.py` has only `/api/tree` + `/api/generate` (and its tree returns `{status, file_tree}` while the UI expects a bare array); `ui/server.py` has `/api/{health,generate,edit,fix,tree}` but expects `{task}`. Net: file open/save never work.
2. **Three competing backends**: `run_server.py` (FastAPI, GPT-2), `ui/server.py` (FastAPI → `agent/`), `ui/app.py` (Streamlit, not in requirements). README's `cd ui && uvicorn app:app` points at the Streamlit file and cannot work.
3. **Path traversal / arbitrary file write** in `run_server.py` `/api/generate` (`lstrip('./\\')` doesn't stop `C:\…` on Windows). **Fixed** via `safe_workspace_path()` confined to `generated/`.
4. `ui/pages/api/file.js` prefix check lacked a path separator (`projects-x` passed). **Fixed.**
5. **No auth, wildcard CORS with credentials** (`run_server.py`), no rate limit, and one shared workspace + `memory/file_map.json` for every caller.
6. **Import-time side effects**: `run_server.py` logs in to Hugging Face and imports torch at import; generation reloads the model on every request.
7. `agent/codegen.py` referenced undefined `TRANSFORMERS_AVAILABLE` (NameError once `use_mock` is false). **Fixed.**
8. `agent/main.py` had unreachable dead code with undefined names. **Fixed.**

### P1 — correctness / product
- **The AI is fake.** `agent/codegen.py` defaults `use_mock=True` and returns hard-coded Flask/FastAPI snippets; `config.yaml` names Mistral-7B while README and prompt say Nemotron-4 340B / Llama-3.1-Nemotron-70B; `run_server.py` uses GPT-2 with an invalid `config=` dict and deprecated `load_in_8bit`. The `[INST]` prompt format doesn't match GPT-2. Nothing here can produce useful code.
- `run_server.py` `clean_code()` strips all indentation and re-indents heuristically — it corrupts real Python.
- `agent/bugfixer.py` only handles two SyntaxError messages; `agent/main.py` parses the target filename with `task.split("in")[-1]` (breaks on any task containing "in").
- `agent/file_ops.py` "edit" merge only appends new top-level functions and uses `ast.unparse` (drops comments/formatting); non-Python files are overwritten.
- Fallback "demo" file tree in `index.jsx` hides backend failures from users.
- README is inaccurate (Nemotron, WebSockets, Monaco, `config.yaml.example`, LICENSE, "Your Name").
- Requirements are incomplete/conflicting: missing fastapi, uvicorn, huggingface_hub, streamlit; `requirements-training.txt` torch pin (`<2.2`) conflicts with installed 2.9.
- No tests. ~20 ad-hoc `test_*.py`/`debug_*.py` scripts are scripts, not tests.

### P2 — cleanup
- 5 `CodeEditor.*.jsx` variants (`clean/final/fixed/new`) — only `CodeEditor.jsx` is imported. (Has uncommitted user edits; left untouched.)
- Unused Next API routes (`ui/pages/api/*`) duplicate backend routes; root `package.json` depends on the npm `git` package (unused); junk files (`0.39.0` = pip output, `test_output.*`, `*.bat` variants, `run_training.*`).
- `memory/file_map.json` is runtime state; now untracked/ignored.

## 2. Already applied in this audit (uncommitted)
- Added `.gitignore` (secrets, deps, build output, runtime state).
- `git rm --cached` for `node_modules`, `ui/node_modules`, `ui/.next`, `__pycache__`, `ui/.env.local`, `memory/file_map.json`, logs (working files remain on disk).
- `run_server.py`: workspace-confined `safe_workspace_path()`, existence check before write, removed `os.getcwd()` writes.
- `agent/codegen.py` NameError; `agent/main.py` dead code; `ui/pages/api/file.js` separator-safe check.

## 3. Decisions needed from the owner (blocks P1)
1. **Model backend** — (a) hosted LLM API (recommended: fastest path to a real product), (b) local HF model loaded once at startup, (c) keep mock as demo only.
2. **Deployment** — single-user local tool, or multi-user hosted (needs per-session workspaces, auth, rate limits).

## 4. Phased plan
1. **P0 hygiene** (done above) → rotate HF token if it was ever shared.
2. **Pick one backend**: keep `ui/server.py` (FastAPI) as canonical; delete `run_server.py` GPT-2 path, `ui/app.py`, Next `pages/api/*`. Implement the exact endpoints the UI needs (`/api/tree`, `/api/files/content`, `/api/files/save`, `/api/generate|edit|fix` accepting `{prompt, file_path}`), all through one `safe_workspace_path`.
3. **Real model client** behind one interface (`generate(prompt) -> files`), loaded lazily/once, timeouts, error surface to UI (remove fake demo tree), configurable via env.
4. **Security**: CORS allow-list from env, auth/rate-limit (if hosted), per-session workspace, size limits.
5. **Tests**: pytest + FastAPI `TestClient` (health, tree, read/save, traversal rejections, generate with a stub model); `next build` in CI.
6. **Docs/packaging**: accurate README, `requirements.txt` (pinned, split training), `.env.example`, single `npm run dev` + `uvicorn` start commands, LICENSE.
7. **Cleanup**: delete stray scripts and `CodeEditor.*` variants.

## 5. Self-contained fix prompt
> You are working in the CodeNex AI repo (Next.js 14 UI in `ui/`, Python agent in `agent/`). Goal: a launchable, single-backend product.
>
> **Do:** (1) Make `ui/server.py` the only backend; delete `run_server.py`'s GPT-2 generation, `ui/app.py` (Streamlit), and `ui/pages/api/*`. (2) Implement `GET /api/health`, `GET /api/tree` (returns a bare array of `{name,path,type,children?}`), `GET /api/files/content?path=`, `POST /api/files/save {path,content}`, `POST /api/{generate,edit,fix} {prompt,file_path}` returning `{status,message,code?,file_path?}` and JSON errors `{message}`; every path goes through one workspace-confined resolver (reject `..`, absolute, drive letters, UNC, NUL, symlink escape). (3) Replace the mock/GPT-2 code with a `ModelClient` interface and the backend the owner chose (env-configured, loaded once, timeouts, no import-time network/login). (4) Restrict CORS to `CORS_ORIGINS` env; add size limits. (5) In `index.jsx` use `NEXT_PUBLIC_API_URL`, remove the fake demo tree and show real errors. (6) Delete `CodeEditor.{clean,final,fixed,new}.jsx`, stray `test_*/debug_*` scripts, `0.39.0`, `test_output.*`. (7) Complete `requirements.txt` (fastapi, uvicorn, pyyaml, huggingface_hub or the API SDK, pytest, httpx), add `.env.example`, rewrite README to match real commands, add LICENSE.
>
> **Do not:** commit secrets, print tokens, or overwrite uncommitted edits in `ui/components/CodeEditor.jsx` without reading them.
>
> **Acceptance:** `cd ui && npm ci && npm run build` passes; `pytest` passes including a TestClient smoke test; `../x`, `..\x`, `C:\Windows\x.py`, `/etc/x`, `\\srv\share\x` return 400 on every file endpoint; open→edit→save round-trips through the UI; `git ls-files | wc -l` shows source only (<100); README commands work verbatim on a clean clone.

## 6. Status after implementation (all uncommitted)

**Decisions:** model backend = hosted API **and** local HF model, selected by `MODEL_BACKEND`; deployment = multi-user hosted.

**Done and verified**
- Single backend `agent/server.py` (`uvicorn agent.server:create_app --factory`). Implements exactly the routes the UI calls; consistent `{status, message}` errors.
- Multi-user: per-API-key private workspaces, bearer auth (fail-closed: refuses to start with no `API_KEYS` unless `AUTH_DISABLED=true`), per-user rate limit, explicit CORS allow-list (no credentials), prompt/file/workspace size limits.
- Every file path goes through `Workspace.resolve()`; model-returned paths are validated too.
- Models: `hosted` (Anthropic or OpenAI-compatible via httpx), `local` (lazy-loaded HF model), `mock` (demo). No torch import or HF login at import time.
- `fix` syntax-checks Python before and after the model call and refuses to save still-broken output; `edit`/`fix` use the editor's unsaved buffer.
- UI: shared `ui/lib/api.js`, API-key field, real errors (fake demo tree removed), `FileTree` prop bug fixed (tree could never render), generated file opens in editor.
- Extra bugs found during the browser check and fixed: **no `postcss.config.js`, so Tailwind never ran and the whole UI shipped unstyled**; `CodeEditor` took `{file,onSave,onClose}` while the page passed `{code,setCode,activeFile}` (editor always said "No file selected"); `CodeEditor` rendered its `<Editor>` twice (merge accident; duplicate removed, your uncommitted download-button edit kept); empty tree said "Loading files..." forever. Highlighter checked: Prism HTML-encodes output and always has a grammar fallback, so no XSS path.
- Tests: `pytest` → **29 passed** (auth, tenant isolation, 10 traversal inputs × every file endpoint, model-returned traversal, edit/fix, rate and size limits, model failure → 502). `next build` → **passes**. Live run with curl: 401 without key, generate/tree OK, `../` → 400, disallowed origin → blocked.
- Repo: 26,702 → 17 tracked files in the index; `.gitignore`, `.env.example`, `ui/.env.example`, accurate README, split requirements (`requirements.txt`, `-dev`, `-local`).
- Removed (tracked, recoverable via git): old `agent/*` modules, `ui/server.py`, `ui/app.py`, Next `pages/api/*`, 4 `CodeEditor.*` variants, stray `test_*`/`diagnostic`/`.bat` files, `templates/`, `projects/`, root `package.json`, `setup.py`, `config.yaml`.
- Your uncommitted GPT-2 `run_server.py` is preserved at `legacy/run_server_gpt2.py` (git-ignored; delete when you are sure).

**Not verified / needs you**
- `hosted` and `local` backends were **not exercised against a real model** (no API key / no model download here). Run one real generate request before launch.
- Browser click-through was done against the **mock** model only (generate → tree → open in editor → edit → reopen from disk). Hosted/local models and auth-enabled UI flow (API key field) were not clicked through.
- Rate limiting is per-process; run one uvicorn worker or add a shared store.
- No user-management: API keys are issued by you in `API_KEYS`. Add signup/billing if you need self-serve.
- Nothing is committed. Several tracked-file deletions are staged; review with `git status`, then commit on a branch.
- Untracked scratch files still on disk (now git-ignored): `check_env.py`, `debug_*.py`, `simple_test.py`, `test_env.py`, `test_generation.py`, `test_import.py`, `test_script.py`, `test_server.py`, `test_output.*`, `0.39.0`, root `node_modules/`. Delete at will.
- Rotate the Hugging Face token in `.env` if that folder was ever shared (it was never committed).
