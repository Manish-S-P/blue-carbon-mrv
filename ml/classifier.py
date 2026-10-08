"""Model 1: ecosystem classifier (mangrove / wetland / other).

Random Forest on Sentinel-2 + Sentinel-1 + elevation, labels from WorldCover 2021.
Accuracy is measured with SPATIAL cross-validation (GroupKFold on "cell"), and is
agreement with WorldCover (itself a modelled map), not field truth.

Run:  python classifier.py      -> trains, prints CV metrics, saves models/classifier.joblib
"""
import json
import os

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score, classification_report, cohen_kappa_score, confusion_matrix
from sklearn.model_selection import GroupKFold

from utils import HERE, S2_FEATURES, load_config

CLASSES = ["mangrove", "wetland", "other"]
FEATURES = S2_FEATURES + ["VV_db", "VH_db", "VV_minus_VH_db", "elevation"]
MODEL_PATH = os.path.join(HERE, "models", "classifier.joblib")


def make_model(cfg):
    return RandomForestClassifier(
        n_estimators=300, min_samples_leaf=2, n_jobs=-1,
        random_state=cfg["training"]["random_state"])


def spatial_cv(df, cfg):
    """Every fold holds out whole grid cells, so nearby pixels never leak between train and test."""
    X, y, groups = df[FEATURES], df["label"], df["cell"]
    pred = np.empty(len(df), dtype=int)
    for train, test in GroupKFold(n_splits=cfg["training"]["cv_folds"]).split(X, y, groups):
        m = make_model(cfg).fit(X.iloc[train], y.iloc[train])
        pred[test] = m.predict(X.iloc[test])
    return pred


def decide(mangrove_frac, cfg):
    """Plot-level decision from the share of plot pixels predicted as mangrove."""
    c = cfg["classifier"]
    if mangrove_frac >= c["accept_mangrove_frac"]:
        return "accept"
    if mangrove_frac >= c["review_mangrove_frac"]:
        return "manual_review"
    return "reject"


def main():
    cfg = load_config()
    df = pd.read_csv(os.path.join(HERE, "data", "classifier_train.csv"))
    print(f"{len(df)} rows, {df['cell'].nunique()} spatial cells")
    print("Missing values per feature (kept as NaN):")
    print(df[FEATURES].isna().sum()[lambda s: s > 0].to_string() or "  none")

    pred = spatial_cv(df, cfg)
    y = df["label"].values
    acc = accuracy_score(y, pred)
    kappa = cohen_kappa_score(y, pred)
    cm = confusion_matrix(y, pred, labels=[0, 1, 2])
    print(f"\nSpatial CV ({cfg['training']['cv_folds']} folds): accuracy={acc:.3f} kappa={kappa:.3f}")
    print(classification_report(y, pred, labels=[0, 1, 2], target_names=CLASSES, digits=3))
    print("Confusion matrix (rows=WorldCover, cols=predicted):")
    print(pd.DataFrame(cm, index=CLASSES, columns=CLASSES).to_string())

    # Final model on all data
    model = make_model(cfg).fit(df[FEATURES], df["label"])
    os.makedirs(os.path.dirname(MODEL_PATH), exist_ok=True)
    joblib.dump({"model": model, "features": FEATURES, "classes": CLASSES}, MODEL_PATH)
    report = {
        "n_rows": int(len(df)), "n_cells": int(df["cell"].nunique()),
        "cv": "GroupKFold on cell", "folds": cfg["training"]["cv_folds"],
        "accuracy": round(acc, 4), "kappa": round(kappa, 4),
        "per_class": classification_report(y, pred, labels=[0, 1, 2], target_names=CLASSES, output_dict=True),
        "confusion_matrix": cm.tolist(), "labels": CLASSES,
        "note": "Agreement with ESA WorldCover 2021 (a modelled product), not field truth.",
    }
    with open(os.path.join(HERE, "models", "classifier_report.json"), "w") as f:
        json.dump(report, f, indent=2)
    print(f"\nSaved {MODEL_PATH}")


if __name__ == "__main__":
    main()
