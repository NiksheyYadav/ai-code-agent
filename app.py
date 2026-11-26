"""Vercel entrypoint: Vercel's FastAPI preset serves the module-level `app`."""
from agent.server import create_app

app = create_app()
