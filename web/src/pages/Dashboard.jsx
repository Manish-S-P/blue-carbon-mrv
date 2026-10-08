import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api.js";
import { date, fmt } from "../lib/format.js";
import { ErrorNote, StatusBadge } from "../components/ui.jsx";

function Outline({ geometry }) {
  // tiny SVG preview of the polygon
  const ring = geometry.coordinates[0];
  const xs = ring.map((p) => p[0]), ys = ring.map((p) => p[1]);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const s = Math.max(maxX - minX, maxY - minY) || 1;
  const pts = ring.map(([x, y]) => `${((x - minX) / s) * 80 + 10},${90 - ((y - minY) / s) * 80}`).join(" ");
  return <svg viewBox="0 0 100 100" className="h-16 w-16 shrink-0 rounded-xl bg-lagoon-light"><polygon points={pts} fill="#2f7a4533" stroke="#2f7a45" strokeWidth="2.5" /></svg>;
}

export default function Dashboard() {
  const [plots, setPlots] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const load = () => api("/projects").then(setPlots).catch((e) => setError(e.message));
    load();
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
  }, []);

  return <div className="space-y-6">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-3xl">My plots</h1>
        <p className="mt-1 text-sm text-muted">Each plot gets its own committed baseline and quarterly monitoring.</p>
      </div>
      <Link to="/register" className="btn-primary">+ Register plot</Link>
    </div>
    <ErrorNote>{error}</ErrorNote>
    {plots && plots.length === 0 && <div className="card p-10 text-center">
      <p className="font-display text-xl">No plots yet</p>
      <p className="mt-1 text-sm text-muted">Draw your first mangrove plot on the map to get started.</p>
      <Link to="/register" className="btn-primary mt-5">Register a plot</Link>
    </div>}
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {plots?.map((p) => <Link key={p._id} to={`/plots/${p._id}`} className="card flex gap-4 p-5 transition hover:border-lagoon/40 hover:shadow-sm">
        <Outline geometry={p.geometry} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="truncate font-medium">{p.name}</div>
            <StatusBadge status={p.status} />
          </div>
          <div className="mt-1 text-sm text-muted">{fmt(p.areaHa, 2)} ha · {p.ecosystem} · start {date(p.projectStart)}</div>
          {p.status === "processing" && <div className="mt-2 text-xs text-lagoon">{p.step}…</div>}
          {["rejected", "failed", "manual_review"].includes(p.status) && <div className="mt-2 line-clamp-2 text-xs text-muted">{p.statusNote}</div>}
        </div>
      </Link>)}
    </div>
  </div>;
}
