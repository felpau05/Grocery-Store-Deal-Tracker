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

    # ── Auth ─────────────────────────────────────────────────────────
    # JWT secret for session tokens. The dev fallback lets the app boot
    # without a .env, but never ship it.
    JWT_SECRET: str = os.getenv("JWT_SECRET") or "dev-secret-change-me"
    JWT_TTL_HOURS: int = int(os.getenv("JWT_TTL_HOURS") or 24 * 14)

    # Google OAuth — empty placeholders until the Cloud Console project
    # exists. Google sign-in returns 503 while these are blank; email
    # sign-in works regardless.
    GOOGLE_CLIENT_ID: str = os.getenv("GOOGLE_CLIENT_ID") or ""
    GOOGLE_CLIENT_SECRET: str = os.getenv("GOOGLE_CLIENT_SECRET") or ""
    GOOGLE_REDIRECT_URI: str = os.getenv("GOOGLE_REDIRECT_URI") or "http://localhost:8000/auth/google/callback"
    FRONTEND_URL: str = os.getenv("FRONTEND_URL") or "http://localhost:3000"

    # ── Feature flags ────────────────────────────────────────────────
    # The TF-IDF classifier is slow when run per-item; keep it out of
    # the request cycle AND the scrape pipeline until it moves to a
    # background/batch job (see README notes).
    CLASSIFIER_ENABLED: bool = True