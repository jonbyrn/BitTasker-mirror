/**
 * wallet-formatters.ts — Unit tests for shared wallet formatting utilities.
 */
import { describe, it, expect } from 'vitest';
import {
	formatRelativeTime,
	formatSatsWithUsd,
	isBrandPicture,
	isRgbMovement,
	pickHeroAsset,
	shortOutpoint,
	stableInnerFormat,
	stableWalletAvailableUsd,
	summarizeUtxoKinds
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

	it('returns "0 Sats" for btc with no balance and no cache', () => {
		const w = makeWallet('w1', { btc: { raw: '0', formatted: '0', loading: false } });
		expect(stableInnerFormat(w, 'btc', emptyCache, satsFormatter, usdFormatter, btcPrice)).toBe(
			'0 Sats'
		);
	});

	it('formats btc balance as sats with USD', () => {
		const w = makeWallet('w1', {
			btc: { raw: '100000', formatted: '0.001', loading: false }
		});
		const result = stableInnerFormat(w, 'btc', emptyCache, satsFormatter, usdFormatter, btcPrice);
		expect(result).toContain('100,000');
		expect(result).toContain('Sats');
	});

	it('formats usdt_rgb as dollar amount', () => {
		const w = makeWallet('w1', {
			usdt_rgb: { raw: '5000000', formatted: '5.00', loading: false }
		});
		expect(
			stableInnerFormat(w, 'usdt_rgb', emptyCache, satsFormatter, usdFormatter, btcPrice)
		).toBe('$5.00');
	});

	it('formats btc_lightning balance as sats with USD', () => {
		const w = makeWallet('w1', {
			btc_lightning: { raw: '100000000', formatted: '1.0', loading: false }
		});
		const result = stableInnerFormat(
			w,
			'btc_lightning',
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
			btc: { raw: '0', formatted: '0', loading: false }
		});
		const cache = { w1: { btc: '200000', usdt: '0', wbtc: '0', tbtc: '0' } };
		const result = stableInnerFormat(w, 'btc', cache, satsFormatter, usdFormatter, btcPrice);
		expect(result).toContain('200,000');
		expect(result).toContain('Sats');
	});

	it('falls back to cache for btc_lightning when live is zero', () => {
		const w = makeWallet('w1', {
			btc_lightning: { raw: '0', formatted: '0', loading: false }
		});
		// Cache btc raw = 100,000,000 sats = 1 BTC
		const cache = {
			w1: { btc: '100000000', usdt: '0', wbtc: '0', tbtc: '0' }
		};
		const result = stableInnerFormat(
			w,
			'btc_lightning',
			cache,
			satsFormatter,
			usdFormatter,
			btcPrice
		);
		expect(result).toContain('100,000,000');
		expect(result).toContain('Sats');
	});

	it('returns "$0.00" for usdt_rgb when no balance and no cache', () => {
		const w = makeWallet('w1', undefined);
		expect(
			stableInnerFormat(w, 'usdt_rgb', emptyCache, satsFormatter, usdFormatter, btcPrice)
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

	it('computes USD from btc balance', () => {
		// 100,000,000 sats = 1 BTC = $50,000 at $50k/BTC
		const w = makeWallet('w1', {
			btc: { raw: '100000000', formatted: '1.0', loading: false }
		});
		const result = stableWalletAvailableUsd(w, emptyCache, usdFormatter, btcPrice);
		expect(result).toContain('50,000');
	});

	it('includes btc_lightning in total USD', () => {
		// 100,000,000 sats of Lightning BTC = 1 BTC = $50,000 at $50k/BTC
		const w = makeWallet('w1', {
			btc_lightning: { raw: '100000000', formatted: '1.0', loading: false }
		});
		const result = stableWalletAvailableUsd(w, emptyCache, usdFormatter, btcPrice);
		expect(result).toContain('50,000');
	});

	it('falls back to cache with btc when live is empty', () => {
		const w = makeWallet('w1', undefined);
		const cache = {
			w1: { btc: '100000000', usdt: '0', wbtc: '0', tbtc: '0' }
		};
		const result = stableWalletAvailableUsd(w, cache, usdFormatter, btcPrice);
		expect(result).toContain('50,000');
	});
});

describe('wallet dashboard display', () => {
	it('counts colored, locked, and available coins', () => {
		expect(summarizeUtxoKinds(['colored', 'colored', 'locked', 'free', 'vanilla'])).toEqual({
			colored: 2,
			locked: 1,
			available: 2
		});
	});

	it('shortens a txid and keeps the output index', () => {
		expect(
			shortOutpoint('2af94a3e123bf2ca5d66f3f085ac75f3badd19c951fe82f997a8d59c038966e1:4')
		).toBe('2af9…66e1:4');
	});

	it('puts USDT first and describes recent movement', () => {
		const now = Date.UTC(2026, 8, 24, 12, 0, 0);
		expect(
			pickHeroAsset([
				{ assetId: 'e2e', symbol: 'E2E' },
				{ assetId: 'usdt', symbol: 'USDT' }
			])
		).toEqual({
			hero: { assetId: 'usdt', symbol: 'USDT' },
			rest: [{ assetId: 'e2e', symbol: 'E2E' }]
		});
		expect(formatRelativeTime(now - 2 * 60_000, now, 'en')).toBe('2 minutes ago');
		expect(isRgbMovement('RGB transfer')).toBe(true);
		expect(isRgbMovement('Bitcoin transfer')).toBe(false);
		expect(isBrandPicture('/images/logos/bittasker-logomark.svg')).toBe(true);
		expect(isBrandPicture('https://cdn.example/avatar.png')).toBe(false);
	});
});
