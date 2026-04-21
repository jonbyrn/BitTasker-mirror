import type { ContractWithEvents } from '$lib/types/contract';
import { EscrowStatus } from '$lib/utils/escrow';
import type { ReviewContractOutcome, ReviewRole, ReviewSubjectType } from './contracts';

export type ReviewEligibilityState = 'pending' | 'available' | 'submitted' | 'not_reviewable';
type Translator = (key: string) => string;

function translateOrFallback(
	translate: Translator | undefined,
	key: string,
	fallback: string
): string {
	if (!translate) {
		return fallback;
	}

	const translated = translate(key);
	return translated && translated !== key ? translated : fallback;
}

const REVIEWABLE_CONTRACT_STATUSES = new Set<EscrowStatus>([
	EscrowStatus.FundsReleased,
	EscrowStatus.FundsClaimed,
	EscrowStatus.DisputeResolved,
	EscrowStatus.DisputeUnresolved,
	EscrowStatus.Refunded
]);

export function isReviewableContractStatus(status: EscrowStatus): boolean {
	return REVIEWABLE_CONTRACT_STATUSES.has(status);
}

export function getReviewContractOutcome(status: EscrowStatus): ReviewContractOutcome | null {
	switch (status) {
		case EscrowStatus.FundsReleased:
		case EscrowStatus.FundsClaimed:
			return 'completed';
		case EscrowStatus.DisputeResolved:
			return 'disputed_resolved_payout';
		case EscrowStatus.DisputeUnresolved:
		case EscrowStatus.Refunded:
			return 'refunded';
		default:
			return null;
	}
}

export function getReviewSubjectType(contract: ContractWithEvents): ReviewSubjectType {
	return contract.contractEvent.content.contextType === 'service' ? 'service_booking' : 'task';
}

export function getReviewRolePair(contract: ContractWithEvents): {
	reviewerRole: ReviewRole;
	revieweeRole: ReviewRole;
} {
	if (getReviewSubjectType(contract) === 'service_booking') {
		return contract.isClient
			? { reviewerRole: 'client', revieweeRole: 'provider' }
			: { reviewerRole: 'provider', revieweeRole: 'client' };
	}

	return contract.isClient
		? { reviewerRole: 'tasker', revieweeRole: 'taskee' }
		: { reviewerRole: 'taskee', revieweeRole: 'tasker' };
}

function getContractId(contract: ContractWithEvents): string {
	return contract.escrowData?.id ?? contract.contractEvent.content.escrowId;
}

export function getReviewEligibilityState(
	contract: ContractWithEvents,
	existingAttestations: { subjectId: string; settlementId: string }[] = []
): ReviewEligibilityState {
	if (contract.isPending) {
		return 'pending';
	}

	const subjectId = getContractId(contract);
	const settlementId = contract.escrowData?.id ?? contract.contractEvent.content.escrowId;

	const hasAttestation = existingAttestations.some(
		(a) => a.subjectId === subjectId || a.settlementId === settlementId
	);
	if (hasAttestation) {
		return 'submitted';
	}

	if (!isReviewableContractStatus(contract.status)) {
		return 'not_reviewable';
	}

	return 'available';
}

export function getReviewOutcomeLabel(
	outcome: ReviewContractOutcome | null | undefined,
	translate?: Translator
): string {
	switch (outcome) {
		case 'completed':
			return translateOrFallback(translate, 'reviews.outcome.completed', 'Completed');
		case 'disputed_resolved_payout':
			return translateOrFallback(
				translate,
				'reviews.outcome.disputed_resolved_payout',
				'Dispute resolved in payout'
			);
		case 'disputed_resolved_refund':
			return translateOrFallback(
				translate,
				'reviews.outcome.disputed_resolved_refund',
				'Dispute resolved in refund'
			);
		case 'refunded':
			return translateOrFallback(translate, 'reviews.outcome.refunded', 'Refunded');
		default:
			return translateOrFallback(translate, 'reviews.status.not_reviewable', 'Not reviewable');
	}
}

export function getReviewAvailabilityLabel(
	state: ReviewEligibilityState,
	translate?: Translator
): string {
	switch (state) {
		case 'pending':
			return translateOrFallback(
				translate,
				'reviews.status.pending_settlement',
				'Pending settlement'
			);
		case 'available':
			return translateOrFallback(translate, 'reviews.status.review_available', 'Review available');
		case 'submitted':
			return translateOrFallback(translate, 'reviews.status.submitted', 'Review submitted');
		case 'not_reviewable':
		default:
			return translateOrFallback(translate, 'reviews.status.not_reviewable', 'Not reviewable');
	}
}

export function isReviewSubmissionAllowed(state: ReviewEligibilityState): boolean {
	return state === 'available';
}
