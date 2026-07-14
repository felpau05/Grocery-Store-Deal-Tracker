import os
from dotenv import load_dotenv
from pathlib import Path

load_dotenv()

class Config:

    # Paths of Directories and Files
    BACKEND_PATH: Path = Path(__file__).parent
    TEST_OUTPUTS_PATH = BACKEND_PATH / "test_outputs"
    TRAINING_DATA_PATH = BACKEND_PATH / "training_data"

    # Database Configuration
    DATABASE_URL: str | None = os.getenv(key="DATABASE_URL")

    # Flipp Scraper
    DEFAULT_MERCHANTS: set[int] = {
        2265,
        234,
        2267,
        2018,
        2269,
        2711,
        2271,
        2337
    }

    DEFAULT_MERCHANTS_NAMES: list[str] = [
        "Food Basics",
        "Walmart",
        "FreshCo",
        "Loblaws",
        "Metro",
        "Farm Boy",
        "Real Canadian Superstore",
        "Independent Grocer"
        ]
    
    TEST_POSTAL_CODE: str | None = os.getenv(key="TEST_POSTAL_CODE")

    # Postal code behind the anonymous "example data" view. Falls back
    # to the test postal code so a fresh checkout still works. Normalized
    # (uppercase, no spaces) so it matches the region key written on
    # `items` — the whole scoping model breaks if these disagree.
    DEFAULT_POSTAL_CODE: str = (
        (os.getenv("DEFAULT_POSTAL_CODE") or os.getenv("TEST_POSTAL_CODE") or "")
        .replace(" ", "").replace("-", "").upper()
    )

    # ── App environment ──────────────────────────────────────────────
    # "development" enables local conveniences (e.g. the JWT dev
    # fallback below). Set APP_ENV=production in any deployed environment.
    APP_ENV: str = os.getenv("APP_ENV", "development")

    # ── Auth ─────────────────────────────────────────────────────────
    # JWT secret for session tokens. The dev fallback lets the app boot
    # without a .env locally; the guard below refuses to ship it.
    JWT_SECRET: str = os.getenv("JWT_SECRET") or "dev-secret-change-me"
    JWT_TTL_HOURS: int = int(os.getenv("JWT_TTL_HOURS") or 24 * 14)

    if APP_ENV != "development" and JWT_SECRET == "dev-secret-change-me":
        raise RuntimeError(
            "JWT_SECRET must be set to a strong random value when "
            "APP_ENV != development (generate one with "
            "`python -c \"import secrets; print(secrets.token_urlsafe(32))\"`)."
        )

    # Google OAuth — empty placeholders until the Cloud Console project
    # exists. Google sign-in returns 503 while these are blank; email
    # sign-in works regardless.
    GOOGLE_CLIENT_ID: str = os.getenv("GOOGLE_CLIENT_ID") or ""
    GOOGLE_CLIENT_SECRET: str = os.getenv("GOOGLE_CLIENT_SECRET") or ""
    GOOGLE_REDIRECT_URI: str = os.getenv("GOOGLE_REDIRECT_URI") or "http://localhost:8000/auth/google/callback"
    FRONTEND_URL: str = os.getenv("FRONTEND_URL") or "http://localhost:3000"

    # ── Feature flags ────────────────────────────────────────────────
    # The TF-IDF classifier is slow when run per-item; kept out of the
    # scrape pipeline entirely now (scraping moved to scraper-go, which
    # never classifies) and run instead as an async backfill — see
    # classifier/backfill.py. Still used inline for query-side
    # classification in routes/optimize.py.
    CLASSIFIER_ENABLED: bool = True

    # ── Scraper microservice (scraper-go) ───────────────────────────
    # Go service that owns fetching/parsing/persisting Flipp flyer
    # data. Empty SCRAPER_SERVICE_URL disables scrape triggering
    # entirely (preferences still save fine — see scraper_client.py).
    SCRAPER_SERVICE_URL: str = (os.getenv("SCRAPER_SERVICE_URL") or "").rstrip("/")
    SCRAPER_SERVICE_TOKEN: str = os.getenv("SCRAPER_SERVICE_TOKEN") or ""

    # ── Redis (shared job/scrape-state cache with scraper-go) ─────────
    # Empty REDIS_URL disables Redis-backed caching entirely — falls
    # back to always calling GET /jobs/latest and always re-running the
    # backfill sweep (see scraper_client.py). Safe for single-instance
    # dev; required for correctness once >1 backend replica is running.
    # scraper-go itself has no such fallback — it requires Redis to boot.
    REDIS_URL: str = os.getenv("REDIS_URL") or ""

    # ── Classification backfill ──────────────────────────────────────
    # How often classifier/backfill.py sweeps items.category IS NULL.
    CLASSIFIER_BACKFILL_INTERVAL_SECONDS: int = int(
        os.getenv("CLASSIFIER_BACKFILL_INTERVAL_SECONDS") or 60
    )
    CLASSIFIER_BACKFILL_BATCH_SIZE: int = int(
        os.getenv("CLASSIFIER_BACKFILL_BATCH_SIZE") or 500
    )