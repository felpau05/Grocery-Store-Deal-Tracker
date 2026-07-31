package main

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"sort"
	"strconv"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// marshalBrands JSON-encodes a brands slice for the batch upsert — see
// the comment in writeItemBatch's INSERT for why this can't just be a
// text[][] parameter. Never fails: brands are always plain strings.
func marshalBrands(brands []string) string {
	if brands == nil {
		brands = []string{}
	}
	b, _ := json.Marshal(brands)
	return string(b)
}

// newPgxPool configures the pool per the migration plan §2: small
// MaxConns (Python's ThreadedConnectionPool already permanently holds
// up to 10 against the same Supabase free-tier connection budget),
// connect through the transaction pooler (port 6543, Supavisor), and
// disable prepared-statement caching — Supavisor in transaction mode
// may route each transaction to a different backend Postgres
// connection, so a named prepared statement from one backend won't
// exist on the next.
func newPgxPool(ctx context.Context) (*pgxpool.Pool, error) {
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		return nil, fmt.Errorf("DATABASE_URL is not set")
	}
	cfg, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		return nil, fmt.Errorf("parse DATABASE_URL: %w", err)
	}

	maxConns := int32(4)
	if v := os.Getenv("PGX_MAX_CONNS"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			maxConns = int32(n)
		}
	}
	cfg.MaxConns = maxConns
	cfg.MinConns = 0
	cfg.MaxConnLifetime = 30 * time.Minute
	cfg.MaxConnIdleTime = 2 * time.Minute
	cfg.ConnConfig.DefaultQueryExecMode = pgx.QueryExecModeDescribeExec

	return pgxpool.NewWithConfig(ctx, cfg)
}

func nullableString(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

// parseFlyerDate parses Flipp's valid_from/valid_to item fields (ISO
// date or datetime text) into a date. Items whose dates don't parse
// are dropped from the batch — items.valid_from/valid_to are NOT NULL,
// matching how the equivalent failure showed up as a per-item
// exception in Python's db.upsert_item loop.
func parseFlyerDate(raw string) (time.Time, bool) {
	if raw == "" {
		return time.Time{}, false
	}
	for _, layout := range []string{time.RFC3339, "2006-01-02T15:04:05", "2006-01-02"} {
		if t, err := time.Parse(layout, raw); err == nil {
			return t, true
		}
	}
	return time.Time{}, false
}

// upsertMerchant ports db/stores.py's upsert_merchant.
func upsertMerchant(ctx context.Context, pool *pgxpool.Pool, m Merchant) error {
	_, err := pool.Exec(ctx, `
		INSERT INTO merchants (id, name) VALUES ($1, $2)
		ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name
	`, m.ID, m.Name)
	return err
}

// upsertFlyer ports db/stores.py's upsert_flyer.
func upsertFlyer(ctx context.Context, pool *pgxpool.Pool, f Flyer, postalCode string) error {
	_, err := pool.Exec(ctx, `
		INSERT INTO flyers (id, merchant_id, postal_code, valid_from, valid_to, scraped_at)
		VALUES ($1, $2, $3, NULLIF($4, '')::timestamptz, NULLIF($5, '')::timestamptz, now())
		ON CONFLICT (id) DO UPDATE SET
			postal_code = EXCLUDED.postal_code,
			valid_from = EXCLUDED.valid_from,
			valid_to = EXCLUDED.valid_to,
			scraped_at = now()
	`, f.ID, f.MerchantID, postalCode, f.ValidFrom, f.ValidTo)
	if err != nil {
		return err
	}

	// Record that this flyer reaches this postal code. flyers.postal_code
	// above is last-write-wins and so only ever remembers one region;
	// this junction is the authoritative many-to-many mapping every
	// region-scoped read goes through. Bumping last_seen_at on conflict
	// leaves a trail for expiring mappings Flipp stops serving.
	if postalCode != "" {
		_, err = pool.Exec(ctx, `
			INSERT INTO flyer_postal_codes (flyer_id, postal_code)
			VALUES ($1, $2)
			ON CONFLICT (flyer_id, postal_code) DO UPDATE SET last_seen_at = now()
		`, f.ID, postalCode)
	}
	return err
}

// Mirrors the items uniqueness key. Keyed on flyerID, not postal code:
// Flipp serves one flyer to many nearby postal codes, so keying on
// postal code re-inserted a full copy of every item per extra postal
// code in the same area (44% of the table at migration time). Which
// regions a flyer reaches lives in flyer_postal_codes instead.
type itemKey struct {
	merchantID int64
	flyerID    int64
	nameNorm   string
	validFrom  string
}

// writeItemBatch ports the batched-upsert half of db/items.py's
// upsert_item — one multi-row UNNEST upsert instead of one row at a
// time. category/subcategory are intentionally never written here
// (left NULL, and NOT in the ON CONFLICT SET list so a re-scraped item
// that was already classified doesn't regress back to NULL) — see the
// migration plan §1.5 for the async Python classification backfill.
func writeItemBatch(ctx context.Context, pool *pgxpool.Pool, items []*Item) (saved int, failed int, err error) {
	valid := make([]*Item, 0, len(items))
	validFromDates := make([]time.Time, 0, len(items))
	validFromKeys := make([]string, 0, len(items))
	validToDates := make([]time.Time, 0, len(items))

	for _, it := range items {
		vf, ok1 := parseFlyerDate(it.ValidFrom)
		vt, ok2 := parseFlyerDate(it.ValidTo)
		if !ok1 || !ok2 {
			failed++
			continue
		}
		valid = append(valid, it)
		validFromDates = append(validFromDates, vf)
		validFromKeys = append(validFromKeys, vf.Format("2006-01-02"))
		validToDates = append(validToDates, vt)
	}
	if len(valid) == 0 {
		return 0, failed, nil
	}

	// Postgres rejects a single multi-row INSERT ... ON CONFLICT DO
	// UPDATE if two source rows share a conflict key ("ON CONFLICT DO
	// UPDATE command cannot affect row a second time") — unlike the old
	// per-item loop, where each item was its own statement and later
	// duplicates simply re-updated the same row. The same item can
	// legitimately appear twice in one scrape (e.g. present in more than
	// one flyer), so dedupe within the batch, keeping the last
	// occurrence — same "last write wins" outcome the old sequential
	// loop produced for the `items` row itself. The one behavior change:
	// only the winning occurrence gets a price_history row instead of
	// one per duplicate.
	lastByKey := make(map[itemKey]int, len(valid))
	for i, it := range valid {
		lastByKey[itemKey{it.MerchantID, it.FlyerID, it.NameNormalized, validFromKeys[i]}] = i
	}
	if len(lastByKey) < len(valid) {
		dedupedIdx := make([]int, 0, len(lastByKey))
		for _, i := range lastByKey {
			dedupedIdx = append(dedupedIdx, i)
		}
		sort.Ints(dedupedIdx)

		dedupedValid := make([]*Item, len(dedupedIdx))
		dedupedFromDates := make([]time.Time, len(dedupedIdx))
		dedupedFromKeys := make([]string, len(dedupedIdx))
		dedupedToDates := make([]time.Time, len(dedupedIdx))
		for j, i := range dedupedIdx {
			dedupedValid[j] = valid[i]
			dedupedFromDates[j] = validFromDates[i]
			dedupedFromKeys[j] = validFromKeys[i]
			dedupedToDates[j] = validToDates[i]
		}
		valid, validFromDates, validFromKeys, validToDates = dedupedValid, dedupedFromDates, dedupedFromKeys, dedupedToDates
	}

	n := len(valid)
	merchantIDs := make([]int64, n)
	flyerIDs := make([]int64, n)
	flippItemIDs := make([]*int64, n)
	postalCodes := make([]string, n)
	names := make([]string, n)
	namesNorm := make([]string, n)
	originalNames := make([]*string, n)
	originalDescriptions := make([]*string, n)
	brandsJSON := make([]string, n)
	prices := make([]float64, n)
	priceUnits := make([]string, n)
	priceUnitFactors := make([]float64, n)
	sizes := make([]*float64, n)
	sizeUnits := make([]*string, n)
	productImages := make([]*string, n)
	cutoutImages := make([]*string, n)
	highConfidences := make([]bool, n)

	for i, it := range valid {
		merchantIDs[i] = it.MerchantID
		flyerIDs[i] = it.FlyerID
		if it.FlippItemID != 0 {
			id := it.FlippItemID
			flippItemIDs[i] = &id
		}
		postalCodes[i] = it.PostalCode
		names[i] = it.Name
		namesNorm[i] = it.NameNormalized
		originalNames[i] = nullableString(it.OriginalName)
		originalDescriptions[i] = nullableString(it.OriginalDescription)
		brandsJSON[i] = marshalBrands(it.Brands)
		prices[i] = it.Price
		priceUnits[i] = string(it.PriceUnit)
		priceUnitFactors[i] = it.PriceUnitFactor
		sizes[i] = it.Size
		if it.SizeUnit != nil {
			s := string(*it.SizeUnit)
			sizeUnits[i] = &s
		}
		productImages[i] = nullableString(it.ProductImage)
		cutoutImages[i] = nullableString(it.CutoutImage)
		highConfidences[i] = it.HighConfidence
	}

	rows, err := pool.Query(ctx, `
		INSERT INTO items (
			merchant_id, flyer_id, flipp_item_id, postal_code, name, name_normalized,
			original_name, original_description, brands,
			price, price_unit, price_unit_factor,
			size, size_unit, product_image, cutout_image,
			high_confidence, valid_from, valid_to
		)
		SELECT
			t.merchant_id, t.flyer_id, t.flipp_item_id, t.postal_code, t.name, t.name_normalized,
			t.original_name, t.original_description,
			-- UNNEST fully flattens multi-dimensional arrays (there is no
			-- "one level at a time" mode), so a per-row TEXT[] can't be
			-- passed as a text[][] parameter — it collapses to bare text
			-- rows, not text[] rows. Passed as JSON text instead and
			-- rebuilt into a real array here.
			ARRAY(SELECT jsonb_array_elements_text(t.brands_json::jsonb)),
			t.price, t.price_unit, t.price_unit_factor,
			t.size, t.size_unit, t.product_image, t.cutout_image,
			t.high_confidence, t.valid_from, t.valid_to
		FROM UNNEST(
			$1::bigint[], $2::bigint[], $3::bigint[], $4::text[], $5::text[], $6::text[],
			$7::text[], $8::text[], $9::text[],
			$10::numeric[], $11::text[], $12::numeric[],
			$13::numeric[], $14::text[], $15::text[], $16::text[],
			$17::boolean[], $18::date[], $19::date[]
		) AS t(
			merchant_id, flyer_id, flipp_item_id, postal_code, name, name_normalized,
			original_name, original_description, brands_json,
			price, price_unit, price_unit_factor,
			size, size_unit, product_image, cutout_image,
			high_confidence, valid_from, valid_to
		)
		ON CONFLICT (merchant_id, flyer_id, name_normalized, valid_from) DO UPDATE SET
			flipp_item_id = EXCLUDED.flipp_item_id,
			name = EXCLUDED.name,
			original_name = EXCLUDED.original_name,
			original_description = EXCLUDED.original_description,
			brands = EXCLUDED.brands,
			price = EXCLUDED.price,
			price_unit = EXCLUDED.price_unit,
			price_unit_factor = EXCLUDED.price_unit_factor,
			size = EXCLUDED.size,
			size_unit = EXCLUDED.size_unit,
			product_image = EXCLUDED.product_image,
			cutout_image = EXCLUDED.cutout_image,
			high_confidence = EXCLUDED.high_confidence,
			valid_to = EXCLUDED.valid_to,
			updated_at = now()
		-- postal_code is deliberately NOT in the SET list above: it is
		-- lineage only now (which scrape first created the row), and the
		-- authoritative region mapping is flyer_postal_codes.
		RETURNING id, merchant_id, flyer_id, name_normalized, valid_from
	`,
		merchantIDs, flyerIDs, flippItemIDs, postalCodes, names, namesNorm,
		originalNames, originalDescriptions, brandsJSON,
		prices, priceUnits, priceUnitFactors,
		sizes, sizeUnits, productImages, cutoutImages,
		highConfidences, validFromDates, validToDates,
	)
	if err != nil {
		return 0, failed + n, fmt.Errorf("batch upsert items: %w", err)
	}

	idByKey := make(map[itemKey]int64, n)
	for rows.Next() {
		var id, merchantID, flyerID int64
		var nameNorm string
		var validFrom time.Time
		if err := rows.Scan(&id, &merchantID, &flyerID, &nameNorm, &validFrom); err != nil {
			rows.Close()
			return 0, failed + n, fmt.Errorf("scan batch upsert result: %w", err)
		}
		idByKey[itemKey{merchantID, flyerID, nameNorm, validFrom.Format("2006-01-02")}] = id
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return 0, failed + n, fmt.Errorf("batch upsert items: %w", err)
	}

	priceHistoryRows := make([][]any, 0, n)
	for i, it := range valid {
		key := itemKey{it.MerchantID, it.FlyerID, it.NameNormalized, validFromKeys[i]}
		id, ok := idByKey[key]
		if !ok {
			failed++
			continue
		}
		priceHistoryRows = append(priceHistoryRows, []any{id, it.MerchantID, it.Price})
	}

	if len(priceHistoryRows) > 0 {
		_, err = pool.CopyFrom(ctx, pgx.Identifier{"price_history"},
			[]string{"item_id", "merchant_id", "price"}, pgx.CopyFromRows(priceHistoryRows))
		if err != nil {
			return 0, failed + n, fmt.Errorf("batch insert price_history: %w", err)
		}
	}

	return len(priceHistoryRows), failed, nil
}
