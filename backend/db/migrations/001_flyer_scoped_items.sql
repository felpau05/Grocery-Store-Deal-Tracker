-- 001: scope items to their flyer instead of to a raw postal code.
--
-- WHY
-- `items` deduped on (merchant_id, postal_code, name_normalized, valid_from).
-- Flipp serves ONE flyer to MANY nearby postal codes, so every extra postal
-- code in the same area re-inserted a full copy of that flyer's items. At the
-- time of writing that was 7,006 redundant rows out of 15,906 — 44% of the
-- table — e.g. flyer 8008176 duplicated across 5 Ottawa postal codes.
--
-- The fix: dedupe on flyer_id (which Flipp already shares across those postal
-- codes) and move the region mapping into a junction table.
--
-- ORDERING IS LOAD-BEARING
-- `flyers.postal_code` holds only the LAST scrape's postal code, so
-- `items.postal_code` on the duplicate rows is the ONLY surviving record of
-- which regions a flyer serves. The junction MUST be backfilled from those
-- rows BEFORE any of them are deleted, or region scoping silently breaks for
-- every postal code except the most recently scraped one.
--
-- EXPAND/CONTRACT
-- items.postal_code is deliberately KEPT here. The DB migration and the
-- scraper-go deploy are not atomic; dropping the column now would break the
-- running scraper's INSERT mid-deploy. Migration 002 drops it once the new
-- scraper is live.
--
-- Run inside a single transaction (run_migration.py does this).

-- ── 0. Snapshots, so this is reversible ─────────────────────────────
-- Dropped manually once the migration is confirmed good in production.

CREATE TABLE IF NOT EXISTS items_premigration_001 AS TABLE items;
CREATE TABLE IF NOT EXISTS price_history_premigration_001 AS TABLE price_history;


-- ── 1. Junction: which postal codes a flyer serves ──────────────────
-- One row per (flyer, postal code) pair — ~130 rows, vs the 7,006
-- duplicated item rows it replaces.
--
-- ON DELETE CASCADE means maintenance/prune.py cleans this up for free:
-- it already deletes flyers that have no items left, and those deletes
-- now take the stale mappings with them. No new cron, no new code.

CREATE TABLE IF NOT EXISTS flyer_postal_codes (
    flyer_id     BIGINT NOT NULL REFERENCES flyers(id) ON DELETE CASCADE,
    postal_code  TEXT   NOT NULL,   -- normalized: uppercase, no spaces
    first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- Bumped every scrape that re-confirms this pairing. Lets a future
    -- job expire mappings Flipp has stopped serving while the flyer is
    -- still inside its valid window.
    last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (flyer_id, postal_code)
);

-- Every region-scoped read starts from this side.
CREATE INDEX IF NOT EXISTS idx_flyer_postal_codes_postal
    ON flyer_postal_codes(postal_code);


-- ── 2. Backfill the junction (BEFORE any delete) ────────────────────

-- The authoritative source: the per-region item rows about to be merged.
INSERT INTO flyer_postal_codes (flyer_id, postal_code)
SELECT DISTINCT flyer_id, postal_code
FROM items
WHERE postal_code IS NOT NULL AND postal_code <> ''
ON CONFLICT DO NOTHING;

-- Belt and braces: a flyer scraped but whose items were already pruned
-- still has its last-known region on `flyers`.
INSERT INTO flyer_postal_codes (flyer_id, postal_code)
SELECT id, postal_code
FROM flyers
WHERE postal_code IS NOT NULL AND postal_code <> ''
ON CONFLICT DO NOTHING;


-- ── 3. Pick one surviving row per duplicate group ───────────────────
-- Verified before writing this: within a duplicate group, price and
-- category NEVER differ (0 groups), so the merge cannot change a
-- displayed price or lose classifier output. A minority of groups do
-- differ on size (71), product_image (120) and high_confidence (24),
-- so the winner is the most COMPLETE row rather than an arbitrary one.
-- id ASC is the final tiebreaker to keep this deterministic/re-runnable.

CREATE TABLE IF NOT EXISTS items_merge_map_001 AS
WITH ranked AS (
    SELECT
        id,
        merchant_id,
        flyer_id,
        name_normalized,
        valid_from,
        row_number() OVER (
            PARTITION BY merchant_id, flyer_id, name_normalized, valid_from
            ORDER BY
                high_confidence            DESC,
                (size IS NOT NULL)         DESC,
                (product_image IS NOT NULL) DESC,
                (category IS NOT NULL)     DESC,
                id                         ASC
        ) AS rn
    FROM items
),
winners AS (
    SELECT merchant_id, flyer_id, name_normalized, valid_from, id AS winner_id
    FROM ranked
    WHERE rn = 1
)
SELECT r.id AS loser_id, w.winner_id
FROM ranked r
JOIN winners w
  ON  w.merchant_id     = r.merchant_id
  AND w.flyer_id        = r.flyer_id
  AND w.name_normalized = r.name_normalized
  AND w.valid_from      = r.valid_from
WHERE r.rn > 1;

CREATE INDEX IF NOT EXISTS idx_items_merge_map_001_loser
    ON items_merge_map_001(loser_id);


-- ── 4. Re-point price history onto the surviving item ───────────────
-- price_history is the 30-day chart on /item/[id]. Losing these would
-- silently flatten history for every merged item, so they move rather
-- than being deleted with their old parent row.

UPDATE price_history ph
SET item_id = m.winner_id
FROM items_merge_map_001 m
WHERE ph.item_id = m.loser_id;


-- ── 5. Drop the now-redundant duplicates ────────────────────────────

DELETE FROM items
WHERE id IN (SELECT loser_id FROM items_merge_map_001);


-- ── 6. Swap the uniqueness key ──────────────────────────────────────
-- Constraint is looked up by definition rather than by name: the old one
-- was auto-named by Postgres and that name is not guaranteed stable
-- across environments.

DO $$
DECLARE
    conname_old TEXT;
BEGIN
    SELECT conname INTO conname_old
    FROM pg_constraint
    WHERE conrelid = 'items'::regclass
      AND contype = 'u'
      AND pg_get_constraintdef(oid) LIKE '%postal_code%name_normalized%valid_from%';

    IF conname_old IS NOT NULL THEN
        EXECUTE format('ALTER TABLE items DROP CONSTRAINT %I', conname_old);
    END IF;
END $$;

ALTER TABLE items
    ADD CONSTRAINT items_flyer_identity_key
    UNIQUE (merchant_id, flyer_id, name_normalized, valid_from);

-- postal_code is no longer part of any key or any read path, so its
-- standalone index is dead weight on every write.
DROP INDEX IF EXISTS idx_items_postal_code;

-- Region scoping is now a lookup, so the join column needs its own index.
CREATE INDEX IF NOT EXISTS idx_items_flyer_id_lookup ON items(flyer_id);


-- ── 7. Expose flyer_id on active_deals ──────────────────────────────
-- Readers scope by region as
--   flyer_id IN (SELECT flyer_id FROM flyer_postal_codes WHERE postal_code = ?)
-- so the view has to carry flyer_id. postal_code stays on the view for
-- now (expand/contract — migration 002 removes it with the column).
-- Appended last: CREATE OR REPLACE VIEW can only add columns at the end.

CREATE OR REPLACE VIEW active_deals AS
SELECT
    i.id AS item_id,
    i.name,
    i.brands,
    i.category,
    i.subcategory,
    i.price,
    i.price_unit,
    i.price_unit_factor,
    i.size,
    i.size_unit,
    i.product_image,
    i.high_confidence,
    i.postal_code,
    i.valid_from,
    i.valid_to,
    m.id   AS merchant_id,
    m.name AS merchant_name,
    i.flyer_id
FROM items i
JOIN merchants m ON m.id = i.merchant_id
WHERE CURRENT_DATE BETWEEN i.valid_from AND i.valid_to;
