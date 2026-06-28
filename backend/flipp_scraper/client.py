import asyncio
import logging
import random
from contextlib import asynccontextmanager
from typing import Any

import httpx

from config import Config

logger = logging.getLogger("flippwatch.scraper.client")

# ── Flipp endpoints ──────────────────────────────────────────────────

FLYERS_URL = "https://backflipp.wishabi.com/flipp/flyers"
ITEM_DETAIL_URL = "https://dam.flippenterprise.net/api/flipp/flyer_items"
SEARCH_URL = "https://backflipp.wishabi.com/flipp/items/search"           
MERCHANTS_LIST_URL = "https://backflipp.wishabi.com/flipp/merchants"        
ITEM_URL = "https://backflipp.wishabi.com/flipp/items"

# ── HTTP settings (internal) ─────────────────────────────────────────

_TIMEOUT = httpx.Timeout(connect=10.0, read=30.0, write=30.0, pool=30.0)
_MAX_RETRIES = 3
_DETAIL_CONCURRENCY = 8

_HEADERS = {
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

# ── Client factory ───────────────────────────────────────────────────


@asynccontextmanager
async def create_client(concurrency: int = _DETAIL_CONCURRENCY):
    """Yield a properly configured httpx.AsyncClient.

    Usage:
        async with create_client() as client:
            flyers = await fetch_flyers(client, postal_code)
            items  = await fetch_flyer_items(client, flyer_id, postal_code)
    """
    async with httpx.AsyncClient(
        timeout=_TIMEOUT,
        headers=_HEADERS,
        limits=httpx.Limits(
            max_connections=concurrency,
            max_keepalive_connections=concurrency,
        ),
    ) as client:
        yield client


# ── Helpers ──────────────────────────────────────────────────────────


def generate_sid() -> str:
    """Generate a 16-digit session ID for Flipp detail requests."""
    return "".join(str(random.randint(0, 9)) for _ in range(16))


async def _request_json(
    client: httpx.AsyncClient,
    url: str,
    *,
    params: dict[str, Any] | None = None,
) -> dict:
    """GET with retries, exponential backoff, and rate-limit handling.

    Retries on: HTTP 429, HTTP 5xx, timeouts, and transport errors.
    Raises RuntimeError after _MAX_RETRIES consecutive failures.
    """
    last_error: Exception | None = None

    for attempt in range(_MAX_RETRIES):
        try:
            response = await client.get(url, params=params, headers=_HEADERS)

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
            if attempt == _MAX_RETRIES - 1:
                break
            await asyncio.sleep(2**attempt)

    raise RuntimeError(
        f"Request failed after {_MAX_RETRIES} attempts: {url}"
    ) from last_error


# ── Public API ───────────────────────────────────────────────────────


async def fetch_flyers(
    client: httpx.AsyncClient,
    postal_code: str,
) -> list[dict]:
    """Fetch every active flyer for a postal code from Flipp."""
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


async def fetch_merchants(
    client: httpx.AsyncClient,
    postal_code: str,
) -> list[dict]:
    """Fetch every merchant Flipp knows about for a postal code.

    Each entry has id, name, us_based, name_identifier. Use this to
    discover merchants dynamically (e.g. for filter_merchants) instead
    of hardcoding Config.DEFAULT_MERCHANTS — a new grocery store
    appearing in your postal code shows up here automatically.
    """
    data = await _request_json(
        client,
        MERCHANTS_LIST_URL,
        params={"postal_code": postal_code},
    )

    merchants = data.get("merchants")
    if not isinstance(merchants, list):
        raise ValueError(
            "Flipp response did not contain a valid 'merchants' list"
        )
    return [m for m in merchants if isinstance(m, dict)]


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


async def search_items(
    client: httpx.AsyncClient,
    query: str,
    postal_code: str,
    include_ecom: bool = False,
) -> list[dict]:
    """Search Flipp items by keyword (e.g. "chicken", "milk").

    Returns basic search-result items (same idea as fetch_flyer_items)
    — pass the result through enrich_items if you want full per-item
    detail merged in.
    """
    data = await _request_json(
        client,
        SEARCH_URL,
        params={"q": query, "postal_code": postal_code},
    )

    items = data.get("items")
    if not isinstance(items, list):
        raise ValueError(
            f"Search for {query!r} did not return a valid 'items' list"
        )
    results = [item for item in items if isinstance(item, dict)]

    if include_ecom:
        ecom = data.get("ecom_items")
        if isinstance(ecom, list):
            results += [item for item in ecom if isinstance(item, dict)]

    return results


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


async def fetch_item(
    client: httpx.AsyncClient,
    item_id: int,
) -> dict:
    """Fetch the richest available single-item payload, via the
    backflipp host directly (not dam.flippenterprise.net).
    """
    data = await _request_json(
        client,
        f"{ITEM_URL}/{item_id}",
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
    concurrency: int = _DETAIL_CONCURRENCY,
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

                # Batch for endpoint 6
                """detail = await fetch_item(
                    client=client,
                    item_id=int(item_id)
                )"""
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
