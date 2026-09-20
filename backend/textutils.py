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


# ── Meat synonyms ────────────────────────────────────────────────────
# Flyer names often say only the cut ("Top Sirloin Steak", "Peameal
# Bacon"), so a literal search for "beef"/"pork" misses them. Each group
# maps the words a shopper types (`aliases`, any of which also match
# each other directly) to cut names that imply that meat.
#
# Every cut was checked against the real items table. A cut only counts
# when the item text doesn't also mention another animal, seafood, a
# plant-based/pet product, or a non-food word — that's what keeps
# "sirloin" off Pork Sirloin Chops, "t-bone" off dog treats, and "bacon"
# off turkey bacon and bacon-flavour chips. Deliberately left out because
# the data showed them ambiguous: tenderloin, loin, chops, ribs, wings,
# drumsticks (ice cream), strips, breasts, steak, burgers, sausage,
# salami, pepperoni. All patterns are written to work unchanged in both
# Python `re` and Postgres ARE regexes; callers add the word anchors.

_MEAT_GROUPS: dict[str, dict[str, tuple[str, ...]]] = {
    "beef": {
        "aliases": ("beef", "boeuf", "bœuf"),
        "cuts": (
            "sirloin", "strip[- ]?loin", "rib[- ]?eyes?", "rib steaks?",
            "t[- ]?bones?", "porterhouse", "filet mignon", "briskets?",
            "prime rib", "flank steaks?", "bavette", "tri[- ]?tip",
            "eye (of|or) round", "inside round", "outside round",
            "cross rib", "blade (steak|roast)s?", "chuck (steak|roast)s?",
            "short ribs?", "tournedos", "biftecks?", "wagyu", "angus",
            "pastrami", "smoked meat",
        ),
    },
    "pork": {
        "aliases": ("pork", "porc"),
        "cuts": (
            "bacon", "hams?", "jambon", "prosciutto", "pancetta",
            "capicol+o", "capocol+o", "porchetta", "peameal", "lardons?",
            "back ribs?", "side ribs?", "spare ?ribs?",
        ),
    },
    "chicken": {"aliases": ("chicken", "chickens", "poulet"), "cuts": ("cornish hens?",)},
    "turkey": {"aliases": ("turkey", "turkeys", "dinde"), "cuts": ()},
    "lamb": {"aliases": ("lamb", "agneau"), "cuts": ()},
}

# Words that disqualify a cut-only match, beyond the other meat groups'
# own aliases (added per group below).
_CUT_EXCLUDE_COMMON = (
    "veal", "veau", "goat", "duck", "bison", "horse", "venison",
    "fish", "salmon", "basa", "tuna", "cod", "trout", "halibut", "tilapia",
    "pangasius", "swordfish", "shrimps?", "scallops?", "crab",
    "plant[- ]?based", "vegan", "veggie", "vegetarian", "meatless",
    "beyond", "impossible", "lightlife", "gusta",
    "dogs?", "cats?", "pets?", "treats", "chews?", "benebone", "pads",
    "sauces?", "dressings?", "chips", "crackers", "seasonings?",
    "spices?", "flavou?r(ed)?", "buns",
)

# Spellings shoppers type that the item names split differently.
_SPELLINGS = {
    "striploin": "strip[- ]?loin",
    "ribeye": "rib[- ]?eyes?",
    "tbone": "t[- ]?bones?",
    "t-bone": "t[- ]?bones?",
}


def _meat_group_for(word: str) -> str | None:
    variants = set(word_variants(word))
    for head, group in _MEAT_GROUPS.items():
        if variants & set(group["aliases"]):
            return head
    return None


def search_patterns(word: str) -> tuple[str, str | None, str | None]:
    """Unanchored regex alternations for one search word:
    (direct, cuts, exclude).

    An item matches the word if its text hits `direct`, OR hits `cuts`
    without hitting `exclude`. `cuts`/`exclude` are None for words with
    no meat synonyms, in which case `direct` is exactly
    variant_alternation(word) — non-meat searches behave as before.
    """
    w = word.lower()
    head = _meat_group_for(w)
    if head is None:
        return _SPELLINGS.get(w, variant_alternation(w)), None, None

    group = _MEAT_GROUPS[head]
    direct = "|".join(sorted({*word_variants(w), *group["aliases"]}))
    if not group["cuts"]:
        return direct, None, None

    other_aliases = [
        a for other, g in _MEAT_GROUPS.items() if other != head for a in g["aliases"]
    ]
    exclude = "|".join((*other_aliases, *_CUT_EXCLUDE_COMMON))
    return direct, "|".join(group["cuts"]), exclude


def normalize_postal(raw: str | None) -> str | None:
    """Canonical postal-code form for storage/lookup: uppercase, no
    spaces or dashes. Returns None for empty input.

    Deliberately does NOT validate format — that's the routes' job
    (they 422 on bad input). This only canonicalizes so the region key
    on `items` matches between the scraper's writes and the readers'
    lookups regardless of how the postal code was typed.
    """
    if not raw:
        return None
    return raw.replace(" ", "").replace("-", "").upper()
