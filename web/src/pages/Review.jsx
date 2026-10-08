// Verifier queue: plots with mixed land cover, and quarters flagged by the anomaly detector.
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api.js";
import { useWallet } from "../lib/wallet.jsx";
import { fmt, pct } from "../lib/format.js";
import { FractionBar } from "../components/Charts.jsx";
import { ErrorNote, Note, Section, Spinner } from "../components/ui.jsx";

function Decide({ onDecide }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState("");
  const go = async (d) => { setBusy(d); try { await onDecide(d, note); } finally { setBusy(""); } };
  return <div className="mt-3 flex flex-wrap items-center gap-2">
    <input className="input flex-1" placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
    <button className="btn-primary" disabled={!!busy} onClick={() => go("approve")}>{busy === "approve" ? <Spinner /> : "Approve"}</button>
    <button className="btn-danger" disabled={!!busy} onClick={() => go("reject")}>{busy === "reject" ? <Spinner /> : "Reject"}</button>
  </div>;
}

export default function Review() {
  const { user } = useWallet();
  const [q, setQ] = useState(null);
  const [error, setError] = useState("");
  const load = useCallback(() => api("/projects/review-queue").then(setQ).catch((e) => setError(e.message)), []);
  useEffect(() => { if (user?.verifier) load(); }, [user, load]);

  if (!user?.verifier) return <Note tone="amber">Only verifier wallets (VERIFIER_ADDRESSES in backend/.env) can open the review queue.</Note>;
  const decide = (path) => async (decision, note) => {
    setError("");
    try { await api(path, { method: "POST", body: { decision, note } }); await load(); } catch (e) { setError(e.message); }
  };

  return <div className="space-y-6">
    <h1 className="text-3xl">Review queue</h1>
    <ErrorNote>{error}</ErrorNote>
    {!q ? <Spinner /> : <>
      <Section title="Plots needing a manual check" subtitle="The classifier was unsure whether the land is mangrove.">
        {q.plots.length === 0 && <p className="text-sm text-muted">Nothing waiting.</p>}
        <div className="space-y-4">{q.plots.map((p) => <div key={p._id} className="rounded-xl border border-line p-4">
          <div className="flex justify-between"><Link to={`/plots/${p._id}`} className="font-medium hover:text-lagoon">{p.name}</Link><span className="text-sm text-muted">{fmt(p.areaHa, 2)} ha</span></div>
          <p className="mt-1 text-sm text-muted">{p.statusNote}</p>
          <div className="mt-3"><FractionBar fractions={p.classification?.class_fractions} /></div>
          <Decide onDecide={decide(`/projects/${p._id}/review`)} />
        </div>)}</div>
      </Section>
      <Section title="Quarters held by the anomaly detector" subtitle="Approve to write the observation on-chain; reject to discard it.">
        {q.observations.length === 0 && <p className="text-sm text-muted">Nothing waiting.</p>}
        <div className="space-y-4">{q.observations.map((o) => <div key={o._id} className="rounded-xl border border-line p-4">
          <div className="flex justify-between"><Link to={`/plots/${o.plot?._id}`} className="font-medium hover:text-lagoon">{o.plot?.name} · {o.quarter}</Link>
            <span className="text-sm">{fmt(o.co2eTHa)} tCO2e/ha</span></div>
          <p className="mt-1 text-sm text-amber">{o.anomaly?.reason} (score {fmt(o.anomaly?.score, 3)})</p>
          <p className="text-xs text-muted">change vs previous quarter {fmt(o.features?.d_co2e)} t/ha · S2 valid {pct(o.features?.s2_valid_frac, 0)}</p>
          <Decide onDecide={decide(`/mrv/observations/${o._id}/review`)} />
        </div>)}</div>
      </Section>
    </>}
  </div>;
}
