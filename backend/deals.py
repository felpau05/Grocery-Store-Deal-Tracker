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


def _price_per_unit(price: Decimal, price_unit: str, price_unit_factor: Decimal) -> tuple[float, str] | None:
    """Normalized per-unit price for display, e.g. ($13.22, "kg").

    item.price is the RAW stated price (e.g. $8.99 for a "/lb" item) —
    NOT already per-gram just because price_unit is "g". price_unit
    only names the canonical unit the factor resolves to; you have to
    multiply by price_unit_factor to get a true per-unit price. "each"
    needs no conversion since the raw price already is the per-item price.
    """
    if price_unit == "each":
        return None
    per_canonical = float(price) * float(price_unit_factor)
    if price_unit == "g":
        return round(per_canonical * 1000, 2), "kg"
    if price_unit == "ml":
        return round(per_canonical * 1000, 2), "L"
    return None


def _serialize_deal(row: dict) -> dict:
    price_per_unit = _price_per_unit(row["price"], row["price_unit"], row["price_unit_factor"])
    return {
        "item_id": row["item_id"],
        "name": row["name"],
        "brands": row["brands"] or [],
        "category": row["category"],
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
    merchant_id: int | None = None,
    status: str = Query(default="active", pattern="^(active|upcoming|all)$"),
    limit: int = Query(default=50, ge=1, le=200),
):
    rows = db.search_items(q=q, category=category, merchant_id=merchant_id, status=status, limit=limit)
    return [_serialize_deal(row) for row in rows]


@router.get("/deals/{item_id}/history")
def deal_history(item_id: int, days: int = Query(default=30, ge=1, le=365)):
    item = db.get_item(item_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Item not found")

    history_rows = db.get_price_history(item_id, days=days)

    return {
        "item": {
            "id": item["id"],
            "name": item["name"],
            "merchant_id": item["merchant_id"],
            "price": _to_float(item["price"]),
            "price_unit": item["price_unit"],
            "size": _to_float(item["size"]),
            "size_unit": item["size_unit"],
        },
        "history": [
            {"price": _to_float(row["price"]), "scraped_at": row["scraped_at"]}
            for row in history_rows
        ],
    }


@router.get("/categories")
def categories():
    return db.list_categories()