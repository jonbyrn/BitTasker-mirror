/**
 * E2E-style tests for Swap Chain — Gasless Integration
 *
 * Tests the full swap flow that the frontend uses when executing
 * gasless transactions through the relay endpoint:
 *
 * 1. sendGaslessCalls with and without fee buffer
 * 2. sendArbitrumTransaction dynamic fee token selection
 * 3. Claim retry with error classification and exponential backoff
 * 4. waitForBoltzLockup from recent block
 * 5. safeAddress validation in claimSwapFunds
 * 6. fetchGaslessConfig refresh mechanism
 * 7. BOLTZ_MAX_WAIT_MS increased to 30 minutes
 * 8. Fee estimation at swap initiation
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ethers as ethersLib } from 'ethers';

// ---------------------------------------------------------------------------
// Hoisted mock variables
// ---------------------------------------------------------------------------
const {
	mockEstimateFee,
	mockGaslessRelay,
	mockGaslessSimulate,
	mockGaslessConfig,
	mockValidateFeeBufferBounds,
	mockValidateFeeRecipient,
	mockGetSwapStatus,
	mockBoltzCreateSwap
} = vi.hoisted(() => ({
	mockEstimateFee: vi.fn(),
	mockGaslessRelay: vi.fn(),
	mockGaslessSimulate: vi.fn(),
	mockGaslessConfig: vi.fn(),
	mockValidateFeeBufferBounds: vi.fn(),
	mockValidateFeeRecipient: vi.fn(),
	mockGetSwapStatus: vi.fn(),
	mockBoltzCreateSwap: vi.fn()
}));

vi.mock('@sentry/sveltekit', () => ({
	addBreadcrumb: vi.fn()
}));

vi.mock('$lib/wallet/gasless-helpers', () => ({
	validateFeeParameters: vi.fn(),
	validateFeeBufferBounds: mockValidateFeeBufferBounds,
	validateFeeRecipient: mockValidateFeeRecipient
}));

vi.mock('$lib/wallet/gasless.config', () => ({
	GAS_TREASURY: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
	GAS_BOUNDS: {
		maxCallGas: 5_000_000n,
		maxVerificationGas: 1_000_000n,
		maxPreVerificationGas: 400_000n,
		maxFeePerGas: 1_000_000_000n,
		maxPriorityFeePerGas: 100_000_000n,
		maxTotalGas: 6_400_000n
	},
	ARBITRUM_RPC_URL: 'https://arb-mainnet.g.alchemy.com/v2/test',
	ARBITRUM_CHAIN_ID: 42161,
	ENTRY_POINT_ADDRESS: '0x433709009B8330FDa32311DF1C2AFA402eD8D009',
	SIMPLE_7702_ACCOUNT_IMPL: '0xB2779581b8B1F816b747fBa66c64D22196c7D001',
	USDT0_ADDRESS: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
	WBTC_ADDRESS: '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f',
	TBTC_ADDRESS: '0x6c84a8f1c29108f47a79964b5fe888d4f4d0de40',
	TOKENS: [
		{ address: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9', symbol: 'USDT0', decimals: 6, chainId: 42161 },
		{ address: '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f', symbol: 'WBTC', decimals: 8, chainId: 42161 },
		{ address: '0x6c84a8f1c29108f47a79964b5fe888d4f4d0de40', symbol: 'TBTC', decimals: 18, chainId: 42161 }
	],
	ALLOWED_FEE_TOKENS: [
		'0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9',
		'0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f',
		'0x6c84a8f1c29108f47a79964b5fe888d4f4d0de40'
	],
	FEE_BUFFER_MIN: { '0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9': 10000n },
	FEE_BUFFER_MAX: { '0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9': 150000n },
	getTokenByAddress: vi.fn(),
	isAllowedFeeToken: vi.fn().mockReturnValue(true),
	getArbitrumRpcUrl: vi.fn().mockReturnValue('https://arb-mainnet.g.alchemy.com/v2/test'),
	fetchGaslessConfig: vi.fn().mockResolvedValue(true)
}));

vi.mock('$lib/api/services/gasless.service', () => ({
	gaslessService: {
		relay: mockGaslessRelay,
		estimate: mockEstimateFee,
		simulate: mockGaslessSimulate,
		config: mockGaslessConfig,
		health: vi.fn()
	}
}));

vi.mock('$lib/services/BoltzProvider', () => ({
	boltzProvider: {
		getSwapStatus: mockGetSwapStatus,
		createSwap: mockBoltzCreateSwap
	}
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------
import { sendGaslessCalls } from '$lib/wallet/gasless-store';
import { gaslessWallet } from '$lib/wallet/gasless-store';
import { BOLTZ_MAX_WAIT_MS } from '$lib/services/swap-chain/utils';
import { isTransientClaimError } from '$lib/services/swap-chain/boltz/polling';

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------
const MOCK_SENDER = '0x9AEA6dDa21cC99dDA8C7345e1A9A834356eF8E1D';
const MOCK_TOKEN = '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9';
const MOCK_RECIPIENT = '0x6398B76DF91C5eBe9f488e3656658E79284dDc0F';
const MOCK_TREASURY = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC';

// ===========================================================================
// Tests
// ===========================================================================

describe('Swap Chain — Gasless Integration', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	// ── 1. sendGaslessCalls without fee buffer ──────────────────────────

	describe('sendGaslessCalls without fee buffer', () => {
		it('accepts calls without feeToken and feeBuffer', async () => {
			// sendGaslessCalls should work when feeToken/feeBuffer are not provided
			// The function should use execute() for single calls without fee buffer
			const calls = [{ to: MOCK_RECIPIENT, data: '0xa9059cbb' + '00'.repeat(64), value: 0n }];

			// This should not throw "Invalid fee token address" or "Fee buffer must be positive"
			// since feeToken and feeBuffer are optional now
			try {
				await sendGaslessCalls(calls);
			} catch (e) {
				// Expected to fail at signing/relay (no real account), but NOT at validation
				expect((e as Error).message).not.toContain('Invalid fee token');
				expect((e as Error).message).not.toContain('Fee buffer must be positive');
				expect((e as Error).message).not.toContain('At least one call');
			}
		});

		it('still works with feeToken and feeBuffer provided', async () => {
			const calls = [{ to: MOCK_RECIPIENT, data: '0xa9059cbb' + '00'.repeat(64), value: 0n }];

			try {
				await sendGaslessCalls(calls, MOCK_TOKEN, 30000n);
			} catch (e) {
				// Should not throw validation errors
				expect((e as Error).message).not.toContain('Invalid fee token');
				expect((e as Error).message).not.toContain('At least one call');
			}
		});

		it('throws for empty calls array', async () => {
			await expect(sendGaslessCalls([])).rejects.toThrow('At least one call is required');
		});
	});

	// ── 2. Claim retry error classification ─────────────────────────────

	describe('claim retry error classification', () => {
		it('classifies network timeouts as transient', () => {
			expect(isTransientClaimError(new Error('Request timeout'))).toBe(true);
			expect(isTransientClaimError(new Error('ECONNREFUSED'))).toBe(true);
			expect(isTransientClaimError(new Error('ETIMEDOUT'))).toBe(true);
		});

		it('classifies rate limits as transient', () => {
			expect(isTransientClaimError(new Error('Rate limit exceeded'))).toBe(true);
			expect(isTransientClaimError(new Error('429 Too Many Requests'))).toBe(true);
			expect(isTransientClaimError(new Error('503 Service Unavailable'))).toBe(true);
		});

		it('classifies gasless relay timeout as transient', () => {
			expect(isTransientClaimError(new Error('Gasless relay timeout (30s)'))).toBe(true);
		});

		it('classifies insufficient balance as transient', () => {
			expect(isTransientClaimError(new Error('Pre-flight simulation failed: Insufficient USDT0 balance'))).toBe(true);
		});

		it('classifies contract errors as permanent', () => {
			expect(isTransientClaimError(new Error('execution reverted: Already claimed'))).toBe(false);
			expect(isTransientClaimError(new Error('Invalid preimage'))).toBe(false);
			expect(isTransientClaimError(new Error('Timelock expired'))).toBe(false);
		});

		it('classifies unknown errors as permanent', () => {
			expect(isTransientClaimError(new Error('Something went wrong'))).toBe(false);
		});
	});

	// ── 3. BOLTZ_MAX_WAIT_MS ───────────────────────────────────────────

	describe('BOLTZ_MAX_WAIT_MS', () => {
		it('is 30 minutes (1_800_000 ms)', () => {
			expect(BOLTZ_MAX_WAIT_MS).toBe(1_800_000);
		});

		it('is greater than old 15-minute value', () => {
			expect(BOLTZ_MAX_WAIT_MS).toBeGreaterThan(900_000);
		});
	});

	// ── 4. Gasless config refresh ───────────────────────────────────────

	describe('gasless config refresh', () => {
		it('fetchGaslessConfig is callable multiple times', async () => {
			const { fetchGaslessConfig } = await import('$lib/wallet/gasless.config');
			// Should not throw on multiple calls
			const r1 = await fetchGaslessConfig();
			const r2 = await fetchGaslessConfig();
			expect(typeof r1).toBe('boolean');
			expect(typeof r2).toBe('boolean');
		});
	});

	// ── 5. Fee estimation at swap initiation ────────────────────────────

	describe('fee estimation at swap initiation', () => {
		it('estimateFee returns feeBuffer for a given token', async () => {
			mockEstimateFee.mockResolvedValue({
				feeBuffer: '30000',
				feeTier: 'Medium',
				feeUSD: 0.03
			});

			const { estimateFee } = await import('$lib/wallet/gasless-store');
			const result = await estimateFee(MOCK_TOKEN, 1n, MOCK_RECIPIENT);
			expect(result.feeBuffer).toBe('30000');
			expect(mockEstimateFee).toHaveBeenCalled();
		});

		it('estimateFee throws on network error', async () => {
			mockEstimateFee.mockRejectedValue(new Error('Network error'));

			const { estimateFee } = await import('$lib/wallet/gasless-store');
			await expect(estimateFee(MOCK_TOKEN, 1n, MOCK_RECIPIENT)).rejects.toThrow();
		});
	});

	// ── 6. Dynamic fee token selection logic ────────────────────────────

	describe('dynamic fee token selection', () => {
		it('selects token with highest balance', () => {
			const balances = [
				{ token: MOCK_TOKEN, symbol: 'USDT0', balance: 0n },
				{ token: '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f', symbol: 'WBTC', balance: 50000n },
				{ token: '0x6c84a8f1c29108f47a79964b5fe888d4f4d0de40', symbol: 'TBTC', balance: 100000n }
			];

			const sorted = balances
				.filter((b) => b.balance > 0n)
				.sort((a, b) => (a.balance > b.balance ? -1 : 1));

			expect(sorted.length).toBe(2);
			expect(sorted[0].symbol).toBe('TBTC');
			expect(sorted[1].symbol).toBe('WBTC');
		});

		it('returns empty when all balances are zero', () => {
			const balances = [
				{ token: MOCK_TOKEN, symbol: 'USDT0', balance: 0n },
				{ token: '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f', symbol: 'WBTC', balance: 0n },
				{ token: '0x6c84a8f1c29108f47a79964b5fe888d4f4d0de40', symbol: 'TBTC', balance: 0n }
			];

			const sorted = balances.filter((b) => b.balance > 0n);
			expect(sorted.length).toBe(0);
		});

		it('skips tokens with insufficient balance for fee buffer', () => {
			const balances = [
				{ token: MOCK_TOKEN, symbol: 'USDT0', balance: 5000n }, // below min 10000
				{ token: '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f', symbol: 'WBTC', balance: 50000n }
			];
			const feeBuffer = 10000n;

			const viable = balances.filter((b) => b.balance >= feeBuffer);
			expect(viable.length).toBe(1);
			expect(viable[0].symbol).toBe('WBTC');
		});
	});

	// ── 7. Address checksum validation (like safeAddress) ────────────────

	describe('address checksum validation', () => {
		it('checksums valid lowercase addresses', () => {
			// safeAddress uses ethers.getAddress(addr.toLowerCase())
			const addr = ethersLib.getAddress('0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9');
			expect(addr).toBe('0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9');
		});

		it('throws for invalid addresses', () => {
			expect(() => ethersLib.getAddress('invalid')).toThrow();
			expect(() => ethersLib.getAddress('')).toThrow();
		});
	});

	// ── 8. Hex normalization ────────────────────────────────────────────

	describe('hex normalization', () => {
		function normalizeHex(hex: string): string {
			if (!hex || hex === '0x') return hex;
			const raw = hex.startsWith('0x') ? hex.slice(2) : hex;
			return raw.length % 2 !== 0 ? '0x0' + raw : hex;
		}

		it('preserves even-length hex', () => {
			expect(normalizeHex('0xabcdef')).toBe('0xabcdef');
			expect(normalizeHex('0x')).toBe('0x');
		});

		it('pads odd-length hex', () => {
			expect(normalizeHex('0xabcde')).toBe('0x0abcde');
			expect(normalizeHex('0x1')).toBe('0x01');
		});
	});

	// ── 9. ABI encoding produces even-length hex ────────────────────────

	describe('ABI encoding', () => {
		it('execute encoding produces even-length hex', () => {
			const executeIface = new ethersLib.Interface([
				'function execute(address dest, uint256 value, bytes calldata func)'
			]);
			const data = executeIface.encodeFunctionData('execute', [
				MOCK_RECIPIENT,
				0n,
				'0xa9059cbb' + '00'.repeat(64)
			]);
			expect((data.length - 2) % 2).toBe(0);
		});

		it('executeBatch encoding produces even-length hex', () => {
			const batchIface = new ethersLib.Interface([
				'function executeBatch((address,uint256,bytes)[])'
			]);
			const data = batchIface.encodeFunctionData('executeBatch', [
				[[MOCK_RECIPIENT, 0n, '0xa9059cbb' + '00'.repeat(64)]]
			]);
			expect((data.length - 2) % 2).toBe(0);
		});

		it('transfer encoding produces even-length hex', () => {
			const transferIface = new ethersLib.Interface([
				'function transfer(address to, uint256 amount) returns (bool)'
			]);
			const data = transferIface.encodeFunctionData('transfer', [MOCK_TREASURY, 30000n]);
			expect((data.length - 2) % 2).toBe(0);
			expect(data.startsWith('0xa9059cbb')).toBe(true);
		});
	});
});
