package main

import "strings"

// RawItem mirrors the raw Flipp item dict Python's pipeline works with
// (backend/flipp_scraper: ParsedItem.raw). Deliberately a loose map,
// like Python's dict, since Flipp's JSON shape is accessed via .get()
// everywhere rather than a fixed schema.
type RawItem map[string]any

func rawString(raw RawItem, key string) string {
	v, ok := raw[key]
	if !ok || v == nil {
		return ""
	}
	if s, ok := v.(string); ok {
		return s
	}
	return ""
}

func rawInt64(raw RawItem, key string) int64 {
	v, ok := raw[key]
	if !ok || v == nil {
		return 0
	}
	switch n := v.(type) {
	case float64:
		return int64(n)
	case int64:
		return n
	case int:
		return int64(n)
	}
	return 0
}

// Merchant mirrors backend/models/merchant.py.
type Merchant struct {
	ID     int64
	NameID string
	Name   string
}

func merchantFromRaw(raw map[string]any) Merchant {
	return Merchant{
		ID:     rawInt64(raw, "id"),
		NameID: rawString(raw, "name_identifier"),
		Name:   rawString(raw, "name"),
	}
}

// Flyer mirrors the subset of a Flipp flyer dict run.go reads.
type Flyer struct {
	ID         int64
	MerchantID int64
	ValidFrom  string
	ValidTo    string
}

// parsedItem is the working state threaded through the pipeline steps —
// mirrors backend/models/parsed_item.py's ParsedItem.
type parsedItem struct {
	raw      RawItem
	merchant Merchant

	name                string
	originalName        string
	description         string
	originalDescription string

	size            *float64
	sizeUnit        *Unit
	nameWithoutSize string
	cleanName       string

	price           *float64
	priceUnit       *Unit
	priceUnitFactor float64

	flags []string
}

func newParsedItem(raw RawItem, merchant Merchant) *parsedItem {
	return &parsedItem{raw: raw, merchant: merchant, priceUnitFactor: 1.0}
}

func (p *parsedItem) highConfidence() bool {
	return len(p.flags) == 0
}

func (p *parsedItem) brands() []string {
	raw := rawString(p.raw, "brand")
	if raw == "" {
		return []string{}
	}
	return strings.Split(raw, " | ")
}

// Item is the fully-parsed, DB-ready record — mirrors
// backend/models/clean_item.py's Item, minus category/subcategory:
// Go's write path leaves those NULL by design (filled in later by
// Python's async classification backfill).
type Item struct {
	MerchantID  int64
	FlyerID     int64
	FlippItemID int64 // 0 means NULL — Flipp always assigns positive ids

	PostalCode string

	Name           string
	NameNormalized string

	OriginalName        string
	OriginalDescription string

	Brands []string

	Price           float64
	PriceUnit       Unit
	PriceUnitFactor float64

	Size     *float64
	SizeUnit *Unit

	ProductImage string
	CutoutImage  string

	HighConfidence bool

	ValidFrom string // ISO date/datetime text, cast to ::date in SQL
	ValidTo   string
}

// toItem ports ParsedItem.to_clean_item(): nil when price or name is
// missing — a scrape-pipeline drop, not an error, same as Python's
// "items are lost here" comment in run_pipeline_batch.
func (p *parsedItem) toItem(postalCode string) *Item {
	name := p.cleanName
	if name == "" {
		name = p.name
	}
	if p.price == nil || name == "" {
		return nil
	}

	priceUnit := UnitEach
	if p.priceUnit != nil {
		priceUnit = *p.priceUnit
	}

	return &Item{
		MerchantID:  p.merchant.ID,
		FlyerID:     rawInt64(p.raw, "flyer_id"),
		FlippItemID: rawInt64(p.raw, "id"),

		PostalCode: postalCode,

		Name:           name,
		NameNormalized: normalizeName(name),

		OriginalName:        rawString(p.raw, "name"),
		OriginalDescription: rawString(p.raw, "description"),

		Brands: p.brands(),

		Price:           *p.price,
		PriceUnit:       priceUnit,
		PriceUnitFactor: p.priceUnitFactor,

		Size:     p.size,
		SizeUnit: p.sizeUnit,

		ProductImage: rawString(p.raw, "image_url"),
		CutoutImage:  rawString(p.raw, "cutout_image_url"),

		HighConfidence: p.highConfidence(),

		ValidFrom: rawString(p.raw, "valid_from"),
		ValidTo:   rawString(p.raw, "valid_to"),
	}
}

// normalizeName ports backend/db/items.py's normalize_name — part of
// the items dedup key (merchant_id, postal_code, name_normalized,
// valid_from), must match exactly or Go-written rows silently
// duplicate instead of upserting.
func normalizeName(name string) string {
	return strings.TrimSpace(wsRe.ReplaceAllString(strings.ToLower(name), " "))
}
