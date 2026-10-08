// "Technical details" tab: everything a reviewer wants to see (SHAP, synthetic control, donors).
import { Fragment, useState } from "react";
import { fmt, milli, pct } from "../lib/format.js";
import { BaselineChart, FractionBar, ShapBars } from "./Charts.jsx";
import { Hash, Note, Section, Stat, StatusBadge } from "./ui.jsx";

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

function QuarterRow({ q, i, plot, obs }) {
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

export default function TechnicalDetails({ plot, observations }) {
  const b = plot.baseline;
  const obsByIdx = Object.fromEntries(observations.map((o) => [o.quarterIndex, o]));
  return <div className="space-y-6">
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
          <tbody>{b.future_quarters.map((q, i) => <QuarterRow key={q} q={q} i={i} plot={plot} obs={obsByIdx[i]} />)}</tbody>
        </table>
      </div>
    </Section>}
  </div>;
}
