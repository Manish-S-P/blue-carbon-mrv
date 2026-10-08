"""Build the training table for Model 1 (ecosystem classifier).

Labels come from ESA WorldCover 2021: 95 -> mangrove, 90 -> wetland, everything else -> other.
Features: 2021 Sentinel-2 median + Sentinel-1 (dB) + SRTM elevation.
Output: data/classifier_train.csv (one row per sampled pixel, with a "cell" column for spatial CV).

Run:  python build_training_table.py
"""
import os

import ee
import pandas as pd

import gee_common as g
from utils import HERE, cell_id, load_config

CLASSES = ["mangrove", "wetland", "other"]


def label_image(cfg):
    wc = g.worldcover()
    # 0 = mangrove, 1 = wetland, 2 = other
    return (ee.Image(2)
            .where(wc.eq(cfg["worldcover"]["mangrove_class"]), 0)
            .where(wc.eq(90), 1)
            .rename("label").toInt())


def sample_box(name, box, cfg):
    year = cfg["classifier"]["year"]
    feats = g.pixel_features(box, f"{year}-01-01", f"{year + 1}-01-01", cfg, with_elevation=True)
    img = feats.addBands(label_image(cfg))
    n = cfg["classifier"]["points_per_class"]
    pts = img.stratifiedSample(
        numPoints=n, classBand="label", region=box, scale=10,
        seed=cfg["training"]["random_state"], geometries=True, tileScale=4)
    rows = []
    for f in pts.getInfo()["features"]:
        p = f["properties"]
        lon, lat = f["geometry"]["coordinates"]
        p.update(lat=lat, lon=lon, box=name)
        rows.append(p)
    print(f"  {name}: {len(rows)} points")
    return rows


def main():
    cfg = load_config()
    g.init(cfg)
    rows = []
    for name, box in g.study_boxes(cfg).items():
        rows += sample_box(name, box, cfg)
    df = pd.DataFrame(rows)
    df["label_name"] = df["label"].map(dict(enumerate(CLASSES)))
    size = cfg["training"]["cell_size_deg"]
    df["cell"] = [cell_id(a, b, size) for a, b in zip(df["lat"], df["lon"])]
    out = os.path.join(HERE, "data", "classifier_train.csv")
    df.to_csv(out, index=False)
    print(f"Saved {len(df)} rows to {out}")
    print(df["label_name"].value_counts().to_string())


if __name__ == "__main__":
    main()
