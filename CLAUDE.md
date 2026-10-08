# Blue Carbon MRV v2 (final-year major project)

## What this project is
An ML-driven, blockchain-based Monitoring, Reporting and Verification (MRV) platform for blue carbon (mangroves first).
Satellites (Sentinel-1 radar + Sentinel-2 optical, GEDI lidar) estimate carbon. Credits are minted as NFTs on Polygon Amoy testnet.
CORE NOVELTY: additionality. A credit is only issued for carbon ABOVE a counterfactual baseline (what would have happened without the project).
The baseline is built by synthetic control and COMMITTED ON-CHAIN (commit-reveal) before outcomes exist, so it cannot be adjusted afterwards.
Also in the paper: SHAP explanations, ecosystem-specific carbon accounting, Sentinel-1 + Sentinel-2 fusion.
This is a fresh build. An older prototype exists (separate repo, reference only). Do not copy its code. Its ML was rule-based (lat/lon KNN on synthetic labels, flat CO2 formula), so it is not a model to follow.

## User flow
1. Farmer connects wallet, signs in with MOCK identity (no Aadhaar), draws a plot polygon on a Leaflet map, picks the ecosystem type.
2. Backend computes area (ha), checks overlap. ML classifier checks the satellite data agrees with the claimed ecosystem (accept / manual review / reject). Anomaly check runs.
3. ML builds a synthetic-control baseline: donor plots (similar, unrestored mangrove), weights fitted on pre-period, forecast the baseline for each future quarter.
4. Backend hashes the audit data and creates commitment = keccak256(abi.encode(plotKey, baselineMilli[], auditHash, salt)). Salt = 32 random bytes, secret until reveal. Only the commitment goes on-chain (registerPlot).
5. Each quarter: ML pulls Sentinel data, estimates carbon (tCO2e/ha) with uncertainty and SHAP reasons. Anomalies are held for review. Backend writes submitObservation on-chain.
6. Reveal and mint: backend pins the audit JSON to IPFS (Pinata), calls revealAndMint. The contract recomputes the hash (revert BaselineMismatch if different), computes additional carbon, mints an ERC-721 credit with the IPFS CID.
7. Anyone can verify: re-hash the audit file and compare with the on-chain commitment.

## Credit rule
Carbon is a STOCK (tCO2e/ha), not a flow. Never sum across cycles.
credit = max(observed - baseline - uncertainty, 0) x area_ha - already_issued, then hold back a buffer (ASSUMED 20%). Crediting period ASSUMED 8 quarters. Both are assumptions to confirm.
Baseline is a FORECAST made on day 0 (linear trend + quarterly seasonality of the synthetic series), never recomputed later. Ex-post comparison is used only as a forecast-quality metric in backtests.
On-chain numbers are integers x1000 (milli). Convert only in the Node backend.

## Carbon method (pool by pool)
1. Aboveground biomass: Random Forest regressor on Sentinel-1/2 features, trained on GEDI L4A (agbd, with agbd_se). Spatial CV; report RMSE honestly.
2. Carbon = biomass x carbon fraction (0.451 Simard or 0.47 IPCC; pick one, show the other as sensitivity).
3. Roots: root-to-shoot ratio from the IPCC 2013 Wetlands Supplement (read the exact value from the source).
4. Soil: starting stock from Sanderman 2018 mangrove soil map; count ZERO soil gain (conservative).
5. CO2e = tC x 44/12.
6. Uncertainty from spatial-CV error and GEDI agbd_se is deducted from credits.
Before citing VM0033 details, read the VM0033 v2.1 PDF.

## ML models (the plan)
1. Ecosystem classifier: Random Forest, classes mangrove / wetland / other, labels from ESA WorldCover 2021, inputs S2 + S1 + SRTM elevation. (BUILDING NOW)
2. Carbon estimator: Random Forest regressor, GEDI labels.
3. Anomaly detector: Isolation Forest.
4. SHAP (TreeExplainer): explains models 1 and 2. Not a model.
5. Synthetic control: constrained optimization (non-negative weights summing to 1, scipy SLSQP). Not a trained model. Placebo tests and a naive flat-baseline comparison are the paper's headline results.

## Data
- Sentinel-2: COPERNICUS/S2_SR_HARMONIZED, cloud mask with SCL, quarterly or yearly median. Bands B2,B3,B4,B8,B11 + NDVI, NDWI, EVI.
- Sentinel-1: COPERNICUS/S1_GRD, IW mode, VV and VH in dB, ONE orbit direction (DESCENDING). Average in linear units, then convert to dB.
- GEDI L4A: LARSE/GEDI/GEDI04_A_002_MONTHLY, Mar 2019 to Jul 2025. Keep l4_quality_flag == 1 and degrade_flag == 0.
- ESA WorldCover: ESA/WorldCover/v200. Codes: 95 mangrove, 90 herbaceous wetland, 80 water, 10 trees, 40 cropland.
- Elevation: USGS/SRTMGL1_003.

## Scope and honest limits (state these in the paper)
- Prototype is mangrove-only end to end. Seagrass has no free labels; it is future work.
- Study/training area: South India coast. Demo plot: Pichavaram, Tamil Nadu (placeholder, can change in ml/config.yaml). Plots outside the trained region must be rejected.
- GEDI biomass and WorldCover are themselves modelled products, not field truth. Report accuracy as agreement with them.
- The carbon model captures spatial differences better than year-to-year change. Changes smaller than the model error cannot be credited.
- Sentinel-2 history starts mid-2015; Sentinel-1B stopped in Dec 2021.
- The backend wallet is a trusted oracle in this prototype.

## Stack
- ml/: Python, earthengine-api, pandas, numpy, scipy, scikit-learn, shap, FastAPI. Terminal is fish; activate venv with: source venv/bin/activate.fish
- contracts/: Hardhat, Solidity 0.8.26, OpenZeppelin 5, Polygon Amoy (chainId 80002).
- backend/: Node 20, Express, MongoDB (Mongoose), ethers v6, Pinata IPFS. Routes: /api/projects, /api/mrv/quarterly-run/:plotId, reveal-and-mint, /api/system/status.
- web/: React, Vite, Tailwind, Leaflet, Recharts, MetaMask via ethers.

## Rules
- Never invent results or numbers. Only report what a real run printed.
- Spatial cross-validation only (GroupKFold on the "cell" column), never a random split.
- Missing data stays NaN. Never fill in fake values. Never silently fake a blockchain or ML result; if something is simulated, label it "simulation".
- No secrets in code or git. Commit .env.example only. Throwaway wallets only. No real personal data (no Aadhaar).
- Settings live in ml/config.yaml (Earth Engine project id, study area, dates), not in code.
- Keep code simple with short comments. The student must be able to explain every line to reviewers.
- Build in small steps, run each step, and explain it in plain language.

## Status
Done (2026-10-08): all 3 ML models + SHAP + synthetic control + placebo tests (ml/), MRVRegistry contract + tests (contracts/),
Express backend (backend/), React frontend (web/). Full flow tested end to end on local Hardhat with a demo Pichavaram plot.
Sourced constants: carbon fraction 0.451 (IPCC 2013 Wetlands Suppl. Table 4.2), root:shoot 0.29 tropical dry (Table 4.5).
Open decisions: uncertainty deduction rule (currently 63 tCO2e/ha incl. GEDI SE), climate zone for R:S, buffer 20%, 8 quarters.
Next: user fills MONGODB_URI (Atlas) and PINATA_JWT in backend/.env; Amoy deployment.
