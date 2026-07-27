/**
 * Tests for Swap Chain — Orchestrator Fee Reservation Logic
 *
 * Validates that `startSwapChain` correctly sets `relayFeeBuffer` in the
 * persisted swap chain state. This buffer tells executors to cap swap input
 * amounts to `balance - relayFeeBuffer`, preventing "transfer amount exceeds
 * balance" when the swap input token is also used for gasless fee payment.
 *
 * The logic lives in orchestrator.ts lines 201-224 (single-hop) and 377-394
 * (multi-hop). This test suite covers all branches including edge cases
 * where the reservation is skipped or fails silently.
 *
 * NOTE: This tests the orchestrator's DECISION LOGIC, not the full swap
 * execution. We mock executeHop and saveSwapChainState to isolate the
 * relayFeeBuffer setting behavior.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ─────────────────────────────────────────────────────────────────

const mockSaveSwapChainState = vi.hoisted(() => vi.fn());
const mockExecuteHop = vi.hoisted(() => vi.fn());
const mockGetRSKAddress = vi.hoisted(() => vi.fn());

vi.mock('$lib/utils/debug', () => ({
	createDebug: () => ({
		log: vi.fn(),
		warn: vi.fn(),
		error: vi.fn()
	})
}));

vi.mock('@sentry/sveltekit', () => ({
	addBreadcrumb: vi.fn(),
	captureException: vi.fn()
}));

vi.mock('$lib/services/swap-chain/state', async (importOriginal) => {
	const actual = (await importOriginal()) as Record<string, unknown>;
	return {
		...actual,
		saveSwapChainState: mockSaveSwapChainState,
		transitionTo: vi.fn().mockImplementation(async (current, nextPhase, updates = {}) => ({
			data: { ...current, ...updates, phase: nextPhase, updatedAt: Date.now() },
			error: null
		}))
	};
});

vi.mock('$lib/services/swap-chain/executors', () => ({
	executeHop: mockExecuteHop
}));

vi.mock('$lib/services/swap-chain/boltz', () => ({
	pollBoltzChainSwapCompletion: vi.fn()
}));

vi.mock('$lib/services/swap-chain/orchestrator-helpers', () => ({
	resolveBoltzDirection: vi.fn(),
	pollAndHandleBoltzSwap: vi.fn().mockResolvedValue({ data: null, error: null })
}));

vi.mock('$lib/stores/wallet.store', () => ({
	getRSKAddress: mockGetRSKAddress
}));

const mockFEE_BUFFER_MAX: Record<string, bigint> = {
	'0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9': 150_000n, // USDT0
	'0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f': 230n, // WBTC
	'0x6c84a8f1c29108f47a79964b5fe888d4f4d0de40': 2_500_000_000_000n // tBTC
};

const mockBRIDGE_GAS_RESERVE: Record<string, bigint> = {
	'0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9': 150_000n, // USDT0
	'0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f': 130n, // WBTC
	'0x6c84a8f1c29108f47a79964b5fe888d4f4d0de40': 2_300_000_000_000n // tBTC
};

const mockGetTokenBySymbol = vi.fn();

vi.mock('$lib/wallet/gasless.config', () => ({
	FEE_BUFFER_MAX: mockFEE_BUFFER_MAX,
	BRIDGE_GAS_RESERVE: mockBRIDGE_GAS_RESERVE,
	getTokenBySymbol: mockGetTokenBySymbol
}));

// ── Import under test ─────────────────────────────────────────────────────

import { startSwapChain } from '$lib/services/swap-chain/orchestrator';

// ── Constants ─────────────────────────────────────────────────────────────

const USDT0_ADDRESS = '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9';
const WBTC_ADDRESS = '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f';
const TBTC_ADDRESS = '0x6c84a8f1c29108F47a79964b5Fe888D4f4D0dE40';
const USER_ADDRESS = '0xA511CFDda94af5ACfBA429Ea70CBe1c0727D7C31';

// ── Factories ─────────────────────────────────────────────────────────────

function makeSingleHopRoute(overrides: {
	fromAsset?: string;
	fromChain?: string;
	toAsset?: string;
	toChain?: string;
	service?: 'direct' | 'boltz' | 'changelly' | 'lifi' | 'symbiosis' | 'openocean' | 'uniswap-v3';
} = {}) {
	return {
		id: 'route-1',
		label: 'Test route',
		hops: [
			{
				service: (overrides.service ?? 'lifi') as 'lifi',
				fromAsset: overrides.fromAsset ?? 'USDT0',
				fromChain: overrides.fromChain ?? 'Arbitrum',
				toAsset: overrides.toAsset ?? 'RBTC',
				toChain: overrides.toChain ?? 'RSK',
				feePercent: 0.5,
				estimatedTimeMin: 1,
				estimatedTimeMax: 5
			}
		],
		totalFeePercent: 0.5,
		estimatedTime: '1-5 min',
		recommended: true
	};
}

function makeMultiHopRoute() {
	return {
		id: 'route-2',
		label: 'Multi-hop route',
		hops: [
			{
				service: 'boltz' as const,
				fromAsset: 'RBTC',
				fromChain: 'RSK',
				toAsset: 'TBTC',
				toChain: 'Arbitrum',
				feePercent: 0.1,
				estimatedTimeMin: 10,
				estimatedTimeMax: 30
			},
			{
				service: 'lifi' as const,
				fromAsset: 'TBTC',
				fromChain: 'Arbitrum',
				toAsset: 'USDT0',
				toChain: 'Arbitrum',
				feePercent: 0.5,
				estimatedTimeMin: 1,
				estimatedTimeMax: 5
			}
		],
		totalFeePercent: 0.6,
		estimatedTime: '11-35 min',
		recommended: true
	};
}

const DESTINATION = { type: 'address' as const, chainId: 42161, address: USER_ADDRESS };
const SOURCE_WALLET = 'usdt0-arb' as const;

// ── Helpers ───────────────────────────────────────────────────────────────

/**
 * Extract the `relayFeeBuffer` from the Nth call to `saveSwapChainState`.
 * The orchestrator calls saveSwapChainState multiple times:
 *   - Call 0: initial state (relayFeeBuffer: null)
 *   - Call 1: pending state (relayFeeBuffer: set by fee reservation logic)
 *   - Call 2+: confirmed state, etc.
 */
function getRelayFeeBufferFromCall(callIndex: number): string | null | undefined {
	const call = mockSaveSwapChainState.mock.calls[callIndex];
	if (!call) return undefined;
	return call[0].relayFeeBuffer;
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe('orchestrator fee reservation — single-hop Arbitrum ERC-20', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockSaveSwapChainState.mockResolvedValue({ error: null });
		mockExecuteHop.mockResolvedValue({ data: 'tx-hash-1', error: null });
		mockGetRSKAddress.mockResolvedValue(USER_ADDRESS);
	});

	it('sets relayFeeBuffer from FEE_BUFFER_MAX for USDT0 (same-chain)', async () => {
		mockGetTokenBySymbol.mockReturnValue({
			address: USDT0_ADDRESS,
			symbol: 'USDT0',
			decimals: 6,
			chainId: 42161
		});

		await startSwapChain(
			makeSingleHopRoute({ fromAsset: 'USDT0', toAsset: 'WBTC', toChain: 'Arbitrum' }),
			SOURCE_WALLET,
			DESTINATION,
			'1.66'
		);

		// Call 0 = initial state, Call 1 = pending state with relayFeeBuffer
		expect(getRelayFeeBufferFromCall(0)).toBeNull();
		// Same-chain: only FEE_BUFFER_MAX, no BRIDGE_GAS_RESERVE
		expect(getRelayFeeBufferFromCall(1)).toBe('150000');
	});

	it('sets relayFeeBuffer from FEE_BUFFER_MAX for WBTC (same-chain)', async () => {
		mockGetTokenBySymbol.mockReturnValue({
			address: WBTC_ADDRESS,
			symbol: 'WBTC',
			decimals: 8,
			chainId: 42161
		});

		await startSwapChain(
			makeSingleHopRoute({ fromAsset: 'WBTC', toAsset: 'tBTC', fromChain: 'Arbitrum', toChain: 'Arbitrum' }),
			SOURCE_WALLET,
			DESTINATION,
			'0.0005'
		);

		expect(getRelayFeeBufferFromCall(1)).toBe('230');
	});

	it('sets relayFeeBuffer from FEE_BUFFER_MAX for tBTC (same-chain)', async () => {
		mockGetTokenBySymbol.mockReturnValue({
			address: TBTC_ADDRESS,
			symbol: 'TBTC',
			decimals: 18,
			chainId: 42161
		});

		await startSwapChain(
			makeSingleHopRoute({ fromAsset: 'TBTC', toAsset: 'USDT0', fromChain: 'Arbitrum', toChain: 'Arbitrum' }),
			SOURCE_WALLET,
			DESTINATION,
			'0.00005'
		);

		expect(getRelayFeeBufferFromCall(1)).toBe('2500000000000');
	});
});

describe('orchestrator fee reservation — RBTC exclusion', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockSaveSwapChainState.mockResolvedValue({ error: null });
		mockExecuteHop.mockResolvedValue({ data: 'tx-hash-1', error: null });
		mockGetRSKAddress.mockResolvedValue(USER_ADDRESS);
	});

	it('does NOT set relayFeeBuffer for RBTC swaps (RBTC is native, not ERC-20)', async () => {
		// RBTC is excluded because it's the native token — no ERC-20 balance to reserve from
		mockGetTokenBySymbol.mockReturnValue({
			address: '0x0000000000000000000000000000000000000000',
			symbol: 'RBTC',
			decimals: 18,
			chainId: 30
		});

		await startSwapChain(
			makeSingleHopRoute({ fromAsset: 'RBTC', fromChain: 'RSK', toAsset: 'USDT0', toChain: 'Arbitrum' }),
			'rbtc',
			DESTINATION,
			'0.001'
		);

		// relayFeeBuffer should remain null — condition `hop1.fromAsset !== 'RBTC'` fails
		expect(getRelayFeeBufferFromCall(0)).toBeNull();
		expect(getRelayFeeBufferFromCall(1)).toBeNull();
		// getTokenBySymbol should never be called — the RBTC check short-circuits
		expect(mockGetTokenBySymbol).not.toHaveBeenCalled();
	});
});

describe('orchestrator fee reservation — multi-hop', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockSaveSwapChainState.mockResolvedValue({ error: null });
		mockExecuteHop.mockResolvedValue({ data: 'tx-hash-1', error: null });
		mockGetRSKAddress.mockResolvedValue(USER_ADDRESS);
	});

	it('does NOT set relayFeeBuffer for hop 1 (multi-hop routes set it before hop 2)', async () => {
		// Multi-hop: hop 1 is Boltz (RBTC→TBTC), hop 2 is LI.FI (TBTC→USDT0)
		// For multi-hop, relayFeeBuffer is set before hop 2, not hop 1
		mockGetTokenBySymbol.mockReturnValue({
			address: TBTC_ADDRESS,
			symbol: 'TBTC',
			decimals: 18,
			chainId: 42161
		});

		await startSwapChain(
			makeMultiHopRoute(),
			'rbtc',
			DESTINATION,
			'0.001'
		);

		// Hop 1 pending state should have relayFeeBuffer=null
		// (multi-hop: `route.hops.length === 1` is false, so the single-hop block is skipped)
		expect(getRelayFeeBufferFromCall(0)).toBeNull();
		expect(getRelayFeeBufferFromCall(1)).toBeNull();
	});
});

describe('orchestrator fee reservation — edge cases', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockSaveSwapChainState.mockResolvedValue({ error: null });
		mockExecuteHop.mockResolvedValue({ data: 'tx-hash-1', error: null });
		mockGetRSKAddress.mockResolvedValue(USER_ADDRESS);
	});

	it('relayFeeBuffer stays null when getTokenBySymbol returns undefined', async () => {
		// Unknown token symbol — getTokenBySymbol returns undefined
		mockGetTokenBySymbol.mockReturnValue(undefined);

		await startSwapChain(
			makeSingleHopRoute({ fromAsset: 'UNKNOWN' }),
			SOURCE_WALLET,
			DESTINATION,
			'1.0'
		);

		expect(getRelayFeeBufferFromCall(1)).toBeNull();
		expect(mockGetTokenBySymbol).toHaveBeenCalledWith('UNKNOWN');
	});

	it('relayFeeBuffer stays null when FEE_BUFFER_MAX lookup returns undefined', async () => {
		// Token exists but has no FEE_BUFFER_MAX entry
		mockGetTokenBySymbol.mockReturnValue({
			address: '0x1234567890abcdef1234567890abcdef12345678',
			symbol: 'NEWTOKEN',
			decimals: 18,
			chainId: 42161
		});

		await startSwapChain(
			makeSingleHopRoute({ fromAsset: 'NEWTOKEN' }),
			SOURCE_WALLET,
			DESTINATION,
			'1.0'
		);

		expect(getRelayFeeBufferFromCall(1)).toBeNull();
	});

	it('import failure is caught silently (non-blocking)', async () => {
		// If the dynamic import of gasless.config throws, the error is caught
		// and relayFeeBuffer stays null — the swap is NOT aborted.
		mockGetTokenBySymbol.mockImplementation(() => {
			throw new Error('Module load failed');
		});

		// Should NOT throw — the catch block swallows the error
		const result = await startSwapChain(
			makeSingleHopRoute(),
			SOURCE_WALLET,
			DESTINATION,
			'1.66'
		);

		// Swap should proceed (executeHop called) despite fee reservation failure
		expect(mockExecuteHop).toHaveBeenCalled();
		expect(getRelayFeeBufferFromCall(1)).toBeNull();
	});

	it('does NOT set relayFeeBuffer for non-Arbitrum chains', async () => {
		// BSC or RSK as fromChain — condition `hop1.fromChain === 'Arbitrum'` fails
		mockGetTokenBySymbol.mockReturnValue({
			address: USDT0_ADDRESS,
			symbol: 'USDT0',
			decimals: 6,
			chainId: 56
		});

		await startSwapChain(
			makeSingleHopRoute({ fromChain: 'BSC', toChain: 'Arbitrum' }),
			SOURCE_WALLET,
			DESTINATION,
			'1.0'
		);

		expect(getRelayFeeBufferFromCall(1)).toBeNull();
		expect(mockGetTokenBySymbol).not.toHaveBeenCalled();
	});
});

describe('orchestrator fee reservation — exact bug scenario', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockSaveSwapChainState.mockResolvedValue({ error: null });
		mockExecuteHop.mockResolvedValue({ data: 'tx-hash-1', error: null });
		mockGetRSKAddress.mockResolvedValue(USER_ADDRESS);
	});

	it('USDT0→RBTC cross-chain via GasZip sets relayFeeBuffer=300000 (FEE_BUFFER_MAX + BRIDGE_GAS_RESERVE)', async () => {
		// This is the EXACT production bug scenario:
		// - User swaps USDT0 (Arbitrum) → RBTC (RSK) via LI.FI/GasZip
		// - Single-hop route, Arbitrum source, USDT0 (not RBTC)
		// - Cross-chain: orchestrator sets relayFeeBuffer = FEE_BUFFER_MAX + BRIDGE_GAS_RESERVE
		//   = 150,000 + 150,000 = 300,000
		//
		// Bug: if orchestrator fails to set this, capBalanceToWalletMax gets
		// reserveAmount=undefined, swaps the full balance, and the fee transfer
		// in executeBatch reverts with ExecuteError.
		mockGetTokenBySymbol.mockReturnValue({
			address: USDT0_ADDRESS,
			symbol: 'USDT0',
			decimals: 6,
			chainId: 42161
		});

		await startSwapChain(
			makeSingleHopRoute({
				service: 'lifi',
				fromAsset: 'USDT0',
				fromChain: 'Arbitrum',
				toAsset: 'RBTC',
				toChain: 'RSK'
			}),
			'usdt0-arb',
			{ type: 'address', chainId: 30, address: USER_ADDRESS },
			'1.66'
		);

		// Verify the condition chain:
		// 1. route.hops.length === 1 ✓ (single-hop)
		// 2. hop1.fromChain === 'Arbitrum' ✓
		// 3. hop1.fromAsset !== 'RBTC' ✓ ('USDT0' !== 'RBTC')
		// 4. getTokenBySymbol('USDT0') → { address: USDT0_ADDRESS, ... }
		// 5. FEE_BUFFER_MAX[USDT0] = 150,000
		// 6. BRIDGE_GAS_RESERVE[USDT0] = 150,000 (cross-chain)
		// 7. relayFeeBuffer = '300000' (150,000 + 150,000)
		expect(getRelayFeeBufferFromCall(0)).toBeNull(); // initial state
		expect(getRelayFeeBufferFromCall(1)).toBe('300000'); // pending state

		// Verify getTokenBySymbol was called with the correct symbol
		expect(mockGetTokenBySymbol).toHaveBeenCalledWith('USDT0');

		// Verify the state was persisted with the correct relayFeeBuffer
		const pendingState = mockSaveSwapChainState.mock.calls[1][0];
		expect(pendingState.relayFeeBuffer).toBe('300000');
		expect(pendingState.phase).toBe('SWAP_1_PENDING');
	});
});
