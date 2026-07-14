"""Async classification backfill — fills in items.category/subcategory
after the fact, on a timer, independent of any scrape.

Why this exists: scraper-go (the new scraper microservice) writes items
with category/subcategory left NULL — it has no ML runtime, and the
classifier is a scikit-learn model (TF-IDF + LogisticRegression, joblib-
serialized) with no practical Go equivalent. This sweeps
`items WHERE category IS NULL` on a timer and classifies in batches via
the existing classify_batch(), which already existed but was unused
before this — the pipeline used to call classify_item() once per item,
inline, in the scrape's hot path.

Deliberately NOT triggered by scraper-go — no callback, no webhook. It
sweeps regardless of what wrote the row, so it's resilient to any
future data source, not just this scraper.
"""

import logging

from apscheduler.schedulers.background import BackgroundScheduler

import db
from classifier import classify_batch
from config import Config

logger = logging.getLogger("flippwatch.classifier.backfill")

_scheduler: BackgroundScheduler | None = None


def run_backfill_once() -> int:
    """Classify up to one batch of unclassified items. Returns the
    number of items updated. Never raises — a failed tick just tries
    again next interval."""
    try:
        rows = db.unclassified_items(Config.CLASSIFIER_BACKFILL_BATCH_SIZE)
        if not rows:
            return 0

        names = [row["name_normalized"] for row in rows]
        results = classify_batch(names)

        updates = [
            (row["id"], aisle, department)
            for row, (aisle, department) in zip(rows, results)
        ]
        db.apply_classifications(updates)
        logger.info("Classification backfill: classified %d items", len(updates))
        return len(updates)
    except Exception:
        logger.exception("Classification backfill tick failed")
        return 0


def run_backfill_until_empty(max_batches: int = 10) -> int:
    """Drain the unclassified queue now, instead of waiting for the
    next scheduled tick — used right when a scrape finishes (see
    scraper_client.scrape_status_for()) so the frontend's existing
    "refetch deals when scrape completes" doesn't show a window of
    uncategorized items before the next timer tick catches up.
    max_batches caps the worst case (a huge scrape) so this can't run
    unbounded inside a status-poll request."""
    total = 0
    for _ in range(max_batches):
        n = run_backfill_once()
        total += n
        if n < Config.CLASSIFIER_BACKFILL_BATCH_SIZE:
            break  # queue drained
    return total


def start_backfill_scheduler() -> None:
    """Start the background scheduler once, at API startup (see
    main.py's lifespan). CLASSIFIER_ENABLED=false disables it entirely,
    same flag that already gated the old inline classification."""
    global _scheduler
    if _scheduler is not None or not Config.CLASSIFIER_ENABLED:
        return
    _scheduler = BackgroundScheduler()
    _scheduler.add_job(
        run_backfill_once,
        "interval",
        seconds=Config.CLASSIFIER_BACKFILL_INTERVAL_SECONDS,
        id="classifier_backfill",
        max_instances=1,  # a slow tick must never overlap the next one
    )
    _scheduler.start()
    logger.info(
        "Classification backfill scheduler started (every %ds, batch size %d)",
        Config.CLASSIFIER_BACKFILL_INTERVAL_SECONDS,
        Config.CLASSIFIER_BACKFILL_BATCH_SIZE,
    )


def stop_backfill_scheduler() -> None:
    global _scheduler
    if _scheduler is not None:
        _scheduler.shutdown(wait=False)
        _scheduler = None
