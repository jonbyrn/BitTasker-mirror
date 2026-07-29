import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Import the module under test
import {
	decodeLNURL,
	isLNURL,
	isLNURLWithdraw,
	extractLNURLUrl,
	fetchLNURLPayDetails,
	fetchLNURLPayInvoice,
	fetchLNURLWithdraw,
	submitLNURLWithdrawInvoice,
	parseLNURLMetadata
} from '$lib/services/lnurl-pay.service';

// ── Test vectors ─────────────────────────────────────────────────────────────

/** A known LNURL bech32 string that decodes to a test URL */
const TEST_LNURL =
	'lnurl1dp68gurn8ghj7um9wfmxjcm99ejhsctdwpkx2tnrdakj7tnhv4kxctttdehhwm30d3h82unvwqhh2um9wgqqqqqq';
const TEST_DECODED_URL = 'https://service.example.com/.well-known/lnurlp/user';

const TEST_LNURL_LIGHTNING = 'lightning:' + TEST_LNURL;

// ── decodeLNURL ──────────────────────────────────────────────────────────────

describe('decodeLNURL', () => {
	it('decodes a valid lnurl1 bech32 string to a URL', () => {
		const result = decodeLNURL(TEST_LNURL);
		expect(result).toBe(TEST_DECODED_URL);
	});

	it('decodes a lightning:lnurl1 string by stripping the prefix', () => {
		const result = decodeLNURL(TEST_LNURL_LIGHTNING);
		expect(result).toBe(TEST_DECODED_URL);
	});

	it('is case-insensitive for the lnurl string', () => {
		const upper = TEST_LNURL.toUpperCase();
		const result = decodeLNURL(upper);
		expect(result).toBe(TEST_DECODED_URL);
	});

	it('throws for an empty string', () => {
		expect(() => decodeLNURL('')).toThrow('Empty LNURL string');
	});

	it('throws for a string without a separator', () => {
		expect(() => decodeLNURL('lnurlnodata')).toThrow('no separator found');
	});

	it('throws for a non-lnurl HRP', () => {
		expect(() => decodeLNURL('lnbc1qp5m3...')).toThrow('expected');
	});

	it('throws for data part that is too short', () => {
		expect(() => decodeLNURL('lnurl1abc')).toThrow('too short');
	});

	it('throws for invalid bech32 characters', () => {
		// 'i' and 'o' are not in the bech32 charset
		// The invalid char must be in the data portion (before last 6 chars = checksum)
		expect(() => decodeLNURL('lnurl1qpzry9x8gf2tvdwis3jn54khce6muail')).toThrow(
			'Invalid bech32 character'
		);
	});
});

// ── isLNURL ──────────────────────────────────────────────────────────────────

describe('isLNURL', () => {
	it('returns true for lnurl1... bech32 strings', () => {
		expect(isLNURL(TEST_LNURL)).toBe(true);
	});

	it('returns true for lightning:lnurl1... strings', () => {
		expect(isLNURL(TEST_LNURL_LIGHTNING)).toBe(true);
	});

	it('returns true for lnurlw://... protocol strings (withdraw)', () => {
		expect(isLNURL('lnurlw://example.com/withdraw/user')).toBe(true);
	});

	it('returns true for lnurlp://... protocol strings', () => {
		expect(isLNURL('lnurlp://example.com/lnurlp/user')).toBe(true);
	});

	it('returns false for regular BOLT11 invoices', () => {
		expect(isLNURL('lnbc1p5m3...')).toBe(false);
	});

	it('returns false for Bitcoin addresses', () => {
		expect(isLNURL('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa')).toBe(false);
	});

	it('returns false for Ethereum addresses', () => {
		expect(isLNURL('0x1234567890123456789012345678901234567890')).toBe(false);
	});

	it('returns false for Lightning addresses (email format)', () => {
		expect(isLNURL('user@example.com')).toBe(false);
	});

	it('returns false for empty strings', () => {
		expect(isLNURL('')).toBe(false);
	});

	it('returns false for null', () => {
		expect(isLNURL(null as unknown as string)).toBe(false);
	});

	it('returns false for undefined', () => {
		expect(isLNURL(undefined as unknown as string)).toBe(false);
	});
});

// ── extractLNURLUrl ──────────────────────────────────────────────────────────

describe('extractLNURLUrl', () => {
	it('returns https URLs as-is', () => {
		const url = 'https://example.com/lnurlp/user';
		expect(extractLNURLUrl(url)).toBe(url);
	});

	it('returns http URLs as-is', () => {
		const url = 'http://example.com/lnurlp/user';
		expect(extractLNURLUrl(url)).toBe(url);
	});

	it('returns lnurlp:// strings as-is', () => {
		const url = 'lnurlp://example.com/lnurlp/user';
		expect(extractLNURLUrl(url)).toBe(url);
	});

	it('returns lnurlw:// strings as-is (withdraw)', () => {
		const url = 'lnurlw://example.com/withdraw/user';
		expect(extractLNURLUrl(url)).toBe(url);
	});

	it('decodes lnurl1 bech32 strings to URLs', () => {
		const result = extractLNURLUrl(TEST_LNURL);
		expect(result).toBe(TEST_DECODED_URL);
	});

	it('decodes lightning:lnurl1 strings to URLs', () => {
		const result = extractLNURLUrl(TEST_LNURL_LIGHTNING);
		expect(result).toBe(TEST_DECODED_URL);
	});

	it('throws for unrecognized formats', () => {
		expect(() => extractLNURLUrl('not-an-lnurl')).toThrow('Invalid LNURL format');
	});
});

// ── fetchLNURLPayDetails (mocked fetch) ──────────────────────────────────────

describe('fetchLNURLPayDetails', () => {
	const mockValidResponse = {
		callback: 'https://service.example.com/lnurlp/callback',
		maxSendable: 100000000, // 100,000 sats in msats
		minSendable: 1000, // 1 sat in msats
		metadata: JSON.stringify([
			['text/plain', 'Test donation'],
			['text/long-desc', 'A longer description for testing']
		]),
		tag: 'payRequest'
	};

	beforeEach(() => {
		vi.spyOn(globalThis, 'fetch').mockResolvedValue({
			ok: true,
			json: () => Promise.resolve(mockValidResponse)
		} as Response);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('returns parsed LNURL pay details for a valid response', async () => {
		const result = await fetchLNURLPayDetails('https://service.example.com/lnurlp/user');

		expect(result.callback).toBe('https://service.example.com/lnurlp/callback');
		expect(result.maxSendable).toBe(100000000);
		expect(result.minSendable).toBe(1000);
		expect(result.tag).toBe('payRequest');
		expect(result.metadata).toContain('Test donation');
	});

	it('throws when the HTTP response is not OK', async () => {
		vi.mocked(fetch).mockResolvedValueOnce({
			ok: false,
			status: 404,
			statusText: 'Not Found'
		} as Response);

		await expect(
			fetchLNURLPayDetails('https://service.example.com/lnurlp/unknown')
		).rejects.toThrow('LNURL fetch failed: 404 Not Found');
	});

	it('throws when the response tag is not payRequest', async () => {
		vi.mocked(fetch).mockResolvedValueOnce({
			ok: true,
			json: () =>
				Promise.resolve({
					...mockValidResponse,
					tag: 'withdrawRequest'
				})
		} as Response);

		await expect(fetchLNURLPayDetails('https://service.example.com/lnurlp/user')).rejects.toThrow(
			"expected 'payRequest'"
		);
	});

	it('throws when callback is missing', async () => {
		vi.mocked(fetch).mockResolvedValueOnce({
			ok: true,
			json: () =>
				Promise.resolve({
					...mockValidResponse,
					callback: undefined
				})
		} as Response);

		await expect(fetchLNURLPayDetails('https://service.example.com/lnurlp/user')).rejects.toThrow(
			'missing callback URL'
		);
	});

	it('throws when min/max sendable amounts are missing', async () => {
		vi.mocked(fetch).mockResolvedValueOnce({
			ok: true,
			json: () =>
				Promise.resolve({
					...mockValidResponse,
					minSendable: undefined,
					maxSendable: undefined
				})
		} as Response);

		await expect(fetchLNURLPayDetails('https://service.example.com/lnurlp/user')).rejects.toThrow(
			'missing min/max sendable amounts'
		);
	});

	it('defaults metadata to empty array string when missing', async () => {
		vi.mocked(fetch).mockResolvedValueOnce({
			ok: true,
			json: () =>
				Promise.resolve({
					callback: 'https://service.example.com/lnurlp/callback',
					maxSendable: 100000000,
					minSendable: 1000,
					tag: 'payRequest'
				})
		} as Response);

		const result = await fetchLNURLPayDetails('https://service.example.com/lnurlp/user');
		expect(result.metadata).toBe('[]');
	});

	it('makes a GET request to the provided URL', async () => {
		const testUrl = 'https://service.example.com/lnurlp/user';
		await fetchLNURLPayDetails(testUrl);

		expect(fetch).toHaveBeenCalledWith(testUrl);
	});
});

// ── fetchLNURLPayInvoice (mocked fetch) ──────────────────────────────────────

describe('fetchLNURLPayInvoice', () => {
	const mockInvoiceResponse = {
		pr: 'lnbc100n1pj...',
		routes: []
	};

	beforeEach(() => {
		vi.spyOn(globalThis, 'fetch').mockResolvedValue({
			ok: true,
			json: () => Promise.resolve(mockInvoiceResponse)
		} as Response);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('fetches a BOLT11 invoice from the callback URL with amount in msats', async () => {
		const invoice = await fetchLNURLPayInvoice(
			'https://service.example.com/lnurlp/callback',
			50000
		);

		expect(invoice).toBe('lnbc100n1pj...');
	});

	it('appends the amount as a query parameter', async () => {
		await fetchLNURLPayInvoice('https://service.example.com/lnurlp/callback', 50000);

		const calledUrl = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][0];
		expect(calledUrl).toContain('amount=50000');
	});

	it('preserves existing query parameters on the callback URL', async () => {
		await fetchLNURLPayInvoice('https://service.example.com/lnurlp/callback?existing=param', 50000);

		const calledUrl = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][0];
		expect(calledUrl).toContain('existing=param');
		expect(calledUrl).toContain('amount=50000');
	});

	it('throws when amount is zero or negative', async () => {
		await expect(
			fetchLNURLPayInvoice('https://service.example.com/lnurlp/callback', 0)
		).rejects.toThrow('Amount must be greater than 0');

		await expect(
			fetchLNURLPayInvoice('https://service.example.com/lnurlp/callback', -100)
		).rejects.toThrow('Amount must be greater than 0');
	});

	it('throws when the HTTP response is not OK', async () => {
		vi.mocked(fetch).mockResolvedValueOnce({
			ok: false,
			status: 400,
			statusText: 'Bad Request'
		} as Response);

		await expect(
			fetchLNURLPayInvoice('https://service.example.com/lnurlp/callback', 50000)
		).rejects.toThrow('LNURL invoice fetch failed: 400 Bad Request');
	});

	it('throws when the response is missing the payment request (pr)', async () => {
		vi.mocked(fetch).mockResolvedValueOnce({
			ok: true,
			json: () => Promise.resolve({ routes: [] })
		} as Response);

		await expect(
			fetchLNURLPayInvoice('https://service.example.com/lnurlp/callback', 50000)
		).rejects.toThrow('missing payment request');
	});
});

// ── parseLNURLMetadata ───────────────────────────────────────────────────────

describe('parseLNURLMetadata', () => {
	it('extracts description from text/plain entry', () => {
		const metadata = JSON.stringify([['text/plain', 'Donation for John']]);
		const result = parseLNURLMetadata(metadata);
		expect(result.description).toBe('Donation for John');
	});

	it('extracts long description from text/long-desc entry', () => {
		const metadata = JSON.stringify([
			['text/plain', 'Donation'],
			['text/long-desc', 'Support my open source work']
		]);
		const result = parseLNURLMetadata(metadata);
		expect(result.description).toBe('Donation');
		expect(result.longDescription).toBe('Support my open source work');
	});

	it('extracts image from image/png;base64 entry', () => {
		const metadata = JSON.stringify([
			['text/plain', 'Donation'],
			['image/png;base64', 'iVBORw0KGgoAAAANSUhEUg...']
		]);
		const result = parseLNURLMetadata(metadata);
		expect(result.image).toBe('iVBORw0KGgoAAAANSUhEUg...');
	});

	it('extracts image from image/jpeg;base64 entry', () => {
		const metadata = JSON.stringify([
			['text/plain', 'Donation'],
			['image/jpeg;base64', '/9j/4AAQSkZJRg...']
		]);
		const result = parseLNURLMetadata(metadata);
		expect(result.image).toBe('/9j/4AAQSkZJRg...');
	});

	it('handles empty metadata array', () => {
		const result = parseLNURLMetadata('[]');
		expect(result.description).toBe('');
		expect(result.longDescription).toBeUndefined();
		expect(result.image).toBeUndefined();
	});

	it('handles invalid JSON gracefully', () => {
		const result = parseLNURLMetadata('not-json');
		expect(result.description).toBe('');
	});

	it('handles empty string metadata gracefully', () => {
		const result = parseLNURLMetadata('');
		expect(result.description).toBe('');
	});

	it('skips entries that are not arrays', () => {
		const metadata = JSON.stringify(['not-an-array', ['text/plain', 'valid']]);
		const result = parseLNURLMetadata(metadata);
		expect(result.description).toBe('valid');
	});

	it('skips entries with fewer than 2 elements', () => {
		const metadata = JSON.stringify([['text/plain']]);
		const result = parseLNURLMetadata(metadata);
		expect(result.description).toBe('');
	});

	it('ignores unknown metadata keys', () => {
		const metadata = JSON.stringify([
			['text/plain', 'Known'],
			['unknown/key', 'Unknown']
		]);
		const result = parseLNURLMetadata(metadata);
		expect(result.description).toBe('Known');
	});
});

// ── Integration-style: decodeLNURL + isLNURL ─────────────────────────────────

describe('LNURL integration: decode + detection', () => {
	it('a valid lnurl1 is both detected and decodable to a URL', () => {
		expect(isLNURL(TEST_LNURL)).toBe(true);
		const url = decodeLNURL(TEST_LNURL);
		expect(url).toContain('https://');
		expect(url).toContain('.example.com');
	});

	it('a lightning:lnurl1 is detected as LNURL', () => {
		expect(isLNURL(TEST_LNURL_LIGHTNING)).toBe(true);
		const url = decodeLNURL(TEST_LNURL_LIGHTNING);
		expect(url).toBe(TEST_DECODED_URL);
	});

	it('a BOLT11 invoice is NOT detected as LNURL', () => {
		expect(isLNURL('lnbc1p5m3...')).toBe(false);
	});

	it('decode + extractLNURLUrl produce the same result for bech32', () => {
		const byDecode = decodeLNURL(TEST_LNURL);
		const byExtract = extractLNURLUrl(TEST_LNURL);
		expect(byExtract).toBe(byDecode);
	});
});

// ── isLNURLWithdraw ──────────────────────────────────────────────────────────

describe('isLNURLWithdraw', () => {
	it('returns true for lnurlw://... protocol strings', () => {
		expect(isLNURLWithdraw('lnurlw://example.com/withdraw/user')).toBe(true);
	});

	it('returns true for lightning:lnurlw://... strings', () => {
		expect(isLNURLWithdraw('lightning:lnurlw://example.com/withdraw/user')).toBe(true);
	});

	it('returns false for lnurlp://... protocol strings', () => {
		expect(isLNURLWithdraw('lnurlp://example.com/lnurlp/user')).toBe(false);
	});

	it('returns false for lnurl1 bech32 strings', () => {
		expect(isLNURLWithdraw(TEST_LNURL)).toBe(false);
	});

	it('returns false for regular BOLT11 invoices', () => {
		expect(isLNURLWithdraw('lnbc1p5m3...')).toBe(false);
	});

	it('returns false for Lightning addresses (email format)', () => {
		expect(isLNURLWithdraw('user@example.com')).toBe(false);
	});

	it('returns false for empty strings', () => {
		expect(isLNURLWithdraw('')).toBe(false);
	});

	it('returns false for null', () => {
		expect(isLNURLWithdraw(null as unknown as string)).toBe(false);
	});

	it('returns false for undefined', () => {
		expect(isLNURLWithdraw(undefined as unknown as string)).toBe(false);
	});
});

// ── fetchLNURLWithdraw (mocked fetch) ────────────────────────────────────────

describe('fetchLNURLWithdraw', () => {
	const mockWithdrawResponse = {
		callback: 'https://service.example.com/withdraw/callback',
		k1: 'secret-key-123',
		maxWithdrawable: 200000, // 200 sats in msats
		minWithdrawable: 1000, // 1 sat in msats
		defaultDescription: 'Test withdraw',
		tag: 'withdrawRequest'
	};

	beforeEach(() => {
		vi.spyOn(globalThis, 'fetch').mockResolvedValue({
			ok: true,
			json: () => Promise.resolve(mockWithdrawResponse)
		} as Response);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('returns parsed LNURL withdraw details for a valid response', async () => {
		const result = await fetchLNURLWithdraw('https://service.example.com/withdraw/user');

		expect(result.callback).toBe('https://service.example.com/withdraw/callback');
		expect(result.k1).toBe('secret-key-123');
		expect(result.maxWithdrawable).toBe(200000);
		expect(result.minWithdrawable).toBe(1000);
		expect(result.defaultDescription).toBe('Test withdraw');
		expect(result.tag).toBe('withdrawRequest');
	});

	it('throws when the HTTP response is not OK', async () => {
		vi.mocked(fetch).mockResolvedValueOnce({
			ok: false,
			status: 404,
			statusText: 'Not Found'
		} as Response);

		await expect(
			fetchLNURLWithdraw('https://service.example.com/withdraw/unknown')
		).rejects.toThrow('LNURL withdraw fetch failed: 404 Not Found');
	});

	it('throws when the response tag is not withdrawRequest', async () => {
		vi.mocked(fetch).mockResolvedValueOnce({
			ok: true,
			json: () =>
				Promise.resolve({
					...mockWithdrawResponse,
					tag: 'payRequest'
				})
		} as Response);

		await expect(fetchLNURLWithdraw('https://service.example.com/withdraw/user')).rejects.toThrow(
			"expected 'withdrawRequest'"
		);
	});

	it('throws when callback is missing', async () => {
		vi.mocked(fetch).mockResolvedValueOnce({
			ok: true,
			json: () =>
				Promise.resolve({
					...mockWithdrawResponse,
					callback: undefined
				})
		} as Response);

		await expect(fetchLNURLWithdraw('https://service.example.com/withdraw/user')).rejects.toThrow(
			'missing callback URL'
		);
	});

	it('throws when k1 is missing', async () => {
		vi.mocked(fetch).mockResolvedValueOnce({
			ok: true,
			json: () =>
				Promise.resolve({
					...mockWithdrawResponse,
					k1: undefined
				})
		} as Response);

		await expect(fetchLNURLWithdraw('https://service.example.com/withdraw/user')).rejects.toThrow(
			'missing k1'
		);
	});

	it('throws when min/max withdrawable amounts are missing', async () => {
		vi.mocked(fetch).mockResolvedValueOnce({
			ok: true,
			json: () =>
				Promise.resolve({
					...mockWithdrawResponse,
					minWithdrawable: undefined,
					maxWithdrawable: undefined
				})
		} as Response);

		await expect(fetchLNURLWithdraw('https://service.example.com/withdraw/user')).rejects.toThrow(
			'missing min/max withdrawable amounts'
		);
	});

	it('defaults description to empty string when missing', async () => {
		vi.mocked(fetch).mockResolvedValueOnce({
			ok: true,
			json: () =>
				Promise.resolve({
					callback: 'https://service.example.com/withdraw/callback',
					k1: 'secret-key-123',
					maxWithdrawable: 200000,
					minWithdrawable: 1000,
					tag: 'withdrawRequest'
				})
		} as Response);

		const result = await fetchLNURLWithdraw('https://service.example.com/withdraw/user');
		expect(result.defaultDescription).toBe('');
	});

	it('makes a GET request to the provided URL', async () => {
		const testUrl = 'https://service.example.com/withdraw/user';
		await fetchLNURLWithdraw(testUrl);

		expect(fetch).toHaveBeenCalledWith(testUrl);
	});
});

// ── submitLNURLWithdrawInvoice (mocked fetch) ────────────────────────────────

describe('submitLNURLWithdrawInvoice', () => {
	const callback = 'https://service.example.com/withdraw/callback';
	const k1 = 'secret-key-123';
	const invoice = 'lnbc100n1pj...';

	beforeEach(() => {
		vi.spyOn(globalThis, 'fetch').mockResolvedValue({
			ok: true,
			json: () => Promise.resolve({ status: 'OK' })
		} as Response);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('submits the invoice to the callback URL with k1 and pr params', async () => {
		await submitLNURLWithdrawInvoice(callback, k1, invoice);

		const calledUrl = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][0];
		expect(calledUrl).toContain('k1=secret-key-123');
		expect(calledUrl).toContain('pr=lnbc100n1pj...');
	});

	it('returns OK status on success', async () => {
		const result = await submitLNURLWithdrawInvoice(callback, k1, invoice);

		expect(result.status).toBe('OK');
	});

	it('returns ERROR status with reason when the service rejects', async () => {
		vi.mocked(fetch).mockResolvedValueOnce({
			ok: true,
			json: () =>
				Promise.resolve({
					status: 'ERROR',
					reason: 'Invoice already used'
				})
		} as Response);

		const result = await submitLNURLWithdrawInvoice(callback, k1, invoice);

		expect(result.status).toBe('ERROR');
		expect(result.reason).toBe('Invoice already used');
	});

	it('returns ERROR status with default reason when only status is provided', async () => {
		vi.mocked(fetch).mockResolvedValueOnce({
			ok: true,
			json: () =>
				Promise.resolve({
					status: 'ERROR'
				})
		} as Response);

		const result = await submitLNURLWithdrawInvoice(callback, k1, invoice);

		expect(result.status).toBe('ERROR');
		expect(result.reason).toBe('Unknown error');
	});

	it('throws when the HTTP response is not OK', async () => {
		vi.mocked(fetch).mockResolvedValueOnce({
			ok: false,
			status: 400,
			statusText: 'Bad Request'
		} as Response);

		await expect(submitLNURLWithdrawInvoice(callback, k1, invoice)).rejects.toThrow(
			'LNURL withdraw invoice submission failed: 400 Bad Request'
		);
	});

	it('throws when callback is empty', async () => {
		await expect(submitLNURLWithdrawInvoice('', k1, invoice)).rejects.toThrow(
			'Callback URL is required'
		);
	});

	it('throws when k1 is empty', async () => {
		await expect(submitLNURLWithdrawInvoice(callback, '', invoice)).rejects.toThrow(
			'k1 parameter is required'
		);
	});

	it('throws when invoice is empty', async () => {
		await expect(submitLNURLWithdrawInvoice(callback, k1, '')).rejects.toThrow(
			'Invoice is required'
		);
	});

	it('preserves existing query parameters on the callback URL', async () => {
		const callbackWithParams = 'https://service.example.com/withdraw/callback?existing=param';

		await submitLNURLWithdrawInvoice(callbackWithParams, k1, invoice);

		const calledUrl = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][0];
		expect(calledUrl).toContain('existing=param');
		expect(calledUrl).toContain('k1=secret-key-123');
		expect(calledUrl).toContain('pr=lnbc100n1pj...');
	});
});

// ── Integration: isLNURL includes withdraw ──────────────────────────────────

describe('LNURL integration: isLNURL includes withdraw', () => {
	it('isLNURL returns true for lnurlw:// protocol strings', () => {
		expect(isLNURL('lnurlw://example.com/withdraw/user')).toBe(true);
	});

	it('isLNURL returns true for lnurlp:// protocol strings', () => {
		expect(isLNURL('lnurlp://example.com/lnurlp/user')).toBe(true);
	});

	it('isLNURL returns true for bech32 lnurl1 strings', () => {
		expect(isLNURL(TEST_LNURL)).toBe(true);
	});

	it('a withdraw lnurlw:// is detected by isLNURL but not by isLNURLWithdraw for pay', () => {
		expect(isLNURL('lnurlw://example.com/withdraw/user')).toBe(true);
		expect(isLNURLWithdraw('lnurlw://example.com/withdraw/user')).toBe(true);
	});
});
