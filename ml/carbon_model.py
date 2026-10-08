"""Model 2: carbon estimator.

Random Forest regressor: Sentinel-2 + Sentinel-1 features -> GEDI L4A aboveground biomass (Mg/ha).
Spatial CV (GroupKFold on "cell"). Two errors are reported:
  - shot-level RMSE (one 25 m GEDI footprint),
  - cell-level RMSE (mean prediction vs mean GEDI inside a ~1 km cell) = error at plot scale,
    which is what the credit uncertainty deduction uses.
Both are agreement with GEDI (a modelled product), not field truth.

Run:  python carbon_model.py   -> prints metrics, saves models/carbon.joblib + carbon_report.json
"""
import json
import os

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error, r2_score
from sklearn.model_selection import GroupKFold

from utils import HERE, S2_FEATURES, agb_to_co2e, load_config

FEATURES = S2_FEATURES + ["VV_db", "VH_db", "VV_minus_VH_db"]
MODEL_PATH = os.path.join(HERE, "models", "carbon.joblib")
REPORT_PATH = os.path.join(HERE, "models", "carbon_report.json")
MIN_SHOTS_PER_CELL = 3


def make_model(cfg):
    return RandomForestRegressor(
        n_estimators=300, min_samples_leaf=5, n_jobs=-1,
        random_state=cfg["training"]["random_state"])


def rmse(a, b):
    return float(np.sqrt(np.mean((np.asarray(a) - np.asarray(b)) ** 2)))


def load_table(cfg):
    df = pd.read_csv(os.path.join(HERE, "data", "carbon_train.csv"))
    n0 = len(df)
    df = df[df["agbd"] <= cfg["carbon"]["max_agbd"]].reset_index(drop=True)
    print(f"{n0} GEDI shots, dropped {n0 - len(df)} with agbd > {cfg['carbon']['max_agbd']} Mg/ha")
    return df


def main():
    cfg = load_config()
    df = load_table(cfg)
    X, y, groups = df[FEATURES], df["agbd"], df["cell"]
    print(f"{len(df)} shots in {groups.nunique()} cells")

    pred = np.empty(len(df))
    for train, test in GroupKFold(n_splits=cfg["training"]["cv_folds"]).split(X, y, groups):
        m = make_model(cfg).fit(X.iloc[train], y.iloc[train])
        pred[test] = m.predict(X.iloc[test])
    df["pred"] = pred

    shot = {"rmse": rmse(y, pred), "mae": float(mean_absolute_error(y, pred)), "r2": float(r2_score(y, pred))}
    # Honest reference: how good is "always predict the mean"?
    shot["rmse_predict_mean"] = rmse(y, np.full(len(y), y.mean()))

    cells = df.groupby("cell").agg(obs=("agbd", "mean"), pred=("pred", "mean"), n=("agbd", "size"))
    cells = cells[cells["n"] >= MIN_SHOTS_PER_CELL]
    cell = {"n_cells": int(len(cells)), "rmse": rmse(cells["obs"], cells["pred"]),
            "r2": float(r2_score(cells["obs"], cells["pred"]))}

    print(f"\nShot level  : RMSE={shot['rmse']:.2f} Mg/ha  MAE={shot['mae']:.2f}  R2={shot['r2']:.3f}"
          f"  (predict-mean RMSE={shot['rmse_predict_mean']:.2f})")
    print(f"Cell level  : RMSE={cell['rmse']:.2f} Mg/ha  R2={cell['r2']:.3f}  ({cell['n_cells']} cells with >= {MIN_SHOTS_PER_CELL} shots)")
    print("\nPer-box shot RMSE:")
    print(df.groupby("box").apply(lambda d: pd.Series({"n": len(d), "rmse": rmse(d["agbd"], d["pred"]),
                                                         "mean_agbd": d["agbd"].mean()}),
                                  include_groups=False).round(2).to_string())

    # Uncertainty at plot scale, in tCO2e/ha: cell-level model error combined with GEDI's own
    # mean standard error (in quadrature), times z for a one-sided 90% interval.
    c = cfg["carbon"]
    mean_se = float(df["agbd_se"].mean())
    agb_unc = float(np.sqrt(cell["rmse"] ** 2 + mean_se ** 2))
    unc_co2e = agb_to_co2e(agb_unc, c["carbon_fraction"], c["root_to_shoot"]) * c["ci_z"]
    print(f"\nMean GEDI agbd_se={mean_se:.2f} Mg/ha -> combined AGB error {agb_unc:.2f} Mg/ha")
    print(f"Uncertainty deduction (z={c['ci_z']}): {unc_co2e:.2f} tCO2e/ha")

    # Sensitivity of the carbon conversion (per 100 Mg/ha AGB)
    sens = {f"cf={cf},R={rs}": round(agb_to_co2e(100, cf, rs), 2)
            for cf in (c["carbon_fraction"], c["carbon_fraction_alt"])
            for rs in (c["root_to_shoot"], c["root_to_shoot_alt"])}
    print("tCO2e/ha per 100 Mg/ha AGB:", sens)

    model = make_model(cfg).fit(X, y)
    joblib.dump({"model": model, "features": FEATURES}, MODEL_PATH)
    report = {"n_shots": int(len(df)), "n_cells": int(groups.nunique()), "shot": shot, "cell": cell,
              "mean_agbd_se": mean_se, "agb_uncertainty_mg_ha": agb_unc,
              "uncertainty_tco2e_ha": unc_co2e, "conversion_sensitivity_per_100Mg": sens,
              "feature_importance": dict(zip(FEATURES, model.feature_importances_.round(4).tolist())),
              "note": "Agreement with GEDI L4A (a modelled product), not field truth."}
    with open(REPORT_PATH, "w") as f:
        json.dump(report, f, indent=2)
    print(f"\nSaved {MODEL_PATH}")


if __name__ == "__main__":
    main()
