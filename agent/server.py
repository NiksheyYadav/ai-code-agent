"""CodeNex HTTP API.

Run:  uvicorn agent.server:create_app --factory --port 8000
"""
from __future__ import annotations

import threading
import time
from collections import defaultdict, deque
from typing import Deque, Dict, Optional

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from . import service
from .models import ModelClient, build_client
from .settings import Settings, hash_key
from .workspace import FsStore, PgStore, Workspace, WorkspaceError


class RateLimiter:
    """In-memory sliding window per user. Use a shared store if you run several workers."""

    def __init__(self, limit_per_minute: int):
        self.limit = limit_per_minute
        self._hits: Dict[str, Deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def check(self, user: str) -> bool:
        if self.limit <= 0:
            return True
        now = time.monotonic()
        with self._lock:
            hits = self._hits[user]
            while hits and now - hits[0] > 60:
                hits.popleft()
            if len(hits) >= self.limit:
                return False
            hits.append(now)
            return True


class AgentRequest(BaseModel):
    prompt: str = Field(default="", max_length=20000)
    file_path: Optional[str] = Field(default=None, max_length=300)
    content: Optional[str] = Field(default=None, max_length=2_000_000)
    # edit/fix only: return the proposed file without writing it, so the UI can show a diff.
    preview: bool = False


class SaveRequest(BaseModel):
    path: str = Field(max_length=300)
    content: str = Field(max_length=2_000_000)


def create_app(settings: Optional[Settings] = None, client: Optional[ModelClient] = None) -> FastAPI:
    settings = settings or Settings.from_env()
    settings.validate()
    client = client or build_client(settings)
    limiter = RateLimiter(settings.rate_limit_per_minute)

    app = FastAPI(title="CodeNex API", version="1.0.0")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=False,  # bearer tokens, no cookies
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type"],
    )

    # ---- error shape the UI expects: {"message": "..."} --------------------
    @app.exception_handler(HTTPException)
    async def _http_error(_: Request, exc: HTTPException):
        return JSONResponse({"status": "error", "message": str(exc.detail)}, status_code=exc.status_code)

    @app.exception_handler(RequestValidationError)
    async def _validation_error(_: Request, exc: RequestValidationError):
        return JSONResponse({"status": "error", "message": "Invalid request"}, status_code=422)

    # ---- auth + per-user workspace -----------------------------------------
    def current_workspace(request: Request) -> Workspace:
        if settings.auth_disabled:
            user = "dev"
        else:
            header = request.headers.get("authorization", "")
            token = header[7:].strip() if header.lower().startswith("bearer ") else ""
            user = settings.api_key_hashes.get(hash_key(token)) if token else None
            if not user:
                raise HTTPException(status_code=401, detail="Missing or invalid API key")
        request.state.user = user
        store = PgStore(settings.database_url, user) if settings.database_url else FsStore(settings.workspaces_dir / user)
        return Workspace(store, settings.max_file_bytes, settings.max_files_per_workspace)

    def rate_limited(request: Request, ws: Workspace = Depends(current_workspace)) -> Workspace:
        if not limiter.check(request.state.user):
            raise HTTPException(status_code=429, detail="Too many requests. Please slow down.")
        return ws

    def check_prompt(req: AgentRequest) -> None:
        if len(req.prompt) > settings.max_prompt_chars:
            raise HTTPException(status_code=413, detail=f"Prompt exceeds {settings.max_prompt_chars} characters")
        # `content` is forwarded to the model by edit/fix, so it is bounded like a file.
        if req.content is not None and len(req.content.encode("utf-8")) > settings.max_file_bytes:
            raise HTTPException(status_code=413, detail=f"File content exceeds {settings.max_file_bytes} bytes")

    def run(fn, *args):
        try:
            return fn(*args)
        except service.ServiceError as e:
            raise HTTPException(status_code=e.status, detail=e.message)

    # ---- routes ------------------------------------------------------------
    @app.get("/api/health")
    def health():
        return {"status": "ok", "backend": client.name, "auth_required": not settings.auth_disabled}

    @app.get("/api/tree")
    def tree(ws: Workspace = Depends(current_workspace)):
        return ws.tree()

    @app.get("/api/files/content")
    def file_content(path: str, ws: Workspace = Depends(current_workspace)):
        try:
            return {"status": "success", "path": path, "content": ws.read(path)}
        except WorkspaceError as e:
            raise HTTPException(status_code=e.status, detail=str(e))

    @app.post("/api/files/save")
    def file_save(req: SaveRequest, ws: Workspace = Depends(current_workspace)):
        try:
            rel = ws.write(req.path, req.content)
        except WorkspaceError as e:
            raise HTTPException(status_code=e.status, detail=str(e))
        return {"status": "success", "message": f"Saved {rel}", "path": rel}

    @app.post("/api/generate")
    def generate(req: AgentRequest, ws: Workspace = Depends(rate_limited)):
        check_prompt(req)
        return run(service.generate, ws, client, req.prompt)

    @app.post("/api/edit")
    def edit(req: AgentRequest, ws: Workspace = Depends(rate_limited)):
        check_prompt(req)
        return run(service.edit, ws, client, req.prompt, req.file_path, req.content, req.preview)

    @app.post("/api/fix")
    def fix(req: AgentRequest, ws: Workspace = Depends(rate_limited)):
        check_prompt(req)
        return run(service.fix, ws, client, req.prompt, req.file_path, req.content, req.preview)

    return app
