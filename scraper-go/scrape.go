package main

import (
	"context"
	"fmt"
	"log"
	"sync"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Port of backend/flipp_scraper/run.py's scrape() orchestration, minus
// classification and minus the one-row-at-a-time persistence — see
// pipeline.go and db.go respectively.

const (
	numParseWorkers = 8 // CPU-bound parse stage — the actual point of moving off Python
	batchSize       = 500
)

func stringOrEmpty(v any) string {
	if s, ok := v.(string); ok {
		return s
	}
	return ""
}

// runScrape fetches merchants/flyers/items for postalCode, restricted
// to validMerchants, parses everything with a bounded worker pool, and
// batch-writes to Postgres. Returns the count of items persisted.
func runScrape(ctx context.Context, pool *pgxpool.Pool, postalCode string, validMerchants map[int64]bool) (int, error) {
	hc := newFlippHTTPClient(detailConcurrency)

	log.Printf("scrape %s: fetching merchants", postalCode)
	allMerchants, err := fetchMerchants(ctx, hc, postalCode)
	if err != nil {
		return 0, fmt.Errorf("fetch merchants: %w", err)
	}
	merchants := make(map[int64]Merchant)
	for _, m := range filterMerchants(allMerchants, validMerchants) {
		merchant := merchantFromRaw(m)
		merchants[merchant.ID] = merchant
	}
	for _, m := range merchants {
		if err := upsertMerchant(ctx, pool, m); err != nil {
			log.Printf("scrape %s: could not upsert merchant %d: %v", postalCode, m.ID, err)
		}
	}

	log.Printf("scrape %s: fetching flyers", postalCode)
	allFlyers, err := fetchFlyers(ctx, hc, postalCode)
	if err != nil {
		return 0, fmt.Errorf("fetch flyers: %w", err)
	}
	flyers := filterFlyers(allFlyers, validMerchants)
	log.Printf("scrape %s: %d flyers of %d total", postalCode, len(flyers), len(allFlyers))

	var allItems []RawItem
	for _, f := range flyers {
		flyerID := int64(toFloat64(f["id"]))
		merchantID := int64(toFloat64(f["merchant_id"]))

		flyer := Flyer{
			ID: flyerID, MerchantID: merchantID,
			ValidFrom: stringOrEmpty(f["valid_from"]), ValidTo: stringOrEmpty(f["valid_to"]),
		}
		if err := upsertFlyer(ctx, pool, flyer, postalCode); err != nil {
			log.Printf("scrape %s: could not upsert flyer %d: %v", postalCode, flyerID, err)
		}

		items, err := fetchFlyerItems(ctx, hc, flyerID, postalCode)
		if err != nil {
			log.Printf("scrape %s: merchant %d (flyer %d): failed — %v", postalCode, merchantID, flyerID, err)
			continue
		}
		for _, it := range items {
			it["merchant_id"] = merchantID
			it["flyer_id"] = flyerID
		}
		allItems = append(allItems, items...)
		log.Printf("scrape %s: merchant %d (flyer %d): %d items", postalCode, merchantID, flyerID, len(items))
	}

	sid := generateSid()
	log.Printf("scrape %s: enriching %d items", postalCode, len(allItems))
	enriched := enrichItems(ctx, hc, allItems, postalCode, sid, detailConcurrency)

	log.Printf("scrape %s: parsing + persisting %d items", postalCode, len(enriched))
	saved, failed, err := parseAndPersist(ctx, pool, enriched, merchants, postalCode)
	if err != nil {
		return saved, err
	}
	log.Printf("scrape %s: done — %d saved, %d failed/dropped", postalCode, saved, failed)
	return saved, nil
}

// parseAndPersist runs the CPU-bound parse pipeline across a bounded
// worker pool (this is the whole point of the Go split — true
// multi-core parsing instead of Python's single-threaded loop), then
// batches results into writeItemBatch calls.
func parseAndPersist(ctx context.Context, pool *pgxpool.Pool, rawItems []RawItem, merchants map[int64]Merchant, postalCode string) (saved int, failed int, err error) {
	rawCh := make(chan RawItem)
	parsedCh := make(chan *Item)

	var wg sync.WaitGroup
	for i := 0; i < numParseWorkers; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for raw := range rawCh {
				merchantID := rawInt64(raw, "merchant_id")
				merchant, ok := merchants[merchantID]
				if !ok {
					continue // matches run_pipeline_batch's merchant_dict guard — item dropped
				}
				item := runPipeline(raw, merchant, postalCode)
				if item == nil {
					continue // no price or no name — a parse drop, not an error
				}
				parsedCh <- item
			}
		}()
	}
	go func() {
		wg.Wait()
		close(parsedCh)
	}()
	go func() {
		defer close(rawCh)
		for _, raw := range rawItems {
			select {
			case rawCh <- raw:
			case <-ctx.Done():
				return
			}
		}
	}()

	parseDropped := len(rawItems) // decremented for every item that survives parsing below
	batch := make([]*Item, 0, batchSize)
	flush := func() error {
		if len(batch) == 0 {
			return nil
		}
		n, f, werr := writeItemBatch(ctx, pool, batch)
		saved += n
		failed += f
		batch = batch[:0]
		return werr
	}

	for item := range parsedCh {
		parseDropped--
		batch = append(batch, item)
		if len(batch) == batchSize {
			if werr := flush(); werr != nil {
				return saved, failed + parseDropped, werr
			}
		}
	}
	if werr := flush(); werr != nil {
		return saved, failed + parseDropped, werr
	}

	// parseDropped now counts items with no matching merchant, no
	// price, or no name — a parse-stage drop, not a write failure.
	return saved, failed + parseDropped, nil
}
