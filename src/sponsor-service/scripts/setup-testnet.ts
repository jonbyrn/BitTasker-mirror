/**
 * BSC Testnet Setup Script
 *
 * Usage:
 *   npx tsx scripts/setup-testnet.ts
 *   npx tsx scripts/setup-testnet.ts --swap  # Swap BNB to USDT
 *
 * This script helps set up the environment for E2E testing on BSC Testnet.
 */

import { ethers } from 'ethers';
import * as fs from 'fs';
import * as path from 'path';

// PancakeSwap Router on BSC Testnet
const PANCAKE_ROUTER_TESTNET = '0xD99D1c33F9F3444f3Ae393aD49cE46c5d982d7C5'; // Testnet router
const WBNB_TESTNET = '0xae13d989daC2f14dDa77FA1B2405bce57bDeDAaB'; // WBNB on testnet

const TESTNET_CONFIG = {
  name: 'BSC Testnet',
  chainId: 97,
  rpcUrl: process.env.BSC_TESTNET_RPC_URL || 'https://data-seed-prebsc-1-s1.binance.org:8545',
  explorerUrl: 'https://testnet.bscscan.com',
  usdtAddress: '0x337610d27ae4ca0cd180003c4de79d4b47663363',
};

const FAUCET_URL = 'https://testnet.bnbchain.org/faucet-smart';

async function main() {
  console.log('\n🔧 BSC Testnet E2E Setup\n');
  console.log('='.repeat(50));

  // Step 1: Test RPC connectivity
  console.log('\n📡 Testing RPC connectivity...');
  const provider = new ethers.JsonRpcProvider(TESTNET_CONFIG.rpcUrl);

  try {
    const network = await provider.getNetwork();
    const blockNumber = await provider.getBlockNumber();
    console.log(`✅ Connected to ${TESTNET_CONFIG.name}`);
    console.log(`   Chain ID: ${Number(network.chainId)}`);
    console.log(`   Block: ${blockNumber}`);
  } catch (error) {
    console.log('❌ Failed to connect to testnet RPC');
    console.log(`   URL: ${TESTNET_CONFIG.rpcUrl}`);
    console.log(`   Error: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }

  // Step 2: Generate wallet
  console.log('\n💼 Generating test wallet...');
  const wallet = ethers.Wallet.createRandom();
  console.log(`   Address: ${wallet.address}`);
  console.log(`   Private Key: ${wallet.privateKey}`);

  // Check balance
  const balance = await provider.getBalance(wallet.address);
  console.log(`   BNB Balance: ${ethers.formatEther(balance)} BNB`);

  // Step 3: Swap BNB to USDT if requested (optional --swap flag)
  const shouldSwap = process.argv.includes('--swap');
  if (shouldSwap && balance > 0n) {
    console.log('\n🔄 Swapping BNB to USDT...');
    try {
      const walletWithProvider = new ethers.Wallet(wallet.privateKey, provider);

      // PancakeSwap Router ABI (swapExactETHForTokens)
      const routerABI = [
        'function swapExactETHForTokens(uint amountOutMin, address[] path, address to, uint deadline) payable returns (uint[] amounts)',
        'function getAmountsOut(uint amountIn, address[] path) view returns (uint[] amounts)'
      ];
      const router = new ethers.Contract(PANCAKE_ROUTER_TESTNET, routerABI, walletWithProvider);

      // Get expected output amount
      const amountIn = balance; // Swap all BNB
      const path = [WBNB_TESTNET, TESTNET_CONFIG.usdtAddress];
      const amounts = await router.getAmountsOut(amountIn, path);
      const amountOutMin = amounts[1] * 95n / 100n; // 5% slippage tolerance

      console.log(`   Swapping ${ethers.formatEther(amountIn)} BNB for ~${ethers.formatUnits(amounts[1], 6)} USDT`);

      // Execute swap
      const tx = await router.swapExactETHForTokens(
        amountOutMin,
        path,
        wallet.address,
        Math.floor(Date.now() / 1000) + 600 // 10 min deadline
        , { value: amountIn }
      );

      console.log(`   Transaction: ${tx.hash}`);
      const receipt = await tx.wait();
      console.log(`   ✅ Swap confirmed in block ${receipt?.blockNumber}`);

      // Check USDT balance
      const usdtABI = ['function balanceOf(address) view returns (uint256)'];
      const usdt = new ethers.Contract(TESTNET_CONFIG.usdtAddress, usdtABI, provider);
      const usdtBalance = await usdt.balanceOf(wallet.address);
      console.log(`   USDT Balance: ${ethers.formatUnits(usdtBalance, 6)} USDT`);

    } catch (error) {
      console.log(`   ❌ Swap failed: ${error instanceof Error ? error.message : String(error)}`);
      console.log(`   Fall back to manual swap at https://testnet.pancakeswap.com/swap`);
    }
  } else if (shouldSwap && balance === 0n) {
    console.log('\n⚠️ No BNB balance to swap. Fund the wallet first from the faucet.');
  }

  // Step 4: Write to .env.testnet file
  const envFilePath = path.join(process.cwd(), '.env.testnet');
  const envContent = `# BSC Testnet Configuration
# Generated on ${new Date().toISOString()}

BSC_TESTNET_RPC_URL=${TESTNET_CONFIG.rpcUrl}
BSC_TESTNET_USDT_ADDRESS=${TESTNET_CONFIG.usdtAddress}
TEST_USER_PRIVATE_KEY=${wallet.privateKey}
BSC_TESTNET_SPONSOR_ADDRESS=${wallet.address}
# BSC_TESTNET_ROUTER_ADDRESS=0x... (after deployment)
# SPONSOR_PRIVATE_KEY=${wallet.privateKey} (for sponsor)
`;

  fs.writeFileSync(envFilePath, envContent);
  console.log(`\n📝 Saved to ${envFilePath}`);

  // Step 5: Show funding instructions
  console.log('\n💰 Next Steps:');
  console.log('─'.repeat(50));
  console.log(`\n1. Get testnet BNB:`);
  console.log(`   URL: ${FAUCET_URL}`);
  console.log(`   Your address: ${wallet.address}`);

  console.log(`\n2. Get testnet USDT:`);
  console.log(`   URL: https://testnet.pancakeswap.com/swap?inputCurrency=BNB&outputCurrency=${TESTNET_CONFIG.usdtAddress}`);
  console.log(`   Swap some BNB for USDT`);

  console.log(`\n3. Deploy router (if needed):`);
  console.log(`   cd ../../contracts`);
  console.log(`   npx hardhat run scripts/deploy-bsc-testnet.ts`);

  // Step 6: Print env vars summary
  console.log('\n📝 Environment Variables (saved to .env.testnet):');
  console.log('─'.repeat(50));
  console.log(`TEST_USER_PRIVATE_KEY=${wallet.privateKey}`);
  console.log(`BSC_TESTNET_SPONSOR_ADDRESS=${wallet.address}`);
  console.log(`BSC_TESTNET_USDT_ADDRESS=${TESTNET_CONFIG.usdtAddress}`);

  console.log('✅ Setup complete!\n');
  console.log('To run E2E tests:');
  console.log('   source .env.testnet && npm run sponsor:test:e2e:testnet\n');
}

main().catch(console.error);
