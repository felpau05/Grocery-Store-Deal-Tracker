"""GET /deals, GET /deals/{id}/history, GET /categories.
Thin wrappers around db.queries — no business logic lives here.
"""

from datetime import date, datetime
from decimal import Decimal

from fastapi import APIRouter, HTTPException, Query

import db

router = APIRouter(tags=["deals"])


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
    status: str = Query(default="active", pattern="^(active|upcoming|all)$"),
    sort: str = Query(default="price", pattern="^(price|price_per_unit)$"),
    sort_dir: str = Query(default="asc", pattern="^(asc|desc)$"),
    price_units: list[str] | None = Query(default=None),
    limit: int = Query(default=24, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
):
    valid_units = {"g", "ml", "each"}
    filtered_units = [u for u in (price_units or []) if u in valid_units] or None
    rows = db.search_items(
        q=q, category=category, subcategory=subcategory, merchant_id=merchant_id,
        status=status, sort=sort, sort_dir=sort_dir,
        price_units=filtered_units, limit=limit, offset=offset,
    )
    return [_serialize_deal(row) for row in rows]


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
def categories():
    return db.list_categories()


@router.get("/merchants")
def merchants():
    """Merchants that currently have at least one item — backs the deals
    page merchant filter."""
    return db.list_merchants()