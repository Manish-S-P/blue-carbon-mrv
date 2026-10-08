// /api/verify: hands out the raw public data. The web app does the hashing itself,
// so a verifier does not have to trust this backend.
import { Router } from "express";
import Plot from "../models/Plot.js";
import Observation from "../models/Observation.js";
import { readPinned } from "../services/ipfs.js";

const r = Router();

r.get("/file/:cid", async (req, res) => {
  try { res.type("application/json").send(await readPinned(req.params.cid)); }
  catch (e) { res.status(404).json({ error: e.message }); }
});

// Settled quarters (with CIDs) for a plot, so the Verify page knows what to check.
r.get("/plot/:id", async (req, res) => {
  const plot = await Plot.findById(req.params.id).select("name plotKey commitment auditCid revealed");
  if (!plot) return res.status(404).json({ error: "Plot not found" });
  const settled = await Observation.find({ plot: plot._id, settled: true }).select("quarter quarterIndex cid tokenId settleTx cidSimulated");
  res.json({ plot, settled });
});

export default r;
