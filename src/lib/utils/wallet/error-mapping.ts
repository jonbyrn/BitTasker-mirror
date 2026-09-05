/**
 * Error Mapping — Maps raw error messages to i18n keys for blockchain toast display.
 *
 * Patterns are matched case-insensitively against the error string.
 * The first match wins. Falls back to a generic key with the original error.
 */

/** Mapping from error message patterns to i18n keys. */
const ERROR_KEY_MAP: Record<string, string> = {
	'insufficient funds': 'wallet.toast.error.insufficient_funds',
	insufficient_funds: 'wallet.toast.error.insufficient_funds',
	'insufficient gas': 'wallet.toast.error.insufficient_gas',
	'insufficient balance': 'wallet.toast.error.insufficient_funds',
	nonce: 'wallet.toast.error.nonce_too_low',
	reverted: 'wallet.toast.error.execution_reverted',
	timeout: 'wallet.toast.error.timeout',
	'timed out': 'wallet.toast.error.timeout',
	network: 'wallet.toast.error.network_error',
	offline: 'wallet.toast.error.network_error',
	rejected: 'wallet.toast.error.user_rejected'
};

/**
 * Map a raw error message to an i18n key + interpolation values.
 *
 * @param error - Raw error message from the blockchain provider or service.
 * @returns Object with `key` (i18n key) and `values` (interpolation params).
 */
export function mapErrorToKey(error: string): {
	key: string;
	values: Record<string, unknown>;
} {
	const lower = error.toLowerCase();
	for (const [pattern, key] of Object.entries(ERROR_KEY_MAP)) {
		if (lower.includes(pattern)) {
			return { key, values: {} };
		}
	}
	return { key: 'wallet.toast.error.generic', values: { detail: error } };
}
