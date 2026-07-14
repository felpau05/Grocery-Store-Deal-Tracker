"""HTTP client for the scraper-go microservice — replaces the old
in-process flipp_scraper.service module now that scraping has moved
out of this API into a separate Go service (see the migration plan:
communication is plain HTTP, no queue).

scraper-go's POST /jobs/scrape returns immediately (202/409) without
waiting for the scrape itself, so it's safe to call synchronously from
a request handler with a short timeout — unlike the old scrape, which
had to run in the background because it was slow.
"""

import logging
from typing import cast

import httpx
import redis

from config import Config

logger = logging.getLogger("flippwatch.scraper_client")

_TIMEOUT = httpx.Timeout(5.0)

# postal_code -> job_id and job_id -> "already backfilled" now live in
# Redis (shared with scraper-go), not in-process state, so both caches
# stay correct if this backend ever runs as more than one replica. A
# missing/unreachable Redis degrades gracefully rather than breaking
# anything — see _get_redis()'s docstring for why.
_REDIS_JOB_ID_TTL = 86400       # 24h — matches scraper-go's own job-record TTL
_REDIS_BACKFILLED_TTL = 86400

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

_redis: "redis.Redis | None" = None


def _get_redis() -> "redis.Redis | None":
    """Lazy client, like db/connection.py's _get_pool() — except this
    returns None instead of raising when REDIS_URL is unset, matching
    SCRAPER_SERVICE_URL's existing "empty disables the feature, app
    still boots" precedent. Every caller below already treats a None
    client (or any Redis error) as a safe no-op/cache-miss, so a
    single-instance dev setup with no Redis still works correctly —
    just without the cross-replica correctness this exists for.

    decode_responses=True means every call below gets back plain str,
    not bytes, at runtime — redis-py's stubs can't express that
    statically (the sync client isn't generic over AnyStr in this
    version), so _redis_get casts its one `.get()` call accordingly."""
    global _redis
    if _redis is None and Config.REDIS_URL:
        _redis = redis.Redis.from_url(Config.REDIS_URL, decode_responses=True)
    return _redis


def _redis_get(key: str) -> str | None:
    r = _get_redis()
    if r is None:
        return None
    try:
        # decode_responses=True guarantees str at runtime; see _get_redis().
        return cast("str | None", r.get(key))
    except redis.RedisError as exc:
        logger.warning("Redis GET %s failed: %s", key, exc)
        return None


def _redis_set(key: str, value: str, ex: int) -> None:
    r = _get_redis()
    if r is None:
        return
    try:
        r.set(key, value, ex=ex)
    except redis.RedisError as exc:
        logger.warning("Redis SET %s failed: %s", key, exc)


def _claim_backfill(job_id: str) -> bool:
    """True if this call is the first (across all backend replicas) to
    observe job_id as finished. Uses SETNX so the claim is atomic even
    with more than one replica polling at once — strictly better than
    a plain in-memory set, which was only atomic within one process.

    Fails OPEN (returns True) on any Redis problem: the failure mode
    this guards against is a redundant, harmless, idempotent backfill
    sweep; the failure mode to avoid is silently SKIPPING the sweep,
    which would resurrect the stale-categories UX gap this feature
    exists to close. Deliberately the opposite choice from scraper-go's
    fail-closed job lock, which protects a hard invariant instead.
    """
    r = _get_redis()
    if r is None:
        return True
    try:
        return bool(r.set(f"scraper_client:backfilled:{job_id}", "1", nx=True, ex=_REDIS_BACKFILLED_TTL))
    except redis.RedisError as exc:
        logger.warning("Redis SETNX backfilled:%s failed: %s", job_id, exc)
        return True


def _headers() -> dict:
    return {"X-Scraper-Token": Config.SCRAPER_SERVICE_TOKEN} if Config.SCRAPER_SERVICE_TOKEN else {}


def _reshape(job: dict) -> dict:
    """Map scraper-go's job JSON to the shape the frontend already
    consumes (previously backed by flipp_scraper.service's _state)."""
    status = job.get("status")
    running = status == "running"
    return {
        "running": running,
        "postal_code": job.get("postal_code"),
        "merchant_count": job.get("merchant_count"),
        "started_at": job.get("started_at"),
        "finished_at": job.get("finished_at") or None,
        "ok": None if running else status == "done",
        "error": job.get("error") or None,
        "items_scraped": None if running else job.get("items_scraped"),
    }


def start_scrape(postal_code: str, merchant_ids: set[int]) -> bool:
    """POST a scrape job to scraper-go.

    Returns True if a NEW scrape was accepted (202), False if one was
    already running (409) or scraper-go couldn't be reached. Never
    raises — a preferences save must never fail because the scraper is
    down, same contract the old run_background_scrape had.
    """
    if not Config.SCRAPER_SERVICE_URL:
        logger.warning("SCRAPER_SERVICE_URL not set — skipping scrape trigger for %s", postal_code)
        return False
    try:
        resp = httpx.post(
            f"{Config.SCRAPER_SERVICE_URL}/jobs/scrape",
            json={"postal_code": postal_code, "merchant_ids": sorted(merchant_ids)},
            headers=_headers(),
            timeout=_TIMEOUT,
        )
        body = resp.json()
        job_id = body.get("job_id")
        if job_id:
            _redis_set(f"scraper_client:job_id:{postal_code}", job_id, ex=_REDIS_JOB_ID_TTL)

        if resp.status_code == 202:
            logger.info("Scrape started via scraper-go: %s (job %s)", postal_code, job_id)
            return True
        if resp.status_code == 409:
            logger.info("Scrape already running (job %s) — skipped for %s", job_id, postal_code)
            return False
        logger.warning("scraper-go returned HTTP %s for %s", resp.status_code, postal_code)
        return False
    except (httpx.HTTPError, ValueError) as exc:
        logger.error("Could not reach scraper-go to start scrape for %s: %s", postal_code, exc)
        return False


def scrape_status_for(postal_code: str | None) -> dict:
    """Progress of the scrape for `postal_code`, proxied from
    scraper-go. Fails open to the idle shape when there's no postal
    code, no scraper-go configured, no known job, or scraper-go can't
    be reached — same "unrelated postal code sees idle" behavior the
    old service.scrape_status_for had.
    """
    if not postal_code or not Config.SCRAPER_SERVICE_URL:
        return dict(_IDLE)

    job_id = _redis_get(f"scraper_client:job_id:{postal_code}")
    try:
        if job_id:
            resp = httpx.get(
                f"{Config.SCRAPER_SERVICE_URL}/jobs/{job_id}", headers=_headers(), timeout=_TIMEOUT
            )
        else:
            resp = httpx.get(
                f"{Config.SCRAPER_SERVICE_URL}/jobs/latest",
                params={"postal_code": postal_code},
                headers=_headers(),
                timeout=_TIMEOUT,
            )
        if resp.status_code != 200:
            return dict(_IDLE)

        job = resp.json()
        if not job_id:
            _redis_set(f"scraper_client:job_id:{postal_code}", job.get("job_id"), ex=_REDIS_JOB_ID_TTL)

        # The frontend refetches its deals list the moment this poll
        # reports the scrape as no-longer-running (see app/page.tsx's
        # reloadKey bump on scrapeStatus.running -> false). Classification
        # normally lags behind on its own ~60s timer (see
        # classifier/backfill.py), which left a window where that refetch
        # showed freshly-scraped items with no category yet. Draining the
        # backfill queue right here — the instant this poll (already
        # running every 5s regardless) first observes completion — means
        # categories are already in place by the time this same response
        # reaches the frontend and triggers its refetch. Runs at most once
        # per job_id (via _claim_backfill's SETNX), not on every subsequent
        # poll of an already-finished job.
        returned_job_id = job.get("job_id")
        if job.get("status") != "running" and returned_job_id and _claim_backfill(returned_job_id):
            try:
                from classifier.backfill import run_backfill_until_empty

                run_backfill_until_empty()
            except Exception as exc:
                logger.warning("Post-scrape classification backfill failed: %s", exc)

        return _reshape(job)
    except (httpx.HTTPError, ValueError) as exc:
        logger.warning("Could not reach scraper-go for status (%s): %s", postal_code, exc)
        return dict(_IDLE)
