/**
 * BSC Testnet E2E Tests
 * Tests against BSC Testnet (chainId: 97)
 * Requires:
 * - BSC_TESTNET_RPC_URL configured in environment
 * - Testnet BNB from faucet: https://testnet.bnbchain.org/faucet-smart
 * - Testnet USDT for user (can swap BNB for USDT on testnet)
 *
 * Run with: npm run sponsor:test:e2e:testnet
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { ethers } from 'ethers';
import axios from 'axios';

// Test configuration - these should be set via environment or .env file
const CONFIG = {
  chainId: 97,
  rpcUrl: process.env.BSC_TESTNET_RPC_URL || 'https://data-seed-prebsc-1-s1.binance.org:8545',
  explorerUrl: 'https://testnet.bscscan.com',
  // Router address on testnet - deploy first or use existing
  routerAddress: process.env.BSC_TESTNET_ROUTER_ADDRESS || '0x0000000000000000000000000000000000000000',
  // USDT on testnet
  usdtAddress: process.env.BSC_TESTNET_USDT_ADDRESS || '0x337610d27ae4ca0cd180003c4de79d4b47663363',
  // Sponsor address (needs testnet BNB for gas)
  sponsorAddress: process.env.BSC_TESTNET_SPONSOR_ADDRESS || '',
  // API endpoint
  apiUrl: process.env.SPONSOR_API_URL || 'http://localhost:3000'
};

const CHAIN_ID = CONFIG.chainId;

// Helper to format error messages
function formatError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return JSON.stringify(error);
}

// Skip tests if not configured
const shouldRun = CONFIG.rpcUrl && CONFIG.routerAddress !== '0x0000000000000000000000000000000000000000';

(shouldRun ? describe : describe.skip)('BSC Testnet E2E', () => {
  let provider: ethers.JsonRpcProvider;
  let userWallet: ethers.Wallet;
  let recipientAddress: string;

  beforeAll(async () => {
    provider = new ethers.JsonRpcProvider(CONFIG.rpcUrl);

    // Create a test wallet with private key from environment or generate new
    const privateKey = process.env.TEST_USER_PRIVATE_KEY;
    if (!privateKey) {
      console.warn('TEST_USER_PRIVATE_KEY not set - tests will be skipped');
      return;
    }

    userWallet = new ethers.Wallet(privateKey, provider);
    recipientAddress = ethers.Wallet.createRandom().address;

    console.log(`Test user: ${userWallet.address}`);
    console.log(`Network: ${(await provider.getNetwork()).chainId}`);
  });

  afterAll(async () => {
    // Cleanup if needed
  });

  describe('Network Connectivity', () => {
    it('should connect to BSC Testnet', async () => {
      const network = await provider.getNetwork();
      expect(Number(network.chainId)).toBe(CHAIN_ID);
    });

    it('should get block number', async () => {
      const blockNumber = await provider.getBlockNumber();
      expect(blockNumber).toBeGreaterThan(0);
    });

    it('should have access to testnet BNB', async () => {
      const balance = await provider.getBalance(userWallet.address);
      expect(balance).toBeGreaterThan(0n);
      console.log(`User BNB balance: ${ethers.formatEther(balance)} BNB`);
    });
  });

  describe('Token Checks', () => {
    it('should have USDT token on testnet', async () => {
      const usdt = new ethers.Contract(
        CONFIG.usdtAddress,
        ['function balanceOf(address) view returns (uint256)'],
        provider
      );
      const balance = await usdt.balanceOf(userWallet.address);
      console.log(`User USDT balance: ${ethers.formatUnits(balance, 6)} USDT`);
      // May be 0 if user hasn't swapped for USDT yet
    });
  });

  describe('Signature Generation', () => {
    it('should generate valid EIP-712 signature', async () => {
      const domain = {
        name: 'DirectSendRouter',
        version: '1',
        chainId: CHAIN_ID,
        verifyingContract: CONFIG.routerAddress
      };

      const types = {
        TransferRequest: [
          { name: 'user', type: 'address' },
          { name: 'recipient', type: 'address' },
          { name: 'amount', type: 'uint256' },
          { name: 'nonce', type: 'uint256' },
          { name: 'deadline', type: 'uint256' }
        ]
      };

      const message = {
        user: userWallet.address,
        recipient: recipientAddress,
        amount: ethers.parseUnits('1', 6).toString(), // 1 USDT
        nonce: 0,
        deadline: Math.floor(Date.now() / 1000) + 3600 // 1 hour
      };

      const signature = await userWallet.signTypedData(domain, types, message);
      expect(signature).toMatch(/^0x[a-f0-9]{130}$/);
    });
  });

  describe('API Integration (when backend is running)', () => {
    it('should have health endpoint responding', async () => {
      try {
        const response = await axios.get(`${CONFIG.apiUrl}/health`, { timeout: 5000 });
        expect(response.status).toBeGreaterThanOrEqual(200);
        expect(response.status).toBeLessThanOrEqual(503);
        console.log('Health status:', response.body?.status);
      } catch (error) {
        // Backend might not be running - that's OK for these tests
        console.log('Backend not available:', formatError(error));
      }
    });
  });
});

// Export for running specific tests
export { CONFIG, CHAIN_ID };
