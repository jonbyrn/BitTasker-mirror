/**
 * wallet-formatters.ts — Unit tests for shared wallet formatting utilities.
 */
import { describe, it, expect } from 'vitest';
import {
	formatSatsWithUsd,
	stableInnerFormat,
	stableWalletAvailableUsd
} from '$lib/components/wallet/wallet-formatters';

const satsFormatter = new Intl.NumberFormat('en');
const usdFormatter = new Intl.NumberFormat('en', { style: 'currency', currency: 'USD' });
const btcPrice = 50000; // $50,000 per BTC

describe('formatSatsWithUsd', () => {
	it('returns "0 Sats" for zero', () => {
		expect(formatSatsWithUsd(0, satsFormatter, usdFormatter, btcPrice)).toBe('0 Sats');
	});

	it('returns "0 Sats" for null/undefined', () => {
		expect(formatSatsWithUsd(null, satsFormatter, usdFormatter, btcPrice)).toBe('0 Sats');
		expect(formatSatsWithUsd(undefined, satsFormatter, usdFormatter, btcPrice)).toBe('0 Sats');
	});

	it('returns "0 Sats" for negative values', () => {
		expect(formatSatsWithUsd(-100, satsFormatter, usdFormatter, btcPrice)).toBe('0 Sats');
	});

	it('formats sats with USD equivalent', () => {
		// 100,000 sats = 0.001 BTC = $50 at $50k/BTC
		const result = formatSatsWithUsd(100000, satsFormatter, usdFormatter, btcPrice);
		expect(result).toContain('100,000');
		expect(result).toContain('Sats');
		expect(result).toContain('$50');
	});

	it('accepts string input', () => {
		const result = formatSatsWithUsd('50000', satsFormatter, usdFormatter, btcPrice);
		expect(result).toContain('50,000');
		expect(result).toContain('Sats');
	});
});

describe('stableInnerFormat', () => {
	const emptyCache = {};

	function makeWallet(
		id: string,
		balances: Record<string, { raw: string; formatted: string; loading: boolean }> | undefined
	) {
		return { id, balances };
	}

	it('returns "0 Sats" for rbtc with no balance and no cache', () => {
		const w = makeWallet('w1', { rbtc: { raw: '0', formatted: '0', loading: false } });
		expect(stableInnerFormat(w, 'rbtc', emptyCache, satsFormatter, usdFormatter, btcPrice)).toBe(
			'0 Sats'
		);
	});

	it('formats rbtc balance as sats with USD', () => {
		const w = makeWallet('w1', {
			rbtc: { raw: '100000', formatted: '0.001', loading: false }
		});
		const result = stableInnerFormat(w, 'rbtc', emptyCache, satsFormatter, usdFormatter, btcPrice);
		expect(result).toContain('100,000');
		expect(result).toContain('Sats');
	});

	it('formats usdt0-arb as dollar amount', () => {
		const w = makeWallet('w1', {
			'usdt0-arb': { raw: '5000000', formatted: '5.00', loading: false }
		});
		expect(
			stableInnerFormat(w, 'usdt0-arb', emptyCache, satsFormatter, usdFormatter, btcPrice)
		).toBe('$5.00');
	});

	it('formats tbtc-arb by dividing by 1e10 to get sats', () => {
		// tBTC has 18 decimals. 10^18 raw = 1 tBTC = 100,000,000 sats
		const w = makeWallet('w1', {
			'tbtc-arb': { raw: '1000000000000000000', formatted: '1.0', loading: false }
		});
		const result = stableInnerFormat(
			w,
			'tbtc-arb',
			emptyCache,
			satsFormatter,
			usdFormatter,
			btcPrice
		);
		expect(result).toContain('100,000,000');
		expect(result).toContain('Sats');
	});

	it('falls back to cache when live balance is zero', () => {
		const w = makeWallet('w1', {
			rbtc: { raw: '0', formatted: '0', loading: false }
		});
		const cache = { w1: { rbtc: '200000', btc: '0', usdt: '0', wbtc: '0', tbtc: '0' } };
		const result = stableInnerFormat(w, 'rbtc', cache, satsFormatter, usdFormatter, btcPrice);
		expect(result).toContain('200,000');
		expect(result).toContain('Sats');
	});

	it('falls back to cache for tbtc-arb when live is zero', () => {
		const w = makeWallet('w1', {
			'tbtc-arb': { raw: '0', formatted: '0', loading: false }
		});
		// Cache tbtc raw = 10^18 = 1 tBTC = 100,000,000 sats
		const cache = {
			w1: { rbtc: '0', btc: '0', usdt: '0', wbtc: '0', tbtc: '1000000000000000000' }
		};
		const result = stableInnerFormat(w, 'tbtc-arb', cache, satsFormatter, usdFormatter, btcPrice);
		expect(result).toContain('100,000,000');
		expect(result).toContain('Sats');
	});

	it('returns "$0.00" for usdt0-arb when no balance and no cache', () => {
		const w = makeWallet('w1', undefined);
		expect(
			stableInnerFormat(w, 'usdt0-arb', emptyCache, satsFormatter, usdFormatter, btcPrice)
		).toBe('$0.00');
	});
});

describe('stableWalletAvailableUsd', () => {
	const emptyCache = {};

	function makeWallet(
		id: string,
		balances: Record<string, { raw: string; formatted: string; loading: boolean }> | undefined
	) {
		return { id, balances };
	}

	it('returns "$0.00" when no balances and no cache', () => {
		const w = makeWallet('w1', undefined);
		expect(stableWalletAvailableUsd(w, emptyCache, usdFormatter, btcPrice)).toBe('$0.00');
	});

	it('computes USD from rbtc balance', () => {
		// 100,000,000 sats = 1 BTC = $50,000 at $50k/BTC
		const w = makeWallet('w1', {
			rbtc: { raw: '100000000', formatted: '1.0', loading: false }
		});
		const result = stableWalletAvailableUsd(w, emptyCache, usdFormatter, btcPrice);
		expect(result).toContain('50,000');
	});

	it('includes tbtc-arb in total USD', () => {
		// tBTC has 18 decimals. 10^18 raw = 1 tBTC = 100,000,000 sats = $50,000 at $50k/BTC
		const w = makeWallet('w1', {
			'tbtc-arb': { raw: '1000000000000000000', formatted: '1.0', loading: false }
		});
		const result = stableWalletAvailableUsd(w, emptyCache, usdFormatter, btcPrice);
		expect(result).toContain('50,000');
	});

	it('falls back to cache with tbtc when live is empty', () => {
		const w = makeWallet('w1', undefined);
		const cache = {
			w1: { rbtc: '0', btc: '0', usdt: '0', wbtc: '0', tbtc: '1000000000000000000' }
		};
		const result = stableWalletAvailableUsd(w, cache, usdFormatter, btcPrice);
		expect(result).toContain('50,000');
	});
});
