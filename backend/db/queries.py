"""All reads: search, history, category listing. No writes in this file
— see db/items.py and db/stores.py for those.
"""

import logging
import re

from .connection import get_cursor

logger = logging.getLogger("flippwatch.db.queries")


def search_items(
    q: str | None = None,
    category: str | None = None,
    subcategory: str | None = None,
    merchant_id: int | None = None,
    status: str = "active",       # "active" | "upcoming" | "all"
    sort: str = "price",          # "price" | "price_per_unit"
    sort_dir: str = "asc",        # "asc" | "desc"
    price_units: list[str] | None = None,  # ["g", "ml", "each"] — None means all
    limit: int = 50,
    offset: int = 0,
) -> list[dict]:
    """Search active_deals by keyword / category / merchant.

    Backs GET /deals. `status="active"` (default) only returns deals
    whose flyer window covers today; "upcoming" returns future-dated
    ones; "all" applies no date filter. `limit`/`offset` page the
    results — the ORDER BY includes item_id as a tiebreaker so paging
    is stable (rows don't shuffle between pages on equal valid_to).
    """
    clauses: list[str] = []
    if sort not in ("price", "price_per_unit"):
        raise ValueError(f"Unknown sort {sort!r}")
    if sort_dir not in ("asc", "desc"):
        raise ValueError(f"Unknown sort_dir {sort_dir!r}")

    # price_per_unit mirrors Item.price_per_unit
    sort_expr = (
        """
        CASE
            WHEN price_unit != 'each' THEN price * price_unit_factor
            WHEN size IS NOT NULL AND size > 0 THEN price / size
            ELSE price
        END
        """
        if sort == "price_per_unit"
        else "price"
    )
    order_by = f"{sort_expr} {sort_dir.upper()}, item_id ASC"

    params: dict = {"limit": limit, "offset": offset}

    if status == "active":
        clauses.append("valid_from <= CURRENT_DATE AND valid_to >= CURRENT_DATE")
    elif status == "upcoming":
        clauses.append("valid_from > CURRENT_DATE")
    elif status != "all":
        raise ValueError(f"Unknown status {status!r} — use 'active', 'upcoming', or 'all'")

    if q:
        # Word-boundary match per token: \m/\M are Postgres word anchors.
        # "beef" won't match "Beefsteak"; "chicken breast" requires both words.
        for i, word in enumerate(q.split()):
            clauses.append(f"name ~* %(qw_{i})s")
            params[f"qw_{i}"] = rf"\m{re.escape(word)}\M"

    if category:
        clauses.append("category = %(category)s")
        params["category"] = category

    if subcategory:
        clauses.append("subcategory = %(subcategory)s")
        params["subcategory"] = subcategory

    if merchant_id:
        clauses.append("merchant_id = %(merchant_id)s")
        params["merchant_id"] = merchant_id

    if price_units:
        placeholders = ", ".join(f"%(pu_{i})s" for i in range(len(price_units)))
        clauses.append(f"price_unit IN ({placeholders})")
        for i, u in enumerate(price_units):
            params[f"pu_{i}"] = u

    where = f"WHERE {' AND '.join(clauses)}" if clauses else ""

    with get_cursor() as cur:
        cur.execute(
            f"""
            SELECT item_id, name, brands, category, subcategory, price, price_unit, price_unit_factor,
                   size, size_unit, product_image, high_confidence,
                   valid_from, valid_to, merchant_id, merchant_name
            FROM active_deals
            {where}
            ORDER BY {order_by}
            LIMIT %(limit)s OFFSET %(offset)s
            """,
            params,
        )
        return cur.fetchall()


def get_item(item_id: int) -> dict | None:
    """Fetch one item + merchant name by id. Backs GET /deals/{id}/history."""
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT i.id, i.name, i.brands, i.category,
                   i.price, i.price_unit, i.price_unit_factor,
                   i.size, i.size_unit,
                   i.product_image, i.cutout_image,
                   i.high_confidence, i.valid_from, i.valid_to,
                   i.original_name, i.original_description,
                   i.merchant_id, m.name AS merchant_name
            FROM items i
            JOIN merchants m ON m.id = i.merchant_id
            WHERE i.id = %(item_id)s
            """,
            {"item_id": item_id},
        )
        return cur.fetchone()


def get_price_history(item_id: int, days: int = 30) -> list[dict]:
    """Price history for one item, oldest first. Backs GET /deals/{id}/history."""
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT price, scraped_at
            FROM price_history
            WHERE item_id = %(item_id)s
              AND scraped_at >= now() - (%(days)s || ' days')::interval
            ORDER BY scraped_at ASC
            """,
            {"item_id": item_id, "days": days},
        )
        return cur.fetchall()


def list_categories() -> list[str]:
    """Distinct non-empty categories currently in use. Backs GET /categories."""
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT DISTINCT category FROM items
            WHERE category IS NOT NULL AND category != ''
            ORDER BY category
            """
        )
        return [row["category"] for row in cur.fetchall()]


def list_merchants() -> list[dict]:
    """Merchants that currently have at least one item, id + name.
    Backs GET /merchants (the deals page merchant filter)."""
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT m.id, m.name
            FROM merchants m
            WHERE EXISTS (SELECT 1 FROM items i WHERE i.merchant_id = m.id)
            ORDER BY m.name
            """
        )
        return cur.fetchall()