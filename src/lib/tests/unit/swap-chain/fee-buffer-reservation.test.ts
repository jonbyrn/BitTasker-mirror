/**
 * Tests for Swap Chain — Fee Buffer Reservation
 *
 * Validates that swap executors correctly cap the swap input amount to
 * `balance - relayFeeBuffer` when the swap input token is also used for
 * gasless fee payment. Without this reservation, the executeBatch would
 * have: [approve, swap(full_balance), feeTransfer] — the swap pulls all
 * tokens, leaving nothing for the fee transfer, causing the entire UserOp
 * to revert with ExecuteError at the last call index.
 *
 * Covers ALL routes: LI.FI, Symbiosis, and Uniswap V3.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ─────────────────────────────────────────────────────────────────

const mockQueryERC20Balance = vi.hoisted(() => vi.fn());

vi.mock('$lib/services/swap-chain/tx-helpers', () => ({
	queryERC20Balance: mockQueryERC20Balance
}));

vi.mock('@sentry/sveltekit', () => ({
	addBreadcrumb: vi.fn(),
	captureException: vi.fn()
}));

// ── Import under test ─────────────────────────────────────────────────────

import { capBalanceToWalletMax } from '$lib/services/swap-chain/executors/helpers';

// ── Constants ─────────────────────────────────────────────────────────────

const USDT0_ADDRESS = '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9';
const WBTC_ADDRESS = '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f';
const TBTC_ADDRESS = '0x6c84a8f1c29108F47a79964b5Fe888D4f4D0dE40';
const USER_ADDRESS = '0xA511CFDda94af5ACfBA429Ea70CBe1c0727D7C31';
const CHAIN = 'arbitrum' as const;

// FEE_BUFFER_MAX values from gasless.config.ts
const FEE_BUFFER_MAX_USDT0 = 150_000n; // $0.15 max
const FEE_BUFFER_MAX_WBTC = 230n;
const FEE_BUFFER_MAX_TBTC = 2_500_000_000_000n; // ≈ $0.16 at $65K BTC

// ── Tests ─────────────────────────────────────────────────────────────────

describe('capBalanceToWalletMax — fee buffer reservation', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('returns requested amount when balance is sufficient and no reserve', async () => {
		mockQueryERC20Balance.mockResolvedValue(1_667_676n);

		const result = await capBalanceToWalletMax({
			tokenAddress: USDT0_ADDRESS,
			userAddress: USER_ADDRESS,
			chain: CHAIN,
			requestedAmount: 1_667_676n,
			label: 'LI.FI'
		});

		expect(result.error).toBeNull();
		expect(result.data).toBe(1_667_676n);
	});

	it('caps amount to balance minus fee buffer (the USDT0→RBTC bug scenario)', async () => {
		mockQueryERC20Balance.mockResolvedValue(1_667_676n);

		const result = await capBalanceToWalletMax({
			tokenAddress: USDT0_ADDRESS,
			userAddress: USER_ADDRESS,
			chain: CHAIN,
			requestedAmount: 1_667_676n,
			label: 'LI.FI',
			reserveAmount: 50_001n
		});

		expect(result.error).toBeNull();
		expect(result.data).toBe(1_617_675n);
	});

	it('returns error when balance is less than reserve (insufficient for fee)', async () => {
		mockQueryERC20Balance.mockResolvedValue(5_000n);

		const result = await capBalanceToWalletMax({
			tokenAddress: USDT0_ADDRESS,
			userAddress: USER_ADDRESS,
			chain: CHAIN,
			requestedAmount: 5_000n,
			label: 'LI.FI',
			reserveAmount: 50_001n
		});

		expect(result.error).not.toBeNull();
		expect(result.error!.message).toContain('Insufficient balance');
		expect(result.data).toBe(0n);
	});

	it('returns 0n when balance equals reserve exactly', async () => {
		mockQueryERC20Balance.mockResolvedValue(50_001n);

		const result = await capBalanceToWalletMax({
			tokenAddress: USDT0_ADDRESS,
			userAddress: USER_ADDRESS,
			chain: CHAIN,
			requestedAmount: 50_001n,
			label: 'LI.FI',
			reserveAmount: 50_001n
		});

		expect(result.error).not.toBeNull();
		expect(result.data).toBe(0n);
	});

	it('returns requested amount when balance has plenty of headroom', async () => {
		mockQueryERC20Balance.mockResolvedValue(10_000_000n);

		const result = await capBalanceToWalletMax({
			tokenAddress: USDT0_ADDRESS,
			userAddress: USER_ADDRESS,
			chain: CHAIN,
			requestedAmount: 1_667_676n,
			label: 'LI.FI',
			reserveAmount: 50_001n
		});

		expect(result.error).toBeNull();
		expect(result.data).toBe(1_667_676n);
	});

	it('returns error when RPC call fails', async () => {
		mockQueryERC20Balance.mockResolvedValue(null);

		const result = await capBalanceToWalletMax({
			tokenAddress: USDT0_ADDRESS,
			userAddress: USER_ADDRESS,
			chain: CHAIN,
			requestedAmount: 1_667_676n,
			label: 'LI.FI',
			reserveAmount: 50_001n
		});

		expect(result.error).not.toBeNull();
		expect(result.error!.message).toContain('RPC error');
		expect(result.data).toBe(1_667_676n);
	});

	it('works with tBTC (18 decimals) fee buffer', async () => {
		mockQueryERC20Balance.mockResolvedValue(1_000_000_000_000_000n);

		const result = await capBalanceToWalletMax({
			tokenAddress: TBTC_ADDRESS,
			userAddress: USER_ADDRESS,
			chain: CHAIN,
			requestedAmount: 1_000_000_000_000_000n,
			label: 'LI.FI',
			reserveAmount: 150_000_000_000n
		});

		expect(result.error).toBeNull();
		expect(result.data).toBe(1_000_000_000_000_000n - 150_000_000_000n);
	});

	it('works with WBTC (8 decimals) fee buffer', async () => {
		mockQueryERC20Balance.mockResolvedValue(10_000n);

		const result = await capBalanceToWalletMax({
			tokenAddress: WBTC_ADDRESS,
			userAddress: USER_ADDRESS,
			chain: CHAIN,
			requestedAmount: 10_000n,
			label: 'LI.FI',
			reserveAmount: 16n
		});

		expect(result.error).toBeNull();
		expect(result.data).toBe(9_984n);
	});
});

// ── FEE_BUFFER_MAX as safety reserve ──────────────────────────────────────

describe('FEE_BUFFER_MAX safety reserve — all tokens', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('USDT0: FEE_BUFFER_MAX ($0.15) reserves enough for any fee tier', async () => {
		// User has $1.67 USDT0, FEE_BUFFER_MAX = 150,000 ($0.15)
		// Swap capped to 1,667,676 - 150,000 = 1,517,676
		mockQueryERC20Balance.mockResolvedValue(1_667_676n);

		const result = await capBalanceToWalletMax({
			tokenAddress: USDT0_ADDRESS,
			userAddress: USER_ADDRESS,
			chain: CHAIN,
			requestedAmount: 1_667_676n,
			label: 'LI.FI',
			reserveAmount: FEE_BUFFER_MAX_USDT0
		});

		expect(result.error).toBeNull();
		expect(result.data).toBe(1_517_676n);

		// Verify: swap + max fee ≤ balance
		expect(result.data + FEE_BUFFER_MAX_USDT0).toBeLessThanOrEqual(1_667_676n);
	});

	it('WBTC: FEE_BUFFER_MAX reserves enough', async () => {
		mockQueryERC20Balance.mockResolvedValue(100_000n); // 0.001 WBTC

		const result = await capBalanceToWalletMax({
			tokenAddress: WBTC_ADDRESS,
			userAddress: USER_ADDRESS,
			chain: CHAIN,
			requestedAmount: 100_000n,
			label: 'UniswapV3',
			reserveAmount: FEE_BUFFER_MAX_WBTC
		});

		expect(result.error).toBeNull();
		expect(result.data).toBe(100_000n - FEE_BUFFER_MAX_WBTC);
	});

	it('tBTC: FEE_BUFFER_MAX reserves enough', async () => {
		mockQueryERC20Balance.mockResolvedValue(5_000_000_000_000n); // 0.00005 tBTC

		const result = await capBalanceToWalletMax({
			tokenAddress: TBTC_ADDRESS,
			userAddress: USER_ADDRESS,
			chain: CHAIN,
			requestedAmount: 5_000_000_000_000n,
			label: 'Symbiosis',
			reserveAmount: FEE_BUFFER_MAX_TBTC
		});

		expect(result.error).toBeNull();
		expect(result.data).toBe(5_000_000_000_000n - FEE_BUFFER_MAX_TBTC);
	});

	it('FEE_BUFFER_MAX is always ≤ balance for small amounts', async () => {
		// User has only $0.20 USDT0 — FEE_BUFFER_MAX ($0.15) is 75% of balance
		mockQueryERC20Balance.mockResolvedValue(200_000n);

		const result = await capBalanceToWalletMax({
			tokenAddress: USDT0_ADDRESS,
			userAddress: USER_ADDRESS,
			chain: CHAIN,
			requestedAmount: 200_000n,
			label: 'LI.FI',
			reserveAmount: FEE_BUFFER_MAX_USDT0
		});

		expect(result.error).toBeNull();
		expect(result.data).toBe(50_000n); // Only $0.05 available for swap
	});

	it('FEE_BUFFER_MAX returns error when balance < FEE_BUFFER_MAX', async () => {
		// User has $0.10 USDT0 — not enough for FEE_BUFFER_MAX ($0.15)
		mockQueryERC20Balance.mockResolvedValue(100_000n);

		const result = await capBalanceToWalletMax({
			tokenAddress: USDT0_ADDRESS,
			userAddress: USER_ADDRESS,
			chain: CHAIN,
			requestedAmount: 100_000n,
			label: 'LI.FI',
			reserveAmount: FEE_BUFFER_MAX_USDT0
		});

		expect(result.error).not.toBeNull();
		expect(result.error!.message).toContain('Insufficient balance');
		expect(result.data).toBe(0n);
	});
});

// ── Exact bug scenario: USDT0→RBTC via LI.FI ─────────────────────────────

describe('USDT0→RBTC via LI.FI — exact bug scenario', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('fee buffer reservation prevents the executeBatch revert', async () => {
		// User has 1,667,676 USDT0 ($1.67)
		// FEE_BUFFER_MAX = 150,000 ($0.15)
		// Capped swap = 1,667,676 - 150,000 = 1,517,676
		// Actual fee (High tier) ≈ 50,000
		// After swap + fee: 1,667,676 - 1,517,676 - 50,000 = 100,000 remaining ✓
		mockQueryERC20Balance.mockResolvedValue(1_667_676n);

		const result = await capBalanceToWalletMax({
			tokenAddress: USDT0_ADDRESS,
			userAddress: USER_ADDRESS,
			chain: CHAIN,
			requestedAmount: 1_667_676n,
			label: 'LI.FI',
			reserveAmount: FEE_BUFFER_MAX_USDT0
		});

		expect(result.error).toBeNull();

		// Swap amount must be ≤ balance - FEE_BUFFER_MAX
		expect(result.data).toBeLessThanOrEqual(1_667_676n - FEE_BUFFER_MAX_USDT0);

		// Even with worst-case fee (FEE_BUFFER_MAX), balance is sufficient
		const remaining = 1_667_676n - result.data - FEE_BUFFER_MAX_USDT0;
		expect(remaining).toBeGreaterThanOrEqual(0n);
	});

	it('small balance ($0.20) still works with FEE_BUFFER_MAX', async () => {
		mockQueryERC20Balance.mockResolvedValue(200_000n);

		const result = await capBalanceToWalletMax({
			tokenAddress: USDT0_ADDRESS,
			userAddress: USER_ADDRESS,
			chain: CHAIN,
			requestedAmount: 200_000n,
			label: 'LI.FI',
			reserveAmount: FEE_BUFFER_MAX_USDT0
		});

		expect(result.error).toBeNull();
		expect(result.data).toBe(50_000n); // $0.05 for swap

		// After swap + max fee: 200,000 - 50,000 - 150,000 = 0
		const remaining = 200_000n - result.data - FEE_BUFFER_MAX_USDT0;
		expect(remaining).toBe(0n);
	});

	it('balance below FEE_BUFFER_MAX returns clear error', async () => {
		// User has $0.12 USDT0 — less than FEE_BUFFER_MAX ($0.15)
		// Cannot cover even the maximum fee
		mockQueryERC20Balance.mockResolvedValue(120_000n);

		const result = await capBalanceToWalletMax({
			tokenAddress: USDT0_ADDRESS,
			userAddress: USER_ADDRESS,
			chain: CHAIN,
			requestedAmount: 120_000n,
			label: 'LI.FI',
			reserveAmount: FEE_BUFFER_MAX_USDT0
		});

		expect(result.error).not.toBeNull();
		expect(result.error!.message).toContain('Insufficient balance');
		expect(result.data).toBe(0n);
	});
});

// ── All routes: Symbiosis fee reservation ──────────────────────────────────

describe('Symbiosis executor — fee buffer reservation', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('caps WBTC→tBTC swap amount to balance minus FEE_BUFFER_MAX', async () => {
		// WBTC on Arbitrum, Symbiosis same-chain swap
		mockQueryERC20Balance.mockResolvedValue(50_000n); // 0.0005 WBTC

		const result = await capBalanceToWalletMax({
			tokenAddress: WBTC_ADDRESS,
			userAddress: USER_ADDRESS,
			chain: CHAIN,
			requestedAmount: 50_000n,
			label: 'Symbiosis',
			reserveAmount: FEE_BUFFER_MAX_WBTC
		});

		expect(result.error).toBeNull();
		expect(result.data).toBe(50_000n - FEE_BUFFER_MAX_WBTC);
	});

	it('Symbiosis with tBTC cross-chain swap reserves correctly', async () => {
		mockQueryERC20Balance.mockResolvedValue(10_000_000_000_000n); // 0.0001 tBTC

		const result = await capBalanceToWalletMax({
			tokenAddress: TBTC_ADDRESS,
			userAddress: USER_ADDRESS,
			chain: CHAIN,
			requestedAmount: 10_000_000_000_000n,
			label: 'Symbiosis',
			reserveAmount: FEE_BUFFER_MAX_TBTC
		});

		expect(result.error).toBeNull();
		expect(result.data).toBe(10_000_000_000_000n - FEE_BUFFER_MAX_TBTC);
	});
});

// ── All routes: Uniswap V3 fee reservation ────────────────────────────────

describe('Uniswap V3 executor — fee buffer reservation', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('caps tBTC→USDT0 swap amount to balance minus FEE_BUFFER_MAX', async () => {
		mockQueryERC20Balance.mockResolvedValue(5_000_000_000_000n); // 0.00005 tBTC

		const result = await capBalanceToWalletMax({
			tokenAddress: TBTC_ADDRESS,
			userAddress: USER_ADDRESS,
			chain: CHAIN,
			requestedAmount: 5_000_000_000_000n,
			label: 'UniswapV3',
			reserveAmount: FEE_BUFFER_MAX_TBTC
		});

		expect(result.error).toBeNull();
		expect(result.data).toBe(5_000_000_000_000n - FEE_BUFFER_MAX_TBTC);
	});

	it('Uniswap V3 with WBTC reserves correctly', async () => {
		mockQueryERC20Balance.mockResolvedValue(80_000n); // 0.0008 WBTC

		const result = await capBalanceToWalletMax({
			tokenAddress: WBTC_ADDRESS,
			userAddress: USER_ADDRESS,
			chain: CHAIN,
			requestedAmount: 80_000n,
			label: 'UniswapV3',
			reserveAmount: FEE_BUFFER_MAX_WBTC
		});

		expect(result.error).toBeNull();
		expect(result.data).toBe(80_000n - FEE_BUFFER_MAX_WBTC);
	});
});

// ── Cross-route amount consistency ────────────────────────────────────────

describe('cross-route amount consistency', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('same balance + FEE_BUFFER_MAX produces consistent cap across all route labels', async () => {
		mockQueryERC20Balance.mockResolvedValue(1_667_676n);
		const reserve = FEE_BUFFER_MAX_USDT0;

		const labels = ['LI.FI', 'Symbiosis', 'UniswapV3'];
		const results = await Promise.all(
			labels.map((label) =>
				capBalanceToWalletMax({
					tokenAddress: USDT0_ADDRESS,
					userAddress: USER_ADDRESS,
					chain: CHAIN,
					requestedAmount: 1_667_676n,
					label,
					reserveAmount: reserve
				})
			)
		);

		// All routes should produce the same capped amount
		for (const result of results) {
			expect(result.error).toBeNull();
			expect(result.data).toBe(1_667_676n - reserve);
		}
	});

	it('swap + fee buffer never exceeds balance for any token', async () => {
		const tokens = [
			{ addr: USDT0_ADDRESS, balance: 1_667_676n, reserve: FEE_BUFFER_MAX_USDT0 },
			{ addr: WBTC_ADDRESS, balance: 50_000n, reserve: FEE_BUFFER_MAX_WBTC },
			{ addr: TBTC_ADDRESS, balance: 5_000_000_000_000n, reserve: FEE_BUFFER_MAX_TBTC }
		];

		for (const { addr, balance, reserve } of tokens) {
			mockQueryERC20Balance.mockResolvedValue(balance);

			const result = await capBalanceToWalletMax({
				tokenAddress: addr,
				userAddress: USER_ADDRESS,
				chain: CHAIN,
				requestedAmount: balance,
				label: 'LI.FI',
				reserveAmount: reserve
			});

			if (result.error) {
				// Balance < reserve → error is expected
				expect(balance).toBeLessThan(reserve);
			} else {
				// swap + reserve ≤ balance
				expect(result.data + reserve).toBeLessThanOrEqual(balance);
			}
		}
	});
});
