/**
 * Route Engine — Unit Tests
 *
 * Tests resolveRoutes() core logic: parallel provider queries,
 * partial failure handling, ranking, recommended flag, AbortSignal,
 * and same-token same-chain detection.
 *
 * Mocks all providers at the module boundary.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock all providers before importing engine
// vi.hoisted() ensures these are available when vi.mock() factories run
// ---------------------------------------------------------------------------

const {
	mockDirectProvider,
	mockBoltzProvider,
	mockSymbiosisProvider,
	mockLifiProvider,
	mockChangellyProvider,
	mockUniswapV3Provider
} = vi.hoisted(() => ({
	mockDirectProvider: {
		name: 'direct' as const,
		supports: vi.fn(),
		getQuote: vi.fn()
	},
	mockBoltzProvider: {
		name: 'boltz' as const,
		supports: vi.fn(),
		getQuote: vi.fn()
	},
	mockSymbiosisProvider: {
		name: 'symbiosis' as const,
		supports: vi.fn(),
		getQuote: vi.fn()
	},
	mockLifiProvider: {
		name: 'lifi' as const,
		supports: vi.fn(),
		getQuote: vi.fn()
	},
	mockChangellyProvider: {
		name: 'changelly' as const,
		supports: vi.fn(),
		getQuote: vi.fn()
	},
	mockUniswapV3Provider: {
		name: 'uniswap-v3' as const,
		supports: vi.fn(),
		getQuote: vi.fn()
	}
}));

vi.mock('$lib/services/route-engine/providers/direct.provider', () => ({
	directProvider: mockDirectProvider
}));

vi.mock('$lib/services/route-engine/providers/boltz.provider', () => ({
	boltzProvider: mockBoltzProvider
}));

vi.mock('$lib/services/route-engine/providers/symbiosis.provider', () => ({
	symbiosisProvider: mockSymbiosisProvider
}));

vi.mock('$lib/services/route-engine/providers/lifi.provider', () => ({
	lifiProvider: mockLifiProvider
}));

vi.mock('$lib/services/route-engine/providers/changelly.provider', () => ({
	changellyProvider: mockChangellyProvider
}));

vi.mock('$lib/services/route-engine/providers/uniswap-v3.provider', () => ({
	uniswapV3Provider: mockUniswapV3Provider
}));

vi.mock('$lib/services/route-engine/boltz-two-hop', () => ({
	buildBoltzTwoHopRoute: vi.fn().mockResolvedValue(null),
	BOLTZ_TWO_HOP_PAIRS: {
		'rbtc->wbtc-arb': {
			intermediary: 'tbtc-arb',
			hop2Providers: ['symbiosis', 'lifi', 'uniswap-v3']
		},
		'rbtc->usdt0-arb': { intermediary: 'tbtc-arb', hop2Providers: ['symbiosis', 'lifi'] },
		'usdt0-arb->rbtc': {
			intermediary: 'tbtc-arb',
			hop1Provider: 'lifi',
			hop2Providers: []
		},
		'wbtc-arb->rbtc': {
			intermediary: 'tbtc-arb',
			hop1Provider: 'uniswap-v3',
			hop2Providers: []
		},
		'btc->usdt0-arb': { intermediary: 'tbtc-arb', hop2Providers: ['lifi', 'symbiosis'] },
		'btc->wbtc-arb': {
			intermediary: 'tbtc-arb',
			hop2Providers: ['lifi', 'symbiosis', 'uniswap-v3']
		}
	}
}));

vi.mock('$lib/utils/debug', () => ({
	createDebug: () => ({
		log: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		debug: vi.fn()
	})
}));

import {
	resolveRoutes,
	rankRoutes,
	shouldCheckBoltzOptimization
} from '$lib/services/route-engine/engine';
import { TOKENS } from '$lib/services/route-engine/token-registry';
import { buildBoltzTwoHopRoute } from '$lib/services/route-engine/boltz-two-hop';
import type { Route } from '$lib/services/route-resolver';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRoute(id: string, feePercent: number, service: string = 'symbiosis'): Route {
	return {
		id,
		label: `Test ${id}`,
		hops: [
			{
				service: service as Route['hops'][0]['service'],
				fromAsset: 'RBTC',
				fromChain: 'rsk',
				toAsset: 'USDT',
				toChain: 'bsc',
				feePercent,
				estimatedTimeMin: 1,
				estimatedTimeMax: 10
			}
		],
		totalFeePercent: feePercent,
		estimatedTime: '10 min',
		recommended: false
	};
}

function makeAddrDest(chainId: number, asset?: string) {
	return {
		type: 'address' as const,
		chainId,
		address: '0x742d35Cc6634C0532925a3b844Bc454e4438f44e',
		...(asset ? { asset } : {})
	};
}

function makeInvoiceDest(network: 'lightning' | 'onchain') {
	return { type: 'invoice' as const, network, invoice: 'lnbc1...' };
}

// ---------------------------------------------------------------------------
// resolveRoutes()
// ---------------------------------------------------------------------------

describe('resolveRoutes()', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		// By default: no provider supports anything
		mockDirectProvider.supports.mockReturnValue(false);
		mockBoltzProvider.supports.mockReturnValue(false);
		mockSymbiosisProvider.supports.mockReturnValue(false);
		mockLifiProvider.supports.mockReturnValue(false);
		mockChangellyProvider.supports.mockReturnValue(false);
		mockUniswapV3Provider.supports.mockReturnValue(false);
		mockDirectProvider.getQuote.mockResolvedValue(null);
		mockBoltzProvider.getQuote.mockResolvedValue(null);
		mockSymbiosisProvider.getQuote.mockResolvedValue(null);
		mockLifiProvider.getQuote.mockResolvedValue(null);
		mockChangellyProvider.getQuote.mockResolvedValue(null);
		mockUniswapV3Provider.getQuote.mockResolvedValue(null);
		vi.mocked(buildBoltzTwoHopRoute).mockResolvedValue(null);
	});

	it('queries all eligible providers in parallel', async () => {
		mockSymbiosisProvider.supports.mockReturnValue(true);
		mockLifiProvider.supports.mockReturnValue(true);
		mockSymbiosisProvider.getQuote.mockResolvedValue(makeRoute('sym', 0.3));
		mockLifiProvider.getQuote.mockResolvedValue(makeRoute('lifi', 0.5));

		await resolveRoutes('rbtc', makeAddrDest(56), 100_000);

		// Both eligible providers should have been called
		expect(mockSymbiosisProvider.getQuote).toHaveBeenCalledTimes(1);
		expect(mockLifiProvider.getQuote).toHaveBeenCalledTimes(1);
		// Non-eligible providers should NOT be called
		expect(mockBoltzProvider.getQuote).not.toHaveBeenCalled();
	});

	it('partial failure: 2 providers fail, 1 succeeds → returns 1 route', async () => {
		mockSymbiosisProvider.supports.mockReturnValue(true);
		mockLifiProvider.supports.mockReturnValue(true);
		mockChangellyProvider.supports.mockReturnValue(true);

		mockSymbiosisProvider.getQuote.mockResolvedValue(makeRoute('sym', 0.3));
		mockLifiProvider.getQuote.mockRejectedValue(new Error('LI.FI down'));
		mockChangellyProvider.getQuote.mockResolvedValue(null);

		const result = await resolveRoutes('rbtc', makeAddrDest(56), 100_000);

		expect(result.routes).toHaveLength(1);
		expect(result.routes[0].id).toBe('sym');
	});

	it('all providers fail → returns empty routes with errors', async () => {
		mockSymbiosisProvider.supports.mockReturnValue(true);
		mockLifiProvider.supports.mockReturnValue(true);

		mockSymbiosisProvider.getQuote.mockRejectedValue(new Error('Symbiosis down'));
		mockLifiProvider.getQuote.mockRejectedValue(new Error('LI.FI down'));

		const result = await resolveRoutes('rbtc', makeAddrDest(56), 100_000);

		expect(result.routes).toHaveLength(0);
		expect(result.recommended).toBeNull();
		expect(result.errors).toHaveLength(2);
		expect(result.errors[0].provider).toBe('symbiosis');
		expect(result.errors[1].provider).toBe('lifi');
	});

	it('all providers return null → returns empty routes, no errors', async () => {
		mockSymbiosisProvider.supports.mockReturnValue(true);
		mockSymbiosisProvider.getQuote.mockResolvedValue(null);

		const result = await resolveRoutes('rbtc', makeAddrDest(56), 100_000);

		expect(result.routes).toHaveLength(0);
		expect(result.errors).toHaveLength(0);
		expect(result.isLive).toBe(true);
	});

	it('ranking: lower fee → first', async () => {
		mockSymbiosisProvider.supports.mockReturnValue(true);
		mockLifiProvider.supports.mockReturnValue(true);
		mockSymbiosisProvider.getQuote.mockResolvedValue(makeRoute('sym', 0.5));
		mockLifiProvider.getQuote.mockResolvedValue(makeRoute('lifi', 0.2));

		const result = await resolveRoutes('rbtc', makeAddrDest(56), 100_000);

		expect(result.routes[0].id).toBe('lifi'); // lower fee first
		expect(result.routes[1].id).toBe('sym');
	});

	it('recommended: first route marked recommended', async () => {
		mockSymbiosisProvider.supports.mockReturnValue(true);
		mockSymbiosisProvider.getQuote.mockResolvedValue(makeRoute('sym', 0.3));

		const result = await resolveRoutes('rbtc', makeAddrDest(56), 100_000);

		expect(result.recommended).not.toBeNull();
		expect(result.recommended!.id).toBe('sym');
		expect(result.routes[0].recommended).toBe(true);
	});

	it('isLive is true for successful resolution', async () => {
		const result = await resolveRoutes('rbtc', makeAddrDest(30), 100_000);
		expect(result.isLive).toBe(true);
	});

	it('isLive is false when signal is already aborted', async () => {
		const controller = new AbortController();
		controller.abort();
		const result = await resolveRoutes('rbtc', makeAddrDest(30), 100_000, controller.signal);
		expect(result.isLive).toBe(false);
		expect(result.routes).toHaveLength(0);
	});

	it('returns empty for unresolvable source/destination', async () => {
		// Destination with unknown chainId and no matching providers → empty
		const result = await resolveRoutes('rbtc', makeAddrDest(999), 100_000);
		// Token resolution may still produce rbtc → nothing, but engine handles it
		expect(result.routes).toHaveLength(0);
	});

	it('Boltz 2-hop: composed route included when buildBoltzTwoHopRoute returns route', async () => {
		mockSymbiosisProvider.supports.mockReturnValue(true);
		mockSymbiosisProvider.getQuote.mockResolvedValue(makeRoute('sym', 0.5));
		vi.mocked(buildBoltzTwoHopRoute).mockResolvedValueOnce(makeRoute('boltz-2hop', 0.3, 'boltz'));

		const result = await resolveRoutes('rbtc', makeAddrDest(42161, 'WBTC'), 100_000);

		// Should include both the symbiosis route and the boltz 2-hop route
		expect(result.routes.length).toBeGreaterThanOrEqual(2);
		const boltzRoute = result.routes.find((r) => r.id === 'boltz-2hop');
		expect(boltzRoute).toBeDefined();
	});

	it('same-token same-chain: returns direct route', async () => {
		mockDirectProvider.supports.mockReturnValue(true);
		mockDirectProvider.getQuote.mockResolvedValue(makeRoute('direct-rbtc', 0, 'direct'));

		const result = await resolveRoutes('rbtc', makeAddrDest(30), 100_000);

		expect(result.routes).toHaveLength(1);
		expect(result.routes[0].hops[0].service).toBe('direct');
		expect(result.routes[0].totalFeePercent).toBe(0);
	});

	it('passes AbortSignal to all provider getQuote calls', async () => {
		mockSymbiosisProvider.supports.mockReturnValue(true);
		mockLifiProvider.supports.mockReturnValue(true);
		mockSymbiosisProvider.getQuote.mockResolvedValue(makeRoute('sym', 0.3));
		mockLifiProvider.getQuote.mockResolvedValue(makeRoute('lifi', 0.5));

		const controller = new AbortController();
		await resolveRoutes('rbtc', makeAddrDest(56), 100_000, controller.signal);

		expect(mockSymbiosisProvider.getQuote).toHaveBeenCalledWith(
			expect.anything(),
			expect.anything(),
			100_000,
			controller.signal,
			undefined // sourceAmountRaw (only set for non-BTC sources)
		);
		expect(mockLifiProvider.getQuote).toHaveBeenCalledWith(
			expect.anything(),
			expect.anything(),
			100_000,
			controller.signal,
			undefined // sourceAmountRaw (only set for non-BTC sources)
		);
	});

	it('invoice destination resolves correctly', async () => {
		mockBoltzProvider.supports.mockReturnValue(true);
		mockBoltzProvider.getQuote.mockResolvedValue(makeRoute('boltz-btc', 1.0, 'boltz'));

		const _result = await resolveRoutes('rbtc', makeInvoiceDest('onchain'), 100_000);

		// boltzProvider.supports should have been called with rbtc and btc tokens
		expect(mockBoltzProvider.supports).toHaveBeenCalled();
	});
});

// ---------------------------------------------------------------------------
// rankRoutes()
// ---------------------------------------------------------------------------

describe('rankRoutes()', () => {
	const AMOUNT = 100_000; // 100k sats for test calculations

	it('sorts by total cost (gas + bridge fee) ascending', () => {
		const routes = [makeRoute('a', 1.0), makeRoute('b', 0.3), makeRoute('c', 0.7)];
		const ranked = rankRoutes(routes, AMOUNT);
		expect(ranked[0].id).toBe('b');
		expect(ranked[1].id).toBe('c');
		expect(ranked[2].id).toBe('a');
	});

	it('prefers lower gas cost when bridge fees are equal', () => {
		const lowGas: Route = {
			id: 'low-gas',
			label: 'Low Gas',
			hops: [
				{
					service: 'boltz',
					fromAsset: 'A',
					fromChain: 'x',
					toAsset: 'B',
					toChain: 'y',
					feePercent: 0.5,
					estimatedTimeMin: 1,
					estimatedTimeMax: 10
				}
			],
			totalFeePercent: 0.5,
			estimatedTime: '10 min',
			recommended: false,
			gasCostWei: '1365000000000' // ~0.14 sats (21k gas)
		};
		const highGas: Route = {
			id: 'high-gas',
			label: 'High Gas',
			hops: [
				{
					service: 'symbiosis',
					fromAsset: 'A',
					fromChain: 'x',
					toAsset: 'B',
					toChain: 'y',
					feePercent: 0.5,
					estimatedTimeMin: 1,
					estimatedTimeMax: 10
				}
			],
			totalFeePercent: 0.5,
			estimatedTime: '10 min',
			recommended: false,
			gasCostWei: '32500000000000' // ~3,250 sats (500k gas)
		};
		const ranked = rankRoutes([highGas, lowGas], AMOUNT);
		expect(ranked[0].id).toBe('low-gas');
	});

	it('tiebreaks by fewer hops when total cost is equal', () => {
		const singleHop: Route = {
			id: 'single',
			label: 'Single',
			hops: [
				{
					service: 'symbiosis',
					fromAsset: 'A',
					fromChain: 'x',
					toAsset: 'B',
					toChain: 'y',
					feePercent: 0.3,
					estimatedTimeMin: 1,
					estimatedTimeMax: 10
				}
			],
			totalFeePercent: 0.3,
			estimatedTime: '10 min',
			recommended: false
		};
		const doubleHop: Route = {
			id: 'double',
			label: 'Double',
			hops: [
				{
					service: 'boltz',
					fromAsset: 'A',
					fromChain: 'x',
					toAsset: 'M',
					toChain: 'y',
					feePercent: 0.2,
					estimatedTimeMin: 5,
					estimatedTimeMax: 10
				},
				{
					service: 'symbiosis',
					fromAsset: 'M',
					fromChain: 'y',
					toAsset: 'B',
					toChain: 'z',
					feePercent: 0.1,
					estimatedTimeMin: 1,
					estimatedTimeMax: 5
				}
			],
			totalFeePercent: 0.3,
			estimatedTime: '15 min',
			recommended: false
		};

		const ranked = rankRoutes([doubleHop, singleHop], AMOUNT);
		expect(ranked[0].id).toBe('single'); // fewer hops preferred
	});

	it('tiebreaks by ID when cost and hops are equal', () => {
		const ranked = rankRoutes([makeRoute('z', 0.3), makeRoute('a', 0.3)], AMOUNT);
		expect(ranked[0].id).toBe('a');
		expect(ranked[1].id).toBe('z');
	});

	it('does not mutate the original array', () => {
		const routes = [makeRoute('a', 1.0), makeRoute('b', 0.3)];
		const original = [...routes];
		rankRoutes(routes, AMOUNT);
		expect(routes[0].id).toBe(original[0].id);
	});

	it('handles empty array', () => {
		expect(rankRoutes([], AMOUNT)).toEqual([]);
	});

	it('handles single route', () => {
		const ranked = rankRoutes([makeRoute('only', 0.5)], AMOUNT);
		expect(ranked).toHaveLength(1);
	});
});

// ---------------------------------------------------------------------------
// shouldCheckBoltzOptimization()
// ---------------------------------------------------------------------------

describe('shouldCheckBoltzOptimization()', () => {
	it('returns true for known pair rbtc→wbtc-arb', () => {
		expect(shouldCheckBoltzOptimization(TOKENS['rbtc'], TOKENS['wbtc-arb'])).toBe(true);
	});

	it('returns true for known pair usdt0-arb→rbtc', () => {
		expect(shouldCheckBoltzOptimization(TOKENS['usdt0-arb'], TOKENS['rbtc'])).toBe(true);
	});

	it('returns false for unknown pair rbtc→usdt-bsc', () => {
		expect(shouldCheckBoltzOptimization(TOKENS['rbtc'], TOKENS['usdt-bsc'])).toBe(false);
	});
});
