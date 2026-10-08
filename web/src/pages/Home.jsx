import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api.js";
import { useWallet } from "../lib/wallet.jsx";
import { fmt, pct } from "../lib/format.js";
import { Stat } from "../components/ui.jsx";

const STEPS = [
  ["Draw your plot", "Connect a wallet, sign in with a mock identity, and draw the plot on a satellite map."],
  ["Satellite check", "A Random Forest on Sentinel-1 radar + Sentinel-2 optical checks the land really is mangrove."],
  ["Counterfactual baseline", "Synthetic control: a weighted mix of similar, unrestored mangrove plots forecasts what would have happened anyway."],
  ["Commit before outcomes", "Only a hash of the baseline goes on-chain. It cannot be adjusted once results start coming in."],
  ["Quarterly monitoring", "Every quarter the carbon stock is estimated from satellites, with uncertainty, SHAP reasons and an anomaly check."],
  ["Reveal and mint", "The baseline is revealed and checked against the hash. Only carbon above baseline + uncertainty becomes an NFT credit."],
  ["Anyone can verify", "Download the audit file from IPFS, re-hash it in your browser, and compare with the commitment on-chain."],
];

export default function Home() {
  const { user, signIn, busy } = useWallet();
  const [reports, setReports] = useState(null);
  useEffect(() => { api("/system/reports").then(setReports).catch(() => {}); }, []);
  const c = reports?.classifier, k = reports?.carbon, p = reports?.placebo;

  return <div className="space-y-16">
    <section className="relative overflow-hidden rounded-3xl bg-lagoon px-6 py-14 text-white sm:px-12 sm:py-20">
      <svg className="pointer-events-none absolute -right-20 -bottom-10 h-80 w-[36rem] opacity-20" viewBox="0 0 600 300" aria-hidden>
        {[0, 1, 2, 3, 4].map((i) => <path key={i} d={`M0 ${200 + i * 18} C 150 ${170 + i * 18}, 300 ${230 + i * 18}, 600 ${190 + i * 18}`} stroke="#9fe0c9" strokeWidth="2" fill="none" />)}
        {[60, 160, 270, 390, 500].map((x, i) => <path key={x} d={`M${x} 200 q -14 -60 0 -${110 + i * 8} q 14 50 0 ${110 + i * 8} M${x} 200 l -18 30 M${x} 200 l 18 30 M${x} 200 l 0 34`} stroke="#cfeee6" strokeWidth="3" fill="none" />)}
      </svg>
      <div className="relative max-w-2xl">
        <div className="text-sm font-medium tracking-wide text-[#9fe0c9]">Monitoring · Reporting · Verification</div>
        <h1 className="mt-3 text-4xl leading-tight sm:text-5xl">Carbon credits for mangroves, only for what is <em className="text-[#9fe0c9]">truly additional</em>.</h1>
        <p className="mt-5 text-lg text-white/80">Satellites estimate the carbon stock. A counterfactual baseline is fixed on-chain before results exist. Credits are minted only for carbon above it.</p>
        <div className="mt-8 flex flex-wrap gap-3">
          {user ? <Link to="/register" className="btn bg-white text-lagoon hover:bg-[#eaf6f2]">Register a plot</Link>
                : <button onClick={() => signIn()} disabled={busy} className="btn bg-white text-lagoon hover:bg-[#eaf6f2]">Connect wallet to start</button>}
          <Link to="/verify" className="btn border border-white/40 text-white hover:bg-white/10">Verify a credit</Link>
          <Link to="/science" className="btn border border-white/40 text-white hover:bg-white/10">See the science</Link>
        </div>
      </div>
    </section>

    <section>
      <h2 className="text-2xl">How it works</h2>
      <ol className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map(([t, d], i) => <li key={t} className="card p-5">
          <div className="font-mono text-xs text-lagoon">0{i + 1}</div>
          <div className="mt-2 font-medium">{t}</div>
          <p className="mt-1 text-sm text-muted">{d}</p>
        </li>)}
      </ol>
    </section>

    <section className="card p-6 sm:p-8">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h2 className="text-2xl">Measured, not claimed</h2>
        <Link to="/science" className="text-sm text-lagoon underline underline-offset-4">Full model report →</Link>
      </div>
      <p className="mt-1 text-sm text-muted">Live numbers from the last training run (spatial cross-validation). Accuracy is agreement with modelled products, not field truth.</p>
      {reports ? <div className="mt-6 grid grid-cols-2 gap-6 lg:grid-cols-4">
        <Stat label="Ecosystem classifier" value={pct(c?.accuracy)} hint={`accuracy · kappa ${fmt(c?.kappa, 2)} vs WorldCover`} />
        <Stat label="Carbon model (plot scale)" value={fmt(k?.cell?.rmse, 1)} unit="Mg/ha" hint={`RMSE · R² ${fmt(k?.cell?.r2, 2)} vs GEDI L4A`} />
        <Stat label="Placebo plots" value={p?.n_placebos ?? "—"} hint={`synthetic control beat flat baseline on ${pct(p?.sc_beats_flat_rmse_share, 0)}`} />
        <Stat label="False credits issued" value={pct(p?.share_false_credit_with_unc?.sc, 0)} hint={`of placebo plots, after ${fmt(p?.uncertainty_tco2e_ha)} t/ha deduction`} />
      </div> : <p className="mt-6 text-sm text-muted">Model reports unavailable (is the ML service running?).</p>}
    </section>
  </div>;
}
