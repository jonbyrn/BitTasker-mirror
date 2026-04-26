import type { NDKPaymentContract } from '$lib/nostr/events/contract';
import {
	ContractStatus,
	type ContractDisplayStatus,
	DisplayOnlyStatus
} from '$lib/utils/contract/types';

/** Dashboard status filter buckets aligned with {@link ContractDisplayStatus}. */
export type DashboardContractStatusFilter =
	| 'all'
	| 'funded'
	| 'in_progress'
	| 'completed_success'
	| 'in_dispute'
	| 'dispute_resolved'
	| 'ended_other';

/**
 * Whether a contract row should match the selected status filter.
 * Caller should only apply when the rune has finished initial status history (or use `all`).
 */
export function matchesDisplayStatusFilter(
	filter: DashboardContractStatusFilter,
	displayStatus: ContractDisplayStatus
): boolean {
	if (filter === 'all') return true;
	switch (filter) {
		case 'funded':
			return displayStatus === ContractStatus.Funded;
		case 'in_progress':
			return (
				displayStatus === DisplayOnlyStatus.InProgress ||
				displayStatus === ContractStatus.WorkInProgress
			);
		case 'completed_success':
			return (
				displayStatus === ContractStatus.Completed ||
				displayStatus === ContractStatus.FundsReleased ||
				displayStatus === ContractStatus.FundsClaimed
			);
		case 'in_dispute':
			return (
				displayStatus === ContractStatus.InDispute ||
				displayStatus === ContractStatus.InDisputeWorkInProgress ||
				displayStatus === DisplayOnlyStatus.DisputeResolutionProposed
			);
		case 'dispute_resolved':
			return displayStatus === ContractStatus.DisputeResolved;
		case 'ended_other':
			return (
				displayStatus === ContractStatus.Cancelled ||
				displayStatus === ContractStatus.Refunded ||
				displayStatus === ContractStatus.DisputeUnresolved ||
				displayStatus === ContractStatus.NoShow
			);
		default:
			return true;
	}
}

/**
 * Role filter using the same rule as {@link PaymentContractRune.isTasker} (tasker = kind 30006 author).
 */
export function matchesRoleFilter(
	contract: NDKPaymentContract,
	roleFilter: 'all' | 'client' | 'freelancer',
	mePubkey: string | undefined
): boolean {
	if (roleFilter === 'all' || !mePubkey) return true;
	const tasker = contract.taskerPubkey;
	const isTasker = !!(tasker && mePubkey === tasker);
	console.log('[matchesRoleFilter] checking:', {
		roleFilter,
		mePubkey: mePubkey.slice(0, 8),
		taskerPubkey: tasker?.slice(0, 8),
		isTasker,
		contractId: contract.id?.slice(0, 8)
	});
	if (roleFilter === 'client') return isTasker;
	return !isTasker;
}
