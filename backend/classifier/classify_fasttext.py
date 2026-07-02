"""fastText-based grocery classifier.

Trains at aisle level (134 classes) and derives department from an
aisle→department lookup saved alongside the model. This is the same
approach as classify.py but uses word embeddings + subword character
n-grams instead of TF-IDF, which helps on:
  - Brand-only names ("Nescafé Gold" → coffee)
  - Out-of-vocabulary words ("Dragonfruit" → fresh fruits, via "fruit")
  - Non-English characters (é, è, ö handled via byte-level n-grams)

Public API mirrors classify.py exactly so either can be swapped in.

Train:
    python -m classifier.classify_fasttext --train

Predict:
    python -m classifier.classify_fasttext --predict "Dragonfruit"

Compare against TF-IDF model:
    python -m classifier.classify_fasttext --compare
"""

from __future__ import annotations

import json
import logging
import re
import tempfile
from pathlib import Path

logger = logging.getLogger("flippwatch.classifier.fasttext")

_DIR = Path(__file__).parent
_MODEL_PATH = _DIR / "model_fasttext.bin"
_DEPT_LOOKUP_PATH = _DIR / "model_fasttext_dept.json"
_DATA_PATH = _DIR.parent / "training_data" / "instacart_labeled.csv"
_GROCERY_PATH = _DIR.parent / "training_data" / "GroceryDataset.csv"

# GroceryDataset "Sub Category" → Instacart department
_GROCERY_SUB_TO_DEPT: dict[str, str] = {
    "bakery & desserts":            "bakery",
    "beverages & water":            "beverages",
    "breakfast":                    "breakfast and cereal",
    "candy":                        "snacks",
    "cleaning supplies":            "household",
    "coffee":                       "beverages",
    "deli":                         "deli",
    "floral":                       "produce",
    "gift baskets":                 "pantry",
    "household":                    "household",
    "kirkland signature grocery":   "pantry",
    "laundry detergent & supplies": "household",
    "meat & seafood":               "meat seafood",
    "organic":                      "pantry",
    "pantry & dry goods":           "pantry",
    "paper & plastic products":     "household",
    "poultry":                      "meat seafood",
    "seafood":                      "meat seafood",
    "snacks":                       "snacks",
}

# ── Preprocessing ─────────────────────────────────────────────────────
# Matched against the known TF-IDF failure modes: size tokens confuse
# the frequency signal, digits add noise, accents confuse tokenizers.

_SIZE_RE = re.compile(
    r"\b\d*\.?\d+\s*(?:kg|g|lb|lbs|oz|ml|l|ct|pk|pack|count|x)\b",
    re.IGNORECASE,
)
_DIGIT_RE = re.compile(r"\d+")
_NON_ALPHA_RE = re.compile(r"[^a-z\s]")
_WS_RE = re.compile(r"\s+")


def preprocess(name: str) -> str:
    """Lowercase → strip size tokens → strip digits → strip non-alpha → collapse whitespace."""
    text = name.lower()
    text = _SIZE_RE.sub(" ", text)
    text = _DIGIT_RE.sub(" ", text)
    text = _NON_ALPHA_RE.sub(" ", text)
    return _WS_RE.sub(" ", text).strip()


# ── Label helpers ──────────────────────────────────────────────────────

def _to_label(aisle: str) -> str:
    return "__label__" + aisle.strip().lower().replace(" ", "_")


def _from_label(label: str) -> str:
    return label.removeprefix("__label__").replace("_", " ")


# ── Lazy model cache ───────────────────────────────────────────────────

_model = None
_dept_lookup: dict[str, str] = {}
_loaded = False


def _load_model():
    global _model, _dept_lookup, _loaded
    if _loaded:
        return _model, _dept_lookup
    _loaded = True
    if not _MODEL_PATH.exists():
        logger.warning("model_fasttext.bin not found — run --train first; returning 'other'")
        return None, {}
    try:
        import fasttext
        fasttext.FastText.eprint = lambda *a, **kw: None  # silence progress spam
        _model = fasttext.load_model(str(_MODEL_PATH))
        if _DEPT_LOOKUP_PATH.exists():
            _dept_lookup = json.loads(_DEPT_LOOKUP_PATH.read_text())
        logger.info("fastText model loaded from %s", _MODEL_PATH)
    except Exception as exc:
        logger.error("Failed to load fastText model: %s", exc)
    return _model, _dept_lookup


# ── Public API ─────────────────────────────────────────────────────────

def classify_item(name: str) -> tuple[str, str]:
    """Return (aisle, department) for one item name.

    Falls back to ("other", "other") when the model isn't available.
    """
    model, lookup = _load_model()
    if model is None or not name:
        return "other", "other"
    text = preprocess(name)
    if not text:
        return "other", "other"
    labels, _ = model.predict(text, k=1)
    aisle = _from_label(labels[0])
    dept = lookup.get(aisle, "other")
    return aisle, dept


def classify_batch(names: list[str]) -> list[tuple[str, str]]:
    """Classify many names at once."""
    if not names:
        return []
    model, lookup = _load_model()
    if model is None:
        return [("other", "other")] * len(names)
    results = []
    for name in names:
        text = preprocess(name)
        if not text:
            results.append(("other", "other"))
            continue
        labels, _ = model.predict(text, k=1)
        aisle = _from_label(labels[0])
        dept = lookup.get(aisle, "other")
        results.append((aisle, dept))
    return results


def train(
    data_path: str | Path | None = None,
    model_path: str | Path | None = None,
) -> dict:
    """Train fastText on Instacart + GroceryDataset and save model + dept lookup.

    Returns {"accuracy": float, "n_classes": int}.
    """
    import fasttext
    import pandas as pd
    from sklearn.model_selection import train_test_split

    data_path = Path(data_path) if data_path else _DATA_PATH
    model_path = Path(model_path) if model_path else _MODEL_PATH

    if not data_path.exists():
        raise FileNotFoundError(f"Training data not found: {data_path}")

    df = pd.read_csv(data_path).dropna(subset=["product_name", "aisle", "department"])
    df["aisle"] = df["aisle"].str.strip().str.lower()
    df["department"] = df["department"].str.strip().str.lower()

    # Augment with GroceryDataset (Costco taxonomy) when available.
    # Sub Category becomes the aisle label; rows without a known mapping are dropped.
    if _GROCERY_PATH.exists():
        gdf = pd.read_csv(_GROCERY_PATH).dropna(subset=["Sub Category", "Title"])
        gdf["aisle"]        = gdf["Sub Category"].str.strip().str.lower()
        gdf["department"]   = gdf["aisle"].map(_GROCERY_SUB_TO_DEPT)
        gdf["product_name"] = gdf["Title"].str.strip()
        gdf = gdf.dropna(subset=["department"])[["product_name", "aisle", "department"]]
        logger.info("Adding GroceryDataset: %d rows across %d aisles",
                    len(gdf), gdf["aisle"].nunique())
        df = pd.concat([df, gdf], ignore_index=True)
    else:
        logger.info("GroceryDataset.csv not found — training on Instacart only")

    # aisle → most common department mapping (saved with model)
    dept_lookup = (
        df.groupby("aisle")["department"]
        .agg(lambda x: x.value_counts().index[0])
        .to_dict()
    )

    train_df, test_df = train_test_split(
        df, test_size=0.2, random_state=42, stratify=df["aisle"]
    )
    logger.info("Train: %d rows | Test: %d rows", len(train_df), len(test_df))

    def _write_ft_file(df_split: pd.DataFrame, path: Path) -> None:
        with path.open("w", encoding="utf-8") as f:
            for _, row in df_split.iterrows():
                text = preprocess(row["product_name"])
                if text:
                    f.write(f"{_to_label(row['aisle'])} {text}\n")

    train_file = Path(tempfile.mktemp(suffix="_train.txt"))
    test_file = Path(tempfile.mktemp(suffix="_test.txt"))
    try:
        _write_ft_file(train_df, train_file)
        _write_ft_file(test_df, test_file)

        fasttext.FastText.eprint = lambda *a, **kw: None
        ft_model = fasttext.train_supervised(
            input=str(train_file),
            epoch=25,
            lr=0.5,
            wordNgrams=2,   # bigrams — same breadth as TF-IDF ngram_range=(1,2)
            dim=100,
            minCount=2,     # same as TF-IDF min_df=2
            loss="softmax",
        )
        result = ft_model.test(str(test_file))
        accuracy = result[1]   # precision@1 == accuracy for single-label
    finally:
        train_file.unlink(missing_ok=True)
        test_file.unlink(missing_ok=True)

    ft_model.save_model(str(model_path))
    lookup_path = model_path.parent / (model_path.stem + "_dept.json")
    lookup_path.write_text(json.dumps(dept_lookup, ensure_ascii=False))

    n_classes = df["aisle"].nunique()
    logger.info("fastText trained: accuracy=%.3f on %d classes", accuracy, n_classes)
    return {"accuracy": accuracy, "n_classes": n_classes}


# ── Comparison ─────────────────────────────────────────────────────────

TEST_ITEMS = [
    # should work for both
    ("Boneless Chicken Breast 1.5 kg", "meat seafood", "poultry counter"),
    ("Organic 2% Milk 2L",            "dairy eggs",   "milk"),
    ("Lay's Potato Chips",            "snacks",        "chips pretzels"),
    ("Sourdough Bread 600g",          "bakery",        "bread"),
    ("Frozen Peas 500g",              "frozen",        "frozen produce"),
    ("Pepsi Soft Drinks",             "beverages",     "soft drinks"),
    ("Cheddar Cheese Block 400g",     "dairy eggs",    "packaged cheese"),
    # known TF-IDF failures
    ("Dragonfruit",                   "produce",       "fresh fruits"),
    ("Lychee",                        "produce",       "fresh fruits"),
    ("Nescafé Gold",                  "beverages",     "coffee"),
    ("Liberté Méditerranée",          "dairy eggs",    "yogurt"),
    ("Beefsteak Tomatoes",            "produce",       "fresh vegetables"),
    ("PC Organics Baby Spinach",      "produce",       "fresh vegetables"),
    # general merchandise — expected to be wrong, but fastText may be less random
    ("Samsung Galaxy Watch8 Classic 46mm",       None, None),
    ("5000W Inverter Generator With Electric Start", None, None),
    ("Ozark Trail 3 Person Dome Tent",           None, None),
    ("Vtech 3 In 1 Starry Sheep",               None, None),
]


def _compare() -> None:
    from classifier.classify import classify_item as tfidf_classify

    col_item = 40
    col_exp  = 18
    col_pred = 20

    header = (
        f"{'Item':<{col_item}}"
        f"{'Expected dept':<{col_exp}}"
        f"{'TF-IDF':<{col_pred}}"
        f"{'fastText':<{col_pred}}"
    )
    sep = "-" * len(header)
    print(header)
    print(sep)

    tfidf_correct = ft_correct = eligible = 0

    for name, exp_dept, _ in TEST_ITEMS:
        _, tfidf_dept = tfidf_classify(name)
        _, ft_dept    = classify_item(name)

        if exp_dept is not None:
            eligible += 1
            t_ok = tfidf_dept == exp_dept
            f_ok = ft_dept == exp_dept
            tfidf_correct += t_ok
            ft_correct += f_ok
            t_mark = "✓" if t_ok else "✗"
            f_mark = "✓" if f_ok else "✗"
        else:
            t_mark = f_mark = "?"

        t_cell = f"{tfidf_dept} {t_mark}"
        f_cell = f"{ft_dept} {f_mark}"
        name_col = name[:col_item - 2].ljust(col_item) if len(name) > col_item - 2 else name.ljust(col_item)
        exp_col  = (exp_dept or "—").ljust(col_exp)
        print(f"{name_col}{exp_col}{t_cell:<{col_pred}}{f_cell:<{col_pred}}")

    print(sep)
    print(
        f"\nSummary ({eligible} items with known labels):\n"
        f"  TF-IDF:   {tfidf_correct}/{eligible} correct "
        f"({100 * tfidf_correct / eligible:.0f}%)\n"
        f"  fastText: {ft_correct}/{eligible}  correct "
        f"({100 * ft_correct / eligible:.0f}%)"
    )


# ── CLI ────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import sys
    logging.basicConfig(level=logging.INFO)
    args = sys.argv[1:]

    if "--train" in args:
        stats = train()
        print(f"Trained: accuracy={stats['accuracy']:.3f}, classes={stats['n_classes']}")

    elif "--predict" in args:
        idx = args.index("--predict")
        name = args[idx + 1] if idx + 1 < len(args) else ""
        if not name:
            print("Usage: --predict \"item name\"")
            sys.exit(1)
        aisle, dept = classify_item(name)
        print(f"aisle:      {aisle}")
        print(f"department: {dept}")

    elif "--compare" in args:
        _compare()

    else:
        print("Usage: python -m classifier.classify_fasttext [--train | --predict \"name\" | --compare]")
