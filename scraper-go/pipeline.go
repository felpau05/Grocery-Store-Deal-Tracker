package main

import (
	"regexp"
	"strconv"
)

// Port of backend/flipp_scraper/pipeline.py, minus step_classify —
// classification stays in Python, decoupled via an async backfill (see
// scraper-go/README.md and the migration plan). Go's items are always
// written with category/subcategory NULL.
//
// Ordering constraint preserved from Python: pickEnglish before
// extractSize (pickEnglish discards half the string; a size on that
// side would be lost otherwise).

// prePriceCountRe matches "2/", "3 /", "2 for", "2 FOR" — a digit
// followed by "/" or "for". Mirrors pipeline.py's _PRE_PRICE_COUNT_RE:
// deliberately strict so pure decorative pre_price_text ("SALE", "PC
// Optimum Members-Only Price") never gets concatenated with
// current_price and spuriously trips the "string_parsed" flag.
var prePriceCountRe = regexp.MustCompile(`(?i)^\s*\d+\s*(?:/|for)\s*$`)

// runPipeline ports run_pipeline: run one raw item through the
// (classification-free) pipeline, returning nil for items with no
// name or no parseable price — a drop, not an error.
func runPipeline(raw RawItem, merchant Merchant, postalCode string) *Item {
	p := newParsedItem(raw, merchant)

	// step_pick_english
	nameResult := pickEnglish(rawString(raw, "name"))
	descResult := pickEnglish(rawString(raw, "description"))
	p.name = nameResult.name
	p.originalName = nameResult.originalName
	p.description = descResult.name
	p.originalDescription = descResult.originalName
	p.flags = append(p.flags, nameResult.flags...)

	// step_extract_size
	nameSource := p.name
	if nameSource == "" {
		nameSource = rawString(raw, "name")
	}
	descSource := p.description
	if descSource == "" {
		descSource = rawString(raw, "description")
	}
	p.nameWithoutSize = extractSize(nameSource).cleanedName

	sizeSources := [][2]string{{"name", nameSource}, {"description", descSource}}
	sizeRes, sizeField := parseFieldsInOrder(sizeSources,
		func(s string) sizeResult { return extractSize(s) },
		func(r sizeResult) bool { return r.unit != nil },
	)
	if sizeField != "" {
		p.size = sizeRes.totalSize
		p.sizeUnit = sizeRes.unit
		p.flags = append(p.flags, sizeRes.flags...)
	}

	// step_clean_name
	cleanSource := p.nameWithoutSize
	if cleanSource == "" {
		cleanSource = p.name
	}
	if cleanSource == "" {
		cleanSource = rawString(raw, "name")
	}
	p.cleanName = cleanName(cleanSource)

	// step_parse_price
	preText := rawString(raw, "pre_price_text")
	current := raw["current_price"]
	var combined any
	if prePriceCountRe.MatchString(preText) {
		combined = combinePreAndPrice(preText, current)
	} else {
		combined = current
	}
	priceRes := parsePrice(combined)
	p.price = priceRes.price
	p.flags = append(p.flags, priceRes.flags...)

	// step_parse_price_unit
	priceUnitSources := [][2]string{
		{"price_text", rawString(raw, "price_text")},
		{"post_price_text", rawString(raw, "post_price_text")},
	}
	puRes, _ := parseFieldsInOrder(priceUnitSources,
		func(s string) priceUnitResult { return parsePriceUnit(s) },
		func(r priceUnitResult) bool { return r.unit != nil },
	)
	p.priceUnit = puRes.unit
	p.priceUnitFactor = puRes.factor
	p.flags = append(p.flags, puRes.flags...)

	return p.toItem(postalCode)
}

func combinePreAndPrice(preText string, current any) string {
	var currentStr string
	switch v := current.(type) {
	case string:
		currentStr = v
	case float64:
		currentStr = formatFloatLikePython(v)
	case nil:
		currentStr = "None"
	default:
		currentStr = ""
	}
	return trimBoth(preText + " " + currentStr)
}

// formatFloatLikePython renders a JSON-decoded number for concatenation
// into the "pre_price current_price" string parse_price then re-parses
// — the exact decimal formatting doesn't need to match Python's str()
// byte-for-byte, only to contain the same digits, since only the digit
// run itself is extracted downstream.
func formatFloatLikePython(f float64) string {
	return strconv.FormatFloat(f, 'f', -1, 64)
}

func trimBoth(s string) string {
	for len(s) > 0 && (s[0] == ' ' || s[0] == '\t' || s[0] == '\n') {
		s = s[1:]
	}
	for len(s) > 0 && (s[len(s)-1] == ' ' || s[len(s)-1] == '\t' || s[len(s)-1] == '\n') {
		s = s[:len(s)-1]
	}
	return s
}

// parseFieldsInOrder ports pipeline.py's generic parse_fields_in_order:
// try parseFn on each (field_name, text) pair in order, return the
// first result where hasResult is true. Falls back to the LAST
// attempted result (not a fresh parseFn("")) when at least one field
// had real text, then only to parseFn("") when every field was empty.
func parseFieldsInOrder[R any](sources [][2]string, parseFn func(string) R, hasResult func(R) bool) (R, string) {
	var lastResult R
	haveLast := false
	for _, src := range sources {
		fieldName, text := src[0], src[1]
		if text == "" {
			continue
		}
		lastResult = parseFn(text)
		haveLast = true
		if hasResult(lastResult) {
			return lastResult, fieldName
		}
	}
	if haveLast {
		return lastResult, ""
	}
	return parseFn(""), ""
}
