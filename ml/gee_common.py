"""Earth Engine building blocks shared by every script (composites, masks, regions)."""
import ee

from utils import S2_FEATURES

_ready = False

# SCL classes we keep: 4 vegetation, 5 bare soil, 6 water, 7 unclassified.
# Dropped: saturated, dark, cloud shadow, cloud (med/high), cirrus, snow.
SCL_KEEP = [4, 5, 6, 7]

S1_DB = ["VV_db", "VH_db", "VV_minus_VH_db"]


def init(cfg):
    """Connect to Earth Engine once per process."""
    global _ready
    if not _ready:
        ee.Initialize(project=cfg["gee"]["project"])
        _ready = True


def study_boxes(cfg):
    """Dict name -> ee.Geometry.Rectangle for the training/study area."""
    return {k: ee.Geometry.Rectangle(v) for k, v in cfg["study_area"]["boxes"].items()}


def worldcover():
    return ee.ImageCollection("ESA/WorldCover/v200").first().select("Map")


def _mask_s2(img):
    scl = img.select("SCL")
    keep = scl.eq(SCL_KEEP[0])
    for c in SCL_KEEP[1:]:
        keep = keep.Or(scl.eq(c))
    refl = img.select(["B2", "B3", "B4", "B8", "B11"]).divide(10000)
    return refl.updateMask(keep)


def _add_indices(img):
    ndvi = img.normalizedDifference(["B8", "B4"]).rename("NDVI")
    ndwi = img.normalizedDifference(["B3", "B8"]).rename("NDWI")  # McFeeters (water)
    evi = img.expression(
        "2.5 * (N - R) / (N + 6 * R - 7.5 * B + 1)",
        {"N": img.select("B8"), "R": img.select("B4"), "B": img.select("B2")},
    ).rename("EVI")
    return img.addBands([ndvi, ndwi, evi])


def s2_collection(region, start, end, cfg):
    return (ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
            .filterBounds(region)
            .filterDate(start, end)
            .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", cfg["s2"]["max_cloud_pct"])))


def _empty(bands):
    """Fully masked image with the right band names (used when a period has no images)."""
    return ee.Image.constant([0] * len(bands)).rename(bands).toFloat().updateMask(0)


def s2_composite(region, start, end, cfg):
    """Cloud-masked median of B2,B3,B4,B8,B11 plus NDVI, NDWI, EVI."""
    col = s2_collection(region, start, end, cfg).map(_mask_s2)
    # Indices are computed per image, then the median is taken.
    med = col.map(_add_indices).median().select(S2_FEATURES)
    return ee.Image(ee.Algorithms.If(col.size().gt(0), med, _empty(S2_FEATURES)))


def s1_collection(region, start, end, cfg):
    return (ee.ImageCollection("COPERNICUS/S1_GRD")
            .filterBounds(region)
            .filterDate(start, end)
            .filter(ee.Filter.eq("instrumentMode", "IW"))
            .filter(ee.Filter.eq("orbitProperties_pass", cfg["s1"]["orbit_pass"]))
            .filter(ee.Filter.listContains("transmitterReceiverPolarisation", "VV"))
            .filter(ee.Filter.listContains("transmitterReceiverPolarisation", "VH")))


def s1_linear_mean(region, start, end, cfg):
    """Mean VV and VH in LINEAR units (S1_GRD is stored in dB, so convert first)."""
    def to_lin(img):
        return ee.Image(10).pow(img.select(["VV", "VH"]).divide(10))
    col = s1_collection(region, start, end, cfg)
    mean = col.map(to_lin).mean().rename(["VV_lin", "VH_lin"])
    return ee.Image(ee.Algorithms.If(col.size().gt(0), mean, _empty(["VV_lin", "VH_lin"])))


def s1_db(region, start, end, cfg):
    """Pixel-level radar features in dB (averaged in linear units first)."""
    lin = s1_linear_mean(region, start, end, cfg)
    vv = lin.select("VV_lin").log10().multiply(10).rename("VV_db")
    vh = lin.select("VH_lin").log10().multiply(10).rename("VH_db")
    return vv.addBands(vh).addBands(vv.subtract(vh).rename("VV_minus_VH_db"))


def elevation():
    return ee.Image("USGS/SRTMGL1_003").select("elevation")


def pixel_features(region, start, end, cfg, with_elevation=False):
    """Stack of per-pixel features used for training and plot-level classification."""
    img = s2_composite(region, start, end, cfg).addBands(s1_db(region, start, end, cfg))
    if with_elevation:
        img = img.addBands(elevation().toFloat())
    return img
