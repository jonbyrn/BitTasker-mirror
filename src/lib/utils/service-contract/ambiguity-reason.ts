import type { ServiceAcceptanceUnknownReasonCode } from '$lib/types/service-quote';

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
