require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

const { PRIVATE_KEY, AMOY_RPC_URL } = process.env;

module.exports = {
  solidity: { version: "0.8.26", settings: { evmVersion: "cancun", viaIR: true, optimizer: { enabled: true, runs: 200 } } },
  networks: {
    localhost: { url: "http://127.0.0.1:8545" },
    // Polygon Amoy testnet (chainId 80002). Throwaway key only, set in .env.
    amoy: {
      url: AMOY_RPC_URL || "https://rpc-amoy.polygon.technology",
      chainId: 80002,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
    },
  },
};
