import { EscrowStatus } from '$lib/utils/escrow';
import { ContractStatus, type ContractDisplayStatus, DisplayOnlyStatus } from '../contract/types';

/**
 * Status event messages configuration
 * Maps each status to its pending message, confirmed message, and success toast
 */
interface StatusMessages {
	pendingMessage?: string; // Message shown during transaction (info toast)
	confirmedMessage: string; // Message published to Nostr
	successToast: string; // Success toast after confirmation
	errorToast: string; // Error toast if transaction fails
}

/**
 * Get messages for a given escrow status
 * Returns translation keys for pending, confirmed, success, and error states
 */
export function getStatusMessages(status: EscrowStatus): StatusMessages {
	switch (status) {
		// Task Completion Flow
		case EscrowStatus.PendingCompletion:
			return {
				pendingMessage: 'dashboard.contracts.actions.task_completing_message',
				confirmedMessage: 'dashboard.contracts.actions.task_completed_message',
				successToast: 'dashboard.contracts.actions.task_completed_success',
				errorToast: 'dashboard.contracts.actions.task_completed_error'
			};
		case EscrowStatus.Completed:
			return {
				confirmedMessage: 'dashboard.contracts.actions.task_completed_message',
				successToast: 'dashboard.contracts.actions.task_completed_success',
				errorToast: 'dashboard.contracts.actions.task_completed_error'
			};

		// Task Acceptance Flow
		case EscrowStatus.PendingAcceptance:
			return {
				pendingMessage: 'dashboard.contracts.actions.task_accepting_message',
				confirmedMessage: 'dashboard.contracts.actions.payment_released_message',
				successToast: 'dashboard.contracts.actions.payment_released_success',
				errorToast: 'dashboard.contracts.actions.payment_released_error'
			};
		case EscrowStatus.FundsReleased:
			return {
				confirmedMessage: 'dashboard.contracts.actions.payment_released_message',
				successToast: 'dashboard.contracts.actions.payment_released_success',
				errorToast: 'dashboard.contracts.actions.payment_released_error'
			};

		// Dispute Flow
		case EscrowStatus.PendingDispute:
			return {
				pendingMessage: 'dashboard.contracts.actions.dispute_raising_message',
				confirmedMessage: 'dashboard.contracts.actions.dispute_raised_message',
				successToast: 'dashboard.contracts.actions.dispute_raised_success',
				errorToast: 'dashboard.contracts.actions.dispute_raised_error'
			};
		case EscrowStatus.InDispute:
			return {
				confirmedMessage: 'dashboard.contracts.actions.dispute_raised_message',
				successToast: 'dashboard.contracts.actions.dispute_raised_success',
				errorToast: 'dashboard.contracts.actions.dispute_raised_error'
			};

		// Resolution Proposal Flow
		case EscrowStatus.PendingResolutionProposal:
			return {
				pendingMessage: 'dashboard.contracts.actions.resolution_proposing_message',
				confirmedMessage: 'dashboard.contracts.actions.resolution_proposed_message',
				successToast: 'dashboard.contracts.actions.resolution_proposed_success',
				errorToast: 'dashboard.contracts.actions.resolution_proposed_error'
			};
		case EscrowStatus.DisputeResolutionProposed:
			return {
				confirmedMessage: 'dashboard.contracts.actions.resolution_proposed_message',
				successToast: 'dashboard.contracts.actions.resolution_proposed_success',
				errorToast: 'dashboard.contracts.actions.resolution_proposed_error'
			};

		// Proposal Acceptance Flow
		case EscrowStatus.PendingProposalAcceptance:
			return {
				pendingMessage: 'dashboard.contracts.actions.proposal_accepting_message',
				confirmedMessage: 'dashboard.contracts.actions.proposal_accepted_message',
				successToast: 'dashboard.contracts.actions.proposal_accepted_success',
				errorToast: 'dashboard.contracts.actions.proposal_accepted_error'
			};
		case EscrowStatus.DisputeResolved:
			return {
				confirmedMessage: 'dashboard.contracts.actions.proposal_accepted_message',
				successToast: 'dashboard.contracts.actions.proposal_accepted_success',
				errorToast: 'dashboard.contracts.actions.proposal_accepted_error'
			};

		// Cancellation Flow
		case EscrowStatus.PendingCancellation:
			return {
				pendingMessage: 'dashboard.contracts.actions.escrow_cancelling_message',
				confirmedMessage: 'dashboard.contracts.actions.escrow_cancelled_message',
				successToast: 'dashboard.contracts.actions.escrow_cancelled_success',
				errorToast: 'dashboard.contracts.actions.escrow_cancelled_error'
			};
		case EscrowStatus.Cancelled:
			return {
				confirmedMessage: 'dashboard.contracts.actions.escrow_cancelled_message',
				successToast: 'dashboard.contracts.actions.escrow_cancelled_success',
				errorToast: 'dashboard.contracts.actions.escrow_cancelled_error'
			};

		// Timelock Resolution Flow
		case EscrowStatus.PendingTimelockResolution:
			return {
				pendingMessage: 'dashboard.contracts.actions.timelock_resolving_message',
				confirmedMessage: 'dashboard.contracts.actions.timelock_resolved_message',
				successToast: 'dashboard.contracts.actions.timelock_resolved_success',
				errorToast: 'dashboard.contracts.actions.timelock_resolved_error'
			};
		case EscrowStatus.DisputeUnresolved:
			return {
				confirmedMessage: 'dashboard.contracts.actions.timelock_resolved_message',
				successToast: 'dashboard.contracts.actions.timelock_resolved_success',
				errorToast: 'dashboard.contracts.actions.timelock_resolved_error'
			};

		default:
			return {
				confirmedMessage: 'dashboard.contracts.actions.unknown_error',
				successToast: 'dashboard.contracts.actions.unknown_error',
				errorToast: 'dashboard.contracts.actions.unknown_error'
			};
	}
}

/**
 * Get translation key for contract status
 * Maps EscrowStatus enum values to translation keys
 */
export function getStatusTranslationKey(status: ContractDisplayStatus): string {
	switch (status) {
		case ContractStatus.Funded:
			return 'dashboard.contracts.status.funded';
		case ContractStatus.Refunded:
			return 'dashboard.contracts.status.refunded';
		case ContractStatus.InDispute:
			return 'dashboard.contracts.status.in_dispute';
		case ContractStatus.DisputeResolved:
			return 'dashboard.contracts.status.dispute_resolved';
		case ContractStatus.DisputeUnresolved:
			return 'dashboard.contracts.status.dispute_unresolved';
		case ContractStatus.Completed:
			return 'dashboard.contracts.status.completed';
		case ContractStatus.Cancelled:
			return 'dashboard.contracts.status.cancelled';
		case ContractStatus.FundsReleased:
			return 'dashboard.contracts.status.funds_released';
		case ContractStatus.FundsClaimed:
			return 'dashboard.contracts.status.funds_claimed';
		case ContractStatus.NoShow:
			return 'dashboard.contracts.status.no_show';
		case ContractStatus.WorkInProgress:
			return 'dashboard.contracts.status.work_in_progress';
		case ContractStatus.InDisputeWorkInProgress:
			return 'dashboard.contracts.status.in_dispute';

		case DisplayOnlyStatus.InProgress:
			return 'dashboard.contracts.status.in_progress';
		case DisplayOnlyStatus.DisputeResolutionProposed:
			return 'dashboard.contracts.status.dispute_resolution_proposed';

		default:
			return 'dashboard.contracts.status.funded';
	}
}

/**
 * Get CSS color class for contract status badge
 */
export function getStatusColorClass(status: ContractDisplayStatus): string {
	switch (status) {
		case DisplayOnlyStatus.InProgress:
		case ContractStatus.WorkInProgress:
			return 'badge-primary';

		case ContractStatus.Completed:
		case ContractStatus.FundsReleased:
		case ContractStatus.DisputeResolved:
		case ContractStatus.FundsClaimed:
			return 'badge-success';

		case ContractStatus.Funded:
		case ContractStatus.DisputeUnresolved:
		case ContractStatus.Refunded:
			return 'badge-info';

		case ContractStatus.InDispute:
		case ContractStatus.InDisputeWorkInProgress:
		case ContractStatus.NoShow:
			return 'badge-warning';

		case ContractStatus.Cancelled:
			return 'badge-error';

		default:
			return 'badge-neutral';
	}
}

/**
 * Text color for a timeline line item (semantic, not badge).
 */
export function getContractStatusTimelineTextClass(status: ContractStatus): string {
	switch (status) {
		case ContractStatus.Completed:
		case ContractStatus.FundsReleased:
		case ContractStatus.DisputeResolved:
		case ContractStatus.FundsClaimed:
			return 'text-success';
		case ContractStatus.InDispute:
		case ContractStatus.InDisputeWorkInProgress:
		case ContractStatus.NoShow:
			return 'text-warning';
		case ContractStatus.Cancelled:
			return 'text-error';
		case ContractStatus.DisputeUnresolved:
		case ContractStatus.Refunded:
		case ContractStatus.Funded:
		case ContractStatus.WorkInProgress:
			return 'text-info';
		default:
			return 'text-base-content/60';
	}
}

/**
 * Get action description for contract status
 */
export function getActionDescription(action: EscrowStatus): string {
	// Map enum values to translation keys
	switch (action) {
		case EscrowStatus.Completed:
			return 'dashboard.contracts.status.task_completed';
		case EscrowStatus.PendingCompletion:
			return 'dashboard.contracts.status.pending_completion';
		case EscrowStatus.FundsReleased:
			return 'dashboard.contracts.status.funds_released';
		case EscrowStatus.PendingAcceptance:
			return 'dashboard.contracts.status.pending_acceptance';
		case EscrowStatus.InDispute:
			return 'dashboard.contracts.status.dispute_raised';
		case EscrowStatus.PendingDispute:
			return 'dashboard.contracts.status.pending_dispute';
		case EscrowStatus.DisputeResolutionProposed:
			return 'dashboard.contracts.status.resolution_proposed';
		case EscrowStatus.DisputeResolved:
			return 'dashboard.contracts.status.proposal_accepted';
		case EscrowStatus.Cancelled:
			return 'dashboard.contracts.status.escrow_cancelled';
		case EscrowStatus.PendingCancellation:
			return 'dashboard.contracts.status.pending_cancellation';
		case EscrowStatus.DisputeUnresolved:
			return 'dashboard.contracts.status.timelock_resolved';
		case EscrowStatus.PendingResolutionProposal:
			return 'dashboard.contracts.status.pending_resolution_proposal';
		case EscrowStatus.PendingProposalAcceptance:
			return 'dashboard.contracts.status.pending_proposal_acceptance';
		case EscrowStatus.PendingTimelockResolution:
			return 'dashboard.contracts.status.pending_timelock_resolution';
		default:
			return action?.toString();
	}
}
