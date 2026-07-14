package main

import (
	"regexp"
	"strconv"
	"strings"
	"unicode"
)

// ── French / English detection ──────────────────────────────────────
// Port of backend/flipp_scraper/parser.py's pick_english + helpers.

var frenchAccents = map[rune]bool{}

func init() {
	for _, r := range "àâçéèêëîïôùûüœæ" {
		frenchAccents[r] = true
	}
}

var frenchWords = map[string]bool{}

func init() {
	for _, w := range []string{
		"de", "du", "des", "le", "la", "les", "et", "ou",
		"aux", "avec", "sans", "pour", "sur", "dans", "en",
		"poulet", "porc", "boeuf", "bœuf", "dinde", "veau",
		"frais", "fraîches", "haché", "hachée", "entier", "entière",
		"poitrine", "cuisse", "cuisses", "côtelettes", "longe",
		"lait", "beurre", "fromage", "oeuf", "oeufs", "pain",
		"pomme", "pommes", "terre", "légumes", "salade",
		"lanières", "pépites", "tranches", "morceaux",
		"croustilles", "trempettes", "yogourt", "biscuits",
		"bonbons", "arachides", "guimauves", "petits", "pains",
		"gaufrettes", "miel", "repas", "ustensiles", "bois",
		"huile", "olive", "sandwichs", "friandises", "cocktail",
		"gâteau", "boissons", "papier", "rouleaux",
		"gel", "douche", "filets", "poisson", "emballage",
		"familial", "format", "couronnes", "brocoli",
		"saumon", "riz", "oignons", "rouges", "vieilli",
		"non-vieilli", "ciel", "arc-en-ciel",
	} {
		frenchWords[w] = true
	}
}

// _NUM in Python: decimal point OR decimal comma.
const numPattern = `\d+(?:[.,]\d+)?`

// numToFloat ports _num_to_float: "2,85" -> 2.85, but a comma followed
// by exactly 3 digits is a thousands separator: "1,000" -> 1000.0.
func numToFloat(raw string) (float64, error) {
	raw = strings.TrimSpace(raw)
	if idx := strings.Index(raw, ","); idx >= 0 {
		head, tail := raw[:idx], raw[idx+1:]
		if len(tail) == 3 && !strings.Contains(raw, ".") {
			raw = head + tail
		} else {
			raw = head + "." + tail
		}
	}
	return strconv.ParseFloat(raw, 64)
}

var hasSizeRe = regexp.MustCompile(`(?i)` + numPattern + `\s*(?:` + unitTokenPattern() + `)\b`)

func frenchScore(text string) float64 {
	lower := strings.ToLower(text)
	accents := 0
	for _, r := range lower {
		if frenchAccents[r] {
			accents++
		}
	}
	seen := map[string]bool{}
	words := 0
	for _, w := range strings.Fields(lower) {
		if seen[w] {
			continue
		}
		seen[w] = true
		if frenchWords[w] {
			words++
		}
	}
	return float64(accents + words)
}

type languageResult struct {
	name         string
	originalName string
	isBilingual  bool
	flags        []string
	scoreA       float64
	scoreB       float64
}

// pickEnglish ports pick_english: pick the English side of a bilingual
// "EN | FR" name. If a size exists on only one side, that side wins
// regardless of language score (losing the size is worse than picking
// French).
func pickEnglish(name string) languageResult {
	if !strings.Contains(name, " | ") {
		return languageResult{name: name, originalName: name}
	}

	parts := strings.SplitN(name, " | ", 2)
	a, b := parts[0], parts[1]
	aScore, bScore := frenchScore(a), frenchScore(b)
	var flags []string

	aHasSize := hasSizeRe.MatchString(a)
	bHasSize := hasSizeRe.MatchString(b)

	var picked string
	if aHasSize != bHasSize {
		if aHasSize {
			picked = a
		} else {
			picked = b
		}
		flags = append(flags, "size_only_on_other_side")
	} else if aScore != bScore {
		if aScore > bScore {
			picked = b
		} else {
			picked = a
		}
		if absF(aScore-bScore) == 1 {
			flags = append(flags, "bilingual_close")
		}
	} else {
		picked = a
		if a != b {
			flags = append(flags, "bilingual_tied")
		}
	}

	return languageResult{
		name: picked, originalName: name, isBilingual: true,
		flags: flags, scoreA: aScore, scoreB: bScore,
	}
}

func absF(f float64) float64 {
	if f < 0 {
		return -f
	}
	return f
}

// ── Name cleaning ────────────────────────────────────────────────────

var symbolsRe = regexp.MustCompile(`[®™]`)

// pyTitle approximates Python's str.title(): a word is a run of
// consecutive letters; apostrophes/punctuation are word boundaries
// (Python's own docs flag this as a known quirk — clean_name works
// around it below, same as the Python original).
func pyTitle(s string) string {
	var b strings.Builder
	prevIsLetter := false
	for _, r := range s {
		if unicode.IsLetter(r) {
			if prevIsLetter {
				b.WriteRune(unicode.ToLower(r))
			} else {
				b.WriteRune(unicode.ToUpper(r))
			}
			prevIsLetter = true
		} else {
			b.WriteRune(r)
			prevIsLetter = false
		}
	}
	return b.String()
}

// cleanName ports clean_name: strip symbols, normalize whitespace,
// title-case.
func cleanName(name string) string {
	name = symbolsRe.ReplaceAllString(name, "")
	name = strings.TrimSpace(wsRe.ReplaceAllString(name, " "))
	name = pyTitle(name)
	name = strings.ReplaceAll(name, "Pc ", "PC ")
	name = strings.ReplaceAll(name, "'S", "'s")
	return name
}

// ── Size extraction ──────────────────────────────────────────────────

var unitPattern = unitTokenPattern()

var multiSizeRe = regexp.MustCompile(`(?i)` + numPattern + `\s*(?:` + unitPattern + `)\b`)

var sizeRe = regexp.MustCompile(`(?i)` +
	`,?\s*(?P<count>` + numPattern + `)\s*[xX]\s*(?P<unit_size>` + numPattern + `)\s*(?P<unit_a>` + unitPattern + `)\b` +
	`|` +
	`,?\s*(?P<single>` + numPattern + `(?:\s*[-/]\s*` + numPattern + `)?)\s*(?P<unit_b>` + unitPattern + `)\b`)

var emptyParensRe = regexp.MustCompile(`\(\s*\)`)
var trailingCommaRe = regexp.MustCompile(`,\s*$`)
var rangeSplitRe = regexp.MustCompile(`\s*[-/]\s*`)
var hasRangeSepRe = regexp.MustCompile(`[-/]`)

type sizeResult struct {
	cleanedName string
	quantity    *float64
	size        *float64
	unit        *Unit
	totalSize   *float64
	matchedRaw  string
	flags       []string
}

func namedGroups(re *regexp.Regexp, match []string) map[string]string {
	out := make(map[string]string, len(match))
	for i, name := range re.SubexpNames() {
		if i == 0 || name == "" {
			continue
		}
		out[name] = match[i]
	}
	return out
}

func f64ptr(f float64) *float64 { return &f }

// extractSize ports extract_size: pull size from a product name,
// converting all units at parse time.
func extractSize(name string) sizeResult {
	loc := sizeRe.FindStringSubmatchIndex(name)
	if loc == nil {
		return sizeResult{cleanedName: name}
	}
	match := sizeRe.FindStringSubmatch(name)
	gd := namedGroups(sizeRe, match)

	start, end := loc[0], loc[1]
	cleaned := name[:start] + name[end:]
	cleaned = emptyParensRe.ReplaceAllString(cleaned, "")
	cleaned = strings.TrimSpace(trailingCommaRe.ReplaceAllString(cleaned, ""))

	var flags []string
	if len(multiSizeRe.FindAllString(name, -1)) >= 2 {
		flags = append(flags, "multi_size")
	}

	res := sizeResult{cleanedName: cleaned, matchedRaw: name[start:end]}

	if gd["count"] != "" && gd["unit_size"] != "" {
		rawCount, errC := numToFloat(gd["count"])
		rawUnitSize, errU := numToFloat(gd["unit_size"])
		if errC != nil || errU != nil {
			return res // unparseable numbers — treat as no match, mirrors an impossible case given \d+ pattern
		}
		unit, factor, f := resolveUnit(gd["unit_a"])
		flags = append(flags, f...)
		size := round3(rawUnitSize * factor)
		total := round3(rawCount * rawUnitSize * factor)
		res.quantity = f64ptr(rawCount)
		res.size = f64ptr(size)
		res.totalSize = f64ptr(total)
		res.unit = unit
	} else {
		rawNum := gd["single"]
		unit, factor, f := resolveUnit(gd["unit_b"])
		flags = append(flags, f...)

		var rawValue float64
		if hasRangeSepRe.MatchString(rawNum) {
			parts := rangeSplitRe.Split(rawNum, -1)
			values := make([]float64, 0, len(parts))
			for _, p := range parts {
				v, err := numToFloat(p)
				if err != nil {
					continue
				}
				values = append(values, v)
			}
			if len(values) > 0 {
				sum := 0.0
				lo, hi := values[0], values[0]
				for _, v := range values {
					sum += v
					if v < lo {
						lo = v
					}
					if v > hi {
						hi = v
					}
				}
				rawValue = sum / float64(len(values))
				if lo > 0 && hi/lo > 1.5 {
					flags = append(flags, "wide_range")
				}
			}
		} else {
			v, err := numToFloat(rawNum)
			if err == nil {
				rawValue = v
			}
		}

		total := round3(rawValue * factor)
		res.totalSize = f64ptr(total)
		res.size = f64ptr(total)
		res.unit = unit
	}

	res.flags = flags
	return res
}

// round3/round2 approximate Python's round(x, n) with round-half-away-
// from-zero rather than Python's round-half-to-even — exact .5 ties on
// these float computations are effectively unreachable given the
// upstream decimal inputs, so this diverges only in cases that can't
// occur in practice.
func round3(f float64) float64 {
	shifted := f * 1000
	rounded := float64(int64(shifted + sign(shifted)*0.5))
	return rounded / 1000
}

func sign(f float64) float64 {
	if f < 0 {
		return -1
	}
	return 1
}

// ── Price-unit detection ─────────────────────────────────────────────

var lbToG = func() float64 { _, f, _ := resolveUnit("lb"); return f }()
var kgToG = func() float64 { _, f, _ := resolveUnit("kg"); return f }()

type priceUnitRule struct {
	pattern *regexp.Regexp
	unit    Unit
	factor  float64
}

var priceUnitRules = []priceUnitRule{
	{regexp.MustCompile(`(?i)/\s*lb\b|^lb\.?$|^ea/lb$`), UnitG, 1 / lbToG},
	{regexp.MustCompile(`(?i)\d+\s*lb\b`), UnitG, 1 / lbToG},
	{regexp.MustCompile(`(?i)/\s*kg\b`), UnitG, 1 / kgToG},
	{regexp.MustCompile(`(?i)/\s*100\s*g\b|per\s*100\s*g\b`), UnitG, 1 / 100.0},
	{regexp.MustCompile(`(?i)\bea(ch)?\b`), UnitEach, 1.0},
	{regexp.MustCompile(`(?i)/\s*pkg\b|/\s*bag\b|\bbox\b|\bpack\b`), UnitEach, 1.0},
	{regexp.MustCompile(`(?i)/\s*bunch\b|/\s*skewer\b`), UnitEach, 1.0},
	{regexp.MustCompile(`(?i)\bplate\b`), UnitEach, 1.0},
	{regexp.MustCompile(`(?i)^(sale|\*|‡|†|member pricing|scene\+ member price)$`), UnitEach, 1.0},
	{regexp.MustCompile(`(?i)over limit`), UnitEach, 1.0},
	{regexp.MustCompile(`(?i)\bor\b|\bou\b|moins de`), UnitEach, 1.0},
	{regexp.MustCompile(`(?i)\bsavings\b|\bafter\b`), UnitEach, 1.0},
	{regexp.MustCompile(`(?i)available for`), UnitEach, 1.0},
	{regexp.MustCompile(`(?i)^\s*-\s*\$`), UnitEach, 1.0},
	{regexp.MustCompile(`(?i)%\s*APR`), UnitEach, 1.0},
	{regexp.MustCompile(`(?i)scan\s+moi`), UnitEach, 1.0},
	{regexp.MustCompile(`(?i)\bLARGE\b`), UnitEach, 1.0},
	{regexp.MustCompile(`(?i)\bLIMIT\b`), UnitEach, 1.0},
	{regexp.MustCompile(`(?i)\bPINT\b`), UnitEach, 1.0},
	{regexp.MustCompile(`(?i)^\s*PER\s*$`), UnitEach, 1.0},
	{regexp.MustCompile(`(?i)^\s*\d+\.\d+\s*$`), UnitEach, 1.0},
	{regexp.MustCompile(`\+`), UnitEach, 1.0},
}

type priceUnitResult struct {
	unit   *Unit
	factor float64
	flags  []string
}

// parsePriceUnit ports parse_price_unit: map price_text/post_price_text
// -> (Unit|nil, price_factor, flags). price_factor: multiply the raw
// price by this to get the price for ONE canonical unit.
func parsePriceUnit(text string) priceUnitResult {
	if text == "" {
		u := UnitEach
		return priceUnitResult{unit: &u, factor: 1.0}
	}
	t := strings.TrimSpace(text)
	for _, rule := range priceUnitRules {
		if rule.pattern.MatchString(t) {
			u := rule.unit
			return priceUnitResult{unit: &u, factor: rule.factor}
		}
	}
	return priceUnitResult{unit: nil, factor: 1.0, flags: []string{"unrecognized_price_unit_text"}}
}

// ── Price parsing ────────────────────────────────────────────────────

var multiPriceRe = regexp.MustCompile(`(?i)(\d+)\s*(?:for|/)\s*\$?\s*(\d+\.?\d*)`)
var priceNumRe = regexp.MustCompile(`\d+\.?\d*`)
var commaCentsRe = regexp.MustCompile(`^(\d+),(\d{2})$`)

type priceResult struct {
	price         *float64
	flags         []string
	isMultiBuy    bool
	multiCount    int
	originalTotal float64
}

// parsePrice ports parse_price(val): coerce a price field (number or
// text like "$1.99", "2 for $5.00", "2,99") to a per-unit float.
func parsePrice(val any) priceResult {
	if val == nil {
		return priceResult{}
	}
	switch v := val.(type) {
	case float64:
		if v > 0 {
			return priceResult{price: f64ptr(v)}
		}
		return priceResult{}
	case int:
		if v > 0 {
			return priceResult{price: f64ptr(float64(v))}
		}
		return priceResult{}
	}

	text, ok := val.(string)
	if !ok {
		return priceResult{}
	}
	text = strings.TrimSpace(text)
	if text == "" {
		return priceResult{}
	}

	if m := multiPriceRe.FindStringSubmatch(text); m != nil {
		count, errC := strconv.Atoi(m[1])
		total, errT := strconv.ParseFloat(m[2], 64)
		if errC == nil && errT == nil && count > 0 && total > 0 {
			price := round2(total / float64(count))
			return priceResult{
				price: f64ptr(price), flags: []string{"multi_buy"},
				isMultiBuy: true, multiCount: count, originalTotal: total,
			}
		}
	}

	text = strings.ReplaceAll(text, "$", "")
	text = commaCentsRe.ReplaceAllString(text, "$1.$2")
	text = strings.ReplaceAll(text, ",", "")

	loc := priceNumRe.FindStringIndex(text)
	if loc == nil {
		return priceResult{}
	}
	numStr := text[loc[0]:loc[1]]
	p, err := strconv.ParseFloat(numStr, 64)
	if err != nil || p <= 0 {
		return priceResult{}
	}
	leftover := strings.TrimSpace(text[:loc[0]] + text[loc[1]:])
	leftover = strings.Trim(leftover, "$")
	leftover = strings.TrimSpace(leftover)
	if leftover != "" {
		return priceResult{price: f64ptr(p), flags: []string{"string_parsed"}}
	}
	return priceResult{price: f64ptr(p)}
}

func round2(f float64) float64 {
	shifted := f * 100
	rounded := float64(int64(shifted + sign(shifted)*0.5))
	return rounded / 100
}

// ── Non-food item filtering ─────────────────────────────────────────
// Ported for parity with parser.py, but — same as upstream — currently
// unused: run.go's scrape driver keeps the filter commented out, same
// as Python's run.py (`#kept = [item for item in items if
// is_food_item(...)]`).

var nonFoodSingleWords = map[string]bool{}

func init() {
	for _, w := range []string{
		"ipad", "iphone", "macbook", "airpods", "earbuds", "headphones",
		"bluetooth", "gps", "ssd", "processor", "laptop", "tablet",
		"smartphone", "charger", "monitor", "television", "console",
		"smartwatch", "airtag",
		"shampoo", "conditioner", "moisturizer", "lotion", "cosmetic",
		"makeup", "mascara", "lipstick", "perfume", "cologne", "deodorant",
		"sunscreen", "toothpaste", "skincare", "serum",
		"sneakers", "jeans", "sweater", "jacket", "footwear",
		"furniture", "mattress", "stationery",
	} {
		nonFoodSingleWords[w] = true
	}
}

var nonFoodPhrases = []string{
	"wi-fi", "wifi", "usb-c", "noise cancelling",
	"dog treats", "cat litter", "dog food", "cat food", "pet toy",
	"pet treats", "sporting goods", "activewear", "loungewear",
}

var nonFoodPhraseRes = func() []*regexp.Regexp {
	res := make([]*regexp.Regexp, len(nonFoodPhrases))
	for i, p := range nonFoodPhrases {
		res[i] = regexp.MustCompile(`(?i)\b` + regexp.QuoteMeta(p) + `\b`)
	}
	return res
}()

var wordTokenRe = regexp.MustCompile(`[a-z0-9'-]+`)

// isFoodItem ports is_food_item — not currently called by scrape.go,
// matching upstream's disabled state.
func isFoodItem(name string) bool {
	lower := strings.ToLower(name)
	words := map[string]bool{}
	for _, w := range wordTokenRe.FindAllString(lower, -1) {
		words[w] = true
	}
	for w := range words {
		if nonFoodSingleWords[w] {
			return false
		}
	}
	for _, re := range nonFoodPhraseRes {
		if re.MatchString(lower) {
			return false
		}
	}
	return true
}
