import * as fs from "fs";
import * as path from "path";
import { ethers } from "hardhat";
import * as dotenv from "dotenv";

dotenv.config();

async function main() {
  console.log("Deploying DirectSendRouter...");

  // Get network info
  const network = await ethers.provider.getNetwork();
  console.log(`Network: ${network.name} (Chain ID: ${network.chainId})`);

  // Get deployer account
  const [deployer] = await ethers.getSigners();
  console.log(`Deployer: ${deployer.address}`);

  // Get deployment parameters from environment
  const usdtAddress = process.env.USDT_CONTRACT_ADDRESS;
  const treasuryAddress = process.env.TREASURY_ADDRESS;
  const fixedFeeString = process.env.FIXED_FEE_USDT || "1";

  if (!usdtAddress) {
    throw new Error("USDT_CONTRACT_ADDRESS not set in .env");
  }
  if (!treasuryAddress) {
    throw new Error("TREASURY_ADDRESS not set in .env");
  }

  // Convert fee to atomic units (6 decimals for USDT)
  const fixedFee = ethers.parseUnits(fixedFeeString, 6);

  console.log(`USDT Contract: ${usdtAddress}`);
  console.log(`Treasury Address: ${treasuryAddress}`);
  console.log(`Fixed Fee: ${fixedFeeString} USDT (${fixedFee} atomic units)`);

  // Get contract factory
  const DirectSendRouterFactory = await ethers.getContractFactory("DirectSendRouter");

  // Deploy contract
  console.log("\nDeploying contract...");
  const router = await DirectSendRouterFactory.deploy(usdtAddress, treasuryAddress, fixedFee);
  await router.waitForDeployment();

  const routerAddress = await router.getAddress();
  console.log(`DirectSendRouter deployed to: ${routerAddress}`);

  // Create deployment record
  const blockNumber = await ethers.provider.getBlockNumber();
  const deploymentRecord = {
    network: network.name,
    chainId: Number(network.chainId),
    address: routerAddress,
    deployer: deployer.address,
    usdtAddress: usdtAddress,
    treasuryAddress: treasuryAddress,
    fixedFee: fixedFee.toString(),
    timestamp: new Date().toISOString(),
    blockNumber: blockNumber,
  };

  // Save deployment record
  const deploymentsDir = path.join(__dirname, "..", "deployments");
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }

  const chainName = network.chainId === 97 ? "bsc-testnet" : network.chainId === 56 ? "bsc-mainnet" : `chain-${network.chainId}`;
  const deploymentFile = path.join(deploymentsDir, `${chainName}.json`);

  fs.writeFileSync(deploymentFile, JSON.stringify(deploymentRecord, null, 2));
  console.log(`\nDeployment record saved to: ${deploymentFile}`);

  // Display contract info
  console.log("\nContract Information:");
  console.log(`- USDT: ${await router.USDT()}`);
  console.log(`- Fixed Fee: ${await router.FIXED_FEE()}`);
  console.log(`- Treasury: ${await router.treasury()}`);
  console.log(`- Paused: ${await router.isPaused()}`);

  // Verify deployment on BSCscan if API key is available
  if (process.env.ETHERSCAN_API_KEY && (network.chainId === 97 || network.chainId === 56)) {
    console.log("\nVerifying contract on BSCscan...");
    try {
      await new Promise((resolve) => setTimeout(resolve, 5000)); // Wait 5 seconds for indexing

      await ethers.verify.verify({
        address: routerAddress,
        constructorArguments: [usdtAddress, treasuryAddress, fixedFee],
      });

      console.log("Contract verified on BSCscan!");
    } catch (error) {
      console.error("BSCscan verification failed:", error);
    }
  }

  console.log("\n✓ Deployment complete!");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
