import { EscrowStatus } from '$lib/utils/enums/wallet.enum';

/**
 * Get translation key for contract status
 * Maps EscrowStatus enum values to translation keys
 */
export function getStatusTranslationKey(status: EscrowStatus): string {
	switch (status) {
		case EscrowStatus.Funded:
			return 'dashboard.contracts.status.funded';
		case EscrowStatus.InDispute:
			return 'dashboard.contracts.status.in_dispute';
		case EscrowStatus.DisputeResolved:
			return 'dashboard.contracts.status.dispute_resolved';
		case EscrowStatus.DisputeUnresolved:
			return 'dashboard.contracts.status.dispute_unresolved';
		case EscrowStatus.Completed:
			return 'dashboard.contracts.status.completed';
		case EscrowStatus.Cancelled:
			return 'dashboard.contracts.status.cancelled';
		case EscrowStatus.InProgress:
			return 'dashboard.contracts.status.in_progress';
		case EscrowStatus.PendingFunding:
			return 'dashboard.contracts.status.pending_funding';
		case EscrowStatus.PendingCompletion:
			return 'dashboard.contracts.status.pending_completion';
		case EscrowStatus.PendingDispute:
			return 'dashboard.contracts.status.pending_dispute';
		case EscrowStatus.PendingCancellation:
			return 'dashboard.contracts.status.pending_cancellation';
		default:
			return 'dashboard.contracts.status.funded';
	}
}

/**
 * Get CSS color class for contract status badge
 */
export function getStatusColorClass(status: EscrowStatus): string {
	switch (status) {
		case EscrowStatus.Funded:
		case EscrowStatus.InProgress:
			return 'badge-primary';
		case EscrowStatus.Completed:
			return 'badge-success';
		case EscrowStatus.InDispute:
		case EscrowStatus.PendingDispute:
			return 'badge-warning';
		case EscrowStatus.DisputeResolved:
		case EscrowStatus.DisputeUnresolved:
			return 'badge-info';
		case EscrowStatus.Cancelled:
		case EscrowStatus.PendingCancellation:
			return 'badge-error';
		case EscrowStatus.PendingFunding:
		case EscrowStatus.PendingCompletion:
			return 'badge-info';
		default:
			return 'badge-neutral';
	}
}

