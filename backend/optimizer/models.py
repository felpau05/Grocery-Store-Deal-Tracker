"""Data shapes for the grocery list optimizer. Pure dataclasses, no DB
access and no business logic here — see algorithm.py for that.
"""

from dataclasses import dataclass, field
from typing import Literal

Mode = Literal["cheapest", "fewest"]


@dataclass
class DealRow:
    """One candidate deal that could satisfy a grocery list query."""
    query: str          # the grocery list entry this matches, e.g. "milk"
    item_id: int
    name: str            # the actual deal name, e.g. "2% Milk"
    merchant_id: int
    merchant_name: str
    price: float
    # Display-only extras for the "pick your deal" UI; absent in older
    # deal dicts (tests), so they default to None.
    size: float | None = None
    size_unit: str | None = None
    product_image: str | None = None
    category: str | None = None


@dataclass
class PlanItem:
    """One query, fulfilled, within a specific store's plan."""
    query: str
    item_id: int
    name: str
    price: float


@dataclass
class StorePlan:
    """Everything to buy at one store."""
    merchant_id: int
    merchant_name: str
    items: list[PlanItem] = field(default_factory=list)

    @property
    def subtotal(self) -> float:
        return round(sum(i.price for i in self.items), 2)


@dataclass
class OptimizeResult:
    mode: Mode
    store_plans: list[StorePlan]
    unmatched: list[str]   # grocery list entries with no matching deal anywhere
    # query -> a few cheapest matching deals across all stores, so the
    # user can swap the auto-picked item for another option.
    options: dict[str, list[DealRow]] = field(default_factory=dict)

    @property
    def total_cost(self) -> float:
        return round(sum(sp.subtotal for sp in self.store_plans), 2)

    @property
    def stops(self) -> int:
        return len(self.store_plans)
