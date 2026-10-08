import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api.js";
import { fmt, quarterOf } from "../lib/format.js";
import { DrawMap } from "../components/Maps.jsx";
import { ErrorNote, Note, Spinner } from "../components/ui.jsx";

const ECOSYSTEMS = [
  ["mangrove", "Mangrove", true],
  ["seagrass", "Seagrass (future work: no free labels)", false],
  ["saltmarsh", "Salt marsh (future work)", false],
];

export default function NewPlot() {
  const nav = useNavigate();
  const [cfg, setCfg] = useState(null);
  const [existing, setExisting] = useState([]);
  const [geometry, setGeometry] = useState(null);
  const [check, setCheck] = useState(null);
  const [checking, setChecking] = useState(false);
  const [form, setForm] = useState({ name: "", ecosystem: "mangrove", projectStart: "" });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api("/system/ml-config").then((c) => { setCfg(c); setForm((f) => ({ ...f, projectStart: f.projectStart || c.demo.project_start })); }).catch((e) => setError(e.message));
    api("/projects/public").then(setExisting).catch(() => {});
  }, []);

  // Live checks (area, overlap, study area) whenever the drawing changes
  useEffect(() => {
    if (!geometry) { setCheck(null); return; }
    setChecking(true);
    const t = setTimeout(() => api("/projects/check", { method: "POST", body: { geometry } })
      .then(setCheck).catch((e) => setCheck({ ok: false, problems: [e.message] })).finally(() => setChecking(false)), 400);
    return () => clearTimeout(t);
  }, [geometry]);

  const onDraw = useCallback((g) => setGeometry(g), []);

  const submit = async (e) => {
    e.preventDefault();
    setError(""); setSubmitting(true);
    try {
      const plot = await api("/projects", { method: "POST", body: { ...form, geometry } });
      nav(`/plots/${plot._id}`);
    } catch (err) { setError(err.message); setSubmitting(false); }
  };

  const replay = cfg && form.projectStart && form.projectStart < new Date().toISOString().slice(0, 10);

  return <div className="space-y-6">
    <div>
      <h1 className="text-3xl">Register a plot</h1>
      <p className="mt-1 text-sm text-muted">Draw the plot boundary with the polygon or rectangle tool (top-left of the map). Dashed boxes show where the models were trained; plots outside them are rejected.</p>
    </div>
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      <DrawMap onChange={onDraw} boxes={cfg?.study_area?.boxes} existing={existing}
        center={cfg ? [cfg.site.centre.lat, cfg.site.centre.lon] : undefined} />

      <form onSubmit={submit} className="card space-y-5 p-5">
        <div>
          <div className="label">Plot checks</div>
          {!geometry && <p className="mt-2 text-sm text-muted">Draw a polygon to begin.</p>}
          {geometry && checking && <p className="mt-2 flex items-center gap-2 text-sm text-muted"><Spinner /> Checking…</p>}
          {geometry && check && !checking && <ul className="mt-2 space-y-1.5 text-sm">
            <li className="flex justify-between"><span>Area</span><span className="font-medium">{fmt(check.areaHa, 2)} ha</span></li>
            <li className="flex justify-between"><span>Study area</span><span className={check.region?.inside ? "text-leaf" : "text-coral"}>{check.region?.inside ? `inside (${check.region.box})` : "outside"}</span></li>
            <li className="flex justify-between"><span>Overlap</span><span className={check.overlaps?.length ? "text-coral" : "text-leaf"}>{check.overlaps?.length ? check.overlaps.join(", ") : "none"}</span></li>
            {check.error && <li className="text-coral">{check.error}</li>}
            {check.problems?.map((p) => <li key={p} className="text-coral">• {p}</li>)}
          </ul>}
        </div>

        <label className="block">
          <span className="label">Plot name</span>
          <input className="input mt-1" required maxLength={80} value={form.name} placeholder="e.g. Killai creek restoration" onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </label>

        <fieldset>
          <legend className="label">Ecosystem</legend>
          <div className="mt-2 space-y-2">
            {ECOSYSTEMS.map(([v, label, enabled]) => <label key={v} className={`flex items-center gap-2 text-sm ${enabled ? "" : "text-muted"}`}>
              <input type="radio" name="eco" value={v} disabled={!enabled} checked={form.ecosystem === v} onChange={() => setForm({ ...form, ecosystem: v })} className="accent-[var(--color-lagoon)]" />
              {label}
            </label>)}
          </div>
        </fieldset>

        <label className="block">
          <span className="label">Project start date</span>
          <input type="date" className="input mt-1" required value={form.projectStart} onChange={(e) => setForm({ ...form, projectStart: e.target.value })} />
          {form.projectStart && <span className="mt-1 block text-xs text-muted">Crediting starts {quarterOf(form.projectStart)} for {cfg?.baseline?.crediting_quarters ?? 8} quarters (assumed period).</span>}
        </label>

        {replay && <Note tone="amber"><b>Historical replay.</b> This start date is in the past, so satellite data for the crediting quarters already exists. In a real deployment the baseline would be committed before those quarters happen. Used here so the full flow can be demonstrated.</Note>}

        <ErrorNote>{error}</ErrorNote>
        <button className="btn-primary w-full" disabled={!geometry || !check?.ok || submitting || !form.name}>
          {submitting ? <><Spinner /> Submitting…</> : "Register plot"}
        </button>
        <p className="text-xs text-muted">After submitting, the satellite check and baseline take 1–3 minutes (Google Earth Engine).</p>
      </form>
    </div>
  </div>;
}
