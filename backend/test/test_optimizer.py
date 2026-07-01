"""Tests for optimizer.algorithm — synthetic deal data, no DB needed.

Run from backend/:
    python -m pytest test/test_optimizer.py -v
"""

from optimizer import optimize
from optimizer.algorithm import match_candidates


def deal(item_id, name, merchant_id, merchant_name, price):
    return {"item_id": item_id, "name": name, "merchant_id": merchant_id, "merchant_name": merchant_name, "price": price}


# A small synthetic deal pool across 3 stores, with overlap on milk and
# bread so there's an actual tradeoff between "cheapest" and "fewest".
DEALS = [
    deal(1, "Boneless Chicken Breast", 1, "Walmart", 8.99),
    deal(2, "2% Milk", 1, "Walmart", 4.99),
    deal(3, "Sourdough Bread", 1, "Walmart", 4.49),

    deal(4, "2% Milk", 2, "Food Basics", 3.99),
    deal(5, "Large Eggs Dozen", 2, "Food Basics", 3.29),

    deal(6, "Ground Beef Extra Lean", 3, "Loblaws", 9.99),
    deal(7, "Sourdough Bread", 3, "Loblaws", 4.29),
]


class TestMatchCandidates:

    def test_exact_substring_match(self):
        candidates, unmatched = match_candidates(["milk"], DEALS)
        assert unmatched == []
        assert {row.merchant_name for row in candidates["milk"]} == {"Walmart", "Food Basics"}

    def test_case_insensitive(self):
        candidates, _ = match_candidates(["MILK"], DEALS)
        assert "MILK" in candidates

    def test_no_match_goes_to_unmatched(self):
        candidates, unmatched = match_candidates(["frozen pizza"], DEALS)
        assert candidates == {}
        assert unmatched == ["frozen pizza"]

    def test_blank_queries_are_skipped(self):
        candidates, unmatched = match_candidates(["", "  ", "milk"], DEALS)
        assert "" not in candidates and "" not in unmatched
        assert "milk" in candidates

    def test_dedupes_to_cheapest_per_store(self):
        deals_with_dup = DEALS + [deal(99, "Multigrain Bread", 1, "Walmart", 3.99)]
        candidates, _ = match_candidates(["bread"], deals_with_dup)
        walmart_rows = [r for r in candidates["bread"] if r.merchant_id == 1]
        assert len(walmart_rows) == 1
        assert walmart_rows[0].price == 3.99


class TestCheapestMode:

    def test_each_item_goes_to_its_cheapest_store_independently(self):
        result = optimize(["milk", "eggs", "chicken"], DEALS, mode="cheapest")
        by_query = {item.query: (sp.merchant_name, item.price) for sp in result.store_plans for item in sp.items}
        assert by_query["milk"] == ("Food Basics", 3.99)
        assert by_query["eggs"] == ("Food Basics", 3.29)
        assert by_query["chicken"] == ("Walmart", 8.99)
        assert result.stops == 2

    def test_total_cost_is_sum_of_cheapest_options(self):
        result = optimize(["milk", "eggs"], DEALS, mode="cheapest")
        assert result.total_cost == round(3.99 + 3.29, 2)

    def test_unmatched_items_are_reported_not_dropped_silently(self):
        result = optimize(["milk", "frozen pizza"], DEALS, mode="cheapest")
        assert result.unmatched == ["frozen pizza"]
        assert result.total_cost == 3.99


class TestFewestMode:

    def test_picks_single_store_when_one_covers_everything(self):
        result = optimize(["chicken", "milk", "bread"], DEALS, mode="fewest")
        assert result.stops == 1
        assert result.store_plans[0].merchant_name == "Walmart"

    def test_minimizes_stops_even_at_higher_cost(self):
        result = optimize(["milk", "bread"], DEALS, mode="fewest")
        assert result.stops == 1
        assert result.store_plans[0].merchant_name == "Walmart"

    def test_tiebreaks_equal_stop_count_by_cost(self):
        result = optimize(["eggs", "chicken"], DEALS, mode="fewest")
        assert result.stops == 2
        assert result.total_cost == round(3.29 + 8.99, 2)

    def test_unmatched_excluded_from_cover_search(self):
        result = optimize(["milk", "frozen pizza"], DEALS, mode="fewest")
        assert result.unmatched == ["frozen pizza"]
        assert result.stops == 1


class TestEdgeCases:

    def test_empty_grocery_list(self):
        result = optimize([], DEALS, mode="cheapest")
        assert result.store_plans == []
        assert result.unmatched == []
        assert result.total_cost == 0

    def test_all_items_unmatched(self):
        result = optimize(["unobtainium"], DEALS, mode="fewest")
        assert result.store_plans == []
        assert result.unmatched == ["unobtainium"]

    def test_invalid_mode_raises(self):
        import pytest
        with pytest.raises(ValueError):
            optimize(["milk"], DEALS, mode="fastest")  # type: ignore[arg-type]
