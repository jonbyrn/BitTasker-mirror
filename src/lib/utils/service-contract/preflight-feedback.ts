import type { ServiceContractPreflightErrorCode } from '$lib/utils/service-contract/preflight';

export interface ServiceContractPreflightFeedback {
	message: string;
	hint: string | null;
}

function fallbackMessage(errorCode?: ServiceContractPreflightErrorCode): string {
	switch (errorCode) {
		case 'wallet_not_connected':
			return 'Connect your wallet before continuing.';
		case 'wallet_not_ready':
			return 'Your wallet is not ready yet. Retry after it finishes connecting.';
		case 'wrong_network':
			return 'Switch your wallet to the required Rootstock network before continuing.';
		case 'invalid_provider_wallet':
			return 'Provider wallet is unavailable for this service.';
		case 'invalid_service_amount':
			return 'Unable to determine the service price.';
		case 'price_unavailable':
			return 'Unable to determine the current BTC price.';
		case 'insufficient_funds':
			return 'Insufficient RBTC balance for the escrow amount and gas.';
		case 'preflight_failed':
			return 'Unable to prepare the escrow transaction right now.';
		default:
			return 'Unable to create the service contract right now.';
	}
}

function resolveHint(errorCode?: ServiceContractPreflightErrorCode): string | null {
	switch (errorCode) {
		case 'wallet_not_connected':
			return 'Connect your wallet, then retry the contract creation.';
		case 'wallet_not_ready':
			return 'Keep your wallet open until it finishes connecting, then retry.';
		case 'wrong_network':
			return 'Switch to the required Rootstock network in your wallet, then retry.';
		case 'insufficient_funds':
			return 'Add enough RBTC to cover the escrow amount and gas, then retry.';
		case 'preflight_failed':
			return 'Retry after your wallet finishes estimating the transaction. If the problem persists, reopen the flow.';
		default:
			return null;
	}
}

/**
 * Maps service-contract preflight failures into stable user-facing recovery copy.
 * Callers use this to keep quote acceptance and instant-buy flows in context on failure.
 */
export function describeServiceContractPreflightFailure(
	errorCode?: ServiceContractPreflightErrorCode,
	errorMessage?: string
): ServiceContractPreflightFeedback {
	const normalizedMessage = errorMessage?.trim();

	return {
		message:
			normalizedMessage && normalizedMessage.length > 0
				? normalizedMessage
				: fallbackMessage(errorCode),
		hint: resolveHint(errorCode)
	};
}
