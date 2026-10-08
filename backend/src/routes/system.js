// /api/system/status: health of every part, and which parts are simulations.
import { Router } from "express";
import mongoose from "mongoose";
import { formatEther } from "ethers";
import { config } from "../config.js";
import { chain } from "../services/chain.js";
import { ml } from "../services/ml.js";
import { pinataStatus } from "../services/ipfs.js";

const r = Router();

const safe = async (fn) => { try { return await fn(); } catch (e) { return { ok: false, error: e.message }; } };

r.get("/status", async (_req, res) => {
  const [mlStatus, chainStatus, ipfs] = await Promise.all([
    safe(async () => ({ ok: true, ...(await ml.health()) })),
    safe(async () => {
      const { provider, wallet, deployment } = chain();
      const [block, bal] = await Promise.all([provider.getBlockNumber(), provider.getBalance(wallet.address)]);
      return { ok: true, network: deployment.network, chainId: deployment.chainId, contract: deployment.address,
               bufferBps: deployment.bufferBps, block, oracle: wallet.address, oracleBalance: formatEther(bal) };
    }),
    safe(pinataStatus),
  ]);
  res.json({
    db: { ok: mongoose.connection.readyState === 1 },
    ml: mlStatus, chain: chainStatus, ipfs,
    trust: "The backend wallet is a trusted oracle in this prototype.",
    gateway: config.ipfsGateway,
  });
});

r.get("/ml-config", async (_req, res, next) => ml.config().then((d) => res.json(d)).catch(next));
r.get("/reports", async (_req, res, next) => ml.reports().then((d) => res.json(d)).catch(next));
r.get("/contract", (_req, res) => {
  const d = config.deployment;
  if (!d) return res.status(404).json({ error: "Not deployed" });
  res.json({ address: d.address, chainId: d.chainId, network: d.network, abi: d.abi, rpcUrl: config.rpcUrl, gateway: config.ipfsGateway });
});

export default r;
