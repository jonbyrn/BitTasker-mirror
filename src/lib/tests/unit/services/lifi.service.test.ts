/**
 * LI.FI Service — Unit Tests
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock kill-switch before importing the service
vi.mock('$lib/services/kill-switch', () => ({
	isLifiEnabled: vi.fn(() => true),
	isChangeallySwapsEnabled: vi.fn(() => false),
	isChangeallyFiatEnabled: vi.fn(() => false),
	isSymbiosisEnabled: vi.fn(() => false),
	FEATURE_FLAGS: {
		CHANGELLY_SWAPS: 'changelly-swaps',
		CHANGELLY_FIAT: 'changelly-fiat',
		LIFI_SWAPS: 'lifi-swaps',
		SYMBIOSIS_SWAPS: 'symbiosis-swaps'
	},
	FeatureFlagService: { isEnabled: vi.fn(() => true) }
}));

import {
	lifiService,
	type LifiSingleQuoteResponse,
	type LifiStatusResponse,
	type LifiChain,
	type LifiToken
} from '$lib/services/lifi.service';
import { isLifiEnabled } from '$lib/services/kill-switch';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSingleQuoteResponse(overrides?: Partial<LifiSingleQuoteResponse>): LifiSingleQuoteResponse {
	return {
		id: 'test-route-id',
		estimate: {
			fromAmount: '1000000000000000000',
			toAmount: '500000000000000000000',
			toAmountMin: '495000000000000000000',
			executionDuration: 300,
			feeCosts: []
		},
		...overrides
	};
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('lifiService', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(isLifiEnabled).mockReturnValue(true);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe('getQuote', () => {
		it('returns the best route on success', async () => {
			vi.stubGlobal(
				'fetch',
				vi
					.fn()
					.mockResolvedValue(
						new Response(JSON.stringify(makeSingleQuoteResponse()), { status: 200 })
					)
			);

			const result = await lifiService.getQuote({
				fromChain: 30,
				toChain: 56,
				fromToken: '0x0000000000000000000000000000000000000000',
				toToken: '0x55d398326f99059fF775485246999027B3197955',
				fromAmount: '1000000000000000000',
				fromAddress: '0x742d35Cc6634C0532925a3b844Bc454e4438f44e'
			});

			expect(result.id).toBe('test-route-id');
			expect(result.estimate.fromAmount).toBe('1000000000000000000');
		});

		it('throws when feature flag is disabled', async () => {
			vi.mocked(isLifiEnabled).mockReturnValue(false);

			await expect(
				lifiService.getQuote({
					fromChain: 30,
					toChain: 56,
					fromToken: '0x0',
					toToken: '0x0',
					fromAmount: '1',
					fromAddress: '0x0'
				})
			).rejects.toThrow('LI.FI swaps are not enabled');
		});

		it('throws on missing parameters', async () => {
			await expect(
				lifiService.getQuote({
					fromChain: 0,
					toChain: 56,
					fromToken: '',
					toToken: '0x0',
					fromAmount: '',
					fromAddress: '0x0'
				})
			).rejects.toThrow('getQuote requires');
		});

		it('throws on network error', async () => {
			vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network down')));

			await expect(
				lifiService.getQuote({
					fromChain: 30,
					toChain: 56,
					fromToken: '0x0',
					toToken: '0x0',
					fromAmount: '1',
					fromAddress: '0x0'
				})
			).rejects.toThrow('LI.FI API network error');
		});

		it('throws on HTTP error', async () => {
			vi.stubGlobal(
				'fetch',
				vi
					.fn()
					.mockResolvedValue(
						new Response(JSON.stringify({ message: 'Invalid chain' }), { status: 400 })
					)
			);

			await expect(
				lifiService.getQuote({
					fromChain: 30,
					toChain: 56,
					fromToken: '0x0',
					toToken: '0x0',
					fromAmount: '1',
					fromAddress: '0x0'
				})
			).rejects.toThrow('Invalid chain');
		});

		it('throws on empty routes', async () => {
			vi.stubGlobal(
				'fetch',
				vi.fn().mockResolvedValue(
					new Response(JSON.stringify(makeSingleQuoteResponse({ estimate: undefined })), {
						status: 200
					})
				)
			);

			await expect(
				lifiService.getQuote({
					fromChain: 30,
					toChain: 56,
					fromToken: '0x0',
					toToken: '0x0',
					fromAmount: '1',
					fromAddress: '0x0'
				})
			).rejects.toThrow('no liquidity');
		});

		it('throws on invalid JSON response', async () => {
			vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('not json', { status: 200 })));

			await expect(
				lifiService.getQuote({
					fromChain: 30,
					toChain: 56,
					fromToken: '0x0',
					toToken: '0x0',
					fromAmount: '1',
					fromAddress: '0x0'
				})
			).rejects.toThrow('Invalid response');
		});
	});

	describe('getStatus', () => {
		it('returns status on success', async () => {
			const status: LifiStatusResponse = { status: 'DONE' };
			vi.stubGlobal(
				'fetch',
				vi.fn().mockResolvedValue(new Response(JSON.stringify(status), { status: 200 }))
			);

			const result = await lifiService.getStatus('0xabc');
			expect(result.status).toBe('DONE');
		});

		it('throws on empty tx hash', async () => {
			await expect(lifiService.getStatus('')).rejects.toThrow('requires a transaction hash');
		});
	});

	describe('getChains', () => {
		it('returns chains list', async () => {
			const chains: LifiChain[] = [{ id: 30, name: 'Rootstock', key: 'rsk' }];
			vi.stubGlobal(
				'fetch',
				vi.fn().mockResolvedValue(new Response(JSON.stringify({ chains }), { status: 200 }))
			);

			const result = await lifiService.getChains();
			expect(result).toHaveLength(1);
			expect(result[0].key).toBe('rsk');
		});
	});

	describe('getTokens', () => {
		it('returns tokens list', async () => {
			const tokens: LifiToken[] = [
				{ symbol: 'USDT', address: '0x55d3', chainId: 56, decimals: 18, name: 'Tether USD' }
			];
			vi.stubGlobal(
				'fetch',
				vi.fn().mockResolvedValue(new Response(JSON.stringify({ tokens }), { status: 200 }))
			);

			const result = await lifiService.getTokens(56);
			expect(result).toHaveLength(1);
			expect(result[0].symbol).toBe('USDT');
		});

		it('throws on invalid chain ID', async () => {
			await expect(lifiService.getTokens(0)).rejects.toThrow('requires a valid chainId');
		});
	});
});
