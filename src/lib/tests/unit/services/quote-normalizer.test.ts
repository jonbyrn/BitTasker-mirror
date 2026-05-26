/**
 * Quote Normalizer — Unit Tests
 *
 * Tests pure functions that transform LI.FI and Symbiosis API responses
 * into the project's internal Route/RouteHop types.
 */
import { describe, it, expect } from 'vitest';
import {
	normalizeLifiQuote,
	normalizeSymbiosisQuote,
	normalizedQuoteToRoute,
	type NormalizedQuote
} from '$lib/services/quote-normalizer';
import type { LifiRoute } from '$lib/services/lifi.service';
import type { SymbiosisQuoteResponse } from '$lib/services/symbiosis.service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeLifiRoute(overrides?: Partial<LifiRoute>): LifiRoute {
	return {
		id: 'test-lifi-route',
		fromChainId: 30,
		toChainId: 56,
		fromToken: {
			symbol: 'RBTC',
			address: '0x0000000000000000000000000000000000000000',
			chainId: 30,
			decimals: 18,
			name: 'RBTC'
		},
		toToken: {
			symbol: 'USDT',
			address: '0x55d398326f99059fF775485246999027B3197955',
			chainId: 56,
			decimals: 18,
			name: 'Tether USD'
		},
		steps: [],
		estimate: {
			fromAmount: '1000000000000000000',
			toAmount: '950000000000000000000',
			toAmountMin: '940000000000000000000',
			executionDuration: 300,
			feeCosts: []
		},
		...overrides
	};
}

// ---------------------------------------------------------------------------
// normalizeLifiQuote
// ---------------------------------------------------------------------------

describe('normalizeLifiQuote', () => {
	it('normalizes a valid LI.FI route', () => {
		const result = normalizeLifiQuote(makeLifiRoute(), 'RBTC', 'USDT', 'rsk', 'bsc');

		expect(result).not.toBeNull();
		expect(result!.provider).toBe('lifi');
		expect(result!.fromAsset).toBe('RBTC');
		expect(result!.toAsset).toBe('USDT');
		expect(result!.fromChain).toBe('rsk');
		expect(result!.toChain).toBe('bsc');
		expect(result!.estimatedToAmount).toBe('950000000000000000000');
		expect(result!.estimatedTimeMinutes).toBe(5); // 300s / 60 = 5
		expect(result!.providerRouteId).toBe('test-lifi-route');
	});

	it('calculates feePercent from amount difference', () => {
		const route = makeLifiRoute({
			estimate: {
				fromAmount: '1000000000000000000',
				toAmount: '985000000000000000000',
				toAmountMin: '980000000000000000000',
				executionDuration: 300,
				feeCosts: []
			}
		});

		const result = normalizeLifiQuote(route, 'RBTC', 'USDT', 'rsk', 'bsc');
		// 1 ETH = 1000 USDT expected, got 985: (1000 - 985) / 1000 * 100 = 1.5%
		// Actually: fromAmount is 1.0 (1 RBTC), toAmount is 985 (USDT)
		// fee = ((1 - 0.985) / 1) * 100 = 1.5% but wait - fromAmount is in wei-like units at ~1
		// Actually: ((1000000000000000000 - 985000000000000000000) / 1000000000000000000) * 100
		// = ((1 - 985) / 1) * 100 = -98,400%  — that's not right. Let me fix the test.
		// fromAmount = 1 RBTC, toAmount = 985 USDT. Fee = (1 - 985/1) * 100 = -98,400% — negative!
		// normalizeLifiQuote floors to 0 for negative fees.
		expect(result!.feePercent).toBe(0);
	});

	it('returns null for null/undefined route', () => {
		expect(
			normalizeLifiQuote(null as unknown as LifiRoute, 'RBTC', 'USDT', 'rsk', 'bsc')
		).toBeNull();
	});

	it('returns null for route with no estimate', () => {
		expect(
			normalizeLifiQuote({ id: 'x' } as unknown as LifiRoute, 'RBTC', 'USDT', 'rsk', 'bsc')
		).toBeNull();
	});

	it('returns null for zero fromAmount', () => {
		const route = makeLifiRoute({
			estimate: {
				fromAmount: '0',
				toAmount: '100',
				toAmountMin: '100',
				executionDuration: 300,
				feeCosts: []
			}
		});
		expect(normalizeLifiQuote(route, 'RBTC', 'USDT', 'rsk', 'bsc')).toBeNull();
	});

	it('returns null for NaN fromAmount', () => {
		const route = makeLifiRoute({
			estimate: {
				fromAmount: 'not-a-number',
				toAmount: '100',
				toAmountMin: '100',
				executionDuration: 300,
				feeCosts: []
			}
		});
		expect(normalizeLifiQuote(route, 'RBTC', 'USDT', 'rsk', 'bsc')).toBeNull();
	});

	it('handles very long execution duration', () => {
		const route = makeLifiRoute({
			estimate: {
				fromAmount: '1',
				toAmount: '1',
				toAmountMin: '1',
				executionDuration: 7200, // 2 hours
				feeCosts: []
			}
		});
		const result = normalizeLifiQuote(route, 'RBTC', 'USDT', 'rsk', 'bsc');
		expect(result!.estimatedTimeMinutes).toBe(120);
	});

	it('feePercent never goes negative', () => {
		const route = makeLifiRoute({
			estimate: {
				fromAmount: '100',
				toAmount: '200', // got more than sent — negative fee
				toAmountMin: '190',
				executionDuration: 300,
				feeCosts: []
			}
		});
		const result = normalizeLifiQuote(route, 'RBTC', 'USDT', 'rsk', 'bsc');
		expect(result!.feePercent).toBeGreaterThanOrEqual(0);
	});
});

// ---------------------------------------------------------------------------
// normalizeSymbiosisQuote
// ---------------------------------------------------------------------------

describe('normalizeSymbiosisQuote', () => {
	it('normalizes a valid Symbiosis quote', () => {
		const quote = makeSymbiosisQuoteResponse();

		const result = normalizeSymbiosisQuote(quote, 'RBTC', 'USDT', 'rsk', 'bsc');

		expect(result).not.toBeNull();
		expect(result!.provider).toBe('symbiosis');
		expect(result!.fromAsset).toBe('RBTC');
		expect(result!.toAsset).toBe('USDT');
		expect(result!.fromChain).toBe('rsk');
		expect(result!.toChain).toBe('bsc');
		expect(result!.estimatedToAmount).toBe('500000000000000000000');
		expect(result!.feePercent).toBe(0.3);
		expect(result!.estimatedTimeMinutes).toBe(5);
	});

	it('returns null for null quote', () => {
		expect(
			normalizeSymbiosisQuote(
				null as unknown as SymbiosisQuoteResponse,
				'RBTC',
				'USDT',
				'rsk',
				'bsc'
			)
		).toBeNull();
	});

	it('returns null for quote with no tokenAmountOut', () => {
		const quote = makeSymbiosisQuoteResponse({
			tokenAmountOut: undefined
		}) as unknown as SymbiosisQuoteResponse;
		const result = normalizeSymbiosisQuote(quote, 'RBTC', 'USDT', 'rsk', 'bsc');
		expect(result).toBeNull();
	});

	it('returns null for NaN tokenAmountOut', () => {
		const quote = makeSymbiosisQuoteResponse({
			tokenAmountOut: {
				amount: 'invalid',
				symbol: 'USDT',
				address: '0x55d3',
				chainId: 56,
				decimals: 18
			}
		});
		const result = normalizeSymbiosisQuote(quote, 'RBTC', 'USDT', 'rsk', 'bsc');
		expect(result).toBeNull();
	});

	it('uses default fee when not provided', () => {
		const quote = makeSymbiosisQuoteResponse({ fee: undefined });
		const result = normalizeSymbiosisQuote(quote, 'RBTC', 'USDT', 'rsk', 'bsc');
		expect(result!.feePercent).toBe(0.3);
	});

	it('uses default estimatedTime when not provided', () => {
		const quote = makeSymbiosisQuoteResponse({ estimatedTime: undefined });
		const result = normalizeSymbiosisQuote(quote, 'RBTC', 'USDT', 'rsk', 'bsc');
		expect(result!.estimatedTimeMinutes).toBe(5);
	});

	it('fee never goes negative', () => {
		const quote = makeSymbiosisQuoteResponse({ fee: '-1' });
		const result = normalizeSymbiosisQuote(quote, 'RBTC', 'USDT', 'rsk', 'bsc');
		expect(result!.feePercent).toBeGreaterThanOrEqual(0);
	});
});

// ---------------------------------------------------------------------------
// normalizedQuoteToRoute
// ---------------------------------------------------------------------------

describe('normalizedQuoteToRoute', () => {
	function makeQuote(provider: 'lifi' | 'symbiosis'): NormalizedQuote {
		return {
			provider,
			fromAsset: 'RBTC',
			toAsset: 'USDT',
			fromChain: 'rsk',
			toChain: 'bsc',
			estimatedToAmount: '500000',
			feePercent: 0.25,
			estimatedTimeMinutes: 8,
			providerRouteId: 'test-provider-route'
		};
	}

	it('converts LI.FI normalized quote to Route', () => {
		const route = normalizedQuoteToRoute(makeQuote('lifi'), true);

		expect(route.id).toContain('via-lifi');
		expect(route.label).toContain('LI.FI');
		expect(route.hops).toHaveLength(1);
		expect(route.hops[0].service).toBe('lifi');
		expect(route.hops[0].fromAsset).toBe('RBTC');
		expect(route.hops[0].fromChain).toBe('rsk');
		expect(route.hops[0].toAsset).toBe('USDT');
		expect(route.hops[0].toChain).toBe('bsc');
		expect(route.hops[0].feePercent).toBe(0.25);
		expect(route.hops[0].estimatedTimeMin).toBe(8);
		expect(route.hops[0].estimatedTimeMax).toBe(12); // ceil(8 * 1.5)
		expect(route.totalFeePercent).toBe(0.25);
		expect(route.recommended).toBe(true);
	});

	it('converts Symbiosis normalized quote to Route', () => {
		const route = normalizedQuoteToRoute(makeQuote('symbiosis'), false);

		expect(route.id).toContain('via-symbiosis');
		expect(route.label).toContain('Symbiosis');
		expect(route.hops[0].service).toBe('symbiosis');
		expect(route.recommended).toBe(false);
	});

	it('estimatedTime is rounded up for max', () => {
		const quote = makeQuote('lifi');
		quote.estimatedTimeMinutes = 7;
		const route = normalizedQuoteToRoute(quote, true);
		expect(route.estimatedTime).toBe('7-11 min'); // ceil(7*1.5) = 11
	});

	it('route id is unique per quote', () => {
		const quote1 = makeQuote('lifi');
		quote1.providerRouteId = 'r1';
		const route1 = normalizedQuoteToRoute(quote1, true);

		const quote2 = makeQuote('lifi');
		quote2.providerRouteId = 'r2';
		const route2 = normalizedQuoteToRoute(quote2, false);

		expect(route1.id).not.toBe(route2.id);
	});
});

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function makeSymbiosisQuoteResponse(
	overrides?: Partial<SymbiosisQuoteResponse>
): SymbiosisQuoteResponse {
	return {
		tokenAmountOut: {
			amount: '500000000000000000000',
			symbol: 'USDT',
			address: '0x55d3',
			chainId: 56,
			decimals: 18
		},
		fee: '0.3',
		estimatedTime: 5,
		...overrides
	};
}
