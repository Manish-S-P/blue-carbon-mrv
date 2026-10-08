import mongoose from "mongoose";

// Lifecycle: processing -> rejected | manual_review | registered (commitment on-chain) | failed
const plotSchema = new mongoose.Schema(
  {
    owner: { type: String, required: true, lowercase: true, index: true },
    name: { type: String, required: true },
    // MOCK farmer details (prototype only, no real personal data)
    ownerName: String,
    village: String,
    landRecordNo: String, // optional mock land record (RTC) number
    // Background job shown on the dashboard, e.g. "check all quarters"
    job: { kind: String, running: Boolean, done: Number, total: Number, message: String, error: String },
    ecosystem: { type: String, enum: ["mangrove", "seagrass", "saltmarsh"], required: true },
    geometry: { type: { type: String, enum: ["Polygon"], required: true }, coordinates: { type: Array, required: true } },
    areaHa: { type: Number, required: true },
    projectStart: { type: String, required: true }, // ISO date
    status: { type: String, default: "processing", index: true },
    statusNote: String,
    step: String, // current processing step, shown in the UI

    classification: Object, // ML classifier result (decision, fractions, SHAP)
    review: { by: String, at: Date, decision: String, note: String },

    baseline: Object,       // full synthetic-control result (forecast, weights, fit)
    baselineMilli: [Number],
    plotKey: String,        // bytes32 = keccak256(plot _id)
    auditJson: String,      // canonical JSON string that was hashed (exact bytes)
    auditHash: String,
    salt: { type: String, select: false }, // SECRET until reveal
    commitment: String,
    registerTx: String,
    revealed: { type: Boolean, default: false },
    auditCid: String,
    cidSimulated: Boolean,
  },
  { timestamps: true },
);
plotSchema.index({ geometry: "2dsphere" });

export default mongoose.model("Plot", plotSchema);
