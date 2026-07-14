"""Re-exports everything — import from here, not the submodules directly.

Module boundaries (locked, see HANDOFF.md):
    connection.py   get_conn / get_cursor only
    items.py        item classification writes (+ classifier cache writes) —
                     item/price_history/merchant/flyer writes live in
                     scraper-go now, not here
    queries.py      all reads
"""

from .connection import get_conn, get_cursor
from .items import apply_classifications, upsert_item_embedding
from .queries import (
    facet_counts,
    get_item,
    get_price_history,
    list_categories,
    list_merchants,
    search_items,
    unclassified_items,
)
from .guard import clear_storage_error, storage_status
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
    "apply_classifications",
    "unclassified_items",
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