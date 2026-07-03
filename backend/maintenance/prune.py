"""Data retention / pruning — keeps the DB inside Supabase's free tier.

Policy (see README notes for the reasoning):
  1. price_history older than --weeks is deleted — the 30-day chart
     never needs more than ~5 weeks of points.
  2. items whose deal window ENDED more than --weeks ago are deleted,
     along with their remaining price_history (FK order matters).
  3. flyers with no items left are deleted.
  4. VACUUM is left to Postgres autovacuum (Supabase runs it); the freed
     pages are reused by the next scrape.

Run weekly (cron / GitHub Action / `python -m maintenance.prune`):

    python -m maintenance.prune --weeks 8            # prune
    python -m maintenance.prune --weeks 8 --dry-run  # count only

Deleting an old item also deletes its price history, so --weeks is the
real memory of the app: how far back the price chart can ever reach.
"""

import argparse
import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))  # backend/ on path

from db.connection import get_conn  # noqa: E402
from db.guard import clear_storage_error  # noqa: E402

logger = logging.getLogger("flippwatch.maintenance.prune")


def _db_size(cur) -> str:
    cur.execute("SELECT pg_size_pretty(pg_database_size(current_database()))")
    return cur.fetchone()[0]


def prune(weeks: int, dry_run: bool = False) -> dict:
    """Delete data older than `weeks`. Returns per-table counts."""
    cutoff = f"CURRENT_DATE - INTERVAL '{int(weeks)} weeks'"
    counts: dict[str, int] = {}

    with get_conn() as conn:
        with conn.cursor() as cur:
            size_before = _db_size(cur)

            # 1. Old price history (both by age and by belonging to soon-
            #    to-be-deleted items) — biggest table, fastest win.
            cur.execute(
                f"""
                SELECT count(*) FROM price_history
                WHERE scraped_at < {cutoff}
                   OR item_id IN (SELECT id FROM items WHERE valid_to < {cutoff})
                """
            )
            counts["price_history"] = cur.fetchone()[0]

            cur.execute(f"SELECT count(*) FROM items WHERE valid_to < {cutoff}")
            counts["items"] = cur.fetchone()[0]

            cur.execute(
                f"""
                SELECT count(*) FROM flyers f
                WHERE NOT EXISTS (
                    SELECT 1 FROM items i
                    WHERE i.flyer_id = f.id AND i.valid_to >= {cutoff}
                )
                """
            )
            counts["flyers"] = cur.fetchone()[0]

            if dry_run:
                logger.info("[dry-run] would delete: %s (db size %s)", counts, size_before)
                conn.rollback()
                return {**counts, "db_size": size_before, "dry_run": True}

            cur.execute(
                f"""
                DELETE FROM price_history
                WHERE scraped_at < {cutoff}
                   OR item_id IN (SELECT id FROM items WHERE valid_to < {cutoff})
                """
            )
            cur.execute(f"DELETE FROM items WHERE valid_to < {cutoff}")
            cur.execute(
                "DELETE FROM flyers f WHERE NOT EXISTS "
                "(SELECT 1 FROM items i WHERE i.flyer_id = f.id)"
            )

            size_after_delete = _db_size(cur)

    # A successful prune means writes may work again — reset the
    # degraded-storage flag so /health recovers without a restart.
    clear_storage_error()

    logger.info(
        "Pruned %s price_history, %s items, %s flyers older than %s weeks "
        "(size %s → reclaim happens via autovacuum)",
        counts["price_history"], counts["items"], counts["flyers"], weeks, size_before,
    )
    return {**counts, "db_size": size_after_delete, "dry_run": False}


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    parser = argparse.ArgumentParser(description="Prune old grocery data")
    parser.add_argument("--weeks", type=int, default=8,
                        help="keep data newer than this many weeks (default 8)")
    parser.add_argument("--dry-run", action="store_true",
                        help="count what would be deleted, delete nothing")
    args = parser.parse_args()

    if args.weeks < 2:
        parser.error("--weeks must be >= 2 (younger data backs the price chart)")

    result = prune(weeks=args.weeks, dry_run=args.dry_run)
    print(result)
