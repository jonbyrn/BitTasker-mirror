/**
 * V2 contract status display: translation keys and badge colors.
 * Uses V2 EscrowStatus (0–11 blockchain, 112 Nostr). Use with contract.escrowData?.status for correct display.
 */

import { EscrowStatus } from '$lib/utils/escrow/v2/escrow.enum';

const STATUS_TO_TRANSLATION_KEY: Record<number, string> = {
	[EscrowStatus.Funded]: 'dashboard.contracts.status.funded',
	[EscrowStatus.InDispute]: 'dashboard.contracts.status.in_dispute',
	[EscrowStatus.DisputeResolved]: 'dashboard.contracts.status.dispute_resolved',
	[EscrowStatus.DisputeUnresolved]: 'dashboard.contracts.status.dispute_unresolved',
	[EscrowStatus.Completed]: 'dashboard.contracts.status.completed',
	[EscrowStatus.Cancelled]: 'dashboard.contracts.status.cancelled',
	[EscrowStatus.Refunded]: 'dashboard.contracts.status.refunded',
	[EscrowStatus.FundsReleased]: 'dashboard.contracts.status.funds_released',
	[EscrowStatus.FundsClaimed]: 'dashboard.contracts.status.funds_claimed',
	[EscrowStatus.NoShow]: 'dashboard.contracts.status.no_show',
	[EscrowStatus.WorkInProgress]: 'dashboard.contracts.status.work_in_progress',
	[EscrowStatus.InDisputeWIP]: 'dashboard.contracts.status.in_dispute_wip',
	[EscrowStatus.DisputeResolutionProposed]: 'dashboard.contracts.status.dispute_resolution_proposed'
};

const STATUS_TO_COLOR: Record<number, string> = {
	[EscrowStatus.Funded]: 'badge-info',
	[EscrowStatus.InDispute]: 'badge-warning',
	[EscrowStatus.DisputeResolved]: 'badge-success',
	[EscrowStatus.DisputeUnresolved]: 'badge-info',
	[EscrowStatus.Completed]: 'badge-success',
	[EscrowStatus.Cancelled]: 'badge-error',
	[EscrowStatus.Refunded]: 'badge-info',
	[EscrowStatus.FundsReleased]: 'badge-success',
	[EscrowStatus.FundsClaimed]: 'badge-success',
	[EscrowStatus.NoShow]: 'badge-warning',
	[EscrowStatus.WorkInProgress]: 'badge-primary',
	[EscrowStatus.InDisputeWIP]: 'badge-warning',
	[EscrowStatus.DisputeResolutionProposed]: 'badge-warning'
};

/** Pending funding: no escrowData yet, show as pending (v2 CONTRACT published, tx not confirmed). */
const PENDING_FUNDING_KEY = 'dashboard.contracts.status.pending_funding';
const PENDING_FUNDING_COLOR = 'badge-primary';

/**
 * Get translation key for V2 contract status (blockchain state 0–11 or Nostr 112).
 * Use raw escrowData.status from chain; falls back to pending_funding when status is unknown.
 */
export function getStatusTranslationKeyV2(status: number | undefined): string {
	if (status === undefined || status === null) return PENDING_FUNDING_KEY;
	return STATUS_TO_TRANSLATION_KEY[status] ?? 'dashboard.contracts.status.funded';
}

/**
 * Get badge color class for V2 contract status.
 */
export function getStatusColorClassV2(status: number | undefined): string {
	if (status === undefined || status === null) return PENDING_FUNDING_COLOR;
	return STATUS_TO_COLOR[status] ?? 'badge-neutral';
}
