"""Reads + writes for a signed-in account's grocery cart and saved trip
plans. Anonymous visitors never reach these — the frontend keeps a
local-only cart/plans for them (see frontend/src/lib/cart.tsx).

Same "reference something that can disappear" shape as user_merchants
(db/users.py): item_id is a plain BIGINT, not a foreign key to items —
items get hard-deleted by maintenance/prune.py, so a saved reference
has to survive its target vanishing. Resolving one back to a name/price
goes through db.get_item(), the same lookup GET /deals/{id}/history
already uses, and treats "gone" (None) as an ordinary case, not an
error — nothing here is soft-deleted or flagged, it's just re-checked
every time it's read.
"""

import logging

from .connection import get_conn, get_cursor
from .guard import graceful_write
from .queries import get_item

logger = logging.getLogger("flippwatch.db.cart")

_DDL = """
CREATE TABLE IF NOT EXISTS user_cart_items (
    user_id       INT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
    query         TEXT NOT NULL,
    label         TEXT NOT NULL,
    item_id       BIGINT,
    merchant_id   BIGINT,
    merchant_name TEXT,
    price         NUMERIC(8,2),
    image         TEXT,
    added_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, query)
);

CREATE TABLE IF NOT EXISTS saved_plans (
    id          SERIAL PRIMARY KEY,
    user_id     INT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
    name        TEXT,
    mode        TEXT NOT NULL,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS saved_plan_items (
    saved_plan_id INT NOT NULL REFERENCES saved_plans(id) ON DELETE CASCADE,
    query         TEXT NOT NULL,
    item_id       BIGINT NOT NULL,
    PRIMARY KEY (saved_plan_id, query)
);
"""


def ensure_cart_tables() -> None:
    """Idempotent — called once at app startup, alongside ensure_user_tables()."""
    with get_cursor() as cur:
        cur.execute(_DDL)


# ── Cart ──────────────────────────────────────────────────────────────

def _serialize_cart_row(row: dict) -> dict:
    """added_at comes back as a psycopg2 datetime — the frontend's
    CartEntry.addedAt is a plain JS ms-epoch number everywhere else, so
    convert here rather than pushing that conversion onto every caller."""
    return {**row, "price": float(row["price"]) if row["price"] is not None else None,
            "added_at": row["added_at"].timestamp() * 1000}


def get_cart(user_id: int) -> list[dict]:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT query, label, item_id, merchant_id, merchant_name, price, image, added_at
            FROM user_cart_items
            WHERE user_id = %(user_id)s
            ORDER BY added_at
            """,
            {"user_id": user_id},
        )
        return [_serialize_cart_row(row) for row in cur.fetchall()]


@graceful_write
def replace_cart(user_id: int, items: list[dict]) -> list[dict]:
    """Whole-list replace — mirrors update_user's merchants-replace shape
    (db/users.py) exactly: delete everything for this user, reinsert
    what was given, one transaction. Last write wins across devices/tabs
    by construction — there's nothing to merge, the newest PUT simply
    becomes the truth."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM user_cart_items WHERE user_id = %(user_id)s", {"user_id": user_id})
            for item in items:
                cur.execute(
                    """
                    INSERT INTO user_cart_items
                        (user_id, query, label, item_id, merchant_id, merchant_name, price, image, added_at)
                    VALUES
                        (%(user_id)s, %(query)s, %(label)s, %(item_id)s, %(merchant_id)s,
                         %(merchant_name)s, %(price)s, %(image)s, to_timestamp(%(added_at)s / 1000.0))
                    ON CONFLICT (user_id, query) DO NOTHING
                    """,
                    {"user_id": user_id, **item},
                )
    return get_cart(user_id)


# ── Saved trip plans ─────────────────────────────────────────────────

def _assemble_plan(plan_row: dict, item_rows: list[dict]) -> dict:
    """Turn (plan header, [(query, item_id), ...]) into the receipt shape
    the frontend's SavedPlan already expects — grouped by store, priced
    from whatever's still resolvable right now via get_item(). Anything
    that no longer resolves is silently left out (same convention
    /optimize's own pool-building already uses for a missing item_id) —
    the total is just smaller, no error, no flag."""
    by_store: dict[int, dict] = {}
    queries: list[str] = []
    picks: dict[str, int] = {}
    for row in item_rows:
        queries.append(row["query"])
        picks[row["query"]] = row["item_id"]
        item = get_item(row["item_id"])
        if item is None:
            continue
        store = by_store.setdefault(
            item["merchant_id"],
            {"merchant_id": item["merchant_id"], "merchant_name": item["merchant_name"], "subtotal": 0, "items": []},
        )
        store["items"].append(
            {"query": row["query"], "item_id": item["id"], "name": item["name"], "price": float(item["price"])}
        )
        store["subtotal"] = round(store["subtotal"] + float(item["price"]), 2)

    plans = sorted(by_store.values(), key=lambda p: p["subtotal"], reverse=True)
    item_count = sum(len(p["items"]) for p in plans)
    return {
        "id": plan_row["id"],
        "name": plan_row["name"],
        "updated_at": plan_row["updated_at"].timestamp() * 1000,
        "mode": plan_row["mode"],
        "queries": queries,
        "picks": picks,
        "total_cost": round(sum(p["subtotal"] for p in plans), 2),
        "stops": len(plans),
        "item_count": item_count,
        "plans": plans,
    }


def list_saved_plans(user_id: int) -> list[dict]:
    with get_cursor() as cur:
        cur.execute(
            "SELECT id, name, mode, updated_at FROM saved_plans WHERE user_id = %(user_id)s ORDER BY updated_at DESC",
            {"user_id": user_id},
        )
        plan_rows = cur.fetchall()
        result = []
        for plan_row in plan_rows:
            cur.execute(
                "SELECT query, item_id FROM saved_plan_items WHERE saved_plan_id = %(id)s",
                {"id": plan_row["id"]},
            )
            result.append(_assemble_plan(plan_row, cur.fetchall()))
        return result


@graceful_write
def create_saved_plan(user_id: int, name: str | None, mode: str, items: list[dict]) -> dict:
    """items: [{"query": str, "item_id": int}, ...] — one row per grocery-
    list term and the item it was priced against when saved."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO saved_plans (user_id, name, mode) VALUES (%(user_id)s, %(name)s, %(mode)s) RETURNING id",
                {"user_id": user_id, "name": name, "mode": mode},
            )
            plan_id = cur.fetchone()[0]
            for item in items:
                cur.execute(
                    """
                    INSERT INTO saved_plan_items (saved_plan_id, query, item_id)
                    VALUES (%(plan_id)s, %(query)s, %(item_id)s)
                    ON CONFLICT (saved_plan_id, query) DO NOTHING
                    """,
                    {"plan_id": plan_id, "query": item["query"], "item_id": item["item_id"]},
                )

    with get_cursor() as cur:
        cur.execute(
            "SELECT id, name, mode, updated_at FROM saved_plans WHERE id = %(id)s",
            {"id": plan_id},
        )
        plan_row = cur.fetchone()
        cur.execute(
            "SELECT query, item_id FROM saved_plan_items WHERE saved_plan_id = %(id)s",
            {"id": plan_id},
        )
        return _assemble_plan(plan_row, cur.fetchall())


@graceful_write
def delete_saved_plan(user_id: int, plan_id: int) -> bool:
    """True if a plan owned by this user was deleted; False if it didn't
    exist or belonged to someone else — the AND user_id is the ownership
    check, without it one account could delete another's plan by
    guessing an id."""
    with get_cursor() as cur:
        cur.execute(
            "DELETE FROM saved_plans WHERE id = %(id)s AND user_id = %(user_id)s",
            {"id": plan_id, "user_id": user_id},
        )
        return cur.rowcount > 0
