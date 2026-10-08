// ethers v6 connection to MRVRegistry. The backend wallet is the trusted oracle (prototype limit).
import { Contract, JsonRpcProvider, NonceManager, Wallet } from "ethers";
import { config } from "../config.js";

let cached;

export function chain() {
  if (cached) return cached;
  const dep = config.deployment;
  if (!dep) throw new Error("No contract deployment found. Run `npm run deploy:local` in contracts/.");
  if (!config.oracleKey) throw new Error("ORACLE_PRIVATE_KEY missing in backend/.env");
  const provider = new JsonRpcProvider(config.rpcUrl);
  const wallet = new Wallet(config.oracleKey, provider);
  // NonceManager counts nonces locally so back-to-back txs never reuse one.
  const registry = new Contract(dep.address, dep.abi, new NonceManager(wallet));
  cached = { provider, wallet, registry, deployment: dep };
  return cached;
}

let queue = Promise.resolve();

// Send a tx, wait for it, return the receipt with parsed events.
// Oracle txs go out one at a time (queue) so two requests cannot race for the same nonce.
export function send(method, ...args) {
  const job = queue.then(() => sendNow(method, ...args));
  queue = job.catch(() => {});
  return job;
}

async function sendNow(method, ...args) {
  const { registry } = chain();
  const tx = await registry[method](...args);
  const receipt = await tx.wait();
  const events = receipt.logs
    .map((l) => { try { return registry.interface.parseLog(l); } catch { return null; } })
    .filter(Boolean)
    .map((e) => ({ name: e.name, args: e.args }));
  return { hash: receipt.hash, block: receipt.blockNumber, events };
}
