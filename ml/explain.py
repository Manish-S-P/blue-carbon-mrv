"""SHAP explanations (TreeExplainer) for Model 1 (classifier) and Model 2 (carbon). Not a model itself.

Each function returns a list of {feature, value, shap} sorted by absolute impact, so the web app can
show "why" a plot was accepted or why its carbon estimate is what it is.
"""
import functools

import numpy as np
import pandas as pd
import shap

from estimate import carbon_bundle, classifier_bundle


@functools.lru_cache
def _carbon_explainer():
    return shap.TreeExplainer(carbon_bundle()["model"])


@functools.lru_cache
def _classifier_explainer():
    return shap.TreeExplainer(classifier_bundle()["model"])


def _rank(features, values, contributions, top):
    out = [{"feature": f, "value": None if pd.isna(v) else float(v), "shap": float(s)}
           for f, v, s in zip(features, values, contributions)]
    return sorted(out, key=lambda d: -abs(d["shap"]))[:top]


def explain_carbon(row, top=6):
    """Why the model predicted this aboveground biomass (Mg/ha) for one plot-quarter."""
    feats = carbon_bundle()["features"]
    x = pd.DataFrame([row])[feats]
    ex = _carbon_explainer()
    sv = ex.shap_values(x)[0]
    return {"base_value_mg_ha": float(np.ravel(ex.expected_value)[0]),
            "contributions": _rank(feats, x.iloc[0].values, sv, top)}


def explain_classifier(pixel_rows, top=6):
    """Mean SHAP contribution towards the 'mangrove' class over the sampled plot pixels."""
    b = classifier_bundle()
    feats = b["features"]
    x = pd.DataFrame(pixel_rows)[feats]
    sv = _classifier_explainer().shap_values(x)
    k = b["classes"].index("mangrove")
    # shap >= 0.45 returns (n, features, classes); older versions a list per class
    sv_m = sv[:, :, k] if isinstance(sv, np.ndarray) and sv.ndim == 3 else sv[k]
    return {"class": "mangrove", "contributions": _rank(feats, x.mean().values, sv_m.mean(axis=0), top)}
