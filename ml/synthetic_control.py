"""Synthetic-control baseline (not a trained model: a constrained optimisation).

1. Pick donors whose pre-period carbon series are closest to the farmer plot.
2. Find weights w >= 0, sum(w) = 1 that make the weighted donor series match the plot
   in the pre-period (scipy SLSQP).
3. FORECAST the baseline for each crediting quarter from the synthetic pre-period series:
   linear trend + quarterly seasonality. This forecast is made on day 0 and never recomputed.
"""
import numpy as np
from scipy.optimize import minimize


def quarter_index(label):
    """'2023Q2' -> integer count of quarters (for the trend) and quarter-of-year 1..4."""
    year, q = int(label[:4]), int(label[-1])
    return year * 4 + (q - 1), q


def select_donors(y_pre, D_pre, max_donors):
    """Keep donors with complete pre-period data, closest (RMSE) to the treated series."""
    complete = ~np.isnan(D_pre).any(axis=0)
    idx = np.where(complete)[0]
    dist = np.sqrt(np.nanmean((D_pre[:, idx] - y_pre[:, None]) ** 2, axis=0))
    return idx[np.argsort(dist)[:max_donors]]


def fit_weights(y_pre, D_pre):
    """Non-negative weights summing to 1, least squares fit on pre-period quarters."""
    J = D_pre.shape[1]
    obj = lambda w: float(np.sum((y_pre - D_pre @ w) ** 2))
    res = minimize(obj, np.full(J, 1.0 / J), method="SLSQP",
                   bounds=[(0.0, 1.0)] * J,
                   constraints=[{"type": "eq", "fun": lambda w: np.sum(w) - 1.0}],
                   options={"maxiter": 500, "ftol": 1e-10})
    w = np.clip(res.x, 0, None)
    return w / w.sum(), bool(res.success)


def forecast(series, labels, future_labels):
    """Linear trend + quarter-of-year dummies fitted on `series`, predicted for future quarters."""
    def design(lbls):
        rows = []
        for lb in lbls:
            t, q = quarter_index(lb)
            rows.append([1.0, t] + [1.0 if q == k else 0.0 for k in (2, 3, 4)])
        return np.array(rows)
    X = design(labels)
    coef, *_ = np.linalg.lstsq(X, series, rcond=None)
    return design(future_labels) @ coef, coef


def build_baseline(y_pre, pre_labels, D_pre, donor_ids, future_labels, max_donors):
    """Full day-0 baseline. y_pre may contain NaN (cloudy quarters) -> those quarters are skipped in the fit."""
    y_pre = np.asarray(y_pre, dtype=float)
    ok = ~np.isnan(y_pre)
    if ok.sum() < 6:
        raise ValueError(f"Only {int(ok.sum())} pre-period quarters with data; need at least 6")
    sel = select_donors(y_pre[ok], D_pre[ok], max_donors)
    w, success = fit_weights(y_pre[ok], D_pre[ok][:, sel])
    synth_pre = D_pre[:, sel] @ w
    fc, coef = forecast(synth_pre, pre_labels, future_labels)
    pre_rmse = float(np.sqrt(np.mean((y_pre[ok] - synth_pre[ok]) ** 2)))
    weights = sorted(([donor_ids[i], float(wi)] for i, wi in zip(sel, w) if wi > 1e-4),
                     key=lambda x: -x[1])
    return {
        "baseline": [float(v) for v in fc],
        "future_quarters": list(future_labels),
        "pre_quarters": list(pre_labels),
        "pre_observed": [None if np.isnan(v) else float(v) for v in y_pre],
        "pre_synthetic": [float(v) for v in synth_pre],
        "pre_fit_rmse": pre_rmse,
        "weights": weights,
        "n_donors_considered": int(len(sel)),
        "optimizer_success": success,
        "trend_coef": [float(c) for c in coef],
    }


def flat_baseline(y_pre, n_future):
    """Naive comparison baseline: mean of the pre-period, held flat."""
    return [float(np.nanmean(y_pre))] * n_future
