/**
 * Tests for Swap Chain — Cap Balance Without Reserve (The Bug Scenario)
 *
 * Validates that `capBalanceToWalletMax` behaves correctly when
 * `reserveAmount` is undefined or zero. This is the EXACT scenario
 * that caused the production bug: the orchestrator failed to set
 * `relayFeeBuffer`, so `reserveAmount` was undefined, meaning
 * `capBalanceToWalletMax` returned the full requested amount without
 * reserving anything for the relay fee transfer in the same executeBatch.
 *
 * The existing `fee-buffer-reservation.test.ts` always passes an explicit
 * `reserveAmount`, so it never catches the case where the orchestrator
 * fails to set `relayFeeBuffer`.
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
const USER_ADDRESS = '0xA511CFDda94af5ACfBA429Ea70CBe1c0727D7C31';
const CHAIN = 'arbitrum' as const;

const FEE_BUFFER_MAX_USDT0 = 150_000n;

// Bridge internal gas fees observed in production (GasZip cross-chain)
const BRIDGE_GAS_FEE_APPROX = 108_600n;

// ── Tests ─────────────────────────────────────────────────────────────────

describe('capBalanceToWalletMax — no reserve (the bug scenario)', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('reserveAmount=undefined does NOT reduce the requested amount', async () => {
		// Balance is exactly equal to requested — without reserve, full amount is returned
		mockQueryERC20Balance.mockResolvedValue(1_000_000n);

		const result = await capBalanceToWalletMax({
			tokenAddress: USDT0_ADDRESS,
			userAddress: USER_ADDRESS,
			chain: CHAIN,
			requestedAmount: 1_000_000n,
			label: 'LI.FI'
			// reserveAmount is OMITTED (undefined)
		});

		expect(result.error).toBeNull();
		expect(result.data).toBe(1_000_000n);
	});

	it('reserveAmount=0n behaves identically to undefined', async () => {
		mockQueryERC20Balance.mockResolvedValue(1_000_000n);

		const resultZero = await capBalanceToWalletMax({
			tokenAddress: USDT0_ADDRESS,
			userAddress: USER_ADDRESS,
			chain: CHAIN,
			requestedAmount: 1_000_000n,
			label: 'LI.FI',
			reserveAmount: 0n
		});

		const resultUndefined = await capBalanceToWalletMax({
			tokenAddress: USDT0_ADDRESS,
			userAddress: USER_ADDRESS,
			chain: CHAIN,
			requestedAmount: 1_000_000n,
			label: 'LI.FI'
		});

		expect(resultZero.data).toBe(resultUndefined.data);
		expect(resultZero.error).toBeNull();
		expect(resultUndefined.error).toBeNull();
		expect(resultZero.data).toBe(1_000_000n);
	});

	it('exact production bug: balance=1,666,003 requested=1,660,000 no reserve → returns 1,660,000', async () => {
		// Production scenario: user has 1,666,003 USDT0 ($1.67)
		// Requests to swap 1,660,000 USDT0
		// Without reserve, capBalanceToWalletMax returns full 1,660,000
		// This leaves only 6,003 USDT0 for relay fee + bridge gas
		// Bridge gas alone (~108,600) far exceeds 6,003 → revert
		mockQueryERC20Balance.mockResolvedValue(1_666_003n);

		const result = await capBalanceToWalletMax({
			tokenAddress: USDT0_ADDRESS,
			userAddress: USER_ADDRESS,
			chain: CHAIN,
			requestedAmount: 1_660_000n,
			label: 'LI.FI'
			// reserveAmount is OMITTED — orchestrator failed to set relayFeeBuffer
		});

		expect(result.error).toBeNull();
		expect(result.data).toBe(1_660_000n);

		// After swap, only 6,003 remains — not enough for relay fee (~50,000) or bridge gas (~108,600)
		const remaining = 1_666_003n - result.data;
		expect(remaining).toBe(6_003n);
		expect(remaining).toBeLessThan(FEE_BUFFER_MAX_USDT0);
	});

	it('contrast: same scenario WITH reserve=150,000 → returns 1,516,003', async () => {
		// Same production scenario, but WITH the fee buffer reservation
		// Orchestrator correctly sets relayFeeBuffer=150,000
		// capBalanceToWalletMax now caps: min(1,660,000, 1,666,003 - 150,000) = 1,516,003
		// Remaining: 1,666,003 - 1,516,003 = 150,000 — exactly the FEE_BUFFER_MAX
		mockQueryERC20Balance.mockResolvedValue(1_666_003n);

		const result = await capBalanceToWalletMax({
			tokenAddress: USDT0_ADDRESS,
			userAddress: USER_ADDRESS,
			chain: CHAIN,
			requestedAmount: 1_660_000n,
			label: 'LI.FI',
			reserveAmount: FEE_BUFFER_MAX_USDT0
		});

		expect(result.error).toBeNull();
		expect(result.data).toBe(1_516_003n);

		// After swap, 150,000 remains — enough for relay fee
		const remaining = 1_666_003n - result.data;
		expect(remaining).toBe(FEE_BUFFER_MAX_USDT0);
	});

	it('bridge gas fee safety margin: FEE_BUFFER_MAX may not cover bridge internal fees', async () => {
		// FEE_BUFFER_MAX (150,000) is sized for the relay fee (~50,000 USDT0).
		// But for cross-chain swaps via bridges (e.g., GasZip), the bridge itself
		// consumes gas internally. Observed bridge gas: ~108,600 USDT0.
		//
		// If the relay fee is 50,000 and bridge gas is 108,600:
		//   Total needed: 50,000 + 108,600 = 158,600
		//   FEE_BUFFER_MAX: 150,000
		//   Shortfall: 8,600
		//
		// This test documents that FEE_BUFFER_MAX alone may be insufficient
		// for routes that include bridge gas fees on top of relay fees.
		mockQueryERC20Balance.mockResolvedValue(1_666_003n);

		const result = await capBalanceToWalletMax({
			tokenAddress: USDT0_ADDRESS,
			userAddress: USER_ADDRESS,
			chain: CHAIN,
			requestedAmount: 1_660_000n,
			label: 'LI.FI',
			reserveAmount: FEE_BUFFER_MAX_USDT0
		});

		expect(result.error).toBeNull();

		const remaining = 1_666_003n - result.data;

		// FEE_BUFFER_MAX covers the relay fee
		expect(remaining).toBeGreaterThanOrEqual(FEE_BUFFER_MAX_USDT0);

		// But does NOT necessarily cover relay fee + bridge gas combined
		const totalNeeded = FEE_BUFFER_MAX_USDT0 + BRIDGE_GAS_FEE_APPROX;
		expect(remaining).toBeLessThan(totalNeeded);

		// This is the gap: the entire bridge gas fee amount is uncovered
		// because FEE_BUFFER_MAX only covers the relay fee, not bridge gas
		const shortfall = totalNeeded - remaining;
		expect(shortfall).toBe(BRIDGE_GAS_FEE_APPROX);
	});

	it('balance=1,666,003 with no reserve: remaining 6,003 cannot cover even Low tier fee', async () => {
		mockQueryERC20Balance.mockResolvedValue(1_666_003n);

		const result = await capBalanceToWalletMax({
			tokenAddress: USDT0_ADDRESS,
			userAddress: USER_ADDRESS,
			chain: CHAIN,
			requestedAmount: 1_660_000n,
			label: 'LI.FI'
		});

		expect(result.error).toBeNull();

		const remaining = 1_666_003n - result.data;

		// Even the lowest fee tier (Low: $0.01 = 10,000 USDT0) exceeds remaining
		const LOW_TIER_FEE = 10_000n;
		expect(remaining).toBeLessThan(LOW_TIER_FEE);
	});

	it('when balance < requested, caps to balance (still no reserve)', async () => {
		// Intermediate balance after partial fill is less than requested
		mockQueryERC20Balance.mockResolvedValue(500_000n);

		const result = await capBalanceToWalletMax({
			tokenAddress: USDT0_ADDRESS,
			userAddress: USER_ADDRESS,
			chain: CHAIN,
			requestedAmount: 1_660_000n,
			label: 'LI.FI'
			// reserveAmount omitted
		});

		expect(result.error).toBeNull();
		expect(result.data).toBe(500_000n);
	});

	it('when balance > requested, returns requested (no reserve)', async () => {
		mockQueryERC20Balance.mockResolvedValue(10_000_000n);

		const result = await capBalanceToWalletMax({
			tokenAddress: USDT0_ADDRESS,
			userAddress: USER_ADDRESS,
			chain: CHAIN,
			requestedAmount: 1_660_000n,
			label: 'LI.FI'
			// reserveAmount omitted
		});

		expect(result.error).toBeNull();
		expect(result.data).toBe(1_660_000n);
	});
});
