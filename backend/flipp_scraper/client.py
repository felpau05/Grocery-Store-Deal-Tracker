import asyncio
import logging
import random
from typing import Any

import httpx

from config import Config

logger = logging.getLogger("flippwatch.scraper.client")

# ── Flipp endpoints ──────────────────────────────────────────────────

FLYERS_URL = "https://backflipp.wishabi.com/flipp/flyers"
ITEM_DETAIL_URL = "https://dam.flippenterprise.net/api/flipp/flyer_items"

# ── HTTP settings ────────────────────────────────────────────────────

TIMEOUT = httpx.Timeout(connect=10.0, read=30.0, write=30.0, pool=30.0)
MAX_RETRIES = 3
DETAIL_CONCURRENCY = 8

HEADERS = {
    "Accept": "application/json",
    "Referer": "https://flipp.com/",
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/125.0 Safari/537.36"
    ),
}

# ── Merchants (from config) ──────────────────────────────────────────

MERCHANTS = Config.DEFAULT_MERCHANTS


# ── Helpers ──────────────────────────────────────────────────────────


def generate_sid() -> str:
    """Generate a 16-digit session ID for Flipp detail requests.

    Flipp expects a numeric `sid` parameter on item-detail calls.
    Generate once per scrape run and reuse for every request.
    """
    return "".join(str(random.randint(0, 9)) for _ in range(16))


async def _request_json(
    client: httpx.AsyncClient,
    url: str,
    *,
    params: dict[str, Any] | None = None,
) -> dict:
    """GET with retries, exponential backoff, and rate-limit handling.

    Retries on: HTTP 429, HTTP 5xx, timeouts, and transport errors.
    Raises RuntimeError after MAX_RETRIES consecutive failures.
    """
    last_error: Exception | None = None

    for attempt in range(MAX_RETRIES):
        try:
            response = await client.get(url, params=params, headers=HEADERS)

            # ── rate-limited ──
            if response.status_code == 429:
                raw = response.headers.get("Retry-After")
                try:
                    delay = float(raw) if raw else 2**attempt
                except ValueError:
                    delay = 2**attempt
                logger.warning(
                    "Rate-limited by Flipp. Retrying in %.1fs.", delay
                )
                await asyncio.sleep(delay)
                continue

            # ── server error ──
            if 500 <= response.status_code < 600:
                delay = 2**attempt
                logger.warning(
                    "Flipp returned HTTP %s. Retrying in %ss.",
                    response.status_code,
                    delay,
                )
                await asyncio.sleep(delay)
                continue

            response.raise_for_status()
            data = response.json()

            if not isinstance(data, dict):
                raise ValueError(
                    f"Expected JSON object from {url}, "
                    f"got {type(data).__name__}"
                )
            return data

        except (httpx.TimeoutException, httpx.TransportError, ValueError) as exc:
            last_error = exc
            if attempt == MAX_RETRIES - 1:
                break
            await asyncio.sleep(2**attempt)

    raise RuntimeError(
        f"Request failed after {MAX_RETRIES} attempts: {url}"
    ) from last_error


# ── Public API ───────────────────────────────────────────────────────


async def fetch_flyers(postal_code: str) -> list[dict]:
    """Fetch every active flyer for a postal code from Flipp."""
    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        data = await _request_json(
            client,
            FLYERS_URL,
            params={"locale": "en-ca", "postal_code": postal_code},
        )

    flyers = data.get("flyers")
    if not isinstance(flyers, list):
        raise ValueError(
            "Flipp response did not contain a valid 'flyers' list"
        )
    return flyers


async def fetch_flyer_items(
    client: httpx.AsyncClient,
    flyer_id: int,
    postal_code: str,
) -> list[dict]:
    """Fetch basic item list for one flyer.

    Returns only dict-type entries. Raises if any returned item
    belongs to a different flyer (data integrity check).
    """
    data = await _request_json(
        client,
        f"{FLYERS_URL}/{flyer_id}",
        params={"locale": "en-ca", "postal_code": postal_code},
    )

    items = data.get("items")
    if not isinstance(items, list):
        raise ValueError(
            f"Flyer {flyer_id} response did not contain an 'items' list"
        )

    wrong_flyer = [
        item
        for item in items
        if isinstance(item, dict)
        and item.get("flyer_id") not in (None, flyer_id)
    ]
    if wrong_flyer:
        raise ValueError(
            f"Flyer {flyer_id} returned items belonging to another flyer"
        )

    return [item for item in items if isinstance(item, dict)]


async def fetch_item_detail(
    client: httpx.AsyncClient,
    item_id: int,
    postal_code: str,
    sid: str,
) -> dict:
    """Fetch the full detail/popup metadata for one flyer item."""
    data = await _request_json(
        client,
        f"{ITEM_DETAIL_URL}/{item_id}",
        params={"locale": "en", "postal_code": postal_code, "sid": sid},
    )

    returned_id = data.get("id")
    if returned_id is not None and str(returned_id) != str(item_id):
        raise ValueError(
            f"Requested item {item_id}, but Flipp returned {returned_id}"
        )
    return data


async def enrich_items(
    client: httpx.AsyncClient,
    raw_items: list[dict],
    postal_code: str,
    sid: str,
    concurrency: int = DETAIL_CONCURRENCY,
) -> list[dict]:
    """Fetch detail metadata for many items concurrently.

    Limits concurrent requests via a semaphore.  If a single detail
    request fails, the original basic item is kept — nothing is lost.
    """
    semaphore = asyncio.Semaphore(concurrency)

    async def _enrich_one(raw: dict) -> dict:
        item_id = raw.get("id")
        if not item_id:
            return raw

        async with semaphore:
            try:
                detail = await fetch_item_detail(
                    client=client,
                    item_id=int(item_id),
                    postal_code=postal_code,
                    sid=sid,
                )
                return {**raw, **detail}
            except Exception as exc:
                logger.warning("Could not enrich item %s: %s", item_id, exc)
                return raw

    return await asyncio.gather(*(_enrich_one(r) for r in raw_items))


def filter_merchants(
    flyers: list[dict],
    merchants: list[str] | None = None,
) -> list[dict]:
    """Keep only flyers from the configured merchant list."""
    if merchants is None:
        merchants = MERCHANTS

    allowed = {m.strip().casefold() for m in merchants}

    return [
        f
        for f in flyers
        if isinstance(f, dict)
        and str(f.get("merchant", "")).strip().casefold() in allowed
    ]