"""Fast tests for pure helpers (no Earth Engine).  Run:  pytest -q"""
import math

import numpy as np

import synthetic_control as sc
from utils import agb_to_co2e, cell_id, db_from_linear, finish_plot_table, make_quarters


def test_quarters():
    q = make_quarters("2019-04-01", "2019-12-31")
    assert [x["label"] for x in q] == ["2019Q2", "2019Q3", "2019Q4"]
    assert q[-1]["end"] == "2020-01-01"


def test_db():
    assert db_from_linear(1.0) == 0.0
    assert math.isnan(db_from_linear(0))


def test_cell_id():
    assert cell_id(11.43, 79.78) == cell_id(11.431, 79.789)


def test_co2e():
    # 100 Mg/ha AGB, no roots, CF 0.5 -> 50 tC -> 183.33 tCO2e
    assert round(agb_to_co2e(100, 0.5, 0.0), 2) == 183.33


def test_low_valid_frac_becomes_nan():
    rows = [{"plot_id": "a", "quarter": "2020Q1", "B2": 0.1, "s2_px": 10, "VV_lin": 0.1, "VH_lin": 0.01}]
    df = finish_plot_table(rows, total_px=100, min_valid_frac=0.5)
    assert math.isnan(df["B2"].iloc[0])           # only 10% valid -> S2 set to NaN
    assert round(df["VV_db"].iloc[0], 3) == -10.0  # radar unaffected


def test_weights_simplex_and_recover():
    rng = np.random.default_rng(0)
    D = rng.normal(50, 5, size=(12, 5))
    true_w = np.array([0.6, 0.4, 0, 0, 0])
    w, ok = sc.fit_weights(D @ true_w, D)
    assert ok and abs(w.sum() - 1) < 1e-9 and (w >= 0).all()
    assert np.allclose(w, true_w, atol=1e-3)


def test_forecast_trend_and_season():
    labels = [f"{y}Q{q}" for y in (2020, 2021, 2022) for q in (1, 2, 3, 4)]
    season = {1: 0, 2: 3, 3: -2, 4: 1}
    y = np.array([10 + 0.5 * i + season[int(lb[-1])] for i, lb in enumerate(labels)])
    fc, _ = sc.forecast(y, labels, ["2023Q1", "2023Q2"])
    assert np.allclose(fc, [10 + 0.5 * 12 + 0, 10 + 0.5 * 13 + 3])
