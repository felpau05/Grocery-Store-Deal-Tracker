"""POST /optimize. Fetches current active deals via db.queries, then
hands them to the pure optimizer.algorithm functions — no optimizer
logic lives here.
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

import db
from optimizer import optimize

router = APIRouter(tags=["optimize"])


class OptimizeRequest(BaseModel):
    grocery_list: list[str]
    mode: str = "cheapest"  # "cheapest" | "fewest"


@router.post("/optimize")
def run_optimizer(body: OptimizeRequest):
    deals = db.search_items(status="active", limit=500)
    try:
        result = optimize(body.grocery_list, deals, mode=body.mode)
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
    }
