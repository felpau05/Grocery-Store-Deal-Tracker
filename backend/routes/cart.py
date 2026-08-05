"""Signed-in-only grocery cart + saved trip plans.

    GET    /cart              -> this account's cart items
    PUT    /cart               (whole-list replace, mirrors PUT /me/preferences'
                                 merchants-replace) -> the updated list

    GET    /trip-plans         -> this account's saved plans, receipts
                                   assembled fresh from current prices
    POST   /trip-plans        -> save one
    DELETE /trip-plans/{id}    -> remove one

Anonymous visitors never call these — the frontend keeps a local-only
cart/plans for them. See db/cart.py for the storage shape and why a
saved item_id is never a hard foreign key.
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

import db
from routes.auth import get_current_user

router = APIRouter(tags=["cart"])


class CartItemRequest(BaseModel):
    query: str
    label: str
    item_id: int | None = None
    merchant_id: int | None = None
    merchant_name: str | None = None
    price: float | None = None
    image: str | None = None
    added_at: float  # ms epoch, matches frontend CartEntry.addedAt


class SavedPlanItemRequest(BaseModel):
    query: str
    item_id: int


class SavedPlanRequest(BaseModel):
    name: str | None = None
    mode: str
    items: list[SavedPlanItemRequest]


def _storage_error_or(detail: str) -> HTTPException:
    if not db.storage_status()["ok"]:
        return HTTPException(status_code=503, detail="Storage limit reached — try again later")
    return HTTPException(status_code=404, detail=detail)


@router.get("/cart")
def get_cart(user: dict = Depends(get_current_user)):
    return db.get_cart(user["id"])


@router.put("/cart")
def put_cart(body: list[CartItemRequest], user: dict = Depends(get_current_user)):
    updated = db.replace_cart(user["id"], [item.model_dump() for item in body])
    if updated is None:
        raise HTTPException(status_code=503, detail="Storage limit reached — cart not saved")
    return updated


@router.get("/trip-plans")
def list_trip_plans(user: dict = Depends(get_current_user)):
    return db.list_saved_plans(user["id"])


@router.post("/trip-plans", status_code=201)
def create_trip_plan(body: SavedPlanRequest, user: dict = Depends(get_current_user)):
    created = db.create_saved_plan(
        user["id"], body.name, body.mode, [item.model_dump() for item in body.items],
    )
    if created is None:
        raise HTTPException(status_code=503, detail="Storage limit reached — plan not saved")
    return created


@router.delete("/trip-plans/{plan_id}")
def delete_trip_plan(plan_id: int, user: dict = Depends(get_current_user)):
    deleted = db.delete_saved_plan(user["id"], plan_id)
    if not deleted:
        raise _storage_error_or("Saved plan not found")
    return {"ok": True}
