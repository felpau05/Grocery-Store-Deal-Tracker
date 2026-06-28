import re
from models import LanguageResult, SizeResult, PriceResult, Unit, resolve_unit, unit_token_pattern


# ── French / English detection ───────────────────────────────────────

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

_HAS_SIZE_RE = re.compile(
    rf'\d+(?:\.\d+)?\s*(?:{unit_token_pattern()})\b',
    re.IGNORECASE,
)


def _french_score(text: str) -> float:
    lower = text.lower()
    accents = sum(1 for c in lower if c in FRENCH_ACCENTS)
    words = len(set(lower.split()) & FRENCH_WORDS)
    return accents + words


def pick_english(name: str) -> LanguageResult:
    """Pick the English side of a bilingual 'EN | FR' name.

    If a size exists on only one side, that side wins regardless of
    language score (losing the size is worse than picking French).
    """
    if " | " not in name:
        return LanguageResult(name=name, original_name=name)

    a, b = name.split(" | ", 1)
    a_score, b_score = _french_score(a), _french_score(b)
    flags = []

    a_has_size = bool(_HAS_SIZE_RE.search(a))
    b_has_size = bool(_HAS_SIZE_RE.search(b))

    if a_has_size != b_has_size:
        picked = a if a_has_size else b
        flags.append("size_only_on_other_side")
    elif a_score != b_score:
        picked = b if a_score > b_score else a
        if abs(a_score - b_score) == 1:
            flags.append("bilingual_close")
    else:
        picked = a
        if a != b:
            flags.append("bilingual_tied")

    return LanguageResult(
        name=picked, original_name=name, is_bilingual=True,
        flags=flags, score_a=a_score, score_b=b_score,
    )


# ── Name cleaning ────────────────────────────────────────────────────

def clean_name(name: str) -> str:
    """Strip symbols, normalize whitespace, title-case."""
    name = re.sub(r'[®™]', '', name)
    name = re.sub(r'\s+', ' ', name).strip()
    name = name.title()
    name = name.replace("Pc ", "PC ").replace("'S", "'s")
    return name


# ── Size extraction ──────────────────────────────────────────────────

_UNIT_PATTERN = unit_token_pattern()

_MULTI_SIZE_RE = re.compile(
    rf'\d+(?:\.\d+)?\s*(?:{_UNIT_PATTERN})\b', re.IGNORECASE,
)

SIZE_RE = re.compile(
    # multipack: "12 x 355 mL"
    r',?\s*(?P<count>\d+(?:\.\d+)?)\s*[xX]\s*(?P<unit_size>\d+(?:\.\d+)?)\s*'
    rf'(?P<unit_a>{_UNIT_PATTERN})\b'
    r'|'
    # single "1.5 kg" or range "480-640 g"
    r',?\s*(?P<single>\d+(?:\.\d+)?(?:\s*[-/]\s*\d+(?:\.\d+)?)?)\s*'
    rf'(?P<unit_b>{_UNIT_PATTERN})\b',
    re.IGNORECASE,
)


def extract_size(name: str) -> SizeResult:
    """Pull size from a product name. Converts all units at parse time."""
    match = SIZE_RE.search(name)
    if not match:
        return SizeResult(cleaned_name=name)

    gd = match.groupdict()
    cleaned = name[:match.start()] + name[match.end():]
    cleaned = re.sub(r'\(\s*\)', '', cleaned)  # empty parens left by "(1 Dozen)"
    cleaned = re.sub(r',\s*$', '', cleaned).strip()
    flags = []

    if len(_MULTI_SIZE_RE.findall(name)) >= 2:
        flags.append("multi_size")

    if gd.get("count") and gd.get("unit_size"):
        raw_count = float(gd["count"])
        raw_unit_size = float(gd["unit_size"])
        raw_unit_text = gd["unit_a"]
        unit, factor, f = resolve_unit(raw_unit_text)
        flags.extend(f)
        size = round(raw_unit_size * factor, 3)
        total = round(raw_count * raw_unit_size * factor, 3)
        quantity = raw_count
    else:
        raw_num = gd["single"]
        raw_unit_text = gd["unit_b"]
        unit, factor, f = resolve_unit(raw_unit_text)
        flags.extend(f)

        if re.search(r'[-/]', raw_num):
            parts = re.split(r'\s*[-/]\s*', raw_num)
            values = [float(p) for p in parts]
            raw_value = sum(values) / len(values)
            lo, hi = min(values), max(values)
            if lo > 0 and hi / lo > 1.5:
                flags.append("wide_range")
        else:
            raw_value = float(raw_num)

        total = round(raw_value * factor, 3)
        quantity = None
        size = total

    return SizeResult(
        cleaned_name=cleaned, quantity=quantity, size=size,
        unit=unit, total_size=total, matched_raw=match.group(0), flags=flags,
    )


# ── Price-unit detection ─────────────────────────────────────────────

# Price-per-unit text like "/lb" or "/kg" needs not just a Unit but a
# factor: "$9.99/lb" means $9.99 per 453.592g, so price-per-gram =
# 9.99 / 453.592, NOT 9.99. Reuses resolve_unit (the SAME table
# extract_size uses for sizes) instead of re-deriving these physical
# constants a second time — the price factor is the RECIPROCAL of
# resolve_unit's, since resolve_unit answers "1 of this raw unit = how
# many canonical units" and price needs the inverse: "price per ONE
# canonical unit, given a price quoted per ONE raw unit".
_LB_TO_G = resolve_unit("lb")[1]
_KG_TO_G = resolve_unit("kg")[1]

PRICE_UNIT_RULES: list[tuple[re.Pattern, Unit, float]] = [
    # (pattern, canonical Unit, price_factor — multiply the raw price
    # by this to get the price for ONE canonical unit)
    (re.compile(r'/\s*lb\b|^lb\.?$|^ea/lb$', re.I),        Unit.G,    1 / _LB_TO_G),
    (re.compile(r'\d+\s*lb\b', re.I),                       Unit.G,    1 / _LB_TO_G),
    (re.compile(r'/\s*kg\b', re.I),                         Unit.G,    1 / _KG_TO_G),
    (re.compile(r'/\s*100\s*g\b|per\s*100\s*g\b', re.I),   Unit.G,    1 / 100.0),
    (re.compile(r'\bea(ch)?\b', re.I),                      Unit.EACH, 1.0),
    (re.compile(r'/\s*pkg\b|/\s*bag\b|\bbox\b|\bpack\b', re.I), Unit.EACH, 1.0),
    (re.compile(r'/\s*bunch\b|/\s*skewer\b', re.I),        Unit.EACH, 1.0),
    (re.compile(r'\bplate\b', re.I),                        Unit.EACH, 1.0),
    (re.compile(r'^(sale|\*|‡|†|member pricing|scene\+ member price)$', re.I), Unit.EACH, 1.0),
    (re.compile(r'over limit', re.I),                       Unit.EACH, 1.0),
    (re.compile(r'\bor\b|\bou\b|moins de', re.I),          Unit.EACH, 1.0),
    (re.compile(r'\bsavings\b|\bafter\b', re.I),           Unit.EACH, 1.0),
    (re.compile(r'available for', re.I),                    Unit.EACH, 1.0),
    (re.compile(r'^\s*-\s*\$', re.I),                      Unit.EACH, 1.0),
    (re.compile(r'%\s*APR', re.I),                         Unit.EACH, 1.0),
    (re.compile(r'scan\s+moi', re.I),                      Unit.EACH, 1.0),
    (re.compile(r'\bLARGE\b', re.I),                       Unit.EACH, 1.0),
    (re.compile(r'\bLIMIT\b', re.I),                       Unit.EACH, 1.0),
    (re.compile(r'\bPINT\b', re.I),                        Unit.EACH, 1.0),
    (re.compile(r'^\s*PER\s*$', re.I),                     Unit.EACH, 1.0),
    (re.compile(r'^\s*\d+\.\d+\s*$'),                      Unit.EACH, 1.0),
    (re.compile(r'\+'),                                     Unit.EACH, 1.0),
]


def parse_price_unit(
    text: str | None, unparsed_log: list[str] | None = None,
) -> tuple[Unit | None, float, list[str]]:
    """Map price_text / post_price_text → (Unit | None, price_factor, flags).

    price_factor: multiply the raw price by this to get the price for
    ONE canonical unit (g, mL, or each). 1.0 for EACH and for
    unrecognized text. For "/lb" this is NOT 1.0 — "$9.99/lb" needs
    price_factor = 1/453.592 to become a true $/g price, since 1 lb
    is not 1 g.

    Empty/None → (EACH, 1.0, []). Unrecognized text → (None, 1.0, [flag]).
    """
    if not text:
        return Unit.EACH, 1.0, []
    t = text.strip()
    for pattern, unit, factor in PRICE_UNIT_RULES:
        if pattern.search(t):
            return unit, factor, []
    if unparsed_log is not None:
        unparsed_log.append(text)
    return None, 1.0, ["unrecognized_price_unit_text"]


# ── Price parsing ────────────────────────────────────────────────────

_MULTI_PRICE_RE = re.compile(r'(\d+)\s*(?:for|/)\s*\$?\s*(\d+\.?\d*)', re.I)
_PRICE_NUM_RE = re.compile(r'\d+\.?\d*')


def parse_price(val) -> PriceResult:
    """Coerce a price field to a per-unit float.

    Handles: numeric, "$1.99", "2 for $5.00" → 2.50, "2,99" → 2.99.
    """
    if val is None or val == "":
        return PriceResult(price=None)

    if isinstance(val, (int, float)):
        p = float(val)
        return PriceResult(price=p if p > 0 else None)

    text = str(val).strip()

    multi = _MULTI_PRICE_RE.search(text)
    if multi:
        count, total = int(multi.group(1)), float(multi.group(2))
        if count > 0 and total > 0:
            return PriceResult(
                price=round(total / count, 2), flags=["multi_buy"],
                is_multi_buy=True, multi_count=count, original_total=total,
            )

    text = text.replace("$", "")
    text = re.sub(r'^(\d+),(\d{2})$', r'\1.\2', text)
    text = text.replace(",", "")

    match = _PRICE_NUM_RE.search(text)
    if not match:
        return PriceResult(price=None)
    try:
        p = float(match.group(0))
        if p <= 0:
            return PriceResult(price=None)
        leftover = (text[:match.start()] + text[match.end():]).strip().strip("$").strip()
        return PriceResult(price=p, flags=["string_parsed"] if leftover else [])
    except ValueError:
        return PriceResult(price=None)
    

# ── Non Food Item Filtering ────────────────────────────────────────────────────

NON_FOOD_SINGLE_WORDS = {
    # electronics / tech
    "ipad", "iphone", "macbook", "airpods", "earbuds", "headphones",
    "bluetooth", "gps", "ssd", "processor", "laptop", "tablet",
    "smartphone", "charger", "monitor", "television", "console",
    "smartwatch", "airtag",
    # beauty / personal care
    "shampoo", "conditioner", "moisturizer", "lotion", "cosmetic",
    "makeup", "mascara", "lipstick", "perfume", "cologne", "deodorant",
    "sunscreen", "toothpaste", "skincare", "serum",
    # apparel
    "sneakers", "jeans", "sweater", "jacket", "footwear",
    # general merchandise
    "furniture", "mattress", "stationery",
}
 
NON_FOOD_PHRASES = {
    "wi-fi", "wifi", "usb-c", "noise cancelling",
    "dog treats", "cat litter", "dog food", "cat food", "pet toy",
    "pet treats", "sporting goods", "activewear", "loungewear",
}
 
_NON_FOOD_PHRASE_RES = [
    re.compile(rf'\b{re.escape(p)}\b', re.IGNORECASE) for p in NON_FOOD_PHRASES
]
 
 
def is_food_item(name: str) -> bool:
    """Decide whether a flyer item name looks like a real grocery item.
 
    Whole-word check against NON_FOOD_SINGLE_WORDS, plus a boundary-safe
    phrase check against NON_FOOD_PHRASES. Defaults to True (keep) when
    nothing matches — see module note above for why.
    """
    lower = name.lower()
    words = set(re.findall(r"[a-z0-9'-]+", lower))
 
    if words & NON_FOOD_SINGLE_WORDS:
        return False
    if any(p.search(lower) for p in _NON_FOOD_PHRASE_RES):
        return False
    return True

'''import re
from models import LanguageResult, SizeResult, PriceResult, Unit, resolve_unit, unit_token_pattern


# ── French / English detection ───────────────────────────────────────

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

_HAS_SIZE_RE = re.compile(
    rf'\d+(?:\.\d+)?\s*(?:{unit_token_pattern()})\b',
    re.IGNORECASE,
)


def _french_score(text: str) -> float:
    lower = text.lower()
    accents = sum(1 for c in lower if c in FRENCH_ACCENTS)
    words = len(set(lower.split()) & FRENCH_WORDS)
    return accents + words


def pick_english(name: str) -> LanguageResult:
    """Pick the English side of a bilingual 'EN | FR' name.

    If a size exists on only one side, that side wins regardless of
    language score (losing the size is worse than picking French).
    """
    if " | " not in name:
        return LanguageResult(name=name, original_name=name)

    a, b = name.split(" | ", 1)
    a_score, b_score = _french_score(a), _french_score(b)
    flags = []

    a_has_size = bool(_HAS_SIZE_RE.search(a))
    b_has_size = bool(_HAS_SIZE_RE.search(b))

    if a_has_size != b_has_size:
        picked = a if a_has_size else b
        flags.append("size_only_on_other_side")
    elif a_score != b_score:
        picked = b if a_score > b_score else a
        if abs(a_score - b_score) == 1:
            flags.append("bilingual_close")
    else:
        picked = a
        if a != b:
            flags.append("bilingual_tied")

    return LanguageResult(
        name=picked, original_name=name, is_bilingual=True,
        flags=flags, score_a=a_score, score_b=b_score,
    )


# ── Name cleaning ────────────────────────────────────────────────────

def clean_name(name: str) -> str:
    """Strip symbols, normalize whitespace, title-case."""
    name = re.sub(r'[®™]', '', name)
    name = re.sub(r'\s+', ' ', name).strip()
    name = name.title()
    name = name.replace("Pc ", "PC ").replace("'S", "'s")
    return name


# ── Size extraction ──────────────────────────────────────────────────

_UNIT_PATTERN = unit_token_pattern()

_MULTI_SIZE_RE = re.compile(
    rf'\d+(?:\.\d+)?\s*(?:{_UNIT_PATTERN})\b', re.IGNORECASE,
)

SIZE_RE = re.compile(
    # multipack: "12 x 355 mL"
    r',?\s*(?P<count>\d+(?:\.\d+)?)\s*[xX]\s*(?P<unit_size>\d+(?:\.\d+)?)\s*'
    rf'(?P<unit_a>{_UNIT_PATTERN})\b'
    r'|'
    # single "1.5 kg" or range "480-640 g"
    r',?\s*(?P<single>\d+(?:\.\d+)?(?:\s*[-/]\s*\d+(?:\.\d+)?)?)\s*'
    rf'(?P<unit_b>{_UNIT_PATTERN})\b',
    re.IGNORECASE,
)


def extract_size(name: str) -> SizeResult:
    """Pull size from a product name. Converts all units at parse time."""
    match = SIZE_RE.search(name)
    if not match:
        return SizeResult(cleaned_name=name)

    gd = match.groupdict()
    cleaned = name[:match.start()] + name[match.end():]
    cleaned = re.sub(r'\(\s*\)', '', cleaned)  # empty parens left by "(1 Dozen)"
    cleaned = re.sub(r',\s*$', '', cleaned).strip()
    flags = []

    if len(_MULTI_SIZE_RE.findall(name)) >= 2:
        flags.append("multi_size")

    if gd.get("count") and gd.get("unit_size"):
        raw_count = float(gd["count"])
        raw_unit_size = float(gd["unit_size"])
        raw_unit_text = gd["unit_a"]
        unit, factor, f = resolve_unit(raw_unit_text)
        flags.extend(f)
        size = round(raw_unit_size * factor, 3)
        total = round(raw_count * raw_unit_size * factor, 3)
        quantity = raw_count
    else:
        raw_num = gd["single"]
        raw_unit_text = gd["unit_b"]
        unit, factor, f = resolve_unit(raw_unit_text)
        flags.extend(f)

        if re.search(r'[-/]', raw_num):
            parts = re.split(r'\s*[-/]\s*', raw_num)
            values = [float(p) for p in parts]
            raw_value = sum(values) / len(values)
            lo, hi = min(values), max(values)
            if lo > 0 and hi / lo > 1.5:
                flags.append("wide_range")
        else:
            raw_value = float(raw_num)

        total = round(raw_value * factor, 3)
        quantity = None
        size = total

    return SizeResult(
        cleaned_name=cleaned, quantity=quantity, size=size,
        unit=unit, total_size=total, matched_raw=match.group(0), flags=flags,
    )


# ── Price-unit detection ─────────────────────────────────────────────

PRICE_UNIT_RULES: list[tuple[re.Pattern, Unit]] = [
    (re.compile(r'/\s*lb\b|^lb\.?$|^ea/lb$', re.I),        Unit.G),
    (re.compile(r'\d+\s*lb\b', re.I),                       Unit.G),
    (re.compile(r'/\s*kg\b', re.I),                         Unit.G),
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


def parse_price_unit(
    text: str | None, unparsed_log: list[str] | None = None,
) -> tuple[Unit | None, list[str]]:
    """Map price_text / post_price_text → (Unit | None, flags).

    Empty/None → (EACH, []). Unrecognized text → (None, [flag]).
    """
    if not text:
        return Unit.EACH, []
    t = text.strip()
    for pattern, unit in PRICE_UNIT_RULES:
        if pattern.search(t):
            return unit, []
    if unparsed_log is not None:
        unparsed_log.append(text)
    return None, ["unrecognized_price_unit_text"]


# ── Price parsing ────────────────────────────────────────────────────

_MULTI_PRICE_RE = re.compile(r'(\d+)\s*(?:for|/)\s*\$?\s*(\d+\.?\d*)', re.I)
_PRICE_NUM_RE = re.compile(r'\d+\.?\d*')


def parse_price(val) -> PriceResult:
    """Coerce a price field to a per-unit float.

    Handles: numeric, "$1.99", "2 for $5.00" → 2.50, "2,99" → 2.99.
    """
    if val is None or val == "":
        return PriceResult(price=None)

    if isinstance(val, (int, float)):
        p = float(val)
        return PriceResult(price=p if p > 0 else None)

    text = str(val).strip()

    multi = _MULTI_PRICE_RE.search(text)
    if multi:
        count, total = int(multi.group(1)), float(multi.group(2))
        if count > 0 and total > 0:
            return PriceResult(
                price=round(total / count, 2), flags=["multi_buy"],
                is_multi_buy=True, multi_count=count, original_total=total,
            )

    text = text.replace("$", "")
    text = re.sub(r'^(\d+),(\d{2})$', r'\1.\2', text)
    text = text.replace(",", "")

    match = _PRICE_NUM_RE.search(text)
    if not match:
        return PriceResult(price=None)
    try:
        p = float(match.group(0))
        if p <= 0:
            return PriceResult(price=None)
        leftover = (text[:match.start()] + text[match.end():]).strip().strip("$").strip()
        return PriceResult(price=p, flags=["string_parsed"] if leftover else [])
    except ValueError:
        return PriceResult(price=None)
    

# ── Non Food Item Filtering ────────────────────────────────────────────────────

NON_FOOD_SINGLE_WORDS = {
    # electronics / tech
    "ipad", "iphone", "macbook", "airpods", "earbuds", "headphones",
    "bluetooth", "gps", "ssd", "processor", "laptop", "tablet",
    "smartphone", "charger", "monitor", "television", "console",
    "smartwatch", "airtag",
    # beauty / personal care
    "shampoo", "conditioner", "moisturizer", "lotion", "cosmetic",
    "makeup", "mascara", "lipstick", "perfume", "cologne", "deodorant",
    "sunscreen", "toothpaste", "skincare", "serum",
    # apparel
    "sneakers", "jeans", "sweater", "jacket", "footwear",
    # general merchandise
    "furniture", "mattress", "stationery",
}
 
NON_FOOD_PHRASES = {
    "wi-fi", "wifi", "usb-c", "noise cancelling",
    "dog treats", "cat litter", "dog food", "cat food", "pet toy",
    "pet treats", "sporting goods", "activewear", "loungewear",
}
 
_NON_FOOD_PHRASE_RES = [
    re.compile(rf'\b{re.escape(p)}\b', re.IGNORECASE) for p in NON_FOOD_PHRASES
]
 
 
def is_food_item(name: str) -> bool:
    """Decide whether a flyer item name looks like a real grocery item.
 
    Whole-word check against NON_FOOD_SINGLE_WORDS, plus a boundary-safe
    phrase check against NON_FOOD_PHRASES. Defaults to True (keep) when
    nothing matches — see module note above for why.
    """
    lower = name.lower()
    words = set(re.findall(r"[a-z0-9'-]+", lower))
 
    if words & NON_FOOD_SINGLE_WORDS:
        return False
    if any(p.search(lower) for p in _NON_FOOD_PHRASE_RES):
        return False
    return True
'''