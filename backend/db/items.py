"""Writes for items + price_history (+ classifier cache writes).
Reads live in queries.py — nothing in this file does a SELECT for the
caller; upsert_item's RETURNING id is plumbing, not a query.
"""

import logging
import re

from models import Item

from .connection import get_cursor

logger = logging.getLogger("flippwatch.db.items")


def normalize_name(name: str) -> str:
    """Lowercase + whitespace-collapse.

    Part of the items dedup key (merchant_id, name_normalized, valid_from)
    — locked, do not change without re-reading HANDOFF.md.
    """
    return re.sub(r"\s+", " ", name.lower()).strip()


def upsert_item(item: Item) -> int:
    """Insert or update one item, then always append a price_history row.

    Returns the item's database id (BIGSERIAL, not Flipp's own item id).

    merchant_id and flyer_id come from item.meta_data — the Merchant/raw
    dict passed through the pipeline — so callers don't have to thread
    them through separately and risk a mismatch.

    price_history is append-only: even when the item row itself is
    unchanged (re-scraping the same flyer before it expires), a new
    price_history row is still inserted. That's what makes the 30-day
    chart show one point per scrape instead of collapsing flat periods.
    """
    name_normalized = normalize_name(item.name)

    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO items (
                merchant_id, flyer_id, flipp_item_id, name, name_normalized,
                original_name, original_description, brands,
                price, price_unit, price_unit_factor,
                size, size_unit, product_image, cutout_image,
                category, subcategory, high_confidence, valid_from, valid_to
            ) VALUES (
                %(merchant_id)s, %(flyer_id)s, %(flipp_item_id)s, %(name)s, %(name_normalized)s,
                %(original_name)s, %(original_description)s, %(brands)s,
                %(price)s, %(price_unit)s, %(price_unit_factor)s,
                %(size)s, %(size_unit)s, %(product_image)s, %(cutout_image)s,
                %(category)s, %(subcategory)s, %(high_confidence)s, %(valid_from)s, %(valid_to)s
            )
            ON CONFLICT (merchant_id, name_normalized, valid_from) DO UPDATE SET
                flyer_id = EXCLUDED.flyer_id,
                flipp_item_id = EXCLUDED.flipp_item_id,
                name = EXCLUDED.name,
                original_name = EXCLUDED.original_name,
                original_description = EXCLUDED.original_description,
                brands = EXCLUDED.brands,
                price = EXCLUDED.price,
                price_unit = EXCLUDED.price_unit,
                price_unit_factor = EXCLUDED.price_unit_factor,
                size = EXCLUDED.size,
                size_unit = EXCLUDED.size_unit,
                product_image = EXCLUDED.product_image,
                cutout_image = EXCLUDED.cutout_image,
                category = EXCLUDED.category,
                subcategory = EXCLUDED.subcategory,
                high_confidence = EXCLUDED.high_confidence,
                valid_to = EXCLUDED.valid_to,
                updated_at = now()
            RETURNING id
            """,
            {
                "merchant_id": item.meta_data.merchant_id,
                "flyer_id": item.meta_data.flyer_id,
                "flipp_item_id": item.meta_data.item_id or None,
                "name": item.name,
                "name_normalized": name_normalized,
                "original_name": item.meta_data.original_name or None,
                "original_description": item.meta_data.original_desc or None,
                "brands": list(item.brands),
                "price": item.price,
                "price_unit": item.price_unit.value,
                "price_unit_factor": item._price_unit_factor,
                "size": item.size,
                "size_unit": item.size_unit.value if item.size_unit else None,
                "product_image": item.product_image or None,
                "cutout_image": item.cutout_image or None,
                "category": item.category or None,
                "subcategory": item.subcategory or None,
                "high_confidence": item.high_confidence,
                "valid_from": item.start_date,
                "valid_to": item.end_date,
            },
        )
        item_id = cur.fetchone()["id"]

        cur.execute(
            "INSERT INTO price_history (item_id, merchant_id, price) VALUES (%s, %s, %s)",
            (item_id, item.meta_data.merchant_id, item.price),
        )

    return item_id


def upsert_item_embedding(
    name_normalized: str, embedding: list[float], category: str, similarity: float
) -> None:
    """Cache a classifier result for a normalized item name.

    Not used yet — classifier/classify.py doesn't exist. Lives here per
    the documented module split (items.py owns writes to both `items`
    and `item_embeddings`; a read-side lookup belongs in queries.py
    once the classifier actually needs one).
    """
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO item_embeddings (name_normalized, embedding, category, similarity)
            VALUES (%s, %s, %s, %s)
            ON CONFLICT (name_normalized) DO UPDATE SET
                embedding = EXCLUDED.embedding,
                category = EXCLUDED.category,
                similarity = EXCLUDED.similarity,
                classified_at = now()
            """,
            (name_normalized, embedding, category, similarity),
        )