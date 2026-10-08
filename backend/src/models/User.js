import mongoose from "mongoose";

// MOCK identity only: a display name and a generated mock ID. No Aadhaar, no real personal data.
const userSchema = new mongoose.Schema(
  {
    address: { type: String, required: true, unique: true, lowercase: true },
    name: { type: String, default: "" },
    mockId: { type: String, required: true }, // e.g. MOCK-4F2A9C, clearly not a real ID
    nonce: { type: String, required: true },  // one-time value the wallet must sign to log in
  },
  { timestamps: true },
);

export default mongoose.model("User", userSchema);
