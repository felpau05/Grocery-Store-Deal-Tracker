"""GET /deals, GET /deals/{id}/history, GET /categories.
Thin wrappers around db.queries — no business logic lives here.
"""

from datetime import date, datetime
from decimal import Decimal

from fastapi import APIRouter, HTTPException, Query

import db
from config import Config
from textutils import normalize_postal

router = APIRouter(tags=["deals"])


def _effective_scope(
    postal_code: str | None,
    merchant_id: int | None,
    merchant_ids: list[int] | None,
) -> tuple[str, int | None, list[int] | None]:
    """Resolve (region, single-store, store-scope) for a deals request.

    The scoping contract, identical across every deals endpoint:
      - No postal code given  → the example-data region (DEFAULT_POSTAL_CODE).
      - No store scope given   → the example-data merchants (DEFAULT_MERCHANTS).
    A signed-in frontend always sends the account's own postal code +
    stores, so those win; only the truly anonymous case hits the
    defaults. A single `merchant_id` pill is passed through untouched
    and is ANDed with the scope downstream.
    """
    postal = normalize_postal(postal_code) or Config.DEFAULT_POSTAL_CODE
    if not merchant_ids and not merchant_id:
        merchant_ids = sorted(Config.DEFAULT_MERCHANTS)
    return postal, merchant_id, merchant_ids


def _to_float(value) -> float | None:
    return float(value) if isinstance(value, Decimal) else value


def _price_per_unit(
    price: Decimal,
    price_unit: str,
    price_unit_factor: Decimal,
    size: Decimal | None = None,
    size_unit: str | None = None,
) -> tuple[float, str] | None:
    """Normalized per-unit price for display, e.g. ($13.22, "kg").

    Mirrors Item.price_per_unit in the Python model exactly:
      1. Flyer quoted a per-weight/volume price (price_unit != 'each'):
         multiply by price_unit_factor to get $/canonical unit.
      2. Priced per item but we know the package size:
         divide price by size to get $/canonical unit.
      3. No size info: can't normalise, return None.
    """
    if price_unit != "each":
        per_canonical = float(price) * float(price_unit_factor)
        if price_unit == "g":
            return round(per_canonical * 1000, 2), "kg"
        if price_unit == "ml":
            return round(per_canonical * 1000, 2), "L"

    if size and float(size) > 0 and size_unit:
        per_canonical = float(price) / float(size)
        if size_unit == "g":
            return round(per_canonical * 1000, 2), "kg"
        if size_unit == "ml":
            return round(per_canonical * 1000, 2), "L"

    return None


def _serialize_deal(row: dict) -> dict:
    price_per_unit = _price_per_unit(
        row["price"], row["price_unit"], row["price_unit_factor"],
        row.get("size"), row.get("size_unit"),
    )
    return {
        "item_id": row["item_id"],
        "name": row["name"],
        "brands": row["brands"] or [],
        "category": row["category"],
        "subcategory": row["subcategory"],
        "price": _to_float(row["price"]),
        "price_unit": row["price_unit"],
        "price_per_unit": price_per_unit[0] if price_per_unit else None,
        "price_per_unit_label": price_per_unit[1] if price_per_unit else None,
        "size": _to_float(row["size"]),
        "size_unit": row["size_unit"],
        "product_image": row["product_image"],
        "high_confidence": row["high_confidence"],
        "valid_from": row["valid_from"],
        "valid_to": row["valid_to"],
        "merchant_id": row["merchant_id"],
        "merchant_name": row["merchant_name"],
    }


@router.get("/deals")
def list_deals(
    q: str | None = Query(default=None, description="Keyword search on item name"),
    category: str | None = None,
    subcategory: str | None = None,
    merchant_id: int | None = None,
    merchant_ids: list[int] | None = Query(default=None, description="Restrict to these stores (a user's selection)"),
    postal_code: str | None = Query(default=None, description="Region scope; defaults to the example area"),
    status: str = Query(default="active", pattern="^(active|upcoming|all)$"),
    sort: str = Query(default="price", pattern="^(price|price_per_unit)$"),
    sort_dir: str = Query(default="asc", pattern="^(asc|desc)$"),
    price_units: list[str] | None = Query(default=None),
    expires_within_days: int | None = Query(default=None, ge=0, le=30),
    price_min: float | None = Query(default=None, ge=0),
    price_max: float | None = Query(default=None, ge=0),
    limit: int = Query(default=24, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
):
    valid_units = {"g", "ml", "each"}
    filtered_units = [u for u in (price_units or []) if u in valid_units] or None
    postal, merchant_id, merchant_ids = _effective_scope(postal_code, merchant_id, merchant_ids)

    rows = db.search_items(
        q=q, category=category, subcategory=subcategory, merchant_id=merchant_id,
        merchant_ids=merchant_ids, postal_code=postal,
        status=status, sort=sort, sort_dir=sort_dir,
        price_units=filtered_units,
        expires_within_days=expires_within_days,
        price_min=price_min, price_max=price_max,
        limit=limit, offset=offset,
    )
    return [_serialize_deal(row) for row in rows]


@router.get("/deals/facets")
def deal_facets(
    q: str | None = Query(default=None),
    category: str | None = None,
    merchant_id: int | None = None,
    merchant_ids: list[int] | None = Query(default=None),
    postal_code: str | None = Query(default=None),
    status: str = Query(default="active", pattern="^(active|upcoming|all)$"),
    price_units: list[str] | None = Query(default=None),
    expires_within_days: int | None = Query(default=None, ge=0, le=30),
    price_min: float | None = Query(default=None, ge=0),
    price_max: float | None = Query(default=None, ge=0),
):
    """Item counts for the category/store pills, plus the exact total
    matching every current filter (so the grid can page precisely
    instead of guessing from a single page's length). Same region +
    default-merchant scope as GET /deals — an anonymous/no-scope request
    is scoped to the example area, not the whole table."""
    valid_units = {"g", "ml", "each"}
    filtered_units = [u for u in (price_units or []) if u in valid_units] or None
    postal, merchant_id, merchant_ids = _effective_scope(postal_code, merchant_id, merchant_ids)

    result = db.facet_counts(
        q=q, category=category, merchant_id=merchant_id, merchant_ids=merchant_ids,
        postal_code=postal,
        status=status, price_units=filtered_units,
        expires_within_days=expires_within_days,
        price_min=price_min, price_max=price_max,
    )
    return {
        "total": result["total"],
        "categories": [{"name": k, "count": v} for k, v in result["categories"].items()],
        "merchants": [{"id": k, "count": v} for k, v in result["merchants"].items()],
    }


@router.get("/deals/{item_id}/history")
def deal_history(item_id: int, days: int = Query(default=30, ge=1, le=365)):
    item = db.get_item(item_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Item not found")

    history_rows = db.get_price_history(item_id, days=days)

    price_per_unit = _price_per_unit(
        item["price"], item["price_unit"], item["price_unit_factor"],
        item.get("size"), item.get("size_unit"),
    )
    return {
        "item": {
            "id": item["id"],
            "name": item["name"],
            "brands": item["brands"] or [],
            "category": item["category"],
            "merchant_id": item["merchant_id"],
            "merchant_name": item["merchant_name"],
            "price": _to_float(item["price"]),
            "price_unit": item["price_unit"],
            "price_per_unit": price_per_unit[0] if price_per_unit else None,
            "price_per_unit_label": price_per_unit[1] if price_per_unit else None,
            "size": _to_float(item["size"]),
            "size_unit": item["size_unit"],
            "product_image": item.get("product_image"),
            "cutout_image": item.get("cutout_image"),
            "valid_from": item["valid_from"],
            "valid_to": item["valid_to"],
            "high_confidence": item["high_confidence"],
            "original_name": item.get("original_name"),
            "original_description": item.get("original_description"),
        },
        "history": [
            {"price": _to_float(row["price"]), "scraped_at": row["scraped_at"]}
            for row in history_rows
        ],
    }


@router.get("/categories")
def categories(
    merchant_id: int | None = None,
    merchant_ids: list[int] | None = Query(default=None),
    postal_code: str | None = Query(default=None),
):
    """Categories present in the caller's region + store scope — never the
    whole database. Anonymous/no-scope requests fall back to the
    example-data region and merchants, matching GET /deals."""
    postal, merchant_id, merchant_ids = _effective_scope(postal_code, merchant_id, merchant_ids)
    scope = [merchant_id] if merchant_id else merchant_ids
    return db.list_categories(scope, postal_code=postal)


@router.get("/merchants")
def merchants(
    merchant_id: int | None = None,
    merchant_ids: list[int] | None = Query(default=None),
    postal_code: str | None = Query(default=None),
):
    """Merchants with at least one item in the caller's region + store
    scope — backs the deals page's anonymous/example-data store pills.
    Signed-in users with their own stores selected don't need this
    endpoint (their pill list comes from their saved selection)."""
    postal, merchant_id, merchant_ids = _effective_scope(postal_code, merchant_id, merchant_ids)
    scope = [merchant_id] if merchant_id else merchant_ids
    return db.list_merchants(scope, postal_code=postal)