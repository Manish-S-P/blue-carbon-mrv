// All settings come from .env (never hard-code secrets).
import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");

function required(name) {
  if (!process.env[name]) throw new Error(`Missing ${name} in backend/.env (see .env.example)`);
  return process.env[name];
}

function loadDeployment() {
  const file = path.resolve(root, process.env.DEPLOYMENT_FILE || "../contracts/deployments/localhost.json");
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

export const config = {
  port: Number(process.env.PORT || 4000),
  mongoUri: required("MONGODB_URI"),
  jwtSecret: required("JWT_SECRET"),
  mlUrl: process.env.ML_URL || "http://127.0.0.1:8000",
  rpcUrl: process.env.RPC_URL || "http://127.0.0.1:8545",
  oracleKey: process.env.ORACLE_PRIVATE_KEY || "",
  deployment: loadDeployment(),
  pinataJwt: process.env.PINATA_JWT || "",
  ipfsGateway: process.env.IPFS_GATEWAY || "https://gateway.pinata.cloud/ipfs/",
  verifiers: (process.env.VERIFIER_ADDRESSES || "").split(",").map((a) => a.trim().toLowerCase()).filter(Boolean),
  localAuditDir: path.join(root, "local_ipfs"),
};
