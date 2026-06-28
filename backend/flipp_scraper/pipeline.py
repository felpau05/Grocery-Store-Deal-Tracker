"""Pipeline that turns raw Flipp item dicts into clean ParsedItems.

Each step is a function (ParsedItem) -> ParsedItem. The pipeline is
just an ordered list of these functions — add/remove/reorder by editing
the PIPELINE list. Test any step in isolation by calling it directly.

One ordering constraint: step_pick_english before step_extract_size
(pick_english discards half the string; a size on that side is lost).
"""

from .parser import extract_size, pick_english, clean_name, parse_price, parse_price_unit
from models import ParsedItem, LanguageResult, Item


import re

 
# Matches "2/", "3 /", "2 for", "2 FOR" — a digit followed by "/" or
# "for". Deliberately strict: real pre_price_text also includes pure
# decorative text ("SALE", "PC Optimum Members-Only Price", "CRAZY 8")
# that must NOT be combined with current_price — concatenating those
# produces leftover text that wrongly trips parse_price's
# "string_parsed" flag on items that were never actually ambiguous.
# Bare digits ("8") are deliberately excluded too — no real evidence
# they mean a count rather than something else entirely.
_PRE_PRICE_COUNT_RE = re.compile(r'^\s*\d+\s*(?:/|for)\s*$', re.IGNORECASE)


# ── Generic field-fallback helper ───────────────────────────────────
 
def parse_fields_in_order(sources, parse_fn, has_result):
    """Try parse_fn on each (field_name, text) pair in order.
 
    Returns (result, field_name) for the first text where
    has_result(result) is True. Empty/falsy text is skipped without
    calling parse_fn.
 
    If nothing succeeds: returns the LAST attempted result (not a
    fresh parse_fn("") call) when at least one field had real text —
    a failed attempt still carries useful info (e.g. an "unrecognized"
    flag) that a clean empty-string call would silently throw away.
    Only falls back to parse_fn("") when every field was empty and
    nothing was ever actually attempted.
 
    Generic across result shapes — has_result is just a predicate, so
    this works whether parse_fn returns a dataclass (extract_size) or
    a tuple (parse_price_unit).
    """
    last_result = None
    for field_name, text in sources:
        if not text:
            continue
        last_result = parse_fn(text)
        if has_result(last_result):
            return last_result, field_name
    if last_result is not None:
        return last_result, None
    return parse_fn(""), None


# ── Steps ────────────────────────────────────────────────────────────

def step_pick_english(item: ParsedItem) -> ParsedItem:
    """Split bilingual names. Must run before step_extract_size."""
    name_result: LanguageResult = pick_english(item.raw.get("name") or "")
    description_result: LanguageResult = pick_english(item.raw.get("description") or "")

    item.name = name_result.name
    item.original_name = name_result.original_name

    item.description = description_result.name
    item.original_description = description_result.original_name

    # Only need to consider flags for name to affect the confidence of the item
    item.flags.extend(name_result.flags)
    return item


def step_extract_size(item: ParsedItem) -> ParsedItem:
    """Extract size/multipack info from name."""

    name_source = item.name or item.raw.get("name") or ""
    desc_source = item.description or item.raw.get("description") or ""


    item.name_without_size = extract_size(name_source).cleaned_name


    result, source = parse_fields_in_order(
        [("name", name_source), ("description", desc_source)],
        extract_size,
        lambda r: r.unit is not None,
    )
 
    if source is None:
        return item
 
    item.size = result.total_size
    item.size_unit = result.unit
    item.size_source = source
    item.flags.extend(result.flags)
    
    return item



def step_clean_name(item: ParsedItem) -> ParsedItem:
    """Cosmetic cleanup: symbols, whitespace, title-case."""
    source = item.name_without_size or item.name or item.raw.get("name") or ""
    item.clean_name = clean_name(source)
    return item


def step_parse_price(item: ParsedItem) -> ParsedItem:
    """Parse the price field."""
    
    pre_text = item.raw.get("pre_price_text") or ""
    current = item.raw.get("current_price") 
 
    if _PRE_PRICE_COUNT_RE.match(pre_text):
        combined = f"{pre_text} {current}".strip()
    else:
        combined = current
 
    result = parse_price(combined)
    item.price = result.price
    item.flags.extend(result.flags)
    return item


def step_parse_price_unit(item: ParsedItem) -> ParsedItem:
    """Determine the price unit (G, ML, EACH, or None)."""
    sources = [
        ("price_text", item.raw.get("price_text") or ""),
        ("post_price_text", item.raw.get("post_price_text") or ""),
    ]
    (unit, factor, flags), _source = parse_fields_in_order(
        sources, parse_price_unit, lambda r: r[0] is not None,
    )
    item.price_unit = unit
    item.price_unit_factor = factor
    item.flags.extend(flags)
    return item



# ── Pipeline ─────────────────────────────────────────────────────────

PIPELINE: list = [
    step_pick_english,       # must stay before step_extract_size
    step_extract_size,
    step_clean_name,
    step_parse_price,
    step_parse_price_unit,
]

# 
def run_pipeline(raw_item: dict, steps: list | None = None) -> Item  | None:
    """Run one raw item through the pipeline (or a custom subset of steps)."""
    item = ParsedItem(raw=raw_item)
    for step in (steps or PIPELINE):
        item = step(item)
    return item.to_clean_item()


def run_pipeline_batch(raw_items: list[dict], steps: list | None = None) -> list[Item]:
    """Run many items through the pipeline."""
    all_items = [run_pipeline(raw, steps=steps) for raw in raw_items]

    return [item for item in all_items if item is not None]
