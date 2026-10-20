import type { ServiceAcceptanceUnknownReasonCode } from '$lib/types/service-quote';

/**
 * Classifies transport failures while a service acceptance is still unconfirmed.
 * RGB finality no longer waits on a Rootstock receipt, so this only labels the
 * error. It does not submit or retry a transaction.
 */
export function classifyServiceAcceptanceAmbiguityError(
	error: unknown
): Exclude<ServiceAcceptanceUnknownReasonCode, 'reconciliation_deferred' | 'tx_replaced'> | null {
	if (!(error instanceof Error)) {
		return null;
	}

	const normalizedMessage = error.message.trim().toLowerCase();
	if (normalizedMessage.includes('timeout')) {
		return 'pending_timeout';
	}

	if (normalizedMessage.includes('nonce')) {
		return 'nonce_conflict';
	}

	if (
		normalizedMessage.includes('rpc') ||
		normalizedMessage.includes('network') ||
		normalizedMessage.includes('connection') ||
		normalizedMessage.includes('provider')
	) {
		return 'rpc_unavailable';
	}

	return null;
}
