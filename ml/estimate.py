"""Load trained models and turn feature rows into carbon numbers (tCO2e/ha)."""
import functools
import json
import os

import joblib
import numpy as np

from utils import HERE, agb_to_co2e

MODELS = os.path.join(HERE, "models")


@functools.lru_cache
def carbon_bundle():
    return joblib.load(os.path.join(MODELS, "carbon.joblib"))


@functools.lru_cache
def classifier_bundle():
    return joblib.load(os.path.join(MODELS, "classifier.joblib"))


@functools.lru_cache
def carbon_report():
    with open(os.path.join(MODELS, "carbon_report.json")) as f:
        return json.load(f)


def add_carbon(df, cfg):
    """Add agb_mg_ha and co2e_t_ha columns. Rows with NO usable features get NaN."""
    b = carbon_bundle()
    X = df[b["features"]]
    df = df.copy()
    df["agb_mg_ha"] = np.nan
    has_data = X.notna().any(axis=1)
    if has_data.any():
        df.loc[has_data, "agb_mg_ha"] = b["model"].predict(X[has_data])
    c = cfg["carbon"]
    df["co2e_t_ha"] = agb_to_co2e(df["agb_mg_ha"], c["carbon_fraction"], c["root_to_shoot"])
    return df


def uncertainty_t_ha():
    """Plot-scale uncertainty deduction (tCO2e/ha) computed by carbon_model.py."""
    return carbon_report()["uncertainty_tco2e_ha"]
