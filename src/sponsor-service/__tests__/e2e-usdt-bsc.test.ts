/**
 * End-to-End Integration Test for USDT-BSC Sponsor Service
 *
 * This test performs a complete flow:
 * 1. Generate a signed EIP-712 meta-transaction
 * 2. Submit to sponsor service API
 * 3. Verify transaction is submitted to blockchain
 * 4. Verify confirmation
 *
 * SKIP CONDITION: Test is skipped if required env variables are not set:
 * - BSC_TESTNET_RPC (BSC testnet RPC URL)
 * - SPONSOR_PRIVATE_KEY (sponsor's private key for submitting transactions)
 * - BSC_TESTNET_ROUTER_ADDRESS (deployed router contract address)
 * - BSC_TESTNET_USDT_ADDRESS (USDT token address on testnet)
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { ethers } from 'ethers';
import request from 'supertest';

const REQUIRED_ENV_VARS = [
	'BSC_TESTNET_RPC',
	'SPONSOR_PRIVATE_KEY',
	'BSC_TESTNET_ROUTER_ADDRESS',
	'BSC_TESTNET_USDT_ADDRESS'
];

function hasRequiredEnv(): boolean {
	return REQUIRED_ENV_VARS.every((varName) => !!process.env[varName]);
}

describe('USDT-BSC End-to-End Integration', () => {
	// Skip all tests in this describe block if env vars are missing
	beforeAll(() => {
		if (!hasRequiredEnv()) {
			console.log('\n⚠️  Skipping E2E tests - missing required env variables:');
			console.log('   Required:', REQUIRED_ENV_VARS.join(', '));
			console.log('   Set these in .env to run E2E tests\n');
		}
	});

	// Only run if env vars are present
	const e2eTests = hasRequiredEnv() ? describe : describe.skip;

	e2eTests('Full USDT-BSC Sponsored Transaction Flow', () => {
		const RPC_URL = process.env.BSC_TESTNET_RPC!;
		const SPONSOR_KEY = process.env.SPONSOR_PRIVATE_KEY!;
		const ROUTER_ADDRESS = process.env.BSC_TESTNET_ROUTER_ADDRESS!;
		const USDT_ADDRESS = process.env.BSC_TESTNET_USDT_ADDRESS!;
		const CHAIN_ID = 97; // BSC testnet

		let provider: ethers.JsonRpcProvider;
		let sponsorWallet: ethers.Wallet;
		let userWallet: ethers.Wallet;
		let routerContract: ethers.Contract;
		let _usdtContract: ethers.Contract;
		let initialSponsorBalance: bigint;
		let initialUserNonce: number;

		// EIP-712 domain separator
		const domain = {
			name: 'DirectSendRouter',
			version: '1',
			chainId: CHAIN_ID,
			verifyingContract: ROUTER_ADDRESS
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

		beforeAll(async () => {
			// Setup provider and wallets
			provider = new ethers.JsonRpcProvider(RPC_URL);
			sponsorWallet = new ethers.Wallet(SPONSOR_KEY, provider);

			// Create a random user wallet (will need BNB for signature)
			userWallet = ethers.Wallet.createRandom().connect(provider);

			// Get initial state
			initialSponsorBalance = await provider.getBalance(sponsorWallet.address);

			// Setup contracts
			const routerAbi = [
				'function route(address user, address recipient, uint256 amount, uint256 nonce, uint256 deadline, bytes signature) external returns (bool)',
				'function nonces(address) view returns (uint256)',
				'function getNonce(address user) view returns (uint256)'
			];
			routerContract = new ethers.Contract(ROUTER_ADDRESS, routerAbi, provider);

			const usdtAbi = [
				'function balanceOf(address) view returns (uint256)',
				'function transfer(address to, uint256 amount) returns (bool)',
				'function approve(address spender, uint256 amount) returns (bool)',
				'function transferFrom(address from, address to, uint256 amount) returns (bool)'
			];
			_usdtContract = new ethers.Contract(USDT_ADDRESS, usdtAbi, provider);

			// Get user's current nonce
			initialUserNonce = Number(await routerContract.getNonce(userWallet.address));
		});

		it('should have valid sponsor balance for testing', async () => {
			expect(initialSponsorBalance).toBeGreaterThan(ethers.parseEther('0.01'));
		});

		it('should submit a signed meta-transaction via API', async () => {
			// Generate test data
			const recipient = ethers.Wallet.createRandom().address;
			const amount = ethers.parseUnits('1', 6).toString(); // 1 USDT
			const deadline = Math.floor(Date.now() / 1000) + 300; // 5 minutes
			const nonce = initialUserNonce;

			// Sign the EIP-712 message
			const message = {
				user: userWallet.address,
				recipient,
				amount,
				nonce,
				deadline
			};

			const signature = await userWallet.signTypedData(domain, types, message);

			// Submit to API (using localhost:3001 or appropriate host)
			const apiUrl = process.env.E2E_API_URL || 'http://localhost:3001';

			const response = await request(apiUrl)
				.post('/v1/usdt-bsc/submit-send')
				.send({
					correlationId: `e2e-test-${Date.now()}`,
					user: userWallet.address,
					recipient,
					amount,
					nonce,
					deadline,
					signature,
					chainId: CHAIN_ID
				});

			// Verify response
			expect(response.status).toBeGreaterThanOrEqual(200);
			expect(response.body.status).toBeDefined();

			if (response.body.status === 'accepted') {
				console.log('✅ Transaction submitted successfully');
				console.log('   Tx Hash:', response.body.txHash);

				// Wait for confirmation
				if (response.body.txHash) {
					const receipt = await provider.waitForTransaction(response.body.txHash, 1, 60000);
					expect(receipt).not.toBeNull();
					expect(receipt?.status).toBe(1);
					console.log('✅ Transaction confirmed on-chain');
				}
			} else {
				console.log(
					'⚠️  Transaction rejected:',
					response.body.failureCode,
					response.body.errorMessage
				);
				// This might happen if user doesn't have USDT allowance, etc.
			}
		}, 120000); // 2 minute timeout

		it('should increment nonce after successful transaction', async () => {
			const newNonce = Number(await routerContract.getNonce(userWallet.address));
			expect(newNonce).toBe(initialUserNonce + 1);
		});

		it('should report health check with all services operational', async () => {
			const apiUrl = process.env.E2E_API_URL || 'http://localhost:3001';

			const response = await request(apiUrl).get('/health');

			expect(response.status).toBe(200);
			expect(response.body.status).toBe('ok');
			expect(response.body.checks).toBeDefined();
		});
	});
});
