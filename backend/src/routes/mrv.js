// /api/mrv: quarterly runs, anomaly review, reveal-and-mint.
import { Router } from "express";
import Plot from "../models/Plot.js";
import Observation from "../models/Observation.js";
import { requireAuth, requireVerifier, isVerifier } from "../middleware/auth.js";
import { runQuarter, settleQuarter, submitObservation } from "../services/pipeline.js";

const r = Router();
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);
const running = new Set(); // one job per plot at a time

async function loadOwnPlot(req) {
  const plot = await Plot.findById(req.params.plotId);
  if (!plot) throw Object.assign(new Error("Plot not found"), { status: 404 });
  if (plot.owner !== req.user.address && !isVerifier(req.user.address)) throw Object.assign(new Error("Not your plot"), { status: 403 });
  if (plot.status !== "registered") throw Object.assign(new Error("Plot has no committed baseline yet"), { status: 400 });
  return plot;
}

async function once(plotId, fn) {
  if (running.has(plotId)) throw Object.assign(new Error("Another job is running for this plot"), { status: 409 });
  running.add(plotId);
  try { return await fn(); } finally { running.delete(plotId); }
}

// Runs the next unprocessed crediting quarter (or ?quarter=<index>).
r.post("/quarterly-run/:plotId", requireAuth, wrap(async (req, res) => {
  const plot = await loadOwnPlot(req);
  let idx = req.query.quarter !== undefined ? Number(req.query.quarter) : null;
  if (idx === null) {
    const done = await Observation.find({ plot: plot._id, status: { $ne: "no_data" } }).distinct("quarterIndex");
    idx = plot.baseline.future_quarters.findIndex((_, i) => !done.includes(i));
    if (idx < 0) return res.status(409).json({ error: "All crediting quarters are processed" });
  }
  const obs = await once(String(plot._id), () => runQuarter(plot, idx));
  res.json(obs);
}));

r.post("/observations/:obsId/review", requireAuth, requireVerifier, wrap(async (req, res) => {
  const obs = await Observation.findById(req.params.obsId);
  if (!obs || obs.status !== "held_for_review") return res.status(400).json({ error: "Not waiting for review" });
  const decision = req.body.decision === "approve" ? "approve" : "reject";
  obs.review = { by: req.user.address, at: new Date(), decision, note: String(req.body.note || "").slice(0, 500) };
  if (decision === "reject") {
    obs.status = "rejected";
    await obs.save();
    return res.json(obs);
  }
  const plot = await Plot.findById(obs.plot);
  res.json(await submitObservation(plot, obs));
}));

r.post("/reveal-and-mint/:plotId", requireAuth, wrap(async (req, res) => {
  const plot = await loadOwnPlot(req);
  const idx = Number(req.body.quarterIndex);
  const obs = await Observation.findOne({ plot: plot._id, quarterIndex: idx });
  if (!obs || obs.status !== "on_chain") return res.status(400).json({ error: "That quarter has no on-chain observation" });
  if (obs.settled) return res.status(409).json({ error: "Quarter already settled" });
  res.json(await once(String(plot._id), () => settleQuarter(plot, obs)));
}));

export default r;
