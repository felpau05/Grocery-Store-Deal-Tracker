-- 003: drop items.postal_code.
--
-- DO NOT RUN until the scraper-go build that stops writing postal_code
-- is deployed and has completed a clean scrape. See 002's header for the
-- full ordering; running this while the old scraper is live breaks every
-- item write (it still names postal_code in its INSERT column list).
--
-- Preconditions, all verifiable:
--   - 002 has run          (postal_code is nullable, snapshots dropped)
--   - scraper-go deployed  (db.go no longer references postal_code)
--   - one clean scrape     (proves the deploy took)
--
-- After this the only record of which regions a flyer reaches is
-- flyer_postal_codes, which has been the authoritative source since 001.

-- The view still selects i.postal_code, and Postgres refuses to drop a
-- column a view depends on. CREATE OR REPLACE VIEW cannot remove a
-- column either, so the view has to be dropped and rebuilt around it.
DROP VIEW IF EXISTS active_deals;

ALTER TABLE items DROP COLUMN IF EXISTS postal_code;

-- Rebuilt without postal_code; otherwise identical to the 001 version.
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
    i.valid_from,
    i.valid_to,
    m.id   AS merchant_id,
    m.name AS merchant_name,
    i.flyer_id   -- readers scope by region through flyer_postal_codes
FROM items i
JOIN merchants m ON m.id = i.merchant_id
WHERE CURRENT_DATE BETWEEN i.valid_from AND i.valid_to;
