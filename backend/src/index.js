import express from "express";
import cors from "cors";
import { config } from "./config.js";
import { connectDb } from "./db.js";
import authRoutes from "./routes/auth.js";
import projectRoutes from "./routes/projects.js";
import mrvRoutes from "./routes/mrv.js";
import systemRoutes from "./routes/system.js";
import verifyRoutes from "./routes/verify.js";

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.use("/api/auth", authRoutes);
app.use("/api/projects", projectRoutes);
app.use("/api/mrv", mrvRoutes);
app.use("/api/system", systemRoutes);
app.use("/api/verify", verifyRoutes);

// Contract errors come back with a readable name (e.g. BaselineMismatch).
app.use((err, _req, res, _next) => {
  const reason = err.revert?.name || err.shortMessage || err.message;
  if (!err.status) console.error(err);
  res.status(err.status || 500).json({ error: reason });
});

await connectDb();
app.listen(config.port, () => console.log(`Backend on http://localhost:${config.port}`));
