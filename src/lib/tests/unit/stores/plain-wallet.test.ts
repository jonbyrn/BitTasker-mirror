import { describe, expect, it } from 'vitest';
import {
	bitcoinFigures,
	bookedUsdt,
	combinedSats,
	detectPayment,
	expiryHours,
	feeEstimateSats,
	formatUsd,
	heldUsdt,
	lockedUnits,
	plainSendReason,
	satsForDisplay,
	settlementSendReason,
	usdtOnHold,
	shownUsdt,
	spendCapText,
	isUsdtHistory,
	usdFromSats,
	walletChip
} from '$lib/stores/wallet/plain-wallet';

describe('walletChip', () => {
	it('says locked while the wallet still needs a fingerprint', () => {
		expect(
			walletChip({
				locked: true,
				syncing: false,
				initializing: false,
				connected: false,
				hasError: true
			})
		).toBe('locked');
		expect(
			walletChip({
				locked: false,
				syncing: true,
				initializing: false,
				connected: true,
				hasError: false
			})
		).toBe('ready');
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

	it('shows only the live spendable amount after a send or release', () => {
		expect(
			shownUsdt({ balance: 100_000_000, spendable: 100_000_000, chainSpendable: 10_000_000 }, 0, 0)
		).toBe(10_000_000);
		expect(
			shownUsdt(
				{ balance: 100_000_000, spendable: 100_000_000, chainUnknown: true, chainSpendable: 0 },
				0,
				0
			)
		).toBe(100_000_000);
		expect(spendCapText('10.00')).toBe('You have $10.00 USDT. You can send up to $10.00.');
		expect(plainSendReason('bdk adding utxos')).toBe(
			'The payment did not send. Nothing left the wallet. Tap Retry.'
		);
		expect(plainSendReason('no connection to the node')).toBe(
			'Connection problem: No connection. Nothing was sent.'
		);
		expect(plainSendReason('The operation either timed out or was not allowed.')).toBe(
			'Passkey approval timed out or was cancelled. Your entries are still here. Tap Retry.'
		);
		expect(plainSendReason('USDT amount is larger than the spendable balance.')).toBe(
			'Not enough USDT'
		);
		expect(
			plainSendReason(
				'Refusing onchainSend: a partial send leaves the rest stuck. Send the full balance. Nothing was sent.'
			)
		).toBe(
			'Add a little bitcoin so the rest of your dollars can stay in this wallet. Nothing was sent.'
		);
		expect(
			plainSendReason(
				'Refusing onchainSend: bitcoin change must come back and the fee must stay within the fee rate. Nothing was sent.'
			)
		).toBe('The network fee was too high, so nothing was sent.');
		expect(plainSendReason('Refusing onchainSend: no uncolored fee UTXO')).toBe(
			'Add a little bitcoin so the rest of your dollars can stay in this wallet. Nothing was sent.'
		);
		expect(
			plainSendReason('This wallet is open in another tab or browser. Close it or refresh')
		).toBe('This wallet is open in another tab or browser. Close it or refresh');
		expect(
			plainSendReason(
				'Refusing onchainSend: rgb:held is locked by a blank invoice. The payment arrives as a new UTXO.'
			)
		).toBe('Your dollars are still held by an old receive code. Cancel it and try again.');
		expect(settlementSendReason('USDT escrow requires an rgb: invoice')).toBe(
			'This payment code does not match the contract. Ask for a new one. Nothing was sent.'
		);
		expect(settlementSendReason('Refusing onchainSend: no uncolored fee UTXO')).toBe(
			'Not enough bitcoin for the network fee. Nothing was sent.'
		);
		expect(settlementSendReason('USDT send stopped before it was built. Nothing was sent.')).toBe(
			'The payment stopped before it left this wallet. Nothing was sent.'
		);
		expect(settlementSendReason('RGB wallet is not initialized')).toBe(
			'The wallet is locked. Unlock it and try again. Nothing was sent.'
		);
		expect(expiryHours(1_000, 1_000_000)).toBe(0);
		expect(expiryHours(3_600, 0)).toBe(1);
		expect(expiryHours(null)).toBeNull();
	});

	it('keeps settled USDT unless future is the smaller change', () => {
		expect(bookedUsdt({ spendable: 100, settled: 80, future: 80 })).toBe(100);
		expect(bookedUsdt({ spendable: 0, settled: 100_000_000, future: 100_000_000 })).toBe(
			100_000_000
		);
		expect(bookedUsdt({ spendable: 0, settled: 100_000_000, future: 80_000_000 })).toBe(80_000_000);
		expect(
			shownUsdt(
				{
					balance: 80_000_000,
					spendable: 0,
					future: 80_000_000,
					chainSpendable: 0,
					chainSpent: 100_000_000
				},
				0,
				0
			)
		).toBe(0);
		expect(lockedUnits({ chainSpendable: 0, chainSpent: 100_000_000 })).toBe(100_000_000);
		expect(lockedUnits({ chainSpendable: 10, chainSpent: 100 })).toBe(0);
		expect(lockedUnits({ chainUnknown: true, chainSpendable: 0, chainSpent: 100 })).toBe(0);
		expect(
			plainSendReason(
				'0.00 USDT can be sent. 100.00 is locked or unconfirmed. Tap Repair wallet, then try again.'
			)
		).toBe(
			'0.00 USDT can be sent. 100.00 is locked or unconfirmed. Tap Repair wallet, then try again.'
		);
		expect(
			shownUsdt(
				{
					balance: 100_000_000,
					spendable: 100_000_000,
					chainSpendable: 0,
					chainSpent: 100_000_000
				},
				0,
				0
			)
		).toBe(0);
		expect(
			shownUsdt(
				{
					balance: 100_000_000,
					spendable: 0,
					settled: 100_000_000,
					future: 100_000_000,
					chainUnknown: true
				},
				0,
				0
			)
		).toBe(100_000_000);
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

	it('keeps the last bitcoin balance while a sync reports 0', () => {
		expect(satsForDisplay(0, 9347, true)).toBe(9347);
		expect(satsForDisplay(0, 9347, false)).toBe(0);
		expect(satsForDisplay(1200, 9347, true)).toBe(1200);
		expect(satsForDisplay(0, 0, true)).toBe(0);
	});

	it('shows sats as the bitcoin figure and omits fiat when the price is missing', () => {
		expect(bitcoinFigures(7347, 100_000)).toEqual({ satsText: '7,347', fiat: '$7.35' });
		expect(bitcoinFigures(7347, 0)).toEqual({ satsText: '7,347', fiat: null });
	});

	it('reports dollars held back from the spendable balance', () => {
		expect(usdtOnHold({ balance: 20_000_000, spendable: 0 })).toEqual({
			available: 0,
			hold: 20_000_000
		});
		expect(usdtOnHold({ balance: 20_000_000, spendable: 20_000_000 })).toBeNull();
		expect(usdtOnHold({ balance: 80_000_000, spendable: 0, changeDue: true })).toBeNull();
		expect(usdtOnHold(null)).toBeNull();
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
