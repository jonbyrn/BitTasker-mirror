import { EscrowStatus } from '$lib/utils/enums/wallet.enum';

/**
 * Get translation key for contract status
 * Maps EscrowStatus enum values to translation keys
 */
export function getStatusTranslationKey(status: EscrowStatus): string {
	switch (status) {
		// Blockchain states (0-5)
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
		
		// Nostr states (6+) - Pending & Custom
		case EscrowStatus.PendingFunding:
			return 'dashboard.contracts.status.pending_funding';
		case EscrowStatus.InProgress:
			return 'dashboard.contracts.status.in_progress';
		case EscrowStatus.PendingCompletion:
			return 'dashboard.contracts.status.pending_completion';
		case EscrowStatus.PendingCancellation:
			return 'dashboard.contracts.status.pending_cancellation';
		case EscrowStatus.FundsReleased:
			return 'dashboard.contracts.status.funds_released';
		case EscrowStatus.PendingAcceptance:
			return 'dashboard.contracts.status.pending_acceptance';
		case EscrowStatus.DisputeResolutionProposed:
			return 'dashboard.contracts.status.dispute_resolution_proposed';
		case EscrowStatus.PendingDispute:
			return 'dashboard.contracts.status.pending_dispute';
		
		default:
			return 'dashboard.contracts.status.funded';
	}
}

/**
 * Get CSS color class for contract status badge
 */
export function getStatusColorClass(status: EscrowStatus): string {
	switch (status) {
		// Active/In-Progress states - Primary (Bitcoin orange)
		case EscrowStatus.Funded:
		case EscrowStatus.InProgress:
		case EscrowStatus.PendingFunding:
			return 'badge-primary';
		
		// Completed/Success states - Success (Green)
		case EscrowStatus.Completed:
		case EscrowStatus.FundsReleased:
		case EscrowStatus.DisputeResolved:
			return 'badge-success';
		
		// Pending states - Info (Blue)
		case EscrowStatus.PendingCompletion:
		case EscrowStatus.PendingAcceptance:
		case EscrowStatus.DisputeUnresolved:
			return 'badge-info';
		
		// Dispute states - Warning (Yellow)
		case EscrowStatus.InDispute:
		case EscrowStatus.PendingDispute:
		case EscrowStatus.DisputeResolutionProposed:
			return 'badge-warning';
		
		// Cancelled states - Error (Red)
		case EscrowStatus.Cancelled:
		case EscrowStatus.PendingCancellation:
			return 'badge-error';
		
		default:
			return 'badge-neutral';
	}
}

