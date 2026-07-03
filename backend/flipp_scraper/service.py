"""On-demand background scrapes, triggered when a user saves a new
postal code or picks stores we haven't scraped yet.

One scrape at a time (module-level flag — the API runs single-process);
a request that arrives while one is running is skipped and the caller
told so. Status is polled by the frontend settings page via
GET /scrape/status.
"""

import asyncio
import logging
import time

from .run import scrape

logger = logging.getLogger("flippwatch.scraper.service")

_state: dict = {
    "running": False,
    "postal_code": None,
    "merchant_count": None,
    "started_at": None,
    "finished_at": None,
    "ok": None,
    "error": None,
    "items_scraped": None,
}


_IDLE = {
    "running": False,
    "postal_code": None,
    "merchant_count": None,
    "started_at": None,
    "finished_at": None,
    "ok": None,
    "error": None,
    "items_scraped": None,
}


def scrape_status() -> dict:
    return dict(_state)


def scrape_status_for(postal_code: str | None) -> dict:
    """The global scrape state, but only if it belongs to `postal_code`.

    The scraper is single-flight across the whole process — one scrape
    at a time, for whichever user triggered it — so without this check,
    a user polling GET /scrape/status would see progress/results for
    ANY user's scrape, including postal codes that aren't theirs. Callers
    with no postal code (not yet set) always see idle.
    """
    if postal_code and _state["postal_code"] == postal_code:
        return dict(_state)
    return dict(_IDLE)


def scrape_running() -> bool:
    return bool(_state["running"])


def _run_scrape_blocking(postal_code: str, merchant_ids: set[int]):
    """Run the async scrape to completion on the calling (worker) thread.

    Executed via `asyncio.to_thread` so the blocking parse + DB writes
    never touch the request event loop. `asyncio.run` gives this thread
    its own loop for the scrape's httpx calls.
    """
    return asyncio.run(
        scrape(postal_code=postal_code, valid_merchants=merchant_ids, persist=True)
    )


async def run_background_scrape(postal_code: str, merchant_ids: set[int]) -> None:
    """FastAPI background task: scrape one postal code's selected stores
    and persist. Never raises — failures land in the status dict/logs."""
    if _state["running"]:
        logger.info("Scrape already running (%s) — skipping request for %s",
                    _state["postal_code"], postal_code)
        return
    if not merchant_ids:
        return

    _state.update(
        running=True,
        postal_code=postal_code,
        merchant_count=len(merchant_ids),
        started_at=time.strftime("%Y-%m-%dT%H:%M:%S%z"),
        finished_at=None,
        ok=None,
        error=None,
        items_scraped=None,
    )
    logger.info("Background scrape starting: %s, %d merchants", postal_code, len(merchant_ids))

    try:
        # CRITICAL: run the whole scrape on a worker thread, NOT on the
        # request event loop. `scrape()` is async (httpx) but its heavy
        # parts are blocking and synchronous — `run_pipeline_batch` (a
        # CPU-bound parse of thousands of items) and the per-item
        # `db.upsert_item` loop (hundreds of blocking psycopg2 calls).
        # Awaiting it directly here pins the single asyncio loop for the
        # scrape's full duration, starving every concurrent request
        # (/me, /deals, /scrape/status all hang → the frontend times out
        # and looks broken). `asyncio.to_thread` moves it off-loop; the
        # nested `asyncio.run` gives the scrape its own loop for httpx.
        # Safe because scrapes are single-flight (the guard above), so
        # this never spawns more than one worker thread at a time.
        parsed = await asyncio.to_thread(_run_scrape_blocking, postal_code, merchant_ids)
        _state.update(ok=True, items_scraped=len(parsed))
        logger.info("Background scrape done: %d items for %s", len(parsed), postal_code)
    except Exception as exc:
        _state.update(ok=False, error=str(exc)[:300])
        logger.error("Background scrape failed for %s: %s", postal_code, exc)
    finally:
        _state.update(running=False, finished_at=time.strftime("%Y-%m-%dT%H:%M:%S%z"))
