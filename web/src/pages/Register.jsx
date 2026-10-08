import { Fragment, useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle, ChevronRight, Leaf, Loader2, MapPin, ShieldCheck, Sprout, TreePine, User, Waves, XCircle } from "lucide-react";
import { api } from "../lib/api.js";
import { useWallet } from "../lib/wallet.jsx";
import { fmt } from "../lib/format.js";
import { DrawMap } from "../components/Maps.jsx";
import SuccessModal from "../components/SuccessModal.jsx";

const STEPS = [{ id: 1, label: "Personal", icon: User }, { id: 2, label: "Land", icon: MapPin }, { id: 3, label: "Ecosystem", icon: Sprout }];
const ECOSYSTEMS = [
  { value: "mangrove", label: "Mangrove", icon: TreePine, text: "Coastal forests in tidal zones", enabled: true },
  { value: "seagrass", label: "Seagrass", icon: Waves, text: "Coming soon", enabled: false },
  { value: "saltmarsh", label: "Saltmarsh", icon: Leaf, text: "Coming soon", enabled: false },
];

const Label = ({ children }) => <label className="mb-2 block text-xs font-medium tracking-wider text-slate-400 uppercase">{children}</label>;

export default function Register() {
  const { user } = useWallet();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({ ownerName: "", village: "", landRecordNo: "", name: "", ecosystem: "mangrove", projectStart: "" });
  const [cfg, setCfg] = useState(null);
  const [existing, setExisting] = useState([]);
  const [geometry, setGeometry] = useState(null);
  const [check, setCheck] = useState(null);
  const [checking, setChecking] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  useEffect(() => {
    api("/system/ml-config").then((c) => { setCfg(c); setForm((f) => ({ ...f, projectStart: f.projectStart || c.demo.project_start })); }).catch(() => {});
    api("/projects/public").then(setExisting).catch(() => {});
  }, []);

  // area / overlap / study-area check whenever the polygon changes
  useEffect(() => {
    if (!geometry) { setCheck(null); return; }
    setChecking(true);
    const t = setTimeout(() => api("/projects/check", { method: "POST", body: { geometry } })
      .then(setCheck).catch((e) => setCheck({ ok: false, problems: [e.message] })).finally(() => setChecking(false)), 400);
    return () => clearTimeout(t);
  }, [geometry]);
  const onDraw = useCallback((g) => setGeometry(g), []);

  if (!user) return <div className="flex flex-1 items-center justify-center p-8">
    <div className="glass-card max-w-md p-12 text-center">
      <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500/20 to-teal-500/20"><ShieldCheck className="h-8 w-8 text-emerald-400" /></div>
      <h2 className="mb-2 text-xl font-bold text-white">MetaMask Required</h2>
      <p className="text-sm text-slate-500">Please connect your wallet to access the registration portal.</p>
    </div>
  </div>;

  const submit = async (e) => {
    e.preventDefault();
    if (!geometry || !check?.ok) { setError("Please draw a valid plot on the map (step 2)."); return; }
    setError(""); setSubmitting(true);
    try {
      await api("/projects", { method: "POST", body: { ...form, name: form.name || `${form.ownerName}'s plot`, geometry } });
      setDone(true);
    } catch (err) { setError(err.message); } finally { setSubmitting(false); }
  };

  return <div className="w-full flex-1 p-4 md:p-8">
    <div className="mx-auto max-w-4xl space-y-8">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-white md:text-3xl">Project Registration</h1>
        <p className="mt-2 text-sm text-slate-500">Register your coastal ecosystem plot into the blockchain registry.</p>
      </div>

      <div className="flex items-center justify-center gap-2 md:gap-4">
        {STEPS.map((s, i) => <Fragment key={s.id}>
          <button type="button" onClick={() => setStep(s.id)}
            className={`flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium transition ${step === s.id ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-400" : step > s.id ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-500" : "border-white/[0.06] bg-white/[0.03] text-slate-500"}`}>
            <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${step > s.id ? "bg-emerald-500 text-white" : step === s.id ? "bg-emerald-500/20 text-emerald-400" : "bg-white/[0.08]"}`}>
              {step > s.id ? <CheckCircle className="h-3.5 w-3.5" /> : s.id}</span>
            <span className="hidden sm:inline">{s.label}</span>
          </button>
          {i < STEPS.length - 1 && <ChevronRight className="h-4 w-4 text-slate-600" />}
        </Fragment>)}
      </div>

      <form onSubmit={submit} className="space-y-6">
        {step === 1 && <div className="glass-card animate-fade-up p-6 md:p-8">
          <h2 className="mb-6 flex items-center gap-3 text-lg font-bold text-white"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/15"><User className="h-4 w-4 text-emerald-400" /></span>Personal Details</h2>
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <div><Label>Full Name</Label><input required className="input-dark" value={form.ownerName} onChange={set("ownerName")} placeholder="Murugan" /></div>
            <div><Label>Village</Label><input className="input-dark" value={form.village} onChange={set("village")} placeholder="Killai" /></div>
            <div className="md:col-span-2"><Label>Land Record (RTC) Number — optional</Label><input className="input-dark" value={form.landRecordNo} onChange={set("landRecordNo")} placeholder="TN-1234-567" /></div>
            <div className="md:col-span-2"><Label>Mock ID (no Aadhaar needed)</Label><input readOnly className="input-dark font-mono opacity-60" value={user.mockId} /></div>
          </div>
          <div className="mt-6 flex justify-end"><button type="button" disabled={!form.ownerName.trim()} onClick={() => setStep(2)} className="btn-primary px-6 py-2.5">Next <ChevronRight className="h-4 w-4" /></button></div>
        </div>}

        {step === 2 && <div className="glass-card animate-fade-up p-6 md:p-8">
          <h2 className="mb-2 flex items-center gap-3 text-lg font-bold text-white"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/15"><MapPin className="h-4 w-4 text-blue-400" /></span>Land Identification</h2>
          <p className="mb-4 text-sm text-slate-500">Use the polygon tool (top-left of the map) to mark your plot. Dashed boxes show where the system works.</p>
          <DrawMap onChange={onDraw} boxes={cfg?.study_area?.boxes} existing={existing} center={cfg ? [cfg.site.centre.lat, cfg.site.centre.lon] : undefined} />
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
            <div><Label>Land Area (Hectares)</Label><input readOnly className="input-dark opacity-70" value={check?.areaHa != null ? fmt(check.areaHa, 2) : ""} placeholder="Auto-computed from map polygon" /></div>
            <div className="md:col-span-2 flex items-end">
              {checking ? <p className="flex items-center gap-2 pb-3 text-sm text-slate-400"><Loader2 className="h-4 w-4 animate-spin" /> Checking plot…</p>
                : check && <div className={`w-full rounded-xl border p-3 text-sm ${check.ok ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400" : "border-rose-500/20 bg-rose-500/10 text-rose-400"}`}>
                  {check.ok ? <span className="flex items-center gap-2"><CheckCircle className="h-4 w-4" /> Plot looks good ({check.region?.box} area, no overlaps)</span>
                    : <span className="flex items-start gap-2"><XCircle className="mt-0.5 h-4 w-4 shrink-0" /> {[check.error, ...(check.problems || [])].filter(Boolean).join(" · ")}</span>}
                </div>}
            </div>
          </div>
          <div className="mt-6 flex justify-between">
            <button type="button" onClick={() => setStep(1)} className="btn-ghost px-6 py-2.5">Back</button>
            <button type="button" disabled={!check?.ok} onClick={() => setStep(3)} className="btn-primary px-6 py-2.5">Next <ChevronRight className="h-4 w-4" /></button>
          </div>
        </div>}

        {step === 3 && <div className="glass-card animate-fade-up p-6 md:p-8">
          <h2 className="mb-6 flex items-center gap-3 text-lg font-bold text-white"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-500/15"><Sprout className="h-4 w-4 text-teal-400" /></span>Ecosystem Type</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {ECOSYSTEMS.map((e) => <button type="button" key={e.value} disabled={!e.enabled} onClick={() => setForm({ ...form, ecosystem: e.value })}
              className={`rounded-xl border p-5 text-left transition ${form.ecosystem === e.value ? "border-emerald-500/40 bg-emerald-500/10" : "border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06]"} disabled:cursor-not-allowed disabled:opacity-40`}>
              <e.icon className={`mb-3 h-6 w-6 ${form.ecosystem === e.value ? "text-emerald-400" : "text-slate-400"}`} />
              <p className="font-semibold text-white">{e.label}</p>
              <p className="mt-1 text-xs text-slate-500">{e.text}</p>
            </button>)}
          </div>
          <div className="mt-6 grid grid-cols-1 gap-5 md:grid-cols-2">
            <div><Label>Plot Name</Label><input className="input-dark" value={form.name} onChange={set("name")} placeholder={`${form.ownerName || "My"}'s plot`} /></div>
            <div><Label>Project Start Date</Label><input type="date" required className="input-dark" value={form.projectStart} onChange={set("projectStart")} /></div>
          </div>
          {error && <div className="mt-5 rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-400">{error}</div>}
          <div className="mt-6 flex justify-between">
            <button type="button" onClick={() => setStep(2)} className="btn-ghost px-6 py-2.5">Back</button>
            <button type="submit" disabled={submitting} className="btn-primary px-8 py-2.5">{submitting ? <><Loader2 className="h-4 w-4 animate-spin" /> Registering…</> : "Register Project"}</button>
          </div>
        </div>}
      </form>
    </div>

    {done && <SuccessModal title="Project Registered!" onClose={() => navigate("/dashboard")}
      message="Your plot is saved. The system is now checking satellite data and locking the baseline on the blockchain. This takes 1–3 minutes; you can follow it on the dashboard." />}
  </div>;
}
