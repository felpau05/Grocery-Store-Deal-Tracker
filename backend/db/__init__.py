"""Re-exports everything — import from here, not the submodules directly.

Module boundaries (locked, see HANDOFF.md):
    connection.py   get_conn / get_cursor only
    items.py        item classification writes (+ classifier cache writes) —
                     item/price_history/merchant/flyer writes live in
                     scraper-go now, not here
    queries.py      all reads
"""

from .cart import (
    create_saved_plan,
    delete_saved_plan,
    ensure_cart_tables,
    get_cart,
    list_saved_plans,
    replace_cart,
    replace_saved_plan_items,
    update_saved_plan,
)
from .connection import get_conn, get_cursor
from .items import apply_classifications, upsert_item_embedding
from .queries import (
    best_deals,
    facet_counts,
    get_item,
    get_price_history,
    get_product_history,
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
    saved_scrape_regions,
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
    "best_deals",
    "get_item",
    "get_price_history",
    "get_product_history",
    "list_categories",
    "list_merchants",
    "ensure_user_tables",
    "get_user",
    "get_user_by_email",
    "get_user_by_google_sub",
    "link_google_sub",
    "create_user",
    "update_user",
    "saved_scrape_regions",
    "storage_status",
    "clear_storage_error",
    "ensure_cart_tables",
    "get_cart",
    "replace_cart",
    "list_saved_plans",
    "create_saved_plan",
    "delete_saved_plan",
    "update_saved_plan",
    "replace_saved_plan_items",
]