/**
 * LNURL-pay (LUD-06) resolver service.
 *
 * Pure HTTP client — no wallet state.
 * Handles bech32 decoding of lnurl1... strings, fetching LNURL-pay
 * endpoints, and resolving BOLT11 invoices from LNURL callbacks.
 *
 * @see https://github.com/lnurl/luds/blob/luds/06.md
 */

// ── Types ────────────────────────────────────────────────────────────────────

export interface LNURLPayMetadata {
	description: string;
	longDescription?: string;
	image?: string; // base64 or URL
}

export interface LNURLPayResponse {
	callback: string; // URL to fetch invoice from
	maxSendable: number; // millisatoshis
	minSendable: number; // millisatoshis
	metadata: string; // JSON string of array
	tag: 'payRequest';
}

export interface LNURLPayInvoice {
	pr: string; // BOLT11 lightning invoice
	routes: string[]; // empty array
}

export interface LNURLWithdrawResponse {
	callback: string; // URL to submit invoice to
	k1: string; // secret key for verification
	maxWithdrawable: number; // millisatoshis
	minWithdrawable: number; // millisatoshis
	defaultDescription: string;
	tag: 'withdrawRequest';
}

// ── Constants ────────────────────────────────────────────────────────────────

/** Bech32 character set */
const BECH32_CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';

/** Build a reverse-lookup map from char -> value */
const CHAR_TO_VALUE: Record<string, number> = {};
for (let i = 0; i < BECH32_CHARSET.length; i++) {
	CHAR_TO_VALUE[BECH32_CHARSET[i]] = i;
}

// ── Decoding ─────────────────────────────────────────────────────────────────

/**
 * Convert a bech32 character to its 5-bit value.
 * @throws If the character is not in the bech32 charset
 */
function bech32CharToValue(char: string): number {
	const value = CHAR_TO_VALUE[char];
	if (value === undefined) {
		throw new Error(`Invalid bech32 character: '${char}'`);
	}
	return value;
}

/**
 * Decode a bech32-encoded LNURL string to a UTF-8 URL.
 *
 * Accepts:
 *   - `lnurl1...` (plain bech32)
 *   - `lightning:lnurl1...` (lightning URI with bech32)
 *
 * The algorithm:
 *   1. Separate HRP ('lnurl') and data from the bech32 string
 *   2. Convert each base32 character to a 5-bit value
 *   3. Convert 5-bit groups to 8-bit bytes
 *   4. Decode bytes as UTF-8 to produce the URL
 *
 * @param lnurl - The bech32-encoded LNURL string
 * @returns The decoded URL
 * @throws If the string is not valid bech32
 */
export function decodeLNURL(lnurl: string): string {
	if (!lnurl) {
		throw new Error('Empty LNURL string');
	}

	// Strip lightning: prefix if present
	let input = lnurl.trim();
	if (input.toLowerCase().startsWith('lightning:')) {
		input = input.slice('lightning:'.length);
	}

	// Normalize to lowercase (bech32 is case-insensitive)
	const lower = input.toLowerCase();

	// Find the separator '1' (last occurrence before checksum data)
	const sepIndex = lower.lastIndexOf('1');
	if (sepIndex < 1) {
		throw new Error('Invalid bech32 string: no separator found');
	}

	const hrp = lower.slice(0, sepIndex);
	const dataPart = lower.slice(sepIndex + 1);

	if (hrp !== 'lnurl') {
		throw new Error(`Invalid HRP: expected 'lnurl', got '${hrp}'`);
	}

	if (dataPart.length <= 6) {
		throw new Error('Invalid bech32 string: data part too short');
	}

	// Skip the last 6 characters (checksum)
	const data = dataPart.slice(0, -6);

	// Convert characters to 5-bit values
	const values: number[] = [];
	for (const char of data) {
		values.push(bech32CharToValue(char));
	}

	// Convert 5-bit groups to 8-bit bytes
	const bytes: number[] = [];
	let buffer = 0;
	let bitsLeft = 0;

	for (const val of values) {
		buffer = (buffer << 5) | val;
		bitsLeft += 5;
		if (bitsLeft >= 8) {
			bitsLeft -= 8;
			bytes.push((buffer >> bitsLeft) & 0xff);
		}
	}

	// Decode as UTF-8
	return new TextDecoder().decode(new Uint8Array(bytes));
}

// ── Detection ────────────────────────────────────────────────────────────────

/**
 * Check whether a string looks like an LNURL.
 *
 * Returns `true` for:
 *   - `lnurl1...` (bech32 encoded, used for both pay and withdraw)
 *   - `lnurlp://...` (protocol prefix for pay)
 *   - `lnurlw://...` (protocol prefix for withdraw)
 *   - `lightning:lnurl1...` (lightning URI with bech32)
 *   - `https://...?lightning=lnurl1...` (URL with LNURL query param, e.g. blink.sv)
 *   - `https://...&lightning=lnurl1...` (LNURL query param elsewhere in URL)
 *
 * @param value - The string to check
 * @returns `true` if the string appears to be an LNURL
 */
export function isLNURL(value: string): boolean {
	if (!value || typeof value !== 'string') return false;

	const trimmed = value.trim().toLowerCase();

	return (
		trimmed.startsWith('lnurl1') ||
		trimmed.startsWith('lnurlp://') ||
		trimmed.startsWith('lnurlw://') ||
		trimmed.startsWith('lightning:lnurl1') ||
		// URLs with lightning=LNURL1... query parameter (e.g. pay.blink.sv share links)
		(trimmed.startsWith('https://') && /(\?|&)lightning=lnurl1/i.test(trimmed))
	);
}

// ── URL extraction ───────────────────────────────────────────────────────────

/**
 * Extract the URL from various LNURL input formats.
 *
 * Handles:
 *   - Plain bech32 (`lnurl1...`) — decodes to URL
 *   - Lightning URI (`lightning:lnurl1...`) — strips prefix, decodes
 *   - Direct URL (`https://...`) — returned as-is
 *   - Protocol prefix (`lnurlp://...`, `lnurlw://...`) — returned as-is
 *
 * @param input - The LNURL input string
 * @returns The resolved URL
 * @throws If the format is not recognised
 */
export function extractLNURLUrl(input: string): string {
	const trimmed = input.trim();

	// Already a URL — check for embedded LNURL in ?lightning= param (BIP-21 style)
	if (/^https?:\/\//i.test(trimmed)) {
		// Extract LNURL bech32 from ?lightning= or &lightning= query parameter
		const lnurlParam = trimmed.match(/[?&]lightning=(lnurl1[02-9a-hj-np-z]*)/i);
		if (lnurlParam) {
			return decodeLNURL(lnurlParam[1]);
		}
		return trimmed;
	}

	// lnurlp:// or lnurlw:// prefix
	if (trimmed.startsWith('lnurlp://') || trimmed.startsWith('lnurlw://')) {
		return trimmed;
	}

	// lightning: prefix
	if (trimmed.toLowerCase().startsWith('lightning:')) {
		const afterPrefix = trimmed.slice('lightning:'.length);
		if (afterPrefix.startsWith('lnurl1')) {
			return decodeLNURL(afterPrefix);
		}
		return afterPrefix;
	}

	// Plain bech32
	if (trimmed.startsWith('lnurl1')) {
		return decodeLNURL(trimmed);
	}

	throw new Error('Invalid LNURL format: could not extract URL');
}

// ── HTTP helpers ─────────────────────────────────────────────────────────────

/**
 * Fetch LNURL-pay details from a pay request URL.
 *
 * Makes a GET request to the LNURL endpoint and returns the parsed
 * response, which includes the callback URL, min/max sendable amounts,
 * and metadata.
 *
 * @param url - The LNURL-pay endpoint URL
 * @returns The parsed LNURL pay response
 * @throws If the HTTP request fails or the response is invalid
 */
export async function fetchLNURLPayDetails(url: string): Promise<LNURLPayResponse> {
	const response = await fetch(url);

	if (!response.ok) {
		throw new Error(`LNURL fetch failed: ${response.status} ${response.statusText}`);
	}

	const data = await response.json();

	// Validate response structure per LUD-06
	if (data.tag !== 'payRequest') {
		throw new Error(`Invalid LNURL tag: expected 'payRequest', got '${data.tag}'`);
	}

	if (!data.callback || typeof data.callback !== 'string') {
		throw new Error('LNURL response missing callback URL');
	}

	if (typeof data.minSendable !== 'number' || typeof data.maxSendable !== 'number') {
		throw new Error('LNURL response missing min/max sendable amounts');
	}

	return {
		callback: data.callback,
		maxSendable: data.maxSendable,
		minSendable: data.minSendable,
		metadata: data.metadata || '[]',
		tag: 'payRequest'
	};
}

/**
 * Fetch a BOLT11 invoice from an LNURL callback URL.
 *
 * The amount is specified in **millisatoshis** as required by LUD-06.
 *
 * @param callback - The callback URL from the LNURL pay response
 * @param amountMsats - The amount to request in millisatoshis
 * @returns The BOLT11 payment request string (`pr`)
 * @throws If the HTTP request fails or the response is invalid
 */
export async function fetchLNURLPayInvoice(callback: string, amountMsats: number): Promise<string> {
	if (amountMsats <= 0) {
		throw new Error('Amount must be greater than 0');
	}

	const url = new URL(callback);
	url.searchParams.set('amount', amountMsats.toString());

	const response = await fetch(url.toString());

	if (!response.ok) {
		throw new Error(`LNURL invoice fetch failed: ${response.status} ${response.statusText}`);
	}

	const data: LNURLPayInvoice = await response.json();

	if (!data.pr || typeof data.pr !== 'string') {
		throw new Error('LNURL invoice response missing payment request');
	}

	return data.pr;
}

// ── Metadata parsing ─────────────────────────────────────────────────────────

// ── LNURL-withdraw (LUD-03) ──────────────────────────────────────────────────

/**
 * Check whether a string looks like an LNURL-withdraw link.
 *
 * Returns `true` for:
 *   - `lnurlw://...` (protocol prefix for withdraw)
 *   - `lightning:lnurlw://...` (lightning URI with withdraw prefix)
 *
 * Note: `lnurl1...` bech32 strings may also encode withdraw URLs, but the
 * tag cannot be determined without fetching the endpoint. Use
 * `fetchLNURLWithdraw` to determine if a decoded LNURL is a withdraw.
 *
 * @param value - The string to check
 * @returns `true` if the string appears to be an LNURL-withdraw link
 */
export function isLNURLWithdraw(value: string): boolean {
	if (!value || typeof value !== 'string') return false;

	const trimmed = value.trim().toLowerCase();

	return trimmed.startsWith('lnurlw://') || trimmed.startsWith('lightning:lnurlw://');
}

/**
 * Fetch LNURL-withdraw details from a withdraw request URL.
 *
 * Makes a GET request to the LNURL endpoint and returns the parsed
 * response, which includes the callback URL, k1 secret, min/max withdrawable
 * amounts, and default description.
 *
 * Per LUD-03, the response has `tag: 'withdrawRequest'`.
 *
 * @param url - The LNURL-withdraw endpoint URL
 * @returns The parsed LNURL withdraw response
 * @throws If the HTTP request fails or the response is invalid
 */
export async function fetchLNURLWithdraw(url: string): Promise<LNURLWithdrawResponse> {
	const response = await fetch(url);

	if (!response.ok) {
		throw new Error(`LNURL withdraw fetch failed: ${response.status} ${response.statusText}`);
	}

	const data = await response.json();

	// Validate response structure per LUD-03
	if (data.tag !== 'withdrawRequest') {
		throw new Error(`Invalid LNURL tag: expected 'withdrawRequest', got '${data.tag}'`);
	}

	if (!data.callback || typeof data.callback !== 'string') {
		throw new Error('LNURL withdraw response missing callback URL');
	}

	if (!data.k1 || typeof data.k1 !== 'string') {
		throw new Error('LNURL withdraw response missing k1');
	}

	if (typeof data.minWithdrawable !== 'number' || typeof data.maxWithdrawable !== 'number') {
		throw new Error('LNURL withdraw response missing min/max withdrawable amounts');
	}

	return {
		callback: data.callback,
		k1: data.k1,
		maxWithdrawable: data.maxWithdrawable,
		minWithdrawable: data.minWithdrawable,
		defaultDescription: data.defaultDescription || '',
		tag: 'withdrawRequest'
	};
}

/**
 * Submit a BOLT11 invoice to an LNURL-withdraw callback.
 *
 * Per LUD-03, the invoice is submitted as query parameters:
 *   GET {callback}?k1={k1}&pr={bolt11_invoice}
 *
 * The response is `{ status: "OK" }` on success, or `{ status: "ERROR", reason: "..." }`
 * on failure.
 *
 * @param callback - The callback URL from the LNURL withdraw response
 * @param k1 - The k1 secret from the LNURL withdraw response
 * @param invoice - The BOLT11 invoice string to submit
 * @returns The response with status and optional reason
 * @throws If the HTTP request fails
 */
export async function submitLNURLWithdrawInvoice(
	callback: string,
	k1: string,
	invoice: string
): Promise<{ status: string; reason?: string }> {
	if (!callback) {
		throw new Error('Callback URL is required');
	}

	if (!k1) {
		throw new Error('k1 parameter is required');
	}

	if (!invoice) {
		throw new Error('Invoice is required');
	}

	const url = new URL(callback);
	url.searchParams.set('k1', k1);
	url.searchParams.set('pr', invoice);

	const response = await fetch(url.toString());

	if (!response.ok) {
		throw new Error(
			`LNURL withdraw invoice submission failed: ${response.status} ${response.statusText}`
		);
	}

	const data = await response.json();

	if (data.status !== 'OK') {
		return {
			status: data.status || 'ERROR',
			reason: data.reason || 'Unknown error'
		};
	}

	return { status: 'OK' };
}

/**
 * Parse the LNURL metadata JSON string into a structured object.
 *
 * The metadata is a JSON array of `[key, value]` pairs as defined by LUD-06:
 *   - `text/plain` → short description
 *   - `text/long-desc` → long description
 *   - `image/png;base64` or `image/jpeg;base64` → image data
 *
 * @param metadataStr - The JSON metadata string from the LNURL response
 * @returns Parsed metadata object (empty strings for missing fields)
 */
export function parseLNURLMetadata(metadataStr: string): LNURLPayMetadata {
	const metadata: LNURLPayMetadata = {
		description: ''
	};

	try {
		const entries = JSON.parse(metadataStr);

		if (!Array.isArray(entries)) {
			return metadata;
		}

		for (const entry of entries) {
			if (!Array.isArray(entry) || entry.length < 2) continue;

			const [key, value] = entry;

			if (key === 'text/plain' && typeof value === 'string') {
				metadata.description = value;
			} else if (key === 'text/long-desc' && typeof value === 'string') {
				metadata.longDescription = value;
			} else if (
				(key === 'image/png;base64' || key === 'image/jpeg;base64') &&
				typeof value === 'string'
			) {
				metadata.image = value;
			}
		}
	} catch {
		// Invalid JSON — return empty metadata
	}

	return metadata;
}
