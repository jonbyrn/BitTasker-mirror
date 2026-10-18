/** Status tabs for RGB contracts, aligned with the production dashboard buckets. */

export type ContractListTab = 'all' | 'funded' | 'in_progress' | 'paid' | 'ended' | 'dispute';

export const CONTRACT_LIST_TABS: readonly { id: ContractListTab; label: string }[] = [
	{ id: 'all', label: 'dashboard.contracts.all_statuses' },
	{ id: 'funded', label: 'dashboard.contracts.status.funded' },
	{ id: 'in_progress', label: 'dashboard.contracts.status.in_progress' },
	{ id: 'paid', label: 'dashboard.contracts.filter_paid' },
	{ id: 'ended', label: 'dashboard.contracts.filter_ended' },
	{ id: 'dispute', label: 'dashboard.contracts.status.in_dispute' }
];

const CONTRACT_IDS = /^contract-([0-9a-f]{64})-([0-9a-f]{64})$/i;

/** Task event id stored in `contract-{taskId}-{bidId}`. */
export function contractTaskId(contractId: string): string | null {
	return CONTRACT_IDS.exec(contractId.trim())?.[1] ?? null;
}

/** Bid event id stored in `contract-{taskId}-{bidId}`. */
export function contractBidId(contractId: string): string | null {
	return CONTRACT_IDS.exec(contractId.trim())?.[2] ?? null;
}

/** Production files a released escrow under Paid, not Completed. */
export function contractStatusTab(status: string): Exclude<ContractListTab, 'all'> | 'other' {
	switch (status) {
		case 'funded':
		case 'locked':
		case 'funding':
			return 'funded';
		case 'work_in_progress':
		case 'work_submitted':
		case 'approved':
		case 'settlement_requested':
		case 'releasing':
		case 'released_pending':
			return 'in_progress';
		case 'released':
		case 'settled':
			return 'paid';
		case 'cancelled':
		case 'refunded':
		case 'failed':
			return 'ended';
		case 'disputed':
			return 'dispute';
		default:
			return 'other';
	}
}

export function contractStatusKey(status: string): string {
	if (status === 'refunded') return 'dashboard.contracts.status.refunded';
	if (status === 'releasing') return 'dashboard.contracts.status.releasing';
	if (status === 'settlement_requested') {
		return 'dashboard.contracts.status.pending_completion';
	}
	switch (contractStatusTab(status)) {
		case 'paid':
			return 'dashboard.contracts.status.funds_released';
		case 'funded':
			return 'dashboard.contracts.status.funded';
		case 'in_progress':
			return 'dashboard.contracts.status.in_progress';
		case 'ended':
			return 'dashboard.contracts.status.cancelled';
		case 'dispute':
			return 'dashboard.contracts.status.in_dispute';
		default:
			return 'dashboard.contracts.status.pending_funding';
	}
}

export function contractBadgeClass(status: string): string {
	switch (contractStatusTab(status)) {
		case 'funded':
			return 'badge-warning';
		case 'in_progress':
			return 'badge-info';
		case 'paid':
			return 'badge-success';
		case 'ended':
		case 'dispute':
			return 'badge-error';
		default:
			return 'badge-outline';
	}
}
