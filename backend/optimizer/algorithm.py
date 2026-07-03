"""optimize(), _cheapest(), _fewest() — pure functions.

Takes a grocery list (free-text queries) and a pool of available deals
(the shape db.search_items() returns), and decides where to buy each
item. No DB access happens in this module — callers fetch deals
themselves and pass them in, which is what keeps this testable without
a database (see tests/test_optimizer.py).
"""

import re
from itertools import combinations

from textutils import variant_alternation

from .models import DealRow, Mode, OptimizeResult, PlanItem, StorePlan

# Above this many distinct candidate stores, exact subset search for
# "fewest stops" becomes too expensive (C(n, n/2) blows up) — fall back
# to a greedy approximation instead. Real merchant lists are small
# (8 by default in config.py), so this should rarely if ever trigger.
_EXACT_SEARCH_STORE_LIMIT = 15


def _query_patterns(query: str) -> list[re.Pattern]:
    """One compiled pattern per query word; every pattern must hit for a
    deal to match. Each word also matches its singular/plural variants
    ("banana" hits "Bananas") — same tolerance db.queries applies in SQL."""
    return [
        re.compile(rf"\b({variant_alternation(w)})\b")
        for w in query.lower().split()
    ]


def _matches(patterns: list[re.Pattern], deal: dict) -> bool:
    haystack = deal["name"].lower()
    brands = deal.get("brands") or []
    if brands:
        haystack += " " + " ".join(str(b).lower() for b in brands)
    return all(p.search(haystack) for p in patterns)


def _to_row(query: str, deal: dict) -> DealRow:
    return DealRow(
        query=query,
        item_id=deal["item_id"],
        name=deal["name"],
        merchant_id=deal["merchant_id"],
        merchant_name=deal["merchant_name"],
        price=float(deal["price"]),
        size=float(deal["size"]) if deal.get("size") else None,
        size_unit=deal.get("size_unit"),
        product_image=deal.get("product_image"),
        category=deal.get("category"),
    )


def _matching_rows(
    query: str, deals: list[dict], category: str | None = None
) -> list[DealRow]:
    """Word-match rows for one query. When the query's predicted category
    is known, same-category matches win: "milk" (dairy eggs) drops
    "Catch Milk Chocolate" (snacks) — but if NO match shares the
    category, fall back to all matches rather than returning nothing
    (the classifier is a preference, not a gate)."""
    patterns = _query_patterns(query)
    rows = [_to_row(query, d) for d in deals if _matches(patterns, d)]
    if category:
        same_category = [r for r in rows if r.category == category]
        if same_category:
            return same_category
    return rows


def match_candidates(
    grocery_list: list[str],
    deals: list[dict],
    query_categories: dict[str, str] | None = None,
) -> tuple[dict[str, list[DealRow]], list[str]]:
    """Match each grocery list query against the deal pool.

    Case-insensitive whole-word matching against deal names + brands,
    tolerant of singular/plural ("milk" matches "2% Milk", "egg" matches
    "Large Eggs Dozen"). "chiken" (typo) still matches nothing — no
    fuzzy matching yet. `query_categories` (query -> department, from
    the classifier) narrows matches to the query's own department when
    possible — see _matching_rows.

    Returns (candidates, unmatched):
        candidates: query -> one DealRow per store that has a match,
            already deduped to that store's cheapest matching item.
        unmatched: queries with no match at any store.
    """
    query_categories = query_categories or {}
    candidates: dict[str, list[DealRow]] = {}
    unmatched: list[str] = []

    for query in grocery_list:
        q = query.strip()
        if not q:
            continue

        best_per_store: dict[int, DealRow] = {}
        for row in _matching_rows(q, deals, query_categories.get(q)):
            existing = best_per_store.get(row.merchant_id)
            if existing is None or row.price < existing.price:
                best_per_store[row.merchant_id] = row

        if best_per_store:
            candidates[q] = list(best_per_store.values())
        else:
            unmatched.append(q)

    return candidates, unmatched


def match_options(
    grocery_list: list[str],
    deals: list[dict],
    per_query: int = 5,
    query_categories: dict[str, str] | None = None,
) -> dict[str, list[DealRow]]:
    """The few cheapest matching deals per query, across all stores —
    NOT deduped per store, so two milk brands at one store both appear.
    Backs the trip planner's "pick your deal" swap UI."""
    query_categories = query_categories or {}
    options: dict[str, list[DealRow]] = {}
    for query in grocery_list:
        q = query.strip()
        if not q:
            continue
        rows = sorted(
            _matching_rows(q, deals, query_categories.get(q)),
            key=lambda r: r.price,
        )
        if rows:
            options[q] = rows[:per_query]
    return options


def _cheapest(candidates: dict[str, list[DealRow]]) -> list[StorePlan]:
    """Ignore stop count entirely — send each item to whichever store
    has it cheapest, independent of every other item."""
    plans: dict[int, StorePlan] = {}

    for rows in candidates.values():
        best = min(rows, key=lambda r: r.price)
        plan = plans.setdefault(
            best.merchant_id, StorePlan(merchant_id=best.merchant_id, merchant_name=best.merchant_name)
        )
        plan.items.append(PlanItem(query=best.query, item_id=best.item_id, name=best.name, price=best.price))

    return list(plans.values())


def _fewest(candidates: dict[str, list[DealRow]]) -> list[StorePlan]:
    """Minimize the number of stores visited, then minimize cost among
    plans that achieve that minimum. Exact for realistic store counts —
    see _EXACT_SEARCH_STORE_LIMIT."""
    if not candidates:
        return []

    stores_involved = sorted({row.merchant_id for rows in candidates.values() for row in rows})

    if len(stores_involved) > _EXACT_SEARCH_STORE_LIMIT:
        chosen = _greedy_set_cover(candidates, stores_involved)
    else:
        chosen = _exact_min_set_cover(candidates, stores_involved)

    return _assign_to_stores(candidates, chosen)


def _covers_all(subset: set[int], candidates: dict[str, list[DealRow]]) -> bool:
    return all(any(row.merchant_id in subset for row in rows) for rows in candidates.values())


def _exact_min_set_cover(candidates: dict[str, list[DealRow]], stores_involved: list[int]) -> set[int]:
    for size in range(1, len(stores_involved) + 1):
        covering_subsets = [
            set(combo) for combo in combinations(stores_involved, size) if _covers_all(set(combo), candidates)
        ]
        if covering_subsets:
            return min(covering_subsets, key=lambda subset: _cost_for_subset(candidates, subset))
    return set(stores_involved)


def _greedy_set_cover(candidates: dict[str, list[DealRow]], stores_involved: list[int]) -> set[int]:
    """Classic greedy approximation: repeatedly pick the store that
    covers the most still-uncovered queries."""
    remaining = set(candidates.keys())
    chosen: set[int] = set()

    while remaining:
        best_store, best_covered = None, set()
        for store in stores_involved:
            covered = {q for q in remaining if any(row.merchant_id == store for row in candidates[q])}
            if len(covered) > len(best_covered):
                best_store, best_covered = store, covered
        if best_store is None:
            break
        chosen.add(best_store)
        remaining -= best_covered

    return chosen


def _cost_for_subset(candidates: dict[str, list[DealRow]], subset: set[int]) -> float:
    total = 0.0
    for rows in candidates.values():
        in_subset = [r for r in rows if r.merchant_id in subset]
        if in_subset:
            total += min(r.price for r in in_subset)
    return total


def _assign_to_stores(candidates: dict[str, list[DealRow]], chosen: set[int]) -> list[StorePlan]:
    plans: dict[int, StorePlan] = {}
    for rows in candidates.values():
        in_subset = [r for r in rows if r.merchant_id in chosen]
        best = min(in_subset, key=lambda r: r.price)
        plan = plans.setdefault(
            best.merchant_id, StorePlan(merchant_id=best.merchant_id, merchant_name=best.merchant_name)
        )
        plan.items.append(PlanItem(query=best.query, item_id=best.item_id, name=best.name, price=best.price))
    return list(plans.values())


def optimize(
    grocery_list: list[str],
    deals: list[dict],
    mode: Mode = "cheapest",
    query_categories: dict[str, str] | None = None,
) -> OptimizeResult:
    """Entry point. deals is the same shape db.search_items() returns —
    callers fetch active deals themselves and pass them in, along with
    (optionally) each query's classifier-predicted department. The
    classifier stays out of this module so it remains pure and testable."""
    if mode not in ("cheapest", "fewest"):
        raise ValueError(f"Unknown mode {mode!r} — use 'cheapest' or 'fewest'")

    candidates, unmatched = match_candidates(grocery_list, deals, query_categories)
    store_plans = _cheapest(candidates) if mode == "cheapest" else _fewest(candidates)
    options = match_options(grocery_list, deals, query_categories=query_categories)

    return OptimizeResult(mode=mode, store_plans=store_plans, unmatched=unmatched, options=options)
