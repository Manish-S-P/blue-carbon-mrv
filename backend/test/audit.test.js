// Off-chain helpers must match the contract exactly (same numbers as contracts/test).
import { test } from "node:test";
import assert from "node:assert/strict";
import { id } from "ethers";
import { canonicalJson, commitmentOf, expectedCreditMilli, toMilli } from "../src/services/audit.js";

test("canonical JSON sorts keys at every level", () => {
  assert.equal(canonicalJson({ b: 1, a: { d: [2, { z: 1, y: 2 }], c: null } }), '{"a":{"c":null,"d":[2,{"y":2,"z":1}]},"b":1}');
});

test("milli conversion rounds", () => {
  assert.equal(toMilli(43.9126), 43913);
});

test("credit rule matches the contract test (150 t gross -> 120 credited + 30 buffer)", () => {
  const r = expectedCreditMilli({ observedMilli: 60000, uncertaintyMilli: 5000, baselineMilli: 40000, areaMilliHa: 10000, alreadyIssuedMilli: 0, bufferBps: 2000 });
  assert.equal(r.credit, 120000n);
  assert.equal(r.buffer, 30000n);
});

test("no credit below baseline + uncertainty", () => {
  const r = expectedCreditMilli({ observedMilli: 44000, uncertaintyMilli: 5000, baselineMilli: 40000, areaMilliHa: 10000, alreadyIssuedMilli: 0, bufferBps: 2000 });
  assert.equal(r.credit, 0n);
});

test("commitment is deterministic and changes if the baseline changes", () => {
  const k = id("plot-1"), h = id("audit json"), s = id("salt");
  const a = commitmentOf(k, [40000, 40000], h, s);
  assert.equal(a, commitmentOf(k, [40000, 40000], h, s));
  assert.notEqual(a, commitmentOf(k, [30000, 40000], h, s));
});
