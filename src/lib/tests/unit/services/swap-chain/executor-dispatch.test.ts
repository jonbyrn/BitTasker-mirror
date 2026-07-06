/**
 * Swap Chain — Hop Executor Dispatcher Unit Tests
 *
 * Tests `executeHop` from `src/lib/services/swap-chain/executors/index.ts`.
 *
 * Verifies that the dispatcher routes each hop to the correct service
 * executor based on `hop.service`, and returns an error for unknown services.
 *
 * All executor modules and external dependencies are mocked.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mutable mocks — executor return values
// ---------------------------------------------------------------------------

const { mockExecuteBoltzHop } = vi.hoisted(() => ({
	mockExecuteBoltzHop: vi.fn()
}));

const { mockExecuteChangellyHop } = vi.hoisted(() => ({
	mockExecuteChangellyHop: vi.fn()
}));

const { mockExecuteLifiHop } = vi.hoisted(() => ({
	mockExecuteLifiHop: vi.fn()
}));

const { mockExecuteSymbiosisHop } = vi.hoisted(() => ({
	mockExecuteSymbiosisHop: vi.fn()
}));

const { mockExecuteUniswapV3Hop } = vi.hoisted(() => ({
	mockExecuteUniswapV3Hop: vi.fn()
}));

const { mockExecuteDirectHop } = vi.hoisted(() => ({
	mockExecuteDirectHop: vi.fn()
}));

const { mockExecuteConnectedERC20Transfer } = vi.hoisted(() => ({
	mockExecuteConnectedERC20Transfer: vi.fn()
}));

const { mockAddBreadcrumb } = vi.hoisted(() => ({
	mockAddBreadcrumb: vi.fn()
}));

const { mockLog } = vi.hoisted(() => ({
	mockLog: vi.fn()
}));

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('$lib/utils/debug', () => ({
	createDebug: () => ({
		log: mockLog,
		warn: vi.fn(),
		error: vi.fn(),
		extend: () => ({ log: vi.fn(), warn: vi.fn(), error: vi.fn() })
	})
}));

vi.mock('@sentry/sveltekit', () => ({
	addBreadcrumb: mockAddBreadcrumb,
	captureException: vi.fn()
}));

vi.mock('$lib/services/swap-chain/boltz', () => ({
	executeBoltzHop: mockExecuteBoltzHop
}));

vi.mock('$lib/services/swap-chain/executors/changelly', () => ({
	executeChangellyHop: mockExecuteChangellyHop
}));

vi.mock('$lib/services/swap-chain/executors/lifi', () => ({
	executeLifiHop: mockExecuteLifiHop
}));

vi.mock('$lib/services/swap-chain/executors/symbiosis', () => ({
	executeSymbiosisHop: mockExecuteSymbiosisHop
}));

vi.mock('$lib/services/swap-chain/executors/uniswap-v3', () => ({
	executeUniswapV3Hop: mockExecuteUniswapV3Hop
}));

vi.mock('$lib/services/swap-chain/executors/direct', () => ({
	executeDirectHop: mockExecuteDirectHop,
	executeConnectedERC20Transfer: mockExecuteConnectedERC20Transfer
}));

// ---------------------------------------------------------------------------
// Imports (after mocks are set up)
// ---------------------------------------------------------------------------

import { executeHop } from '$lib/services/swap-chain/executors/index';
import type { RouteHop } from '$lib/services/route-resolver';
import type { SwapChainState } from '$lib/services/swap-chain/state';
import { INITIAL_SWAP_CHAIN_STATE } from '$lib/services/swap-chain/state';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeHop(overrides: Partial<RouteHop> = {}): RouteHop {
	return {
		service: 'direct',
		fromAsset: 'RBTC',
		fromChain: 'rsk',
		toAsset: 'USDT',
		toChain: 'rsk',
		feePercent: 0.5,
		estimatedTimeMin: 1,
		estimatedTimeMax: 5,
		...overrides
	};
}

function makeState(overrides: Partial<SwapChainState> = {}): SwapChainState {
	return {
		...INITIAL_SWAP_CHAIN_STATE,
		phase: 'SWAP_1_PENDING',
		amount: '100000',
		...overrides
	};
}

const SUCCESS_RESULT = { data: 'tx-hash-abc123', error: null };
const FAILURE_RESULT = { data: null, error: new Error('executor failed') };

// ---------------------------------------------------------------------------
// BeforeEach — reset all mock state
// ---------------------------------------------------------------------------

beforeEach(() => {
	vi.clearAllMocks();

	// Default: all executors succeed
	mockExecuteBoltzHop.mockResolvedValue(SUCCESS_RESULT);
	mockExecuteChangellyHop.mockResolvedValue(SUCCESS_RESULT);
	mockExecuteLifiHop.mockResolvedValue(SUCCESS_RESULT);
	mockExecuteSymbiosisHop.mockResolvedValue(SUCCESS_RESULT);
	mockExecuteUniswapV3Hop.mockResolvedValue(SUCCESS_RESULT);
	mockExecuteDirectHop.mockResolvedValue(SUCCESS_RESULT);
});

// ===========================================================================
// Tests
// ===========================================================================

describe('executeHop', () => {
	// ── Service dispatch ────────────────────────────────────────────────

	it('dispatches to executeBoltzHop for boltz service', async () => {
		const hop = makeHop({ service: 'boltz' });
		const state = makeState();

		const result = await executeHop(hop, state, 0);

		expect(mockExecuteBoltzHop).toHaveBeenCalledTimes(1);
		expect(mockExecuteBoltzHop).toHaveBeenCalledWith(hop, state);
		expect(result).toEqual(SUCCESS_RESULT);
	});

	it('dispatches to executeChangellyHop for changelly service', async () => {
		const hop = makeHop({ service: 'changelly' });
		const state = makeState();

		const result = await executeHop(hop, state, 1);

		expect(mockExecuteChangellyHop).toHaveBeenCalledTimes(1);
		expect(mockExecuteChangellyHop).toHaveBeenCalledWith(hop, state, 1);
		expect(result).toEqual(SUCCESS_RESULT);
	});

	it('dispatches to executeLifiHop for lifi service', async () => {
		const hop = makeHop({ service: 'lifi' });
		const state = makeState();

		const result = await executeHop(hop, state, 0);

		expect(mockExecuteLifiHop).toHaveBeenCalledTimes(1);
		expect(mockExecuteLifiHop).toHaveBeenCalledWith(hop, state);
		expect(result).toEqual(SUCCESS_RESULT);
	});

	it('dispatches to executeSymbiosisHop for symbiosis service', async () => {
		const hop = makeHop({ service: 'symbiosis' });
		const state = makeState();

		const result = await executeHop(hop, state, 0);

		expect(mockExecuteSymbiosisHop).toHaveBeenCalledTimes(1);
		expect(mockExecuteSymbiosisHop).toHaveBeenCalledWith(hop, state);
		expect(result).toEqual(SUCCESS_RESULT);
	});

	it('dispatches to executeUniswapV3Hop for uniswap-v3 service', async () => {
		const hop = makeHop({ service: 'uniswap-v3' });
		const state = makeState();

		const result = await executeHop(hop, state, 0);

		expect(mockExecuteUniswapV3Hop).toHaveBeenCalledTimes(1);
		expect(mockExecuteUniswapV3Hop).toHaveBeenCalledWith(hop, state);
		expect(result).toEqual(SUCCESS_RESULT);
	});

	it('dispatches to executeDirectHop for direct service', async () => {
		const hop = makeHop({ service: 'direct' });
		const state = makeState();

		const result = await executeHop(hop, state, 0);

		expect(mockExecuteDirectHop).toHaveBeenCalledTimes(1);
		expect(mockExecuteDirectHop).toHaveBeenCalledWith(hop, state);
		expect(result).toEqual(SUCCESS_RESULT);
	});

	// ── Unknown service ─────────────────────────────────────────────────

	it('returns error for unknown service type', async () => {
		const hop = makeHop({ service: 'unknown-provider' as unknown as RouteHop['service'] });
		const state = makeState();

		const result = await executeHop(hop, state, 0);

		expect(result.data).toBeNull();
		expect(result.error).toBeInstanceOf(Error);
		expect(result.error?.message).toContain('Unknown hop service');
		expect(result.error?.message).toContain('unknown-provider');
	});

	// ── Error propagation ───────────────────────────────────────────────

	it('propagates executor errors to caller', async () => {
		mockExecuteBoltzHop.mockResolvedValueOnce(FAILURE_RESULT);
		const hop = makeHop({ service: 'boltz' });
		const state = makeState();

		const result = await executeHop(hop, state, 0);

		expect(result.data).toBeNull();
		expect(result.error).toBeInstanceOf(Error);
		expect(result.error?.message).toBe('executor failed');
	});

	// ── Sentry breadcrumb ───────────────────────────────────────────────

	it('adds a Sentry breadcrumb before dispatching', async () => {
		const hop = makeHop({
			service: 'boltz',
			fromAsset: 'RBTC',
			fromChain: 'rsk',
			toAsset: 'tBTC',
			toChain: 'arbitrum'
		});
		const state = makeState();

		await executeHop(hop, state, 2);

		expect(mockAddBreadcrumb).toHaveBeenCalledWith(
			expect.objectContaining({
				category: 'swap-chain.hop',
				message: 'Executing hop 3',
				data: expect.objectContaining({
					service: 'boltz',
					from: 'RBTC/rsk',
					to: 'tBTC/arbitrum'
				})
			})
		);
	});

	// ── hopIndex forwarding ─────────────────────────────────────────────

	it('passes hopIndex to executeChangellyHop (which receives it as 3rd arg)', async () => {
		const hop = makeHop({ service: 'changelly' });
		const state = makeState();

		await executeHop(hop, state, 5);

		expect(mockExecuteChangellyHop).toHaveBeenCalledWith(hop, state, 5);
	});

	// ── Only one executor is called per dispatch ────────────────────────

	it('calls exactly one executor per invocation', async () => {
		const services: Array<{ service: RouteHop['service']; mock: ReturnType<typeof vi.fn> }> = [
			{ service: 'boltz', mock: mockExecuteBoltzHop },
			{ service: 'changelly', mock: mockExecuteChangellyHop },
			{ service: 'lifi', mock: mockExecuteLifiHop },
			{ service: 'symbiosis', mock: mockExecuteSymbiosisHop },
			{ service: 'uniswap-v3', mock: mockExecuteUniswapV3Hop },
			{ service: 'direct', mock: mockExecuteDirectHop }
		];

		for (const { service, mock } of services) {
			vi.clearAllMocks();
			const hop = makeHop({ service });
			await executeHop(hop, makeState(), 0);
			expect(mock).toHaveBeenCalledTimes(1);
			// Verify no other executor was called
			const allMocks = [
				mockExecuteBoltzHop,
				mockExecuteChangellyHop,
				mockExecuteLifiHop,
				mockExecuteSymbiosisHop,
				mockExecuteUniswapV3Hop,
				mockExecuteDirectHop
			];
			for (const otherMock of allMocks) {
				if (otherMock !== mock) {
					expect(otherMock).not.toHaveBeenCalled();
				}
			}
		}
	});
});
