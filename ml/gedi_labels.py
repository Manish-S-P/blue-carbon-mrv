"""Build the training table for Model 2 (carbon estimator).

Labels: GEDI L4A aboveground biomass density (agbd, Mg/ha) with its standard error (agbd_se).
Only shots with l4_quality_flag == 1 and degrade_flag == 0, on WorldCover mangrove pixels.
Each shot is paired with the Sentinel-2 / Sentinel-1 composite of the SAME quarter.
Missing Sentinel features stay NaN (a cloudy quarter is not dropped or filled).

Output: data/carbon_train.csv.  Each (box, quarter) is cached in data/gedi_parts/ so reruns resume.
Run:  python gedi_labels.py
"""
import os
from concurrent.futures import ThreadPoolExecutor

import ee
import numpy as np
import pandas as pd

import gee_common as g
from utils import HERE, cell_id, load_config, make_quarters

NODATA = -9999
PARTS = os.path.join(HERE, "data", "gedi_parts")


def gedi_collection(start, end):
    return ee.ImageCollection("LARSE/GEDI/GEDI04_A_002_MONTHLY").filterDate(start, end)


def gedi_quarter(start, end):
    """Quality-filtered GEDI shots for one quarter (agbd, agbd_se)."""
    def good(img):
        ok = img.select("l4_quality_flag").eq(1).And(img.select("degrade_flag").eq(0))
        return img.select(["agbd", "agbd_se"]).updateMask(ok)
    return gedi_collection(start, end).map(good).mosaic()


def sample_part(name, box, q, cfg):
    path = os.path.join(PARTS, f"{name}_{q['label']}.csv")
    if os.path.exists(path):
        return pd.read_csv(path) if os.path.getsize(path) > 1 else pd.DataFrame()
    # Quarters with no GEDI data (e.g. GEDI was in storage Mar 2023 - Apr 2024) or no
    # Sentinel images cannot be sampled; record them as empty instead of crashing.
    n_gedi = gedi_collection(q["start"], q["end"]).filterBounds(box).size().getInfo()
    n_s2 = g.s2_collection(box, q["start"], q["end"], cfg).size().getInfo()
    n_s1 = g.s1_collection(box, q["start"], q["end"], cfg).size().getInfo()
    if min(n_gedi, n_s2, n_s1) == 0:
        open(path, "w").write("\n")
        print(f"  {name} {q['label']}: skipped (GEDI={n_gedi}, S2={n_s2}, S1={n_s1} images)")
        return pd.DataFrame()
    gedi = gedi_quarter(q["start"], q["end"])
    if cfg["worldcover"]["mask_training"]:
        gedi = gedi.updateMask(g.worldcover().eq(cfg["worldcover"]["mangrove_class"]))
    # Features are unmasked to a NODATA flag so a cloudy pixel does not delete the GEDI shot.
    feats = g.pixel_features(box, q["start"], q["end"], cfg).unmask(NODATA)
    pts = (gedi.addBands(feats)
           .sample(region=box, scale=cfg["gedi"]["scale"], geometries=True, tileScale=4)
           .randomColumn("r", cfg["training"]["random_state"]).sort("r")
           .limit(cfg["carbon"]["points_per_quarter"]))
    rows = []
    for f in pts.getInfo()["features"]:
        p = f["properties"]
        p.pop("r", None)
        p["lon"], p["lat"] = f["geometry"]["coordinates"]
        rows.append(p)
    df = pd.DataFrame(rows)
    df["box"], df["quarter"] = name, q["label"]
    df.to_csv(path, index=False)
    print(f"  {name} {q['label']}: {len(df)} shots")
    return df


def main():
    cfg = load_config()
    g.init(cfg)
    os.makedirs(PARTS, exist_ok=True)
    quarters = make_quarters(cfg["carbon"]["gedi_start"], cfg["carbon"]["gedi_end"])
    jobs = [(n, b, q) for n, b in g.study_boxes(cfg).items() for q in quarters]
    with ThreadPoolExecutor(max_workers=6) as pool:
        parts = list(pool.map(lambda j: sample_part(*j, cfg), jobs))
    df = pd.concat([p for p in parts if len(p)], ignore_index=True)
    df = df.replace(NODATA, np.nan)
    size = cfg["training"]["cell_size_deg"]
    df["cell"] = [cell_id(a, b, size) for a, b in zip(df["lat"], df["lon"])]
    out = os.path.join(HERE, "data", "carbon_train.csv")
    df.to_csv(out, index=False)
    print(f"Saved {len(df)} GEDI shots to {out}")
    print(df.groupby("box")["agbd"].describe().round(1).to_string())


if __name__ == "__main__":
    main()
