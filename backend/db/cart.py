"""Reads + writes for a signed-in account's trips (named grocery lists,
stored in saved_plans) and the legacy single cart they replaced.
Anonymous visitors never reach these — the frontend keeps local-only
trips for them (see frontend/src/lib/trips.tsx).

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

-- Saved plans became editable trips: a trip is a list first, priced
-- second. item_id is now "the pick" — null until the trip is built —
-- and the rest is the same "where it was added from" record a cart row
-- carries (source_item_id is the deal it was added from, not the pick).
ALTER TABLE saved_plan_items ALTER COLUMN item_id DROP NOT NULL;
ALTER TABLE saved_plan_items ADD COLUMN IF NOT EXISTS label TEXT;
ALTER TABLE saved_plan_items ADD COLUMN IF NOT EXISTS source_item_id BIGINT;
ALTER TABLE saved_plan_items ADD COLUMN IF NOT EXISTS merchant_id BIGINT;
ALTER TABLE saved_plan_items ADD COLUMN IF NOT EXISTS merchant_name TEXT;
ALTER TABLE saved_plan_items ADD COLUMN IF NOT EXISTS price NUMERIC(8,2);
ALTER TABLE saved_plan_items ADD COLUMN IF NOT EXISTS image TEXT;
ALTER TABLE saved_plan_items ADD COLUMN IF NOT EXISTS added_at TIMESTAMPTZ NOT NULL DEFAULT now();
"""


def ensure_cart_tables() -> None:
    """Idempotent — called once at app startup, alongside ensure_user_tables()."""
    with get_cursor() as cur:
        cur.execute(_DDL)
    _migrate_carts_to_trips()


def _migrate_carts_to_trips() -> None:
    """One-time: every account's old single cart becomes a trip named
    "My list". Idempotent because the cart rows are deleted in the same
    transaction — a second run finds nothing to move."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT DISTINCT user_id FROM user_cart_items")
            user_ids = [row[0] for row in cur.fetchall()]
            for user_id in user_ids:
                cur.execute(
                    """
                    INSERT INTO saved_plans (user_id, name, mode, updated_at)
                    VALUES (%(user_id)s, 'My list', 'cheapest', now()) RETURNING id
                    """,
                    {"user_id": user_id},
                )
                plan_id = cur.fetchone()[0]
                cur.execute(
                    """
                    INSERT INTO saved_plan_items
                        (saved_plan_id, query, label, item_id, source_item_id,
                         merchant_id, merchant_name, price, image, added_at)
                    SELECT %(plan_id)s, query, label, NULL, item_id,
                           merchant_id, merchant_name, price, image, added_at
                    FROM user_cart_items WHERE user_id = %(user_id)s
                    ON CONFLICT (saved_plan_id, query) DO NOTHING
                    """,
                    {"plan_id": plan_id, "user_id": user_id},
                )
                cur.execute("DELETE FROM user_cart_items WHERE user_id = %(user_id)s", {"user_id": user_id})
    if user_ids:
        logger.info("Moved %d account cart(s) into trips", len(user_ids))


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


# ── Trips (saved_plans) ──────────────────────────────────────────────
#
# A trip is a named list: each row is one grocery-list term, where it
# was added from (optional), and the item it's currently priced against
# (item_id, the "pick" — null until the trip has been built).

_ITEM_COLUMNS = "query, label, item_id, source_item_id, merchant_id, merchant_name, price, image, added_at"


def _serialize_item_row(row: dict) -> dict:
    return {
        "query": row["query"],
        "label": row["label"] or row["query"],
        "item_id": row["item_id"],
        "source_item_id": row["source_item_id"],
        "merchant_id": row["merchant_id"],
        "merchant_name": row["merchant_name"],
        "price": float(row["price"]) if row["price"] is not None else None,
        "image": row["image"],
        "added_at": row["added_at"].timestamp() * 1000,
    }


def _assemble_plan(plan_row: dict, item_rows: list[dict]) -> dict:
    """Turn (trip header, item rows) into the shape the frontend's Trip
    expects — the full item list, plus receipts grouped by store and
    priced from whatever's still resolvable right now via get_item().
    Only rows with a pick are priced; anything whose pick no longer
    resolves is silently left out of the receipts (same convention
    /optimize's own pool-building already uses for a missing item_id) —
    the total is just smaller, no error, no flag."""
    by_store: dict[int, dict] = {}
    queries: list[str] = []
    picks: dict[str, int] = {}
    for row in item_rows:
        queries.append(row["query"])
        if row["item_id"] is None:
            continue
        picks[row["query"]] = row["item_id"]
        item = get_item(row["item_id"])
        if item is None:
            continue
        store = by_store.setdefault(
            item["merchant_id"],
            {"merchant_id": item["merchant_id"], "merchant_name": item["merchant_name"], "subtotal": 0, "items": []},
        )
        store["items"].append(
            {
                "query": row["query"],
                "item_id": item["id"],
                "name": item["name"],
                "price": float(item["price"]),
                "product_image": item["product_image"],
                "size": float(item["size"]) if item["size"] is not None else None,
                "size_unit": item["size_unit"],
            }
        )
        store["subtotal"] = round(store["subtotal"] + float(item["price"]), 2)

    plans = sorted(by_store.values(), key=lambda p: p["subtotal"], reverse=True)
    return {
        "id": plan_row["id"],
        "name": plan_row["name"],
        "updated_at": plan_row["updated_at"].timestamp() * 1000,
        "mode": plan_row["mode"],
        "items": [_serialize_item_row(row) for row in item_rows],
        "queries": queries,
        "picks": picks,
        "total_cost": round(sum(p["subtotal"] for p in plans), 2),
        "stops": len(plans),
        "item_count": len(item_rows),
        "plans": plans,
    }


def _fetch_items(cur, plan_id: int) -> list[dict]:
    cur.execute(
        f"SELECT {_ITEM_COLUMNS} FROM saved_plan_items WHERE saved_plan_id = %(id)s ORDER BY added_at, query",
        {"id": plan_id},
    )
    return cur.fetchall()


def _get_saved_plan(user_id: int, plan_id: int) -> dict | None:
    with get_cursor() as cur:
        cur.execute(
            "SELECT id, name, mode, updated_at FROM saved_plans WHERE id = %(id)s AND user_id = %(user_id)s",
            {"id": plan_id, "user_id": user_id},
        )
        plan_row = cur.fetchone()
        if plan_row is None:
            return None
        return _assemble_plan(plan_row, _fetch_items(cur, plan_id))


def list_saved_plans(user_id: int) -> list[dict]:
    with get_cursor() as cur:
        cur.execute(
            "SELECT id, name, mode, updated_at FROM saved_plans WHERE user_id = %(user_id)s ORDER BY updated_at DESC",
            {"user_id": user_id},
        )
        plan_rows = cur.fetchall()
        return [_assemble_plan(plan_row, _fetch_items(cur, plan_row["id"])) for plan_row in plan_rows]


def _insert_items(cur, plan_id: int, items: list[dict]) -> None:
    for item in items:
        cur.execute(
            """
            INSERT INTO saved_plan_items
                (saved_plan_id, query, label, item_id, source_item_id,
                 merchant_id, merchant_name, price, image, added_at)
            VALUES
                (%(plan_id)s, %(query)s, %(label)s, %(item_id)s, %(source_item_id)s,
                 %(merchant_id)s, %(merchant_name)s, %(price)s, %(image)s,
                 COALESCE(to_timestamp(%(added_at)s / 1000.0), now()))
            ON CONFLICT (saved_plan_id, query) DO NOTHING
            """,
            {
                "plan_id": plan_id,
                "query": item["query"],
                "label": item.get("label"),
                "item_id": item.get("item_id"),
                "source_item_id": item.get("source_item_id"),
                "merchant_id": item.get("merchant_id"),
                "merchant_name": item.get("merchant_name"),
                "price": item.get("price"),
                "image": item.get("image"),
                "added_at": item.get("added_at"),
            },
        )


@graceful_write
def create_saved_plan(user_id: int, name: str | None, mode: str, items: list[dict]) -> dict:
    """items: [{"query": str, "label"?: str, "item_id"?: int, ...}, ...] —
    one row per grocery-list term. May be empty: a new trip starts blank."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO saved_plans (user_id, name, mode) VALUES (%(user_id)s, %(name)s, %(mode)s) RETURNING id",
                {"user_id": user_id, "name": name, "mode": mode},
            )
            plan_id = cur.fetchone()[0]
            _insert_items(cur, plan_id, items)
    return _get_saved_plan(user_id, plan_id)


@graceful_write
def update_saved_plan(user_id: int, plan_id: int, fields: dict) -> dict | None:
    """fields: any of {"name", "mode"} — only the keys present are changed.
    None if the trip doesn't exist or belongs to someone else."""
    sets = [f"{key} = %({key})s" for key in ("name", "mode") if key in fields]
    with get_cursor() as cur:
        cur.execute(
            f"UPDATE saved_plans SET {', '.join([*sets, 'updated_at = now()'])} "
            "WHERE id = %(id)s AND user_id = %(user_id)s",
            {**fields, "id": plan_id, "user_id": user_id},
        )
        if cur.rowcount == 0:
            return None
    return _get_saved_plan(user_id, plan_id)


@graceful_write
def replace_saved_plan_items(user_id: int, plan_id: int, items: list[dict]) -> dict | None:
    """Whole-list replace, same shape as replace_cart: delete this trip's
    rows, reinsert what was given, one transaction — last write wins.
    The ownership check runs first, inside the same transaction, so one
    account can't write into another's trip by guessing an id."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE saved_plans SET updated_at = now() WHERE id = %(id)s AND user_id = %(user_id)s",
                {"id": plan_id, "user_id": user_id},
            )
            if cur.rowcount == 0:
                return None
            cur.execute("DELETE FROM saved_plan_items WHERE saved_plan_id = %(id)s", {"id": plan_id})
            _insert_items(cur, plan_id, items)
    return _get_saved_plan(user_id, plan_id)


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
