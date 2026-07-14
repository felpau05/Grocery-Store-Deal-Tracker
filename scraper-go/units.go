package main

import (
	"regexp"
	"sort"
	"strings"
)

// Unit mirrors backend/models/units.py's Unit enum.
type Unit string

const (
	UnitG    Unit = "g"
	UnitML   Unit = "ml"
	UnitEach Unit = "each"
)

type unitEntry struct {
	unit   Unit
	factor float64
}

// unitTable is a direct port of backend/models/units.py's UNIT_TABLE —
// single source of truth for unit regexes and conversions to canonical
// units (g, ml, each).
var unitTable = map[string]unitEntry{
	"g":     {UnitG, 1.0},
	"kg":    {UnitG, 1000.0},
	"lb":    {UnitG, 453.592},
	"lbs":   {UnitG, 453.592},
	"oz":    {UnitG, 28.3495},
	"ml":    {UnitML, 1.0},
	"l":     {UnitML, 1000.0},
	"fl oz": {UnitML, 29.5735},
	"floz":  {UnitML, 29.5735},
	"dozen": {UnitEach, 12.0},
}

// unitTableOrder preserves the insertion order above — needed because
// unitTokenPattern's stable sort-by-length-descending must break ties
// the same way Python's insertion-ordered dict + stable sort does.
var unitTableOrder = []string{"g", "kg", "lb", "lbs", "oz", "ml", "l", "fl oz", "floz", "dozen"}

var wsRe = regexp.MustCompile(`\s+`)

// resolveUnit ports resolve_unit(raw_unit): 'kg' -> (Unit.G, 1000.0, []).
// Unknown -> (nil, 1.0, ["unrecognized_size_unit"]).
func resolveUnit(rawUnit string) (unit *Unit, factor float64, flags []string) {
	key := wsRe.ReplaceAllString(strings.ToLower(strings.TrimSpace(rawUnit)), " ")
	entry, ok := unitTable[key]
	if !ok {
		return nil, 1.0, []string{"unrecognized_size_unit"}
	}
	u := entry.unit
	return &u, entry.factor, nil
}

// unitTokenPattern ports unit_token_pattern(): regex alternation of all
// known unit tokens, longest first (stable) so e.g. "lbs" is preferred
// over "lb" and "fl oz"/"dozen" over "floz".
func unitTokenPattern() string {
	tokens := append([]string(nil), unitTableOrder...)
	sort.SliceStable(tokens, func(i, j int) bool {
		return len(tokens[i]) > len(tokens[j])
	})
	escaped := make([]string, len(tokens))
	for i, t := range tokens {
		// None of our tokens contain regex metacharacters other than
		// a literal space (in "fl oz"), which becomes optional \s? to
		// tolerate "fl oz" / "floz" spacing variance in flyer text.
		escaped[i] = strings.ReplaceAll(t, " ", `\s?`)
	}
	return strings.Join(escaped, "|")
}
