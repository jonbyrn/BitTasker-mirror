/**
 * LI.FI Provider — Unit Tests
 *
 * Tests supports() for EVM pairs and getQuote() success/error/disabled.
 * Mocks: lifiService.getQuote, isLifiEnabled.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock external dependencies before importing the provider
vi.mock('$lib/services/lifi.service', () => ({
	lifiService: {
		getQuote: vi.fn()
	}
}));

vi.mock('$lib/services/kill-switch', () => ({
	isLifiEnabled: vi.fn(() => true)
}));

vi.mock('$lib/utils/debug', () => ({
	createDebug: () => ({
		log: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		debug: vi.fn()
	})
}));

import { lifiProvider } from '$lib/services/route-engine/providers/lifi.provider';
import { lifiService } from '$lib/services/lifi.service';
import { isLifiEnabled } from '$lib/services/kill-switch';
import { TOKENS } from '$lib/services/route-engine/token-registry';

// ---------------------------------------------------------------------------
// supports()
// ---------------------------------------------------------------------------

describe('lifiProvider.supports()', () => {
	beforeEach(() => {
		vi.mocked(isLifiEnabled).mockReturnValue(true);
	});

	it('RSK → BSC: true', () => {
		expect(lifiProvider.supports(TOKENS['rbtc'], TOKENS['usdt-bsc'])).toBe(true);
	});

	it('RSK → Arbitrum: true', () => {
		expect(lifiProvider.supports(TOKENS['rbtc'], TOKENS['usdt0-arb'])).toBe(true);
	});

	it('BSC → RSK: true', () => {
		expect(lifiProvider.supports(TOKENS['usdt-bsc'], TOKENS['rbtc'])).toBe(true);
	});

	it('Arbitrum → RSK: true', () => {
		expect(lifiProvider.supports(TOKENS['usdt0-arb'], TOKENS['rbtc'])).toBe(true);
	});

	it('same-chain RSK DEX: true', () => {
		expect(lifiProvider.supports(TOKENS['rbtc'], TOKENS['usdt0-rsk'])).toBe(true);
	});

	it('EVM → Bitcoin: true (LI.FI supports via bridges)', () => {
		expect(lifiProvider.supports(TOKENS['rbtc'], TOKENS['btc'])).toBe(true);
	});

	it('bitcoin source: false', () => {
		expect(lifiProvider.supports(TOKENS['btc'], TOKENS['rbtc'])).toBe(false);
	});

	it('lightning source: false', () => {
		expect(lifiProvider.supports(TOKENS['btc-ln'], TOKENS['rbtc'])).toBe(false);
	});

	it('lightning target: false', () => {
		expect(lifiProvider.supports(TOKENS['rbtc'], TOKENS['btc-ln'])).toBe(false);
	});

	it('returns false when kill-switch disabled', () => {
		vi.mocked(isLifiEnabled).mockReturnValue(false);
		expect(lifiProvider.supports(TOKENS['rbtc'], TOKENS['usdt-bsc'])).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// getQuote()
// ---------------------------------------------------------------------------

describe('lifiProvider.getQuote()', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(isLifiEnabled).mockReturnValue(true);
	});

	it('success: returns Route with lifi hop', async () => {
		vi.mocked(lifiService.getQuote).mockResolvedValueOnce({
			id: 'lifi-test',
			fromChainId: 30,
			toChainId: 56,
			fromToken: { symbol: 'RBTC', address: '0x0', chainId: 30, decimals: 18, name: 'RBTC' },
			toToken: { symbol: 'USDT', address: '0x1', chainId: 56, decimals: 18, name: 'USDT' },
			steps: [],
			estimate: {
				fromAmount: '1000000000000000',
				toAmount: '990000000000000000',
				toAmountMin: '980000000000000000',
				executionDuration: 300,
				feeCosts: [
					{
						name: 'bridge',
						percentage: '0.5',
						amount: '500000000000000',
						token: { symbol: 'RBTC', address: '0x0', decimals: 18 }
					}
				],
				gasCosts: [
					{
						name: 'gas',
						percentage: '0',
						amount: '100000000000',
						token: { symbol: 'RBTC', address: '0x0', decimals: 18 }
					}
				]
			}
		});

		const route = await lifiProvider.getQuote(TOKENS['rbtc'], TOKENS['usdt-bsc'], 100_000);

		expect(route).not.toBeNull();
		expect(route!.hops).toHaveLength(1);
		expect(route!.hops[0].service).toBe('lifi');
		expect(route!.hops[0].fromAsset).toBe('RBTC');
		expect(route!.hops[0].toAsset).toBe('USDT');
		expect(route!.id).toContain('lifi');
	});

	it('success: extracts gasCostWei and feeCosts', async () => {
		vi.mocked(lifiService.getQuote).mockResolvedValueOnce({
			id: 'lifi-test',
			fromChainId: 30,
			toChainId: 56,
			fromToken: { symbol: 'RBTC', address: '0x0', chainId: 30, decimals: 18, name: 'RBTC' },
			toToken: { symbol: 'USDT', address: '0x1', chainId: 56, decimals: 18, name: 'USDT' },
			steps: [],
			estimate: {
				fromAmount: '1000000000000000',
				toAmount: '990000000000000000',
				toAmountMin: '980000000000000000',
				executionDuration: 120,
				feeCosts: [
					{
						name: 'bridge-fee',
						percentage: '0.3',
						amount: '300000',
						token: { symbol: 'RBTC', address: '0x0', decimals: 18 }
					}
				],
				gasCosts: [
					{
						name: 'gas',
						percentage: '0',
						amount: '50000000000',
						token: { symbol: 'ETH', address: '0x0', decimals: 18 }
					}
				]
			}
		});

		const route = await lifiProvider.getQuote(TOKENS['rbtc'], TOKENS['usdt-bsc'], 100_000);

		expect(route).not.toBeNull();
		expect(route!.gasCostWei).toBe('50000000000');
		expect(route!.feeCosts).toHaveLength(1);
		expect(route!.feeCosts![0].name).toBe('bridge-fee');
	});

	it('error: returns null on service rejection', async () => {
		vi.mocked(lifiService.getQuote).mockRejectedValueOnce(new Error('LI.FI API error'));

		const route = await lifiProvider.getQuote(TOKENS['rbtc'], TOKENS['usdt-bsc'], 100_000);
		expect(route).toBeNull();
	});

	it('null/empty estimate: returns null', async () => {
		vi.mocked(lifiService.getQuote).mockResolvedValueOnce({
			id: 'empty',
			fromChainId: 30,
			toChainId: 56,
			fromToken: { symbol: 'RBTC', address: '0x0', chainId: 30, decimals: 18, name: 'RBTC' },
			toToken: { symbol: 'USDT', address: '0x1', chainId: 56, decimals: 18, name: 'USDT' },
			steps: [],
			estimate: {
				fromAmount: '0',
				toAmount: '',
				toAmountMin: '',
				executionDuration: 0
			}
		});

		const route = await lifiProvider.getQuote(TOKENS['rbtc'], TOKENS['usdt-bsc'], 100_000);
		expect(route).toBeNull();
	});

	it('passes correct chain IDs in request', async () => {
		vi.mocked(lifiService.getQuote).mockResolvedValueOnce({
			id: 'test',
			fromChainId: 42161,
			toChainId: 30,
			fromToken: { symbol: 'USDT0', address: '0x1', chainId: 42161, decimals: 6, name: 'USDT0' },
			toToken: { symbol: 'RBTC', address: '0x0', chainId: 30, decimals: 18, name: 'RBTC' },
			steps: [],
			estimate: {
				fromAmount: '1000',
				toAmount: '990000000000000',
				toAmountMin: '980000000000000',
				executionDuration: 60
			}
		});

		await lifiProvider.getQuote(TOKENS['usdt0-arb'], TOKENS['rbtc'], 100_000);

		expect(lifiService.getQuote).toHaveBeenCalledWith(
			expect.objectContaining({
				fromChain: 42161,
				toChain: 30
			})
		);
	});
});
