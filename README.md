# Blue Carbon MRV v2

ML + blockchain Monitoring, Reporting and Verification for mangrove blue carbon.
Credits are issued only for carbon **above a synthetic-control baseline that is committed on-chain before outcomes exist**.

```
web (React)  ──►  backend (Express, :4000)  ──►  ml (FastAPI, :8000) ──► Google Earth Engine
                        │  └──► MongoDB Atlas
                        ├──► MRVRegistry.sol (Hardhat :8545 / Polygon Amoy)
                        └──► Pinata IPFS
```

## Run locally (4 terminals, fish shell)

```fish
# 1. ML service
cd ml; source venv/bin/activate.fish; uvicorn api:app --port 8000

# 2. Local chain + contract
cd contracts; npx hardhat node
cd contracts; npm run deploy:local          # in another terminal, once

# 3. Backend  (copy .env.example -> .env and fill MONGODB_URI, JWT_SECRET, ORACLE_PRIVATE_KEY, PINATA_JWT)
cd backend; npm start

# 4. Web
cd web; npm run dev                          # http://localhost:5173
```

ORACLE_PRIVATE_KEY for local use = "Account #0" key printed by `npx hardhat node` (public test key, never use on a real network).
To be a verifier, add your MetaMask address to VERIFIER_ADDRESSES.
After restarting `hardhat node` the chain is empty: run `npm run deploy:local` again and clear old plots from MongoDB.

## Rebuild the ML models (order matters)

```fish
cd ml; source venv/bin/activate.fish
python build_training_table.py   # classifier pixels (WorldCover 2021 labels)
python classifier.py             # Model 1 + spatial CV report
python gedi_labels.py            # GEDI L4A shots + quarterly Sentinel features
python carbon_model.py           # Model 2 + uncertainty
python donors.py                 # donor pool + quarterly carbon series
python anomaly.py                # Model 3
python placebo.py                # headline placebo results
pytest -q
```

Reports are written to `ml/models/*_report.json` and shown on the web app's **Science** page.

## Tests
- `ml`: `pytest -q` (helpers, SLSQP weights, forecast)
- `contracts`: `npx hardhat test` (commit-reveal, BaselineMismatch, stock-not-flow, buffer)
- `backend`: `npm test` (canonical JSON, credit rule, commitment)

## Deploy to Polygon Amoy
Fill `contracts/.env` (throwaway PRIVATE_KEY with test POL), `npm run deploy:amoy`, then in `backend/.env` set
`RPC_URL=https://rpc-amoy.polygon.technology`, `DEPLOYMENT_FILE=../contracts/deployments/amoy.json`, `ORACLE_PRIVATE_KEY` = same key.
