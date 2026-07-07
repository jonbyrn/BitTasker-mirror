import { ContractStatus, type ContractDisplayStatus, DisplayOnlyStatus } from '../contract/types';

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
		case DisplayOnlyStatus.Failed:
			return 'dashboard.contracts.status.failed';

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
		case DisplayOnlyStatus.Failed:
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
