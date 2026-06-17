/**
 * Async Route Resolver — Unit Tests
 *
 * Tests the async route resolution that calls LI.FI and Symbiosis in parallel.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the feature flags
vi.mock('$lib/services/kill-switch', () => ({
	isLifiEnabled: vi.fn(() => true),
	isSymbiosisEnabled: vi.fn(() => true),
	isOpenOceanEnabled: vi.fn(() => true),
	isChangeallySwapsEnabled: vi.fn(() => false),
	isChangeallyFiatEnabled: vi.fn(() => false),
	FEATURE_FLAGS: {
		CHANGELLY_SWAPS: 'changelly-swaps',
		CHANGELLY_FIAT: 'changelly-fiat',
		LIFI_SWAPS: 'lifi-swaps',
		SYMBIOSIS_SWAPS: 'symbiosis-swaps'
	},
	FeatureFlagService: { isEnabled: vi.fn(() => true) }
}));

// Mock the providers
vi.mock('$lib/services/lifi.service', () => ({
	lifiService: {
		getQuote: vi.fn(),
		getStatus: vi.fn(),
		getChains: vi.fn(),
		getTokens: vi.fn()
	}
}));

vi.mock('$lib/services/symbiosis.service', () => ({
	symbiosisService: {
		getQuote: vi.fn(),
		getChains: vi.fn()
	}
}));

vi.mock('$lib/services/openocean.service', () => ({
	openoceanService: {
		getQuote: vi.fn()
	}
}));

import {
	resolveRouteAsync,
	createInitialAsyncRouteResult
} from '$lib/services/route-resolver-async';
import { lifiService, type LifiRoute } from '$lib/services/lifi.service';
import { symbiosisService, type SymbiosisQuoteResponse } from '$lib/services/symbiosis.service';
import { isLifiEnabled, isSymbiosisEnabled } from '$lib/services/kill-switch';
import type { Destination } from '$lib/services/route-resolver';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAddressDest(chainId: number): Destination {
	return {
		type: 'address',
		chainId,
		address: '0x742d35Cc6634C0532925a3b844Bc454e4438f44e'
	};
}

function makeLifiRoute(): LifiRoute {
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
			toAmount: '500000000000000000000',
			toAmountMin: '495000000000000000000',
			executionDuration: 300,
			feeCosts: []
		}
	};
}

function makeSymbiosisQuote(): SymbiosisQuoteResponse {
	return {
		tokenAmountOut: {
			amount: '500000000000000000000',
			symbol: 'USDT',
			address: '0x55d398326f99059fF775485246999027B3197955',
			chainId: 56,
			decimals: 18
		},
		fee: '0.3',
		estimatedTime: 5
	};
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('resolveRouteAsync', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(isLifiEnabled).mockReturnValue(true);
		vi.mocked(isSymbiosisEnabled).mockReturnValue(true);
	});

	describe('rBTC -> BSC address', () => {
		const dest = makeAddressDest(56);
		const amount = '1000000000000000000';
		const userAddress = '0x742d35Cc6634C0532925a3b844Bc454e4438f44e';

		it('returns LI.FI + Symbiosis + hardcoded routes when both succeed', async () => {
			vi.mocked(lifiService.getQuote).mockResolvedValue(makeLifiRoute());
			vi.mocked(symbiosisService.getQuote).mockResolvedValue(makeSymbiosisQuote());

			const result = await resolveRouteAsync('rbtc', dest, amount, userAddress);

			expect(result.routes.length).toBeGreaterThanOrEqual(2);
			expect(result.providerResults).toHaveLength(3);
			expect(result.providerResults.find((p) => p.provider === 'lifi')!.status).toBe('success');
			expect(result.providerResults.find((p) => p.provider === 'symbiosis')!.status).toBe(
				'success'
			);
		});

		it('falls back to hardcoded when LI.FI fails', async () => {
			vi.mocked(lifiService.getQuote).mockRejectedValue(new Error('Network error'));
			vi.mocked(symbiosisService.getQuote).mockResolvedValue(makeSymbiosisQuote());

			const result = await resolveRouteAsync('rbtc', dest, amount, userAddress);

			// Should still have Symbiosis + hardcoded routes
			expect(result.routes.length).toBeGreaterThanOrEqual(1);
			const lifiResult = result.providerResults.find((p) => p.provider === 'lifi')!;
			expect(lifiResult.status).toBe('error');
			const symbiosisResult = result.providerResults.find((p) => p.provider === 'symbiosis')!;
			expect(symbiosisResult.status).toBe('success');
		});

		it('falls back to hardcoded when both fail', async () => {
			vi.mocked(lifiService.getQuote).mockRejectedValue(new Error('Down'));
			vi.mocked(symbiosisService.getQuote).mockRejectedValue(new Error('Down'));

			const result = await resolveRouteAsync('rbtc', dest, amount, userAddress);

			expect(result.routes.length).toBeGreaterThanOrEqual(1);
			expect(result.hardcodedRoutes.length).toBeGreaterThanOrEqual(1);
		});

		it('includes hardcodedRoutes in result', async () => {
			vi.mocked(lifiService.getQuote).mockResolvedValue(makeLifiRoute());
			vi.mocked(symbiosisService.getQuote).mockResolvedValue(makeSymbiosisQuote());

			const result = await resolveRouteAsync('rbtc', dest, amount, userAddress);

			expect(result.hardcodedRoutes.length).toBeGreaterThanOrEqual(1);
		});

		it('puts cheapest route first', async () => {
			vi.mocked(lifiService.getQuote).mockResolvedValue(makeLifiRoute());
			vi.mocked(symbiosisService.getQuote).mockResolvedValue(makeSymbiosisQuote());

			const result = await resolveRouteAsync('rbtc', dest, amount, userAddress);

			// Winner is cheapest — first by fee, then by time
			expect(result.routes[0].totalFeePercent).toBeLessThanOrEqual(
				result.routes[1].totalFeePercent
			);
		});
	});

	describe('rBTC -> Lightning invoice (unsupported by providers)', () => {
		const dest = makeInvoiceDest();
		const amount = '1000000000000000000';
		const userAddress = '0x0';

		it('returns only hardcoded routes without calling providers', async () => {
			const result = await resolveRouteAsync('rbtc', dest, amount, userAddress);

			expect(result.routes).toHaveLength(1); // Boltz only
			expect(result.providerResults.every((p) => p.status === 'skipped')).toBe(true);
		});

		it('returns routes immediately (isLoading false)', async () => {
			const result = await resolveRouteAsync('rbtc', dest, amount, userAddress);
			expect(result.isLoading).toBe(false);
		});
	});

	describe('feature flags disabled', () => {
		const dest = makeAddressDest(56);
		const amount = '1';
		const userAddress = '0x0';

		it('skips LI.FI when disabled', async () => {
			vi.mocked(isLifiEnabled).mockReturnValue(false);

			const result = await resolveRouteAsync('rbtc', dest, amount, userAddress);

			const lifiResult = result.providerResults.find((p) => p.provider === 'lifi')!;
			expect(lifiResult.status).toBe('skipped');
		});

		it('skips Symbiosis when disabled', async () => {
			vi.mocked(isSymbiosisEnabled).mockReturnValue(false);

			const result = await resolveRouteAsync('rbtc', dest, amount, userAddress);

			const symbiosisResult = result.providerResults.find((p) => p.provider === 'symbiosis')!;
			expect(symbiosisResult.status).toBe('skipped');
		});
	});

	describe('USDT-BSC -> RSK address', () => {
		const dest = makeAddressDest(30);
		const amount = '500';
		const userAddress = '0x742d35Cc6634C0532925a3b844Bc454e4438f44e';

		it('returns LI.FI + Symbiosis + hardcoded routes when both succeed', async () => {
			vi.mocked(lifiService.getQuote).mockResolvedValue(makeLifiRoute());
			vi.mocked(symbiosisService.getQuote).mockResolvedValue(makeSymbiosisQuote());

			const result = await resolveRouteAsync('usdt-bsc', dest, amount, userAddress);

			expect(result.routes.length).toBeGreaterThanOrEqual(3);
			expect(result.providerResults.some((p) => p.status === 'success')).toBe(true);
		});
	});
});

describe('createInitialAsyncRouteResult', () => {
	it('returns isLoading true with empty routes', () => {
		const result = createInitialAsyncRouteResult();
		expect(result.isLoading).toBe(true);
		expect(result.routes).toHaveLength(0);
		expect(result.providerResults).toHaveLength(3);
	});
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeInvoiceDest(): Destination {
	return { type: 'invoice', network: 'lightning', invoice: 'lnbc1...' };
}
