"""Plain Python helpers (no Earth Engine here, so they are easy to test)."""
import datetime as dt
import json
import math
import os

import pandas as pd
import yaml

HERE = os.path.dirname(os.path.abspath(__file__))

S2_FEATURES = ["B2", "B3", "B4", "B8", "B11", "NDVI", "NDWI", "EVI"]


def load_config(path=None):
    path = path or os.path.join(HERE, "config.yaml")
    with open(path) as f:
        return yaml.safe_load(f)


def make_quarters(start, end):
    """Whole calendar quarters from the one containing `start` to the one containing `end`."""
    s = dt.date.fromisoformat(start)
    e = dt.date.fromisoformat(end)
    year, q = s.year, (s.month - 1) // 3
    out = []
    while True:
        q_start = dt.date(year, q * 3 + 1, 1)
        if q_start > e:
            break
        ny, nq = (year, q + 1) if q < 3 else (year + 1, 0)
        q_end = dt.date(ny, nq * 3 + 1, 1)
        out.append({"label": f"{year}Q{q + 1}", "start": q_start.isoformat(), "end": q_end.isoformat()})
        year, q = ny, nq
    return out


def load_plots(path):
    """Read a GeoJSON file. Returns a list of (plot_id, geometry_dict)."""
    with open(path) as f:
        gj = json.load(f)
    if gj["type"] == "FeatureCollection":
        feats = gj["features"]
    elif gj["type"] == "Feature":
        feats = [gj]
    else:
        feats = [{"type": "Feature", "properties": {}, "geometry": gj}]
    plots = []
    for i, feat in enumerate(feats):
        props = feat.get("properties") or {}
        plots.append((str(props.get("plot_id", f"plot_{i + 1}")), feat["geometry"]))
    return plots


def db_from_linear(x):
    """Radar values are averaged in linear units, then converted to decibels."""
    if x is None or x <= 0 or (isinstance(x, float) and math.isnan(x)):
        return float("nan")
    return 10.0 * math.log10(x)


def cell_id(lat, lon, size=0.01):
    """Grid cell name for a point (used later for spatial cross-validation)."""
    return f"{math.floor(lat / size)}_{math.floor(lon / size)}"


def finish_plot_table(rows, total_px, min_valid_frac):
    """Turn raw per-quarter rows from Earth Engine into the final feature table.

    total_px can be one number, or None when each row carries its own "total_px".
    """
    df = pd.DataFrame(rows)
    if total_px is None:
        total_px = df["total_px"]
    for col in S2_FEATURES + ["s2_px", "VV_lin", "VH_lin", "s2_n_images", "s1_n_images"]:
        if col not in df.columns:
            df[col] = float("nan")
    df["s2_valid_frac"] = (df["s2_px"] / total_px).replace([math.inf, -math.inf], float("nan"))
    low = df["s2_valid_frac"].fillna(0) < min_valid_frac
    df.loc[low, S2_FEATURES] = float("nan")
    df["VV_db"] = df["VV_lin"].apply(db_from_linear)
    df["VH_db"] = df["VH_lin"].apply(db_from_linear)
    df["VV_minus_VH_db"] = df["VV_db"] - df["VH_db"]
    keep = ["plot_id", "quarter"] + S2_FEATURES + ["VV_db", "VH_db", "VV_minus_VH_db",
                                                    "s2_n_images", "s2_valid_frac", "s1_n_images"]
    return df[keep]

def agb_to_co2e(agb_mg_ha, carbon_fraction, root_to_shoot):
    """Biomass stock (Mg dry matter/ha) -> tCO2e/ha.

    Aboveground + roots (root-to-shoot), times carbon fraction, times 44/12.
    Soil is counted as ZERO gain (conservative), so it is not added here.
    """
    total_biomass = agb_mg_ha * (1.0 + root_to_shoot)
    return total_biomass * carbon_fraction * 44.0 / 12.0


def last_complete_quarter_end(today=None):
    """ISO date of the last day of the most recent finished quarter."""
    today = today or dt.date.today()
    q_start = dt.date(today.year, ((today.month - 1) // 3) * 3 + 1, 1)
    return (q_start - dt.timedelta(days=1)).isoformat()
