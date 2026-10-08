// Recharts: baseline vs observed, SHAP bars, placebo sweep.
import { Area, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fmt } from "../lib/format.js";

const C = { ink: "#12201e", lagoon: "#0c5e5b", leaf: "#2f7a45", amber: "#b26b00", coral: "#b4442f", muted: "#8a9894", band: "#d8ece7", grid: "#e9e4d8" };
const axis = { fontSize: 11, fill: "#5b6b67" };

export function BaselineChart({ baseline, observations = [] }) {
  if (!baseline) return null;
  const unc = baseline.uncertainty_t_ha;
  const obsByQ = Object.fromEntries(observations.filter((o) => o.co2eTHa != null).map((o) => [o.quarter, o.co2eTHa]));
  const pre = baseline.pre_quarters.map((q, i) => ({ q, plot: baseline.pre_observed[i], synthetic: baseline.pre_synthetic[i] }));
  const post = baseline.future_quarters.map((q, i) => ({
    q, baseline: baseline.baseline[i], flat: baseline.flat_baseline?.[i],
    band: [baseline.baseline[i], baseline.baseline[i] + unc], observed: obsByQ[q],
  }));
  const data = [...pre, ...post];
  return <ResponsiveContainer width="100%" height={340}>
    <ComposedChart data={data} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
      <CartesianGrid stroke={C.grid} vertical={false} />
      <XAxis dataKey="q" tick={axis} interval={1} />
      <YAxis tick={axis} label={{ value: "tCO2e / ha", angle: -90, position: "insideLeft", offset: 20, style: axis }} />
      <Tooltip formatter={(v, n) => [Array.isArray(v) ? `${fmt(v[0])} – ${fmt(v[1])}` : fmt(v), n]} contentStyle={{ borderRadius: 12, borderColor: "#e2ddd0", fontSize: 12 }} />
      <Legend wrapperStyle={{ fontSize: 12 }} />
      <ReferenceLine x={baseline.future_quarters[0]} stroke={C.muted} strokeDasharray="4 4" label={{ value: "project start", fontSize: 11, fill: C.muted, position: "insideTopRight" }} />
      <Area isAnimationActive={false} dataKey="band" name={`Baseline + uncertainty (${fmt(unc)})`} fill={C.band} stroke="none" />
      <Line isAnimationActive={false} dataKey="plot" name="Plot (pre-period)" stroke={C.ink} dot={{ r: 2.5 }} strokeWidth={1.5} connectNulls />
      <Line isAnimationActive={false} dataKey="synthetic" name="Synthetic control" stroke={C.lagoon} strokeDasharray="5 4" dot={false} strokeWidth={2} />
      <Line isAnimationActive={false} dataKey="baseline" name="Baseline forecast (committed)" stroke={C.lagoon} strokeWidth={2.5} dot={{ r: 3 }} />
      <Line isAnimationActive={false} dataKey="flat" name="Naive flat baseline" stroke={C.muted} strokeDasharray="2 4" dot={false} />
      <Line isAnimationActive={false} dataKey="observed" name="Observed" stroke={C.amber} strokeWidth={0} dot={{ r: 5, fill: C.amber }} />
    </ComposedChart>
  </ResponsiveContainer>;
}

export function ShapBars({ contributions, unit = "" }) {
  if (!contributions?.length) return null;
  const data = contributions.map((c) => ({ ...c, label: `${c.feature} = ${c.value == null ? "NaN" : fmt(c.value, 3)}` })).reverse();
  return <ResponsiveContainer width="100%" height={36 * data.length + 30}>
    <BarChart data={data} layout="vertical" margin={{ top: 0, right: 20, left: 10, bottom: 0 }}>
      <CartesianGrid stroke={C.grid} horizontal={false} />
      <XAxis type="number" tick={axis} />
      <YAxis type="category" dataKey="label" tick={{ ...axis, fontFamily: "JetBrains Mono" }} width={170} />
      <ReferenceLine x={0} stroke={C.muted} />
      <Tooltip formatter={(v) => [`${v > 0 ? "+" : ""}${fmt(v, 3)} ${unit}`, "SHAP"]} contentStyle={{ borderRadius: 12, fontSize: 12 }} />
      <Bar isAnimationActive={false} dataKey="shap" radius={4}>{data.map((d, i) => <Cell key={i} fill={d.shap >= 0 ? C.leaf : C.coral} />)}</Bar>
    </BarChart>
  </ResponsiveContainer>;
}

export function SweepChart({ sweep, chosen }) {
  if (!sweep) return null;
  const data = sweep.map((r) => ({ d: r.deduction, sc: r.sc * 100, flat: r.flat * 100 }));
  return <ResponsiveContainer width="100%" height={300}>
    <ComposedChart data={data} margin={{ top: 10, right: 10, left: -10, bottom: 10 }}>
      <CartesianGrid stroke={C.grid} vertical={false} />
      <XAxis dataKey="d" tick={axis} label={{ value: "Uncertainty deduction (tCO2e/ha)", position: "insideBottom", offset: -5, style: axis }} />
      <YAxis tick={axis} unit="%" />
      <Tooltip formatter={(v, n) => [`${fmt(v, 0)}%`, n]} contentStyle={{ borderRadius: 12, fontSize: 12 }} />
      <Legend wrapperStyle={{ fontSize: 12 }} verticalAlign="top" />
      {chosen != null && <ReferenceLine x={Math.round(chosen / 5) * 5} stroke={C.amber} strokeDasharray="4 4" label={{ value: `used: ${fmt(chosen)}`, fontSize: 11, fill: C.amber }} />}
      <Line isAnimationActive={false} dataKey="flat" name="Naive flat baseline" stroke={C.muted} strokeWidth={2} dot={{ r: 2 }} />
      <Line isAnimationActive={false} dataKey="sc" name="Synthetic control" stroke={C.lagoon} strokeWidth={2.5} dot={{ r: 2.5 }} />
    </ComposedChart>
  </ResponsiveContainer>;
}

export function FractionBar({ fractions }) {
  if (!fractions) return null;
  const colors = { mangrove: C.leaf, wetland: C.lagoon, other: C.muted };
  return <div>
    <div className="flex h-3 overflow-hidden rounded-full bg-line">
      {Object.entries(fractions).map(([k, v]) => <div key={k} style={{ width: `${v * 100}%`, background: colors[k] }} title={`${k} ${(v * 100).toFixed(1)}%`} />)}
    </div>
    <div className="mt-2 flex flex-wrap gap-4 text-xs text-muted">
      {Object.entries(fractions).map(([k, v]) => <span key={k} className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: colors[k] }} />{k} {(v * 100).toFixed(1)}%</span>)}
    </div>
  </div>;
}
