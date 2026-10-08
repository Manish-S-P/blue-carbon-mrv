const { expect } = require("chai");
const { ethers } = require("hardhat");

const coder = ethers.AbiCoder.defaultAbiCoder();

function commitment(plotKey, baseline, auditHash, salt) {
  return ethers.keccak256(coder.encode(["bytes32", "uint256[]", "bytes32", "bytes32"], [plotKey, baseline, auditHash, salt]));
}

describe("MRVRegistry", function () {
  let reg, admin, farmer, other;
  const plotKey = ethers.id("plot-1");
  const auditHash = ethers.id("audit json");
  const salt = ethers.hexlify(ethers.randomBytes(32));
  // baseline 40.000 tCO2e/ha for all 8 quarters
  const baseline = Array(8).fill(40000n);
  const area = 10000n; // 10.000 ha

  beforeEach(async function () {
    [admin, farmer, other] = await ethers.getSigners();
    reg = await ethers.deployContract("MRVRegistry", [admin.address, 2000]);
    await reg.registerPlot(plotKey, farmer.address, commitment(plotKey, baseline, auditHash, salt), area, 8);
  });

  it("matches the off-chain commitment formula", async function () {
    expect(await reg.computeCommitment(plotKey, baseline, auditHash, salt)).to.equal(commitment(plotKey, baseline, auditHash, salt));
  });

  it("only the oracle can write", async function () {
    await expect(reg.connect(other).submitObservation(plotKey, 0, 1, 1)).to.be.revertedWithCustomError(reg, "AccessControlUnauthorizedAccount");
  });

  it("rejects a changed baseline (BaselineMismatch)", async function () {
    await reg.submitObservation(plotKey, 0, 60000, 5000);
    const lowered = [...baseline];
    lowered[0] = 30000n;
    await expect(reg.revealAndMint(plotKey, 0, lowered, auditHash, salt, "cid")).to.be.revertedWithCustomError(reg, "BaselineMismatch");
  });

  it("mints only carbon above baseline + uncertainty, minus 20% buffer", async function () {
    // observed 60 - baseline 40 - uncertainty 5 = 15 t/ha x 10 ha = 150 t gross -> 120 credited, 30 buffer
    await reg.submitObservation(plotKey, 0, 60000, 5000);
    await expect(reg.revealAndMint(plotKey, 0, baseline, auditHash, salt, "bafyCID"))
      .to.emit(reg, "CreditMinted").withArgs(1, plotKey, 0, 120000, 30000, "bafyCID");
    expect(await reg.ownerOf(1)).to.equal(farmer.address);
    expect(await reg.tokenURI(1)).to.equal("ipfs://bafyCID");
    expect(await reg.baselineOf(plotKey)).to.deep.equal(baseline);
  });

  it("stock not flow: later quarter only credits the increase over what was already issued", async function () {
    await reg.submitObservation(plotKey, 0, 60000, 5000); // 150 t gross
    await reg.submitObservation(plotKey, 1, 62000, 5000); // 170 t gross -> +20 t
    await reg.revealAndMint(plotKey, 0, baseline, auditHash, salt, "a");
    await expect(reg.revealAndMint(plotKey, 1, baseline, auditHash, salt, "b"))
      .to.emit(reg, "CreditMinted").withArgs(2, plotKey, 1, 16000, 4000, "b");
  });

  it("no credit when observed does not beat baseline + uncertainty, but baseline is still revealed", async function () {
    await reg.submitObservation(plotKey, 0, 44000, 5000);
    await expect(reg.revealAndMint(plotKey, 0, baseline, auditHash, salt, "x"))
      .to.emit(reg, "QuarterSettled").withArgs(plotKey, 0, 0, "x")
      .and.to.emit(reg, "BaselineRevealed");
    expect(await reg.nextTokenId()).to.equal(1n); // nothing minted
    expect((await reg.plots(plotKey)).revealed).to.equal(true);
  });

  it("a quarter can be settled only once", async function () {
    await reg.submitObservation(plotKey, 0, 60000, 5000);
    await reg.revealAndMint(plotKey, 0, baseline, auditHash, salt, "a");
    await expect(reg.revealAndMint(plotKey, 0, baseline, auditHash, salt, "a")).to.be.revertedWithCustomError(reg, "AlreadySettled");
  });

  it("observations are write-once and within the crediting period", async function () {
    await reg.submitObservation(plotKey, 0, 1, 1);
    await expect(reg.submitObservation(plotKey, 0, 2, 1)).to.be.revertedWithCustomError(reg, "ObservationExists");
    await expect(reg.submitObservation(plotKey, 8, 2, 1)).to.be.revertedWithCustomError(reg, "BadQuarter");
  });
});
