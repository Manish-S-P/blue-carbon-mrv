// Sign-in with wallet + MOCK identity. The wallet signs a one-time message; no passwords, no Aadhaar.
import { Router } from "express";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { getAddress, verifyMessage } from "ethers";
import User from "../models/User.js";
import { config } from "../config.js";
import { isVerifier, requireAuth } from "../middleware/auth.js";

const r = Router();
const message = (address, nonce) =>
  `Blue Carbon MRV sign-in\nWallet: ${address}\nNonce: ${nonce}\n(Mock identity, prototype only)`;

r.post("/nonce", async (req, res) => {
  let address;
  try { address = getAddress(req.body.address).toLowerCase(); } catch { return res.status(400).json({ error: "Bad address" }); }
  const nonce = crypto.randomBytes(16).toString("hex");
  const user = await User.findOneAndUpdate(
    { address },
    { nonce, $setOnInsert: { mockId: `MOCK-${crypto.randomBytes(3).toString("hex").toUpperCase()}` } },
    { upsert: true, new: true },
  );
  res.json({ message: message(user.address, nonce) });
});

r.post("/login", async (req, res) => {
  const { address, signature, name } = req.body;
  const user = await User.findOne({ address: String(address).toLowerCase() });
  if (!user) return res.status(400).json({ error: "Ask for a nonce first" });
  let signer;
  try { signer = verifyMessage(message(user.address, user.nonce), signature).toLowerCase(); } catch { signer = null; }
  if (signer !== user.address) return res.status(401).json({ error: "Signature does not match wallet" });
  user.nonce = crypto.randomBytes(16).toString("hex"); // one-time use
  if (name) user.name = String(name).slice(0, 60);
  await user.save();
  const profile = { address: user.address, name: user.name, mockId: user.mockId, verifier: isVerifier(user.address) };
  res.json({ token: jwt.sign(profile, config.jwtSecret, { expiresIn: "7d" }), user: profile });
});

r.get("/me", requireAuth, (req, res) => res.json({ user: { ...req.user, verifier: isVerifier(req.user.address) } }));

export default r;
