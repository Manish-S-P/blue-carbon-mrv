import { useEffect, useState } from "react";
import { api } from "../lib/api.js";
import { ErrorNote, Hash, Note, Section, Spinner } from "../components/ui.jsx";

function Row({ name, ok, children, warn }) {
  return <div className="flex flex-wrap items-start justify-between gap-3 border-t border-line py-4 first:border-0">
    <div className="flex items-center gap-3">
      <span className={`h-2.5 w-2.5 rounded-full ${ok ? (warn ? "bg-amber" : "bg-leaf") : "bg-coral"}`} />
      <span className="font-medium">{name}</span>
    </div>
    <div className="text-right text-sm text-muted">{children}</div>
  </div>;
}

export default function System() {
  const [s, setS] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => { api("/system/status").then(setS).catch((e) => setError(e.message)); }, []);
  return <div className="space-y-6">
    <h1 className="text-3xl">System status</h1>
    <ErrorNote>{error}</ErrorNote>
    {!s ? !error && <Spinner /> : <>
      <Section>
        <Row name="Database (MongoDB)" ok={s.db.ok}>{s.db.ok ? "connected" : "not connected"}</Row>
        <Row name="ML service (FastAPI + Earth Engine)" ok={s.ml.ok}>{s.ml.ok ? <>models: {Object.keys(s.ml.models).join(", ")}<br />latest finished quarter ends {s.ml.last_complete_quarter_end}</> : s.ml.error}</Row>
        <Row name="Blockchain" ok={s.chain.ok}>{s.chain.ok ? <>{s.chain.network} (chainId {s.chain.chainId}) · block {s.chain.block}<br />contract <Hash value={s.chain.contract} /> · oracle <Hash value={s.chain.oracle} /> ({Number(s.chain.oracleBalance).toFixed(3)} POL)</> : s.chain.error}</Row>
        <Row name="IPFS (Pinata)" ok={s.ipfs.ok || s.ipfs.simulated} warn={s.ipfs.simulated}>{s.ipfs.simulated ? <span className="text-amber">SIMULATION: {s.ipfs.note}</span> : s.ipfs.ok ? "authenticated" : s.ipfs.error || "auth failed"}</Row>
      </Section>
      <Note tone="amber">{s.trust}</Note>
    </>}
  </div>;
}
