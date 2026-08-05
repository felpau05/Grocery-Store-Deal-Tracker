"""All reads: search, history, category listing. No writes in this file
— see db/items.py and db/stores.py for those.
"""

import logging

from textutils import variant_alternation

from .connection import get_cursor

logger = logging.getLogger("flippwatch.db.queries")


def _shared_filter_clauses(
    q: str | None,
    status: str,
    price_units: list[str] | None,
    expires_within_days: int | None,
    price_min: float | None,
    price_max: float | None,
    postal_code: str | None,
) -> tuple[list[str], dict]:
    """WHERE clauses common to search_items and facet_counts — everything
    EXCEPT category/subcategory/merchant, since those are the dimensions
    facet_counts computes counts *by* (and search_items' callers vary
    them independently of this shared set).

    `postal_code` is the region key: it lives here (not in the per-
    dimension clauses) because EVERY read is region-scoped — a caller
    only ever sees one region's data. Callers pass it already normalized.

    Region scoping goes through `flyer_postal_codes` rather than matching
    items.postal_code directly. Flipp serves one flyer to many nearby
    postal codes, so items are stored once per flyer and the junction
    records which regions that flyer reaches — see migration 001.
    """
    clauses: list[str] = []
    params: dict = {}

    if postal_code:
        clauses.append(
            "flyer_id IN (SELECT flyer_id FROM flyer_postal_codes "
            "WHERE postal_code = %(postal_code)s)"
        )
        params["postal_code"] = postal_code

    if status == "active":
        clauses.append("valid_from <= CURRENT_DATE AND valid_to >= CURRENT_DATE")
    elif status == "upcoming":
        clauses.append("valid_from > CURRENT_DATE")
    elif status != "all":
        raise ValueError(f"Unknown status {status!r} — use 'active', 'upcoming', or 'all'")

    if q:
        # Word-boundary match per token: \m/\M are Postgres word anchors.
        # "beef" won't match "Beefsteak"; "chicken breast" requires both
        # words. Each token also matches its singular/plural variants
        # ("banana" finds "Bananas"), and brands count as searchable text
        # ("nutella" finds items branded Nutella even if the name omits it).
        for i, word in enumerate(q.split()):
            clauses.append(
                f"(name ~* %(qw_{i})s OR array_to_string(brands, ' ') ~* %(qw_{i})s)"
            )
            params[f"qw_{i}"] = rf"\m({variant_alternation(word)})\M"

    if price_units:
        placeholders = ", ".join(f"%(pu_{i})s" for i in range(len(price_units)))
        clauses.append(f"price_unit IN ({placeholders})")
        for i, u in enumerate(price_units):
            params[f"pu_{i}"] = u

    if expires_within_days is not None:
        # Ends within N days and hasn't already expired (0 = ends today).
        clauses.append(
            "valid_to >= CURRENT_DATE AND valid_to <= CURRENT_DATE + %(exp_days)s"
        )
        params["exp_days"] = expires_within_days

    if price_min is not None:
        clauses.append("price >= %(price_min)s")
        params["price_min"] = price_min

    if price_max is not None:
        clauses.append("price <= %(price_max)s")
        params["price_max"] = price_max

    return clauses, params


def _merchant_in_clause(merchant_ids: list[int], param_prefix: str) -> tuple[str, dict]:
    placeholders = ", ".join(f"%({param_prefix}_{i})s" for i in range(len(merchant_ids)))
    params = {f"{param_prefix}_{i}": mid for i, mid in enumerate(merchant_ids)}
    return f"merchant_id IN ({placeholders})", params


def _category_in_clause(categories: list[str], param_prefix: str) -> tuple[str, dict]:
    placeholders = ", ".join(f"%({param_prefix}_{i})s" for i in range(len(categories)))
    params = {f"{param_prefix}_{i}": c for i, c in enumerate(categories)}
    return f"category IN ({placeholders})", params


def search_items(
    q: str | None = None,
    categories: list[str] | None = None,
    subcategory: str | None = None,
    merchant_id: int | None = None,
    merchant_ids: list[int] | None = None,  # a user's chosen stores — ANDed with merchant_id
    postal_code: str | None = None,  # region key — every caller should scope this
    status: str = "active",       # "active" | "upcoming" | "all"
    sort: str = "price",          # "price" | "price_per_unit"
    sort_dir: str = "asc",        # "asc" | "desc"
    price_units: list[str] | None = None,  # ["g", "ml", "each"] — None means all
    expires_within_days: int | None = None,  # only deals ending within N days (0 = today)
    price_min: float | None = None,
    price_max: float | None = None,
    limit: int = 50,
    offset: int = 0,
) -> list[dict]:
    """Search active_deals by keyword / category / merchant / region.

    Backs GET /deals. `postal_code` scopes to one region — routes always
    supply it (a signed-in user's own, or the example-data default), so
    two regions of the same national merchant never bleed together.
    `status="active"` (default) only returns deals whose flyer window
    covers today; "upcoming" returns future-dated ones; "all" applies no
    date filter. `limit`/`offset` page the results — the ORDER BY
    includes item_id as a tiebreaker so paging is stable.
    """
    if sort not in ("price", "price_per_unit"):
        raise ValueError(f"Unknown sort {sort!r}")
    if sort_dir not in ("asc", "desc"):
        raise ValueError(f"Unknown sort_dir {sort_dir!r}")

    # price_per_unit mirrors Item.price_per_unit
    sort_expr = (
        """
        CASE
            WHEN price_unit != 'each' THEN price * price_unit_factor
            WHEN size IS NOT NULL AND size > 0 THEN price / size
            ELSE price
        END
        """
        if sort == "price_per_unit"
        else "price"
    )
    order_by = f"{sort_expr} {sort_dir.upper()}, item_id ASC"

    clauses, params = _shared_filter_clauses(
        q, status, price_units, expires_within_days, price_min, price_max, postal_code,
    )
    params["limit"] = limit
    params["offset"] = offset

    if categories:
        clause, cparams = _category_in_clause(categories, "cat")
        clauses.append(clause)
        params.update(cparams)

    if subcategory:
        clauses.append("subcategory = %(subcategory)s")
        params["subcategory"] = subcategory

    if merchant_id:
        clauses.append("merchant_id = %(merchant_id)s")
        params["merchant_id"] = merchant_id

    if merchant_ids:
        clause, mparams = _merchant_in_clause(merchant_ids, "mid")
        clauses.append(clause)
        params.update(mparams)

    where = f"WHERE {' AND '.join(clauses)}" if clauses else ""

    with get_cursor() as cur:
        cur.execute(
            f"""
            SELECT item_id, name, brands, category, subcategory, price, price_unit, price_unit_factor,
                   size, size_unit, product_image, high_confidence,
                   valid_from, valid_to, merchant_id, merchant_name
            FROM active_deals
            {where}
            ORDER BY {order_by}
            LIMIT %(limit)s OFFSET %(offset)s
            """,
            params,
        )
        return cur.fetchall()


def facet_counts(
    q: str | None = None,
    categories: list[str] | None = None,
    merchant_id: int | None = None,
    merchant_ids: list[int] | None = None,
    postal_code: str | None = None,
    status: str = "active",
    price_units: list[str] | None = None,
    expires_within_days: int | None = None,
    price_min: float | None = None,
    price_max: float | None = None,
) -> dict:
    """Item counts for the deals page's category/store checkboxes, plus
    the exact total for the current filters (used for real pagination).

    Standard faceted-search rule: a dimension's own counts ignore its own
    current selection (so category counts show what EVERY category would
    yield, not just the checked ones) but respect every other active
    filter — store counts still reflect the checked categories, and
    category counts still reflect the current single-store pill
    (merchant_id) if one is selected. Store counts are always computed
    across the full `merchant_ids` scope (the user's stores, or the
    default set) regardless of which single pill is active, so switching
    stores shows the other stores' true counts.
    """
    shared_clauses, shared_params = _shared_filter_clauses(
        q, status, price_units, expires_within_days, price_min, price_max, postal_code,
    )

    # Effective store restriction for category counts + total: the single
    # selected pill wins over the full scope, exactly like search_items.
    store_clause, store_params = None, {}
    if merchant_id:
        store_clause, store_params = "merchant_id = %(fc_merchant_id)s", {"fc_merchant_id": merchant_id}
    elif merchant_ids:
        store_clause, store_params = _merchant_in_clause(merchant_ids, "fc_mid")

    def _where(*extra: str) -> str:
        parts = [*shared_clauses, *extra]
        return f"WHERE {' AND '.join(parts)}" if parts else ""

    with get_cursor() as cur:
        # Total — every active filter applied, matches search_items exactly.
        total_extra = [store_clause] if store_clause else []
        total_params: dict = {}
        if categories:
            clause, total_params = _category_in_clause(categories, "fc_cat_total")
            total_extra.append(clause)
        cur.execute(
            f"SELECT count(*) AS n FROM active_deals {_where(*total_extra)}",
            {**shared_params, **store_params, **total_params},
        )
        total = cur.fetchone()["n"]

        # Per-category counts — store-scoped, but ignore the category filter
        # (its own dimension never narrows itself).
        cat_extra = [store_clause, "category IS NOT NULL"] if store_clause else ["category IS NOT NULL"]
        cur.execute(
            f"""
            SELECT category, count(*) AS n FROM active_deals
            {_where(*cat_extra)}
            GROUP BY category
            """,
            {**shared_params, **store_params},
        )
        category_counts = {row["category"]: row["n"] for row in cur.fetchall()}

        # Per-store counts — always across the full scope (never narrowed
        # to the currently-checked stores), but respect the category filter.
        scope_clause, scope_params = None, {}
        if merchant_ids:
            scope_clause, scope_params = _merchant_in_clause(merchant_ids, "fc_scope")
        merch_extra = [scope_clause] if scope_clause else []
        merch_cat_params: dict = {}
        if categories:
            clause, merch_cat_params = _category_in_clause(categories, "fc_cat_merch")
            merch_extra.append(clause)
        cur.execute(
            f"""
            SELECT merchant_id, count(*) AS n FROM active_deals
            {_where(*merch_extra)}
            GROUP BY merchant_id
            """,
            {**shared_params, **scope_params, **merch_cat_params},
        )
        merchants = {row["merchant_id"]: row["n"] for row in cur.fetchall()}

    return {"total": total, "categories": category_counts, "merchants": merchants}


def get_item(item_id: int) -> dict | None:
    """Fetch one item + merchant name by id. Backs GET /deals/{id}/history."""
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT i.id, i.name, i.brands, i.category,
                   i.price, i.price_unit, i.price_unit_factor,
                   i.size, i.size_unit,
                   i.product_image, i.cutout_image,
                   i.high_confidence, i.valid_from, i.valid_to,
                   i.original_name, i.original_description,
                   i.merchant_id, m.name AS merchant_name
            FROM items i
            JOIN merchants m ON m.id = i.merchant_id
            WHERE i.id = %(item_id)s
            """,
            {"item_id": item_id},
        )
        return cur.fetchone()


def get_price_history(item_id: int, days: int = 30) -> list[dict]:
    """Price history for one item, oldest first. Backs GET /deals/{id}/history."""
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT price, scraped_at
            FROM price_history
            WHERE item_id = %(item_id)s
              AND scraped_at >= now() - (%(days)s || ' days')::interval
            ORDER BY scraped_at ASC
            """,
            {"item_id": item_id, "days": days},
        )
        return cur.fetchall()


def list_categories(
    merchant_ids: list[int] | None = None,
    postal_code: str | None = None,
) -> list[str]:
    """Distinct non-empty categories in use within the caller's scope
    (region + stores). Backs GET /categories.

    Both filters matter: without `postal_code` this leaks categories
    from every region ever scraped; without `merchant_ids` it leaks
    other stores in the same region. Routes always supply both."""
    conds = ["category IS NOT NULL", "category != ''"]
    params: dict = {}
    if postal_code:
        conds.append(
            "flyer_id IN (SELECT flyer_id FROM flyer_postal_codes "
            "WHERE postal_code = %(postal)s)"
        )
        params["postal"] = postal_code
    if merchant_ids:
        conds.append("merchant_id = ANY(%(mids)s)")
        params["mids"] = list(merchant_ids)
    with get_cursor() as cur:
        cur.execute(
            f"SELECT DISTINCT category FROM items WHERE {' AND '.join(conds)} ORDER BY category",
            params,
        )
        return [row["category"] for row in cur.fetchall()]


def list_merchants(
    merchant_ids: list[int] | None = None,
    postal_code: str | None = None,
) -> list[dict]:
    """Merchants with at least one item in the caller's scope (region +
    stores), id + name. Backs GET /merchants.

    Region-scoped via an EXISTS on items so a merchant only appears if
    it actually has data for THIS postal code — otherwise a store
    scraped for another region would surface with zero local deals."""
    item_conds = ["i.merchant_id = m.id"]
    params: dict = {}
    if postal_code:
        item_conds.append(
            "i.flyer_id IN (SELECT flyer_id FROM flyer_postal_codes "
            "WHERE postal_code = %(postal)s)"
        )
        params["postal"] = postal_code
    merch_cond = ""
    if merchant_ids:
        merch_cond = "m.id = ANY(%(mids)s) AND "
        params["mids"] = list(merchant_ids)
    with get_cursor() as cur:
        cur.execute(
            f"""
            SELECT m.id, m.name
            FROM merchants m
            WHERE {merch_cond}EXISTS (
                SELECT 1 FROM items i WHERE {' AND '.join(item_conds)}
            )
            ORDER BY m.name
            """,
            params,
        )
        return cur.fetchall()


def unclassified_items(limit: int) -> list[dict]:
    """Items scraper-go wrote with category still NULL — the backfill
    queue classifier/backfill.py sweeps on a timer. Scoped to `id` /
    `name_normalized` only, the classifier's sole input."""
    with get_cursor() as cur:
        cur.execute(
            "SELECT id, name_normalized FROM items WHERE category IS NULL LIMIT %s",
            (limit,),
        )
        return cur.fetchall()