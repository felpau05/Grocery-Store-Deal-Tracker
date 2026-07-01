"""Re-exports everything — import from here, not the submodules directly.

Module boundaries (locked, see HANDOFF.md):
    connection.py   get_conn / get_cursor only
    stores.py       writes for stores + flyers
    items.py        writes for items + price_history (+ classifier cache writes)
    queries.py      all reads
"""

from .connection import get_conn, get_cursor
from .items import normalize_name, upsert_item, upsert_item_embedding
from .queries import get_item, get_price_history, list_categories, list_merchants, search_items
from .stores import upsert_flyer, upsert_merchant

__all__ = [
    "get_conn",
    "get_cursor",
    "upsert_merchant",
    "upsert_flyer",
    "upsert_item",
    "normalize_name",
    "upsert_item_embedding",
    "search_items",
    "get_item",
    "get_price_history",
    "list_categories",
    "list_merchants",
]