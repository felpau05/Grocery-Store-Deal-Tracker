-- ── Extensions ──────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS vector;    -- item_embeddings.embedding
CREATE EXTENSION IF NOT EXISTS pg_trgm;   -- fast ILIKE/keyword search on items.name

-- updated_at helper
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--

-- ## MERCHANTS #######################################

CREATE TABLE merchants (
    id              BIGINT PRIMARY KEY,   
    name            TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER merchants_set_updated_at
    BEFORE UPDATE ON merchants
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ## FLYERS #######################################
-- immutable snapshot
CREATE TABLE flyers (
    id          BIGINT PRIMARY KEY,
    merchant_id    BIGINT NOT NULL REFERENCES merchants(id),
    postal_code TEXT,                    -- region the flyer was scraped for (normalized, no spaces)
    valid_from  TIMESTAMPTZ,
    valid_to    TIMESTAMPTZ,
    scraped_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_flyers_merchant_id ON flyers(merchant_id);

-- ── flyer_postal_codes ──────────────────────────────────────────────
-- Which regions a flyer reaches (migration 001). flyers.postal_code is
-- last-write-wins and only ever remembers one region, so this junction
-- is the authoritative mapping and the entry point for every
-- region-scoped read. One row per (flyer, postal code) pair — ~100 rows,
-- versus the 7,006 duplicated item rows it replaced.
--
-- ON DELETE CASCADE means maintenance/prune.py cleans this up for free:
-- it already deletes flyers left with no items, and those deletes now
-- take the stale mappings with them.

CREATE TABLE flyer_postal_codes (
    flyer_id      BIGINT NOT NULL REFERENCES flyers(id) ON DELETE CASCADE,
    postal_code   TEXT   NOT NULL,   -- normalized: uppercase, no spaces
    first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT now(),  -- bumped each re-scrape
    PRIMARY KEY (flyer_id, postal_code)
);

CREATE INDEX idx_flyer_postal_codes_postal ON flyer_postal_codes(postal_code);

-- ITEMS ##############################################

CREATE TABLE items (
    id                    BIGSERIAL PRIMARY KEY,
    merchant_id           BIGINT NOT NULL REFERENCES merchants(id),
    flyer_id              BIGINT NOT NULL REFERENCES flyers(id),
    flipp_item_id         BIGINT,                    -- lineage only, see note above

    -- Region the item was scraped for (normalized Canadian postal code,
    -- uppercase, no spaces). REQUIRED and part of the dedup key: Flipp
    -- merchant_ids are national, so the same store's flyer differs by
    -- region. Without this, "Bananas" from a Toronto Walmart flyer and
    -- an Ottawa Walmart flyer collide on (merchant_id, name, valid_from)
    -- and the last scrape silently overwrites the other.
    -- Lineage only since migration 001: which scrape first created this
    -- row. NOT the region filter — reads go through flyer_postal_codes,
    -- because one flyer (and so one item row) serves several regions.
    -- Dropped in migration 002 once the new scraper is deployed.
    postal_code           TEXT NOT NULL,

    name                  TEXT NOT NULL,              -- Item.name (cleaned)
    name_normalized       TEXT NOT NULL,              -- lowercased, whitespace-collapsed — dedup key, do not change
    original_name         TEXT,                       -- ItemMetadata.original_name
    original_description  TEXT,                       -- ItemMetadata.original_desc

    brands                TEXT[] NOT NULL DEFAULT '{}',  -- Item.brands

    price                 NUMERIC(8,2) NOT NULL,      -- Item.price
    price_unit            TEXT NOT NULL DEFAULT 'each', -- 'g' | 'ml' | 'each' — Item.price_unit.value
    price_unit_factor     NUMERIC NOT NULL DEFAULT 1.0,  -- Item._price_unit_factor

    size                  NUMERIC,                    -- Item.size
    size_unit             TEXT,                        -- 'g' | 'ml' | NULL — Item.size_unit.value

    product_image         TEXT,                        -- Item.product_image
    cutout_image           TEXT,                        -- Item.cutout_image

    category              TEXT,                        -- department-level classifier output
    subcategory           TEXT,                        -- aisle-level classifier output

    high_confidence        BOOLEAN NOT NULL DEFAULT TRUE, -- Item.high_confidence

    valid_from            DATE NOT NULL,               -- Item.start_date
    valid_to              DATE NOT NULL,               -- Item.end_date

    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Flyer-scoped dedup key (migration 001). Was keyed on postal_code,
    -- but Flipp serves ONE flyer to MANY nearby postal codes, so every
    -- extra postal code in the same area re-inserted a full copy of that
    -- flyer's items — 44% of the table was redundant. flyer_id
    -- discriminates the same national merchant's regional flyers more
    -- precisely than a raw postal code ever could, because it is keyed
    -- off what Flipp itself considers "the same flyer".
    UNIQUE (merchant_id, flyer_id, name_normalized, valid_from)
);

CREATE TRIGGER items_set_updated_at
    BEFORE UPDATE ON items
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX idx_items_merchant_id        ON items(merchant_id);
CREATE INDEX idx_items_flyer_id        ON items(flyer_id);
CREATE INDEX idx_items_category        ON items(category);
CREATE INDEX idx_items_subcategory     ON items(subcategory);
CREATE INDEX idx_items_valid_to        ON items(valid_to);
CREATE INDEX idx_items_flyer_id_lookup ON items(flyer_id);  -- every read scopes by region via flyer_postal_codes
CREATE INDEX idx_items_name_trgm       ON items USING gin (name gin_trgm_ops);  -- keyword search


-- ── price_history ───────────────────────────────────────────────────
-- Append-only. Never UPDATE existing rows — every scrape inserts new
-- ones. The weekly retention job is the only process allowed to DELETE.

CREATE TABLE price_history (
    id          BIGSERIAL PRIMARY KEY,
    item_id     BIGINT NOT NULL REFERENCES items(id),
    merchant_id BIGINT NOT NULL REFERENCES merchants(id),
    price       NUMERIC(8,2) NOT NULL,
    scraped_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_price_history_item_scraped ON price_history(item_id, scraped_at);


-- ── item_embeddings ─────────────────────────────────────────────────
-- Classifier cache. Not populated yet — built once classifier/classify.py
-- exists. all-MiniLM-L6-v2 produces 384-dim embeddings.

CREATE TABLE item_embeddings (
    name_normalized TEXT PRIMARY KEY,
    embedding       VECTOR(384),
    category        TEXT,
    similarity      REAL,
    classified_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- ── active_deals view ───────────────────────────────────────────────
-- items.price already reflects the latest parsed price for the item's
-- current flyer window, so this doesn't need to join price_history —
-- that table is for the 30-day history chart, not "what's the price now".

CREATE VIEW active_deals AS
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
    i.flyer_id   -- readers scope by region through flyer_postal_codes
FROM items i
JOIN merchants m ON m.id = i.merchant_id
WHERE CURRENT_DATE BETWEEN i.valid_from AND i.valid_to;


-- ── app profiles ────────────────────────────────────────────────────
-- Lightweight local accounts (name + postal code + chosen merchants).
-- NOT Supabase auth — the auth-dependent tables below stay reserved
-- for a future real-auth migration. Created idempotently at API
-- startup by db.users.ensure_user_tables(); kept here as documentation.
-- user_merchants stores id AND name because a user can select a store
-- we haven't scraped yet (no merchants row to join against).

CREATE TABLE IF NOT EXISTS app_users (
    id          SERIAL PRIMARY KEY,
    name        TEXT NOT NULL UNIQUE,
    postal_code TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_merchants (
    user_id       INT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
    merchant_id   BIGINT NOT NULL,
    merchant_name TEXT NOT NULL,
    PRIMARY KEY (user_id, merchant_id)
);


-- ── auth-dependent tables ───────────────────────────────────────────
-- Unaffected by the items rework above — unchanged from HANDOFF.md.

CREATE TABLE user_preferences (
    user_id     UUID PRIMARY KEY REFERENCES auth.users(id),
    postal_code TEXT,
    merchants   TEXT[],
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER user_preferences_set_updated_at
    BEFORE UPDATE ON user_preferences
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE grocery_lists (
    id          SERIAL PRIMARY KEY,
    user_id     UUID NOT NULL REFERENCES auth.users(id),
    name        TEXT NOT NULL DEFAULT 'My List',
    items       TEXT[],
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_grocery_lists_user_id ON grocery_lists(user_id);

CREATE TABLE alert_subscriptions (
    id                SERIAL PRIMARY KEY,
    user_id           UUID NOT NULL REFERENCES auth.users(id),
    email             TEXT NOT NULL,
    watch_query       TEXT NOT NULL,
    watch_type        TEXT NOT NULL,        -- 'item' | 'category'
    price_threshold   NUMERIC,
    store_filter      TEXT,
    confirmed         BOOLEAN NOT NULL DEFAULT FALSE,
    last_alerted_at   TIMESTAMPTZ,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_alert_subscriptions_user_id ON alert_subscriptions(user_id);


-- ── Row Level Security ──────────────────────────────────────────────

ALTER TABLE user_preferences    ENABLE ROW LEVEL SECURITY;
ALTER TABLE grocery_lists       ENABLE ROW LEVEL SECURITY;
ALTER TABLE alert_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_preferences_owner ON user_preferences
    FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY grocery_lists_owner ON grocery_lists
    FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY alert_subscriptions_owner ON alert_subscriptions
    FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);