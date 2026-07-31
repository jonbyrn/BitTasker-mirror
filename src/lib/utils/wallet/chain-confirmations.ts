/**
 * Chain-Specific Confirmation Counts
 *
 * Required block confirmations per network for transaction finality.
 * Used by blockchain toast store to track confirmation progress.
 */

/** Required block confirmations per network for transaction finality. */
export const REQUIRED_CONFIRMATIONS: Record<string, number> = {
	'rootstock-bitcoin': 3,
	'usdt-bsc': 1,
	'usdt-ethereum': 3,
	'usdt0-arb': 1,
	'usdt-polygon': 1,
	bitcoin: 1,
	'lightning-bitcoin': 3 // RSK lockup confirmations
};
