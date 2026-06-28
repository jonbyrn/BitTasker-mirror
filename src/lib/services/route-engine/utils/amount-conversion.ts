/**
 * Route Engine — Shared Amount Conversion Utilities
 *
 * Converts between BTC satoshis (the route engine's internal unit) and
 * token-specific smallest units (used by DEX/bridge providers).
 *
 * `amountSats` is always in BTC satoshis (8 decimal places).
 * Output depends on the target token's decimals.
 *
 * Uses BigInt arithmetic to avoid floating-point precision loss for
 * tokens with ≥ 15 decimals (Number.MAX_SAFE_INTEGER ≈ 9e15).
 */

/**
 * Convert BTC satoshis to the from token's smallest unit.
 *
 * - 18 decimals (ETH/RSK wei): sats × 1e10
 * - 8 decimals (BTC-like): sats are already the smallest unit
 * - 6 decimals (USDC/USDT): sats / 100
 * - Generic: sats × 10^(decimals - 8)
 */
export function satsToTokenAmount(amountSats: number, decimals: number): string {
	if (decimals === 18) {
		// sats → wei: multiply by 1e10
		return (BigInt(amountSats) * 10_000_000_000n).toString();
	}
	if (decimals === 8) {
		// sats = smallest unit for 8-decimal tokens
		return String(amountSats);
	}
	if (decimals === 6) {
		// sats → micro-units: sats / 1e8 * 1e6 = sats / 100
		return String(Math.round(amountSats / 100));
	}
	// Generic: use BigInt to avoid precision loss for large decimal counts
	return (BigInt(amountSats) * 10n ** BigInt(decimals - 8)).toString();
}

/**
 * Convert a token amount (smallest unit) back to BTC satoshis.
 *
 * Inverse of `satsToTokenAmount`.
 * Uses BigInt for 18-decimal tokens to avoid precision loss on large wei values.
 */
export function tokenAmountToSats(amount: string, decimals: number): number {
	if (decimals === 18) {
		// wei → sats: divide by 1e10 — use BigInt to preserve precision
		try {
			return Number(BigInt(amount) / 10_000_000_000n);
		} catch {
			return 0;
		}
	}

	const value = Number(amount);
	if (Number.isNaN(value)) return 0;

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
