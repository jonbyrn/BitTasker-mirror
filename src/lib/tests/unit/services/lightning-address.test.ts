import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import {
	isLightningAddress,
	resolveLightningAddress
} from '$lib/services/lightning-address.service';

import type { LNURLPayResponse } from '$lib/services/lnurl-pay.service';

// ── isLightningAddress ───────────────────────────────────────────────────────

describe('isLightningAddress', () => {
	it('returns true for alice@getalby.com', () => {
		expect(isLightningAddress('alice@getalby.com')).toBe(true);
	});

	it('returns true for user@blink.sv', () => {
		expect(isLightningAddress('user@blink.sv')).toBe(true);
	});

	it('returns true for addresses with plus addressing', () => {
		expect(isLightningAddress('user+tip@stacker.news')).toBe(true);
	});

	it('returns true for addresses with dots in local part', () => {
		expect(isLightningAddress('john.doe@domain.com')).toBe(true);
	});

	it('returns true for addresses with underscores', () => {
		expect(isLightningAddress('user_name@example.io')).toBe(true);
	});

	it('returns false for strings without @ symbol', () => {
		expect(isLightningAddress('plainstring')).toBe(false);
	});

	it('returns false for strings without valid domain', () => {
		expect(isLightningAddress('user@localhost')).toBe(false);
	});

	it('returns false for strings with .com in the local part', () => {
		// The local part contains `.com` which is not a valid lightning address pattern
		expect(isLightningAddress('email.com@test.com')).toBe(false);
	});

	it('returns false for strings with .org in the local part', () => {
		expect(isLightningAddress('my.org@domain.com')).toBe(false);
	});

	it('returns false for strings with .net in the local part', () => {
		expect(isLightningAddress('test.net@example.com')).toBe(false);
	});

	it('returns false for empty strings', () => {
		expect(isLightningAddress('')).toBe(false);
	});

	it('returns false for null', () => {
		expect(isLightningAddress(null as unknown as string)).toBe(false);
	});

	it('returns false for undefined', () => {
		expect(isLightningAddress(undefined as unknown as string)).toBe(false);
	});

	it('returns false for bare LNURL bech32 strings', () => {
		expect(
			isLightningAddress(
				'lnurl1dp68gurn8ghj7um9wfmxjcm99ejhsctdwpkx2tnrdakj7tnhv4kxctttdehhwm30d3h82unvwqhh2um9wgqqqqqq'
			)
		).toBe(false);
	});

	it('returns false for BOLT11 invoices', () => {
		expect(isLightningAddress('lnbc100n1pj...')).toBe(false);
	});

	it('returns false for Bitcoin addresses', () => {
		expect(isLightningAddress('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa')).toBe(false);
	});

	it('returns false for strings with two @ symbols', () => {
		expect(isLightningAddress('user@domain@other.com')).toBe(false);
	});

	it('returns false for strings starting with @', () => {
		expect(isLightningAddress('@domain.com')).toBe(false);
	});

	it('trimmed input is still valid', () => {
		expect(isLightningAddress('  alice@getalby.com  ')).toBe(true);
	});
});

// ── resolveLightningAddress (mocked fetch) ───────────────────────────────────

describe('resolveLightningAddress', () => {
	const mockLnurlPayResponse = {
		callback: 'https://getalby.com/lnurlp/alice/callback',
		maxSendable: 100000000, // 100,000 sats in msats
		minSendable: 1000, // 1 sat in msats
		metadata: JSON.stringify([
			['text/plain', 'Donation for Alice'],
			['text/long-desc', "Support Alice's open source work"]
		]),
		tag: 'payRequest'
	};

	beforeEach(() => {
		vi.spyOn(globalThis, 'fetch').mockResolvedValue({
			ok: true,
			json: () => Promise.resolve(mockLnurlPayResponse)
		} as Response);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('fetches the .well-known/lnurlp/ endpoint for the given address', async () => {
		await resolveLightningAddress('alice@getalby.com');

		expect(fetch).toHaveBeenCalledWith('https://getalby.com/.well-known/lnurlp/alice');
	});

	it('returns parsed LNURL-pay details for a valid lightning address', async () => {
		const result: LNURLPayResponse = await resolveLightningAddress('alice@getalby.com');

		expect(result.callback).toBe('https://getalby.com/lnurlp/alice/callback');
		expect(result.maxSendable).toBe(100000000);
		expect(result.minSendable).toBe(1000);
		expect(result.tag).toBe('payRequest');
		expect(result.metadata).toContain('Donation for Alice');
	});

	it('constructs the correct well-known URL for different domains', async () => {
		await resolveLightningAddress('user@blink.sv');

		expect(fetch).toHaveBeenCalledWith('https://blink.sv/.well-known/lnurlp/user');
	});

	it('handles plus addressing in lightning addresses', async () => {
		await resolveLightningAddress('user+tip@stacker.news');

		expect(fetch).toHaveBeenCalledWith('https://stacker.news/.well-known/lnurlp/user%2Btip');
	});

	it('throws for invalid lightning address format', async () => {
		await expect(resolveLightningAddress('not-an-address')).rejects.toThrow(
			'Invalid lightning address format'
		);
	});

	it('throws for empty string', async () => {
		await expect(resolveLightningAddress('')).rejects.toThrow(
			'Invalid lightning address: must be a non-empty string'
		);
	});

	it('throws when the HTTP response is not OK', async () => {
		vi.mocked(fetch).mockResolvedValueOnce({
			ok: false,
			status: 404,
			statusText: 'Not Found'
		} as Response);

		await expect(resolveLightningAddress('unknown@getalby.com')).rejects.toThrow(
			'Lightning address resolution failed: 404 Not Found'
		);
	});

	it('throws when the response tag is not payRequest', async () => {
		vi.mocked(fetch).mockResolvedValueOnce({
			ok: true,
			json: () =>
				Promise.resolve({
					...mockLnurlPayResponse,
					tag: 'withdrawRequest'
				})
		} as Response);

		await expect(resolveLightningAddress('alice@getalby.com')).rejects.toThrow(
			"expected 'payRequest'"
		);
	});

	it('throws when callback is missing', async () => {
		vi.mocked(fetch).mockResolvedValueOnce({
			ok: true,
			json: () =>
				Promise.resolve({
					...mockLnurlPayResponse,
					callback: undefined
				})
		} as Response);

		await expect(resolveLightningAddress('alice@getalby.com')).rejects.toThrow(
			'missing callback URL'
		);
	});

	it('throws when min/max sendable amounts are missing', async () => {
		vi.mocked(fetch).mockResolvedValueOnce({
			ok: true,
			json: () =>
				Promise.resolve({
					...mockLnurlPayResponse,
					minSendable: undefined,
					maxSendable: undefined
				})
		} as Response);

		await expect(resolveLightningAddress('alice@getalby.com')).rejects.toThrow(
			'missing min/max sendable amounts'
		);
	});

	it('defaults metadata to empty array string when missing', async () => {
		vi.mocked(fetch).mockResolvedValueOnce({
			ok: true,
			json: () =>
				Promise.resolve({
					callback: 'https://getalby.com/lnurlp/alice/callback',
					maxSendable: 100000000,
					minSendable: 1000,
					tag: 'payRequest'
				})
		} as Response);

		const result = await resolveLightningAddress('alice@getalby.com');
		expect(result.metadata).toBe('[]');
	});
});
