import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api.js";
import { useWallet } from "../lib/wallet.jsx";
import { fmt, pct } from "../lib/format.js";
import { Spinner, Stat } from "../components/ui.jsx";

const STEPS = [
  ["🔑", "Connect your wallet", "Your MetaMask wallet is your login. No Aadhaar, no paperwork."],
  ["🗺️", "Draw your land", "Mark your mangrove land on a satellite map. We work out the size for you."],
  ["🛰️", "We check from space", "Every 3 months, satellites measure how much carbon your mangroves hold."],
  ["🏅", "Claim your credits", "If your mangroves hold more carbon than expected, you get carbon credits, saved on the blockchain."],
];

const WHY = [
  ["Fair", "We first predict what would have happened without your work, and lock that prediction before any results. You are paid only for the real difference you made."],
  ["Safe", "Every result is saved on a public blockchain. Nobody, not even us, can secretly change it."],
  ["Open", "Anyone can check your credits themselves on the Verify page."],
];

export default function Home() {
  const { user, signIn, busy } = useWallet();
  const [reports, setReports] = useState(null);
  useEffect(() => { api("/system/reports").then(setReports).catch(() => {}); }, []);
  const c = reports?.classifier, k = reports?.carbon, p = reports?.placebo;

  return <div className="space-y-14">
    <section className="relative overflow-hidden rounded-3xl bg-lagoon px-6 py-12 text-white sm:px-12 sm:py-16">
      <svg className="pointer-events-none absolute -right-20 -bottom-10 h-80 w-[36rem] opacity-20" viewBox="0 0 600 300" aria-hidden>
        {[0, 1, 2, 3, 4].map((i) => <path key={i} d={`M0 ${200 + i * 18} C 150 ${170 + i * 18}, 300 ${230 + i * 18}, 600 ${190 + i * 18}`} stroke="#9fe0c9" strokeWidth="2" fill="none" />)}
        {[60, 160, 270, 390, 500].map((x, i) => <path key={x} d={`M${x} 200 q -14 -60 0 -${110 + i * 8} q 14 50 0 ${110 + i * 8} M${x} 200 l -18 30 M${x} 200 l 18 30 M${x} 200 l 0 34`} stroke="#cfeee6" strokeWidth="3" fill="none" />)}
      </svg>
      <div className="relative max-w-2xl">
        <h1 className="text-4xl leading-tight sm:text-5xl">Protect your mangroves. <span className="text-[#9fe0c9]">Earn carbon credits.</span></h1>
        <p className="mt-5 text-lg text-white/85">Mangroves store a lot of carbon. Register your land, and we use satellites to measure how much extra carbon your work adds.</p>
        <div className="mt-8 flex flex-wrap gap-3">
          {user ? <>
            <Link to="/register" className="btn bg-white px-6 py-3 text-base text-lagoon hover:bg-[#eaf6f2]">Register my land</Link>
            <Link to="/my-plots" className="btn border border-white/50 px-6 py-3 text-base text-white hover:bg-white/10">My plots</Link>
          </> : <button onClick={() => signIn()} disabled={busy} className="btn bg-white px-6 py-3 text-base text-lagoon hover:bg-[#eaf6f2]">
            {busy ? <><Spinner /> Check MetaMask…</> : "Connect wallet to start"}</button>}
        </div>
      </div>
    </section>

    <section>
      <h2 className="text-center text-3xl">How it works</h2>
      <ol className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map(([icon, t, d], i) => <li key={t} className="card p-6 text-center">
          <div className="text-4xl">{icon}</div>
          <div className="mt-3 text-xs font-semibold text-lagoon">STEP {i + 1}</div>
          <div className="mt-1 text-lg font-medium">{t}</div>
          <p className="mt-2 text-sm text-muted">{d}</p>
        </li>)}
      </ol>
    </section>

    <section className="grid gap-4 md:grid-cols-3">
      {WHY.map(([t, d]) => <div key={t} className="rounded-2xl bg-leaf-light p-6">
        <div className="font-display text-2xl text-leaf">{t}</div>
        <p className="mt-2 text-sm">{d}</p>
      </div>)}
    </section>

    <section className="card p-6 sm:p-8">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <div className="label">For reviewers</div>
          <h2 className="mt-1 text-2xl">Measured, not claimed</h2>
        </div>
        <Link to="/science" className="text-sm text-lagoon underline underline-offset-4">Full model report →</Link>
      </div>
      <p className="mt-1 text-sm text-muted">Live numbers from the last training run (spatial cross-validation on real satellite data). Accuracy is agreement with modelled products, not field truth.</p>
      {reports ? <div className="mt-6 grid grid-cols-2 gap-6 lg:grid-cols-4">
        <Stat label="Ecosystem classifier" value={pct(c?.accuracy)} hint={`accuracy · kappa ${fmt(c?.kappa, 2)} vs WorldCover`} />
        <Stat label="Carbon model (plot scale)" value={fmt(k?.cell?.rmse, 1)} unit="Mg/ha" hint={`RMSE · R² ${fmt(k?.cell?.r2, 2)} vs GEDI L4A`} />
        <Stat label="Placebo plots" value={p?.n_placebos ?? "—"} hint={`synthetic control beat flat baseline on ${pct(p?.sc_beats_flat_rmse_share, 0)}`} />
        <Stat label="False credits issued" value={pct(p?.share_false_credit_with_unc?.sc, 0)} hint={`of placebo plots, after ${fmt(p?.uncertainty_tco2e_ha)} t/ha deduction`} />
      </div> : <p className="mt-6 text-sm text-muted">Model reports unavailable (is the ML service running?).</p>}
    </section>
  </div>;
}
