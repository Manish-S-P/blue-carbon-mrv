// Model report: every number here is read from the last real training / placebo run.
import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "../lib/api.js";
import { fmt, pct } from "../lib/format.js";
import { SweepChart } from "../components/Charts.jsx";
import { ErrorNote, Section, Spinner, Stat } from "../components/ui.jsx";

const LIMITS = [
  "Prototype is mangrove-only end to end. Seagrass has no free training labels and is future work.",
  "Training area: four boxes on the Tamil Nadu and Andhra Pradesh coast. Plots outside them are rejected.",
  "GEDI biomass and ESA WorldCover are themselves modelled products. Accuracy is agreement with them, not field truth.",
  "The carbon model captures spatial differences better than year-to-year change; changes smaller than the model error cannot be credited.",
  "Donor plots are assumed unrestored; this cannot be confirmed from satellite data alone.",
  "Sentinel-2 history starts mid-2015; Sentinel-1B stopped in Dec 2021 (single-satellite radar after that).",
  "GEDI was in storage Mar 2023 – Apr 2024, so there are no new biomass labels for that period.",
  "The backend wallet is a trusted oracle in this prototype.",
  "Buffer (20%) and crediting period (8 quarters) are assumptions to confirm.",
];

function Confusion({ cm, labels }) {
  const max = Math.max(...cm.flat());
  return <table className="text-xs">
    <thead><tr><th className="p-1.5 text-left text-muted">WorldCover ↓ / predicted →</th>{labels.map((l) => <th key={l} className="p-1.5 font-medium">{l}</th>)}</tr></thead>
    <tbody>{cm.map((row, i) => <tr key={i}><td className="p-1.5 font-medium">{labels[i]}</td>
      {row.map((v, j) => <td key={j} className="p-1.5 text-center font-mono" style={{ background: `rgba(12,94,91,${(v / max) * 0.85})`, color: v / max > 0.5 ? "white" : "inherit" }}>{v}</td>)}
    </tr>)}</tbody>
  </table>;
}

export default function Science() {
  const [r, setR] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => { api("/system/reports").then(setR).catch((e) => setError(e.message)); }, []);
  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (!r) return <div className="flex items-center gap-2 text-muted"><Spinner /> Loading reports…</div>;
  const { classifier: c, carbon: k, placebo: p } = r;
  const imp = k ? Object.entries(k.feature_importance).map(([f, v]) => ({ f, v })).sort((a, b) => b.v - a.v) : [];

  return <div className="space-y-6">
    <div>
      <h1 className="text-3xl">The science</h1>
      <p className="mt-1 max-w-3xl text-sm text-muted">Every number on this page comes from the last real run of the training and placebo scripts. Cross-validation is spatial (GroupKFold on ~1 km grid cells), never a random split.</p>
    </div>

    {p && <Section title="Headline: placebo tests" subtitle={`${p.n_placebos} donor plots each pretend to be a project starting ${p.project_start}. None were restored, so every credit they would earn is a false credit.`}>
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div>
          <div className="label mb-2">Share of placebo plots that would receive false credits</div>
          <SweepChart sweep={p.deduction_sweep} chosen={p.uncertainty_tco2e_ha} />
        </div>
        <div className="grid grid-cols-2 content-start gap-5">
          <Stat label="Forecast RMSE · SC" value={fmt(p.sc_rmse.mean, 2)} unit="t/ha" />
          <Stat label="Forecast RMSE · flat" value={fmt(p.flat_rmse.mean, 2)} unit="t/ha" />
          <Stat label="Bias · SC" value={fmt(p.sc_bias.mean, 2)} unit="t/ha" hint="observed − baseline" />
          <Stat label="Bias · flat" value={fmt(p.flat_bias.mean, 2)} unit="t/ha" />
          <Stat label="SC beats flat" value={pct(p.sc_beats_flat_rmse_share, 0)} hint="of placebo plots (RMSE)" />
          <Stat label="False credits" value={pct(p.share_false_credit_with_unc.sc, 0)} hint={`with the ${fmt(p.uncertainty_tco2e_ha)} t/ha deduction`} />
          <Stat label="Pre-fit RMSE" value={fmt(p.pre_fit_rmse.mean, 2)} unit="t/ha" />
          <Stat label="Ex-post forecast RMSE" value={fmt(p.expost_forecast_rmse.mean, 2)} unit="t/ha" hint="forecast vs later synthetic" />
        </div>
      </div>
    </Section>}

    <div className="grid gap-6 lg:grid-cols-2">
      {c && <Section title="Model 1 · Ecosystem classifier" subtitle={`Random Forest · ${c.n_rows.toLocaleString()} pixels in ${c.n_cells.toLocaleString()} cells · labels: ESA WorldCover 2021`}>
        <div className="grid grid-cols-2 gap-4">
          <Stat label="Accuracy" value={pct(c.accuracy)} /><Stat label="Cohen's kappa" value={fmt(c.kappa, 3)} />
        </div>
        <div className="mt-5 overflow-x-auto"><Confusion cm={c.confusion_matrix} labels={c.labels} /></div>
        <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
          {c.labels.map((l) => <div key={l} className="rounded-lg bg-sand p-2"><div className="font-medium">{l}</div><div className="text-muted">F1 {fmt(c.per_class[l]["f1-score"], 3)}</div></div>)}
        </div>
        <p className="mt-3 text-xs text-muted">{c.note}</p>
      </Section>}

      {k && <Section title="Model 2 · Carbon estimator" subtitle={`Random Forest regressor · ${k.n_shots.toLocaleString()} GEDI L4A shots in ${k.n_cells} cells`}>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Stat label="Plot-scale RMSE" value={fmt(k.cell.rmse, 2)} unit="Mg/ha" hint={`R² ${fmt(k.cell.r2, 2)} · ${k.cell.n_cells} cells`} />
          <Stat label="Shot RMSE" value={fmt(k.shot.rmse, 2)} unit="Mg/ha" hint={`R² ${fmt(k.shot.r2, 2)}`} />
          <Stat label="Predict-mean RMSE" value={fmt(k.shot.rmse_predict_mean, 2)} unit="Mg/ha" hint="honest reference" />
          <Stat label="GEDI mean SE" value={fmt(k.mean_agbd_se, 2)} unit="Mg/ha" />
          <Stat label="Uncertainty deduction" value={fmt(k.uncertainty_tco2e_ha, 1)} unit="tCO2e/ha" hint="z = 1.645" />
        </div>
        <div className="label mt-5 mb-1">Feature importance</div>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={imp} margin={{ left: -20, right: 10 }}>
            <CartesianGrid stroke="#e9e4d8" vertical={false} />
            <XAxis dataKey="f" tick={{ fontSize: 10 }} interval={0} angle={-30} textAnchor="end" height={50} />
            <YAxis tick={{ fontSize: 10 }} />
            <Tooltip formatter={(v) => fmt(v, 3)} />
            <Bar dataKey="v" fill="#2f7a45" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
        <div className="label mt-4 mb-1">Conversion sensitivity (tCO2e/ha per 100 Mg/ha AGB)</div>
        <div className="grid grid-cols-2 gap-2 text-xs">{Object.entries(k.conversion_sensitivity_per_100Mg).map(([kk, v]) => <div key={kk} className="flex justify-between rounded-lg bg-sand p-2 font-mono"><span>{kk}</span><span>{v}</span></div>)}</div>
        <p className="mt-3 text-xs text-muted">{k.note} Carbon fraction 0.451 (Table 4.2) and root:shoot 0.29 (Table 4.5, tropical dry) from the IPCC 2013 Wetlands Supplement; soil gain counted as zero.</p>
      </Section>}
    </div>

    <Section title="Pipeline">
      <ol className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
        {[
          ["Sentinel-2", "S2_SR_HARMONIZED, SCL cloud mask, quarterly median; B2 B3 B4 B8 B11 + NDVI, NDWI, EVI"],
          ["Sentinel-1", "GRD IW, descending orbit, VV & VH averaged in linear units then converted to dB"],
          ["GEDI L4A", "Monthly raster, l4_quality_flag = 1 and degrade_flag = 0, mangrove pixels only"],
          ["Model 3 · anomaly", "Isolation Forest on donor quarters (features + carbon change); flagged quarters held for review"],
          ["SHAP", "TreeExplainer on models 1 and 2, shown for each decision and estimate"],
          ["Synthetic control", "SLSQP weights (≥0, sum 1) on pre-period; linear trend + quarterly seasonality forecast"],
        ].map(([t, d]) => <li key={t} className="rounded-xl bg-sand p-4"><div className="font-medium">{t}</div><div className="mt-1 text-muted">{d}</div></li>)}
      </ol>
    </Section>

    <Section title="Honest limits" subtitle="Stated in the paper.">
      <ul className="grid gap-2 text-sm sm:grid-cols-2">{LIMITS.map((l) => <li key={l} className="flex gap-2"><span className="text-amber">●</span><span>{l}</span></li>)}</ul>
    </Section>
  </div>;
}
