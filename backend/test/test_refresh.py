"""Tests for maintenance.refresh — target list + one-at-a-time runner.
Fake start/status functions and a fake clock; no DB, Redis or scraper-go.

Run from backend/:
    python -m pytest test/test_refresh.py -v
"""

from maintenance.refresh import build_targets, run_targets


class TestBuildTargets:

    def test_default_region_and_users_merge_per_postal_code(self):
        rows = [
            {"postal_code": "K1A0B1", "merchant_id": 9},
            {"postal_code": "K1A0B1", "merchant_id": 1},
            {"postal_code": "M5V2T6", "merchant_id": 9},
        ]
        assert build_targets("K1A0B1", {1, 2}, rows) == {"K1A0B1": {1, 2, 9}, "M5V2T6": {9}}

    def test_users_without_postal_code_are_ignored(self):
        # Users without stores never reach here: saved_scrape_regions() JOINs on user_merchants.
        rows = [{"postal_code": None, "merchant_id": 1}, {"postal_code": "", "merchant_id": 2}]
        assert build_targets("K1A0B1", {1}, rows) == {"K1A0B1": {1}}

    def test_no_default_region_without_postal_code_or_stores(self):
        rows = [{"postal_code": "M5V2T6", "merchant_id": 9}]
        assert build_targets("", {1}, rows) == {"M5V2T6": {9}}
        assert build_targets("K1A0B1", set(), rows) == {"M5V2T6": {9}}


def fake_scraper(refuse=(), finish=None):
    """start() accepts unless the postal code is in `refuse`. status()
    reports running until poll number n, then ok, per finish = {postal:
    (n, ok)}; a postal code not in `finish` never finishes. wait()
    advances a fake clock. Returns (starts, start, status, wait, clock)
    where starts is [(postal, time it was started)]."""
    finish = finish or {}
    now = [0.0]
    polls: dict[str, int] = {}
    starts = []

    def start(postal, merchant_ids):
        starts.append((postal, now[0]))
        return postal not in refuse

    def status(postal):
        polls[postal] = polls.get(postal, 0) + 1
        n, ok = finish.get(postal, (None, None))
        return {"ok": ok if n is not None and polls[postal] >= n else None}

    def wait(seconds):
        now[0] += seconds
        return False

    return starts, start, status, wait, lambda: now[0]


class TestRunTargets:

    def test_next_scrape_starts_only_after_the_previous_finishes(self):
        starts, start, status, wait, clock = fake_scraper(finish={"A": (3, True), "B": (1, False)})
        out = run_targets({"A": {1}, "B": {2}}, start, status, wait, clock, timeout=100, poll=10)
        assert out == {"A": "done", "B": "failed"}
        assert starts == [("A", 0), ("B", 30)]

    def test_refused_start_moves_on_without_waiting(self):
        starts, start, status, wait, clock = fake_scraper(refuse={"A"}, finish={"B": (1, True)})
        out = run_targets({"A": {1}, "B": {2}}, start, status, wait, clock, timeout=100, poll=10)
        assert out == {"A": "refused", "B": "done"}
        assert starts == [("A", 0), ("B", 0)]

    def test_timeout_gives_up_and_moves_on(self):
        starts, start, status, wait, clock = fake_scraper(finish={"B": (1, True)})
        out = run_targets({"A": {1}, "B": {2}}, start, status, wait, clock, timeout=60, poll=10)
        assert out == {"A": "timeout", "B": "done"}
        assert starts == [("A", 0), ("B", 60)]
