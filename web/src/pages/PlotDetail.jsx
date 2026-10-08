import { Fragment, useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../lib/api.js";
import { useWallet } from "../lib/wallet.jsx";
import { date, fmt, milli, pct } from "../lib/format.js";
import { PlotMap } from "../components/Maps.jsx";
import { BaselineChart, FractionBar, ShapBars } from "../components/Charts.jsx";
import { ErrorNote, Hash, Note, Section, Spinner, Stat, StatusBadge } from "../components/ui.jsx";

function Lifecycle({ plot, observations }) {
  const onChain = observations.filter((o) => ["on_chain"].includes(o.status)).length;
  const n = plot.baseline?.future_quarters?.length || 8;
  const steps = [
    ["Submitted", true],
    ["Ecosystem check", !!plot.classification],
    ["Baseline committed", !!plot.commitment],
    [`Monitoring ${onChain}/${n}`, onChain > 0],
    ["Baseline revealed", plot.revealed],
  ];
  return <ol className="flex flex-wrap gap-x-2 gap-y-3">
    {steps.map(([label, done], i) => <li key={label} className="flex items-center gap-2">
      <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${done ? "bg-leaf text-white" : "bg-line text-muted"}`}>{done ? "✓" : i + 1}</span>
      <span className={`text-sm ${done ? "" : "text-muted"}`}>{label}</span>
      {i < steps.length - 1 && <span className="mx-1 hidden h-px w-8 bg-line sm:block" />}
    </li>)}
  </ol>;
}

function Classification({ c, review }) {
  if (!c) return null;
  const tone = { accept: "text-leaf", manual_review: "text-amber", reject: "text-coral" }[c.decision];
  return <Section title="Ecosystem check" subtitle={`Model 1 (Random Forest) on ${c.n_pixels ?? "?"} sampled pixels from ${c.year ?? "?"} satellite data`}>
    <div className="grid gap-6 md:grid-cols-2">
      <div className="space-y-4">
        <div>
          <div className="label">Decision</div>
          <div className={`mt-1 font-display text-2xl capitalize ${tone}`}>{c.decision.replace("_", " ")}</div>
          {c.reason && <div className="text-sm text-muted">{c.reason}</div>}
          {c.thresholds && <div className="mt-1 text-xs text-muted">accept ≥ {pct(c.thresholds.accept_mangrove_frac, 0)} mangrove · review ≥ {pct(c.thresholds.review_mangrove_frac, 0)}</div>}
        </div>
        <FractionBar fractions={c.class_fractions} />
        {review?.decision && <Note>Verifier {review.decision}d{review.note ? `: “${review.note}”` : ""}</Note>}
      </div>
      {c.shap && <div>
        <div className="label mb-2">Why (SHAP, towards “mangrove”)</div>
        <ShapBars contributions={c.shap.contributions} unit="prob." />
      </div>}
    </div>
  </Section>;
}

function QuarterRow({ q, i, plot, obs, canAct, nextIdx, busy, onRun, onSettle }) {
  const [open, setOpen] = useState(false);
  const base = plot.baseline.baseline[i];
  const unc = plot.baseline.uncertainty_t_ha;
  const add = obs?.co2eTHa != null ? obs.co2eTHa - base - unc : null;
  return <Fragment>
    <tr className="border-t border-line">
      <td className="py-3 pr-3 font-mono text-xs">{q}</td>
      <td className="pr-3 text-right">{fmt(base)}</td>
      <td className="pr-3 text-right">{obs?.co2eTHa != null ? fmt(obs.co2eTHa) : "—"}</td>
      <td className={`pr-3 text-right ${add > 0 ? "text-leaf" : "text-muted"}`}>{add == null ? "—" : add > 0 ? `+${fmt(add)}` : `${fmt(add)} → 0`}</td>
      <td className="pr-3">{obs ? <StatusBadge status={obs.status} /> : <span className="text-xs text-muted">pending</span>}
        {obs?.anomaly?.flag && <div className="mt-1 text-xs text-amber">{obs.anomaly.reason}</div>}</td>
      <td className="pr-3 text-right">
        {obs?.settled ? (obs.tokenId ? <span className="text-leaf">#{obs.tokenId} · {milli(obs.creditMilli)} t</span> : <span className="text-xs text-muted">no credit</span>) : "—"}
      </td>
      <td className="py-2 text-right whitespace-nowrap">
        {canAct && i === nextIdx && <button className="btn-primary px-3 py-1" disabled={busy} onClick={onRun}>{busy === "run" ? <Spinner /> : "Run quarter"}</button>}
        {canAct && obs?.status === "on_chain" && !obs.settled && <button className="btn-ghost px-3 py-1" disabled={busy} onClick={() => onSettle(i)}>{busy === `settle${i}` ? <Spinner /> : "Reveal & mint"}</button>}
        {obs?.shap && <button className="ml-1 rounded px-2 py-1 text-xs text-lagoon hover:bg-lagoon-light" onClick={() => setOpen(!open)}>{open ? "hide" : "why?"}</button>}
      </td>
    </tr>
    {open && obs?.shap && <tr><td colSpan={7} className="pb-4">
      <div className="grid gap-4 rounded-xl bg-sand p-4 md:grid-cols-[1fr_260px]">
        <div><div className="label mb-1">SHAP: what drove the biomass estimate (Mg/ha, base {fmt(obs.shap.base_value_mg_ha)})</div><ShapBars contributions={obs.shap.contributions} unit="Mg/ha" /></div>
        <div className="space-y-2 text-xs">
          <div><span className="label">AGB</span> {fmt(obs.agbMgHa)} Mg/ha</div>
          <div><span className="label">Anomaly score</span> {fmt(obs.anomaly?.score, 3)} ({obs.anomaly?.reason})</div>
          <div><span className="label">S2 images / valid</span> {obs.features?.s2_n_images} / {pct(obs.features?.s2_valid_frac, 0)}</div>
          <div><span className="label">S1 images</span> {obs.features?.s1_n_images}</div>
          {obs.submitTx && <div><span className="label">Observation tx</span> <Hash value={obs.submitTx} /></div>}
          {obs.settleTx && <div><span className="label">Settle tx</span> <Hash value={obs.settleTx} /></div>}
          {obs.cid && <div><span className="label">Audit CID</span> <Hash value={obs.cid} />{obs.cidSimulated && <span className="ml-1 text-amber">simulation</span>}</div>}
        </div>
      </div>
    </td></tr>}
  </Fragment>;
}

export default function PlotDetail() {
  const { id } = useParams();
  const { user } = useWallet();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");

  const load = useCallback(() => api(`/projects/${id}`).then(setData).catch((e) => setError(e.message)), [id]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (data?.plot?.status !== "processing") return;
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [data?.plot?.status, load]);

  if (error && !data) return <ErrorNote>{error}</ErrorNote>;
  if (!data) return <div className="flex items-center gap-2 text-muted"><Spinner /> Loading…</div>;
  const { plot, observations } = data;
  const b = plot.baseline;
  const canAct = user && (user.address === plot.owner || user.verifier) && plot.status === "registered";
  const obsByIdx = Object.fromEntries(observations.map((o) => [o.quarterIndex, o]));
  const nextIdx = b ? b.future_quarters.findIndex((_, i) => !obsByIdx[i] || obsByIdx[i].status === "no_data") : -1;
  const credited = observations.reduce((s, o) => s + (o.creditMilli || 0), 0);
  const buffered = observations.reduce((s, o) => s + (o.bufferMilli || 0), 0);

  const act = async (kind, fn) => {
    setBusy(kind); setError(""); setMsg("");
    try { await fn(); await load(); } catch (e) { setError(e.message); } finally { setBusy(""); }
  };
  const run = () => act("run", async () => {
    const o = await api(`/mrv/quarterly-run/${plot._id}`, { method: "POST" });
    setMsg(o.status === "no_data" ? `${o.quarter}: no usable satellite data, you can retry later.` : `${o.quarter} processed: ${o.status.replaceAll("_", " ")}.`);
  });
  const settle = (i) => act(`settle${i}`, async () => {
    const o = await api(`/mrv/reveal-and-mint/${plot._id}`, { method: "POST", body: { quarterIndex: i } });
    setMsg(o.tokenId ? `Minted credit #${o.tokenId}: ${milli(o.creditMilli)} tCO2e.` : `Baseline revealed for ${o.quarter}. No additional carbon above baseline + uncertainty, so no credit was minted.`);
  });

  return <div className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <Link to="/dashboard" className="text-sm text-muted hover:text-ink">← My plots</Link>
        <h1 className="mt-1 text-3xl">{plot.name}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-muted">
          <StatusBadge status={plot.status} />
          <span>{fmt(plot.areaHa, 2)} ha</span><span>·</span><span className="capitalize">{plot.ecosystem}</span><span>·</span>
          <span>start {date(plot.projectStart)}</span><span>·</span><span>owner <Hash value={plot.owner} n={4} /></span>
        </div>
      </div>
      {plot.revealed && <Link to={`/verify/${plot._id}`} className="btn-ghost">Verify this plot ↗</Link>}
    </div>

    <div className="card p-5"><Lifecycle plot={plot} observations={observations} /></div>

    {plot.status === "processing" && <Note><span className="inline-flex items-center gap-2"><Spinner /> {plot.step}… (Earth Engine work, usually 1–3 minutes)</span></Note>}
    {["rejected", "failed", "manual_review"].includes(plot.status) && <Note tone="amber">{plot.statusNote}</Note>}
    {msg && <Note>{msg}</Note>}
    <ErrorNote>{error}</ErrorNote>

    <div className="grid gap-6 lg:grid-cols-[1fr_420px]">
      <PlotMap geometry={plot.geometry} height={340} />
      <Section title="On-chain record" subtitle="Only the commitment is public until the baseline is revealed.">
        <dl className="space-y-3 text-sm">
          <div className="flex justify-between gap-2"><dt className="text-muted">Plot key</dt><dd><Hash value={plot.plotKey} /></dd></div>
          <div className="flex justify-between gap-2"><dt className="text-muted">Commitment</dt><dd><Hash value={plot.commitment} /></dd></div>
          <div className="flex justify-between gap-2"><dt className="text-muted">Audit hash</dt><dd><Hash value={plot.auditHash} /></dd></div>
          <div className="flex justify-between gap-2"><dt className="text-muted">Register tx</dt><dd><Hash value={plot.registerTx} /></dd></div>
          <div className="flex justify-between gap-2"><dt className="text-muted">Baseline revealed</dt><dd>{plot.revealed ? "yes" : "not yet"}</dd></div>
          {plot.auditCid && <div className="flex justify-between gap-2"><dt className="text-muted">Audit file</dt><dd><Hash value={plot.auditCid} />{plot.cidSimulated && <span className="ml-1 text-xs text-amber">simulation</span>}</dd></div>}
        </dl>
        {b && <div className="mt-5 grid grid-cols-2 gap-4 border-t border-line pt-4">
          <Stat label="Credited" value={milli(credited, 2)} unit="tCO2e" />
          <Stat label="Buffer pool" value={milli(buffered, 2)} unit="tCO2e" hint={`${pct(b.crediting?.buffer_frac, 0)} held back (assumed)`} />
        </div>}
      </Section>
    </div>

    <Classification c={plot.classification} review={plot.review} />

    {b && <Section title="Counterfactual baseline" subtitle="Synthetic control fitted on the pre-period, then forecast (trend + seasonality) on day 0 and committed on-chain. It is never recomputed.">
      {b.historical_replay && <div className="mb-4"><Note tone="amber">Historical replay: the crediting quarters are already in the past, used to demonstrate the flow with real satellite data.</Note></div>}
      <BaselineChart baseline={b} observations={observations} />
      <div className="mt-6 grid gap-6 md:grid-cols-[1fr_1fr]">
        <div className="grid grid-cols-2 gap-4">
          <Stat label="Pre-period fit" value={fmt(b.pre_fit_rmse, 2)} unit="t/ha RMSE" hint={`${b.pre_quarters.length} quarters`} />
          <Stat label="Uncertainty deduction" value={fmt(b.uncertainty_t_ha, 1)} unit="t/ha" hint="90% one-sided, from spatial CV + GEDI error" />
          <Stat label="Donors used" value={b.weights.length} hint={`of ${b.n_donors_considered} closest; ${b.excluded_nearby_donors.length} nearby excluded`} />
          <Stat label="Carbon fraction · R:S" value={`${b.carbon_params.carbon_fraction} · ${b.carbon_params.root_to_shoot}`} hint="IPCC 2013 Wetlands Suppl." />
        </div>
        <div>
          <div className="label mb-2">Donor weights (sum = 1)</div>
          <div className="max-h-48 space-y-1.5 overflow-auto pr-2">
            {b.weights.map(([d, w]) => <div key={d} className="flex items-center gap-2 text-xs">
              <span className="w-44 truncate font-mono">{d}</span>
              <div className="h-2 flex-1 rounded-full bg-line"><div className="h-2 rounded-full bg-lagoon" style={{ width: `${w * 100}%` }} /></div>
              <span className="w-12 text-right">{pct(w, 1)}</span>
            </div>)}
          </div>
        </div>
      </div>
    </Section>}

    {b && <Section title="Crediting quarters" subtitle="Carbon is a stock: each quarter's stock is compared with that quarter's baseline (never summed). Credit = max(observed − baseline − uncertainty, 0) × area − already issued, minus buffer.">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead><tr className="text-left text-xs text-muted">
            <th className="pb-2 pr-3 font-medium">Quarter</th><th className="pb-2 pr-3 text-right font-medium">Baseline t/ha</th><th className="pb-2 pr-3 text-right font-medium">Observed t/ha</th>
            <th className="pb-2 pr-3 text-right font-medium">Additional t/ha</th><th className="pb-2 pr-3 font-medium">Status</th><th className="pb-2 pr-3 text-right font-medium">Credit</th><th />
          </tr></thead>
          <tbody>{b.future_quarters.map((q, i) => <QuarterRow key={q} q={q} i={i} plot={plot} obs={obsByIdx[i]} canAct={canAct}
            nextIdx={nextIdx} busy={busy} onRun={run} onSettle={settle} />)}</tbody>
        </table>
      </div>
      {busy === "run" && <p className="mt-3 flex items-center gap-2 text-sm text-muted"><Spinner /> Pulling Sentinel-1/2 data and estimating carbon…</p>}
    </Section>}
  </div>;
}
