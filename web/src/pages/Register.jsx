// Three simple steps, like the first version: 1 About you -> 2 Your land -> 3 Your ecosystem.
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api.js";
import { useWallet } from "../lib/wallet.jsx";
import { landText, quarterOf } from "../lib/format.js";
import { DrawMap } from "../components/Maps.jsx";
import SuccessModal from "../components/SuccessModal.jsx";
import { ErrorNote, Note, Spinner } from "../components/ui.jsx";

const STEPS = ["About you", "Your land", "Your ecosystem"];

const ECOSYSTEMS = [
  ["mangrove", "Mangrove", "Trees growing in salty, tidal coastal water", "🌳", true],
  ["seagrass", "Seagrass", "Underwater meadows (coming later)", "🌊", false],
  ["saltmarsh", "Salt marsh", "Grassy land flooded by tides (coming later)", "🌾", false],
];

function Stepper({ step, setStep, canGo }) {
  return <ol className="flex items-center justify-center gap-2 sm:gap-4">
    {STEPS.map((label, i) => <li key={label} className="flex items-center gap-2 sm:gap-4">
      <button type="button" disabled={!canGo(i)} onClick={() => setStep(i)}
        className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition sm:px-4 ${
          i === step ? "border-lagoon/40 bg-lagoon-light text-lagoon" : i < step ? "border-leaf/30 bg-leaf-light text-leaf" : "border-line bg-paper text-muted"}`}>
        <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs ${i < step ? "bg-leaf text-white" : i === step ? "bg-lagoon text-white" : "bg-line"}`}>{i < step ? "✓" : i + 1}</span>
        <span className="hidden sm:inline">{label}</span>
      </button>
      {i < STEPS.length - 1 && <span className="text-muted">›</span>}
    </li>)}
  </ol>;
}

function Check({ ok, children }) {
  return <li className={`flex items-start gap-2 text-sm ${ok ? "text-leaf" : "text-coral"}`}>
    <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs text-white ${ok ? "bg-leaf" : "bg-coral"}`}>{ok ? "✓" : "✗"}</span>
    <span className="text-ink">{children}</span>
  </li>;
}

export default function Register() {
  const nav = useNavigate();
  const { user } = useWallet();
  const [step, setStep] = useState(0);
  const [cfg, setCfg] = useState(null);
  const [existing, setExisting] = useState([]);
  const [geometry, setGeometry] = useState(null);
  const [check, setCheck] = useState(null);
  const [checking, setChecking] = useState(false);
  const [form, setForm] = useState({ ownerName: user?.name || "", village: "", landRecordNo: "", name: "", ecosystem: "mangrove", projectStart: "" });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(null);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  useEffect(() => {
    api("/system/ml-config").then((c) => { setCfg(c); setForm((f) => ({ ...f, projectStart: f.projectStart || c.demo.project_start })); }).catch((e) => setError(e.message));
    api("/projects/public").then(setExisting).catch(() => {});
  }, []);

  // Check the drawing as soon as it changes (area, overlap, inside the area we can check)
  useEffect(() => {
    if (!geometry) { setCheck(null); return; }
    setChecking(true);
    const t = setTimeout(() => api("/projects/check", { method: "POST", body: { geometry } })
      .then(setCheck).catch((e) => setCheck({ ok: false, problems: [e.message] })).finally(() => setChecking(false)), 400);
    return () => clearTimeout(t);
  }, [geometry]);

  const onDraw = useCallback((g) => setGeometry(g), []);
  const step1ok = form.ownerName.trim().length > 1;
  const step2ok = !!geometry && check?.ok && !checking;
  const canGo = (i) => i === 0 || (i === 1 && step1ok) || (i === 2 && step1ok && step2ok);
  const replay = form.projectStart && form.projectStart < new Date().toISOString().slice(0, 10);

  const submit = async () => {
    setError(""); setSubmitting(true);
    try {
      const plot = await api("/projects", { method: "POST", body: { ...form, name: form.name || `${form.ownerName}'s plot`, geometry } });
      setDone(plot);
    } catch (e) { setError(e.message); } finally { setSubmitting(false); }
  };

  return <div className="mx-auto max-w-4xl space-y-8">
    <div className="text-center">
      <h1 className="text-3xl">Register your land</h1>
      <p className="mt-2 text-muted">Three short steps. It takes about 2 minutes.</p>
    </div>
    <Stepper step={step} setStep={setStep} canGo={canGo} />

    {step === 0 && <section className="card space-y-5 p-6 sm:p-8">
      <h2 className="text-xl">About you</h2>
      <div className="grid gap-5 sm:grid-cols-2">
        <label className="block"><span className="text-sm font-medium">Your name *</span>
          <input className="input mt-1.5 py-3 text-base" value={form.ownerName} onChange={set("ownerName")} placeholder="e.g. Murugan" maxLength={60} /></label>
        <label className="block"><span className="text-sm font-medium">Village</span>
          <input className="input mt-1.5 py-3 text-base" value={form.village} onChange={set("village")} placeholder="e.g. Killai" maxLength={60} /></label>
        <label className="block sm:col-span-2"><span className="text-sm font-medium">Land record (RTC / patta) number <span className="text-muted">(optional)</span></span>
          <input className="input mt-1.5 py-3 text-base" value={form.landRecordNo} onChange={set("landRecordNo")} placeholder="e.g. TN-1234-567" maxLength={40} /></label>
      </div>
      <Note>We do <b>not</b> ask for Aadhaar, phone number or bank details. Your wallet is your identity (ID {user?.mockId}). This is a demo, so use made-up details if you prefer.</Note>
      <div className="flex justify-end"><button className="btn-primary px-6 py-3 text-base" disabled={!step1ok} onClick={() => setStep(1)}>Next ›</button></div>
    </section>}

    {step === 1 && <section className="card space-y-5 p-6 sm:p-8">
      <div>
        <h2 className="text-xl">Your land</h2>
        <p className="mt-1 text-sm text-muted">Tap the <b>shape tool</b> (top-left of the map), then tap each corner of your land. Tap the first corner again to finish. Dashed boxes show the coast we can check right now.</p>
      </div>
      <DrawMap onChange={onDraw} boxes={cfg?.study_area?.boxes} existing={existing}
        center={cfg ? [cfg.site.centre.lat, cfg.site.centre.lon] : undefined} />
      <div className="rounded-xl bg-sand p-4">
        {!geometry && <p className="text-sm text-muted">Draw your land on the map to continue.</p>}
        {geometry && checking && <p className="flex items-center gap-2 text-sm text-muted"><Spinner /> Checking your land…</p>}
        {geometry && check && !checking && <ul className="space-y-2">
          {check.areaHa != null && <Check ok={!check.problems?.some((p) => p.startsWith("Area"))}>Size: <b>{landText(check.areaHa)}</b>{check.problems?.find((p) => p.startsWith("Area")) && <> (must be 0.5–500 ha)</>}</Check>}
          {check.region && <Check ok={check.region.inside}>{check.region.inside ? "Inside the coast area we can check" : "Outside the area we can check right now (Tamil Nadu & Andhra Pradesh coast, dashed boxes)"}</Check>}
          {check.overlaps && <Check ok={!check.overlaps.length}>{check.overlaps.length ? `Overlaps land already registered: ${check.overlaps.join(", ")}` : "Does not overlap anyone else's land"}</Check>}
          {check.error && <Check ok={false}>{check.error}</Check>}
        </ul>}
      </div>
      <div className="flex justify-between">
        <button className="btn-ghost px-6 py-3 text-base" onClick={() => setStep(0)}>‹ Back</button>
        <button className="btn-primary px-6 py-3 text-base" disabled={!step2ok} onClick={() => setStep(2)}>Next ›</button>
      </div>
    </section>}

    {step === 2 && <section className="card space-y-6 p-6 sm:p-8">
      <h2 className="text-xl">What grows on your land?</h2>
      <div className="grid gap-3 sm:grid-cols-3">
        {ECOSYSTEMS.map(([v, label, desc, icon, enabled]) => <button key={v} type="button" disabled={!enabled} onClick={() => setForm({ ...form, ecosystem: v })}
          className={`rounded-2xl border p-5 text-left transition ${form.ecosystem === v ? "border-leaf bg-leaf-light ring-2 ring-leaf/30" : "border-line bg-paper"} ${enabled ? "hover:border-leaf/50" : "cursor-not-allowed opacity-50"}`}>
          <div className="text-3xl">{icon}</div>
          <div className="mt-2 font-medium">{label}</div>
          <div className="mt-0.5 text-xs text-muted">{desc}</div>
        </button>)}
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <label className="block"><span className="text-sm font-medium">Name for this plot</span>
          <input className="input mt-1.5 py-3 text-base" value={form.name} onChange={set("name")} placeholder={`${form.ownerName || "My"}'s plot`} maxLength={80} /></label>
        <label className="block"><span className="text-sm font-medium">When did you start protecting / planting?</span>
          <input type="date" className="input mt-1.5 py-3 text-base" value={form.projectStart} onChange={set("projectStart")} />
          {form.projectStart && <span className="mt-1 block text-xs text-muted">We check your land every 3 months for 2 years, from {quarterOf(form.projectStart)}.</span>}</label>
      </div>
      {replay && <Note tone="amber"><b>Demo mode (past date).</b> Satellite pictures for these months already exist, so you can see the full process now. In real use you would register at the start.</Note>}

      <div className="rounded-xl bg-sand p-4 text-sm">
        <div className="label mb-2">Please check</div>
        <div className="grid gap-1 sm:grid-cols-2">
          <div>Farmer: <b>{form.ownerName}</b>{form.village && `, ${form.village}`}</div>
          <div>Land: <b>{landText(check?.areaHa)}</b></div>
          <div>Ecosystem: <b className="capitalize">{form.ecosystem}</b></div>
          {form.landRecordNo && <div>Land record: <b>{form.landRecordNo}</b></div>}
        </div>
      </div>
      <ErrorNote>{error}</ErrorNote>
      <div className="flex justify-between">
        <button className="btn-ghost px-6 py-3 text-base" onClick={() => setStep(1)}>‹ Back</button>
        <button className="btn-primary px-6 py-3 text-base" disabled={submitting || !form.projectStart} onClick={submit}>{submitting ? <><Spinner /> Registering…</> : "Register my land ✓"}</button>
      </div>
    </section>}

    {done && <SuccessModal title="Land registered!" onClose={() => nav("/my-plots")}
      actions={<button className="btn-primary py-3 text-base" onClick={() => nav(`/my-plots?plot=${done._id}`)}>Go to my plots</button>}>
      We are now looking at satellite pictures of <b>{done.name}</b> to confirm it is mangrove, and then locking your starting point on the blockchain. This usually takes <b>1–3 minutes</b>. You can follow it on "My plots".
    </SuccessModal>}
  </div>;
}
