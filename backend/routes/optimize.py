"""POST /optimize. Fetches current active deals via db.queries, then
hands them to the pure optimizer.algorithm functions — no optimizer
logic lives here.
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

import db
from config import Config
from optimizer import optimize
from textutils import normalize_postal

router = APIRouter(tags=["optimize"])


class OptimizeRequest(BaseModel):
    grocery_list: list[str]
    mode: str = "cheapest"  # "cheapest" | "fewest"
    # The user's chosen stores — when set, plans only ever route to these.
    merchant_ids: list[int] | None = None
    # The user's region — when set, plans only draw on that region's data.
    postal_code: str | None = None


@router.post("/optimize")
def run_optimizer(body: OptimizeRequest):
    # Same default-to-example-data rule as GET /deals: with no explicit
    # scope, plan against the config-default region + merchants rather
    # than silently drawing on every merchant/region ever scraped. A
    # signed-in user's own postal code + stores always win when provided.
    merchant_ids = body.merchant_ids or sorted(Config.DEFAULT_MERCHANTS)
    postal_code = normalize_postal(body.postal_code) or Config.DEFAULT_POSTAL_CODE

    # Build the deal pool per query via the SQL search (word-boundary +
    # plural + brand matching) rather than one flat "500 cheapest deals"
    # slice — that slice silently dropped anything over ~$3, so real
    # milk/meat never even reached the matcher.
    pool: dict[int, dict] = {}
    queries = [q.strip() for q in body.grocery_list if q.strip()]
    for q in queries:
        for row in db.search_items(
            q=q, status="active", merchant_ids=merchant_ids, postal_code=postal_code, limit=100,
        ):
            pool[row["item_id"]] = row
    deals = list(pool.values())

    # Classifying each query lets the matcher prefer same-department deals
    # ("milk" → dairy eggs, so "Catch Milk Chocolate" stops matching), but
    # the classifier is too slow for the request cycle right now — it only
    # runs when CLASSIFIER_ENABLED=true (see config.py). Until it moves to
    # a background/batch job, matching is word-based only.
    query_categories: dict[str, str] = {}
    if Config.CLASSIFIER_ENABLED:
        from classifier import classify_item  # deferred: heavy model load

        for q in queries:
            _, department = classify_item(q)
            if department != "other":
                query_categories[q] = department

    try:
        result = optimize(
            body.grocery_list, deals, mode=body.mode, query_categories=query_categories,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    return {
        "mode": result.mode,
        "total_cost": result.total_cost,
        "stops": result.stops,
        "unmatched": result.unmatched,
        "store_plans": [
            {
                "merchant_id": sp.merchant_id,
                "merchant_name": sp.merchant_name,
                "subtotal": sp.subtotal,
                "items": [
                    {"query": i.query, "item_id": i.item_id, "name": i.name, "price": i.price}
                    for i in sp.items
                ],
            }
            for sp in result.store_plans
        ],
        "options": {
            query: [
                {
                    "item_id": r.item_id,
                    "name": r.name,
                    "merchant_id": r.merchant_id,
                    "merchant_name": r.merchant_name,
                    "price": r.price,
                    "size": r.size,
                    "size_unit": r.size_unit,
                    "product_image": r.product_image,
                }
                for r in rows
            ]
            for query, rows in result.options.items()
        },
    }
