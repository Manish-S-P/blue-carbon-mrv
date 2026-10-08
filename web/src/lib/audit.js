// Same hashing rules as backend/src/services/audit.js, run in the browser so a verifier
// does not have to trust the backend.
import { AbiCoder, keccak256, toUtf8Bytes, randomBytes, hexlify, id } from "ethers";

// JSON with object keys sorted at every level and no spaces -> same bytes every time.
export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const keys = Object.keys(value).filter((k) => value[k] !== undefined).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

export const hashJson = (jsonString) => keccak256(toUtf8Bytes(jsonString));

// Only place where decimals become on-chain integers: x1000, rounded.
export const toMilli = (x) => Math.round(Number(x) * 1000);
export const fromMilli = (m) => Number(m) / 1000;

export const plotKeyOf = (plotId) => id(String(plotId)); // keccak256 of the Mongo id

export const newSalt = () => hexlify(randomBytes(32)); // 32 random bytes, secret until reveal

export function commitmentOf(plotKey, baselineMilli, auditHash, salt) {
  const enc = AbiCoder.defaultAbiCoder().encode(
    ["bytes32", "uint256[]", "bytes32", "bytes32"],
    [plotKey, baselineMilli.map(BigInt), auditHash, salt],
  );
  return keccak256(enc);
}

// Same credit rule as the contract (used to show the expected result before sending a tx).
export function expectedCreditMilli({ observedMilli, uncertaintyMilli, baselineMilli, areaMilliHa, alreadyIssuedMilli, bufferBps }) {
  const floor = BigInt(baselineMilli) + BigInt(uncertaintyMilli);
  const obs = BigInt(observedMilli);
  const perHa = obs > floor ? obs - floor : 0n;
  const total = (perHa * BigInt(areaMilliHa)) / 1000n;
  const issued = BigInt(alreadyIssuedMilli);
  if (total <= issued) return { gross: 0n, buffer: 0n, credit: 0n, perHa };
  const gross = total - issued;
  const buffer = (gross * BigInt(bufferBps)) / 10000n;
  return { gross, buffer, credit: gross - buffer, perHa };
}
