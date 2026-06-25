/**
 * Changelly Provider — Unit Tests
 *
 * Tests supports() for static pairs, dynamic currency cache, and
 * getQuote() success/error paths.
 * Mocks: changellyService.estimateSwap, getCurrencies, isChangeallySwapsEnabled.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock external dependencies before importing the provider
vi.mock('$lib/services/changelly.service', () => ({
	changellyService: {
		estimateSwap: vi.fn(),
		getCurrencies: vi.fn()
	}
}));

vi.mock('$lib/services/kill-switch', () => ({
	isChangeallySwapsEnabled: vi.fn(() => true)
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
	changellyProvider,
	loadCurrencies
} from '$lib/services/route-engine/providers/changelly.provider';
import { changellyService } from '$lib/services/changelly.service';
import { isChangeallySwapsEnabled } from '$lib/services/kill-switch';
import { TOKENS } from '$lib/services/route-engine/token-registry';

// ---------------------------------------------------------------------------
// supports()
// ---------------------------------------------------------------------------

describe('changellyProvider.supports()', () => {
	beforeEach(() => {
		vi.mocked(isChangeallySwapsEnabled).mockReturnValue(true);
	});

	it('static pair usdt-bsc → btc: true', () => {
		expect(changellyProvider.supports(TOKENS['usdt-bsc'], TOKENS['btc'])).toBe(true);
	});

	it('static pair usdt-bsc → wbtc-arb: true', () => {
		expect(changellyProvider.supports(TOKENS['usdt-bsc'], TOKENS['wbtc-arb'])).toBe(true);
	});

	it('unsupported static pair: false (without currency cache)', () => {
		expect(changellyProvider.supports(TOKENS['rbtc'], TOKENS['btc'])).toBe(false);
	});

	it('returns false when kill-switch disabled', () => {
		vi.mocked(isChangeallySwapsEnabled).mockReturnValue(false);
		expect(changellyProvider.supports(TOKENS['usdt-bsc'], TOKENS['btc'])).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// supports() with dynamic currency cache
// ---------------------------------------------------------------------------

describe('changellyProvider.supports() — dynamic currency cache', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(isChangeallySwapsEnabled).mockReturnValue(true);
	});

	it('returns true for cached currency tickers', async () => {
		vi.mocked(changellyService.getCurrencies).mockResolvedValueOnce([
			{ name: 'Solana', ticker: 'sol', enabled: true, network: 'solana', precision: 9 },
			{ name: 'Ripple', ticker: 'xrp', enabled: true, network: 'ripple', precision: 6 }
		]);

		await loadCurrencies();

		// Create tokens with matching tickers
		const solToken = {
			key: 'sol',
			symbol: 'SOL',
			address: '',
			chain: 'solana',
			chainId: 0,
			decimals: 9,
			native: true
		};
		const xrpToken = {
			key: 'xrp',
			symbol: 'XRP',
			address: '',
			chain: 'ripple',
			chainId: 0,
			decimals: 6,
			native: true
		};

		// SOL→XRP should be supported now (both in cache)
		expect(changellyProvider.supports(solToken, xrpToken)).toBe(true);
	});

	it('returns false for non-cached tickers', async () => {
		vi.mocked(changellyService.getCurrencies).mockResolvedValueOnce([
			{ name: 'Solana', ticker: 'sol', enabled: true, network: 'solana', precision: 9 }
		]);

		await loadCurrencies();

		const unknownToken = {
			key: 'xyz',
			symbol: 'XYZ',
			address: '',
			chain: 'unknown',
			chainId: 0,
			decimals: 18,
			native: true
		};
		expect(changellyProvider.supports(TOKENS['rbtc'], unknownToken)).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// getQuote()
// ---------------------------------------------------------------------------

describe('changellyProvider.getQuote()', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(isChangeallySwapsEnabled).mockReturnValue(true);
		vi.mocked(changellyService.getCurrencies).mockResolvedValue([]);
	});

	it('success: returns Route with changelly hop', async () => {
		vi.mocked(changellyService.estimateSwap).mockResolvedValueOnce({
			estimatedAmount: '0.00095',
			rate: '0.0000095',
			fee: '0.0001',
			minerFee: '0.00001'
		});

		// usdt-bsc has 18 decimals: 100_000 sats / 1e18 = "0.000000000000100000"
		const route = await changellyProvider.getQuote(TOKENS['usdt-bsc'], TOKENS['btc'], 100_000);

		expect(route).not.toBeNull();
		expect(route!.hops).toHaveLength(1);
		expect(route!.hops[0].service).toBe('changelly');
		expect(route!.id).toContain('changelly');
	});

	it('error: returns null on service rejection', async () => {
		vi.mocked(changellyService.estimateSwap).mockRejectedValueOnce(new Error('API down'));

		const route = await changellyProvider.getQuote(TOKENS['usdt-bsc'], TOKENS['btc'], 100_000);
		expect(route).toBeNull();
	});

	it('invalid amount: returns null', async () => {
		const route = await changellyProvider.getQuote(TOKENS['usdt-bsc'], TOKENS['btc'], 0);
		expect(route).toBeNull();
		expect(changellyService.estimateSwap).not.toHaveBeenCalled();
	});

	it('negative amount: returns null', async () => {
		const route = await changellyProvider.getQuote(TOKENS['usdt-bsc'], TOKENS['btc'], -100);
		expect(route).toBeNull();
	});

	it('NaN amount: returns null', async () => {
		const route = await changellyProvider.getQuote(TOKENS['usdt-bsc'], TOKENS['btc'], NaN);
		expect(route).toBeNull();
	});

	it('zero estimatedAmount: returns null', async () => {
		vi.mocked(changellyService.estimateSwap).mockResolvedValueOnce({
			estimatedAmount: '0',
			rate: '0',
			fee: '0',
			minerFee: '0'
		});

		const route = await changellyProvider.getQuote(TOKENS['usdt-bsc'], TOKENS['btc'], 100_000);
		expect(route).toBeNull();
	});
});
