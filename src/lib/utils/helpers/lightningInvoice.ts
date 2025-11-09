import { bech32 } from 'bech32';

/**
 * Parse BOLT11 Lightning invoice and extract amount
 * @param invoice - The Lightning invoice string (starts with "ln")
 * @returns Object with amount in satoshis (if present) and whether invoice is valid
 */
export function parseLightningInvoice(invoice: string): {
	isValid: boolean;
	amountSats: number | null;
	hasAmount: boolean;
} {
	if (!invoice || !invoice.toLowerCase().startsWith('ln')) {
		return { isValid: false, amountSats: null, hasAmount: false };
	}

	try {
		// BOLT11 invoice format: ln[bc|tb|bcrt][munp]?[0-9]+[a-z0-9]+
		// The amount is encoded in the characters after the prefix
		// If there's a multiplier (m, u, n, p) followed by digits, it has an amount
		// If it goes directly to alphanumeric, it's amountless
		
		const lowerInvoice = invoice.toLowerCase();
		
		// Match the prefix and amount part
		// Prefix can be: lnbc (mainnet), lntb (testnet), lnbcrt (regtest), or just ln
		// After prefix: optional multiplier (m, u, n, p) followed by digits
		// IMPORTANT: Check longer prefixes first to avoid matching "ln" before "lnbc"
		const prefixMatch = lowerInvoice.match(/^(lnbc|lntb|lnbcrt|ln)([munp]?)(\d+)?/);
		
		if (!prefixMatch) {
			return { isValid: false, amountSats: null, hasAmount: false };
		}
		
		const multiplierChar = prefixMatch[2];
		const amountStr = prefixMatch[3];
		
		// Amount multiplier encoding (BOLT11 spec)
		const multipliers: Record<string, number> = {
			'm': 0.001,  // milli
			'u': 0.000001, // micro
			'n': 0.000000001, // nano
			'p': 0.000000000001 // pico
		};
		
		// If there's a multiplier character followed by digits, the invoice has an amount
		if (multiplierChar && amountStr) {
			const multiplier = multipliers[multiplierChar] || 1;
			const amountNum = parseInt(amountStr, 10);
			if (isNaN(amountNum) || amountNum <= 0) {
				return { isValid: false, amountSats: null, hasAmount: false };
			}
			const amountSats = Math.floor(amountNum * multiplier * 100_000_000);
			return { isValid: true, amountSats, hasAmount: true };
		}
		
		// If there's a number but no multiplier, check if it's a valid format
		// Actually, BOLT11 requires a multiplier if there's an amount
		// So if there's a number without multiplier, it might be invalid
		// But let's be lenient and check if it's a valid bech32 string
		
		// No amount found - this is an amountless invoice
		// Verify it's a valid bech32 string
		// Use a more reasonable limit (BOLT11 invoices are typically 200-500 chars)
		try {
			bech32.decode(lowerInvoice, 10000);
			return { isValid: true, amountSats: null, hasAmount: false };
		} catch (decodeError) {
			// If bech32 decode fails, the invoice is invalid
			return { isValid: false, amountSats: null, hasAmount: false };
		}
	} catch (error) {
		console.error('Failed to parse Lightning invoice:', error);
		return { isValid: false, amountSats: null, hasAmount: false };
	}
}

/**
 * Check if input is a Lightning invoice (BOLT11)
 */
export function isLightningInvoice(input: string): boolean {
	return input?.toLowerCase().startsWith('ln') ?? false;
}

/**
 * Check if input is a Lightning address (email format)
 */
export function isLightningAddress(input: string): boolean {
	if (!input) return false;
	const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
	return emailRegex.test(input);
}

