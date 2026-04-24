/**
 * Contract Error Handler
 * Converts technical blockchain error messages into user-friendly messages
 */

import { t } from 'svelte-i18n';
import { get } from 'svelte/store';

export interface ContractError {
	userMessage: string;
	technicalMessage: string;
	errorCode?: string;
}

/**
 * Extract user-friendly error message from contract errors
 */
export function extractContractError(error: unknown): ContractError {
	const _ = get(t);

	if (!(error instanceof Error)) {
		return {
			userMessage: _('dashboard.contracts.errors.unknown_error'),
			technicalMessage: 'Unknown error type'
		};
	}

	const errorMessage = error.message;
	const errorLower = errorMessage.toLowerCase();

	// Contract-specific error messages (from smart contract revert reasons)
	if (errorLower.includes('must be after est start time')) {
		return {
			userMessage: _('dashboard.contracts.errors.before_start_time'),
			technicalMessage: errorMessage,
			errorCode: 'BEFORE_START_TIME'
		};
	}

	if (errorLower.includes('must be before est completion time')) {
		return {
			userMessage: _('dashboard.contracts.errors.after_completion_time'),
			technicalMessage: errorMessage,
			errorCode: 'AFTER_COMPLETION_TIME'
		};
	}

	if (errorLower.includes('only client can accept')) {
		return {
			userMessage: _('dashboard.contracts.errors.not_client'),
			technicalMessage: errorMessage,
			errorCode: 'NOT_CLIENT'
		};
	}

	if (errorLower.includes('only freelancer can complete')) {
		return {
			userMessage: _('dashboard.contracts.errors.not_freelancer'),
			technicalMessage: errorMessage,
			errorCode: 'NOT_FREELANCER'
		};
	}

	if (errorLower.includes('escrow not funded') || errorLower.includes('invalid escrow state')) {
		return {
			userMessage: _('dashboard.contracts.errors.invalid_state'),
			technicalMessage: errorMessage,
			errorCode: 'INVALID_STATE'
		};
	}

	if (errorLower.includes('already completed')) {
		return {
			userMessage: _('dashboard.contracts.errors.already_completed'),
			technicalMessage: errorMessage,
			errorCode: 'ALREADY_COMPLETED'
		};
	}

	if (errorLower.includes('already disputed')) {
		return {
			userMessage: _('dashboard.contracts.errors.already_disputed'),
			technicalMessage: errorMessage,
			errorCode: 'ALREADY_DISPUTED'
		};
	}

	if (errorLower.includes('dispute period expired') || errorLower.includes('too late to dispute')) {
		return {
			userMessage: _('dashboard.contracts.errors.dispute_expired'),
			technicalMessage: errorMessage,
			errorCode: 'DISPUTE_EXPIRED'
		};
	}

	if (errorLower.includes('no active proposal')) {
		return {
			userMessage: _('dashboard.contracts.errors.no_proposal'),
			technicalMessage: errorMessage,
			errorCode: 'NO_PROPOSAL'
		};
	}

	if (errorLower.includes('proposal already accepted')) {
		return {
			userMessage: _('dashboard.contracts.errors.proposal_accepted'),
			technicalMessage: errorMessage,
			errorCode: 'PROPOSAL_ACCEPTED'
		};
	}

	if (errorLower.includes('timelock not expired')) {
		return {
			userMessage: _('dashboard.contracts.errors.timelock_active'),
			technicalMessage: errorMessage,
			errorCode: 'TIMELOCK_ACTIVE'
		};
	}

	if (errorLower.includes('paused')) {
		return {
			userMessage: _('dashboard.contracts.errors.contract_paused'),
			technicalMessage: errorMessage,
			errorCode: 'CONTRACT_PAUSED'
		};
	}

	// Wallet and transaction errors - check before generic wallet errors
	if (errorLower.includes('insufficient balance') || errorLower.includes('insufficient funds')) {
		// Check if this is specifically about transaction fees or gas
		if (
			errorLower.includes('transaction fees') ||
			errorLower.includes('transaction cost') ||
			errorLower.includes('pay for gas')
		) {
			return {
				userMessage: _('dashboard.contracts.errors.insufficient_gas'),
				technicalMessage: errorMessage,
				errorCode: 'INSUFFICIENT_GAS'
			};
		}
		return {
			userMessage: _('dashboard.contracts.errors.insufficient_funds'),
			technicalMessage: errorMessage,
			errorCode: 'INSUFFICIENT_FUNDS'
		};
	}

	// Check for specific contract revert messages first
	if (errorLower.includes('only parties')) {
		return {
			userMessage: _('dashboard.contracts.errors.unauthorized_caller'),
			technicalMessage: errorMessage,
			errorCode: 'UNAUTHORIZED_CALLER'
		};
	}

	if (errorLower.includes('gas') || errorLower.includes('out of gas')) {
		// Avoid false positives - check if it's actually a gas issue, not just containing "gas" in action/data
		if (
			errorLower.includes('out of gas') ||
			errorLower.includes('gas limit') ||
			errorLower.includes('insufficient gas')
		) {
			return {
				userMessage: _('dashboard.contracts.errors.gas_error'),
				technicalMessage: errorMessage,
				errorCode: 'GAS_ERROR'
			};
		}
	}

	// Check for provider destroyed error specifically (before generic network check)
	// This can happen during wallet reinitialization when cached contracts have stale providers
	if (errorLower.includes('provider destroyed') || errorLower.includes('provider.destroyed')) {
		return {
			userMessage: _('dashboard.contracts.errors.wallet_error'),
			technicalMessage: errorMessage,
			errorCode: 'PROVIDER_DESTROYED'
		};
	}

	if (errorLower.includes('network') || errorLower.includes('connection')) {
		return {
			userMessage: _('dashboard.contracts.errors.network_error'),
			technicalMessage: errorMessage,
			errorCode: 'NETWORK_ERROR'
		};
	}

	if (errorLower.includes('user rejected') || errorLower.includes('user denied')) {
		return {
			userMessage: _('dashboard.contracts.errors.user_rejected'),
			technicalMessage: errorMessage,
			errorCode: 'USER_REJECTED'
		};
	}

	if (errorLower.includes('nonce')) {
		return {
			userMessage: _('dashboard.contracts.errors.nonce_error'),
			technicalMessage: errorMessage,
			errorCode: 'NONCE_ERROR'
		};
	}

	if (errorLower.includes('invalid_argument') || errorLower.includes('invalid argument')) {
		return {
			userMessage: _('dashboard.contracts.errors.invalid_argument'),
			technicalMessage: errorMessage,
			errorCode: 'INVALID_ARGUMENT'
		};
	}

	if (errorLower.includes('wallet') || errorLower.includes('provider')) {
		return {
			userMessage: _('dashboard.contracts.errors.wallet_error'),
			technicalMessage: errorMessage,
			errorCode: 'WALLET_ERROR'
		};
	}

	// Generic contract revert
	if (errorLower.includes('revert') || errorLower.includes('execution reverted')) {
		// Try to extract the revert reason if available
		const revertMatch = errorMessage.match(/"([^"]+)"/);
		if (revertMatch && revertMatch[1]) {
			const revertReason = revertMatch[1];

			// Check if we have a specific handler for this revert reason
			const specificError = extractContractError(new Error(revertReason));
			if (specificError.errorCode) {
				return specificError;
			}

			return {
				userMessage: `Transaction failed: ${revertReason}`,
				technicalMessage: errorMessage,
				errorCode: 'CONTRACT_REVERT'
			};
		}

		return {
			userMessage: _('dashboard.contracts.errors.contract_revert'),
			technicalMessage: errorMessage,
			errorCode: 'CONTRACT_REVERT'
		};
	}

	// If error message is too long, provide a generic message
	if (error.message.length > 150) {
		return {
			userMessage: _('dashboard.contracts.errors.generic_error'),
			technicalMessage: errorMessage,
			errorCode: 'GENERIC_ERROR'
		};
	}

	// Return the original message if it's reasonable
	return {
		userMessage: error.message,
		technicalMessage: errorMessage
	};
}

/**
 * Get error message with optional technical details toggle
 */
export function getErrorMessage(error: unknown, showTechnical = false): string {
	const contractError = extractContractError(error);

	if (showTechnical && contractError.technicalMessage !== contractError.userMessage) {
		return `${contractError.userMessage}\n\nTechnical details: ${contractError.technicalMessage}`;
	}

	return contractError.userMessage;
}
