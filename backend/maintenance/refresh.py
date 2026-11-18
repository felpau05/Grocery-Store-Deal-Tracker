"""Scheduled flyer refresh — re-scrapes every region on a timer.

Why this exists: flyers are weekly, but the only scrape trigger used to
be PUT /me/preferences (a changed postal code or a newly added store).
Once the flyers passed valid_to, the deals page stayed empty until
someone added a store, and prune then deleted the old rows. This
re-scrapes the default region (what an anonymous visitor sees) plus
every user's saved region, every Config.SCRAPE_REFRESH_INTERVAL_HOURS,
and once about a minute after startup, so a restart or redeploy refills
an empty database.

scraper-go allows one scrape at a time for the whole service (Redis
lock; POST /jobs/scrape answers 202 or 409), so the regions run one
after another, each waited on before the next starts.
"""

import logging
import threading
import time
from datetime import datetime, timedelta, timezone

from apscheduler.schedulers.background import BackgroundScheduler

import db
from config import Config
from scraper_client import scrape_status_for, start_scrape

logger = logging.getLogger("flippwatch.maintenance.refresh")

# scraper-go's jobLockTTL (job.go): past this the lock is gone anyway.
_SCRAPE_TIMEOUT_SECONDS = 30 * 60
_POLL_SECONDS = 10

_scheduler: BackgroundScheduler | None = None
_stop = threading.Event()


def build_targets(default_postal: str, default_merchants: set[int], rows: list[dict]) -> dict[str, set[int]]:
    """postal_code -> union of merchant ids, from the default region plus
    db.saved_scrape_regions() rows. Blank postal codes and an empty
    default store list are dropped."""
    targets: dict[str, set[int]] = {}
    if default_postal and default_merchants:
        targets[default_postal] = set(default_merchants)
    for row in rows:
        if row["postal_code"]:
            targets.setdefault(row["postal_code"], set()).add(int(row["merchant_id"]))
    return targets


def run_targets(targets, start, status, wait, clock=time.monotonic,
                timeout=_SCRAPE_TIMEOUT_SECONDS, poll=_POLL_SECONDS) -> dict[str, str]:
    """Scrape each target in turn: start it, poll status() until it
    finishes or `timeout` passes, then start the next. A refused start
    (409 or scraper-go unreachable; start_scrape logs which) is skipped
    — the next scheduled run retries. `wait(seconds)` is _stop.wait in
    production: it returns True on shutdown, which ends the run.

    Returns postal_code -> "done" | "failed" | "refused" | "timeout"."""
    outcomes: dict[str, str] = {}
    for postal, merchant_ids in targets.items():
        if not start(postal, merchant_ids):
            outcomes[postal] = "refused"
            continue
        outcomes[postal] = "timeout"
        deadline = clock() + timeout
        while clock() < deadline:
            if wait(poll):
                return outcomes
            ok = status(postal)["ok"]
            if ok is not None:  # None = still running, or status unknown right now
                outcomes[postal] = "done" if ok else "failed"
                break
        logger.info("Scheduled scrape %s: %s", postal, outcomes[postal])
    return outcomes


def _scraped_recently(postal: str, within: timedelta) -> bool:
    """True if scraper-go's latest job for `postal` succeeded less than
    `within` ago. Its job records live 24h in Redis; an older scrape
    reads as "not recent", which only costs an extra scrape."""
    s = scrape_status_for(postal)
    # start_scrape caches the RUNNING job's id on a 409, which can belong
    # to another postal code — don't let that job count for this one.
    if not s["ok"] or s["postal_code"] != postal or not s["finished_at"]:
        return False
    # Python 3.10 (Dockerfile.prod) can't parse Go's trailing "Z".
    finished = datetime.fromisoformat(s["finished_at"].replace("Z", "+00:00"))
    return datetime.now(timezone.utc) - finished < within


def _scheduled_refresh() -> None:
    # A failed refresh must not kill the scheduler thread; next run retries.
    try:
        targets = build_targets(
            Config.DEFAULT_POSTAL_CODE, Config.DEFAULT_MERCHANTS, db.saved_scrape_regions()
        )
        # Half an interval, not a full one: the previous run's own scrapes
        # finished minutes after that run began, so they are always a bit
        # under one interval old and would make every other run skip.
        fresh = timedelta(hours=Config.SCRAPE_REFRESH_INTERVAL_HOURS / 2)
        due = {p: m for p, m in targets.items() if not _scraped_recently(p, fresh)}
        logger.info("Scheduled scrape refresh: %d of %d regions due", len(due), len(targets))
        run_targets(due, start_scrape, scrape_status_for, _stop.wait)
    except Exception:
        logger.exception("Scheduled scrape refresh failed")


def start_refresh_scheduler() -> None:
    """Start the scrape refresh once, at API startup (see main.py's
    lifespan). Same pattern as prune.py's scheduler.
    SCRAPE_REFRESH_INTERVAL_HOURS=0 disables it."""
    global _scheduler
    if _scheduler is not None or Config.SCRAPE_REFRESH_INTERVAL_HOURS <= 0:
        return
    _stop.clear()
    _scheduler = BackgroundScheduler()
    _scheduler.add_job(
        _scheduled_refresh,
        "interval",
        hours=Config.SCRAPE_REFRESH_INTERVAL_HOURS,
        next_run_time=datetime.now(timezone.utc) + timedelta(minutes=1),
        id="scrape_refresh",
        max_instances=1,
    )
    _scheduler.start()
    logger.info(
        "Scrape refresh scheduler started (every %dh, first run in ~1 min)",
        Config.SCRAPE_REFRESH_INTERVAL_HOURS,
    )


def stop_refresh_scheduler() -> None:
    global _scheduler
    if _scheduler is not None:
        _stop.set()  # ends a run's 30-minute poll so shutdown isn't held up
        _scheduler.shutdown(wait=False)
        _scheduler = None
