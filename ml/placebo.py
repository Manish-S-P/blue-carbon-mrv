"""Placebo tests: the paper's headline result.

Each donor plot in turn pretends to be a "project" that started on demo.project_start. None of them
were actually restored, so ANY credit they would earn is a false credit. We compare:
  - synthetic-control baseline (forecast on day 0), vs
  - naive flat baseline (pre-period mean).
Also reported: ex-post forecast quality (forecast vs the synthetic series actually observed later).

Run:  python placebo.py   (needs data/donor_series.csv from donors.py)
"""
import json
import os

import numpy as np
import pandas as pd

import synthetic_control as sc
from estimate import uncertainty_t_ha
from donors import DONOR_CELLS, DONOR_SERIES
from utils import HERE, load_config, make_quarters


def split_quarters(all_labels, start_label, n_pre, n_post):
    i = all_labels.index(start_label)
    return all_labels[max(0, i - n_pre):i], all_labels[i:i + n_post]


def false_credit(gaps, unc):
    """Credits are on a STOCK: total ever issued = the largest (gap - uncertainty), never a sum."""
    return float(max(0.0, max(g - unc for g in gaps)))


def main():
    cfg = load_config()
    b = cfg["baseline"]
    series = pd.read_csv(DONOR_SERIES).pivot(index="quarter", columns="donor_id", values="co2e_t_ha")
    cells = pd.read_csv(DONOR_CELLS).set_index("donor_id")
    labels = list(series.index)
    start = make_quarters(cfg["demo"]["project_start"], cfg["demo"]["project_start"])[0]["label"]
    pre, post = split_quarters(labels, start, b["pre_quarters"], b["crediting_quarters"])
    print(f"Project start {start}: {len(pre)} pre quarters ({pre[0]}..{pre[-1]}), "
          f"{len(post)} crediting quarters ({post[0]}..{post[-1]})")
    unc = uncertainty_t_ha()

    rows = []
    for tid in series.columns:
        t = cells.loc[tid]
        far = [d for d in series.columns if d != tid and
               max(abs(cells.loc[d, "lon"] - t["lon"]), abs(cells.loc[d, "lat"] - t["lat"])) > b["exclude_buffer_deg"]]
        y_pre, y_post = series.loc[pre, tid].values, series.loc[post, tid].values
        D_pre = series.loc[pre, far].values
        res = sc.build_baseline(y_pre, pre, D_pre, far, post, b["max_donors"])
        base_sc = np.array(res["baseline"])
        base_flat = np.array(sc.flat_baseline(y_pre, len(post)))
        w = dict(res["weights"])
        synth_post = series.loc[post, list(w)].values @ np.array(list(w.values()))
        gap_sc, gap_flat = y_post - base_sc, y_post - base_flat
        rows.append({
            "donor_id": tid, "box": t["box"], "pre_fit_rmse": res["pre_fit_rmse"],
            "sc_rmse": float(np.sqrt(np.mean(gap_sc ** 2))), "flat_rmse": float(np.sqrt(np.mean(gap_flat ** 2))),
            "sc_bias": float(gap_sc.mean()), "flat_bias": float(gap_flat.mean()),
            "sc_false_credit_unc0": false_credit(gap_sc, 0), "flat_false_credit_unc0": false_credit(gap_flat, 0),
            "sc_false_credit": false_credit(gap_sc, unc), "flat_false_credit": false_credit(gap_flat, unc),
            "expost_forecast_rmse": float(np.sqrt(np.mean((synth_post - base_sc) ** 2))),
            "sc_max_gap": float(gap_sc.max()), "flat_max_gap": float(gap_flat.max()),
        })
    df = pd.DataFrame(rows)
    df.to_csv(os.path.join(HERE, "data", "placebo_results.csv"), index=False)

    def summ(col):
        return {"mean": float(df[col].mean()), "median": float(df[col].median())}
    report = {
        "project_start": start, "pre_quarters": pre, "crediting_quarters": post,
        "n_placebos": int(len(df)), "uncertainty_tco2e_ha": unc,
        "sc_rmse": summ("sc_rmse"), "flat_rmse": summ("flat_rmse"),
        "sc_bias": summ("sc_bias"), "flat_bias": summ("flat_bias"),
        "pre_fit_rmse": summ("pre_fit_rmse"), "expost_forecast_rmse": summ("expost_forecast_rmse"),
        "share_false_credit_unc0": {"sc": float((df["sc_false_credit_unc0"] > 0).mean()),
                                    "flat": float((df["flat_false_credit_unc0"] > 0).mean())},
        "mean_false_credit_unc0_t_ha": {"sc": float(df["sc_false_credit_unc0"].mean()),
                                        "flat": float(df["flat_false_credit_unc0"].mean())},
        "share_false_credit_with_unc": {"sc": float((df["sc_false_credit"] > 0).mean()),
                                        "flat": float((df["flat_false_credit"] > 0).mean())},
        "sc_beats_flat_rmse_share": float((df["sc_rmse"] < df["flat_rmse"]).mean()),
        # Share of placebo plots that get ANY false credit, for a range of uncertainty deductions
        "deduction_sweep": [{"deduction": d,
                             "sc": float((df["sc_max_gap"] > d).mean()),
                             "flat": float((df["flat_max_gap"] > d).mean())} for d in range(0, 75, 5)],
    }
    with open(os.path.join(HERE, "models", "placebo_report.json"), "w") as f:
        json.dump(report, f, indent=2)

    print(f"\n{len(df)} placebo plots (no real restoration -> every credit is false)")
    print(f"Forecast RMSE (tCO2e/ha)   SC mean={report['sc_rmse']['mean']:.2f}  flat mean={report['flat_rmse']['mean']:.2f}"
          f"   SC better on {report['sc_beats_flat_rmse_share']:.0%} of plots")
    print(f"Mean bias obs-baseline     SC={report['sc_bias']['mean']:.2f}  flat={report['flat_bias']['mean']:.2f}")
    print(f"Pre-fit RMSE (mean)        {report['pre_fit_rmse']['mean']:.2f}")
    print(f"Ex-post forecast RMSE      {report['expost_forecast_rmse']['mean']:.2f}")
    print(f"Plots with false credit, no uncertainty deduction:   SC={report['share_false_credit_unc0']['sc']:.0%}"
          f"  flat={report['share_false_credit_unc0']['flat']:.0%}")
    print(f"Mean false credit (t/ha), no deduction:              SC={report['mean_false_credit_unc0_t_ha']['sc']:.2f}"
          f"  flat={report['mean_false_credit_unc0_t_ha']['flat']:.2f}")
    print(f"Plots with false credit, {unc:.1f} t/ha deduction:   SC={report['share_false_credit_with_unc']['sc']:.0%}"
          f"  flat={report['share_false_credit_with_unc']['flat']:.0%}")
    print("Deduction sweep (share of placebo plots with false credit):")
    for r in report["deduction_sweep"]:
        print(f"  {r['deduction']:>3} t/ha   SC={r['sc']:.0%}  flat={r['flat']:.0%}")


if __name__ == "__main__":
    main()
