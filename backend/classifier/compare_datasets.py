"""Multi-dataset classifier comparison: TF-IDF vs fastText × dataset combos.

Trains department-level classifiers on every combination of:
  inst     — Instacart only (48K rows)
  groc     — GroceryDataset only (1.7K rows, Costco taxonomy)
  inst+groc — Instacart + GroceryDataset
  inst+amz  — Instacart + Amazon (previously called "combined")
  all       — Instacart + GroceryDataset + Amazon

Evaluates each model on three test sets:
  1. Fixed TEST_ITEMS (real Flipp item names)
  2. Held-out Amazon items (20 % of mapped Amazon rows + "other" bucket)
  3. Held-out GroceryDataset items (20 % of the Costco rows)

Run:
    cd backend
    source venv/bin/activate
    python -m classifier.compare_datasets
"""

import re
import tempfile
import logging
from pathlib import Path

import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline

logging.basicConfig(level=logging.INFO, format="%(message)s")
log = logging.getLogger(__name__)

# ── Paths ──────────────────────────────────────────────────────────────────────
_DIR       = Path(__file__).parent
_INSTACART = _DIR.parent / "training_data" / "instacart_labeled.csv"
_AMAZON    = _DIR.parent / "training_data" / "amz_ca_total_products_data_processed.csv"
_GROCERY   = _DIR.parent / "training_data" / "GroceryDataset.csv"

# ── Amazon → Instacart department mapping ──────────────────────────────────────
AMAZON_TO_DEPT: dict[str, str] = {
    "Grocery":                               "pantry",
    "Fresh Flowers  Indoor Plants":          "produce",
    "Baby":                                  "babies",
    "Baby Strollers":                        "babies",
    "Pet Supplies":                          "pets",
    "Backyard Birding":                      "pets",
    "Household Cleaning":                    "household",
    "Laundry Supplies":                      "household",
    "Dishwashing Supplies":                  "household",
    "Household Cleaning Tools":              "household",
    "Beauty":                                "personal care",
    "Bath  Body":                            "personal care",
    "Hair Care":                             "personal care",
    "Shaving  Hair Removal Products":        "personal care",
    "Skin Care Products":                    "personal care",
    "Makeup":                                "personal care",
    "Nail Polish  Nail Decoration Products": "personal care",
    "Beauty Tools  Accessories":             "personal care",
    "Perfume  Cologne":                      "personal care",
    "Salon  Spa Equipment":                  "personal care",
}

# ── GroceryDataset (Costco) → Instacart department mapping ────────────────────
GROCERY_TO_DEPT: dict[str, str] = {
    "Bakery & Desserts":              "bakery",
    "Beverages & Water":              "beverages",
    "Breakfast":                      "breakfast and cereal",
    "Candy":                          "snacks",
    "Cleaning Supplies":              "household",
    "Coffee":                         "beverages",
    "Deli":                           "deli",
    "Floral":                         "produce",
    "Gift Baskets":                   "pantry",
    "Household":                      "household",
    "Kirkland Signature Grocery":     "pantry",
    "Laundry Detergent & Supplies":   "household",
    "Meat & Seafood":                 "meat seafood",
    "Organic":                        "pantry",
    "Pantry & Dry Goods":             "pantry",
    "Paper & Plastic Products":       "household",
    "Poultry":                        "meat seafood",
    "Seafood":                        "meat seafood",
    "Snacks":                         "snacks",
}

OTHER_SAMPLE = 20_000

# ── Preprocessing ──────────────────────────────────────────────────────────────
_SIZE_RE      = re.compile(r"\b\d*\.?\d+\s*(?:kg|g|lb|lbs|oz|ml|l|ct|pk|pack|count|x)\b", re.IGNORECASE)
_DIGIT_RE     = re.compile(r"\d+")
_NON_ALPHA_RE = re.compile(r"[^a-z\s]")
_WS_RE        = re.compile(r"\s+")


def preprocess(text: str) -> str:
    t = text.lower()
    t = _SIZE_RE.sub(" ", t)
    t = _DIGIT_RE.sub(" ", t)
    t = _NON_ALPHA_RE.sub(" ", t)
    return _WS_RE.sub(" ", t).strip()


# ── Data loading ───────────────────────────────────────────────────────────────

def load_instacart() -> pd.DataFrame:
    df = pd.read_csv(_INSTACART).dropna(subset=["product_name", "department"])
    df["text"]  = df["product_name"]
    df["label"] = df["department"].str.strip().str.lower()
    return df[["text", "label"]]


def load_amazon() -> tuple[pd.DataFrame, pd.DataFrame]:
    log.info("Loading Amazon CSV (this takes ~20 s for 2 M rows)…")
    df = pd.read_csv(_AMAZON, usecols=["title", "categoryName"]).dropna()

    mask   = df["categoryName"].isin(AMAZON_TO_DEPT)
    mapped = df[mask].copy()
    mapped["label"] = mapped["categoryName"].map(AMAZON_TO_DEPT)
    mapped["text"]  = mapped["title"]

    other        = df[~mask].sample(n=OTHER_SAMPLE, random_state=42).copy()
    other["label"] = "other"
    other["text"]  = other["title"]

    combined = pd.concat(
        [mapped[["text", "label"]], other[["text", "label"]]]
    ).sample(frac=1, random_state=42).reset_index(drop=True)

    log.info(
        "Amazon: %d mapped + %d other = %d total",
        len(mapped), len(other), len(combined),
    )
    return train_test_split(combined, test_size=0.2, random_state=42,
                            stratify=combined["label"])


def load_grocery() -> tuple[pd.DataFrame, pd.DataFrame]:
    df = pd.read_csv(_GROCERY).dropna(subset=["Sub Category", "Title"])
    df["label"] = df["Sub Category"].str.strip().map(GROCERY_TO_DEPT)
    df = df.dropna(subset=["label"])
    df["text"] = df["Title"].str.strip()
    df = df[["text", "label"]]
    log.info(
        "GroceryDataset: %d rows  (%d Sub Categories mapped)",
        len(df), df["label"].nunique(),
    )
    log.info("Label distribution:\n%s", df["label"].value_counts().to_string())
    return train_test_split(df, test_size=0.2, random_state=42,
                            stratify=df["label"])


# ── Model training ─────────────────────────────────────────────────────────────

def train_tfidf(df: pd.DataFrame) -> Pipeline:
    pipe = Pipeline([
        ("tfidf", TfidfVectorizer(ngram_range=(1, 2), min_df=2, sublinear_tf=True,
                                  max_features=100_000)),
        ("clf",   LogisticRegression(C=5.0, class_weight="balanced",
                                     solver="saga", max_iter=300, n_jobs=-1)),
    ])
    X = [preprocess(t) for t in df["text"]]
    pipe.fit(X, df["label"].tolist())
    return pipe


def train_fasttext(df: pd.DataFrame):
    import fasttext
    fasttext.FastText.eprint = lambda *a, **kw: None

    tmp = Path(tempfile.mktemp(suffix=".txt"))
    with tmp.open("w", encoding="utf-8") as f:
        for _, row in df.iterrows():
            label = "__label__" + row["label"].replace(" ", "_")
            text  = preprocess(row["text"])
            if text:
                f.write(f"{label} {text}\n")

    model = fasttext.train_supervised(
        input=str(tmp), epoch=25, lr=0.5, wordNgrams=2,
        dim=100, minCount=2, loss="softmax",
    )
    tmp.unlink(missing_ok=True)
    return model


# ── Prediction helpers ─────────────────────────────────────────────────────────

def _is_tfidf(model) -> bool:
    return isinstance(model, Pipeline)


def pred_single(model, name: str) -> str:
    if _is_tfidf(model):
        return model.predict([preprocess(name)])[0]
    text = preprocess(name)
    labels, _ = model.predict(text or "unknown", k=1)
    return labels[0].removeprefix("__label__").replace("_", " ")


def batch_pred(model, texts: list[str]) -> list[str]:
    if _is_tfidf(model):
        return model.predict([preprocess(t) for t in texts]).tolist()
    processed = [preprocess(t) or "unknown" for t in texts]
    labels_list, _ = model.predict(processed, k=1)
    return [ls[0].removeprefix("__label__").replace("_", " ") for ls in labels_list]


# ── Test items ─────────────────────────────────────────────────────────────────

TEST_ITEMS = [
    # clear grocery
    ("Boneless Chicken Breast 1.5 kg",             "meat seafood"),
    ("Organic 2% Milk 2L",                         "dairy eggs"),
    ("Lay's Potato Chips",                         "snacks"),
    ("Sourdough Bread 600g",                       "bakery"),
    ("Frozen Peas 500g",                           "frozen"),
    ("Pepsi Soft Drinks",                          "beverages"),
    ("Cheddar Cheese Block 400g",                  "dairy eggs"),
    # trickier grocery
    ("Dragonfruit",                                "produce"),
    ("Lychee",                                     "produce"),
    ("Nescafé Gold",                               "beverages"),
    ("Liberté Méditerranée",                       "dairy eggs"),
    ("Beefsteak Tomatoes",                         "produce"),
    ("PC Organics Baby Spinach",                   "produce"),
    # general merchandise — "other" for combined models
    ("Samsung Galaxy Watch8 Classic 46mm",         None),
    ("5000W Inverter Generator With Electric Start", None),
    ("Ozark Trail 3 Person Dome Tent",             None),
    ("Vtech 3 In 1 Starry Sheep",                 None),
]


# ── Reporting ──────────────────────────────────────────────────────────────────

def _mark(pred: str, expected: str | None) -> str:
    if expected is None:
        return "?"
    return "✓" if pred == expected else "✗"


def report_test_items(models: dict) -> None:
    names    = list(models.keys())
    col_item = 44
    col_exp  = 20
    col_pred = 20

    header = f"{'Item':<{col_item}} {'Expected':<{col_exp}}" + "".join(
        f" {n:<{col_pred}}" for n in names
    )
    width = len(header)
    print(f"\n{'═'*width}")
    print("  TEST ITEMS — department prediction")
    print(f"{'═'*width}")
    print(header)
    print(f"{'─'*width}")

    totals   = {n: 0 for n in names}
    eligible = 0

    for item_name, exp in TEST_ITEMS:
        preds = {n: pred_single(m, item_name) for n, m in models.items()}

        if exp is not None:
            eligible += 1
            for n in names:
                if preds[n] == exp:
                    totals[n] += 1

        item_col = item_name[:col_item - 1].ljust(col_item)
        exp_col  = (exp or "—").ljust(col_exp)
        pred_cols = "".join(
            f" {(preds[n] + ' ' + _mark(preds[n], exp)):<{col_pred}}" for n in names
        )
        print(f"{item_col} {exp_col}{pred_cols}")

    print(f"{'─'*width}")
    print(f"\nCorrect ({eligible} labeled items):")
    for n in names:
        pct = 100 * totals[n] // eligible
        print(f"  {n:<26} {totals[n]}/{eligible}  ({pct}%)")


def _report_test_set(label: str, test_df: pd.DataFrame, models: dict) -> None:
    X = test_df["text"].tolist()
    y = test_df["label"].tolist()
    n = len(y)

    print(f"\n{'═'*64}")
    print(f"  {label}  ({n:,} items)")
    print(f"{'═'*64}")

    results: dict[str, list[str]] = {}
    for name, model in models.items():
        log.info("  Evaluating %s…", name)
        preds = batch_pred(model, X)
        results[name] = preds

    print(f"\n{'Model':<28} {'Overall':>10}")
    print(f"{'─'*40}")
    for name, preds in results.items():
        acc = sum(p == t for p, t in zip(preds, y)) / n
        print(f"{name:<28} {acc:>10.1%}")

    # Per-label breakdown
    labels_sorted = test_df["label"].value_counts().index.tolist()
    col_dept = 22
    header = f"\n{'Department':<{col_dept}} {'N':>6}" + "".join(
        f"  {name[:16]:>16}" for name in models
    )
    print(header)
    print("─" * len(header.strip()))
    for dept in labels_sorted:
        idxs  = [i for i, t in enumerate(y) if t == dept]
        count = len(idxs)
        row   = f"{dept:<{col_dept}} {count:>6}"
        for name, preds in results.items():
            correct = sum(preds[i] == dept for i in idxs)
            row += f"  {correct/count:>16.1%}"
        print(row)


# ── Main ───────────────────────────────────────────────────────────────────────

def main() -> None:
    # ── Load data ──────────────────────────────────────────────────────────────
    log.info("Loading Instacart data…")
    instacart = load_instacart()
    log.info("Instacart: %d rows", len(instacart))

    amz_train, amz_test = load_amazon()

    groc_train, groc_test = load_grocery()

    all_train = pd.concat([instacart, amz_train, groc_train]).sample(
        frac=1, random_state=42
    ).reset_index(drop=True)

    datasets = {
        "inst":      instacart,
        "groc":      groc_train,
        "inst+groc": pd.concat([instacart, groc_train]).sample(frac=1, random_state=42).reset_index(drop=True),
        "inst+amz":  pd.concat([instacart, amz_train]).sample(frac=1, random_state=42).reset_index(drop=True),
        "all":       all_train,
    }

    for name, df in datasets.items():
        log.info("Dataset '%s': %d rows", name, len(df))

    # ── Train ──────────────────────────────────────────────────────────────────
    models: dict = {}
    for combo, df in datasets.items():
        log.info("\nTraining TF-IDF (%s)…", combo)
        models[f"TF-IDF ({combo})"] = train_tfidf(df)

        log.info("Training fastText (%s)…", combo)
        models[f"fastText ({combo})"] = train_fasttext(df)

    # ── Evaluate ───────────────────────────────────────────────────────────────
    report_test_items(models)
    _report_test_set("AMAZON HELD-OUT TEST SET", amz_test, models)
    _report_test_set("GROCERYDATASET HELD-OUT TEST SET", groc_test, models)


if __name__ == "__main__":
    main()
