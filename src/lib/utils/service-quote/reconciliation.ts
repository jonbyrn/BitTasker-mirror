import type { ServiceAcceptanceLedgerEntry } from '$lib/utils/service-quote/acceptance-ledger';
import type { ServiceAcceptanceUnknownReasonCode } from '$lib/types/service-quote';

export interface ServiceAcceptanceReconciliationInput {
	ledgerEntry: ServiceAcceptanceLedgerEntry | null;
	hasVerifiedEscrow: boolean;
	hasPublishFailure: boolean;
	unknownReasonCode?: ServiceAcceptanceUnknownReasonCode;
}

export type ServiceAcceptanceReconciledState =
	| 'accepted'
	| 'accept_failed'
	| 'accept_unknown'
	| 'accepting'
	| 'declined'
	| 'withdrawn'
	| 'idle';

export function reconcileServiceAcceptanceState(
	input: ServiceAcceptanceReconciliationInput
): ServiceAcceptanceReconciledState {
	if (!input.ledgerEntry) {
		return 'idle';
	}

	if (input.hasVerifiedEscrow) {
		return 'accepted';
	}

	if (input.unknownReasonCode) {
		return 'accept_unknown';
	}

	if (input.hasPublishFailure) {
		return 'accept_failed';
	}

	return input.ledgerEntry.state;
}
