"""Model 3: anomaly detector (Isolation Forest).

Trained on donor plots' quarterly rows: the satellite features plus the quarter-to-quarter change
in predicted carbon. A farmer plot's new quarter that looks unlike anything in the donor history
(e.g. sudden clearing, flooding, a bad composite) is flagged and HELD for manual review.

Run:  python anomaly.py   -> saves models/anomaly.joblib
"""
import os

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest

from carbon_model import FEATURES as CARBON_FEATURES
from donors import DONOR_SERIES
from utils import HERE, load_config

FEATURES = CARBON_FEATURES + ["d_co2e"]
MODEL_PATH = os.path.join(HERE, "models", "anomaly.joblib")


def add_change(df, id_col):
    """Change in predicted carbon vs the previous quarter of the same plot."""
    df = df.sort_values([id_col, "quarter"]).copy()
    df["d_co2e"] = df.groupby(id_col)["co2e_t_ha"].diff()
    return df


def main():
    cfg = load_config()
    df = add_change(pd.read_csv(DONOR_SERIES), "donor_id")
    X = df[FEATURES].dropna()  # Isolation Forest needs complete rows; incomplete rows are not used
    print(f"Training on {len(X)} complete donor-quarter rows (of {len(df)})")
    model = IsolationForest(n_estimators=300, contamination=cfg["anomaly"]["contamination"],
                            random_state=cfg["training"]["random_state"]).fit(X)
    flags = model.predict(X) == -1
    print(f"Flagged {flags.sum()} training rows ({flags.mean():.1%}), by design ~{cfg['anomaly']['contamination']:.0%}")
    print("Typical carbon change of flagged rows (tCO2e/ha):",
          np.round(X.loc[flags, "d_co2e"].describe()[["mean", "min", "max"]].values, 2))
    joblib.dump({"model": model, "features": FEATURES}, MODEL_PATH)
    print(f"Saved {MODEL_PATH}")


def check(row):
    """row: dict with FEATURES. Returns (is_anomaly, score, reason)."""
    b = joblib.load(MODEL_PATH)
    x = pd.DataFrame([row])[b["features"]]
    if x.isna().any(axis=1).iloc[0]:
        missing = [c for c in b["features"] if pd.isna(x[c].iloc[0])]
        return True, None, f"incomplete data ({', '.join(missing)}) - held for review"
    score = float(b["model"].decision_function(x)[0])
    bad = bool(b["model"].predict(x)[0] == -1)
    return bad, score, "unusual compared to donor history" if bad else "normal"


if __name__ == "__main__":
    main()
