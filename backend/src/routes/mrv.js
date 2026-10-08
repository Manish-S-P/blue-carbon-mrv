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

// Farmer-friendly: check every remaining quarter in the background. The dashboard polls plot.job.
r.post("/run-all/:plotId", requireAuth, wrap(async (req, res) => {
  const plot = await loadOwnPlot(req);
  const id = String(plot._id);
  if (running.has(id)) return res.status(409).json({ error: "Another job is running for this plot" });
  const done = await Observation.find({ plot: plot._id, status: { $ne: "no_data" } }).distinct("quarterIndex");
  const todo = plot.baseline.future_quarters.map((_, i) => i).filter((i) => !done.includes(i));
  if (!todo.length) return res.status(409).json({ error: "All crediting quarters are processed" });
  plot.job = { kind: "run-all", running: true, done: 0, total: todo.length, message: "Starting" };
  await plot.save();
  res.json({ started: todo.length });
  once(id, async () => {
    for (const [n, i] of todo.entries()) {
      plot.job = { ...plot.job, done: n, message: `Checking ${plot.baseline.future_quarters[i]}` };
      await plot.save();
      try { await runQuarter(plot, i); } catch (e) {
        if (e.status === 409) { plot.job = { ...plot.job, message: e.message }; break; } // e.g. quarter not finished yet
        plot.job = { ...plot.job, running: false, error: e.message };
        return plot.save();
      }
    }
    plot.job = { ...plot.job, running: false, done: plot.job.total, message: "Finished" };
    await plot.save();
  }).catch(async (e) => { plot.job = { ...plot.job, running: false, error: e.message }; await plot.save(); });
}));

// Farmer-friendly: reveal + mint every checked quarter that is not settled yet.
r.post("/claim/:plotId", requireAuth, wrap(async (req, res) => {
  const plot = await loadOwnPlot(req);
  const ready = await Observation.find({ plot: plot._id, status: "on_chain", settled: false }).sort({ quarterIndex: 1 });
  if (!ready.length) return res.status(409).json({ error: "No checked quarters waiting to be claimed" });
  const results = await once(String(plot._id), async () => {
    const out = [];
    for (const obs of ready) out.push(await settleQuarter(plot, obs));
    return out;
  });
  const minted = results.filter((o) => o.tokenId);
  res.json({
    settled: results.length, minted: minted.length,
    creditMilli: minted.reduce((s, o) => s + o.creditMilli, 0),
    quarters: results.map((o) => ({ quarter: o.quarter, tokenId: o.tokenId, creditMilli: o.creditMilli })),
  });
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
