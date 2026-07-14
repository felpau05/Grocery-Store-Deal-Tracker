"""Writes for item classification + the classifier cache. Item/
price_history writes themselves now live in scraper-go (see the
scraper-go repo's db.go) — scraping moved out of this process; this
module keeps only what's still written from Python.

Reads live in queries.py — nothing in this file does a SELECT for the
caller.
"""

import logging

from .connection import get_cursor
from .guard import graceful_write

logger = logging.getLogger("flippwatch.db.items")


@graceful_write
def apply_classifications(updates: list[tuple[int, str, str]]) -> None:
    """Batch-write (aisle, department) classifier results back onto
    `items` by id. One statement for the whole batch, same batching
    principle as scraper-go's item upsert — updates is
    [(item_id, subcategory, category), ...]."""
    if not updates:
        return
    with get_cursor() as cur:
        cur.execute(
            """
            UPDATE items SET subcategory = v.subcategory, category = v.category
            FROM (SELECT * FROM UNNEST(%s::bigint[], %s::text[], %s::text[]) AS t(id, subcategory, category)) v
            WHERE items.id = v.id
            """,
            (
                [u[0] for u in updates],
                [u[1] for u in updates],
                [u[2] for u in updates],
            ),
        )


@graceful_write
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