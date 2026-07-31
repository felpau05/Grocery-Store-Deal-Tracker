-- 002: reclaim the 001 snapshots, and prepare items.postal_code for removal.
--
-- Run this BEFORE deploying the scraper-go change that stops writing
-- postal_code, and before 003 which actually drops the column.
--
-- WHY THIS IS SPLIT FROM 003
-- items.postal_code is NOT NULL and scraper-go still supplies it. The
-- migration and the scraper deploy are not atomic, so the safe order is:
--
--   1. this migration      — column becomes optional (old scraper still fine,
--                            because it keeps sending a value)
--   2. deploy scraper-go   — stops sending postal_code
--   3. migration 003       — drops the column for good
--
-- Doing 3 before 2 breaks every write with a NOT NULL violation. Doing 2
-- before 1 breaks every write for the same reason. This ordering is the
-- only one where each step is safe on its own.

-- ── 1. Drop the 001 rollback snapshots ──────────────────────────────
-- ~10 MB of a 43 MB database. This is the point of no return for the
-- 001 merge: items_merge_map_001 holds the 7,006 loser->winner pairs,
-- and items_premigration_001 is the only remaining copy of the
-- pre-merge rows (including each row's original postal_code). Once
-- these are gone the 44% dedup cannot be reconstructed or reversed.
--
-- Only run this after enough clean scrapes that you trust the new key.

DROP TABLE IF EXISTS items_merge_map_001;
DROP TABLE IF EXISTS items_premigration_001;
DROP TABLE IF EXISTS price_history_premigration_001;


-- ── 2. Make postal_code optional ────────────────────────────────────
-- Lineage only since 001 — the authoritative region mapping is
-- flyer_postal_codes. Dropping NOT NULL lets the next scraper-go build
-- stop populating it without every INSERT failing, which is what makes
-- 003 a safe no-downtime follow-up.

ALTER TABLE items ALTER COLUMN postal_code DROP NOT NULL;
