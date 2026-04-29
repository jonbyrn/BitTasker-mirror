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
	| 'completed'
	| 'funds_released'
	| 'funds_claimed'
	| 'in_dispute'
	| 'dispute_resolved'
	| 'ended_other';

/** Dashboard type filter for contract context (tasks vs services). */
export type DashboardContractTypeFilter = 'all' | 'tasks' | 'services';

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
		case 'completed':
			return displayStatus === ContractStatus.Completed;
		case 'funds_released':
			return displayStatus === ContractStatus.FundsReleased;
		case 'funds_claimed':
			return displayStatus === ContractStatus.FundsClaimed;
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
	if (roleFilter === 'client') return isTasker;
	return !isTasker;
}

/**
 * Type filter for contract context (task vs service).
 * The contextType tag is stored in encrypted tags on NDKPaymentContract.
 */
export function matchesTypeFilter(
	contract: NDKPaymentContract,
	typeFilter: DashboardContractTypeFilter
): boolean {
	if (typeFilter === 'all') return true;
	const contextType = contract.tagValue('contextType') ?? 'task';
	if (typeFilter === 'tasks') {
		return contextType === 'task' || contextType === '' || contextType === undefined;
	}
	return contextType === 'service';
}
