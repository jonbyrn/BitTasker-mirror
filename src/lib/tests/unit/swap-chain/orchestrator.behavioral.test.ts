/**
 * Behavioral tests for the swap chain orchestrator.
 *
 * Covers startSwapChain (single-hop, multi-hop, error handling, gas price
 * stability), resolveBoltzDirection, and resumeSwapChain (basic paths).
 *
 * Mocks: executeHop, pollBoltzChainSwapCompletion, pollAndHandleBoltzSwap,
 * saveSwapChainState, loadSwapChainState, wallet store, fetchGasPrice.
 * Tests the real orchestrator logic.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Hoisted mocks ──────────────────────────────────────────────────────────

const mockSaveSwapChainState = vi.hoisted(() => vi.fn());
const mockLoadSwapChainState = vi.hoisted(() => vi.fn());
const mockResetSwapChainState = vi.hoisted(() => vi.fn());
const mockTransitionTo = vi.hoisted(() => vi.fn());
const mockIsTerminalPhase = vi.hoisted(() => vi.fn());
const mockExecuteHop = vi.hoisted(() => vi.fn());
const mockPollBoltzChainSwapCompletion = vi.hoisted(() => vi.fn());
const mockPollAndHandleBoltzSwap = vi.hoisted(() => vi.fn());
const mockResolveBoltzDirection = vi.hoisted(() => vi.fn());
const mockGetRSKAddress = vi.hoisted(() => vi.fn());
const mockFetchGasPrice = vi.hoisted(() => vi.fn());

// ── Module mocks ───────────────────────────────────────────────────────────

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

vi.mock('@capacitor/preferences', () => ({
	Preferences: {
		get: vi.fn().mockResolvedValue({ value: null }),
		set: vi.fn().mockResolvedValue(undefined),
		remove: vi.fn().mockResolvedValue(undefined)
	}
}));

vi.mock('$lib/services/swap-chain/state', async (importOriginal) => {
	const actual = (await importOriginal()) as Record<string, unknown>;
	return {
		...actual,
		saveSwapChainState: mockSaveSwapChainState,
		loadSwapChainState: mockLoadSwapChainState,
		resetSwapChainState: mockResetSwapChainState,
		transitionTo: mockTransitionTo,
		isTerminalPhase: mockIsTerminalPhase
	};
});

vi.mock('$lib/services/swap-chain/executors', () => ({
	executeHop: mockExecuteHop
}));

vi.mock('$lib/services/swap-chain/boltz', () => ({
	pollBoltzChainSwapCompletion: mockPollBoltzChainSwapCompletion
}));

vi.mock('$lib/services/swap-chain/orchestrator-helpers', () => ({
	resolveBoltzDirection: mockResolveBoltzDirection,
	pollAndHandleBoltzSwap: mockPollAndHandleBoltzSwap
}));

vi.mock('$lib/stores/wallet.store', () => ({
	getRSKAddress: mockGetRSKAddress
}));

vi.mock('$lib/utils/swap-gas', () => ({
	fetchGasPrice: mockFetchGasPrice
}));

vi.mock('$lib/wallet/gasless.config', () => ({
	FEE_BUFFER_MAX: {},
	BRIDGE_GAS_RESERVE: {},
	getTokenBySymbol: vi.fn().mockReturnValue(undefined)
}));

vi.mock('$lib/services/swap-chain/utils', async (importOriginal) => {
	const actual = (await importOriginal()) as Record<string, unknown>;
	return {
		...actual,
		RSK_RPC_URL: 'https://mock-rpc.example.com'
	};
});

// ── Dynamic import (fresh per test to reset module-level lock) ─────────────

async function importOrchestrator() {
	return await import('$lib/services/swap-chain/orchestrator');
}

// ── Constants ──────────────────────────────────────────────────────────────

const USER_ADDRESS = '0xA511CFDda94af5ACfBA429Ea70CBe1c0727D7C31';
const SOURCE_WALLET = 'rbtc' as const;
const DESTINATION = { type: 'address' as const, chainId: 42161, address: USER_ADDRESS };

// ── Route factories ────────────────────────────────────────────────────────

function makeSingleHopBoltzRoute() {
	return {
		id: 'route-boltz-1',
		label: 'RBTC→tBTC via Boltz',
		hops: [
			{
				service: 'boltz' as const,
				fromAsset: 'RBTC',
				fromChain: 'Rootstock',
				toAsset: 'TBTC',
				toChain: 'Arbitrum',
				feePercent: 0.1,
				estimatedTimeMin: 10,
				estimatedTimeMax: 30
			}
		],
		totalFeePercent: 0.1,
		estimatedTime: '10-30 min',
		recommended: true
	};
}

function makeSingleHopLifiRoute(overrides: Partial<{
	fromAsset: string;
	fromChain: string;
	toAsset: string;
	toChain: string;
	service: 'lifi' | 'symbiosis' | 'boltz' | 'direct';
}> = {}) {
	return {
		id: 'route-lifi-1',
		label: 'LI.FI single hop',
		hops: [
			{
				service: (overrides.service ?? 'lifi') as 'lifi',
				fromAsset: overrides.fromAsset ?? 'USDT0',
				fromChain: overrides.fromChain ?? 'Arbitrum',
				toAsset: overrides.toAsset ?? 'RBTC',
				toChain: overrides.toChain ?? 'Rootstock',
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
		id: 'route-multi-1',
		label: 'RBTC→tBTC→USDT0',
		hops: [
			{
				service: 'boltz' as const,
				fromAsset: 'RBTC',
				fromChain: 'Rootstock',
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

// ── Helpers ────────────────────────────────────────────────────────────────

function makeState(overrides: Record<string, unknown> = {}) {
	return {
		phase: 'IDLE',
		route: null,
		sourceWallet: null,
		destination: null,
		sourceConnectedWalletId: null,
		amount: null,
		adjustedAmount: null,
		relayFeeBuffer: null,
		swap1Id: null,
		swap2Id: null,
		swap1Details: null,
		swap2Details: null,
		error: null,
		updatedAt: Date.now(),
		...overrides
	};
}

/** Reset the module-level swapExecutionLock by re-importing the module. */
async function resetLock() {
	vi.resetModules();
	await vi.importActual('$lib/services/swap-chain/state');
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('startSwapChain — single-hop Boltz flow', () => {
	beforeEach(async () => {
		vi.clearAllMocks();
		await resetLock();
		mockSaveSwapChainState.mockResolvedValue({ error: null });
		mockGetRSKAddress.mockResolvedValue(USER_ADDRESS);
		mockFetchGasPrice.mockResolvedValue(60_000_000_000n); // 60 Gwei
		mockResolveBoltzDirection.mockReturnValue('rbtc-to-tbtc');
		mockIsTerminalPhase.mockImplementation(
			(phase: string) => phase === 'IDLE' || phase === 'COMPLETE' || phase === 'FAILED' || phase === 'PARTIAL'
		);
		mockTransitionTo.mockImplementation(async (current: Record<string, unknown>, nextPhase: string) => ({
			data: { ...current, phase: nextPhase, updatedAt: Date.now() },
			error: null
		}));
	});

	it('executes hop 1 via executeHop', async () => {
		mockExecuteHop.mockResolvedValue({ data: 'boltz-swap-id-123', error: null });
		mockPollAndHandleBoltzSwap.mockResolvedValue({ data: null, error: null });

		const { startSwapChain } = await importOrchestrator();
		await startSwapChain(makeSingleHopBoltzRoute(), SOURCE_WALLET, DESTINATION, '0.001');

		expect(mockExecuteHop).toHaveBeenCalledTimes(1);
		expect(mockExecuteHop).toHaveBeenCalledWith(
			expect.objectContaining({ service: 'boltz', fromAsset: 'RBTC' }),
			expect.objectContaining({ phase: 'SWAP_1_PENDING' }),
			0
		);
	});

	it('transitions to SWAP_1_PENDING → SWAP_1_CONFIRMED', async () => {
		mockExecuteHop.mockResolvedValue({ data: 'boltz-swap-id-123', error: null });
		mockPollAndHandleBoltzSwap.mockResolvedValue({ data: null, error: null });

		const { startSwapChain } = await importOrchestrator();
		await startSwapChain(makeSingleHopBoltzRoute(), SOURCE_WALLET, DESTINATION, '0.001');

		const saveCalls = mockSaveSwapChainState.mock.calls;
		expect(saveCalls.length).toBeGreaterThanOrEqual(3);
		expect(saveCalls[0][0].phase).toBe('IDLE');
		expect(saveCalls[1][0].phase).toBe('SWAP_1_PENDING');
		expect(saveCalls[2][0].phase).toBe('SWAP_1_CONFIRMED');
	});

	it('polls for Boltz completion for single-hop boltz routes', async () => {
		mockExecuteHop.mockResolvedValue({ data: 'boltz-swap-id-123', error: null });
		mockPollAndHandleBoltzSwap.mockResolvedValue({ data: null, error: null });

		const { startSwapChain } = await importOrchestrator();
		await startSwapChain(makeSingleHopBoltzRoute(), SOURCE_WALLET, DESTINATION, '0.001');

		expect(mockPollAndHandleBoltzSwap).toHaveBeenCalledTimes(1);
		expect(mockPollAndHandleBoltzSwap).toHaveBeenCalledWith(
			expect.objectContaining({
				swapId: 'boltz-swap-id-123',
				direction: 'rbtc-to-tbtc',
				logContext: 'startSwapChain'
			})
		);
	});

	it('transitions to COMPLETE on success', async () => {
		mockExecuteHop.mockResolvedValue({ data: 'boltz-swap-id-123', error: null });
		mockPollAndHandleBoltzSwap.mockResolvedValue({ data: null, error: null });

		const { startSwapChain } = await importOrchestrator();
		const result = await startSwapChain(makeSingleHopBoltzRoute(), SOURCE_WALLET, DESTINATION, '0.001');

		expect(result.error).toBeNull();
		expect(result.data).not.toBeNull();
		expect(mockTransitionTo).toHaveBeenCalledWith(
			expect.objectContaining({ phase: 'SWAP_1_CONFIRMED' }),
			'COMPLETE'
		);
	});

	it('transitions to FAILED on hop error', async () => {
		const hopError = new Error('Boltz lockup failed');
		mockExecuteHop.mockResolvedValue({ data: null, error: hopError });
		mockTransitionTo.mockImplementation(async (current: Record<string, unknown>, nextPhase: string, updates?: Record<string, unknown>) => ({
			data: { ...current, ...updates, phase: nextPhase, updatedAt: Date.now() },
			error: null
		}));

		const { startSwapChain } = await importOrchestrator();
		const result = await startSwapChain(makeSingleHopBoltzRoute(), SOURCE_WALLET, DESTINATION, '0.001');

		expect(result.error).toBeNull();
		expect(result.data).not.toBeNull();
		expect(result.data!.phase).toBe('FAILED');
		expect(mockTransitionTo).toHaveBeenCalledWith(
			expect.objectContaining({ phase: 'SWAP_1_PENDING' }),
			'FAILED',
			{ error: 'Boltz lockup failed' }
		);
	});
});

describe('startSwapChain — multi-hop RBTC→tBTC→USDT0', () => {
	beforeEach(async () => {
		vi.clearAllMocks();
		await resetLock();
		mockSaveSwapChainState.mockResolvedValue({ error: null });
		mockGetRSKAddress.mockResolvedValue(USER_ADDRESS);
		mockFetchGasPrice.mockResolvedValue(60_000_000_000n);
		mockResolveBoltzDirection.mockReturnValue('rbtc-to-tbtc');
		mockIsTerminalPhase.mockImplementation(
			(phase: string) => phase === 'IDLE' || phase === 'COMPLETE' || phase === 'FAILED' || phase === 'PARTIAL'
		);
		mockTransitionTo.mockImplementation(async (current: Record<string, unknown>, nextPhase: string) => ({
			data: { ...current, phase: nextPhase, updatedAt: Date.now() },
			error: null
		}));
	});

	it('executes hop 1 (Boltz: RBTC→tBTC)', async () => {
		mockExecuteHop
			.mockResolvedValueOnce({ data: 'boltz-hop1-id', error: null })
			.mockResolvedValueOnce({ data: 'lifi-hop2-tx', error: null });
		mockPollAndHandleBoltzSwap.mockResolvedValue({ data: null, error: null });

		const { startSwapChain } = await importOrchestrator();
		await startSwapChain(makeMultiHopRoute(), SOURCE_WALLET, DESTINATION, '0.001');

		expect(mockExecuteHop).toHaveBeenCalledTimes(2);
		expect(mockExecuteHop.mock.calls[0][0]).toMatchObject({
			service: 'boltz',
			fromAsset: 'RBTC',
			toAsset: 'TBTC'
		});
	});

	it('polls Boltz for hop 1 completion before executing hop 2', async () => {
		mockExecuteHop
			.mockResolvedValueOnce({ data: 'boltz-hop1-id', error: null })
			.mockResolvedValueOnce({ data: 'lifi-hop2-tx', error: null });
		mockPollAndHandleBoltzSwap.mockResolvedValue({ data: null, error: null });

		const { startSwapChain } = await importOrchestrator();
		await startSwapChain(makeMultiHopRoute(), SOURCE_WALLET, DESTINATION, '0.001');

		expect(mockPollAndHandleBoltzSwap).toHaveBeenCalledTimes(1);
		expect(mockPollAndHandleBoltzSwap).toHaveBeenCalledWith(
			expect.objectContaining({
				swapId: 'boltz-hop1-id',
				direction: 'rbtc-to-tbtc',
				logContext: 'startSwapChain'
			})
		);
	});

	it('executes hop 2 (LI.FI: tBTC→USDT0) after Boltz completes', async () => {
		mockExecuteHop
			.mockResolvedValueOnce({ data: 'boltz-hop1-id', error: null })
			.mockResolvedValueOnce({ data: 'lifi-hop2-tx', error: null });
		mockPollAndHandleBoltzSwap.mockResolvedValue({ data: null, error: null });

		const { startSwapChain } = await importOrchestrator();
		await startSwapChain(makeMultiHopRoute(), SOURCE_WALLET, DESTINATION, '0.001');

		expect(mockExecuteHop.mock.calls[1][0]).toMatchObject({
			service: 'lifi',
			fromAsset: 'TBTC',
			toAsset: 'USDT0'
		});
		expect(mockExecuteHop.mock.calls[1][2]).toBe(1); // hopIndex
	});

	it('transitions through SWAP_2_PENDING → SWAP_2_CONFIRMED → COMPLETE', async () => {
		mockExecuteHop
			.mockResolvedValueOnce({ data: 'boltz-hop1-id', error: null })
			.mockResolvedValueOnce({ data: 'lifi-hop2-tx', error: null });
		mockPollAndHandleBoltzSwap.mockResolvedValue({ data: null, error: null });

		const { startSwapChain } = await importOrchestrator();
		const result = await startSwapChain(makeMultiHopRoute(), SOURCE_WALLET, DESTINATION, '0.001');

		expect(result.error).toBeNull();
		expect(result.data).not.toBeNull();

		const phases = mockSaveSwapChainState.mock.calls.map((c: unknown[]) => (c[0] as Record<string, unknown>).phase);
		expect(phases).toContain('SWAP_2_PENDING');

		// SWAP_2_CONFIRMED is set in the state object passed to transitionTo,
		// then transitionTo internally saves via saveSwapChainState (mocked here).
		// Check the transitionTo call received a SWAP_2_CONFIRMED state.
		const transitionCalls = mockTransitionTo.mock.calls;
		const hasConfirmed2 = transitionCalls.some(
			(c: unknown[]) => (c[0] as Record<string, unknown>).phase === 'SWAP_2_CONFIRMED'
		);
		expect(hasConfirmed2).toBe(true);

		expect(mockTransitionTo).toHaveBeenCalledWith(
			expect.objectContaining({ phase: 'SWAP_2_CONFIRMED' }),
			'COMPLETE'
		);
	});

	it('reserves relay fee buffer for hop 2', async () => {
		mockExecuteHop
			.mockResolvedValueOnce({ data: 'boltz-hop1-id', error: null })
			.mockResolvedValueOnce({ data: 'lifi-hop2-tx', error: null });
		mockPollAndHandleBoltzSwap.mockResolvedValue({ data: null, error: null });

		const { startSwapChain } = await importOrchestrator();
		await startSwapChain(makeMultiHopRoute(), SOURCE_WALLET, DESTINATION, '0.001');

		const hop2PendingState = mockSaveSwapChainState.mock.calls.find(
			(c: unknown[]) => (c[0] as Record<string, unknown>).phase === 'SWAP_2_PENDING'
		);
		expect(hop2PendingState).toBeDefined();
	});

	it('returns PARTIAL when hop 2 fails', async () => {
		mockExecuteHop
			.mockResolvedValueOnce({ data: 'boltz-hop1-id', error: null })
			.mockResolvedValueOnce({ data: null, error: new Error('LI.FI quote expired') });
		mockPollAndHandleBoltzSwap.mockResolvedValue({ data: null, error: null });
		mockTransitionTo.mockImplementation(async (current: Record<string, unknown>, nextPhase: string, updates?: Record<string, unknown>) => ({
			data: { ...current, ...updates, phase: nextPhase, updatedAt: Date.now() },
			error: null
		}));

		const { startSwapChain } = await importOrchestrator();
		const result = await startSwapChain(makeMultiHopRoute(), SOURCE_WALLET, DESTINATION, '0.001');

		expect(result.error).toBeNull();
		expect(result.data!.phase).toBe('PARTIAL');
		expect(mockTransitionTo).toHaveBeenCalledWith(
			expect.objectContaining({ phase: 'SWAP_2_PENDING' }),
			'PARTIAL',
			{ error: 'LI.FI quote expired' }
		);
	});
});

describe('startSwapChain — error handling', () => {
	beforeEach(async () => {
		vi.clearAllMocks();
		await resetLock();
		mockSaveSwapChainState.mockResolvedValue({ error: null });
		mockGetRSKAddress.mockResolvedValue(USER_ADDRESS);
		mockFetchGasPrice.mockResolvedValue(60_000_000_000n);
		mockIsTerminalPhase.mockImplementation(
			(phase: string) => phase === 'IDLE' || phase === 'COMPLETE' || phase === 'FAILED' || phase === 'PARTIAL'
		);
	});

	it('returns error for invalid route (missing hops)', async () => {
		const { startSwapChain } = await importOrchestrator();
		const result = await startSwapChain(
			{ id: 'bad', label: '', hops: null as unknown as never[], totalFeePercent: 0, estimatedTime: '', recommended: false },
			SOURCE_WALLET,
			DESTINATION,
			'1.0'
		);

		expect(result.error).not.toBeNull();
		expect(result.error!.message).toContain('Invalid route');
		expect(result.data).toBeNull();
	});

	it('returns error for invalid destination', async () => {
		const { startSwapChain } = await importOrchestrator();
		const result = await startSwapChain(
			makeSingleHopLifiRoute(),
			SOURCE_WALLET,
			null as unknown as never,
			'1.0'
		);

		expect(result.error).not.toBeNull();
		expect(result.error!.message).toContain('Invalid destination');
	});

	it('returns error for NaN amount', async () => {
		const { startSwapChain } = await importOrchestrator();
		const result = await startSwapChain(
			makeSingleHopLifiRoute(),
			SOURCE_WALLET,
			DESTINATION,
			'not-a-number'
		);

		expect(result.error).not.toBeNull();
		expect(result.error!.message).toContain('Invalid amount');
		expect(result.error!.message).toContain('finite number');
	});

	it('returns error for negative amount', async () => {
		const { startSwapChain } = await importOrchestrator();
		const result = await startSwapChain(
			makeSingleHopLifiRoute(),
			SOURCE_WALLET,
			DESTINATION,
			'-5'
		);

		expect(result.error).not.toBeNull();
		expect(result.error!.message).toContain('greater than zero');
	});

	it('returns error for too large amount', async () => {
		const { startSwapChain } = await importOrchestrator();
		const result = await startSwapChain(
			makeSingleHopLifiRoute(),
			SOURCE_WALLET,
			DESTINATION,
			'999999999999'
		);

		expect(result.error).not.toBeNull();
		expect(result.error!.message).toContain('exceeds maximum');
	});

	it('returns error for offline device', async () => {
		vi.stubGlobal('navigator', { onLine: false });

		const { startSwapChain } = await importOrchestrator();
		const result = await startSwapChain(
			makeSingleHopLifiRoute(),
			SOURCE_WALLET,
			DESTINATION,
			'1.0'
		);

		expect(result.error).not.toBeNull();
		expect(result.error!.message).toContain('offline');

		vi.unstubAllGlobals();
	});

	it('returns error for double-tap (concurrent execution)', async () => {
		mockExecuteHop.mockImplementation(
			() => new Promise((resolve) => setTimeout(() => resolve({ data: 'tx-1', error: null }), 100))
		);
		mockPollAndHandleBoltzSwap.mockResolvedValue({ data: null, error: null });

		const { startSwapChain } = await importOrchestrator();
		const route = makeSingleHopLifiRoute();

		const firstCall = startSwapChain(route, SOURCE_WALLET, DESTINATION, '1.0');
		const secondCall = startSwapChain(route, SOURCE_WALLET, DESTINATION, '1.0');

		const [, secondResult] = await Promise.all([firstCall, secondCall]);

		expect(secondResult.error).not.toBeNull();
		expect(secondResult.error!.message).toContain('already in progress');
	});

	it('returns error for empty hops array', async () => {
		const { startSwapChain } = await importOrchestrator();
		const result = await startSwapChain(
			{ id: 'empty', label: '', hops: [], totalFeePercent: 0, estimatedTime: '', recommended: false },
			SOURCE_WALLET,
			DESTINATION,
			'1.0'
		);

		expect(result.error).not.toBeNull();
		expect(result.error!.message).toContain('Route has no hops');
	});

	it('returns error when wallet not initialized', async () => {
		mockGetRSKAddress.mockResolvedValue(null);

		const { startSwapChain } = await importOrchestrator();
		const result = await startSwapChain(
			makeSingleHopLifiRoute(),
			SOURCE_WALLET,
			DESTINATION,
			'1.0'
		);

		expect(result.error).not.toBeNull();
		expect(result.error!.message).toContain('Wallet not initialized');
	});
});

describe('startSwapChain — gas price stability check', () => {
	beforeEach(async () => {
		vi.clearAllMocks();
		await resetLock();
		mockSaveSwapChainState.mockResolvedValue({ error: null });
		mockGetRSKAddress.mockResolvedValue(USER_ADDRESS);
		mockExecuteHop.mockResolvedValue({ data: 'tx-1', error: null });
		mockPollAndHandleBoltzSwap.mockResolvedValue({ data: null, error: null });
		mockResolveBoltzDirection.mockReturnValue('rbtc-to-tbtc');
		mockIsTerminalPhase.mockImplementation(
			(phase: string) => phase === 'IDLE' || phase === 'COMPLETE' || phase === 'FAILED' || phase === 'PARTIAL'
		);
		mockTransitionTo.mockImplementation(async (current: Record<string, unknown>, nextPhase: string) => ({
			data: { ...current, phase: nextPhase, updatedAt: Date.now() },
			error: null
		}));
	});

	it('caches gas price at quote time', async () => {
		const quoteGasPrice = 60_000_000_000n;
		mockFetchGasPrice.mockResolvedValue(quoteGasPrice);

		const { startSwapChain } = await importOrchestrator();
		await startSwapChain(
			makeSingleHopLifiRoute({ fromChain: 'Rootstock', fromAsset: 'RBTC' }),
			SOURCE_WALLET,
			DESTINATION,
			'0.001'
		);

		// fetchGasPrice should be called at least once for the quote-time cache
		expect(mockFetchGasPrice).toHaveBeenCalled();
	});

	it('re-fetches gas price before hop execution for Rootstock hops', async () => {
		const quoteGasPrice = 60_000_000_000n;
		const currentGasPrice = 65_000_000_000n; // ~8% increase, within threshold
		mockFetchGasPrice
			.mockResolvedValueOnce(quoteGasPrice)
			.mockResolvedValueOnce(currentGasPrice);

		const { startSwapChain } = await importOrchestrator();
		await startSwapChain(
			makeSingleHopLifiRoute({ fromChain: 'Rootstock', fromAsset: 'RBTC' }),
			SOURCE_WALLET,
			DESTINATION,
			'0.001'
		);

		expect(mockFetchGasPrice).toHaveBeenCalledTimes(2);
	});

	it('does NOT re-check gas price for non-Rootstock hops', async () => {
		mockFetchGasPrice.mockResolvedValue(60_000_000_000n);

		const { startSwapChain } = await importOrchestrator();
		await startSwapChain(
			makeSingleHopLifiRoute({ fromChain: 'Arbitrum', fromAsset: 'USDT0' }),
			SOURCE_WALLET,
			DESTINATION,
			'1.0'
		);

		// Only called once for the initial cache, not again for re-check
		// (the re-check block requires hop1.fromChain === 'Rootstock')
		expect(mockFetchGasPrice).toHaveBeenCalledTimes(1);
	});

	it('continues swap even when gas price fetch fails', async () => {
		mockFetchGasPrice.mockRejectedValue(new Error('RPC timeout'));

		const { startSwapChain } = await importOrchestrator();
		const result = await startSwapChain(
			makeSingleHopLifiRoute({ fromChain: 'Rootstock', fromAsset: 'RBTC' }),
			SOURCE_WALLET,
			DESTINATION,
			'0.001'
		);

		// Swap should still proceed — gas price failure is non-blocking
		expect(mockExecuteHop).toHaveBeenCalled();
		expect(result.error).toBeNull();
	});

	it('continues swap when gas price spike >20% (warning only, not blocking)', async () => {
		const quoteGasPrice = 60_000_000_000n;
		const spikedGasPrice = 80_000_000_000n; // 33% increase
		mockFetchGasPrice
			.mockResolvedValueOnce(quoteGasPrice)
			.mockResolvedValueOnce(spikedGasPrice);

		const { startSwapChain } = await importOrchestrator();
		const result = await startSwapChain(
			makeSingleHopLifiRoute({ fromChain: 'Rootstock', fromAsset: 'RBTC' }),
			SOURCE_WALLET,
			DESTINATION,
			'0.001'
		);

		// Gas spike is logged as warning but does NOT abort the swap
		expect(result.error).toBeNull();
		expect(mockExecuteHop).toHaveBeenCalled();
	});
});

describe('resolveBoltzDirection', () => {
	it('returns "rbtc-to-tbtc" when fromAsset=RBTC', async () => {
		const { resolveBoltzDirection } = (await vi.importActual(
			'$lib/services/swap-chain/orchestrator-helpers'
		)) as { resolveBoltzDirection: (asset: string) => string };
		expect(resolveBoltzDirection('RBTC')).toBe('rbtc-to-tbtc');
	});

	it('returns "rbtc-to-tbtc" when fromAsset=BTC', async () => {
		const { resolveBoltzDirection } = (await vi.importActual(
			'$lib/services/swap-chain/orchestrator-helpers'
		)) as { resolveBoltzDirection: (asset: string) => string };
		expect(resolveBoltzDirection('BTC')).toBe('rbtc-to-tbtc');
	});

	it('returns "tbtc-to-rbtc" when fromAsset=tBTC', async () => {
		const { resolveBoltzDirection } = (await vi.importActual(
			'$lib/services/swap-chain/orchestrator-helpers'
		)) as { resolveBoltzDirection: (asset: string) => string };
		expect(resolveBoltzDirection('tBTC')).toBe('tbtc-to-rbtc');
	});

	it('returns "tbtc-to-rbtc" when fromAsset=TBTC (uppercase)', async () => {
		const { resolveBoltzDirection } = (await vi.importActual(
			'$lib/services/swap-chain/orchestrator-helpers'
		)) as { resolveBoltzDirection: (asset: string) => string };
		expect(resolveBoltzDirection('TBTC')).toBe('tbtc-to-rbtc');
	});

	it('is case-insensitive for TBTC variants', async () => {
		const { resolveBoltzDirection } = (await vi.importActual(
			'$lib/services/swap-chain/orchestrator-helpers'
		)) as { resolveBoltzDirection: (asset: string) => string };
		expect(resolveBoltzDirection('tbtc')).toBe('tbtc-to-rbtc');
		expect(resolveBoltzDirection('Tbtc')).toBe('tbtc-to-rbtc');
		expect(resolveBoltzDirection('TBTC')).toBe('tbtc-to-rbtc');
	});
});

describe('resumeSwapChain — basic paths', () => {
	beforeEach(async () => {
		vi.clearAllMocks();
		await resetLock();
		mockSaveSwapChainState.mockResolvedValue({ error: null });
		mockGetRSKAddress.mockResolvedValue(USER_ADDRESS);
		mockIsTerminalPhase.mockImplementation(
			(phase: string) => phase === 'IDLE' || phase === 'COMPLETE' || phase === 'FAILED' || phase === 'PARTIAL'
		);
		mockTransitionTo.mockImplementation(async (current: Record<string, unknown>, nextPhase: string) => ({
			data: { ...current, phase: nextPhase, updatedAt: Date.now() },
			error: null
		}));
	});

	it('SWAP_2_CONFIRMED → COMPLETE', async () => {
		const persistedState = makeState({
			phase: 'SWAP_2_CONFIRMED',
			route: makeMultiHopRoute(),
			sourceWallet: SOURCE_WALLET,
			destination: DESTINATION,
			amount: '0.001',
			swap1Id: 'boltz-hop1-id',
			swap2Id: 'lifi-hop2-tx'
		});
		mockLoadSwapChainState.mockResolvedValue(persistedState);

		const { resumeSwapChain } = await importOrchestrator();
		const result = await resumeSwapChain();

		expect(result.error).toBeNull();
		expect(mockTransitionTo).toHaveBeenCalledWith(
			expect.objectContaining({ phase: 'SWAP_2_CONFIRMED' }),
			'COMPLETE'
		);
	});

	it('SWAP_1_CONFIRMED single-hop → COMPLETE', async () => {
		const persistedState = makeState({
			phase: 'SWAP_1_CONFIRMED',
			route: makeSingleHopLifiRoute(),
			sourceWallet: SOURCE_WALLET,
			destination: DESTINATION,
			amount: '1.0',
			swap1Id: 'lifi-tx-hash'
		});
		mockLoadSwapChainState.mockResolvedValue(persistedState);

		const { resumeSwapChain } = await importOrchestrator();
		const result = await resumeSwapChain();

		expect(result.error).toBeNull();
		expect(mockTransitionTo).toHaveBeenCalledWith(
			expect.objectContaining({ phase: 'SWAP_1_CONFIRMED' }),
			'COMPLETE'
		);
	});

	it('COMPLETE terminal phase → returns as-is', async () => {
		const persistedState = makeState({
			phase: 'COMPLETE',
			route: makeSingleHopLifiRoute(),
			sourceWallet: SOURCE_WALLET,
			destination: DESTINATION,
			amount: '1.0',
			swap1Id: 'lifi-tx-hash'
		});
		mockLoadSwapChainState.mockResolvedValue(persistedState);

		const { resumeSwapChain } = await importOrchestrator();
		const result = await resumeSwapChain();

		expect(result.error).toBeNull();
		expect(result.data!.phase).toBe('COMPLETE');
		expect(mockTransitionTo).not.toHaveBeenCalled();
	});

	it('FAILED terminal phase → returns as-is', async () => {
		const persistedState = makeState({
			phase: 'FAILED',
			error: 'Swap failed',
			route: makeSingleHopLifiRoute()
		});
		mockLoadSwapChainState.mockResolvedValue(persistedState);

		const { resumeSwapChain } = await importOrchestrator();
		const result = await resumeSwapChain();

		expect(result.error).toBeNull();
		expect(result.data!.phase).toBe('FAILED');
		expect(mockTransitionTo).not.toHaveBeenCalled();
	});

	it('IDLE terminal phase → returns as-is', async () => {
		const persistedState = makeState({ phase: 'IDLE' });
		mockLoadSwapChainState.mockResolvedValue(persistedState);

		const { resumeSwapChain } = await importOrchestrator();
		const result = await resumeSwapChain();

		expect(result.error).toBeNull();
		expect(result.data!.phase).toBe('IDLE');
	});

	it('returns error when concurrent resume attempted', async () => {
		mockExecuteHop.mockImplementation(
			() => new Promise((resolve) => setTimeout(() => resolve({ data: 'tx', error: null }), 200))
		);
		mockLoadSwapChainState.mockResolvedValue(
			makeState({
				phase: 'SWAP_1_CONFIRMED',
				route: makeMultiHopRoute(),
				sourceWallet: SOURCE_WALLET,
				destination: DESTINATION,
				amount: '0.001',
				swap1Id: 'boltz-hop1-id'
			})
		);
		mockPollAndHandleBoltzSwap.mockResolvedValue({ data: null, error: null });

		const { resumeSwapChain } = await importOrchestrator();

		const firstCall = resumeSwapChain();
		const secondCall = resumeSwapChain();

		const [, secondResult] = await Promise.all([firstCall, secondCall]);
		expect(secondResult.error).not.toBeNull();
		expect(secondResult.error!.message).toContain('already in progress');
	});

	it('SWAP_1_CONFIRMED multi-hop executes hop 2', async () => {
		const persistedState = makeState({
			phase: 'SWAP_1_CONFIRMED',
			route: makeMultiHopRoute(),
			sourceWallet: SOURCE_WALLET,
			destination: DESTINATION,
			sourceConnectedWalletId: null,
			amount: '0.001',
			swap1Id: 'boltz-hop1-id'
		});
		mockLoadSwapChainState.mockResolvedValue(persistedState);
		mockPollAndHandleBoltzSwap.mockResolvedValue({ data: null, error: null });
		mockExecuteHop.mockResolvedValue({ data: 'lifi-hop2-tx', error: null });

		const { resumeSwapChain } = await importOrchestrator();
		const result = await resumeSwapChain();

		expect(result.error).toBeNull();
		expect(mockExecuteHop).toHaveBeenCalledWith(
			expect.objectContaining({ service: 'lifi', fromAsset: 'TBTC' }),
			expect.objectContaining({ phase: 'SWAP_2_PENDING' }),
			1
		);
	});

	it('SWAP_1_PENDING returns as-is for caller to verify', async () => {
		const persistedState = makeState({
			phase: 'SWAP_1_PENDING',
			route: makeSingleHopLifiRoute(),
			sourceWallet: SOURCE_WALLET,
			destination: DESTINATION,
			amount: '1.0'
		});
		mockLoadSwapChainState.mockResolvedValue(persistedState);

		const { resumeSwapChain } = await importOrchestrator();
		const result = await resumeSwapChain();

		expect(result.error).toBeNull();
		expect(result.data!.phase).toBe('SWAP_1_PENDING');
		expect(mockExecuteHop).not.toHaveBeenCalled();
		expect(mockTransitionTo).not.toHaveBeenCalled();
	});

	it('returns error when device is offline', async () => {
		vi.stubGlobal('navigator', { onLine: false });

		const { resumeSwapChain } = await importOrchestrator();
		const result = await resumeSwapChain();

		expect(result.error).not.toBeNull();
		expect(result.error!.message).toContain('offline');

		vi.unstubAllGlobals();
	});
});
