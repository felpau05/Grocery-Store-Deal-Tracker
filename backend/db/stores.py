"""Writes for merchants + flyers only. Reads live in queries.py."""

import logging

from models import Merchant

from .connection import get_cursor

logger = logging.getLogger("flippwatch.db.stores")


def upsert_merchant(merchant: Merchant) -> None:
    """Insert a merchant, or refresh its name if it already exists.

    merchant.id is used directly as the primary key — every Item
    already carries this id, so no name lookup is ever needed.
    """
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO merchants (id, name)
            VALUES (%(id)s, %(name)s)
            ON CONFLICT (id) DO UPDATE SET
                name = EXCLUDED.name
            """,
            {"id": merchant.id, "name": merchant.name},
        )
    logger.debug("Upserted merchant %s (%s)", merchant.id, merchant.name)


def upsert_flyer(flyer_id: int, merchant_id: int, valid_from: str | None, valid_to: str | None) -> None:
    """Insert a flyer, or refresh its validity window on re-scrape."""
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO flyers (id, merchant_id, valid_from, valid_to, scraped_at)
            VALUES (%(id)s, %(merchant_id)s, %(valid_from)s, %(valid_to)s, now())
            ON CONFLICT (id) DO UPDATE SET
                valid_from = EXCLUDED.valid_from,
                valid_to = EXCLUDED.valid_to,
                scraped_at = now()
            """,
            {
                "id": flyer_id,
                "merchant_id": merchant_id,
                "valid_from": valid_from,
                "valid_to": valid_to,
            },
        )
    logger.debug("Upserted flyer %s (merchant %s)", flyer_id, merchant_id)