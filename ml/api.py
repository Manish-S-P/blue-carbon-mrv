"""HTTP service for the Node backend.

Run:  uvicorn api:app --port 8000      (from ml/, with the venv active)
"""
import json
import os

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

import mrv
from estimate import MODELS
from utils import last_complete_quarter_end

app = FastAPI(title="Blue Carbon MRV - ML service")


class PlotIn(BaseModel):
    plot_id: str = "plot"
    geometry: dict
    project_start: str = mrv.CFG["demo"]["project_start"]


class ObserveIn(BaseModel):
    plot_id: str = "plot"
    geometry: dict
    quarter: str


def _report(name):
    path = os.path.join(MODELS, f"{name}_report.json")
    if not os.path.exists(path):
        return None
    with open(path) as f:
        return json.load(f)


def _run(fn, *args):
    try:
        return fn(*args)
    except ValueError as e:
        raise HTTPException(422, str(e))


@app.get("/health")
def health():
    return {"ok": True, "models": mrv.model_versions(), "last_complete_quarter_end": last_complete_quarter_end()}


@app.get("/config")
def config():
    c = mrv.CFG
    return {"study_area": c["study_area"], "site": c["site"], "baseline": c["baseline"],
            "carbon": c["carbon"], "classifier": c["classifier"], "demo": c["demo"]}


@app.get("/reports")
def reports():
    return {k: _report(k) for k in ("classifier", "carbon", "placebo")}


@app.post("/region")
def region(p: PlotIn):
    return mrv.check_region(p.geometry)


@app.post("/classify")
def classify(p: PlotIn):
    return _run(mrv.classify_plot, p.geometry, p.project_start)


@app.post("/baseline")
def baseline(p: PlotIn):
    return _run(mrv.build_baseline, p.plot_id, p.geometry, p.project_start)


@app.post("/observe")
def observe(o: ObserveIn):
    return _run(mrv.observe_quarter, o.plot_id, o.geometry, o.quarter)
