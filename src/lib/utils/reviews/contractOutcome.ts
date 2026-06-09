import type { ReviewContractOutcome } from '@bittasker/reviews-contracts';
import { ContractStatus } from '$lib/utils/contract/types';

// On-chain state index → blockchain state name (from REVIEW_BLOCKCHAIN_STATES)
const BLOCKCHAIN_STATES = [
	'funded',
	'in_dispute',
	'dispute_resolved',
	'dispute_unresolved',
	'completed',
	'cancelled',
	'refunded',
	'funds_released',
	'funds_claimed',
	'no_show',
	'work_in_progress',
	'in_dispute_wip'
];

const STATE_TO_OUTCOME: Record<string, ReviewContractOutcome> = {
	completed: 'completed',
	funds_released: 'completed',
	funds_claimed: 'completed',
	dispute_resolved: 'disputed_resolved_payout',
	dispute_unresolved: 'refunded',
	refunded: 'refunded'
};

const REVIEWABLE_OUTCOME_BY_STATUS: Partial<Record<ContractStatus, ReviewContractOutcome>> = {
	[ContractStatus.FundsReleased]: 'completed',
	[ContractStatus.FundsClaimed]: 'completed',
	[ContractStatus.Completed]: 'completed',
	[ContractStatus.DisputeResolved]: 'disputed_resolved_payout',
	[ContractStatus.DisputeUnresolved]: 'refunded',
	[ContractStatus.Refunded]: 'refunded'
};

function parseContractStatus(status: string | number | undefined | null): number | null {
	if (status === undefined || status === null) {
		return null;
	}
	if (typeof status === 'number' && Number.isInteger(status)) {
		return status;
	}
	const parsed = parseInt(String(status), 10);
	return Number.isNaN(parsed) ? null : parsed;
}

/**
 * Resolves the attestation contractOutcome from contract status (on-chain state index 0–11).
 */
export function resolveContractOutcomeFromStatus(
	status: string | number | undefined | null
): ReviewContractOutcome {
	const numeric = parseContractStatus(status);
	if (numeric === null) {
		return 'completed';
	}

	const fromOnchain = STATE_TO_OUTCOME[BLOCKCHAIN_STATES[numeric]];
	if (fromOnchain) {
		return fromOnchain;
	}

	const mapped = REVIEWABLE_OUTCOME_BY_STATUS[numeric as ContractStatus];
	return mapped ?? 'completed';
}
