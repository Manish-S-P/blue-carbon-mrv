"""Donor pool for the synthetic-control baseline.

Donors = grid cells (donor_cell_deg) inside the study boxes that WorldCover maps as mostly mangrove
(>= donor_min_mangrove_frac). We ASSUME they are not under a restoration project (we cannot verify
this from satellite data alone; stated as a limitation).

For every donor and every quarter we compute mean features (mangrove pixels only) and the predicted
carbon stock. Output: data/donor_series.csv. Quarters already in the file are not recomputed.

Run:  python donors.py
"""
import os
import random

import ee
import pandas as pd

import gee_common as g
import gee_features as gf
from estimate import add_carbon
from utils import HERE, load_config, make_quarters, last_complete_quarter_end

DONOR_CELLS = os.path.join(HERE, "data", "donor_cells.csv")
DONOR_SERIES = os.path.join(HERE, "data", "donor_series.csv")


def cell_square(lon, lat, d):
    return {"type": "Polygon", "coordinates": [[[lon, lat], [lon + d, lat], [lon + d, lat + d],
                                                [lon, lat + d], [lon, lat]]]}


def pick_cells(cfg):
    """Choose eligible donor cells (cached in donor_cells.csv)."""
    if os.path.exists(DONOR_CELLS):
        return pd.read_csv(DONOR_CELLS)
    b = cfg["baseline"]
    d = b["donor_cell_deg"]
    mangrove = g.worldcover().eq(cfg["worldcover"]["mangrove_class"]).rename("mangrove_frac")
    rng = random.Random(cfg["training"]["random_state"])
    out = []
    for name, (w, s, e, n) in cfg["study_area"]["boxes"].items():
        feats = []
        nx, ny = int(round((e - w) / d)), int(round((n - s) / d))
        for i in range(nx):
            for j in range(ny):
                lon, lat = round(w + i * d, 6), round(s + j * d, 6)
                feats.append(ee.Feature(ee.Geometry.Rectangle([lon, lat, lon + d, lat + d]),
                                        {"lon": lon, "lat": lat}))
        res = mangrove.reduceRegions(ee.FeatureCollection(feats), ee.Reducer.mean(), 10, tileScale=4).getInfo()
        ok = [f["properties"] for f in res["features"]
              if (f["properties"].get("mean") or 0) >= b["donor_min_mangrove_frac"]]
        chosen = rng.sample(ok, min(len(ok), b["donors_per_box"]))
        print(f"  {name}: {len(ok)} eligible cells, using {len(chosen)}")
        for p in chosen:
            out.append({"donor_id": f"{name}_{p['lon']:.3f}_{p['lat']:.3f}", "box": name,
                        "lon": p["lon"], "lat": p["lat"], "mangrove_frac": round(p["mean"], 3)})
    df = pd.DataFrame(out)
    df.to_csv(DONOR_CELLS, index=False)
    return df


def main():
    cfg = load_config()
    g.init(cfg)
    cells = pick_cells(cfg)
    quarters = make_quarters(cfg["dates"]["start"], last_complete_quarter_end())
    old = pd.read_csv(DONOR_SERIES) if os.path.exists(DONOR_SERIES) else pd.DataFrame(columns=["quarter"])
    todo = [q for q in quarters if q["label"] not in set(old["quarter"])]
    print(f"{len(cells)} donors, {len(quarters)} quarters, {len(todo)} to compute")
    if todo:
        d = cfg["baseline"]["donor_cell_deg"]
        plots = [(r.donor_id, cell_square(r.lon, r.lat, d)) for r in cells.itertuples()]
        new = gf.quarterly_table(plots, todo, cfg, mask_mangrove=cfg["worldcover"]["mask_training"])
        new = add_carbon(new, cfg).rename(columns={"plot_id": "donor_id"})
        old = pd.concat([old, new], ignore_index=True) if len(old) else new
        old.sort_values(["donor_id", "quarter"]).to_csv(DONOR_SERIES, index=False)
    s = old.pivot(index="quarter", columns="donor_id", values="co2e_t_ha")
    print(f"Saved {DONOR_SERIES}: {s.shape[1]} donors x {s.shape[0]} quarters, "
          f"{int(s.isna().sum().sum())} missing values (kept NaN)")


if __name__ == "__main__":
    main()
