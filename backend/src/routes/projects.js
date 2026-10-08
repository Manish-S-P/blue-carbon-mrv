// /api/projects: farmer plots (draw, register, list, detail) + verifier review of plots.
import { Router } from "express";
import Plot from "../models/Plot.js";
import Observation from "../models/Observation.js";
import { requireAuth, requireVerifier, isVerifier } from "../middleware/auth.js";
import { areaHa, findOverlaps, validatePolygon, MIN_HA, MAX_HA } from "../services/geo.js";
import { ml } from "../services/ml.js";
import { buildAndCommit, processPlot } from "../services/pipeline.js";

const r = Router();
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

// Quick checks while the farmer is drawing (area, overlap, study area) - nothing saved.
r.post("/check", requireAuth, wrap(async (req, res) => {
  const err = validatePolygon(req.body.geometry);
  if (err) return res.json({ ok: false, error: err });
  const ha = areaHa(req.body.geometry);
  const [overlaps, region] = await Promise.all([findOverlaps(req.body.geometry), ml.region(req.body.geometry)]);
  const problems = [];
  if (ha < MIN_HA || ha > MAX_HA) problems.push(`Area must be between ${MIN_HA} and ${MAX_HA} ha`);
  if (overlaps.length) problems.push(`Overlaps existing plot(s): ${overlaps.map((p) => p.name).join(", ")}`);
  if (!region.inside) problems.push("Outside the area the models were trained on");
  res.json({ ok: problems.length === 0, areaHa: ha, overlaps: overlaps.map((p) => p.name), region, problems });
}));

r.post("/", requireAuth, wrap(async (req, res) => {
  const { name, ecosystem, geometry, projectStart } = req.body;
  const err = validatePolygon(geometry);
  if (err) return res.status(400).json({ error: err });
  if (ecosystem !== "mangrove") {
    return res.status(400).json({ error: "Only mangrove is supported end-to-end in this prototype (seagrass/saltmarsh are future work)" });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(projectStart || "")) return res.status(400).json({ error: "projectStart must be YYYY-MM-DD" });
  const ha = areaHa(geometry);
  if (ha < MIN_HA || ha > MAX_HA) return res.status(400).json({ error: `Area ${ha.toFixed(2)} ha outside ${MIN_HA}-${MAX_HA} ha` });
  const overlaps = await findOverlaps(geometry);
  if (overlaps.length) return res.status(409).json({ error: `Overlaps: ${overlaps.map((p) => p.name).join(", ")}` });

  const plot = await Plot.create({
    owner: req.user.address, name: String(name || "My plot").slice(0, 80), ecosystem, geometry,
    areaHa: Number(ha.toFixed(4)), projectStart, step: "queued",
  });
  processPlot(plot._id); // background: classify -> baseline -> commit
  res.status(201).json(plot);
}));

r.get("/", requireAuth, wrap(async (req, res) => {
  const mine = req.query.all === "1" && isVerifier(req.user.address) ? {} : { owner: req.user.address };
  const plots = await Plot.find(mine).select("-auditJson -baseline.pre_features").sort({ createdAt: -1 });
  res.json(plots);
}));

// Public map layer: every registered plot outline (for overlap context), no personal data.
r.get("/public", wrap(async (_req, res) => {
  res.json(await Plot.find({ status: { $nin: ["rejected", "failed"] } }).select("name geometry status areaHa"));
}));

r.get("/review-queue", requireAuth, requireVerifier, wrap(async (_req, res) => {
  const plots = await Plot.find({ status: "manual_review" }).select("-auditJson");
  const obs = await Observation.find({ status: "held_for_review" }).populate("plot", "name owner areaHa");
  res.json({ plots, observations: obs });
}));

r.get("/:id", wrap(async (req, res) => {
  const plot = await Plot.findById(req.params.id);
  if (!plot) return res.status(404).json({ error: "Plot not found" });
  const observations = await Observation.find({ plot: plot._id }).sort({ quarterIndex: 1 });
  res.json({ plot, observations });
}));

r.post("/:id/review", requireAuth, requireVerifier, wrap(async (req, res) => {
  const plot = await Plot.findById(req.params.id);
  if (!plot || plot.status !== "manual_review") return res.status(400).json({ error: "Plot is not waiting for review" });
  const decision = req.body.decision === "approve" ? "approve" : "reject";
  plot.review = { by: req.user.address, at: new Date(), decision, note: String(req.body.note || "").slice(0, 500) };
  if (decision === "reject") {
    Object.assign(plot, { status: "rejected", statusNote: `Rejected by verifier: ${plot.review.note}`, step: "done" });
    await plot.save();
  } else {
    Object.assign(plot, { status: "processing", statusNote: "Approved by verifier" });
    await plot.save();
    buildAndCommit(plot).catch(async (e) => {
      Object.assign(plot, { status: "failed", statusNote: e.message, step: "error" });
      await plot.save();
    });
  }
  res.json(plot);
}));

export default r;
