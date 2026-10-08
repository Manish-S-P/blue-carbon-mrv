"""Per-plot features from Earth Engine.

quarterly_table(): mean Sentinel-2 / Sentinel-1 values per plot per quarter (one EE call per quarter,
                   all plots at once). Used for carbon estimates of farmer plots and donor plots.
plot_pixels():     pixel samples inside one plot, used by the ecosystem classifier.
"""
from concurrent.futures import ThreadPoolExecutor

import ee

import gee_common as g
from utils import S2_FEATURES, finish_plot_table


def to_fc(plots):
    """plots: list of (plot_id, geojson geometry) -> ee.FeatureCollection."""
    return ee.FeatureCollection([ee.Feature(ee.Geometry(geom), {"plot_id": pid}) for pid, geom in plots])


def _mangrove_mask(cfg):
    return g.worldcover().eq(cfg["worldcover"]["mangrove_class"])


def _total_px(fc, cfg, mask_mangrove):
    """Number of 10 m pixels in each plot (denominator of s2_valid_frac)."""
    one = ee.Image(1).rename("total_px")
    if mask_mangrove:
        one = one.updateMask(_mangrove_mask(cfg))
    res = one.reduceRegions(fc, ee.Reducer.count(), scale=cfg["s2"]["scale"], tileScale=4).getInfo()
    return {f["properties"]["plot_id"]: f["properties"].get("count", 0) for f in res["features"]}


def _one_quarter(fc, region, q, cfg, mask_mangrove):
    s2 = g.s2_composite(region, q["start"], q["end"], cfg)
    s1 = g.s1_linear_mean(region, q["start"], q["end"], cfg)
    img = s2.addBands(s1).addBands(s2.select("B4").mask().selfMask().rename("s2_px"))
    if mask_mangrove:
        img = img.updateMask(_mangrove_mask(cfg))
    reducer = ee.Reducer.mean().forEach(S2_FEATURES + ["VV_lin", "VH_lin"]) \
        .combine(ee.Reducer.count().forEach(["s2_px"]))
    res = img.reduceRegions(fc, reducer, scale=cfg["s2"]["scale"], tileScale=4).getInfo()
    n_s2 = g.s2_collection(region, q["start"], q["end"], cfg).size().getInfo()
    n_s1 = g.s1_collection(region, q["start"], q["end"], cfg).size().getInfo()
    rows = []
    for f in res["features"]:
        p = f["properties"]
        row = {"plot_id": p["plot_id"], "quarter": q["label"], "s2_n_images": n_s2, "s1_n_images": n_s1}
        for b in S2_FEATURES + ["VV_lin", "VH_lin", "s2_px"]:
            row[b] = p.get(b)  # missing -> None -> NaN later
        rows.append(row)
    return rows


def quarterly_table(plots, quarters, cfg, mask_mangrove=False, workers=6):
    """Feature table: one row per (plot, quarter). Missing data stays NaN."""
    fc = to_fc(plots)
    region = fc.geometry().bounds()
    totals = _total_px(fc, cfg, mask_mangrove)
    with ThreadPoolExecutor(max_workers=workers) as pool:
        parts = list(pool.map(lambda q: _one_quarter(fc, region, q, cfg, mask_mangrove), quarters))
    rows = [r for part in parts for r in part]
    for r in rows:
        r["total_px"] = totals.get(r["plot_id"], 0)
    return finish_plot_table(rows, None, cfg["s2"]["min_valid_frac"])


def plot_pixels(geom, year, cfg, n_points):
    """Sample pixel features inside one plot for the ecosystem classifier."""
    region = ee.Geometry(geom)
    img = g.pixel_features(region, f"{year}-01-01", f"{year + 1}-01-01", cfg, with_elevation=True)
    pts = img.sample(region=region, scale=10, numPixels=n_points,
                     seed=cfg["training"]["random_state"], geometries=False, tileScale=4)
    return [f["properties"] for f in pts.getInfo()["features"]]
