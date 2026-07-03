"""Tiny text helpers shared by db.queries (SQL search) and
optimizer.algorithm (in-memory matching), so the two match the same way.
"""

import re


def word_variants(word: str) -> list[str]:
    """Singular/plural spellings of a search word, lowercased.

    "banana" → ["banana", "bananas"]; "berries" → ["berries", "berry"];
    "eggs" → ["egg", "eggs"]. Naive English pluralization on purpose —
    a stemming library is overkill for grocery nouns, and false plurals
    ("hummus" → "hummu") are avoided by only stripping unambiguous
    suffixes.
    """
    w = word.lower()
    variants = {w}
    if w.endswith("ies") and len(w) > 4:
        variants.add(w[:-3] + "y")
    elif w.endswith(("ses", "xes", "zes", "ches", "shes")) and len(w) > 4:
        variants.add(w[:-2])
    elif w.endswith("s") and not w.endswith("ss") and len(w) > 3:
        variants.add(w[:-1])
    else:
        variants.add(w + "s")
        if w.endswith(("s", "x", "z", "ch", "sh")):
            variants.add(w + "es")
        if w.endswith("y") and len(w) > 2 and w[-2] not in "aeiou":
            variants.add(w[:-1] + "ies")
    return sorted(variants)


def variant_alternation(word: str) -> str:
    """Regex alternation of a word's variants, escaped: "banana|bananas".
    Callers wrap it in their own word-boundary anchors (\\b for Python,
    \\m/\\M for Postgres).
    """
    return "|".join(re.escape(v) for v in word_variants(word))


def normalize_postal(raw: str | None) -> str | None:
    """Canonical postal-code form for storage/lookup: uppercase, no
    spaces or dashes. "k2g 7a8" → "K2G7A8". Returns None for empty input.

    Deliberately does NOT validate format — that's the routes' job
    (they 422 on bad input). This only canonicalizes so the region key
    on `items` matches between the scraper's writes and the readers'
    lookups regardless of how the postal code was typed.
    """
    if not raw:
        return None
    return raw.replace(" ", "").replace("-", "").upper()
