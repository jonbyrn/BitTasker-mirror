/**
 * Version-agnostic contract status → review eligibility mapping.
 * Works with string status names to avoid numeric enum conflicts.
 *
 * The review CTA is shown only for terminal money-moving outcomes (e.g. funds released, funds claimed, dispute resolved), not for `Completed` alone (work marked done before payout).
 */
import { ContractStatus } from '$lib/nostr/events/contractStatus';

/** Contract statuses that allow review submission (string values - case insensitive matching) */
const REVIEWABLE_STATUS_STRINGS = new Set([
	'resolved',
	'dispute_resolved',
	'fundsreleased',
	'fundsclaimed',
	'disputeresolved',
	// PascalCase variants
	'FundsReleased',
	'FundsClaimed',
	'DisputeResolved'
]);

/**
 * Numeric status values that allow review submission.
 * Uses ContractStatus enum which is the canonical source of truth.
 * Reviews are allowed only after funds have moved or a dispute outcome is final — not merely `Completed` (work marked done).
 */
const REVIEWABLE_STATUS_NUMBERS = new Set([
	ContractStatus.Resolved,
	ContractStatus.Completed,
	ContractStatus.Disputed
]);

/** Status events that constitute a confirmed completion for review purposes */
const COMPLETION_ACTIONS = new Set([
	'task-completed',
	'payment-released',
	'dispute-resolved',
	'Completed',
	'FundsReleased',
	'DisputeResolved'
]);

export function isReviewableStatus(status: string | number | undefined | null): boolean {
	if (status === undefined || status === null) return false;

	// Handle numeric status values (from escrow data)
	if (typeof status === 'number') {
		return REVIEWABLE_STATUS_NUMBERS.has(status);
	}

	// Handle string status values
	if (REVIEWABLE_STATUS_STRINGS.has(status)) {
		return true;
	}

	// Try parsing as number (status might be "4" instead of 4)
	const numericStatus = parseInt(status, 10);
	if (!isNaN(numericStatus)) {
		return REVIEWABLE_STATUS_NUMBERS.has(numericStatus);
	}

	return false;
}

export function isConfirmedCompletionAction(action: string | number | undefined | null): boolean {
	if (action === undefined || action === null) return false;

	// Handle numeric status values
	if (typeof action === 'number') {
		// Map numeric values to completion actions
		return REVIEWABLE_STATUS_NUMBERS.has(action);
	}

	return COMPLETION_ACTIONS.has(action);
}
