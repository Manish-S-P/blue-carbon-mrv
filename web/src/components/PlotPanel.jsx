// One plot, explained simply: progress checklist, big action buttons, plain-language results.
// Reviewers can open the "Technical details" tab for the full science.
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api.js";
import { useWallet } from "../lib/wallet.jsx";
import { fmt, landText, milli, pct } from "../lib/format.js";
import { PlotMap } from "./Maps.jsx";
import { SimpleProgressChart } from "./Charts.jsx";
import SuccessModal from "./SuccessModal.jsx";
import TechnicalDetails from "./TechnicalDetails.jsx";
import { ErrorNote, Hash, Note, Spinner } from "./ui.jsx";

const TABS = [["overview", "Overview"], ["checks", "Quarterly checks"], ["proof", "Blockchain proof"], ["tech", "Technical details"]];

// Friendly words for each quarter's state
function quarterState(o) {
  if (!o) return ["Not checked yet", "text-muted"];
  if (o.settled) return o.tokenId ? [`Claimed: ${milli(o.creditMilli, 2)} t credits`, "text-leaf"] : ["Claimed: no extra carbon", "text-muted"];
  return {
    on_chain: ["Checked ✓ ready to claim", "text-leaf"],
    held_for_review: ["Unusual result, a verifier is checking", "text-amber"],
    no_data: ["Too cloudy, try again later", "text-amber"],
    rejected: ["Rejected by verifier", "text-coral"],
  }[o.status] || [o.status, "text-muted"];
}

// One quarter in plain words
function explain(o, base, unc) {
  if (!o || o.co2eTHa == null) return null;
  const line = base + unc;
  const extra = o.co2eTHa - line;
  return <>
    In <b>{o.quarter}</b>, your mangroves held about <b>{fmt(o.co2eTHa, 0)} tonnes of CO₂ per hectare</b>.
    Without the project we expected about <b>{fmt(base, 0)}</b>. To earn credits it must be above <b>{fmt(line, 0)}</b> (expected + safety margin).{" "}
    {extra > 0 ? <span className="text-leaf">That is <b>{fmt(extra, 1)} t/ha extra</b>, which can become credits.</span>
               : <span>Not above the line yet, so <b>no credits</b> for this quarter. Keep protecting and planting.</span>}
  </>;
}

function Progress({ plot, observations }) {
  const b = plot.baseline;
  const checked = observations.filter((o) => ["on_chain", "held_for_review"].includes(o.status) || o.settled).length;
  const claimedT = observations.reduce((s, o) => s + (o.creditMilli || 0), 0);
  const c = plot.classification;
  const failed = ["rejected", "failed"].includes(plot.status);
  const steps = [
    { title: "Land registered", done: true, text: `${landText(plot.areaHa)}${plot.village ? ` in ${plot.village}` : ""}` },
    { title: "Satellite check: is it mangrove?", done: !!c && c.decision === "accept" || plot.review?.decision === "approve",
      bad: c?.decision === "reject" || plot.status === "rejected", wait: plot.status === "manual_review",
      text: c?.class_fractions ? `${pct(c.class_fractions.mangrove, 0)} of your land looks like mangrove in satellite pictures` : plot.status === "processing" ? "Looking at satellite pictures…" : "" },
    { title: "Starting point locked on blockchain", done: !!plot.commitment,
      text: plot.commitment ? "We predicted how your land would change without the project, and locked it so nobody can change it later." : "" },
    { title: `Quarterly checks: ${checked} of ${b?.future_quarters?.length || 8}`, done: checked > 0, text: "Every 3 months we measure the carbon from satellites." },
    { title: "Credits", done: observations.some((o) => o.settled), text: observations.some((o) => o.settled) ? `${milli(claimedT, 2)} tonnes CO₂ credited so far` : "Claim after a check to see if you earned credits." },
  ];
  return <ol className="space-y-1">
    {steps.map((s, i) => {
      const icon = s.bad ? "✗" : s.done ? "✓" : s.wait ? "…" : i + 1;
      const cls = s.bad ? "bg-coral text-white" : s.done ? "bg-leaf text-white" : s.wait ? "bg-amber text-white" : "bg-line text-muted";
      return <li key={s.title} className="flex gap-3">
        <div className="flex flex-col items-center">
          <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${cls}`}>{icon}</span>
          {i < steps.length - 1 && <span className="my-1 w-px flex-1 bg-line" />}
        </div>
        <div className="pb-4">
          <div className={`font-medium ${s.done || s.bad || s.wait ? "" : "text-muted"}`}>{s.title}</div>
          {s.text && <div className="text-sm text-muted">{s.text}</div>}
        </div>
      </li>;
    }).filter((_, i) => !failed || i < 2)}
  </ol>;
}

export default function PlotPanel({ plotId, onChanged }) {
  const { user } = useWallet();
  const [data, setData] = useState(null);
  const [tab, setTab] = useState("overview");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [modal, setModal] = useState(null);

  const load = useCallback(() => api(`/projects/${plotId}`).then(setData).catch((e) => setError(e.message)), [plotId]);
  useEffect(() => { setData(null); setTab("overview"); setError(""); load(); }, [load]);
  const polling = data && (data.plot.status === "processing" || data.plot.job?.running);
  useEffect(() => {
    if (!polling) return;
    const t = setInterval(() => { load(); onChanged?.(); }, 4000);
    return () => clearInterval(t);
  }, [polling, load, onChanged]);

  if (!data) return <div className="card flex items-center gap-2 p-8 text-muted">{error ? <ErrorNote>{error}</ErrorNote> : <><Spinner /> Loading…</>}</div>;
  const { plot, observations } = data;
  const b = plot.baseline;
  const canAct = user && (user.address === plot.owner || user.verifier) && plot.status === "registered";
  const obsByIdx = Object.fromEntries(observations.map((o) => [o.quarterIndex, o]));
  const nextIdx = b ? b.future_quarters.findIndex((_, i) => !obsByIdx[i] || obsByIdx[i].status === "no_data") : -1;
  const claimable = observations.filter((o) => o.status === "on_chain" && !o.settled);
  const latest = [...observations].reverse().find((o) => o.co2eTHa != null);
  const job = plot.job?.running ? plot.job : null;

  const act = async (kind, fn) => {
    setBusy(kind); setError("");
    try { await fn(); } catch (e) { setError(e.message); } finally { setBusy(""); await load(); onChanged?.(); }
  };
  const runOne = () => act("one", async () => {
    const o = await api(`/mrv/quarterly-run/${plot._id}`, { method: "POST" });
    if (o.status === "no_data") setError(`${o.quarter}: the satellite pictures were too cloudy. Please try again later.`);
  });
  const runAll = () => act("all", () => api(`/mrv/run-all/${plot._id}`, { method: "POST" }));
  const claim = () => act("claim", async () => {
    const r = await api(`/mrv/claim/${plot._id}`, { method: "POST" });
    setModal(r);
  });

  return <div className="space-y-4">
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3 p-5 sm:p-6">
        <div>
          <h2 className="text-2xl">{plot.name}</h2>
          <p className="mt-1 text-sm text-muted">{plot.ownerName || "Farmer"}{plot.village && ` · ${plot.village}`} · {landText(plot.areaHa)} · <span className="capitalize">{plot.ecosystem}</span>
            {plot.landRecordNo && <> · land record {plot.landRecordNo}</>}</p>
        </div>
        <Link to={`/plots/${plot._id}`} className="text-sm text-lagoon underline underline-offset-4">Open full page ↗</Link>
      </div>
      <div className="flex gap-1 overflow-x-auto border-t border-line px-3">
        {TABS.map(([k, label]) => <button key={k} onClick={() => setTab(k)}
          className={`whitespace-nowrap border-b-2 px-3 py-3 text-sm ${tab === k ? "border-lagoon font-medium text-lagoon" : "border-transparent text-muted hover:text-ink"}`}>{label}</button>)}
      </div>
    </div>

    <ErrorNote>{error}</ErrorNote>

    {tab === "overview" && <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
      <div className="card p-5 sm:p-6"><Progress plot={plot} observations={observations} /></div>

      <div className="space-y-4">
        <div className="card p-5 sm:p-6">
          <div className="label mb-3">What happens now</div>
          {plot.status === "processing" && <Note><span className="flex items-center gap-2"><Spinner /> {plot.step || "Working"}… This usually takes 1–3 minutes. You can leave this page.</span></Note>}
          {plot.status === "manual_review" && <Note tone="amber">The satellite pictures show a mix of land types, so a verifier will check your land by hand. We will update this page.</Note>}
          {plot.status === "rejected" && <Note tone="amber">We could not confirm mangroves on this land. {plot.statusNote}</Note>}
          {plot.status === "failed" && <Note tone="amber">Something went wrong: {plot.statusNote}</Note>}

          {job && <div>
            <div className="flex justify-between text-sm"><span>{job.message}…</span><span>{job.done} of {job.total}</span></div>
            <div className="mt-2 h-3 overflow-hidden rounded-full bg-line"><div className="h-3 rounded-full bg-lagoon transition-all" style={{ width: `${(job.done / job.total) * 100}%` }} /></div>
            <p className="mt-2 text-xs text-muted">Each check takes about 30 seconds. You can leave this page.</p>
          </div>}
          {plot.job?.error && !job && <ErrorNote>Checking stopped: {plot.job.error}</ErrorNote>}

          {plot.status === "registered" && !job && <div className="space-y-3">
            {nextIdx >= 0 && canAct && <>
              <button className="btn-primary w-full py-3.5 text-base" disabled={!!busy} onClick={runOne}>
                {busy === "one" ? <><Spinner /> Checking satellite pictures…</> : `Check ${b.future_quarters[nextIdx]} now`}</button>
              {b.future_quarters.length - nextIdx > 1 && <button className="btn-ghost w-full py-3 text-base" disabled={!!busy} onClick={runAll}>
                {busy === "all" ? <Spinner /> : `Check all remaining quarters (${b.future_quarters.filter((_, i) => !obsByIdx[i] || obsByIdx[i].status === "no_data").length})`}</button>}
            </>}
            {claimable.length > 0 && canAct && <button className="btn w-full bg-leaf py-3.5 text-base text-white hover:opacity-90" disabled={!!busy} onClick={claim}>
              {busy === "claim" ? <><Spinner /> Recording on blockchain…</> : `Claim my credits (${claimable.length} quarter${claimable.length > 1 ? "s" : ""})`}</button>}
            {nextIdx < 0 && claimable.length === 0 && <Note>All {b.future_quarters.length} quarters are checked and claimed. 🎉</Note>}
            {!canAct && (nextIdx >= 0 || claimable.length > 0) && <p className="text-sm text-muted">Only the plot owner can run checks.</p>}
          </div>}
        </div>

        {latest && <div className="card p-5 sm:p-6">
          <div className="label mb-2">Latest result</div>
          <p className="leading-relaxed">{explain(latest, b.baseline[latest.quarterIndex], b.uncertainty_t_ha)}</p>
        </div>}
      </div>

      {b && <div className="card p-5 sm:p-6 lg:col-span-2">
        <div className="label mb-1">Your land vs. what we expected</div>
        <p className="mb-3 text-sm text-muted">Green bars are your measured carbon. Credits are earned only when a bar goes above the orange line.</p>
        <SimpleProgressChart baseline={b} observations={observations} />
      </div>}
    </div>}

    {tab === "checks" && b && <div className="card divide-y divide-line">
      {b.future_quarters.map((q, i) => {
        const o = obsByIdx[i];
        const [label, cls] = quarterState(o);
        return <div key={q} className="flex flex-wrap items-start justify-between gap-3 p-4 sm:p-5">
          <div className="min-w-0 flex-1">
            <div className="font-medium">{q}</div>
            {o?.co2eTHa != null ? <p className="mt-1 text-sm text-muted">{explain(o, b.baseline[i], b.uncertainty_t_ha)}</p>
              : <p className="mt-1 text-sm text-muted">Expected without the project: about {fmt(b.baseline[i], 0)} t/ha.</p>}
          </div>
          <span className={`text-sm font-medium ${cls}`}>{label}</span>
        </div>;
      })}
    </div>}
    {tab === "checks" && !b && <Note>Quarterly checks start after the satellite check and the blockchain lock are finished.</Note>}

    {tab === "proof" && <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
      <div className="card space-y-4 p-5 sm:p-6">
        <p className="text-sm">The blockchain is a public record that nobody can secretly change. Here is what it holds for your land:</p>
        {[
          ["Lock code (commitment)", plot.commitment, "A fingerprint of your starting point. Saved before any results, so it cannot be adjusted later."],
          ["Registration receipt", plot.registerTx, "The blockchain transaction that saved the lock code."],
          ["Audit file fingerprint", plot.auditHash, "Matches the full report file. Change one number and it no longer matches."],
        ].map(([t, v, d]) => <div key={t}><div className="flex flex-wrap justify-between gap-2"><span className="font-medium">{t}</span><Hash value={v} /></div><p className="text-xs text-muted">{d}</p></div>)}
        {observations.filter((o) => o.settled).map((o) => <div key={o._id} className="rounded-xl bg-sand p-3 text-sm">
          <b>{o.quarter}</b>: {o.tokenId ? `credit NFT #${o.tokenId} (${milli(o.creditMilli, 2)} t)` : "recorded, no credit"} · receipt <Hash value={o.settleTx} />
          {o.cidSimulated && <span className="ml-1 text-xs text-amber">(report stored locally: IPFS simulation)</span>}
        </div>)}
      </div>
      <div className="card space-y-4 p-5 sm:p-6">
        <PlotMap geometry={plot.geometry} height={240} />
        {plot.revealed ? <Link to={`/verify/${plot._id}`} className="btn-primary w-full py-3">Let anyone verify this plot ↗</Link>
          : <p className="text-sm text-muted">After your first claim, anyone can check your results on the Verify page.</p>}
      </div>
    </div>}

    {tab === "tech" && <TechnicalDetails plot={plot} observations={observations} />}

    {modal && <SuccessModal title={modal.minted ? `You earned ${milli(modal.creditMilli, 2)} t of credits!` : "Checked and recorded"}
      onClose={() => setModal(null)}
      actions={<button className="btn-primary py-3 text-base" onClick={() => { setModal(null); setTab("proof"); }}>See blockchain proof</button>}>
      {modal.minted
        ? <>{modal.minted} credit NFT{modal.minted > 1 ? "s were" : " was"} sent to your wallet for {modal.quarters.filter((q) => q.tokenId).map((q) => q.quarter).join(", ")}.</>
        : <>We recorded {modal.settled} quarter{modal.settled > 1 ? "s" : ""} on the blockchain. Your land did not go above the expected line plus the safety margin, so there are no credits this time. Anyone can now verify these results.</>}
    </SuccessModal>}
  </div>;
}
