// Pin audit files to IPFS with Pinata. Without Pinata credentials, files are kept locally and the
// returned CID is labelled as a SIMULATION (never pretend it is on IPFS).
import fs from "fs";
import path from "path";
import { keccak256, toUtf8Bytes } from "ethers";
import { config } from "../config.js";

// Pinata accepts either a JWT or an API key + secret.
function pinataHeaders() {
  if (config.pinataJwt) return { authorization: `Bearer ${config.pinataJwt}` };
  if (config.pinataKey && config.pinataSecret) return { pinata_api_key: config.pinataKey, pinata_secret_api_key: config.pinataSecret };
  return null;
}

export async function pinJson(name, jsonString) {
  if (!pinataHeaders()) {
    fs.mkdirSync(config.localAuditDir, { recursive: true });
    const cid = `simulation-${keccak256(toUtf8Bytes(jsonString)).slice(2, 18)}`;
    fs.writeFileSync(path.join(config.localAuditDir, `${cid}.json`), jsonString);
    return { cid, simulated: true };
  }
  const res = await fetch("https://api.pinata.cloud/pinning/pinJSONToIPFS", {
    method: "POST",
    headers: { "content-type": "application/json", ...pinataHeaders() },
    // Verifiers re-canonicalise what they download, so key order on IPFS does not matter.
    body: JSON.stringify({ pinataContent: JSON.parse(jsonString), pinataMetadata: { name } }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Pinata failed (${res.status}): ${JSON.stringify(data)}`);
  return { cid: data.IpfsHash, simulated: false };
}

export async function readPinned(cid) {
  if (cid.startsWith("simulation-")) {
    return fs.readFileSync(path.join(config.localAuditDir, `${cid}.json`), "utf8");
  }
  const res = await fetch(`${config.ipfsGateway}${cid}`, { signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`IPFS gateway ${res.status}`);
  return res.text();
}

export async function pinataStatus() {
  if (!pinataHeaders()) return { ok: false, simulated: true, note: "No Pinata credentials set: CIDs are simulations" };
  const res = await fetch("https://api.pinata.cloud/data/testAuthentication", { headers: pinataHeaders() });
  return { ok: res.ok, simulated: false };
}
