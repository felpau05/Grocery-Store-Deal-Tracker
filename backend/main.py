"""App init + CORS + route registration only — no business logic here.
See routes/ for actual endpoint implementations.
"""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

import db
from classifier.backfill import start_backfill_scheduler, stop_backfill_scheduler
from config import Config
from routes import auth, deals, optimize, users


@asynccontextmanager
async def lifespan(app: FastAPI):
    db.ensure_user_tables()
    # Classifies items scraper-go wrote with category still NULL — see
    # classifier/backfill.py for why this is async/decoupled rather
    # than inline in the scrape.
    start_backfill_scheduler()
    yield
    stop_backfill_scheduler()


app = FastAPI(title="flippwatch API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[Config.FRONTEND_URL],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(deals.router)
app.include_router(optimize.router)
app.include_router(users.router)
app.include_router(auth.router)


@app.get("/health")
def health():
    """Liveness + storage state. "degraded" means the Supabase free-tier
    quota was hit and writes are being dropped (reads still work) — see
    db/guard.py and maintenance/prune.py."""
    storage = db.storage_status()
    return {
        "status": "ok" if storage["ok"] else "degraded",
        "storage": storage,
    }


@app.get("/meta")
def meta():
    """Non-secret config the frontend needs: what postal code backs the
    anonymous example view, and whether Google sign-in is configured."""
    return {
        "default_postal_code": Config.DEFAULT_POSTAL_CODE,
        "google_auth_enabled": bool(Config.GOOGLE_CLIENT_ID and Config.GOOGLE_CLIENT_SECRET),
    }
