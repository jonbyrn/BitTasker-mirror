/**
 * Route Engine — Boltz 2-Hop Composition Tests
 *
 * Tests BOLTZ_TWO_HOP_PAIRS constant, buildBoltzTwoHopRoute composition logic
 * (both Boltz-first and Boltz-last modes), failure paths, route composition math,
 * and AbortSignal handling.
 *
 * Mocks all provider modules at the boundary; lets tryCatch and TOKENS be real.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock providers before importing module under test
// ---------------------------------------------------------------------------

const {
	mockBoltzGetQuote,
	mockSymbiosisGetQuote,
	mockLifiGetQuote,
	mockUniswapV3GetQuote,
	mockSymbiosisSupports,
	mockLifiSupports,
	mockUniswapV3Supports
} = vi.hoisted(() => ({
	mockBoltzGetQuote: vi.fn(),
	mockSymbiosisGetQuote: vi.fn(),
	mockLifiGetQuote: vi.fn(),
	mockUniswapV3GetQuote: vi.fn(),
	mockSymbiosisSupports: vi.fn().mockReturnValue(true),
	mockLifiSupports: vi.fn().mockReturnValue(true),
	mockUniswapV3Supports: vi.fn().mockReturnValue(true)
}));

vi.mock('$lib/services/route-engine/providers/boltz.provider', () => ({
	boltzProvider: { name: 'boltz', supports: vi.fn(), getQuote: mockBoltzGetQuote }
}));

vi.mock('$lib/services/route-engine/providers/symbiosis.provider', () => ({
	symbiosisProvider: {
		name: 'symbiosis',
		supports: mockSymbiosisSupports,
		getQuote: mockSymbiosisGetQuote
	}
}));

vi.mock('$lib/services/route-engine/providers/lifi.provider', () => ({
	lifiProvider: { name: 'lifi', supports: mockLifiSupports, getQuote: mockLifiGetQuote }
}));

vi.mock('$lib/services/route-engine/providers/uniswap-v3.provider', () => ({
	uniswapV3Provider: {
		name: 'uniswap-v3',
		supports: mockUniswapV3Supports,
		getQuote: mockUniswapV3GetQuote
	}
}));

vi.mock('$lib/utils/debug', () => ({
	createDebug: () => ({ log: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() })
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import {
	buildBoltzTwoHopRoute,
	BOLTZ_TWO_HOP_PAIRS
} from '$lib/services/route-engine/boltz-two-hop';
import { TOKENS } from '$lib/services/route-engine/token-registry';
import type { Token } from '$lib/services/route-engine/types';
import type { Route, RouteHop } from '$lib/services/route-resolver';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeQuoteRoute(service: string, feePercent: number, timeMin = 2, timeMax = 5): Route {
	return {
		id: `mock-${service}`,
		label: `Mock ${service}`,
		hops: [
			{
				service: service as RouteHop['service'],
				fromAsset: 'A',
				fromChain: 'a',
				toAsset: 'B',
				toChain: 'b',
				feePercent,
				estimatedTimeMin: timeMin,
				estimatedTimeMax: timeMax
			}
		],
		totalFeePercent: feePercent,
		estimatedTime: `${timeMin}-${timeMax} min`,
		recommended: false
	};
}

/** Create a minimal Token stub with just the key (for pair-key lookup). */
function makeToken(key: string): Token {
	return {
		key,
		symbol: key.toUpperCase(),
		address: '',
		chain: '',
		chainId: 0,
		decimals: 8,
		native: false
	};
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
	vi.clearAllMocks();
	// Default: all providers support all pairs (individual tests can override)
	mockSymbiosisSupports.mockReturnValue(true);
	mockLifiSupports.mockReturnValue(true);
	mockUniswapV3Supports.mockReturnValue(true);
});

// ---------------------------------------------------------------------------
// BOLTZ_TWO_HOP_PAIRS constant
// ---------------------------------------------------------------------------

describe('BOLTZ_TWO_HOP_PAIRS', () => {
	it('has exactly 6 entries', () => {
		expect(Object.keys(BOLTZ_TWO_HOP_PAIRS)).toHaveLength(6);
	});

	it('each entry uses tbtc-arb as intermediary', () => {
		for (const [key, config] of Object.entries(BOLTZ_TWO_HOP_PAIRS)) {
			expect(config.intermediary, `${key} intermediary`).toBe('tbtc-arb');
		}
	});

	it('each entry has at least one provider configured (hop1 or hop2)', () => {
		for (const [key, config] of Object.entries(BOLTZ_TWO_HOP_PAIRS)) {
			const hasProviders = !!config.hop1Provider || config.hop2Providers.length > 0;
			expect(hasProviders, `${key} has providers`).toBe(true);
		}
	});

	it('expected pair keys are present', () => {
		const keys = Object.keys(BOLTZ_TWO_HOP_PAIRS);
		expect(keys).toContain('rbtc->wbtc-arb');
		expect(keys).toContain('rbtc->usdt0-arb');
		expect(keys).toContain('usdt0-arb->rbtc');
		expect(keys).toContain('wbtc-arb->rbtc');
		expect(keys).toContain('btc->usdt0-arb');
		expect(keys).toContain('btc->wbtc-arb');
	});

	it('wbtc-arb->usdt0-arb is not a 2-hop pair (direct Uniswap V3 handles it)', () => {
		expect(BOLTZ_TWO_HOP_PAIRS['wbtc-arb->usdt0-arb']).toBeUndefined();
	});

	it('usdt0-arb→rbtc uses boltz-last mode (hop1Provider = lifi)', () => {
		const config = BOLTZ_TWO_HOP_PAIRS['usdt0-arb->rbtc'];
		expect(config.hop1Provider).toBe('lifi');
	});

	it('wbtc-arb→rbtc uses boltz-last mode (hop1Provider = uniswap-v3)', () => {
		const config = BOLTZ_TWO_HOP_PAIRS['wbtc-arb->rbtc'];
		expect(config.hop1Provider).toBe('uniswap-v3');
	});

	it('boltz-first pairs have no hop1Provider', () => {
		for (const key of ['rbtc->wbtc-arb', 'rbtc->usdt0-arb', 'btc->usdt0-arb', 'btc->wbtc-arb']) {
			expect(BOLTZ_TWO_HOP_PAIRS[key].hop1Provider, `${key}`).toBeUndefined();
		}
	});
});

// ---------------------------------------------------------------------------
// buildBoltzTwoHopRoute — Boltz-first mode
// ---------------------------------------------------------------------------

describe('buildBoltzTwoHopRoute — Boltz-first mode', () => {
	it('rbtc→wbtc-arb: boltz hop1 + symbiosis hop2', async () => {
		mockBoltzGetQuote.mockResolvedValueOnce(makeQuoteRoute('boltz', 0.5));
		mockSymbiosisGetQuote.mockResolvedValueOnce(makeQuoteRoute('symbiosis', 0.3));

		const route = await buildBoltzTwoHopRoute(TOKENS['rbtc'], TOKENS['wbtc-arb'], 100_000);

		expect(route).not.toBeNull();
		expect(route!.hops).toHaveLength(2);
		expect(mockBoltzGetQuote).toHaveBeenCalledWith(
			TOKENS['rbtc'],
			TOKENS['tbtc-arb'],
			100_000,
			undefined
		);
		expect(mockSymbiosisGetQuote).toHaveBeenCalled();
		// Now tries all hop2 providers to find cheapest (not just first success)
		expect(mockLifiGetQuote).toHaveBeenCalled();
	});

	it('rbtc→usdt0-arb: boltz hop1 + symbiosis hop2', async () => {
		mockBoltzGetQuote.mockResolvedValueOnce(makeQuoteRoute('boltz', 0.5));
		mockSymbiosisGetQuote.mockResolvedValueOnce(makeQuoteRoute('symbiosis', 0.3));

		const route = await buildBoltzTwoHopRoute(TOKENS['rbtc'], TOKENS['usdt0-arb'], 100_000);

		expect(route).not.toBeNull();
		expect(mockBoltzGetQuote).toHaveBeenCalledWith(
			TOKENS['rbtc'],
			TOKENS['tbtc-arb'],
			100_000,
			undefined
		);
		expect(mockSymbiosisGetQuote).toHaveBeenCalled();
	});

	it('btc→usdt0-arb: boltz hop1 + lifi hop2 (tries all providers for cheapest)', async () => {
		mockBoltzGetQuote.mockResolvedValueOnce(makeQuoteRoute('boltz', 0.5));
		mockLifiGetQuote.mockResolvedValueOnce(makeQuoteRoute('lifi', 0.3));
		mockSymbiosisGetQuote.mockResolvedValueOnce(makeQuoteRoute('symbiosis', 0.2));

		const route = await buildBoltzTwoHopRoute(TOKENS['btc'], TOKENS['usdt0-arb'], 100_000);

		expect(route).not.toBeNull();
		expect(mockLifiGetQuote).toHaveBeenCalled();
		expect(mockSymbiosisGetQuote).toHaveBeenCalled();
	});

	it('btc→wbtc-arb: boltz hop1 + lifi hop2 (tries all providers)', async () => {
		mockBoltzGetQuote.mockResolvedValueOnce(makeQuoteRoute('boltz', 0.5));
		mockLifiGetQuote.mockResolvedValueOnce(makeQuoteRoute('lifi', 0.3));
		mockSymbiosisGetQuote.mockResolvedValueOnce(makeQuoteRoute('symbiosis', 0.2));

		const route = await buildBoltzTwoHopRoute(TOKENS['btc'], TOKENS['wbtc-arb'], 100_000);

		expect(route).not.toBeNull();
		expect(mockLifiGetQuote).toHaveBeenCalled();
		expect(mockSymbiosisGetQuote).toHaveBeenCalled();
	});
});

// ---------------------------------------------------------------------------
// buildBoltzTwoHopRoute — Boltz-last mode
// ---------------------------------------------------------------------------

describe('buildBoltzTwoHopRoute — Boltz-last mode', () => {
	it('usdt0-arb→rbtc: lifi hop1 + boltz hop2', async () => {
		mockLifiGetQuote.mockResolvedValueOnce(makeQuoteRoute('lifi', 0.5));
		mockBoltzGetQuote.mockResolvedValueOnce(makeQuoteRoute('boltz', 0.3));

		const route = await buildBoltzTwoHopRoute(TOKENS['usdt0-arb'], TOKENS['rbtc'], 100_000);

		expect(route).not.toBeNull();
		// Hop1 is lifi (from → intermediary)
		expect(mockLifiGetQuote).toHaveBeenCalledWith(
			TOKENS['usdt0-arb'],
			TOKENS['tbtc-arb'],
			100_000,
			undefined
		);
		// Hop2 is boltz (intermediary → to)
		expect(mockBoltzGetQuote).toHaveBeenCalledWith(
			TOKENS['tbtc-arb'],
			TOKENS['rbtc'],
			expect.any(Number),
			undefined
		);
	});

	it('usdt0-arb→rbtc route label is "LI.FI → Boltz"', async () => {
		mockLifiGetQuote.mockResolvedValueOnce(makeQuoteRoute('lifi', 0.5));
		mockBoltzGetQuote.mockResolvedValueOnce(makeQuoteRoute('boltz', 0.3));

		const route = await buildBoltzTwoHopRoute(TOKENS['usdt0-arb'], TOKENS['rbtc'], 100_000);

		expect(route!.label).toBe('LI.FI → Boltz');
		expect(route!.id).toBe('usdt0-arb->rbtc-via-lifi-boltz');
	});

	it('wbtc-arb→rbtc: uniswap-v3 hop1 + boltz hop2', async () => {
		mockUniswapV3GetQuote.mockResolvedValueOnce(makeQuoteRoute('uniswap-v3', 0.3));
		mockBoltzGetQuote.mockResolvedValueOnce(makeQuoteRoute('boltz', 0.25));

		const route = await buildBoltzTwoHopRoute(TOKENS['wbtc-arb'], TOKENS['rbtc'], 100_000);

		expect(route).not.toBeNull();
		// Hop1 is uniswap-v3 (from → intermediary)
		expect(mockUniswapV3GetQuote).toHaveBeenCalledWith(
			TOKENS['wbtc-arb'],
			TOKENS['tbtc-arb'],
			100_000,
			undefined
		);
		// Hop2 is boltz (intermediary → to)
		expect(mockBoltzGetQuote).toHaveBeenCalledWith(
			TOKENS['tbtc-arb'],
			TOKENS['rbtc'],
			expect.any(Number),
			undefined
		);
	});

	it('wbtc-arb→rbtc route label is "Uniswap V3 → Boltz"', async () => {
		mockUniswapV3GetQuote.mockResolvedValueOnce(makeQuoteRoute('uniswap-v3', 0.3));
		mockBoltzGetQuote.mockResolvedValueOnce(makeQuoteRoute('boltz', 0.25));

		const route = await buildBoltzTwoHopRoute(TOKENS['wbtc-arb'], TOKENS['rbtc'], 100_000);

		expect(route!.label).toBe('Uniswap V3 → Boltz');
		expect(route!.id).toBe('wbtc-arb->rbtc-via-uniswap-v3-boltz');
	});
});

// ---------------------------------------------------------------------------
// Failure cases
// ---------------------------------------------------------------------------

describe('buildBoltzTwoHopRoute — failures', () => {
	it('returns null for unknown pair', async () => {
		const route = await buildBoltzTwoHopRoute(TOKENS['usdt-bsc'], TOKENS['doc-rsk'], 100_000);

		expect(route).toBeNull();
		expect(mockBoltzGetQuote).not.toHaveBeenCalled();
	});

	it('returns null when boltz hop1 returns null (boltz-first)', async () => {
		mockBoltzGetQuote.mockResolvedValueOnce(null);

		const route = await buildBoltzTwoHopRoute(TOKENS['rbtc'], TOKENS['wbtc-arb'], 100_000);

		expect(route).toBeNull();
		expect(mockSymbiosisGetQuote).not.toHaveBeenCalled();
	});

	it('returns null when boltz hop1 throws (boltz-first)', async () => {
		mockBoltzGetQuote.mockRejectedValueOnce(new Error('Boltz API down'));

		const route = await buildBoltzTwoHopRoute(TOKENS['rbtc'], TOKENS['wbtc-arb'], 100_000);

		expect(route).toBeNull();
		expect(mockSymbiosisGetQuote).not.toHaveBeenCalled();
	});

	it('returns null when all hop2 providers fail (boltz-first)', async () => {
		mockBoltzGetQuote.mockResolvedValueOnce(makeQuoteRoute('boltz', 0.5));
		// rbtc->wbtc-arb tries symbiosis then lifi
		mockSymbiosisGetQuote.mockResolvedValueOnce(null);
		mockLifiGetQuote.mockResolvedValueOnce(null);

		const route = await buildBoltzTwoHopRoute(TOKENS['rbtc'], TOKENS['wbtc-arb'], 100_000);

		expect(route).toBeNull();
		expect(mockSymbiosisGetQuote).toHaveBeenCalled();
		expect(mockLifiGetQuote).toHaveBeenCalled();
	});

	it('returns route when first hop2 fails but second succeeds (boltz-first)', async () => {
		mockBoltzGetQuote.mockResolvedValueOnce(makeQuoteRoute('boltz', 0.5));
		mockSymbiosisGetQuote.mockResolvedValueOnce(null);
		mockLifiGetQuote.mockResolvedValueOnce(makeQuoteRoute('lifi', 0.3));

		const route = await buildBoltzTwoHopRoute(TOKENS['rbtc'], TOKENS['wbtc-arb'], 100_000);

		expect(route).not.toBeNull();
		expect(route!.id).toContain('lifi');
		expect(route!.label).toContain('LI.FI');
	});

	it('returns null when hop1 fails in boltz-last mode (lifi)', async () => {
		mockLifiGetQuote.mockResolvedValueOnce(null);

		const route = await buildBoltzTwoHopRoute(TOKENS['usdt0-arb'], TOKENS['rbtc'], 100_000);

		expect(route).toBeNull();
		expect(mockBoltzGetQuote).not.toHaveBeenCalled();
	});

	it('returns null when boltz hop2 fails in boltz-last mode (lifi)', async () => {
		mockLifiGetQuote.mockResolvedValueOnce(makeQuoteRoute('lifi', 0.5));
		mockBoltzGetQuote.mockResolvedValueOnce(null);

		const route = await buildBoltzTwoHopRoute(TOKENS['usdt0-arb'], TOKENS['rbtc'], 100_000);

		expect(route).toBeNull();
	});

	it('returns null when hop1 fails in boltz-last mode (uniswap-v3)', async () => {
		mockUniswapV3GetQuote.mockResolvedValueOnce(null);

		const route = await buildBoltzTwoHopRoute(TOKENS['wbtc-arb'], TOKENS['rbtc'], 100_000);

		expect(route).toBeNull();
		expect(mockBoltzGetQuote).not.toHaveBeenCalled();
	});

	it('returns null when intermediary token is not in registry', async () => {
		// Temporarily add a pair with a non-existent intermediary
		const origLength = Object.keys(BOLTZ_TWO_HOP_PAIRS).length;
		BOLTZ_TWO_HOP_PAIRS['test-a->test-b'] = {
			intermediary: 'nonexistent-token',
			hop2Providers: ['symbiosis']
		};

		try {
			const route = await buildBoltzTwoHopRoute(makeToken('test-a'), makeToken('test-b'), 100_000);

			expect(route).toBeNull();
			expect(mockBoltzGetQuote).not.toHaveBeenCalled();
		} finally {
			delete BOLTZ_TWO_HOP_PAIRS['test-a->test-b'];
			expect(Object.keys(BOLTZ_TWO_HOP_PAIRS)).toHaveLength(origLength);
		}
	});

	it('returns null when boltz hop1 returns route with no hops', async () => {
		mockBoltzGetQuote.mockResolvedValueOnce({ ...makeQuoteRoute('boltz', 0.5), hops: [] });

		const route = await buildBoltzTwoHopRoute(TOKENS['rbtc'], TOKENS['wbtc-arb'], 100_000);

		expect(route).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// Route composition
// ---------------------------------------------------------------------------

describe('route composition', () => {
	it('composed route has exactly 2 hops', async () => {
		mockBoltzGetQuote.mockResolvedValueOnce(makeQuoteRoute('boltz', 0.5));
		mockSymbiosisGetQuote.mockResolvedValueOnce(makeQuoteRoute('symbiosis', 0.3));

		const route = await buildBoltzTwoHopRoute(TOKENS['rbtc'], TOKENS['wbtc-arb'], 100_000);

		expect(route!.hops).toHaveLength(2);
	});

	it('totalFeePercent is derived from input/output difference', async () => {
		// boltz 1% fee, symbiosis 2% fee
		mockBoltzGetQuote.mockResolvedValueOnce(makeQuoteRoute('boltz', 1));
		mockSymbiosisGetQuote.mockResolvedValueOnce(makeQuoteRoute('symbiosis', 2));

		const route = await buildBoltzTwoHopRoute(TOKENS['rbtc'], TOKENS['wbtc-arb'], 100_000);

		// hop1 output: 100_000 * (1 - 0.01) = 99_000
		// hop2 output: 99_000 * (1 - 0.02) = 97_020
		// totalFeePercent: max(0, (100_000 - 97_020) / 100_000 * 100) = 2.98
		expect(route!.totalFeePercent).toBeCloseTo(2.98, 1);
	});

	it('estimatedTime spans the union of both hop time ranges', async () => {
		mockBoltzGetQuote.mockResolvedValueOnce(makeQuoteRoute('boltz', 0.5, 3, 10));
		mockSymbiosisGetQuote.mockResolvedValueOnce(makeQuoteRoute('symbiosis', 0.3, 1, 7));

		const route = await buildBoltzTwoHopRoute(TOKENS['rbtc'], TOKENS['wbtc-arb'], 100_000);

		// min = min(3, 1) = 1, max = max(10, 7) = 10
		expect(route!.estimatedTime).toBe('1-10 min');
	});

	it('first hop uses boltz service, second uses symbiosis (boltz-first)', async () => {
		mockBoltzGetQuote.mockResolvedValueOnce(makeQuoteRoute('boltz', 0.5));
		mockSymbiosisGetQuote.mockResolvedValueOnce(makeQuoteRoute('symbiosis', 0.3));

		const route = await buildBoltzTwoHopRoute(TOKENS['rbtc'], TOKENS['wbtc-arb'], 100_000);

		expect(route!.hops[0].service).toBe('boltz');
		expect(route!.hops[1].service).toBe('symbiosis');
	});

	it('first hop uses lifi service, second uses boltz (boltz-last via lifi)', async () => {
		mockLifiGetQuote.mockResolvedValueOnce(makeQuoteRoute('lifi', 0.5));
		mockBoltzGetQuote.mockResolvedValueOnce(makeQuoteRoute('boltz', 0.3));

		const route = await buildBoltzTwoHopRoute(TOKENS['usdt0-arb'], TOKENS['rbtc'], 100_000);

		expect(route!.hops[0].service).toBe('lifi');
		expect(route!.hops[1].service).toBe('boltz');
	});

	it('first hop uses uniswap-v3 service, second uses boltz (boltz-last via uniswap-v3)', async () => {
		mockUniswapV3GetQuote.mockResolvedValueOnce(makeQuoteRoute('uniswap-v3', 0.3));
		mockBoltzGetQuote.mockResolvedValueOnce(makeQuoteRoute('boltz', 0.25));

		const route = await buildBoltzTwoHopRoute(TOKENS['wbtc-arb'], TOKENS['rbtc'], 100_000);

		expect(route!.hops[0].service).toBe('uniswap-v3');
		expect(route!.hops[1].service).toBe('boltz');
	});

	it('boltz-first route label is "Boltz → Symbiosis"', async () => {
		mockBoltzGetQuote.mockResolvedValueOnce(makeQuoteRoute('boltz', 0.5));
		mockSymbiosisGetQuote.mockResolvedValueOnce(makeQuoteRoute('symbiosis', 0.3));

		const route = await buildBoltzTwoHopRoute(TOKENS['rbtc'], TOKENS['wbtc-arb'], 100_000);

		expect(route!.label).toBe('Boltz → Symbiosis');
		expect(route!.id).toBe('rbtc->wbtc-arb-via-boltz-symbiosis');
	});

	it('boltz-first + lifi label is "Boltz → LI.FI"', async () => {
		mockBoltzGetQuote.mockResolvedValueOnce(makeQuoteRoute('boltz', 0.5));
		mockLifiGetQuote.mockResolvedValueOnce(makeQuoteRoute('lifi', 0.3));

		const route = await buildBoltzTwoHopRoute(TOKENS['btc'], TOKENS['wbtc-arb'], 100_000);

		expect(route!.label).toBe('Boltz → LI.FI');
		expect(route!.id).toBe('btc->wbtc-arb-via-boltz-lifi');
	});

	it('route is never marked as recommended', async () => {
		mockBoltzGetQuote.mockResolvedValueOnce(makeQuoteRoute('boltz', 0.5));
		mockSymbiosisGetQuote.mockResolvedValueOnce(makeQuoteRoute('symbiosis', 0.3));

		const route = await buildBoltzTwoHopRoute(TOKENS['rbtc'], TOKENS['wbtc-arb'], 100_000);

		expect(route!.recommended).toBe(false);
	});

	it('hop1 output feeds into hop2 input (fee chain math)', async () => {
		mockBoltzGetQuote.mockResolvedValueOnce(makeQuoteRoute('boltz', 1.0));
		mockSymbiosisGetQuote.mockResolvedValueOnce(makeQuoteRoute('symbiosis', 0.5));

		await buildBoltzTwoHopRoute(TOKENS['rbtc'], TOKENS['wbtc-arb'], 200_000);

		// hop1 output = 200_000 * (1 - 1/100) = 198_000
		expect(mockSymbiosisGetQuote).toHaveBeenCalledWith(
			TOKENS['tbtc-arb'],
			TOKENS['wbtc-arb'],
			198_000,
			undefined
		);
	});
});

// ---------------------------------------------------------------------------
// AbortSignal
// ---------------------------------------------------------------------------

describe('AbortSignal', () => {
	it('returns null immediately when signal is already aborted', async () => {
		const controller = new AbortController();
		controller.abort();

		const route = await buildBoltzTwoHopRoute(
			TOKENS['rbtc'],
			TOKENS['wbtc-arb'],
			100_000,
			controller.signal
		);

		expect(route).toBeNull();
		expect(mockBoltzGetQuote).not.toHaveBeenCalled();
	});

	it('passes signal to boltz hop1 in boltz-first mode', async () => {
		const controller = new AbortController();
		mockBoltzGetQuote.mockResolvedValueOnce(makeQuoteRoute('boltz', 0.5));
		mockSymbiosisGetQuote.mockResolvedValueOnce(makeQuoteRoute('symbiosis', 0.3));

		await buildBoltzTwoHopRoute(TOKENS['rbtc'], TOKENS['wbtc-arb'], 100_000, controller.signal);

		expect(mockBoltzGetQuote).toHaveBeenCalledWith(
			expect.anything(),
			expect.anything(),
			expect.anything(),
			controller.signal
		);
	});

	it('passes signal to hop2 provider in boltz-first mode', async () => {
		const controller = new AbortController();
		mockBoltzGetQuote.mockResolvedValueOnce(makeQuoteRoute('boltz', 0.5));
		mockSymbiosisGetQuote.mockResolvedValueOnce(makeQuoteRoute('symbiosis', 0.3));

		await buildBoltzTwoHopRoute(TOKENS['rbtc'], TOKENS['wbtc-arb'], 100_000, controller.signal);

		expect(mockSymbiosisGetQuote).toHaveBeenCalledWith(
			expect.anything(),
			expect.anything(),
			expect.anything(),
			controller.signal
		);
	});

	it('returns null when signal aborted between hop1 and hop2', async () => {
		const controller = new AbortController();

		// Hop1 succeeds, then we abort before hop2 checks
		mockBoltzGetQuote.mockImplementationOnce(async () => {
			controller.abort();
			return makeQuoteRoute('boltz', 0.5);
		});

		const route = await buildBoltzTwoHopRoute(
			TOKENS['rbtc'],
			TOKENS['wbtc-arb'],
			100_000,
			controller.signal
		);

		expect(route).toBeNull();
		expect(mockSymbiosisGetQuote).not.toHaveBeenCalled();
	});
});
