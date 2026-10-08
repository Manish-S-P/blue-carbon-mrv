// Deploys MRVRegistry and writes address + ABI to deployments/<network>.json
// (the backend and web app read this file).
const fs = require("fs");
const path = require("path");
const { ethers, network, artifacts } = require("hardhat");

const BUFFER_BPS = 2000; // 20% buffer (ASSUMED, to confirm)

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log(`Deploying from ${deployer.address} on ${network.name}`);
  const reg = await ethers.deployContract("MRVRegistry", [deployer.address, BUFFER_BPS]);
  await reg.waitForDeployment();
  const address = await reg.getAddress();
  const { chainId } = await ethers.provider.getNetwork();
  const out = {
    network: network.name, chainId: Number(chainId), address, bufferBps: BUFFER_BPS,
    deployer: deployer.address, deployedAt: new Date().toISOString(),
    abi: (await artifacts.readArtifact("MRVRegistry")).abi,
  };
  const dir = path.join(__dirname, "..", "deployments");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${network.name}.json`), JSON.stringify(out, null, 2));
  console.log(`MRVRegistry at ${address} (chainId ${chainId})`);
}

main().catch((e) => { console.error(e); process.exit(1); });
