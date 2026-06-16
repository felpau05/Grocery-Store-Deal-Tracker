import os
from dotenv import load_dotenv
from pathlib import Path

load_dotenv()

class Config:

    # Paths of Directories and Files
    BACKEND_PATH: Path = Path(__file__).parent
    TEST_OUTPUTS_PATH = BACKEND_PATH / "test_outputs"

    # Database Configuration
    DATABASE_URL: str | None = os.getenv(key="DATABASE_URL")

    # Flipp Scraper
    DEFAULT_MERCHANTS: list[str] = [
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