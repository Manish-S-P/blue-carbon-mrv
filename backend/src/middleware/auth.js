import jwt from "jsonwebtoken";
import { config } from "../config.js";

export function isVerifier(address) {
  return config.verifiers.includes(String(address).toLowerCase());
}

// Requires "Authorization: Bearer <token>" from /api/auth/login.
export function requireAuth(req, res, next) {
  const token = (req.headers.authorization || "").replace(/^Bearer /, "");
  try {
    req.user = jwt.verify(token, config.jwtSecret);
    next();
  } catch {
    res.status(401).json({ error: "Please sign in with your wallet" });
  }
}

export function requireVerifier(req, res, next) {
  if (!isVerifier(req.user?.address)) return res.status(403).json({ error: "Verifier wallet required" });
  next();
}
