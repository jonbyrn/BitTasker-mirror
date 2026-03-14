import type { ContractEscrowStatus } from '$lib/types/contract';
import { createDebug } from '$lib/utils/debug';
import { EscrowStatus as V1EscrowStatus } from '$lib/utils/escrow/v1/escrow.enum';
import { EscrowStatus as V2EscrowStatus } from '$lib/utils/escrow/v2/escrow.enum';

const d = createDebug('escrow:status-formatter');
type EscrowVersion = 'v1' | 'v2';

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

function normalizeVersion(version?: string): EscrowVersion {
	return version === 'v2' ? 'v2' : 'v1';
}

export function getEscrowVersionFromTags(tags?: string[][]): EscrowVersion {
	const versionTag = tags?.find((tag) => tag[0] === 'v')?.[1];
	return normalizeVersion(versionTag);
}

const unknownStatusMessages: StatusMessages = {
	confirmedMessage: 'dashboard.contracts.actions.unknown_error',
	successToast: 'dashboard.contracts.actions.unknown_error',
	errorToast: 'dashboard.contracts.actions.unknown_error'
};

const statusMessagesByVersion: Record<EscrowVersion, Partial<Record<number, StatusMessages>>> = {
	v1: {
		[V1EscrowStatus.PendingCompletion]: {
			pendingMessage: 'dashboard.contracts.actions.task_completing_message',
			confirmedMessage: 'dashboard.contracts.actions.task_completed_message',
			successToast: 'dashboard.contracts.actions.task_completed_success',
			errorToast: 'dashboard.contracts.actions.task_completed_error'
		},
		[V1EscrowStatus.Completed]: {
			confirmedMessage: 'dashboard.contracts.actions.task_completed_message',
			successToast: 'dashboard.contracts.actions.task_completed_success',
			errorToast: 'dashboard.contracts.actions.task_completed_error'
		},
		[V1EscrowStatus.PendingAcceptance]: {
			pendingMessage: 'dashboard.contracts.actions.task_accepting_message',
			confirmedMessage: 'dashboard.contracts.actions.payment_released_message',
			successToast: 'dashboard.contracts.actions.payment_released_success',
			errorToast: 'dashboard.contracts.actions.payment_released_error'
		},
		[V1EscrowStatus.FundsReleased]: {
			confirmedMessage: 'dashboard.contracts.actions.payment_released_message',
			successToast: 'dashboard.contracts.actions.payment_released_success',
			errorToast: 'dashboard.contracts.actions.payment_released_error'
		},
		[V1EscrowStatus.PendingDispute]: {
			pendingMessage: 'dashboard.contracts.actions.dispute_raising_message',
			confirmedMessage: 'dashboard.contracts.actions.dispute_raised_message',
			successToast: 'dashboard.contracts.actions.dispute_raised_success',
			errorToast: 'dashboard.contracts.actions.dispute_raised_error'
		},
		[V1EscrowStatus.InDispute]: {
			confirmedMessage: 'dashboard.contracts.actions.dispute_raised_message',
			successToast: 'dashboard.contracts.actions.dispute_raised_success',
			errorToast: 'dashboard.contracts.actions.dispute_raised_error'
		},
		[V1EscrowStatus.PendingResolutionProposal]: {
			pendingMessage: 'dashboard.contracts.actions.resolution_proposing_message',
			confirmedMessage: 'dashboard.contracts.actions.resolution_proposed_message',
			successToast: 'dashboard.contracts.actions.resolution_proposed_success',
			errorToast: 'dashboard.contracts.actions.resolution_proposed_error'
		},
		[V1EscrowStatus.DisputeResolutionProposed]: {
			confirmedMessage: 'dashboard.contracts.actions.resolution_proposed_message',
			successToast: 'dashboard.contracts.actions.resolution_proposed_success',
			errorToast: 'dashboard.contracts.actions.resolution_proposed_error'
		},
		[V1EscrowStatus.PendingProposalAcceptance]: {
			pendingMessage: 'dashboard.contracts.actions.proposal_accepting_message',
			confirmedMessage: 'dashboard.contracts.actions.proposal_accepted_message',
			successToast: 'dashboard.contracts.actions.proposal_accepted_success',
			errorToast: 'dashboard.contracts.actions.proposal_accepted_error'
		},
		[V1EscrowStatus.DisputeResolved]: {
			confirmedMessage: 'dashboard.contracts.actions.proposal_accepted_message',
			successToast: 'dashboard.contracts.actions.proposal_accepted_success',
			errorToast: 'dashboard.contracts.actions.proposal_accepted_error'
		},
		[V1EscrowStatus.PendingCancellation]: {
			pendingMessage: 'dashboard.contracts.actions.escrow_cancelling_message',
			confirmedMessage: 'dashboard.contracts.actions.escrow_cancelled_message',
			successToast: 'dashboard.contracts.actions.escrow_cancelled_success',
			errorToast: 'dashboard.contracts.actions.escrow_cancelled_error'
		},
		[V1EscrowStatus.Cancelled]: {
			confirmedMessage: 'dashboard.contracts.actions.escrow_cancelled_message',
			successToast: 'dashboard.contracts.actions.escrow_cancelled_success',
			errorToast: 'dashboard.contracts.actions.escrow_cancelled_error'
		},
		[V1EscrowStatus.PendingTimelockResolution]: {
			pendingMessage: 'dashboard.contracts.actions.timelock_resolving_message',
			confirmedMessage: 'dashboard.contracts.actions.timelock_resolved_message',
			successToast: 'dashboard.contracts.actions.timelock_resolved_success',
			errorToast: 'dashboard.contracts.actions.timelock_resolved_error'
		},
		[V1EscrowStatus.DisputeUnresolved]: {
			confirmedMessage: 'dashboard.contracts.actions.timelock_resolved_message',
			successToast: 'dashboard.contracts.actions.timelock_resolved_success',
			errorToast: 'dashboard.contracts.actions.timelock_resolved_error'
		}
	},
	v2: {
		[V2EscrowStatus.PendingCompletion]: {
			pendingMessage: 'dashboard.contracts.actions.task_completing_message',
			confirmedMessage: 'dashboard.contracts.actions.task_completed_message',
			successToast: 'dashboard.contracts.actions.task_completed_success',
			errorToast: 'dashboard.contracts.actions.task_completed_error'
		},
		[V2EscrowStatus.Completed]: {
			confirmedMessage: 'dashboard.contracts.actions.task_completed_message',
			successToast: 'dashboard.contracts.actions.task_completed_success',
			errorToast: 'dashboard.contracts.actions.task_completed_error'
		},
		[V2EscrowStatus.PendingAcceptance]: {
			pendingMessage: 'dashboard.contracts.actions.task_accepting_message',
			confirmedMessage: 'dashboard.contracts.actions.payment_released_message',
			successToast: 'dashboard.contracts.actions.payment_released_success',
			errorToast: 'dashboard.contracts.actions.payment_released_error'
		},
		[V2EscrowStatus.FundsReleased]: {
			confirmedMessage: 'dashboard.contracts.actions.payment_released_message',
			successToast: 'dashboard.contracts.actions.payment_released_success',
			errorToast: 'dashboard.contracts.actions.payment_released_error'
		},
		[V2EscrowStatus.PendingDispute]: {
			pendingMessage: 'dashboard.contracts.actions.dispute_raising_message',
			confirmedMessage: 'dashboard.contracts.actions.dispute_raised_message',
			successToast: 'dashboard.contracts.actions.dispute_raised_success',
			errorToast: 'dashboard.contracts.actions.dispute_raised_error'
		},
		[V2EscrowStatus.InDispute]: {
			confirmedMessage: 'dashboard.contracts.actions.dispute_raised_message',
			successToast: 'dashboard.contracts.actions.dispute_raised_success',
			errorToast: 'dashboard.contracts.actions.dispute_raised_error'
		},
		[V2EscrowStatus.PendingResolutionProposal]: {
			pendingMessage: 'dashboard.contracts.actions.resolution_proposing_message',
			confirmedMessage: 'dashboard.contracts.actions.resolution_proposed_message',
			successToast: 'dashboard.contracts.actions.resolution_proposed_success',
			errorToast: 'dashboard.contracts.actions.resolution_proposed_error'
		},
		[V2EscrowStatus.DisputeResolutionProposed]: {
			confirmedMessage: 'dashboard.contracts.actions.resolution_proposed_message',
			successToast: 'dashboard.contracts.actions.resolution_proposed_success',
			errorToast: 'dashboard.contracts.actions.resolution_proposed_error'
		},
		[V2EscrowStatus.PendingProposalAcceptance]: {
			pendingMessage: 'dashboard.contracts.actions.proposal_accepting_message',
			confirmedMessage: 'dashboard.contracts.actions.proposal_accepted_message',
			successToast: 'dashboard.contracts.actions.proposal_accepted_success',
			errorToast: 'dashboard.contracts.actions.proposal_accepted_error'
		},
		[V2EscrowStatus.DisputeResolved]: {
			confirmedMessage: 'dashboard.contracts.actions.proposal_accepted_message',
			successToast: 'dashboard.contracts.actions.proposal_accepted_success',
			errorToast: 'dashboard.contracts.actions.proposal_accepted_error'
		},
		[V2EscrowStatus.PendingCancellation]: {
			pendingMessage: 'dashboard.contracts.actions.escrow_cancelling_message',
			confirmedMessage: 'dashboard.contracts.actions.escrow_cancelled_message',
			successToast: 'dashboard.contracts.actions.escrow_cancelled_success',
			errorToast: 'dashboard.contracts.actions.escrow_cancelled_error'
		},
		[V2EscrowStatus.Cancelled]: {
			confirmedMessage: 'dashboard.contracts.actions.escrow_cancelled_message',
			successToast: 'dashboard.contracts.actions.escrow_cancelled_success',
			errorToast: 'dashboard.contracts.actions.escrow_cancelled_error'
		},
		[V2EscrowStatus.PendingTimelockResolution]: {
			pendingMessage: 'dashboard.contracts.actions.timelock_resolving_message',
			confirmedMessage: 'dashboard.contracts.actions.timelock_resolved_message',
			successToast: 'dashboard.contracts.actions.timelock_resolved_success',
			errorToast: 'dashboard.contracts.actions.timelock_resolved_error'
		},
		[V2EscrowStatus.DisputeUnresolved]: {
			confirmedMessage: 'dashboard.contracts.actions.timelock_resolved_message',
			successToast: 'dashboard.contracts.actions.timelock_resolved_success',
			errorToast: 'dashboard.contracts.actions.timelock_resolved_error'
		},
		[V2EscrowStatus.PendingMarkWorkInProgress]: {
			pendingMessage: 'dashboard.contracts.actions.work_in_progress_marking_message',
			confirmedMessage: 'dashboard.contracts.actions.work_in_progress_marked_message',
			successToast: 'dashboard.contracts.actions.work_in_progress_marked_success',
			errorToast: 'dashboard.contracts.actions.work_in_progress_error'
		},
		[V2EscrowStatus.WorkInProgress]: {
			confirmedMessage: 'dashboard.contracts.actions.work_in_progress_marked_message',
			successToast: 'dashboard.contracts.actions.work_in_progress_marked_success',
			errorToast: 'dashboard.contracts.actions.work_in_progress_error'
		},
		[V2EscrowStatus.PendingMarkNoShow]: {
			pendingMessage: 'dashboard.contracts.actions.no_show_marking_message',
			confirmedMessage: 'dashboard.contracts.actions.no_show_marked_message',
			successToast: 'dashboard.contracts.actions.no_show_marked_success',
			errorToast: 'dashboard.contracts.actions.no_show_marked_error'
		},
		[V2EscrowStatus.NoShow]: {
			confirmedMessage: 'dashboard.contracts.actions.no_show_marked_message',
			successToast: 'dashboard.contracts.actions.no_show_marked_success',
			errorToast: 'dashboard.contracts.actions.no_show_marked_error'
		},
		[V2EscrowStatus.PendingClaimNoShowRefund]: {
			pendingMessage: 'dashboard.contracts.actions.no_show_refund_claiming_message',
			confirmedMessage: 'dashboard.contracts.actions.no_show_refund_claimed_message',
			successToast: 'dashboard.contracts.actions.no_show_refund_claimed_success',
			errorToast: 'dashboard.contracts.actions.no_show_refund_error'
		},
		[V2EscrowStatus.Refunded]: {
			confirmedMessage: 'dashboard.contracts.actions.no_show_refund_claimed_message',
			successToast: 'dashboard.contracts.actions.no_show_refund_claimed_success',
			errorToast: 'dashboard.contracts.actions.no_show_refund_error'
		},
		[V2EscrowStatus.PendingClaimUpfrontDeposit]: {
			pendingMessage: 'dashboard.contracts.actions.upfront_deposit_claiming_message',
			confirmedMessage: 'dashboard.contracts.actions.upfront_deposit_claimed_message',
			successToast: 'dashboard.contracts.actions.upfront_deposit_claimed_success',
			errorToast: 'dashboard.contracts.actions.upfront_deposit_error'
		},
		[V2EscrowStatus.FundsClaimed]: {
			confirmedMessage: 'dashboard.contracts.actions.upfront_deposit_claimed_message',
			successToast: 'dashboard.contracts.actions.upfront_deposit_claimed_success',
			errorToast: 'dashboard.contracts.actions.upfront_deposit_error'
		}
	}
};

const statusTranslationKeysByVersion: Record<EscrowVersion, Partial<Record<number, string>>> = {
	v1: {
		[V1EscrowStatus.Funded]: 'dashboard.contracts.status.funded',
		[V1EscrowStatus.InDispute]: 'dashboard.contracts.status.in_dispute',
		[V1EscrowStatus.DisputeResolved]: 'dashboard.contracts.status.dispute_resolved',
		[V1EscrowStatus.DisputeUnresolved]: 'dashboard.contracts.status.dispute_unresolved',
		[V1EscrowStatus.Completed]: 'dashboard.contracts.status.completed',
		[V1EscrowStatus.Cancelled]: 'dashboard.contracts.status.cancelled',
		[V1EscrowStatus.PendingFunding]: 'dashboard.contracts.status.pending_funding',
		[V1EscrowStatus.InProgress]: 'dashboard.contracts.status.in_progress',
		[V1EscrowStatus.PendingCompletion]: 'dashboard.contracts.status.pending_completion',
		[V1EscrowStatus.PendingCancellation]: 'dashboard.contracts.status.pending_cancellation',
		[V1EscrowStatus.FundsReleased]: 'dashboard.contracts.status.funds_released',
		[V1EscrowStatus.PendingAcceptance]: 'dashboard.contracts.status.pending_acceptance',
		[V1EscrowStatus.DisputeResolutionProposed]:
			'dashboard.contracts.status.dispute_resolution_proposed',
		[V1EscrowStatus.PendingDispute]: 'dashboard.contracts.status.pending_dispute',
		[V1EscrowStatus.PendingResolutionProposal]:
			'dashboard.contracts.status.pending_resolution_proposal',
		[V1EscrowStatus.PendingProposalAcceptance]:
			'dashboard.contracts.status.pending_proposal_acceptance',
		[V1EscrowStatus.PendingTimelockResolution]:
			'dashboard.contracts.status.pending_timelock_resolution'
	},
	v2: {
		[V2EscrowStatus.Funded]: 'dashboard.contracts.status.funded',
		[V2EscrowStatus.InDispute]: 'dashboard.contracts.status.in_dispute',
		[V2EscrowStatus.DisputeResolved]: 'dashboard.contracts.status.dispute_resolved',
		[V2EscrowStatus.DisputeUnresolved]: 'dashboard.contracts.status.dispute_unresolved',
		[V2EscrowStatus.Completed]: 'dashboard.contracts.status.completed',
		[V2EscrowStatus.Cancelled]: 'dashboard.contracts.status.cancelled',
		[V2EscrowStatus.Refunded]: 'dashboard.contracts.status.refunded',
		[V2EscrowStatus.FundsReleased]: 'dashboard.contracts.status.funds_released',
		[V2EscrowStatus.FundsClaimed]: 'dashboard.contracts.status.funds_claimed',
		[V2EscrowStatus.NoShow]: 'dashboard.contracts.status.no_show',
		[V2EscrowStatus.WorkInProgress]: 'dashboard.contracts.status.work_in_progress',
		[V2EscrowStatus.PendingFunding]: 'dashboard.contracts.status.pending_funding',
		[V2EscrowStatus.PendingCompletion]: 'dashboard.contracts.status.pending_completion',
		[V2EscrowStatus.PendingCancellation]: 'dashboard.contracts.status.pending_cancellation',
		[V2EscrowStatus.PendingAcceptance]: 'dashboard.contracts.status.pending_acceptance',
		[V2EscrowStatus.PendingDispute]: 'dashboard.contracts.status.pending_dispute',
		[V2EscrowStatus.PendingResolutionProposal]:
			'dashboard.contracts.status.pending_resolution_proposal',
		[V2EscrowStatus.PendingProposalAcceptance]:
			'dashboard.contracts.status.pending_proposal_acceptance',
		[V2EscrowStatus.PendingTimelockResolution]:
			'dashboard.contracts.status.pending_timelock_resolution',
		[V2EscrowStatus.PendingMarkWorkInProgress]:
			'dashboard.contracts.status.pending_mark_work_in_progress',
		[V2EscrowStatus.PendingMarkNoShow]: 'dashboard.contracts.status.pending_mark_no_show',
		[V2EscrowStatus.PendingClaimNoShowRefund]:
			'dashboard.contracts.status.pending_claim_no_show_refund',
		[V2EscrowStatus.PendingClaimUpfrontDeposit]:
			'dashboard.contracts.status.pending_claim_upfront_deposit',
		[V2EscrowStatus.DisputeResolutionProposed]:
			'dashboard.contracts.status.dispute_resolution_proposed'
	}
};

const statusColorClassByVersion: Record<EscrowVersion, Partial<Record<number, string>>> = {
	v1: {
		[V1EscrowStatus.InProgress]: 'badge-primary',
		[V1EscrowStatus.PendingFunding]: 'badge-primary',
		[V1EscrowStatus.Completed]: 'badge-success',
		[V1EscrowStatus.FundsReleased]: 'badge-success',
		[V1EscrowStatus.DisputeResolved]: 'badge-success',
		[V1EscrowStatus.Funded]: 'badge-info',
		[V1EscrowStatus.PendingCompletion]: 'badge-info',
		[V1EscrowStatus.PendingAcceptance]: 'badge-info',
		[V1EscrowStatus.DisputeUnresolved]: 'badge-info',
		[V1EscrowStatus.PendingProposalAcceptance]: 'badge-info',
		[V1EscrowStatus.PendingTimelockResolution]: 'badge-info',
		[V1EscrowStatus.InDispute]: 'badge-warning',
		[V1EscrowStatus.PendingDispute]: 'badge-warning',
		[V1EscrowStatus.DisputeResolutionProposed]: 'badge-warning',
		[V1EscrowStatus.PendingResolutionProposal]: 'badge-warning',
		[V1EscrowStatus.Cancelled]: 'badge-error',
		[V1EscrowStatus.PendingCancellation]: 'badge-error'
	},
	v2: {
		[V2EscrowStatus.PendingFunding]: 'badge-primary',
		[V2EscrowStatus.Completed]: 'badge-success',
		[V2EscrowStatus.FundsReleased]: 'badge-success',
		[V2EscrowStatus.DisputeResolved]: 'badge-success',
		[V2EscrowStatus.WorkInProgress]: 'badge-success',
		[V2EscrowStatus.Funded]: 'badge-info',
		[V2EscrowStatus.PendingCompletion]: 'badge-info',
		[V2EscrowStatus.PendingAcceptance]: 'badge-info',
		[V2EscrowStatus.DisputeUnresolved]: 'badge-info',
		[V2EscrowStatus.PendingProposalAcceptance]: 'badge-info',
		[V2EscrowStatus.PendingTimelockResolution]: 'badge-info',
		[V2EscrowStatus.PendingMarkWorkInProgress]: 'badge-info',
		[V2EscrowStatus.PendingMarkNoShow]: 'badge-info',
		[V2EscrowStatus.PendingClaimNoShowRefund]: 'badge-info',
		[V2EscrowStatus.PendingClaimUpfrontDeposit]: 'badge-info',
		[V2EscrowStatus.InDispute]: 'badge-warning',
		[V2EscrowStatus.PendingDispute]: 'badge-warning',
		[V2EscrowStatus.DisputeResolutionProposed]: 'badge-warning',
		[V2EscrowStatus.PendingResolutionProposal]: 'badge-warning',
		[V2EscrowStatus.NoShow]: 'badge-warning',
		[V2EscrowStatus.Cancelled]: 'badge-error',
		[V2EscrowStatus.PendingCancellation]: 'badge-error',
		[V2EscrowStatus.Refunded]: 'badge-error',
		[V2EscrowStatus.FundsClaimed]: 'badge-error'
	}
};

const actionDescriptionByVersion: Record<EscrowVersion, Partial<Record<number, string>>> = {
	v1: {
		[V1EscrowStatus.Completed]: 'dashboard.contracts.status.task_completed',
		[V1EscrowStatus.PendingCompletion]: 'dashboard.contracts.status.pending_completion',
		[V1EscrowStatus.FundsReleased]: 'dashboard.contracts.status.funds_released',
		[V1EscrowStatus.PendingAcceptance]: 'dashboard.contracts.status.pending_acceptance',
		[V1EscrowStatus.InDispute]: 'dashboard.contracts.status.dispute_raised',
		[V1EscrowStatus.PendingDispute]: 'dashboard.contracts.status.pending_dispute',
		[V1EscrowStatus.DisputeResolutionProposed]: 'dashboard.contracts.status.resolution_proposed',
		[V1EscrowStatus.DisputeResolved]: 'dashboard.contracts.status.proposal_accepted',
		[V1EscrowStatus.Cancelled]: 'dashboard.contracts.status.escrow_cancelled',
		[V1EscrowStatus.PendingCancellation]: 'dashboard.contracts.status.pending_cancellation',
		[V1EscrowStatus.DisputeUnresolved]: 'dashboard.contracts.status.timelock_resolved',
		[V1EscrowStatus.PendingResolutionProposal]:
			'dashboard.contracts.status.pending_resolution_proposal',
		[V1EscrowStatus.PendingProposalAcceptance]:
			'dashboard.contracts.status.pending_proposal_acceptance',
		[V1EscrowStatus.PendingTimelockResolution]:
			'dashboard.contracts.status.pending_timelock_resolution',
		[V1EscrowStatus.InProgress]: 'dashboard.contracts.status.in_progress'
	},
	v2: {
		[V2EscrowStatus.Completed]: 'dashboard.contracts.status.task_completed',
		[V2EscrowStatus.PendingCompletion]: 'dashboard.contracts.status.pending_completion',
		[V2EscrowStatus.FundsReleased]: 'dashboard.contracts.status.funds_released',
		[V2EscrowStatus.PendingAcceptance]: 'dashboard.contracts.status.pending_acceptance',
		[V2EscrowStatus.InDispute]: 'dashboard.contracts.status.dispute_raised',
		[V2EscrowStatus.PendingDispute]: 'dashboard.contracts.status.pending_dispute',
		[V2EscrowStatus.DisputeResolutionProposed]: 'dashboard.contracts.status.resolution_proposed',
		[V2EscrowStatus.DisputeResolved]: 'dashboard.contracts.status.proposal_accepted',
		[V2EscrowStatus.Cancelled]: 'dashboard.contracts.status.escrow_cancelled',
		[V2EscrowStatus.PendingCancellation]: 'dashboard.contracts.status.pending_cancellation',
		[V2EscrowStatus.DisputeUnresolved]: 'dashboard.contracts.status.timelock_resolved',
		[V2EscrowStatus.PendingResolutionProposal]:
			'dashboard.contracts.status.pending_resolution_proposal',
		[V2EscrowStatus.PendingProposalAcceptance]:
			'dashboard.contracts.status.pending_proposal_acceptance',
		[V2EscrowStatus.PendingTimelockResolution]:
			'dashboard.contracts.status.pending_timelock_resolution',
		[V2EscrowStatus.WorkInProgress]: 'dashboard.contracts.status.work_in_progress',
		[V2EscrowStatus.NoShow]: 'dashboard.contracts.status.no_show',
		[V2EscrowStatus.Refunded]: 'dashboard.contracts.status.refunded',
		[V2EscrowStatus.FundsClaimed]: 'dashboard.contracts.status.funds_claimed'
	}
};

/**
 * Get messages for a given escrow status
 * Returns translation keys for pending, confirmed, success, and error states
 */
export function getStatusMessages(status: ContractEscrowStatus, version?: string): StatusMessages {
	const resolvedVersion = normalizeVersion(version);
	return statusMessagesByVersion[resolvedVersion][Number(status)] ?? unknownStatusMessages;
}

/**
 * Get translation key for contract status
 * Maps EscrowStatus enum values to translation keys
 */
export function getStatusTranslationKey(status: ContractEscrowStatus, version?: string): string {
	const resolvedVersion = normalizeVersion(version);
	const translationKey = statusTranslationKeysByVersion[resolvedVersion][Number(status)];
	if (!translationKey) {
		d.warn('Unknown status translation key', { status, version: resolvedVersion });
		return 'dashboard.contracts.status.funded';
	}
	return translationKey;
}

/**
 * Get CSS color class for contract status badge
 */
export function getStatusColorClass(status: ContractEscrowStatus, version?: string): string {
	const resolvedVersion = normalizeVersion(version);
	return statusColorClassByVersion[resolvedVersion][Number(status)] ?? 'badge-neutral';
}

/**
 * Get action description for contract status
 */
export function getActionDescription(action: ContractEscrowStatus, version?: string): string {
	const resolvedVersion = normalizeVersion(version);
	return actionDescriptionByVersion[resolvedVersion][Number(action)] ?? action?.toString();
}
