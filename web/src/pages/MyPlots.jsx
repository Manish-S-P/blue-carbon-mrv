// "Control room": totals on top, plots on the left, the selected plot on the right.
import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../lib/api.js";
import { acres, fmt, milli } from "../lib/format.js";
import PlotPanel from "../components/PlotPanel.jsx";
import { ErrorNote, Spinner, StatusBadge } from "../components/ui.jsx";

function Tile({ label, value, unit, sub }) {
  return <div className="card p-4 sm:p-5">
    <div className="text-sm text-muted">{label}</div>
    <div className="mt-1 font-display text-3xl">{value}<span className="ml-1 font-sans text-sm text-muted">{unit}</span></div>
    {sub && <div className="text-xs text-muted">{sub}</div>}
  </div>;
}

export default function MyPlots() {
  const [plots, setPlots] = useState(null);
  const [error, setError] = useState("");
  const [params, setParams] = useSearchParams();
  const load = useCallback(() => api("/projects").then(setPlots).catch((e) => setError(e.message)), []);
  useEffect(() => { load(); }, [load]);
  const selected = params.get("plot") || plots?.[0]?._id;

  if (!plots) return error ? <ErrorNote>{error}</ErrorNote> : <div className="flex items-center gap-2 text-muted"><Spinner /> Loading your plots…</div>;
  const totalHa = plots.reduce((s, p) => s + p.areaHa, 0);
  const credits = plots.reduce((s, p) => s + p.totals.creditMilli, 0);
  const checks = plots.reduce((s, p) => s + p.totals.checked, 0);

  return <div className="space-y-6">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-3xl">My plots</h1>
        <p className="mt-1 text-muted">Check your land every 3 months and claim credits from here.</p>
      </div>
      <Link to="/register" className="btn-primary px-5 py-3 text-base">+ Register land</Link>
    </div>

    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Tile label="My plots" value={plots.length} />
      <Tile label="Total land" value={acres(totalHa)} unit="acres" sub={`${fmt(totalHa, 2)} hectares`} />
      <Tile label="Checks done" value={checks} />
      <Tile label="Credits earned" value={milli(credits, 2)} unit="t CO₂" sub="after 20% safety buffer" />
    </div>

    {plots.length === 0 ? <div className="card p-10 text-center">
      <div className="text-5xl">🌱</div>
      <p className="mt-3 font-display text-2xl">No land registered yet</p>
      <p className="mt-1 text-muted">Register your mangrove land to start earning carbon credits.</p>
      <Link to="/register" className="btn-primary mt-6 px-6 py-3 text-base">Register my land</Link>
    </div> : <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
      <div className="space-y-2">
        {plots.map((p) => <button key={p._id} onClick={() => setParams({ plot: p._id })}
          className={`card w-full p-4 text-left transition ${p._id === selected ? "border-lagoon ring-2 ring-lagoon-light" : "hover:border-lagoon/40"}`}>
          <div className="flex items-start justify-between gap-2">
            <span className="font-medium">{p.name}</span>
            <StatusBadge status={p.status} />
          </div>
          <div className="mt-1 text-sm text-muted">{acres(p.areaHa)} acres · {p.totals.checked} checks · {milli(p.totals.creditMilli, 1)} t</div>
          {(p.status === "processing" || p.job?.running) && <div className="mt-1 text-xs text-lagoon">{p.job?.running ? p.job.message : p.step}…</div>}
        </button>)}
      </div>
      {selected && <PlotPanel key={selected} plotId={selected} onChanged={load} />}
    </div>}
  </div>;
}
