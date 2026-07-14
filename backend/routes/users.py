"""Merchant discovery (public).

GET /merchants/available — merchants with an active flyer at a postal
code, live from Flipp. Public because it leaks nothing personal: it
takes any postal code and returns store names. All account routes live
in routes/auth.py behind session tokens.
"""

import re

from fastapi import APIRouter, HTTPException, Query

import db
from flipp_scraper.client import create_client, fetch_flyers

router = APIRouter(tags=["merchants"])

_POSTAL_RE = re.compile(r"^[A-Z]\d[A-Z]\d[A-Z]\d$")


def _normalize_postal(raw: str) -> str:
    code = raw.replace(" ", "").replace("-", "").upper()
    if not _POSTAL_RE.match(code):
        raise HTTPException(
            status_code=422,
            detail=f"{raw!r} is not a valid Canadian postal code",
        )
    return code


@router.get("/merchants/available")
async def available_merchants(postal_code: str = Query(min_length=6)):
    """Merchants with an ACTIVE flyer at this postal code, fetched live
    from Flipp — the list users pick their stores from. Derived from the
    flyers feed rather than Flipp's /merchants endpoint, which returns
    ~2500 merchants nationally regardless of location. `is_grocery`
    comes from the flyer's category tags so the UI can default to
    grocery stores; `tracked` marks stores already in our scraped DB
    (deals show up immediately for those)."""
    postal = _normalize_postal(postal_code)
    try:
        async with create_client() as client:
            flyers = await fetch_flyers(client, postal)
    except Exception:
        raise HTTPException(
            status_code=502,
            detail="Couldn't reach Flipp to look up merchants — try again shortly",
        )

    # Scoped to THIS postal code — db.list_merchants() only returns a
    # merchant if it has an item for the given region (see its
    # docstring). Calling it with no postal_code silently reverted to
    # "known anywhere", so a merchant scraped for a different region
    # showed as `tracked: true` here even with zero deals for this one —
    # promising "deals show up immediately" and then showing none.
    tracked_ids = {m["id"] for m in db.list_merchants(postal_code=postal)}

    merchants: dict[int, dict] = {}
    for f in flyers:
        mid, name = f.get("merchant_id"), f.get("merchant")
        if not mid or not name:
            continue
        entry = merchants.setdefault(
            mid,
            {
                "id": mid,
                "name": name,
                "logo": f.get("merchant_logo"),
                "is_grocery": False,
                "tracked": mid in tracked_ids,
            },
        )
        if "Groceries" in (f.get("categories") or []):
            entry["is_grocery"] = True

    return sorted(merchants.values(), key=lambda m: str(m["name"]).lower())
