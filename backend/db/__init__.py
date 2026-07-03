"""Re-exports everything — import from here, not the submodules directly.

Module boundaries (locked, see HANDOFF.md):
    connection.py   get_conn / get_cursor only
    stores.py       writes for stores + flyers
    items.py        writes for items + price_history (+ classifier cache writes)
    queries.py      all reads
"""

from .connection import get_conn, get_cursor
from .items import normalize_name, upsert_item, upsert_item_embedding
from .queries import facet_counts, get_item, get_price_history, list_categories, list_merchants, search_items
from .guard import clear_storage_error, storage_status
from .stores import upsert_flyer, upsert_merchant
from .users import (
    create_user,
    ensure_user_tables,
    get_user,
    get_user_by_email,
    get_user_by_google_sub,
    link_google_sub,
    update_user,
)

__all__ = [
    "get_conn",
    "get_cursor",
    "upsert_merchant",
    "upsert_flyer",
    "upsert_item",
    "normalize_name",
    "upsert_item_embedding",
    "search_items",
    "facet_counts",
    "get_item",
    "get_price_history",
    "list_categories",
    "list_merchants",
    "ensure_user_tables",
    "get_user",
    "get_user_by_email",
    "get_user_by_google_sub",
    "link_google_sub",
    "create_user",
    "update_user",
    "storage_status",
    "clear_storage_error",
]