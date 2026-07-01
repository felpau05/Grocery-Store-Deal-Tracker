"""TF-IDF + Logistic Regression grocery classifier.

Public API:
    classify_item(name)   -> (aisle, department)
    classify_batch(names) -> [(aisle, department), ...]
    train(csv_path)       -> trains and saves model.joblib

Training data: backend/training_data/instacart_labeled.csv
Columns: product_name, aisle, department

If model.joblib doesn't exist, classify_* return ("other", "other")
without crashing — the rest of the pipeline continues unaffected.
"""

from __future__ import annotations

import logging
from pathlib import Path

logger = logging.getLogger("flippwatch.classifier")

_MODEL_PATH = Path(__file__).parent / "model.joblib"
_model: dict | None = None
_model_loaded = False   # True once a load attempt has been made


def _load_model() -> dict | None:
    global _model, _model_loaded
    if _model_loaded:
        return _model
    _model_loaded = True
    if not _MODEL_PATH.exists():
        logger.warning("classifier/model.joblib not found — classify_item will return 'other'")
        return None
    try:
        import joblib
        _model = joblib.load(_MODEL_PATH)
        logger.info("Classifier model loaded from %s", _MODEL_PATH)
    except Exception as exc:
        logger.error("Failed to load classifier model: %s", exc)
    return _model


def classify_item(name: str) -> tuple[str, str]:
    """Return (aisle, department) for one item name.

    Both values are lowercase strings from the Instacart taxonomy
    (e.g. aisle="poultry counter", department="meat seafood").
    Returns ("other", "other") when the model isn't available.
    """
    model = _load_model()
    if model is None or not name:
        return "other", "other"
    aisle = str(model["aisle"].predict([name])[0])
    dept = str(model["dept"].predict([name])[0])
    return aisle, dept


def classify_batch(names: list[str]) -> list[tuple[str, str]]:
    """Classify many names at once — avoids per-call predict overhead."""
    if not names:
        return []
    model = _load_model()
    if model is None:
        return [("other", "other")] * len(names)
    aisles = model["aisle"].predict(names)
    depts = model["dept"].predict(names)
    return [(str(a), str(d)) for a, d in zip(aisles, depts)]


def train(csv_path: str | Path | None = None) -> None:
    """Train and save the classifier.

    csv_path defaults to backend/training_data/instacart_labeled.csv.
    Required columns: product_name, aisle, department.
    """
    import joblib
    import pandas as pd
    from sklearn.feature_extraction.text import TfidfVectorizer
    from sklearn.linear_model import LogisticRegression
    from sklearn.pipeline import Pipeline

    if csv_path is None:
        csv_path = Path(__file__).parent.parent / "training_data" / "instacart_labeled.csv"
    csv_path = Path(csv_path)
    if not csv_path.exists():
        raise FileNotFoundError(f"Training data not found: {csv_path}")

    df = pd.read_csv(csv_path).dropna(subset=["product_name", "aisle", "department"])
    X = df["product_name"].tolist()
    logger.info("Training on %d samples", len(X))

    def _pipe() -> Pipeline:
        return Pipeline([
            ("tfidf", TfidfVectorizer(ngram_range=(1, 2), min_df=2, sublinear_tf=True)),
            ("clf", LogisticRegression(max_iter=1000, C=5.0, class_weight="balanced")),
        ])

    aisle_pipe = _pipe()
    aisle_pipe.fit(X, df["aisle"].tolist())
    logger.info("Aisle classifier trained")

    dept_pipe = _pipe()
    dept_pipe.fit(X, df["department"].tolist())
    logger.info("Department classifier trained")

    joblib.dump({"aisle": aisle_pipe, "dept": dept_pipe}, _MODEL_PATH)
    logger.info("Model saved to %s", _MODEL_PATH)


if __name__ == "__main__":
    import sys
    if "--train" in sys.argv:
        logging.basicConfig(level=logging.INFO)
        train()
    else:
        print("Usage: python -m classifier.classify --train")
