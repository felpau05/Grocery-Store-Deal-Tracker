package main

import "testing"

// Spot-checks against known backend/flipp_scraper/parser.py behavior —
// not exhaustive, just enough to catch a botched regex/logic port
// before this ever touches real Flipp data.

func TestCleanName(t *testing.T) {
	cases := map[string]string{
		"chicken breast®":    "Chicken Breast",
		"  extra   spaces  ": "Extra Spaces",
		"pc bacon":           "PC Bacon",
		"kellogg's cereal":   "Kellogg's Cereal",
	}
	for in, want := range cases {
		if got := cleanName(in); got != want {
			t.Errorf("cleanName(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestExtractSizeMultipack(t *testing.T) {
	res := extractSize("Pepsi 12 x 355 mL")
	if res.unit == nil || *res.unit != UnitML {
		t.Fatalf("expected ML unit, got %v", res.unit)
	}
	if res.totalSize == nil || *res.totalSize != 4260 {
		t.Fatalf("expected total_size 4260, got %v", res.totalSize)
	}
	if res.quantity == nil || *res.quantity != 12 {
		t.Fatalf("expected quantity 12, got %v", res.quantity)
	}
}

func TestExtractSizeSingle(t *testing.T) {
	res := extractSize("Ground Beef 1.5 kg")
	if res.unit == nil || *res.unit != UnitG {
		t.Fatalf("expected G unit, got %v", res.unit)
	}
	if res.totalSize == nil || *res.totalSize != 1500 {
		t.Fatalf("expected total_size 1500, got %v", res.totalSize)
	}
	if res.cleanedName != "Ground Beef" {
		t.Fatalf("expected cleaned name %q, got %q", "Ground Beef", res.cleanedName)
	}
}

func TestExtractSizeDecimalComma(t *testing.T) {
	res := extractSize("Fromage 2,85 g")
	if res.totalSize == nil || *res.totalSize != 2.85 {
		t.Fatalf("expected total_size 2.85, got %v", res.totalSize)
	}
}

func TestPickEnglishPrefersSizeSide(t *testing.T) {
	res := pickEnglish("Chicken | Poulet 500 g")
	if res.name != "Poulet 500 g" {
		t.Fatalf("expected size side to win, got %q", res.name)
	}
	found := false
	for _, f := range res.flags {
		if f == "size_only_on_other_side" {
			found = true
		}
	}
	if !found {
		t.Fatalf("expected size_only_on_other_side flag, got %v", res.flags)
	}
}

func TestPickEnglishNoBilingual(t *testing.T) {
	res := pickEnglish("Just Milk")
	if res.name != "Just Milk" || res.isBilingual {
		t.Fatalf("unexpected result for non-bilingual name: %+v", res)
	}
}

func TestParsePriceMultiBuy(t *testing.T) {
	res := parsePrice("2 for $5.00")
	if res.price == nil || *res.price != 2.50 {
		t.Fatalf("expected price 2.50, got %v", res.price)
	}
	if !res.isMultiBuy || res.multiCount != 2 {
		t.Fatalf("expected multi-buy count 2, got %+v", res)
	}
}

func TestParsePriceDollarString(t *testing.T) {
	res := parsePrice("$3.99")
	if res.price == nil || *res.price != 3.99 {
		t.Fatalf("expected price 3.99, got %v", res.price)
	}
}

func TestParsePriceDecimalComma(t *testing.T) {
	res := parsePrice("2,99")
	if res.price == nil || *res.price != 2.99 {
		t.Fatalf("expected price 2.99, got %v", res.price)
	}
}

func TestParsePriceNumeric(t *testing.T) {
	res := parsePrice(4.49)
	if res.price == nil || *res.price != 4.49 {
		t.Fatalf("expected price 4.49, got %v", res.price)
	}
}

func TestParsePriceNilAndZero(t *testing.T) {
	if res := parsePrice(nil); res.price != nil {
		t.Fatalf("expected nil price for nil input, got %v", res.price)
	}
	if res := parsePrice(0.0); res.price != nil {
		t.Fatalf("expected nil price for zero, got %v", res.price)
	}
}

func TestParsePriceUnitPerPound(t *testing.T) {
	res := parsePriceUnit("$4.99/lb")
	if res.unit == nil || *res.unit != UnitG {
		t.Fatalf("expected G unit, got %v", res.unit)
	}
	want := 1 / 453.592
	if diff := res.factor - want; diff > 1e-9 || diff < -1e-9 {
		t.Fatalf("expected factor %v, got %v", want, res.factor)
	}
}

func TestParsePriceUnitEach(t *testing.T) {
	res := parsePriceUnit("ea")
	if res.unit == nil || *res.unit != UnitEach {
		t.Fatalf("expected EACH unit, got %v", res.unit)
	}
}

func TestParsePriceUnitEmpty(t *testing.T) {
	res := parsePriceUnit("")
	if res.unit == nil || *res.unit != UnitEach || res.factor != 1.0 {
		t.Fatalf("expected (EACH, 1.0) for empty text, got %+v", res)
	}
}

func TestNormalizeName(t *testing.T) {
	if got := normalizeName("  Chicken   Breast  "); got != "chicken breast" {
		t.Fatalf("normalizeName mismatch: %q", got)
	}
}

func TestRunPipelineDropsNoPrice(t *testing.T) {
	raw := RawItem{"name": "No Price Item", "merchant_id": float64(1), "flyer_id": float64(1)}
	merchant := Merchant{ID: 1, Name: "Test Store"}
	if item := runPipeline(raw, merchant, "postal_code"); item != nil {
		t.Fatalf("expected nil item for missing price, got %+v", item)
	}
}

func TestRunPipelineBasic(t *testing.T) {
	raw := RawItem{
		"name": "Ground Beef 1.5 kg", "merchant_id": float64(1), "flyer_id": float64(1),
		"id": float64(999), "current_price": "$9.99", "price_text": "ea",
		"valid_from": "2024-01-01", "valid_to": "2024-01-07",
	}
	merchant := Merchant{ID: 1, Name: "Test Store"}
	item := runPipeline(raw, merchant, "postal_code")
	if item == nil {
		t.Fatal("expected a parsed item, got nil")
	}
	if item.Price != 9.99 {
		t.Fatalf("expected price 9.99, got %v", item.Price)
	}
	if item.Size == nil || *item.Size != 1500 {
		t.Fatalf("expected size 1500, got %v", item.Size)
	}
	if item.Name != "Ground Beef" {
		t.Fatalf("expected name %q, got %q", "Ground Beef", item.Name)
	}
	if item.NameNormalized != "ground beef" {
		t.Fatalf("expected normalized name %q, got %q", "ground beef", item.NameNormalized)
	}
}
