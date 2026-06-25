/**
 * Route Engine — Shared Amount Conversion Utilities
 *
 * Converts between BTC satoshis (the route engine's internal unit) and
 * token-specific smallest units (used by DEX/bridge providers).
 *
 * `amountSats` is always in BTC satoshis (8 decimal places).
 * Output depends on the target token's decimals.
 */

/**
 * Convert BTC satoshis to the from token's smallest unit.
 *
 * - 18 decimals (ETH/RSK wei): sats × 1e10
 * - 8 decimals (BTC-like): sats are already the smallest unit
 * - 6 decimals (USDC/USDT): sats / 100
 * - Generic: sats / 1e8 × 10^decimals
 */
export function satsToTokenAmount(amountSats: number, decimals: number): string {
	if (decimals === 18) {
		// sats → wei: multiply by 1e10
		return (BigInt(amountSats) * BigInt(10_000_000_000)).toString();
	}
	if (decimals === 8) {
		// sats = smallest unit for 8-decimal tokens
		return String(amountSats);
	}
	if (decimals === 6) {
		// sats → micro-units: sats / 1e8 * 1e6 = sats / 100
		return String(Math.round(amountSats / 100));
	}
	// Generic: sats / 1e8 * 10^decimals
	return String(Math.round((amountSats / 1e8) * 10 ** decimals));
}

/**
 * Convert a token amount (smallest unit) back to BTC satoshis.
 *
 * Inverse of `satsToTokenAmount`.
 */
export function tokenAmountToSats(amount: string, decimals: number): number {
	const value = Number(amount);
	if (Number.isNaN(value)) return 0;

	if (decimals === 18) {
		// wei → sats: divide by 1e10
		return Math.round(value / 1e10);
	}
	if (decimals === 8) {
		return Math.round(value);
	}
	if (decimals === 6) {
		// micro → sats: value / 1e6 * 1e8 = value * 100
		return Math.round(value * 100);
	}
	// Generic
	return Math.round((value / 10 ** decimals) * 1e8);
}
