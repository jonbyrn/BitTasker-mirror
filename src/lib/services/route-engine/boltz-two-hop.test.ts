import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Route, RouteHop } from '$lib/services/route-resolver';

const mockBoltzGetQuote = vi.hoisted(() => vi.fn());
const mockLifiGetQuote = vi.hoisted(() => vi.fn());

vi.mock('$lib/utils/debug', () => ({
	createDebug: () => ({
		log: vi.fn(),
		warn: vi.fn(),
		error: vi.fn()
	})
}));

vi.mock('$lib/utils/tryCatch', () => ({
	tryCatch: async <T>(p: Promise<T>) => {
		try {
			return { data: await p, error: null };
		} catch (e) {
			return { data: null, error: e };
		}
	}
}));

vi.mock('$lib/services/route-engine/token-registry', () => ({
	TOKENS: {
		'rbtc': {
			key: 'rbtc', symbol: 'RBTC', address: '0x0', chain: 'rsk',
			chainId: 30, decimals: 18, native: true
		},
		'tbtc-arb': {
			key: 'tbtc-arb', symbol: 'tBTC', address: '0x6c84a8f1c29108F47a79964b5Fe888D4f4D0dE40',
			chain: 'arbitrum', chainId: 42161, decimals: 18, native: false
		},
		'usdt0-arb': {
			key: 'usdt0-arb', symbol: 'USDT0', address: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
			chain: 'arbitrum', chainId: 42161, decimals: 6, native: false
		}
	}
}));

vi.mock('$lib/services/route-engine/providers/boltz.provider', () => ({
	boltzProvider: {
		name: 'boltz',
		supports: vi.fn(() => true),
		getQuote: mockBoltzGetQuote
	}
}));

vi.mock('$lib/services/route-engine/providers/lifi.provider', () => ({
	lifiProvider: {
		name: 'lifi',
		supports: vi.fn(() => true),
		getQuote: mockLifiGetQuote
	}
}));

vi.mock('$lib/services/route-engine/providers/symbiosis.provider', () => ({
	symbiosisProvider: {
		name: 'symbiosis',
		supports: vi.fn(() => false),
		getQuote: vi.fn()
	}
}));

vi.mock('$lib/services/route-engine/providers/uniswap-v3.provider', () => ({
	uniswapV3Provider: {
		name: 'uniswap-v3',
		supports: vi.fn(() => false),
		getQuote: vi.fn()
	}
}));

import { buildBoltzTwoHopRoute } from '$lib/services/route-engine/boltz-two-hop';

const RBTC_TOKEN = {
	key: 'rbtc', symbol: 'RBTC', address: '0x0', chain: 'rsk',
	chainId: 30, decimals: 18, native: true
};

const USDT0_ARB_TOKEN = {
	key: 'usdt0-arb', symbol: 'USDT0', address: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
	chain: 'arbitrum', chainId: 42161, decimals: 6, native: false
};

function makeHop(overrides: Partial<RouteHop> = {}): RouteHop {
	return {
		service: 'boltz',
		fromAsset: 'RBTC',
		fromChain: 'rsk',
		toAsset: 'tBTC',
		toChain: 'arbitrum',
		feePercent: 0.5,
		estimatedTimeMin: 10,
		estimatedTimeMax: 30,
		...overrides
	};
}

function makeRoute(hop: RouteHop): Route {
	return {
		id: 'boltz-route',
		label: 'Boltz',
		hops: [hop],
		totalFeePercent: hop.feePercent,
		estimatedTime: '10-30 min',
		recommended: false,
		outputSats: 99500,
		outputAmount: '99500',
		outputDecimals: 8
	};
}

describe('boltz-two-hop — hop2 gas in fee display (Fix 4)', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('should include hop2GasCostWei in composed route', async () => {
		const hop1 = makeHop({ service: 'boltz', gasCostWei: '1000000000000000' });
		const hop2 = makeHop({
			service: 'lifi',
			fromAsset: 'tBTC',
			toAsset: 'USDT0',
			toChain: 'arbitrum',
			gasCostWei: '500000000000000'
		});

		mockBoltzGetQuote.mockResolvedValue(makeRoute(hop1));
		mockLifiGetQuote.mockResolvedValue(makeRoute(hop2));

		const route = await buildBoltzTwoHopRoute(RBTC_TOKEN, USDT0_ARB_TOKEN, 100000);

		expect(route).not.toBeNull();
		expect(route!.hop2GasCostWei).toBe('500000000000000');
	});

	it('should NOT add hop2 gas to gasCostWei', async () => {
		const hop1 = makeHop({ service: 'boltz', gasCostWei: '1000000000000000' });
		const hop2 = makeHop({
			service: 'lifi',
			fromAsset: 'tBTC',
			toAsset: 'USDT0',
			toChain: 'arbitrum',
			gasCostWei: '500000000000000'
		});

		mockBoltzGetQuote.mockResolvedValue(makeRoute(hop1));
		mockLifiGetQuote.mockResolvedValue(makeRoute(hop2));

		const route = await buildBoltzTwoHopRoute(RBTC_TOKEN, USDT0_ARB_TOKEN, 100000);

		expect(route).not.toBeNull();
		// gasCostWei should only be hop1's value, not the sum
		expect(route!.gasCostWei).toBe('1000000000000000');
		expect(route!.gasCostWei).not.toBe('1500000000000000');
	});

	it('should omit hop2GasCostWei when hop2 has no gas cost', async () => {
		const hop1 = makeHop({ service: 'boltz', gasCostWei: '1000000000000000' });
		const hop2 = makeHop({
			service: 'lifi',
			fromAsset: 'tBTC',
			toAsset: 'USDT0',
			toChain: 'arbitrum'
			// no gasCostWei
		});

		mockBoltzGetQuote.mockResolvedValue(makeRoute(hop1));
		mockLifiGetQuote.mockResolvedValue(makeRoute(hop2));

		const route = await buildBoltzTwoHopRoute(RBTC_TOKEN, USDT0_ARB_TOKEN, 100000);

		expect(route).not.toBeNull();
		expect(route!.hop2GasCostWei).toBeUndefined();
	});
});
