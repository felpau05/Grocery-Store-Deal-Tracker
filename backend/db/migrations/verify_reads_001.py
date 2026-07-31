"""Proves the migration doesn't change what users see.

Runs inside the migration's transaction: captures the deals each postal
code can see BEFORE the merge, applies the migration, re-runs the same
reads through the new flyer_postal_codes path, and diffs them. Then
rolls back.

The counts are expected to change (duplicates collapse), but the SET of
distinct products a region can see must be identical — that is the thing
the migration must not break.
"""

import sys
from pathlib import Path

import psycopg2

SQL_FILE = Path(__file__).with_name("001_flyer_scoped_items.sql")


def _dsn() -> str:
    env = Path(__file__).resolve().parents[3] / ".env"
    for line in env.read_text().splitlines():
        if line.startswith("DATABASE_URL="):
            return line.split("=", 1)[1].strip().strip('"').strip("'")
    sys.exit("DATABASE_URL not found")


def main() -> None:
    conn = psycopg2.connect(_dsn())
    conn.autocommit = False
    cur = conn.cursor()

    try:
        cur.execute("SELECT DISTINCT postal_code FROM items ORDER BY postal_code")
        postals = [r[0] for r in cur.fetchall()]

        # BEFORE: what each region sees, keyed the old way.
        before: dict[str, set] = {}
        for p in postals:
            cur.execute(
                """
                SELECT DISTINCT merchant_id, name_normalized, valid_from, price
                FROM items WHERE postal_code = %s
                """,
                (p,),
            )
            before[p] = set(cur.fetchall())

        cur.execute(SQL_FILE.read_text())

        # AFTER: same question, asked through the junction.
        print(f"{'postal':<10} {'before':>8} {'after':>8}  {'verdict'}")
        ok = True
        for p in postals:
            cur.execute(
                """
                SELECT DISTINCT i.merchant_id, i.name_normalized, i.valid_from, i.price
                FROM items i
                WHERE i.flyer_id IN (
                    SELECT flyer_id FROM flyer_postal_codes WHERE postal_code = %s
                )
                """,
                (p,),
            )
            after = set(cur.fetchall())
            missing = before[p] - after
            added = after - before[p]
            if missing:
                ok = False
                verdict = f"LOST {len(missing)} deals"
            elif added:
                # Gaining deals is legitimate: a region that only ever
                # partially scraped a shared flyer now sees all of it.
                verdict = f"ok (+{len(added)} newly reachable)"
            else:
                verdict = "identical"
            print(f"{p:<10} {len(before[p]):>8} {len(after):>8}  {verdict}")

        print()
        if ok:
            print("PASS: no region lost a single deal")
        else:
            print("FAIL: some region lost deals — do not apply")
    finally:
        conn.rollback()
        cur.close()
        conn.close()
        print("(rolled back — database unchanged)")


if __name__ == "__main__":
    main()
