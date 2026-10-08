// "Control Room": run MRV checks, see evidence, and claim credits from one place.
import { useCallback, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Area, CartesianGrid, Line, ResponsiveContainer, Tooltip, XAxis, YAxis, ComposedChart, Legend } from "recharts";
import { Activity, Award, BarChart3, CheckCircle2, ChevronRight, Clock3, FileText, Layers, Loader2, Map, Play, Plus, RefreshCcw, ShieldCheck, TreePine, TrendingUp, Zap } from "lucide-react";
import { api } from "../lib/api.js";
import { useWallet } from "../lib/wallet.jsx";
import { fmt, milli, pct } from "../lib/format.js";
import SuccessModal from "../components/SuccessModal.jsx";

const QUARTERS = 8;

function displayStatus(p) {
  if (p.status === "processing") return ["Processing", "bg-sky-500/15 text-sky-400 border-sky-500/20"];
  if (p.status === "manual_review") return ["Manual Review", "bg-amber-500/15 text-amber-400 border-amber-500/20"];
  if (p.status === "rejected" || p.status === "failed") return [p.status === "failed" ? "Failed" : "Rejected", "bg-rose-500/15 text-rose-400 border-rose-500/20"];
  const checked = p.totals?.checked || 0;
  if (checked === 0) return ["Registered", "bg-blue-500/15 text-blue-400 border-blue-500/20"];
  if (checked < QUARTERS) return ["Monitoring", "bg-amber-500/15 text-amber-400 border-amber-500/20"];
  return ["Monitoring Done", "bg-emerald-500/15 text-emerald-400 border-emerald-500/20"];
}

const StatusBadge = ({ plot }) => {
  const [label, cls] = displayStatus(plot);
  return <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap ${cls}`}>{label}</span>;
};

const KpiCard = ({ icon: Icon, label, value, bg, color }) => <div className="glass-card group p-5 transition hover:bg-white/[0.08]">
  <div className="flex min-w-0 items-center gap-4">
    <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${bg} transition group-hover:scale-110`}><Icon className={`h-5 w-5 ${color}`} /></div>
    <div className="min-w-0"><p className="text-xs font-medium tracking-wider text-slate-500 uppercase">{label}</p><p className="mt-0.5 truncate text-lg font-bold text-white md:text-2xl">{value}</p></div>
  </div>
</div>;

const Field = ({ label, value, mono }) => <div className="rounded-lg border border-white/[0.05] bg-white/[0.03] p-3">
  <p className="mb-1 text-[10px] tracking-wider text-slate-500 uppercase">{label}</p>
  <p className={`truncate text-sm font-medium text-white ${mono ? "font-mono text-xs" : ""}`} title={typeof value === "string" ? value : undefined}>{value}</p>
</div>;

const ActionCard = ({ icon: Icon, title, text, color, onClick, disabled }) => <button type="button" onClick={onClick} disabled={disabled}
  className="glass-card-hover group p-5 text-left disabled:cursor-not-allowed disabled:opacity-30">
  <div className="flex items-center gap-3">
    <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${color.bg}`}><Icon className={`h-4 w-4 ${color.text}`} /></div>
    <div><p className="text-sm font-semibold text-white">{title}</p><p className="text-[11px] text-slate-500">{text}</p></div>
  </div>
</button>;

const LOADING = {
  quarterly: "🛰️ Fetching Sentinel-1/2 data from Earth Engine & running ML models…",
  claim: "📝 Pinning the audit report to IPFS, revealing the baseline & minting credits…",
};

export default function Dashboard() {
  const { user } = useWallet();
  const navigate = useNavigate();
  const [plots, setPlots] = useState([]);
  const [params] = useSearchParams();
  const [selectedId, setSelectedId] = useState(params.get("plot") || "");
  const [detail, setDetail] = useState(null);
  const [status, setStatus] = useState(null);
  const [tab, setTab] = useState("overview");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [modal, setModal] = useState(null);

  const loadPlots = useCallback(() => api("/projects").then((ps) => {
    setPlots(ps);
    setSelectedId((id) => (id && ps.some((p) => p._id === id) ? id : ps[0]?._id || ""));
  }), []);
  const loadDetail = useCallback(() => selectedId ? api(`/projects/${selectedId}`).then(setDetail) : setDetail(null), [selectedId]);
  const loadStatus = () => api("/system/status").then(setStatus).catch(() => {});
  const refresh = () => Promise.all([loadPlots(), loadDetail(), loadStatus()]).catch((e) => setError(e.message));

  useEffect(() => { if (user) { loadPlots().catch((e) => setError(e.message)); loadStatus(); } }, [user, loadPlots]);
  useEffect(() => { setDetail(null); loadDetail()?.catch?.((e) => setError(e.message)); }, [loadDetail]);

  const plot = detail?.plot;
  const observations = detail?.observations || [];
  const job = plot?.job?.running ? plot.job : null;
  // keep refreshing while something runs in the background
  useEffect(() => {
    if (!plot || !(plot.status === "processing" || job)) return;
    const t = setInterval(() => { loadDetail(); loadPlots(); }, 4000);
    return () => clearInterval(t);
  }, [plot, job, loadDetail, loadPlots]);

  if (!user) return <div className="flex flex-1 items-center justify-center p-8">
    <div className="glass-card max-w-md p-12 text-center">
      <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500/20 to-teal-500/20"><ShieldCheck className="h-8 w-8 text-emerald-400" /></div>
      <p className="mb-2 text-xl font-semibold text-slate-300">Wallet Required</p>
      <p className="mb-6 text-sm text-slate-500">Connect your MetaMask wallet to access the dashboard.</p>
      <button onClick={() => navigate("/")} className="btn-primary px-6 py-2.5">Go to Home</button>
    </div>
  </div>;

  const b = plot?.baseline;
  const obsByIdx = Object.fromEntries(observations.map((o) => [o.quarterIndex, o]));
  const nextIdx = b ? b.future_quarters.findIndex((_, i) => !obsByIdx[i] || obsByIdx[i].status === "no_data") : -1;
  const claimable = observations.filter((o) => o.status === "on_chain" && !o.settled);
  const ready = plot?.status === "registered" && !job;
  const measured = observations.filter((o) => o.co2eTHa != null);
  const avgCarbon = measured.length ? fmt(measured.reduce((s, o) => s + o.co2eTHa, 0) / measured.length, 1) : "—";
  const totalArea = plots.reduce((s, p) => s + p.areaHa, 0);
  const totalCredits = plots.reduce((s, p) => s + (p.totals?.creditMilli || 0), 0);
  const chart = b ? b.future_quarters.map((q, i) => ({ q: `Q${i + 1}`, label: q, carbon: obsByIdx[i]?.co2eTHa, baseline: b.baseline[i], line: b.baseline[i] + b.uncertainty_t_ha })) : [];

  const act = async (kind, fn) => {
    setBusy(kind); setError("");
    try { await fn(); } catch (e) { setError(e.message); } finally { setBusy(""); await refresh(); }
  };
  const runOne = () => act("quarterly", async () => {
    const o = await api(`/mrv/quarterly-run/${plot._id}`, { method: "POST" });
    if (o.status === "no_data") setError(`${o.quarter}: satellite images were too cloudy. Try again.`);
  });
  const runAll = () => act("runall", () => api(`/mrv/run-all/${plot._id}`, { method: "POST" }));
  const claim = () => act("claim", async () => setModal(await api(`/mrv/claim/${plot._id}`, { method: "POST" })));

  const steps = plot ? [
    { title: "Plot Registered", detail: `${fmt(plot.areaHa, 2)} ha · ${plot.ownerName || ""}${plot.village ? `, ${plot.village}` : ""}`, done: true },
    { title: "Ecosystem Verified (ML)", detail: plot.classification?.class_fractions ? `${pct(plot.classification.class_fractions.mangrove, 1)} mangrove → ${plot.classification.decision.replace("_", " ")}` : plot.step || "Pending", done: !!plot.commitment },
    { title: "Baseline Locked On-chain", detail: plot.commitment || "Pending", done: !!plot.commitment },
    { title: "Quarterly Monitoring", detail: `${observations.filter((o) => o.status === "on_chain" || o.settled).length} / ${QUARTERS} quarters checked`, done: observations.some((o) => o.status === "on_chain") },
    { title: "Credits Claimed", detail: observations.some((o) => o.settled) ? `${milli(observations.reduce((s, o) => s + (o.creditMilli || 0), 0), 2)} tCO₂e credited` : "Not claimed yet", done: observations.some((o) => o.settled) },
  ] : [];

  const tabs = [{ id: "overview", label: "Overview", icon: Layers }, { id: "actions", label: "MRV Actions", icon: Zap }, { id: "evidence", label: "Evidence", icon: FileText }];
  const overlay = (busy && busy !== "runall") || job;

  return <div className="animate-fade-up mx-auto w-full max-w-7xl flex-1 space-y-6 p-4 md:p-8">
    <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
      <div><h1 className="text-2xl font-bold text-white md:text-3xl">Control Room</h1><p className="mt-1 text-sm text-slate-500">Run MRV cycles, verify evidence, and mint credits from one place.</p></div>
      <div className="flex gap-2">
        <button onClick={refresh} className="btn-ghost px-4 py-2.5"><RefreshCcw className="h-4 w-4" /><span className="hidden sm:inline">Refresh</span></button>
        <button onClick={() => navigate("/register")} className="btn-primary px-5 py-2.5"><Plus className="h-4 w-4" />Register Project</button>
      </div>
    </div>

    {error && <div className="animate-scale-in rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-400">{error}</div>}

    {status && <div className="glass-card p-4">
      <h2 className="mb-3 flex items-center gap-2 text-xs font-semibold tracking-wider text-slate-500 uppercase"><Activity className="h-3.5 w-3.5 text-emerald-500" />System Integrations</h2>
      <div className="grid grid-cols-2 gap-2 text-xs md:grid-cols-4">
        {[["Database", status.db.ok], ["ML / Earth Engine", status.ml.ok], [`Blockchain${status.chain.network ? ` (${status.chain.network})` : ""}`, status.chain.ok], ["IPFS", status.ipfs.ok, status.ipfs.simulated && "Simulation"]].map(([name, up, note]) =>
          <div key={name} className={`rounded-lg border px-3 py-2 ${up ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400" : "border-amber-500/20 bg-amber-500/10 text-amber-400"}`}>
            <p className="font-semibold">{name}</p><p className="opacity-70">{up ? "Connected" : note || "Offline"}</p>
          </div>)}
      </div>
    </div>}

    <div className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4">
      <KpiCard icon={TrendingUp} label="Avg Carbon" value={avgCarbon === "—" ? "—" : `${avgCarbon} t/ha`} bg="from-emerald-500/20 to-teal-500/20" color="text-emerald-400" />
      <KpiCard icon={Map} label="Total Area" value={`${fmt(totalArea, 2)} Ha`} bg="from-blue-500/20 to-cyan-500/20" color="text-blue-400" />
      <KpiCard icon={TreePine} label="Projects" value={plots.length} bg="from-amber-500/20 to-orange-500/20" color="text-amber-400" />
      <KpiCard icon={Award} label="Credits" value={`${milli(totalCredits, 2)} t`} bg="from-violet-500/20 to-purple-500/20" color="text-violet-400" />
    </div>

    <div className="grid grid-cols-1 gap-4 md:gap-6 lg:grid-cols-3">
      <div className="glass-card p-6 lg:col-span-2">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-base font-bold text-white"><BarChart3 className="h-4 w-4 text-emerald-400" />Carbon — {plot?.name || "Select a project"}</h2>
          {measured.length > 0 && <span className="rounded-lg bg-white/[0.05] px-2 py-1 font-mono text-[10px] text-slate-500">{measured.length} cycle{measured.length !== 1 ? "s" : ""}</span>}
        </div>
        <div className="h-64 w-full">
          {!b ? <div className="flex h-full flex-col items-center justify-center text-slate-500"><BarChart3 className="mb-3 h-8 w-8 opacity-30" /><p className="text-sm">No monitoring data yet.</p><p className="mt-1 text-xs">Run quarterly MRV cycles to see the carbon chart.</p></div>
            : <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chart} margin={{ top: 5, right: 20, left: -10, bottom: 0 }}>
                <defs><linearGradient id="gCarbon" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#34d399" stopOpacity={0.3} /><stop offset="95%" stopColor="#34d399" stopOpacity={0} /></linearGradient></defs>
                <XAxis dataKey="q" stroke="#475569" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="#475569" fontSize={11} tickLine={false} axisLine={false} />
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1e293b" />
                <Tooltip contentStyle={{ backgroundColor: "#0f172a", borderRadius: 12, border: "1px solid rgba(255,255,255,0.1)", color: "#e2e8f0" }} labelStyle={{ color: "#34d399", fontWeight: 700 }}
                  labelFormatter={(_, p) => p?.[0]?.payload?.label} formatter={(v, n) => [`${fmt(v, 1)} t/ha`, n]} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Area isAnimationActive={false} type="monotone" dataKey="carbon" name="Measured carbon" stroke="#34d399" strokeWidth={2.5} fill="url(#gCarbon)" dot={{ r: 4, fill: "#34d399", stroke: "#0f172a", strokeWidth: 2 }} connectNulls />
                <Line isAnimationActive={false} dataKey="baseline" name="Locked baseline" stroke="#38bdf8" strokeWidth={2} dot={false} />
                <Line isAnimationActive={false} dataKey="line" name="Credit line (+ uncertainty)" stroke="#fbbf24" strokeWidth={2} strokeDasharray="6 4" dot={false} />
              </ComposedChart>
            </ResponsiveContainer>}
        </div>
      </div>

      <div className="glass-card flex max-h-[420px] flex-col p-4">
        <h2 className="mb-4 px-1 text-sm font-bold text-white">Registered Projects</h2>
        <div className="flex-1 space-y-2 overflow-y-auto pr-1">
          {plots.length === 0 && <p className="px-1 text-xs text-slate-500">No plots registered yet.</p>}
          {plots.map((p) => <button key={p._id} type="button" onClick={() => { setSelectedId(p._id); setTab("overview"); }}
            className={`group w-full rounded-xl border p-3.5 text-left transition ${selectedId === p._id ? "border-emerald-500/30 bg-emerald-500/10" : "border-transparent hover:border-white/[0.08] hover:bg-white/[0.05]"}`}>
            <div className="mb-1.5 flex items-start justify-between gap-2"><span className="max-w-[150px] truncate text-sm font-semibold text-white">{p.name}</span><StatusBadge plot={p} /></div>
            <div className="flex justify-between text-xs text-slate-500"><span>{fmt(p.areaHa, 2)} Ha</span><span className="font-medium text-slate-400">{milli(p.totals?.creditMilli || 0, 1)} CC</span></div>
            <div className="mt-2 flex items-center justify-between"><span className="font-mono text-[10px] text-slate-600">{p._id.slice(-8)}</span><ChevronRight className={`h-3.5 w-3.5 ${selectedId === p._id ? "text-emerald-400" : "text-slate-600"}`} /></div>
            <div className="mt-2.5 flex gap-1">{Array.from({ length: QUARTERS }, (_, i) => <div key={i} className={`h-1 flex-1 rounded-full ${i < (p.totals?.checked || 0) ? "bg-emerald-500" : "bg-white/[0.08]"}`} />)}</div>
          </button>)}
        </div>
        <button onClick={() => navigate("/register")} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-white/[0.1] py-3 text-sm font-medium text-slate-500 hover:border-emerald-500/30 hover:text-emerald-400"><Plus className="h-4 w-4" />Add New Plot</button>
      </div>
    </div>

    <div className="glass-card p-6">
      <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <h2 className="text-base font-bold text-white">{plot ? plot.name : "Project Details"}</h2>
        {plot && <div className="flex gap-1 rounded-lg border border-white/[0.06] bg-white/[0.03] p-1">
          {tabs.map((t) => <button key={t.id} onClick={() => setTab(t.id)} className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition ${tab === t.id ? "bg-white/[0.1] text-white" : "text-slate-500 hover:text-slate-300"}`}><t.icon className="h-3.5 w-3.5" />{t.label}</button>)}
        </div>}
      </div>

      {!plot ? <div className="py-12 text-center text-slate-500"><Layers className="mx-auto mb-3 h-10 w-10 opacity-30" /><p className="text-sm">{selectedId ? "Loading…" : "Register a project to see details here."}</p></div> : <>
        {tab === "overview" && <div className="animate-fade-up grid grid-cols-1 gap-8 lg:grid-cols-2">
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Plot ID" value={plot._id} mono />
              <Field label="Ecosystem" value={<span className="capitalize">{plot.ecosystem}</span>} />
              <Field label="Area" value={`${fmt(plot.areaHa, 2)} hectares`} />
              <Field label="Avg Carbon" value={avgCarbon === "—" ? "—" : `${avgCarbon} tCO₂e/ha`} />
              <Field label="Carbon Credits" value={`${milli(observations.reduce((s, o) => s + (o.creditMilli || 0), 0), 2)} t`} />
              <Field label="Credit Tokens" value={observations.filter((o) => o.tokenId).map((o) => `#${o.tokenId}`).join(", ") || "Not minted"} />
            </div>
            <Field label="Wallet" value={plot.owner} mono />
            {plot.classification?.class_fractions && <Field label="ML Identification at Registration" value={`Mangrove (${pct(plot.classification.class_fractions.mangrove, 1)})`} />}
            {plot.landRecordNo && <Field label="Land Record (RTC)" value={plot.landRecordNo} />}
            {["rejected", "failed", "manual_review"].includes(plot.status) && <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 text-sm text-amber-400">{plot.statusNote}</div>}
          </div>
          <div className="space-y-3">
            <p className="mb-2 text-xs font-semibold tracking-wider text-slate-500 uppercase">MRV Pipeline</p>
            {steps.map((s, i) => <div key={s.title} className={`flex items-start gap-3 rounded-xl border p-3.5 ${s.done ? "border-emerald-500/20 bg-emerald-500/5" : "border-white/[0.06] bg-white/[0.02]"}`}>
              <div className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${s.done ? "bg-emerald-500/20" : "bg-white/[0.05]"}`}>
                {s.done ? <CheckCircle2 className="h-4 w-4 text-emerald-400" /> : plot.status === "processing" && i === 1 ? <Loader2 className="h-4 w-4 animate-spin text-sky-400" /> : <span className="text-xs font-bold text-slate-500">{i + 1}</span>}
              </div>
              <div className="min-w-0"><p className="text-sm font-semibold text-white">{s.title}</p><p className="mt-0.5 text-[11px] break-all text-slate-500">{s.detail}</p></div>
            </div>)}
          </div>
        </div>}

        {tab === "actions" && <div className="animate-fade-up space-y-4">
          <div className="flex items-center justify-between rounded-xl border border-white/[0.05] bg-white/[0.03] p-3">
            <div><p className="text-sm font-semibold text-white">Target Network</p><p className="text-[11px] text-slate-500">Set in backend/.env (local Hardhat or Polygon Amoy)</p></div>
            <span className="rounded-lg bg-white/[0.06] px-2.5 py-1 text-[11px] font-bold text-slate-300">{status?.chain?.network || "—"}</span>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <ActionCard icon={Play} title="Run Quarterly MRV" text={nextIdx >= 0 && b ? `Check ${b.future_quarters[nextIdx]}` : "Execute single monitoring cycle"} color={{ bg: "bg-emerald-500/15", text: "text-emerald-400" }} onClick={runOne} disabled={!ready || nextIdx < 0 || !!busy} />
            <ActionCard icon={Zap} title="Run All Cycles" text="Execute remaining quarterly cycles" color={{ bg: "bg-blue-500/15", text: "text-blue-400" }} onClick={runAll} disabled={!ready || nextIdx < 0 || !!busy} />
            <ActionCard icon={Award} title="Reveal + Mint" text={claimable.length ? `Claim ${claimable.length} checked quarter${claimable.length > 1 ? "s" : ""}` : "Reveal baseline & mint credit NFT"} color={{ bg: "bg-violet-500/15", text: "text-violet-400" }} onClick={claim} disabled={!ready || !claimable.length || !!busy} />
            <ActionCard icon={ShieldCheck} title="Verify On-chain" text="Re-check the locked baseline yourself" color={{ bg: "bg-indigo-500/15", text: "text-indigo-400" }} onClick={() => navigate(`/verify/${plot._id}`)} disabled={!plot.revealed} />
          </div>
          <div className="mt-4 flex items-center gap-2 text-[11px] text-slate-600"><Clock3 className="h-3.5 w-3.5" />Cycles completed: {observations.filter((o) => o.status === "on_chain" || o.settled).length} / {QUARTERS}</div>
        </div>}

        {tab === "evidence" && <div className="animate-fade-up max-h-[480px] space-y-3 overflow-y-auto pr-1">
          {observations.length === 0 ? <div className="py-12 text-center text-slate-500"><FileText className="mx-auto mb-3 h-8 w-8 opacity-30" /><p className="text-sm">No cycles recorded yet. Run a quarterly MRV to generate evidence.</p></div>
            : observations.map((o) => {
              const above = o.co2eTHa != null && o.co2eTHa > o.baselineTHa + o.uncertaintyTHa;
              return <div key={o._id} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 transition hover:bg-white/[0.04]">
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2"><span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/15 text-xs font-bold text-emerald-400">{o.quarterIndex + 1}</span><span className="text-sm font-semibold text-white">Cycle {o.quarterIndex + 1} · {o.quarter}</span></div>
                  <div className="flex items-center gap-2">
                    {o.anomaly?.flag && <span className="rounded-full border border-rose-500/20 bg-rose-500/15 px-2 py-0.5 text-[10px] font-semibold text-rose-400">Anomaly</span>}
                    {o.settled && <span className="rounded-full border border-violet-500/20 bg-violet-500/15 px-2 py-0.5 text-[10px] font-semibold text-violet-400">{o.tokenId ? `NFT #${o.tokenId}` : "Settled"}</span>}
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${above ? "border-emerald-500/20 bg-emerald-500/15 text-emerald-400" : "border-amber-500/20 bg-amber-500/15 text-amber-400"}`}>{above ? "Above baseline" : "No extra carbon"}</span>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                  {[["Est. CO₂", o.co2eTHa != null ? `${fmt(o.co2eTHa, 1)} t/ha` : "No data"], ["Baseline", `${fmt(o.baselineTHa, 1)} t/ha`], ["Uncertainty", `${fmt(o.uncertaintyTHa, 1)} t/ha`], ["Biomass", o.agbMgHa != null ? `${fmt(o.agbMgHa, 1)} Mg/ha` : "—"]].map(([l, v]) =>
                    <div key={l} className="rounded-lg border border-white/[0.04] bg-white/[0.03] p-2"><p className="text-[9px] tracking-wider text-slate-500 uppercase">{l}</p><p className="mt-0.5 text-xs font-medium text-white">{v}</p></div>)}
                </div>
                <div className="mt-2 flex flex-wrap gap-4 text-[10px] text-slate-600">
                  <span>Source: Sentinel-1 + Sentinel-2 (GEE)</span>
                  <span>S2 images: {o.features?.s2_n_images ?? 0} · S1 images: {o.features?.s1_n_images ?? 0}</span>
                  {o.submitTx && <span className="font-mono">tx {o.submitTx.slice(0, 10)}…</span>}
                </div>
              </div>;
            })}
        </div>}
      </>}
    </div>

    {overlay && <div className="fixed inset-0 z-[1500] flex items-center justify-center bg-slate-950/80 backdrop-blur-sm">
      <div className="glass-card animate-scale-in max-w-md p-8 text-center">
        <Loader2 className="mx-auto mb-4 h-10 w-10 animate-spin text-emerald-400" />
        <p className="mb-2 text-lg font-semibold text-white">Processing MRV Pipeline</p>
        <p className="text-sm text-slate-400">{job ? `🛰️ ${job.message} (${job.done} of ${job.total})…` : LOADING[busy] || "Processing…"}</p>
        {job && <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/[0.08]"><div className="h-2 rounded-full bg-emerald-500 transition-all" style={{ width: `${(job.done / job.total) * 100}%` }} /></div>}
      </div>
    </div>}

    {modal && <SuccessModal onClose={() => setModal(null)}
      title={modal.minted ? "NFT Minted Successfully!" : "Results Recorded On-chain"}
      message={modal.minted ? `${milli(modal.creditMilli, 2)} tCO₂e of credits were minted to your wallet as ${modal.minted} NFT${modal.minted > 1 ? "s" : ""}.`
        : `${modal.settled} quarter${modal.settled > 1 ? "s were" : " was"} revealed and recorded. Carbon did not go above the baseline + uncertainty, so no credits were minted this time.`} />}
  </div>;
}
