/**
 * use-send-form-validation.svelte.ts — Unit Tests
 *
 * TDD tests for the send form validation rune extracted from SendPaymentForm.svelte.
 * Tests pure helpers + rune factory (mock-first, London School).
 *
 * Coverage targets:
 * - Pure helpers: parseAmountToSats, satsToUsd, computeAvailableBalance,
 *   isSupportedNetwork, validateSendForm
 * - Rune factory: getters, derived composition, all validation branches
 * - 5 states: empty, loading, error, populated, edge-case
 */
import { describe, it, expect } from 'vitest';
import {
	parseAmountToSats,
	satsToUsd,
	computeAvailableBalance,
	isSupportedNetwork,
	validateSendForm,
	SUPPORTED_SEND_NETWORKS,
	type SendFormValidationContext,
	type WalletStoreSnapshot
} from '$lib/runes/use-send-form-validation.svelte';
import type { ParsedPaymentAddress } from '$lib/utils/helpers/paymentAddressParser';

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------

function createValidParsedData(
	overrides: Partial<ParsedPaymentAddress> = {}
): ParsedPaymentAddress {
	return {
		isValid: true,
		address: '0xabc123',
		network: 'rootstock-bitcoin',
		amount: null,
		memo: null,
		...overrides
	};
}

function createWalletStore(overrides: Partial<WalletStoreSnapshot> = {}): WalletStoreSnapshot {
	return {
		rsk: { connected: true, formattedBalance: '0.001' },
		bsc: { formattedUsdtBalance: '100.50' },
		...overrides
	};
}

function createValidContext(
	overrides: Partial<SendFormValidationContext> = {}
): SendFormValidationContext {
	return {
		parsedData: createValidParsedData(),
		isNetworkSupported: true,
		isSourceWalletConnected: true,
		amountRequired: true,
		amountInSats: 50_000,
		hasInsufficientBalance: false,
		isBelowSwapMinimum: false,
		isSelfSend: false,
		network: 'rootstock-bitcoin',
		...overrides
	};
}

// ---------------------------------------------------------------------------
// Pure Helper Tests — parseAmountToSats
// ---------------------------------------------------------------------------
describe('parseAmountToSats', () => {
	it('returns detectedAmount when not null (overrides user input)', () => {
		expect(parseAmountToSats('100', 'sats', 25_000, 65_000)).toBe(25_000);
	});

	it('parses sats unit directly (integer)', () => {
		expect(parseAmountToSats('50000', 'sats', null, 65_000)).toBe(50_000);
	});

	it('floors sats unit (float input)', () => {
		expect(parseAmountToSats('50000.7', 'sats', null, 65_000)).toBe(50_000);
	});

	it('returns 0 for NaN sats input', () => {
		expect(parseAmountToSats('abc', 'sats', null, 65_000)).toBe(0);
	});

	it('returns 0 for empty string sats input', () => {
		expect(parseAmountToSats('', 'sats', null, 65_000)).toBe(0);
	});

	it('converts USD to sats via btcPrice', () => {
		// $65 → 65/65000 * 1e8 = 100_000 sats
		expect(parseAmountToSats('65', 'usd', null, 65_000)).toBe(100_000);
	});

	it('returns 0 for USD input when btcPrice is 0', () => {
		expect(parseAmountToSats('65', 'usd', null, 0)).toBe(0);
	});

	it('returns 0 for NaN USD input', () => {
		expect(parseAmountToSats('abc', 'usd', null, 65_000)).toBe(0);
	});

	it('floors USD→sats conversion to integer', () => {
		// $1 → 1/65000 * 1e8 = 1538.46... → floor → 1538
		expect(parseAmountToSats('1', 'usd', null, 65_000)).toBe(
			Math.floor((1 / 65_000) * 100_000_000)
		);
	});

	it('detectedAmount takes precedence even with valid user input', () => {
		expect(parseAmountToSats('999999', 'sats', 100, 65_000)).toBe(100);
	});

	it('detectedAmount of 0 is still used (not null)', () => {
		expect(parseAmountToSats('50000', 'sats', 0, 65_000)).toBe(0);
	});
});

// ---------------------------------------------------------------------------
// Pure Helper Tests — satsToUsd
// ---------------------------------------------------------------------------
describe('satsToUsd', () => {
	it('converts sats to USD', () => {
		// 100_000 sats at $65_000 = 65 USD
		expect(satsToUsd(100_000, 65_000)).toBeCloseTo(65, 5);
	});

	it('returns 0 when btcPrice is 0', () => {
		expect(satsToUsd(100_000, 0)).toBe(0);
	});

	it('returns 0 for 0 sats', () => {
		expect(satsToUsd(0, 65_000)).toBe(0);
	});

	it('handles 1 sat', () => {
		expect(satsToUsd(1, 65_000)).toBeCloseTo(0.00065, 8);
	});

	it('handles large amounts', () => {
		// 21_000_000 BTC * 1e8 sats = 2.1e15 sats
		expect(satsToUsd(2_100_000_000_000_000, 65_000)).toBeCloseTo(21_000_000 * 65_000, 0);
	});
});

// ---------------------------------------------------------------------------
// Pure Helper Tests — computeAvailableBalance
// ---------------------------------------------------------------------------
describe('computeAvailableBalance', () => {
	it('returns 10B for non-builtin wallet (safety buffer)', () => {
		const ws = createWalletStore();
		const result = computeAvailableBalance(
			'rootstock-bitcoin',
			'wallet-1',
			[{ id: 'wallet-1' }],
			ws
		);
		expect(result).toBe(10_000_000_000);
	});

	it('returns 10B for non-builtin wallet even when not in connected list', () => {
		const ws = createWalletStore();
		const result = computeAvailableBalance(
			'rootstock-bitcoin',
			'wallet-99',
			[{ id: 'wallet-1' }],
			ws
		);
		expect(result).toBe(10_000_000_000);
	});

	it('parses usdt-bsc balance (formattedUsdtBalance)', () => {
		const ws = createWalletStore({ bsc: { formattedUsdtBalance: '100.50' } });
		const result = computeAvailableBalance('usdt-bsc', 'builtin', [], ws);
		expect(result).toBe(Math.floor(100.5 * 100_000_000));
	});

	it('returns 0 for usdt-bsc with zero balance', () => {
		const ws = createWalletStore({ bsc: { formattedUsdtBalance: '0' } });
		const result = computeAvailableBalance('usdt-bsc', 'builtin', [], ws);
		expect(result).toBe(0);
	});

	it('returns 0 for usdt-bsc with negative balance', () => {
		const ws = createWalletStore({ bsc: { formattedUsdtBalance: '-5' } });
		const result = computeAvailableBalance('usdt-bsc', 'builtin', [], ws);
		expect(result).toBe(0);
	});

	it('returns 0 for usdt-bsc with NaN balance', () => {
		const ws = createWalletStore({ bsc: { formattedUsdtBalance: 'abc' } });
		const result = computeAvailableBalance('usdt-bsc', 'builtin', [], ws);
		expect(result).toBe(0);
	});

	it('parses RSK RBTC balance when connected', () => {
		const ws = createWalletStore({
			rsk: { connected: true, formattedBalance: '0.001' }
		});
		const result = computeAvailableBalance('rootstock-bitcoin', 'builtin', [], ws);
		// 0.001 BTC = 100_000 sats
		expect(result).toBe(Math.floor(0.001 * 100_000_000));
	});

	it('returns 0 when RSK not connected', () => {
		const ws = createWalletStore({
			rsk: { connected: false, formattedBalance: '0.001' }
		});
		const result = computeAvailableBalance('rootstock-bitcoin', 'builtin', [], ws);
		expect(result).toBe(0);
	});

	it('returns 0 for RSK with NaN formattedBalance', () => {
		const ws = createWalletStore({
			rsk: { connected: true, formattedBalance: 'abc' }
		});
		const result = computeAvailableBalance('rootstock-bitcoin', 'builtin', [], ws);
		expect(result).toBe(0);
	});

	it('handles empty formattedBalance string', () => {
		const ws = createWalletStore({
			rsk: { connected: true, formattedBalance: '' }
		});
		const result = computeAvailableBalance('rootstock-bitcoin', 'builtin', [], ws);
		expect(result).toBe(0);
	});
});

// ---------------------------------------------------------------------------
// Pure Helper Tests — isSupportedNetwork
// ---------------------------------------------------------------------------
describe('isSupportedNetwork', () => {
	it('returns true for null network (no network detected yet)', () => {
		expect(isSupportedNetwork(null)).toBe(true);
	});

	it('returns true for rootstock-bitcoin', () => {
		expect(isSupportedNetwork('rootstock-bitcoin')).toBe(true);
	});

	it('returns true for lightning-bitcoin', () => {
		expect(isSupportedNetwork('lightning-bitcoin')).toBe(true);
	});

	it('returns true for bitcoin', () => {
		expect(isSupportedNetwork('bitcoin')).toBe(true);
	});

	it('returns true for usdt-bsc', () => {
		expect(isSupportedNetwork('usdt-bsc')).toBe(true);
	});

	it('returns false for liquid-bitcoin', () => {
		expect(isSupportedNetwork('liquid-bitcoin')).toBe(false);
	});

	it('returns false for usdt-ethereum', () => {
		expect(isSupportedNetwork('usdt-ethereum')).toBe(false);
	});

	it('returns false for unknown network', () => {
		expect(isSupportedNetwork('solana')).toBe(false);
	});

	it('SUPPORTED_SEND_NETWORKS contains exactly 4 networks', () => {
		expect(SUPPORTED_SEND_NETWORKS.size).toBe(4);
	});
});

// ---------------------------------------------------------------------------
// Pure Helper Tests — validateSendForm
// ---------------------------------------------------------------------------
describe('validateSendForm', () => {
	it('returns true for a fully valid form', () => {
		expect(validateSendForm(createValidContext()).valid).toBe(true);
	});

	// --- Address validation ---
	it('returns false when parsedData is null', () => {
		expect(validateSendForm(createValidContext({ parsedData: null })).valid).toBe(false);
	});

	it('returns false when parsedData.isValid is false', () => {
		expect(
			validateSendForm(
				createValidContext({
					parsedData: createValidParsedData({ isValid: false })
				})
			).valid
		).toBe(false);
	});

	// --- Network validation ---
	it('returns false for unsupported network', () => {
		expect(validateSendForm(createValidContext({ isNetworkSupported: false })).valid).toBe(false);
	});

	// --- Source wallet connection ---
	it('returns false when source wallet not connected', () => {
		expect(validateSendForm(createValidContext({ isSourceWalletConnected: false })).valid).toBe(
			false
		);
	});

	// --- Amount validation ---
	it('returns false when amountRequired and amountInSats is 0', () => {
		expect(
			validateSendForm(createValidContext({ amountRequired: true, amountInSats: 0 })).valid
		).toBe(false);
	});

	it('returns false when amountInSats is 0 regardless of amountRequired', () => {
		expect(
			validateSendForm(createValidContext({ amountRequired: false, amountInSats: 0 })).valid
		).toBe(false);
	});

	it('returns false when amountInSats is negative', () => {
		expect(validateSendForm(createValidContext({ amountInSats: -100 })).valid).toBe(false);
	});

	// --- LNURL bounds ---
	it('returns false when amount below LNURL minimum', () => {
		const data = createValidParsedData({
			lnurlCallback: 'https://lnurl.example.com/callback',
			lnurlMinSendable: 10_000_000, // 10_000 sats in msats
			lnurlMaxSendable: 100_000_000
		});
		expect(
			validateSendForm(createValidContext({ parsedData: data, amountInSats: 5_000 })).valid
		).toBe(false);
	});

	it('returns false when amount above LNURL maximum', () => {
		const data = createValidParsedData({
			lnurlCallback: 'https://lnurl.example.com/callback',
			lnurlMinSendable: 10_000_000,
			lnurlMaxSendable: 100_000_000 // 100_000 sats in msats
		});
		expect(
			validateSendForm(createValidContext({ parsedData: data, amountInSats: 200_000 })).valid
		).toBe(false);
	});

	it('returns true when amount within LNURL bounds', () => {
		const data = createValidParsedData({
			lnurlCallback: 'https://lnurl.example.com/callback',
			lnurlMinSendable: 10_000_000,
			lnurlMaxSendable: 100_000_000
		});
		expect(
			validateSendForm(createValidContext({ parsedData: data, amountInSats: 50_000 })).valid
		).toBe(true);
	});

	it('skips LNURL bounds check when no lnurlCallback', () => {
		const data = createValidParsedData({
			lnurlCallback: undefined,
			lnurlMinSendable: 10_000_000,
			lnurlMaxSendable: 100_000_000
		});
		expect(
			validateSendForm(createValidContext({ parsedData: data, amountInSats: 5_000 })).valid
		).toBe(true);
	});

	it('handles LNURL minSendable as ceil (msats→sats)', () => {
		// 10_000_500 msats → ceil(10_000_500/1000) = 10_001 sats
		const data = createValidParsedData({
			lnurlCallback: 'https://lnurl.example.com/callback',
			lnurlMinSendable: 10_000_500,
			lnurlMaxSendable: 100_000_000
		});
		expect(
			validateSendForm(createValidContext({ parsedData: data, amountInSats: 10_000 })).valid
		).toBe(false);
		expect(
			validateSendForm(createValidContext({ parsedData: data, amountInSats: 10_001 })).valid
		).toBe(true);
	});

	it('handles LNURL maxSendable as floor (msats→sats)', () => {
		// 100_000_500 msats → floor(100_000_500/1000) = 100_000 sats
		const data = createValidParsedData({
			lnurlCallback: 'https://lnurl.example.com/callback',
			lnurlMinSendable: 10_000_000,
			lnurlMaxSendable: 100_000_500
		});
		expect(
			validateSendForm(createValidContext({ parsedData: data, amountInSats: 100_001 })).valid
		).toBe(false);
		expect(
			validateSendForm(createValidContext({ parsedData: data, amountInSats: 100_000 })).valid
		).toBe(true);
	});

	// --- Insufficient balance ---
	it('returns false when hasInsufficientBalance', () => {
		expect(validateSendForm(createValidContext({ hasInsufficientBalance: true })).valid).toBe(
			false
		);
	});

	// --- Swap minimum ---
	it('returns false when isBelowSwapMinimum', () => {
		expect(validateSendForm(createValidContext({ isBelowSwapMinimum: true })).valid).toBe(false);
	});

	// --- Self send ---
	it('returns false when isSelfSend', () => {
		expect(validateSendForm(createValidContext({ isSelfSend: true })).valid).toBe(false);
	});

	// --- Edge: multiple failures ---
	it('returns false with multiple simultaneous failures', () => {
		expect(
			validateSendForm(
				createValidContext({
					isNetworkSupported: false,
					isSourceWalletConnected: false,
					hasInsufficientBalance: true,
					isSelfSend: true,
					amountInSats: 0
				})
			).valid
		).toBe(false);
	});

	// --- Edge: amountRequired false but amount > 0 should still pass ---
	it('returns true when amountRequired is false but amount is positive', () => {
		expect(
			validateSendForm(createValidContext({ amountRequired: false, amountInSats: 50_000 })).valid
		).toBe(true);
	});
});
