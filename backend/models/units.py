import re
from enum import Enum

class Unit(Enum):
    G = "g"          # Weight
    ML = "ml"        # Volume
    EACH = "each"    # Quantity


UNIT_TABLE: dict[str, tuple[Unit, float]] = {
    # Single source of truth for unit regexes and conversions.
    # Format: { "token": (CanonicalUnit, Multiplier) }
    # 
    # - token: Lowercase flyer text. (unit_token_pattern() builds its regex from these).
    # - CanonicalUnit: Must be Unit.G, Unit.ML, or Unit.EACH.
    # - Multiplier: Converts raw units to canonical (e.g., "lb": 453.592 means 2lb -> 907.184g).

    "g":     (Unit.G,  1.0),
    "kg":    (Unit.G,  1000.0),
    "lb":    (Unit.G,  453.592),       # LB_TO_G
    "lbs":   (Unit.G,  453.592),       # LB_TO_G
    "oz":    (Unit.G,  28.3495),       # OZ_TO_G
    "ml":    (Unit.ML, 1.0),
    "l":     (Unit.ML, 1000.0),
    "fl oz": (Unit.ML, 29.5735),       # FLOZ_TO_ML
    "floz":  (Unit.ML, 29.5735),       # FLOZ_TO_ML
    "dozen": (Unit.EACH, 12.0),
}

def resolve_unit(raw_unit: str) -> tuple[Unit | None, float, list[str]]:
    """'kg' → (Unit.G, 1000.0, []). Unknown → (None, 1.0, [flag])."""
    key = re.sub(r'\s+', ' ', raw_unit.lower().strip())
    if key not in UNIT_TABLE:
        return None, 1.0, ["unrecognized_size_unit"]
    unit, factor = UNIT_TABLE[key]
    return unit, factor, []


def unit_token_pattern() -> str:
    """Regex alternation for all known unit tokens, built from UNIT_TABLE."""
    tokens = sorted(UNIT_TABLE.keys(), key=len, reverse=True)
    escaped = [re.escape(t).replace(r'\ ', r'\s?') for t in tokens]
    return "|".join(escaped)

    