"""Runner for the flyer-scoped-items migration.

Usage:
    python -m db.migrations.run_migration --dry-run    # rolls back, reports
    python -m db.migrations.run_migration --apply      # commits

--dry-run executes the whole migration inside a transaction, prints the
before/after verification, then ROLLS BACK. Nothing is persisted, so it
is safe to run against production and is the only way to see what the
merge will actually do to real data.

The migration itself is idempotent-ish (IF NOT EXISTS / ON CONFLICT DO
NOTHING) but the destructive DELETE is not re-runnable once the unique
constraint has been swapped — the snapshot tables it creates first
(items_premigration_001, price_history_premigration_001) are the
rollback path.
"""

import argparse
import sys
from pathlib import Path

import psycopg2

SQL_FILE = Path(__file__).with_name("001_flyer_scoped_items.sql")


def _dsn() -> str:
    """DATABASE_URL out of backend/../.env without echoing the secret."""
    env = Path(__file__).resolve().parents[3] / ".env"
    for line in env.read_text().splitlines():
        if line.startswith("DATABASE_URL="):
            return line.split("=", 1)[1].strip().strip('"').strip("'")
    sys.exit("DATABASE_URL not found in .env")


def _stats(cur) -> dict:
    cur.execute("SELECT count(*) FROM items")
    items = cur.fetchone()[0]
    cur.execute("SELECT count(*) FROM price_history")
    history = cur.fetchone()[0]
    cur.execute("SELECT count(*) FROM flyer_postal_codes")
    mappings = cur.fetchone()[0]
    return {"items": items, "price_history": history, "flyer_postal_codes": mappings}


def _verify(cur) -> list[str]:
    """Post-migration invariants. Any failure aborts even with --apply."""
    problems: list[str] = []

    # 1. Every flyer that still has items must know at least one region,
    #    or those items become permanently unreachable by any reader.
    cur.execute(
        """
        SELECT count(DISTINCT i.flyer_id)
        FROM items i
        WHERE NOT EXISTS (
            SELECT 1 FROM flyer_postal_codes f WHERE f.flyer_id = i.flyer_id
        )
        """
    )
    orphan_flyers = cur.fetchone()[0]
    if orphan_flyers:
        problems.append(f"{orphan_flyers} flyer(s) with items but no postal-code mapping")

    # 2. No price history may point at a row the merge deleted.
    cur.execute(
        """
        SELECT count(*) FROM price_history ph
        LEFT JOIN items i ON i.id = ph.item_id
        WHERE i.id IS NULL
        """
    )
    orphan_history = cur.fetchone()[0]
    if orphan_history:
        problems.append(f"{orphan_history} orphaned price_history row(s)")

    # 3. The new key must actually be unique.
    cur.execute(
        """
        SELECT count(*) FROM (
            SELECT 1 FROM items
            GROUP BY merchant_id, flyer_id, name_normalized, valid_from
            HAVING count(*) > 1
        ) s
        """
    )
    dupes = cur.fetchone()[0]
    if dupes:
        problems.append(f"{dupes} group(s) still duplicated under the new key")

    # 4. Region reachability must be preserved: every postal code that
    #    could see deals before must still see deals after.
    cur.execute(
        """
        SELECT count(*) FROM (
            SELECT DISTINCT postal_code FROM items_premigration_001
            EXCEPT
            SELECT DISTINCT postal_code FROM flyer_postal_codes
        ) s
        """
    )
    lost_regions = cur.fetchone()[0]
    if lost_regions:
        problems.append(f"{lost_regions} postal code(s) lost their mapping")

    return problems


def main() -> None:
    ap = argparse.ArgumentParser()
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--dry-run", action="store_true", help="run then roll back")
    g.add_argument("--apply", action="store_true", help="run then commit")
    args = ap.parse_args()

    conn = psycopg2.connect(_dsn())
    conn.autocommit = False
    cur = conn.cursor()

    try:
        before = _stats_safe(cur)
        print(f"before:  {before}")

        cur.execute(SQL_FILE.read_text())

        after = _stats(cur)
        print(f"after:   {after}")
        removed = before.get("items", 0) - after["items"]
        print(
            f"\nmerged away {removed} duplicate item rows "
            f"({100 * removed / before['items']:.1f}% of the table)"
        )
        print(f"region mappings preserved in flyer_postal_codes: {after['flyer_postal_codes']}")
        print(
            "price_history rows: "
            f"{before.get('price_history', 0)} -> {after['price_history']} "
            "(re-pointed, never deleted)"
        )

        problems = _verify(cur)
        if problems:
            print("\nVERIFICATION FAILED:")
            for p in problems:
                print(f"  - {p}")
            conn.rollback()
            sys.exit("rolled back — no changes made")

        print("\nverification passed: no orphans, no lost regions, key is unique")

        if args.apply:
            conn.commit()
            print("COMMITTED")
        else:
            conn.rollback()
            print("ROLLED BACK (dry run) — database unchanged")
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


def _stats_safe(cur) -> dict:
    """`before` stats, tolerating flyer_postal_codes not existing yet."""
    cur.execute("SELECT count(*) FROM items")
    items = cur.fetchone()[0]
    cur.execute("SELECT count(*) FROM price_history")
    history = cur.fetchone()[0]
    return {"items": items, "price_history": history, "flyer_postal_codes": 0}


if __name__ == "__main__":
    main()
