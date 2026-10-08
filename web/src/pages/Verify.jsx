// Independent verification, done entirely in the browser:
// read the commitment from the chain, download the audit file, re-hash it, compare.
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Contract, JsonRpcProvider, id as keccakId } from "ethers";
import { api } from "../lib/api.js";
import { canonicalJson, commitmentOf, expectedCreditMilli, hashJson } from "../lib/audit.js";
import { milli } from "../lib/format.js";
import { ErrorNote, Hash, Note, Section, Spinner } from "../components/ui.jsx";

async function contractInfo() {
  const info = await api("/system/contract");
  const rpc = import.meta.env.VITE_RPC_URL || info.rpcUrl; // browser talks to the chain directly
  return { ...info, registry: new Contract(info.address, info.abi, new JsonRpcProvider(rpc)) };
}

async function fetchFile(cid, gateway) {
  if (!cid.startsWith("simulation-")) {
    try {
      const r = await fetch(`${import.meta.env.VITE_IPFS_GATEWAY || gateway}${cid}`);
      if (r.ok) return { json: await r.json(), source: "IPFS gateway" };
    } catch { /* fall back to the backend copy */ }
  }
  const r = await fetch(`/api/verify/file/${cid}`);
  if (!r.ok) throw new Error(`Could not download ${cid}`);
  return { json: await r.json(), source: cid.startsWith("simulation-") ? "backend (SIMULATION: not on IPFS)" : "backend proxy" };
}

// All checks for one settlement file.
async function check(file, registry) {
  const bufferBps = await registry.bufferBps();
  const r = file.reveal;
  const auditHash = hashJson(canonicalJson(file.audit));
  const commitment = commitmentOf(r.plotKey, r.baselineMilli, auditHash, r.salt);
  const plot = await registry.plots(r.plotKey);
  const onChainBaseline = (await registry.baselineOf(r.plotKey)).map(Number);
  const q = file.quarter;
  const obs = await registry.observations(r.plotKey, q.index);
  const out = [
    ["Audit file hash", auditHash === r.auditHash, `re-hashed ${auditHash.slice(0, 12)}… vs revealed ${r.auditHash.slice(0, 12)}…`],
    ["Commitment matches chain", commitment === plot.commitment, `recomputed ${commitment.slice(0, 12)}… vs on-chain ${plot.commitment.slice(0, 12)}…`],
    ["Audit baseline = revealed baseline", JSON.stringify(file.audit.baseline.baselineMilli) === JSON.stringify(r.baselineMilli), "numbers inside the committed audit file are the ones revealed"],
    ["Revealed baseline = on-chain baseline", JSON.stringify(onChainBaseline) === JSON.stringify(r.baselineMilli.map(Number)), `${onChainBaseline.length} quarters stored on-chain`],
    ["Observation matches chain", obs.exists && Number(obs.observedMilli) === q.observedMilli && Number(obs.uncertaintyMilli) === q.uncertaintyMilli,
      `${q.label}: observed ${milli(q.observedMilli, 2)} t/ha, uncertainty ${milli(q.uncertaintyMilli, 2)}`],
  ];
  // Commit-before-outcome: the plot (and its commitment) was registered before this quarter's observation.
  const obsEv = (await registry.queryFilter(registry.filters.ObservationSubmitted(r.plotKey))).find((e) => Number(e.args.quarter) === q.index);
  if (obsEv) {
    const obsTime = (await obsEv.getBlock()).timestamp;
    out.push(["Committed before outcome", Number(plot.registeredAt) <= obsTime,
      `registered ${new Date(Number(plot.registeredAt) * 1000).toISOString()} · observation ${new Date(obsTime * 1000).toISOString()}${file.audit.baseline.historical_replay ? " (historical replay: satellite data already existed)" : ""}`]);
  }
  const settledEv = (await registry.queryFilter(registry.filters.QuarterSettled(r.plotKey))).find((e) => Number(e.args.quarter) === q.index);
  if (settledEv) {
    const tokenId = Number(settledEv.args.tokenId);
    // recompute credit with the credit rule, using what was already issued before this quarter
    const mints = (await registry.queryFilter(registry.filters.CreditMinted(null, r.plotKey))).filter((e) => e.blockNumber < settledEv.blockNumber || (e.blockNumber === settledEv.blockNumber && e.index < settledEv.index));
    const issuedBefore = mints.reduce((s, e) => s + e.args.amountMilli + e.args.bufferMilli, 0n);
    const exp = expectedCreditMilli({ observedMilli: q.observedMilli, uncertaintyMilli: q.uncertaintyMilli, baselineMilli: r.baselineMilli[q.index],
      areaMilliHa: plot.areaMilliHa, alreadyIssuedMilli: issuedBefore, bufferBps });
    let actual = 0n;
    if (tokenId) actual = (await registry.credits(tokenId)).amountMilli;
    out.push(["Credit follows the rule", exp.credit === actual,
      `expected ${milli(exp.credit, 3)} t, on-chain ${tokenId ? `token #${tokenId}: ${milli(actual, 3)} t` : "no token minted"}`]);
  }
  return out;
}

export default function Verify() {
  const { id } = useParams();
  const nav = useNavigate();
  const [plotId, setPlotId] = useState(id || "");
  const [items, setItems] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const runForPlot = async (pid) => {
    setError(""); setItems(null); setLoading(true);
    try {
      const info = await contractInfo();
      const plotKey = keccakId(String(pid));
      const plot = await info.registry.plots(plotKey);
      if (plot.owner === "0x0000000000000000000000000000000000000000") throw new Error("No plot with this ID on-chain");
      const events = await info.registry.queryFilter(info.registry.filters.QuarterSettled(plotKey));
      if (!events.length) { setItems([]); return; }
      const res = [];
      for (const ev of events) {
        const { json, source } = await fetchFile(ev.args.cid, info.gateway);
        res.push({ cid: ev.args.cid, quarter: json.quarter.label, source, tx: ev.transactionHash, checks: await check(json, info.registry) });
      }
      setItems(res);
    } catch (e) { setError(e.shortMessage || e.message); } finally { setLoading(false); }
  };

  const runForFile = async (f) => {
    setError(""); setItems(null); setLoading(true);
    try {
      const json = JSON.parse(await f.text());
      const info = await contractInfo();
      setItems([{ cid: f.name, quarter: json.quarter?.label, source: "uploaded file", checks: await check(json, info.registry) }]);
    } catch (e) { setError(e.shortMessage || e.message); } finally { setLoading(false); }
  };

  useEffect(() => { if (id) runForPlot(id); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  return <div className="space-y-6">
    <div>
      <h1 className="text-3xl">Verify</h1>
      <p className="mt-1 max-w-3xl text-sm text-muted">Anyone can check a credit. Your browser reads the commitment straight from the blockchain, downloads the audit file, re-hashes it with the same canonical-JSON rule, and compares. Nothing here relies on trusting the backend's answer.</p>
    </div>
    <div className="grid gap-4 md:grid-cols-2">
      <form className="card space-y-3 p-5" onSubmit={(e) => { e.preventDefault(); nav(`/verify/${plotId.trim()}`); runForPlot(plotId.trim()); }}>
        <div className="label">By plot ID</div>
        <input className="input font-mono" placeholder="e.g. 6ac7686d3db7d443408e1bff" value={plotId} onChange={(e) => setPlotId(e.target.value)} />
        <button className="btn-primary" disabled={!plotId || loading}>{loading ? <Spinner /> : "Verify on-chain"}</button>
      </form>
      <label className="card flex cursor-pointer flex-col justify-center gap-2 border-dashed p-5 text-center hover:border-lagoon/50">
        <div className="label">Or upload a settlement file</div>
        <span className="text-sm text-muted">JSON downloaded from IPFS</span>
        <input type="file" accept="application/json" className="hidden" onChange={(e) => e.target.files[0] && runForFile(e.target.files[0])} />
      </label>
    </div>
    <ErrorNote>{error}</ErrorNote>
    {items && items.length === 0 && <Note>This plot is registered, but no quarter has been revealed yet. Only the commitment hash is public so far.</Note>}
    {items?.map((it) => {
      const ok = it.checks.every((c) => c[1]);
      return <Section key={it.cid} title={`${it.quarter} ${ok ? "verified" : "FAILED"}`}
        subtitle={<span>File <Hash value={it.cid} /> from {it.source}{it.tx && <> · tx <Hash value={it.tx} /></>}</span>}
        right={<span className={`rounded-full px-3 py-1 text-sm font-medium ${ok ? "bg-leaf-light text-leaf" : "bg-coral-light text-coral"}`}>{ok ? "✓ All checks pass" : "✗ Mismatch"}</span>}>
        <ul className="divide-y divide-line">
          {it.checks.map(([label, pass, detail]) => <li key={label} className="flex items-start gap-3 py-2.5">
            <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs text-white ${pass ? "bg-leaf" : "bg-coral"}`}>{pass ? "✓" : "✗"}</span>
            <div><div className="text-sm font-medium">{label}</div><div className="font-mono text-xs text-muted">{detail}</div></div>
          </li>)}
        </ul>
      </Section>;
    })}
  </div>;
}
