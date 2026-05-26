/**
 * Symbiosis Service — Unit Tests
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('$lib/services/kill-switch', () => ({
	isLifiEnabled: vi.fn(() => false),
	isChangeallySwapsEnabled: vi.fn(() => false),
	isChangeallyFiatEnabled: vi.fn(() => false),
	isSymbiosisEnabled: vi.fn(() => true),
	FEATURE_FLAGS: {
		CHANGELLY_SWAPS: 'changelly-swaps',
		CHANGELLY_FIAT: 'changelly-fiat',
		LIFI_SWAPS: 'lifi-swaps',
		SYMBIOSIS_SWAPS: 'symbiosis-swaps'
	},
	FeatureFlagService: { isEnabled: vi.fn(() => true) }
}));

import {
	symbiosisService,
	type SymbiosisQuoteResponse,
	type SymbiosisChain
} from '$lib/services/symbiosis.service';
import { isSymbiosisEnabled } from '$lib/services/kill-switch';

// ---------------------------------------------------------------------------
// Helpers
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
		estimatedTime: 5,
		...overrides
	};
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('symbiosisService', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(isSymbiosisEnabled).mockReturnValue(true);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe('getQuote', () => {
		const validParams = {
			tokenAmountIn: {
				address: '0x0000000000000000000000000000000000000000',
				chainId: 30,
				symbol: 'RBTC',
				decimals: 18,
				amount: '1000000000000000000'
			},
			tokenOut: {
				address: '0x55d398326f99059fF775485246999027B3197955',
				chainId: 56,
				symbol: 'USDT',
				decimals: 18
			},
			from: '0x742d35Cc6634C0532925a3b844Bc454e4438f44e',
			to: '0x742d35Cc6634C0532925a3b844Bc454e4438f44e'
		};

		it('returns quote on success', async () => {
			const quote = makeSymbiosisQuoteResponse();
			vi.stubGlobal(
				'fetch',
				vi.fn().mockResolvedValue(new Response(JSON.stringify(quote), { status: 200 }))
			);

			const result = await symbiosisService.getQuote(validParams);
			expect(result.tokenAmountOut?.amount).toBe('500000000000000000000');
		});

		it('throws when feature flag is disabled', async () => {
			vi.mocked(isSymbiosisEnabled).mockReturnValue(false);

			await expect(symbiosisService.getQuote(validParams)).rejects.toThrow(
				'Symbiosis swaps are not enabled'
			);
		});

		it('throws on missing tokenAmountIn', async () => {
			await expect(
				symbiosisService.getQuote({
					tokenAmountIn: null as unknown as typeof validParams.tokenAmountIn,
					tokenOut: validParams.tokenOut,
					from: validParams.from,
					to: validParams.to
				})
			).rejects.toThrow('getQuote requires');
		});

		it('throws on missing amount', async () => {
			await expect(
				symbiosisService.getQuote({
					tokenAmountIn: { ...validParams.tokenAmountIn, amount: '' },
					tokenOut: validParams.tokenOut,
					from: validParams.from,
					to: validParams.to
				})
			).rejects.toThrow('getQuote requires');
		});

		it('throws on network error', async () => {
			vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network down')));

			await expect(symbiosisService.getQuote(validParams)).rejects.toThrow(
				'Symbiosis API network error'
			);
		});

		it('throws on HTTP error', async () => {
			vi.stubGlobal(
				'fetch',
				vi
					.fn()
					.mockResolvedValue(
						new Response(JSON.stringify({ message: 'Bad request' }), { status: 400 })
					)
			);

			await expect(symbiosisService.getQuote(validParams)).rejects.toThrow('Bad request');
		});

		it('returns quote with zero fee', async () => {
			const quote = makeSymbiosisQuoteResponse({ fee: '0' });
			vi.stubGlobal(
				'fetch',
				vi.fn().mockResolvedValue(new Response(JSON.stringify(quote), { status: 200 }))
			);

			const result = await symbiosisService.getQuote(validParams);
			expect(result.fee).toBe('0');
		});
	});

	describe('getChains', () => {
		it('returns chains list', async () => {
			const chains: SymbiosisChain[] = [{ chainId: 30, name: 'Rootstock', chainType: 'evm' }];
			vi.stubGlobal(
				'fetch',
				vi.fn().mockResolvedValue(new Response(JSON.stringify(chains), { status: 200 }))
			);

			const result = await symbiosisService.getChains();
			expect(result).toHaveLength(1);
			expect(result[0].name).toBe('Rootstock');
		});
	});
});
