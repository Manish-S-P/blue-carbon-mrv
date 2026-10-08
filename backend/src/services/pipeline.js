// The MRV flow (CLAUDE.md "User flow" steps 2-6). Long steps run in the background;
// the web app polls the plot to show progress.
import Plot from "../models/Plot.js";
import Observation from "../models/Observation.js";
import { ml } from "./ml.js";
import { chain, send } from "./chain.js";
import { pinJson } from "./ipfs.js";
import { canonicalJson, commitmentOf, expectedCreditMilli, hashJson, newSalt, plotKeyOf, toMilli } from "./audit.js";

async function setStep(plot, step, extra = {}) {
  Object.assign(plot, { step, ...extra });
  await plot.save();
}

// Step 2: ecosystem check. Accept -> continue; manual review -> wait for a verifier; reject -> stop.
export async function processPlot(plotId) {
  const plot = await Plot.findById(plotId);
  try {
    await setStep(plot, "Checking satellite data matches the claimed ecosystem");
    const cls = await ml.classify(plot.geometry, plot.projectStart);
    plot.classification = cls;
    if (cls.decision === "reject") {
      return setStep(plot, "done", { status: "rejected", statusNote: cls.reason || "Satellite data does not show mangrove" });
    }
    if (cls.decision === "manual_review") {
      return setStep(plot, "waiting for verifier", { status: "manual_review", statusNote: cls.reason || "Mixed land cover: a verifier must check" });
    }
    await buildAndCommit(plot);
  } catch (e) {
    console.error(e);
    await setStep(plot, "error", { status: "failed", statusNote: e.message });
  }
}

// Steps 3-4: synthetic-control baseline, audit hash, commitment on-chain.
export async function buildAndCommit(plot) {
  await setStep(plot, "Building synthetic-control baseline from donor plots");
  const b = await ml.baseline(String(plot._id), plot.geometry, plot.projectStart);
  const baselineMilli = b.baseline.map((v) => Math.max(0, toMilli(v))); // stock cannot be negative
  const { deployment } = chain();
  const plotKey = plotKeyOf(plot._id);
  const areaMilliHa = toMilli(plot.areaHa);

  const audit = {
    schema: "bluecarbon-mrv/audit/v1",
    plotId: String(plot._id), plotKey, owner: plot.owner, name: plot.name, ecosystem: plot.ecosystem,
    geometry: plot.geometry, areaHa: plot.areaHa, areaMilliHa, projectStart: plot.projectStart,
    classification: {
      decision: plot.classification.decision, class_fractions: plot.classification.class_fractions,
      year: plot.classification.year, n_pixels: plot.classification.n_pixels, review: plot.review?.decision ? plot.review : undefined,
    },
    baseline: { ...b, baselineMilli },
    chain: { chainId: deployment.chainId, contract: deployment.address },
    createdAt: new Date().toISOString(),
  };
  const auditJson = canonicalJson(audit);
  const auditHash = hashJson(auditJson);
  const salt = newSalt();
  const commitment = commitmentOf(plotKey, baselineMilli, auditHash, salt);

  await setStep(plot, "Committing baseline hash on-chain");
  const tx = await send("registerPlot", plotKey, plot.owner, commitment, areaMilliHa, baselineMilli.length);
  Object.assign(plot, {
    baseline: b, baselineMilli, plotKey, auditJson, auditHash, salt, commitment, registerTx: tx.hash,
    status: "registered", statusNote: "Baseline committed on-chain (only the hash is public until reveal)",
  });
  await setStep(plot, "done");
}

// Step 5: one crediting quarter.
export async function runQuarter(plot, quarterIndex) {
  const quarter = plot.baseline.future_quarters[quarterIndex];
  if (!quarter) throw Object.assign(new Error("Quarter index outside the crediting period"), { status: 400 });
  const existing = await Observation.findOne({ plot: plot._id, quarterIndex });
  if (existing && existing.status !== "no_data") {
    throw Object.assign(new Error(`${quarter} already processed (${existing.status})`), { status: 409 });
  }
  const r = await ml.observe(String(plot._id), plot.geometry, quarter);
  if (r.status === "not_available") throw Object.assign(new Error(r.reason), { status: 409 });

  const doc = existing || new Observation({ plot: plot._id, quarterIndex, quarter });
  if (r.status === "no_data") {
    Object.assign(doc, { status: "no_data", features: r.features });
    return doc.save();
  }
  Object.assign(doc, {
    status: r.status, co2eTHa: r.co2e_t_ha, agbMgHa: r.agb_mg_ha, uncertaintyTHa: r.uncertainty_t_ha,
    baselineTHa: plot.baseline.baseline[quarterIndex],
    observedMilli: toMilli(r.co2e_t_ha), uncertaintyMilli: toMilli(r.uncertainty_t_ha),
    anomaly: r.anomaly, shap: r.shap, features: r.features, modelVersions: r.model_versions,
  });
  await doc.save();
  if (r.status === "ok") await submitObservation(plot, doc);
  return doc;
}

export async function submitObservation(plot, obs) {
  const tx = await send("submitObservation", plot.plotKey, obs.quarterIndex, obs.observedMilli, obs.uncertaintyMilli);
  Object.assign(obs, { status: "on_chain", submitTx: tx.hash });
  return obs.save();
}

// Step 6: pin the audit + reveal file, reveal the baseline on-chain, mint if there is additional carbon.
export async function settleQuarter(plot, obs) {
  const { registry, deployment } = chain();
  const onChain = await registry.plots(plot.plotKey);
  const expected = expectedCreditMilli({
    observedMilli: obs.observedMilli, uncertaintyMilli: obs.uncertaintyMilli,
    baselineMilli: plot.baselineMilli[obs.quarterIndex], areaMilliHa: onChain.areaMilliHa,
    alreadyIssuedMilli: onChain.grossIssuedMilli, bufferBps: deployment.bufferBps,
  });
  const withSalt = await Plot.findById(plot._id).select("+salt");
  const file = {
    schema: "bluecarbon-mrv/settlement/v1",
    audit: JSON.parse(plot.auditJson),
    reveal: { plotKey: plot.plotKey, baselineMilli: plot.baselineMilli, auditHash: plot.auditHash, salt: withSalt.salt, commitment: plot.commitment },
    quarter: {
      index: obs.quarterIndex, label: obs.quarter, observedMilli: obs.observedMilli, uncertaintyMilli: obs.uncertaintyMilli,
      baselineMilli: plot.baselineMilli[obs.quarterIndex], submitTx: obs.submitTx, anomaly: obs.anomaly, shap: obs.shap,
      review: obs.review?.decision ? obs.review : undefined, modelVersions: obs.modelVersions,
    },
    expected: { creditMilli: String(expected.credit), bufferMilli: String(expected.buffer) },
    chain: { chainId: deployment.chainId, contract: deployment.address },
  };
  const pinned = await pinJson(`bluecarbon-${plot._id}-${obs.quarter}`, canonicalJson(file));
  const tx = await send("revealAndMint", plot.plotKey, obs.quarterIndex, plot.baselineMilli, plot.auditHash, withSalt.salt, pinned.cid);
  const minted = tx.events.find((e) => e.name === "CreditMinted");
  Object.assign(obs, {
    settled: true, settleTx: tx.hash, cid: pinned.cid, cidSimulated: pinned.simulated,
    tokenId: minted ? Number(minted.args.tokenId) : 0,
    creditMilli: minted ? Number(minted.args.amountMilli) : 0,
    bufferMilli: minted ? Number(minted.args.bufferMilli) : 0,
  });
  await obs.save();
  if (!plot.revealed) {
    Object.assign(plot, { revealed: true, auditCid: pinned.cid, cidSimulated: pinned.simulated });
    await plot.save();
  }
  return obs;
}
