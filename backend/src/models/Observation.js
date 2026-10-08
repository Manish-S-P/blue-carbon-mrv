import mongoose from "mongoose";

// One per plot per crediting quarter.
// status: ok -> on_chain | held_for_review -> (approved -> on_chain | rejected) | no_data
const obsSchema = new mongoose.Schema(
  {
    plot: { type: mongoose.Schema.Types.ObjectId, ref: "Plot", required: true, index: true },
    quarterIndex: { type: Number, required: true },
    quarter: { type: String, required: true },
    status: { type: String, required: true },
    co2eTHa: Number,
    agbMgHa: Number,
    uncertaintyTHa: Number,
    baselineTHa: Number,
    observedMilli: Number,
    uncertaintyMilli: Number,
    anomaly: Object,
    shap: Object,
    features: Object,
    modelVersions: Object,
    review: { by: String, at: Date, decision: String, note: String },
    submitTx: String,
    settled: { type: Boolean, default: false },
    settleTx: String,
    tokenId: Number,
    creditMilli: Number,
    bufferMilli: Number,
    cid: String,
    cidSimulated: Boolean,
  },
  { timestamps: true },
);
obsSchema.index({ plot: 1, quarterIndex: 1 }, { unique: true });

export default mongoose.model("Observation", obsSchema);
