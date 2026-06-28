/**
 * Precision-safe amount conversion utilities.
 *
 * The old pattern `BigInt(Math.round(parseFloat(amount) * 1e18))` silently
 * loses precision for amounts above ~0.009 ETH because `Number.MAX_SAFE_INTEGER`
 * is ~9e15 (≈ 0.009 ETH in wei). These utilities use string-based BigInt
 * arithmetic to avoid floating-point drift entirely.
 */

/**
 * Convert a decimal string amount to the smallest unit using BigInt arithmetic.
 * Avoids floating-point precision loss that occurs with parseFloat → BigInt conversion.
 *
 * @param amount - Decimal string like "0.001" or "100000"
 * @param decimals - Number of decimal places (e.g., 18 for ETH, 8 for BTC)
 * @returns Amount in smallest unit as bigint
 * @throws if amount is not a valid decimal string
 */
export function parseDecimalToSmallestUnit(amount: string, decimals: number): bigint {
	const trimmed = amount.trim();
	if (!trimmed || !/^-?\d+(\.\d+)?$/.test(trimmed)) {
		throw new Error(`Invalid decimal amount: "${amount}"`);
	}
	const negative = trimmed.startsWith('-');
	const abs = negative ? trimmed.slice(1) : trimmed;
	const [whole = '0', frac = ''] = abs.split('.');
	const paddedFrac = frac.padEnd(decimals, '0').slice(0, decimals);
	const result = BigInt(whole) * BigInt(10 ** decimals) + BigInt(paddedFrac);
	return negative ? -result : result;
}

/**
 * Convert sats (integer) to wei (18 decimals). Equivalent to sats × 10^10.
 *
 * @param sats - Amount in satoshis
 * @returns Amount in wei as bigint
 */
export function satsToWei(sats: number | string): bigint {
	return BigInt(sats) * 10_000_000_000n;
}
