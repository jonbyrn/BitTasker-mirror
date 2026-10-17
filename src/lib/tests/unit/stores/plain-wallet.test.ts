import { describe, expect, it } from 'vitest';
import {
	combinedSats,
	detectPayment,
	feeEstimateSats,
	formatUsd,
	heldUsdt,
	isUsdtHistory,
	usdFromSats,
	walletChip
} from '$lib/stores/wallet/plain-wallet';

describe('walletChip', () => {
	it('stays on getting ready while the wallet is locked or syncing', () => {
		expect(
			walletChip({
				locked: true,
				syncing: false,
				initializing: false,
				connected: false,
				hasError: true
			})
		).toBe('getting_ready');
		expect(
			walletChip({
				locked: false,
				syncing: true,
				initializing: false,
				connected: true,
				hasError: false
			})
		).toBe('getting_ready');
	});

	it('is ready only when the wallet is open and quiet', () => {
		expect(
			walletChip({
				locked: false,
				syncing: false,
				initializing: false,
				connected: true,
				hasError: false
			})
		).toBe('ready');
	});

	it('is offline when setup failed', () => {
		expect(
			walletChip({
				locked: false,
				syncing: false,
				initializing: false,
				connected: false,
				hasError: true
			})
		).toBe('offline');
	});
});

describe('combined balances', () => {
	it('adds both rails and ignores junk numbers', () => {
		expect(combinedSats(100, 25)).toBe(125);
		expect(combinedSats(Number.NaN, 10)).toBe(10);
	});

	it('keeps settled USDT when spendable is zero', () => {
		expect(heldUsdt({ spendable: 0, balance: 1_000_000 }, 0, 0)).toBe(1_000_000);
		expect(heldUsdt({ spendable: 500_000, balance: 1_000_000 }, 0, 250_000)).toBe(750_000);
		expect(heldUsdt(null, 0, Number.NaN)).toBe(0);
	});

	it('treats RGB rows and asset units as USDT history', () => {
		expect(isUsdtHistory('RGB transfer', undefined)).toBe(true);
		expect(isUsdtHistory('Bitcoin transfer', 1_000_000)).toBe(true);
		expect(isUsdtHistory('Bitcoin transfer', 0)).toBe(false);
	});

	it('turns sats into dollars', () => {
		expect(usdFromSats(100_000_000, 50_000)).toBe(50_000);
		expect(usdFromSats(100, 0)).toBeNull();
		expect(formatUsd(10)).toBe('$10.00');
		expect(feeEstimateSats(2)).toBe(400);
	});
});

describe('detectPayment', () => {
	it('picks a rail from the pasted text', () => {
		expect(detectPayment('rgb:invoice')).toBe('usdt_rgb');
		expect(detectPayment('lnbc1pay')).toBe('btc_lightning');
		expect(detectPayment('tb1qexampleaddress')).toBe('btc_onchain');
		expect(detectPayment('alex@example.com')).toBe('btc_lightning');
		expect(detectPayment('hello')).toBeNull();
	});
});
