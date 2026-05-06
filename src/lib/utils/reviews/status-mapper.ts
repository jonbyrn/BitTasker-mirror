/**
 * Version-agnostic contract status → review eligibility mapping.
 * Each contract version can provide its own mapper if status values differ.
 */

/** v2+ contract statuses that allow review submission */
const V2_REVIEWABLE_STATUSES = new Set([
	'completed',
	'resolved',
	'dispute_resolved',
	'FundsReleased',
	'DisputeResolved',
	'Completed'
]);

/** v2+ status events that constitute a confirmed completion for review purposes */
const V2_COMPLETION_ACTIONS = new Set([
	'task-completed',
	'payment-released',
	'dispute-resolved',
	'Completed',
	'FundsReleased',
	'DisputeResolved'
]);

export function isReviewableStatus(status: string | undefined | null): boolean {
	if (!status) return false;
	return V2_REVIEWABLE_STATUSES.has(status);
}

export function isConfirmedCompletionAction(action: string | undefined | null): boolean {
	if (!action) return false;
	return V2_COMPLETION_ACTIONS.has(action);
}
