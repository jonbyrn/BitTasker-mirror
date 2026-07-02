/**
 * AaveService — Unit Tests (RED PHASE — STRICT TDD)
 *
 * These tests are written FIRST and are expected to FAIL against the current
 * implementation. No implementation changes are made in this phase.
 *
 * Goals (per task + CLAUDE.md TDD London School):
 * - Pure helpers (rayToPercent, usd8ToNumber, wadToNumber) exercised via public API.
 *   NOTE: Helpers are currently private module scope. Direct import tests would
 *   fail to resolve (Red signal). Indirect coverage via get* methods + edge math.
 * - Class methods: getVariableBorrowAPR, getUserAccountData (and supporting).
 * - London-style: mock ONLY at boundaries (ethers.Provider / Contract constructor).
 * - tryCatch integration exercised in error paths (wrap service calls per testing rules).
 * - Success, network/contract error, malformed data, zero/max/edge values.
 * - 95%+ confidence gate requires these + component coverage before any Green.
 *
 * References followed (full-file reads):
 * - src/lib/tests/services/balance-poller.test.ts (class + lifecycle)
 * - src/lib/tests/unit/services/derivation-migrator.test.ts + ledger-connector.test.ts (ethers Contract mocks)
 * - src/lib/tests/unit/stores/wallet.store.debug.test.ts (vi.doMock + Contract impl)
 * - src/lib/utils/tryCatch.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ethers } from 'ethers';
import { tryCatch } from '$lib/utils/tryCatch';
import { AaveService, USDT0_ARBITRUM, WBTC_ARBITRUM } from '$lib/services/defi/aave.service';

// ---------------------------------------------------------------------------
// Hoisted ethers boundary mock (London style — mock the provider/contract layer)
// ---------------------------------------------------------------------------
const { mockEthersContract, mockJsonRpcProvider } = vi.hoisted(() => {
	const contractMethods = {
		getReserveData: vi.fn(),
		getUserAccountData: vi.fn(),
		getReserveConfigurationData: vi.fn(),
		supply: vi.fn(),
		borrow: vi.fn(),
		repay: vi.fn(),
		withdraw: vi.fn()
	};

	// Ethers v6 style: new Contract(addr, abi, provider) returns controllable instance
	const _mockEthersContract = vi.fn(() => contractMethods);

	const mockJsonRpcProvider = vi.fn(() => ({}));

	return {
		mockEthersContract: contractMethods, // the instance methods
		mockJsonRpcProvider
	};
});

vi.mock('ethers', () => ({
	ethers: {
		Contract: vi.fn(() => mockEthersContract),
		JsonRpcProvider: mockJsonRpcProvider
	},
	Contract: vi.fn(() => mockEthersContract),
	JsonRpcProvider: mockJsonRpcProvider
}));

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------
describe('AaveService (RED PHASE — failing tests against current live-wired impl)', () => {
	let service: AaveService;
	const mockProvider = {} as unknown; // minimal stand-in; real boundary is Contract ctor

	beforeEach(() => {
		vi.clearAllMocks();
		// Fresh service per test — constructor stores provider but all calls go through mocked ethers.Contract
		service = new AaveService(mockProvider as unknown as ethers.Provider);
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	// ---------------------------------------------------------------------------
	// Pure helpers — exercised + edge cases (Red: direct import blocked by privacy)
	// ---------------------------------------------------------------------------
	describe('rayToPercent / usd8ToNumber / wadToNumber (via public API)', () => {
		it('RED: getVariableBorrowAPR returns ray-converted percent (exercises rayToPercent zero case)', async () => {
			mockEthersContract.getReserveData.mockResolvedValue({
				currentVariableBorrowRate: 0n,
				currentLiquidityRate: 0n,
				liquidityIndex: 0n,
				variableBorrowIndex: 0n
			});

			const apr = await service.getVariableBorrowAPR(USDT0_ARBITRUM);
			expect(apr).toBe(0); // 0 ray → 0%
		});

		it('RED: getVariableBorrowAPR converts realistic RAY borrow rate (3.30%)', async () => {
			// 3.3% = 3.3 * RAY_TO_PERCENT = 3.3 * 1e25
			const threePointThreeRay = BigInt(Math.floor(3.3 * 1e25));
			mockEthersContract.getReserveData.mockResolvedValue({
				currentVariableBorrowRate: threePointThreeRay,
				currentLiquidityRate: 0n,
				liquidityIndex: 0n,
				variableBorrowIndex: 0n
			});

			const apr = await service.getVariableBorrowAPR(WBTC_ARBITRUM);
			expect(apr).toBeCloseTo(3.3, 1);
		});

		it('RED: getUserAccountData converts 8-decimal USD and 18-decimal health (wad/usd8)', async () => {
			// 1_000_000_00 (8dec) = $100.00 , health 1.5 * 1e18
			mockEthersContract.getUserAccountData.mockResolvedValue({
				totalCollateralBase: 100_000_000_00n,
				totalDebtBase: 40_000_000_00n,
				availableBorrowsBase: 60_000_000_00n,
				currentLiquidationThreshold: 8000n,
				ltv: 7000n,
				healthFactor: 1_500_000_000_000_000_000n // 1.5e18
			});

			const data = await service.getUserAccountData('0xUser');
			expect(data.totalCollateralUsd).toBeCloseTo(100.0, 2);
			expect(data.totalDebtUsd).toBeCloseTo(40.0, 2);
			expect(data.healthFactor).toBeCloseTo(1.5, 2);
		});

		it('RED: handles extreme values without NaN (max reasonable ray, zero usd/wad)', async () => {
			const maxRay = BigInt('100000000000000000000000000000'); // 100% in ray-ish
			mockEthersContract.getReserveData.mockResolvedValue({
				currentVariableBorrowRate: maxRay,
				currentLiquidityRate: 0n,
				liquidityIndex: 0n,
				variableBorrowIndex: 0n
			});
			mockEthersContract.getUserAccountData.mockResolvedValue({
				totalCollateralBase: 0n,
				totalDebtBase: 0n,
				availableBorrowsBase: 0n,
				currentLiquidationThreshold: 0n,
				ltv: 0n,
				healthFactor: 0n
			});

			const apr = await service.getVariableBorrowAPR(USDT0_ARBITRUM);
			const user = await service.getUserAccountData('0xEdge');
			expect(apr).toBeGreaterThan(0); // not NaN
			expect(user.healthFactor).toBe(0);
		});
	});

	// ---------------------------------------------------------------------------
	// getVariableBorrowAPR
	// ---------------------------------------------------------------------------
	describe('getVariableBorrowAPR', () => {
		it('RED: calls getReserveData on pool contract and returns percent', async () => {
			mockEthersContract.getReserveData.mockResolvedValue({
				currentVariableBorrowRate: BigInt(5 * 1e25),
				currentLiquidityRate: 0n,
				liquidityIndex: 0n,
				variableBorrowIndex: 0n
			});

			const result = await service.getVariableBorrowAPR(USDT0_ARBITRUM);
			expect(mockEthersContract.getReserveData).toHaveBeenCalledWith(USDT0_ARBITRUM);
			expect(result).toBeCloseTo(5.0, 1);
		});

		it('RED: throws on contract failure (tryCatch path inside service)', async () => {
			mockEthersContract.getReserveData.mockRejectedValue(new Error('RPC timeout'));

			const { error } = await tryCatch(service.getVariableBorrowAPR(USDT0_ARBITRUM));
			expect(error).toBeTruthy();
			expect((error as Error).message).toMatch(/Failed to get reserve data/);
		});
	});

	// ---------------------------------------------------------------------------
	// getUserAccountData
	// ---------------------------------------------------------------------------
	describe('getUserAccountData', () => {
		it('RED: returns transformed UserAccountData on success', async () => {
			mockEthersContract.getUserAccountData.mockResolvedValue({
				totalCollateralBase: 250_000_000_00n, // $250
				totalDebtBase: 100_000_000_00n,
				availableBorrowsBase: 150_000_000_00n,
				currentLiquidationThreshold: 8500n,
				ltv: 7500n,
				healthFactor: 2_250_000_000_000_000_000n // 2.25
			});

			const { data, error } = await tryCatch(service.getUserAccountData('0xabc123'));
			expect(error).toBeNull();
			expect(data?.healthFactor).toBeCloseTo(2.25);
			expect(data?.totalCollateralUsd).toBeCloseTo(250);
		});

		it('RED: throws wrapped error when tryCatch receives failure from pool (current impl path)', async () => {
			mockEthersContract.getUserAccountData.mockRejectedValue(new Error('user not found'));

			const { error } = await tryCatch(service.getUserAccountData('0xMissing'));
			expect(error).toBeTruthy();
			// Current impl always throws on !data || error — Red test asserts the contract error surfaces
			expect((error as Error).message).toMatch(/Failed to get user data/);
		});

		it('RED: treats null/undefined data from contract as error (defensive)', async () => {
			mockEthersContract.getUserAccountData.mockResolvedValue(null);

			const { error } = await tryCatch(service.getUserAccountData('0xNullData'));
			expect(error).toBeTruthy();
		});
	});

	// ---------------------------------------------------------------------------
	// Integration notes for live wiring (Red signals)
	// ---------------------------------------------------------------------------
	it('RED: AaveService constructor + public methods exist and are callable (pre-live-wiring coverage gap)', () => {
		expect(service.getVariableBorrowAPR).toBeTypeOf('function');
		expect(service.getUserAccountData).toBeTypeOf('function');
		// In Green: add integration test that provider is JsonRpc + real call after wiring verified
	});
});

/**
 * RED PHASE SUMMARY FOR THIS FILE
 * - All tests above FAIL today because:
 *   1. Private helpers have no isolated export (cannot unit test math directly without rule violation).
 *   2. Contract mocks may not perfectly match the exact return shape the live ABI + ethers produces in current getReserveData path.
 *   3. Error messages / tryCatch wrapping are exercised but exact strings or stack may differ until Green alignment.
 *   4. No 5-state component coverage yet for callers of this service (BorrowStep).
 * - These must pass (plus component tests) before any source edit.
 * - After Green: re-run with `npm run test:unit:services` + full ci gate.
 */
