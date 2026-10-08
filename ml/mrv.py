"""The ML steps of the MRV flow, as plain functions (api.py exposes them over HTTP).

  check_region()      plot must be inside the trained study area
  classify_plot()     Model 1 + SHAP -> accept / manual_review / reject
  build_baseline()    synthetic control on the pre-period -> day-0 baseline forecast
  observe_quarter()   Model 2 + uncertainty + SHAP + Model 3 for one finished quarter
"""
import datetime as dt
import hashlib
import os

import numpy as np
import pandas as pd

import anomaly
import explain
import gee_common as g
import gee_features as gf
import synthetic_control as sc
from donors import DONOR_CELLS, DONOR_SERIES
from estimate import MODELS, add_carbon, classifier_bundle, uncertainty_t_ha
from utils import last_complete_quarter_end, load_config, make_quarters

CFG = load_config()


def _clean(v):
    """NaN -> None so the result is valid JSON."""
    if isinstance(v, float) and np.isnan(v):
        return None
    if isinstance(v, (np.floating, np.integer)):
        return None if np.isnan(v) else v.item()
    return v


def _records(df):
    return [{k: _clean(v) for k, v in r.items()} for r in df.to_dict("records")]


def _coords(geom):
    c = geom["coordinates"]
    rings = c if geom["type"] == "Polygon" else [r for poly in c for r in poly]
    return [p for ring in rings for p in ring]


def model_versions():
    """sha256 of each model file, so the audit record says exactly which models were used."""
    out = {}
    for f in sorted(os.listdir(MODELS)):
        if f.endswith(".joblib"):
            with open(os.path.join(MODELS, f), "rb") as fh:
                out[f] = hashlib.sha256(fh.read()).hexdigest()
    return out


def quarter_label(date_iso):
    return make_quarters(date_iso, date_iso)[0]["label"]


def check_region(geom):
    """All vertices must fall inside ONE study box (model was trained only there)."""
    pts = _coords(geom)
    for name, (w, s, e, n) in CFG["study_area"]["boxes"].items():
        if all(w <= x <= e and s <= y <= n for x, y in pts):
            return {"inside": True, "box": name}
    return {"inside": False, "box": None}


def classify_plot(geom, project_start):
    """Ecosystem check on the last full year BEFORE the project starts."""
    g.init(CFG)
    region = check_region(geom)
    if not region["inside"]:
        return {"decision": "reject", "reason": "outside trained study area", "region": region}
    year = min(dt.date.fromisoformat(project_start).year - 1,
               dt.date.fromisoformat(last_complete_quarter_end()).year - 1)
    px = gf.plot_pixels(geom, year, CFG, CFG["classifier"]["plot_sample_points"])
    if len(px) < 10:
        return {"decision": "manual_review", "reason": f"only {len(px)} valid pixels sampled",
                "region": region, "year": year}
    b = classifier_bundle()
    X = pd.DataFrame(px)[b["features"]]
    pred = b["model"].predict(X)
    fracs = {c: float(np.mean(pred == i)) for i, c in enumerate(b["classes"])}
    from classifier import decide
    decision = decide(fracs["mangrove"], CFG)
    return {"decision": decision, "class_fractions": fracs, "n_pixels": len(px), "year": year,
            "region": region, "thresholds": {k: CFG["classifier"][k] for k in ("accept_mangrove_frac", "review_mangrove_frac")},
            "shap": explain.explain_classifier(px)}


def _crediting_labels(project_start):
    first = dt.date.fromisoformat(project_start)
    n = CFG["baseline"]["crediting_quarters"]
    qs = make_quarters(first.isoformat(), (first + dt.timedelta(days=92 * n + 31)).isoformat())
    return [q["label"] for q in qs[:n]]


def build_baseline(plot_id, geom, project_start):
    """Day-0 synthetic-control baseline for the crediting quarters. Never recomputed later."""
    g.init(CFG)
    b = CFG["baseline"]
    donors = pd.read_csv(DONOR_SERIES).pivot(index="quarter", columns="donor_id", values="co2e_t_ha")
    labels = list(donors.index)
    start = quarter_label(project_start)
    if start not in labels and start > labels[-1]:
        # project starts after the last donor quarter: pre-period = latest available quarters
        pre = labels[-b["pre_quarters"]:]
    else:
        i = labels.index(start)
        pre = labels[max(0, i - b["pre_quarters"]):i]
    future = _crediting_labels(project_start)

    # Exclude donors next to (or overlapping) the farmer plot to avoid spill-over
    cells = pd.read_csv(DONOR_CELLS).set_index("donor_id")
    xs, ys = zip(*_coords(geom))
    buf, d = b["exclude_buffer_deg"], b["donor_cell_deg"]
    near = cells[(cells["lon"] + d >= min(xs) - buf) & (cells["lon"] <= max(xs) + buf) &
                 (cells["lat"] + d >= min(ys) - buf) & (cells["lat"] <= max(ys) + buf)].index
    donor_ids = [c for c in donors.columns if c not in set(near)]

    all_q = make_quarters(CFG["dates"]["start"], last_complete_quarter_end())
    pre_q = [q for q in all_q if q["label"] in pre]
    feats = add_carbon(gf.quarterly_table([(plot_id, geom)], pre_q, CFG,
                                          mask_mangrove=CFG["worldcover"]["mask_plots"]), CFG)
    feats = feats.set_index("quarter").reindex(pre)
    res = sc.build_baseline(feats["co2e_t_ha"].values, pre, donors.loc[pre, donor_ids].values,
                            donor_ids, future, b["max_donors"])
    res.update({
        "plot_id": plot_id, "project_start": project_start, "start_quarter": start,
        "flat_baseline": sc.flat_baseline(feats["co2e_t_ha"].values, len(future)),
        "excluded_nearby_donors": list(near),
        "pre_features": _records(feats.reset_index()),
        "uncertainty_t_ha": uncertainty_t_ha(),
        "method": "synthetic control (SLSQP, w>=0, sum=1) + linear trend + quarterly seasonality forecast",
        "carbon_params": {k: CFG["carbon"][k] for k in ("carbon_fraction", "root_to_shoot", "ci_z")},
        "crediting": {"quarters": b["crediting_quarters"], "buffer_frac": b["buffer_frac"],
                      "assumed": True},
        "model_versions": model_versions(),
        "historical_replay": start <= labels[-1],
    })
    return res


def observe_quarter(plot_id, geom, quarter):
    """Carbon estimate for ONE finished quarter, with uncertainty, SHAP and the anomaly check."""
    g.init(CFG)
    all_q = make_quarters(CFG["dates"]["start"], last_complete_quarter_end())
    labels = [q["label"] for q in all_q]
    if quarter not in labels:
        return {"status": "not_available", "reason": f"{quarter} is not a finished quarter with data yet"}
    i = labels.index(quarter)
    qs = all_q[max(0, i - 1):i + 1]  # this quarter and the one before (for the change feature)
    df = add_carbon(gf.quarterly_table([(plot_id, geom)], qs, CFG,
                                       mask_mangrove=CFG["worldcover"]["mask_plots"]), CFG)
    df = anomaly.add_change(df, "plot_id")
    row = df[df["quarter"] == quarter].iloc[0].to_dict()
    if pd.isna(row["co2e_t_ha"]):
        return {"status": "no_data", "quarter": quarter, "features": {k: _clean(v) for k, v in row.items()}}
    is_anom, score, reason = anomaly.check(row)
    return {
        "status": "held_for_review" if is_anom else "ok",
        "quarter": quarter,
        "co2e_t_ha": float(row["co2e_t_ha"]),
        "agb_mg_ha": float(row["agb_mg_ha"]),
        "uncertainty_t_ha": uncertainty_t_ha(),
        "anomaly": {"flag": is_anom, "score": score, "reason": reason},
        "shap": explain.explain_carbon(row),
        "features": {k: _clean(v) for k, v in row.items()},
        "model_versions": model_versions(),
    }
