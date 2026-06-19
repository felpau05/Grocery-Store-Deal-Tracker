"""
Parsing utilities for Flipp item data.

Every result carries a `flags` list — empty means high confidence,
non-empty tells you exactly what's uncertain. Check `result.high_confidence`
for the simple filter, or inspect `result.flags` for specific reasons.

Flag reference:
  Size:
    "wide_range"       — range ratio > 1.5x, average may be misleading
    "multi_size"       — 2+ sizes in name, only first grabbed
    "oz_ambiguous"     — bare "oz" used (weight vs fluid uncertain)
    "imperial_converted" — lb/oz was converted (inherent rounding)

  Price:
    "multi_buy"        — "2 for $5" pricing, per-unit is inferred
    "string_parsed"    — price extracted from text, not a clean numeric

  French:
    "bilingual_tied"   — both sides scored equal, defaulted to side A
    "bilingual_close"  — scores differed by only 1 point

Unit enum: G, KG, ML, L, EACH, UNKNOWN.
All weights canonicalize to grams. All volumes to mL.
Ranges use the average. lb → KG, oz → G, fl oz → ML.
"""

import re
from dataclasses import dataclass, field
from enum import Enum


# ═══════════════════════════════════════════════════════════════════════
# Units
# ═══════════════════════════════════════════════════════════════════════

class Unit(Enum):
    G = "g"
    KG = "kg"
    ML = "ml"
    L = "l"
    EACH = "each"
    UNKNOWN = "unknown"


WEIGHT_TO_G = {Unit.G: 1.0, Unit.KG: 1000.0}
VOLUME_TO_ML = {Unit.ML: 1.0, Unit.L: 1000.0}
LB_TO_KG = 0.453592
OZ_TO_G = 28.3495
FLOZ_TO_ML = 29.5735


# ═══════════════════════════════════════════════════════════════════════
# French / English detection
# ═══════════════════════════════════════════════════════════════════════

FRENCH_ACCENTS = set("àâçéèêëîïôùûüœæ")

FRENCH_WORDS = {
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
}


def _french_score(text: str) -> float:
    lower = text.lower()
    accent_count = sum(1 for c in lower if c in FRENCH_ACCENTS)
    word_count = len(set(lower.split()) & FRENCH_WORDS)
    return accent_count + word_count


@dataclass
class LanguageResult:
    name: str                            # the picked (English) side
    is_bilingual: bool = False
    flags: list[str] = field(default_factory=list)
    score_a: float = 0.0                 # french score of side A
    score_b: float = 0.0                 # french score of side B

    @property
    def high_confidence(self) -> bool:
        return len(self.flags) == 0


def pick_english(name: str) -> LanguageResult:
    """Split bilingual 'ENGLISH | FRENCH' and return the English side."""
    if " | " not in name:
        return LanguageResult(name=name)

    a, b = name.split(" | ", 1)
    a_score = _french_score(a)
    b_score = _french_score(b)
    flags = []

    if a_score != b_score:
        picked = b if a_score > b_score else a
        if abs(a_score - b_score) == 1:
            flags.append("bilingual_close")
    else:
        picked = a  # default: side A
        if a != b:  # not identical
            flags.append("bilingual_tied")

    return LanguageResult(
        name=picked,
        is_bilingual=True,
        flags=flags,
        score_a=a_score,
        score_b=b_score,
    )


# ═══════════════════════════════════════════════════════════════════════
# Name cleaning
# ═══════════════════════════════════════════════════════════════════════

def clean_name(name: str) -> str:
    name = re.sub(r'[®™]', '', name)
    name = re.sub(r'\s+', ' ', name).strip()
    name = name.title()
    name = name.replace("Pc ", "PC ").replace("'S", "'s")
    return name


# ═══════════════════════════════════════════════════════════════════════
# Size extraction
# ═══════════════════════════════════════════════════════════════════════

_RAW_UNIT_TABLE: dict[str, tuple[Unit, float]] = {
    "g":     (Unit.G,  1.0),
    "kg":    (Unit.KG, 1.0),
    "ml":    (Unit.ML, 1.0),
    "l":     (Unit.L,  1.0),
    "lb":    (Unit.KG, LB_TO_KG),
    "lbs":   (Unit.KG, LB_TO_KG),
    "oz":    (Unit.G,  OZ_TO_G),
    "fl oz": (Unit.ML, FLOZ_TO_ML),
    "floz":  (Unit.ML, FLOZ_TO_ML),
}

# Detects 2+ size tokens in a name string
_MULTI_SIZE_RE = re.compile(
    r'\d+(?:\.\d+)?\s*(?:kg|g|ml|l|lbs?|fl\s?oz|oz)\b',
    re.IGNORECASE,
)


@dataclass
class SizeResult:
    cleaned_name: str
    quantity: float | None = None
    unit_size: float | None = None
    unit: Unit | None = None
    total_size: float | None = None
    canonical_size: float | None = None
    canonical_unit: str | None = None
    matched_raw: str | None = None
    flags: list[str] = field(default_factory=list)

    @property
    def high_confidence(self) -> bool:
        return len(self.flags) == 0


SIZE_RE = re.compile(
    r',?\s*(?P<count>\d+(?:\.\d+)?)\s*[xX]\s*(?P<unit_size>\d+(?:\.\d+)?)\s*'
    r'(?P<unit_a>kg|g|ml|l|lbs?|fl\s?oz|oz)\b'
    r'|'
    r',?\s*(?P<single>\d+(?:\.\d+)?(?:\s*[-/]\s*\d+(?:\.\d+)?)?)\s*'
    r'(?P<unit_b>kg|g|ml|l|lbs?|fl\s?oz|oz)\b',
    re.IGNORECASE,
)


def _resolve_unit(raw_unit: str) -> tuple[Unit, float]:
    key = re.sub(r'\s+', ' ', raw_unit.lower().strip())
    return _RAW_UNIT_TABLE.get(key, (Unit.UNKNOWN, 1.0))


def _to_canonical(value: float, unit: Unit) -> tuple[float | None, str | None]:
    if unit in WEIGHT_TO_G:
        return round(value * WEIGHT_TO_G[unit], 3), "g"
    if unit in VOLUME_TO_ML:
        return round(value * VOLUME_TO_ML[unit], 3), "ml"
    return None, None


def extract_size(name: str) -> SizeResult:
    """Pull size/multipack info from a product name string.

    Flags:
      "wide_range"          — range ratio > 1.5x
      "multi_size"          — 2+ sizes in name, only first grabbed
      "oz_ambiguous"        — bare oz (weight vs fluid uncertain)
      "imperial_converted"  — lb/oz was converted
    """
    match = SIZE_RE.search(name)
    if not match:
        return SizeResult(cleaned_name=name)

    gd = match.groupdict()
    cleaned = name[:match.start()] + name[match.end():]
    cleaned = re.sub(r',\s*$', '', cleaned).strip()
    flags = []

    # check for multi-size BEFORE parsing (uses original name)
    if len(_MULTI_SIZE_RE.findall(name)) >= 2:
        flags.append("multi_size")

    if gd.get("count") and gd.get("unit_size"):
        raw_count = float(gd["count"])
        raw_unit_size = float(gd["unit_size"])
        raw_unit_text = gd["unit_a"]
        unit, factor = _resolve_unit(raw_unit_text)
        unit_size = round(raw_unit_size * factor, 3)
        total = round(raw_count * raw_unit_size * factor, 3)
        quantity = raw_count
    else:
        raw_num = gd["single"]
        raw_unit_text = gd["unit_b"]
        unit, factor = _resolve_unit(raw_unit_text)

        if re.search(r'[-/]', raw_num):
            parts = re.split(r'\s*[-/]\s*', raw_num)
            values = [float(p) for p in parts]
            raw_value = sum(values) / len(values)  # average

            # wide range flag
            lo, hi = min(values), max(values)
            if lo > 0 and hi / lo > 1.5:
                flags.append("wide_range")
        else:
            raw_value = float(raw_num)

        total = round(raw_value * factor, 3)
        quantity = None
        unit_size = total

    # imperial conversion flags
    raw_lower = raw_unit_text.lower().replace(" ", "")
    if raw_lower in ("lb", "lbs", "oz", "floz"):
        flags.append("imperial_converted")
    if raw_lower == "oz":
        flags.append("oz_ambiguous")

    canon_val, canon_unit = _to_canonical(total, unit)

    return SizeResult(
        cleaned_name=cleaned,
        quantity=quantity,
        unit_size=unit_size,
        unit=unit,
        total_size=total,
        canonical_size=canon_val,
        canonical_unit=canon_unit,
        matched_raw=match.group(0),
        flags=flags,
    )


# ═══════════════════════════════════════════════════════════════════════
# Price-unit detection
# ═══════════════════════════════════════════════════════════════════════

PRICE_UNIT_RULES: list[tuple[re.Pattern, Unit]] = [
    (re.compile(r'/\s*lb\b|^lb\.?$|^ea/lb$', re.I),        Unit.KG),
    (re.compile(r'\d+\s*lb\b', re.I),                       Unit.KG),
    (re.compile(r'/\s*kg\b', re.I),                         Unit.KG),
    (re.compile(r'/\s*100\s*g\b|per\s*100\s*g\b', re.I),   Unit.G),
    (re.compile(r'\bea(ch)?\b', re.I),                      Unit.EACH),
    (re.compile(r'/\s*pkg\b|/\s*bag\b|\bbox\b|\bpack\b', re.I), Unit.EACH),
    (re.compile(r'/\s*bunch\b|/\s*skewer\b', re.I),        Unit.EACH),
    (re.compile(r'\bplate\b', re.I),                        Unit.EACH),
    (re.compile(r'^(sale|\*|‡|†|member pricing|scene\+ member price)$', re.I), Unit.EACH),
    (re.compile(r'over limit', re.I),                       Unit.EACH),
    (re.compile(r'\bor\b|\bou\b|moins de', re.I),          Unit.EACH),
    (re.compile(r'\bsavings\b|\bafter\b', re.I),           Unit.EACH),
    (re.compile(r'available for', re.I),                    Unit.EACH),
    (re.compile(r'^\s*-\s*\$', re.I),                      Unit.EACH),
    (re.compile(r'%\s*APR', re.I),                         Unit.EACH),
    (re.compile(r'scan\s+moi', re.I),                      Unit.EACH),
    (re.compile(r'\bLARGE\b', re.I),                       Unit.EACH),
    (re.compile(r'\bLIMIT\b', re.I),                       Unit.EACH),
    (re.compile(r'\bPINT\b', re.I),                        Unit.EACH),
    (re.compile(r'^\s*PER\s*$', re.I),                     Unit.EACH),
    (re.compile(r'^\s*\d+\.\d+\s*$'),                      Unit.EACH),
    (re.compile(r'\+'),                                     Unit.EACH),
]


def parse_price_unit(text: str | None, unparsed_log: list[str] | None = None) -> Unit:
    if not text:
        return Unit.EACH
    t = text.strip()
    for pattern, unit in PRICE_UNIT_RULES:
        if pattern.search(t):
            return unit
    if unparsed_log is not None:
        unparsed_log.append(text)
    return Unit.UNKNOWN


# ═══════════════════════════════════════════════════════════════════════
# Price parsing
# ═══════════════════════════════════════════════════════════════════════

MULTI_PRICE_RE = re.compile(
    r'(\d+)\s*(?:for|/)\s*\$?\s*(\d+\.?\d*)',
    re.IGNORECASE,
)

PRICE_NUM_RE = re.compile(r'\d+\.?\d*')


@dataclass
class PriceResult:
    price: float | None
    flags: list[str] = field(default_factory=list)
    is_multi_buy: bool = False
    multi_count: int | None = None
    original_total: float | None = None

    @property
    def high_confidence(self) -> bool:
        return self.price is not None and len(self.flags) == 0


def parse_price(val) -> PriceResult:
    """Coerce a price field to a per-unit float.

    Flags:
      "multi_buy"      — "2 for $5" style, per-unit price is inferred
      "string_parsed"  — price extracted from text, not a clean numeric
    """
    if val is None or val == "":
        return PriceResult(price=None)

    if isinstance(val, (int, float)):
        p = float(val)
        return PriceResult(price=p if p > 0 else None)

    text = str(val).strip()

    multi = MULTI_PRICE_RE.search(text)
    if multi:
        count = int(multi.group(1))
        total = float(multi.group(2))
        if count > 0 and total > 0:
            return PriceResult(
                price=round(total / count, 2),
                flags=["multi_buy"],
                is_multi_buy=True,
                multi_count=count,
                original_total=total,
            )

    text = text.replace("$", "")
    text = re.sub(r'^(\d+),(\d{2})$', r'\1.\2', text)
    text = text.replace(",", "")

    match = PRICE_NUM_RE.search(text)
    if not match:
        return PriceResult(price=None)
    try:
        p = float(match.group(0))
        if p <= 0:
            return PriceResult(price=None)
        # flag if string had extra text beyond the number itself
        # ("1.99 each", "$2.99/lb" = flagged; "7.79", "$1.99" = clean)
        leftover = text[:match.start()] + text[match.end():]
        leftover = leftover.strip().strip("$").strip()
        flags = ["string_parsed"] if leftover else []
        return PriceResult(price=p, flags=flags)
    except ValueError:
        return PriceResult(price=None)