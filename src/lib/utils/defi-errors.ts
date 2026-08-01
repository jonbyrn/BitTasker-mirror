import type { ContractError } from '$lib/utils/wallet/contractErrorHandler';

/**
 * Sanitize an error for safe console logging.
 * Strips raw transaction hex, private-key-like hex strings, and long encoded data
 * that would leak no useful debug info but could contain sensitive material.
 * Preserves: error type, error code, short context strings.
 */
export function sanitizeErrorForLog(error: unknown): Record<string, unknown> {
	if (!(error instanceof Error)) {
		return { type: typeof error, message: 'Unknown error' };
	}

	// Strip hex blobs ≥64 chars (tx hex, calldata, keys) from the message
	const safeMessage = error.message
		.replace(/0x[0-9a-fA-F]{64,}/g, '[hex-redacted]')
		.replace(/transaction="[^"]*"/g, 'transaction="[redacted]"')
		.replace(/info=\{[^}]*\}/g, 'info=[redacted]');

	const result: Record<string, unknown> = {
		name: error.name,
		message: safeMessage.length > 300 ? safeMessage.slice(0, 300) + '…' : safeMessage
	};

	// Include code if present (ethers errors have .code)
	if ('code' in error && typeof (error as Record<string, unknown>).code === 'string') {
		result.code = (error as Record<string, unknown>).code;
	}

	return result;
}

/**
 * Map a ContractError to a DeFi-specific user-friendly message.
 * Overrides generic RBTC-centric messages with Arbitrum-aware wording.
 * Falls back to the contract error's userMessage for unmapped codes.
 *
 * @param contractErr - The contract error to map
 * @param t - The i18n translate function (passed in to avoid Svelte context dependency)
 */
export function mapDeFiErrorMessage(
	contractErr: ContractError,
	t: (key: string) => string
): string {
	const code = contractErr.errorCode;
	if (!code) return contractErr.userMessage;

	const DEFI_ERROR_MAP: Record<string, string> = {
		INSUFFICIENT_GAS: t('wallet.defi.shared.error_insufficient_gas'),
		INSUFFICIENT_FUNDS: t('wallet.defi.shared.error_insufficient_funds'),
		INSUFFICIENT_FUNDS_GAS_FLUCTUATION: t('wallet.defi.shared.error_insufficient_gas'),
		NETWORK_ERROR: t('wallet.defi.shared.error_network'),
		USER_REJECTED: t('wallet.defi.shared.error_user_rejected'),
		GAS_ERROR: t('wallet.defi.shared.error_gas_limit'),
		NONCE_ERROR: t('wallet.defi.shared.error_nonce'),
		CONTRACT_REVERT: t('wallet.defi.shared.error_contract_revert'),
		PROVIDER_DESTROYED: t('wallet.defi.shared.error_network'),
		WALLET_ERROR: t('wallet.defi.shared.error_network'),
		GENERIC_ERROR: t('wallet.defi.shared.error_generic')
	};

	return DEFI_ERROR_MAP[code] ?? contractErr.userMessage;
}
