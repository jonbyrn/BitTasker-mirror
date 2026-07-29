import { decode as decodeBolt11 } from 'bolt11';

/**
 * Detect Lightning invoice type (BOLT11 or BOLT12)
 * @param input - The input string to check
 * @returns 'bolt11' | 'bolt12' | 'lightning-address' | 'unknown'
 */
export function detectLightningType(
	input: string
): 'bolt11' | 'bolt12' | 'lightning-address' | 'unknown' {
	if (!input || typeof input !== 'string') {
		return 'unknown';
	}

	const lowerInput = input.toLowerCase().trim();

	// Check for Lightning address (email format) first
	if (isLightningAddress(lowerInput)) {
		return 'lightning-address';
	}

	// Check for BOLT12 prefixes (must come before BOLT11 check)
	// BOLT12 uses: lno (offer), lnr (invoice request), lni (invoice)
	if (
		lowerInput.startsWith('lno') ||
		lowerInput.startsWith('lnr') ||
		lowerInput.startsWith('lni')
	) {
		return 'bolt12';
	}

	// Check for BOLT11 prefixes
	// BOLT11 uses: lnbc (mainnet), lntb (testnet), lnbcrt (regtest), or just ln
	if (
		lowerInput.startsWith('lnbc') ||
		lowerInput.startsWith('lntb') ||
		lowerInput.startsWith('lnbcrt') ||
		lowerInput.startsWith('ln')
	) {
		return 'bolt11';
	}

	return 'unknown';
}

/**
 * Parse BOLT11 Lightning invoice and extract amount and description using bolt11 library
 * @param invoice - The BOLT11 Lightning invoice string
 * @returns Object with amount in satoshis (if present), description/memo, and whether invoice is valid
 */
export function parseLightningInvoice(invoice: string): {
	isValid: boolean;
	amountSats: number | null;
	hasAmount: boolean;
	description: string | null;
} {
	if (!invoice || typeof invoice !== 'string') {
		return { isValid: false, amountSats: null, hasAmount: false, description: null };
	}

	// First check if it's actually BOLT11 (not BOLT12)
	const type = detectLightningType(invoice);
	if (type !== 'bolt11') {
		return { isValid: false, amountSats: null, hasAmount: false, description: null };
	}

	try {
		// Use bolt11 library to decode the invoice
		const decoded = decodeBolt11(invoice);

		// Extract amount from decoded invoice
		// bolt11 returns amount in satoshis (decoded.satoshis) or millisatoshis (decoded.millisatoshis)
		let amountSats: number | null = null;
		let hasAmount = false;

		if (decoded.satoshis !== null && decoded.satoshis !== undefined) {
			// Amount is in satoshis
			amountSats = decoded.satoshis;
			hasAmount = true;
		} else if (
			(decoded as unknown as Record<string, unknown>).millisatoshis !== null &&
			(decoded as unknown as Record<string, unknown>).millisatoshis !== undefined
		) {
			// Amount is in millisatoshis, convert to satoshis
			amountSats = Math.floor(
				Number((decoded as unknown as Record<string, unknown>).millisatoshis) / 1000
			);
			hasAmount = true;
		}

		// Extract description/memo from tags (tag with tagName 'description' contains description)
		let description: string | null = null;
		if (decoded.tags && Array.isArray(decoded.tags)) {
			const descriptionTag = decoded.tags.find(
				(tag: { tagName?: string; data?: unknown }) => tag.tagName === 'description'
			);
			if (descriptionTag && descriptionTag.data) {
				description =
					typeof descriptionTag.data === 'string'
						? descriptionTag.data
						: String(descriptionTag.data);
			}
		}

		// Invoice is valid if decode succeeded
		return { isValid: true, amountSats, hasAmount, description };
	} catch (error) {
		// bolt11.decode() throws on invalid invoices
		console.error('Failed to decode BOLT11 invoice:', error);
		return { isValid: false, amountSats: null, hasAmount: false, description: null };
	}
}

/**
 * Check if input is a Lightning invoice (BOLT11 or BOLT12)
 * @param input - The input string to check
 * @returns true if input is a Lightning invoice (BOLT11 or BOLT12)
 */
export function isLightningInvoice(input: string): boolean {
	if (!input || typeof input !== 'string') {
		return false;
	}

	const type = detectLightningType(input);
	return type === 'bolt11' || type === 'bolt12';
}

/**
 * Check if input is a BOLT11 invoice specifically
 * @param input - The input string to check
 * @returns true if input is a BOLT11 invoice
 */
export function isBolt11Invoice(input: string): boolean {
	return detectLightningType(input) === 'bolt11';
}

/**
 * Check if input is a BOLT12 offer/invoice
 * @param input - The input string to check
 * @returns true if input is a BOLT12 offer/invoice
 */
export function isBolt12Invoice(input: string): boolean {
	return detectLightningType(input) === 'bolt12';
}

/**
 * Check if input is a Lightning address (email format)
 */
export function isLightningAddress(input: string): boolean {
	if (!input) return false;
	const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
	return emailRegex.test(input);
}
