import { TaskStatusEnum } from '../enums/task.enum';

/**
 * Get status badge color and text for a task status
 * @param status - The task status enum value
 * @returns Object with color class and text for the badge
 */
export function getStatusBadge(status: TaskStatusEnum | string): { color: string; text: string } {
	if (status === 'EXPIRED') return { color: 'badge-warning', text: 'EXPIRED' };
	switch (status) {
		case TaskStatusEnum.OPEN:
			return { color: 'badge-success', text: 'OPEN' };
		case TaskStatusEnum.BID_ACCEPTED:
			return { color: 'badge-info', text: 'BID ACCEPTED' };
		case TaskStatusEnum.ESCROW_FUNDED:
			return { color: 'badge-info', text: 'ESCROW FUNDED' };
		case TaskStatusEnum.IN_PROGRESS:
			return { color: 'badge-warning', text: 'IN PROGRESS' };
		case TaskStatusEnum.RESCOPED:
			return { color: 'badge-warning', text: 'RESCOPED' };
		case TaskStatusEnum.RESCOPE_ACCEPTED:
			return { color: 'badge-info', text: 'RESCOPE ACCEPTED' };
		case TaskStatusEnum.COMPLETED:
			return { color: 'badge-success', text: 'COMPLETED' };
		case TaskStatusEnum.CANCELLED:
			return { color: 'badge-error', text: 'CANCELLED' };
		case TaskStatusEnum.REFUNDED:
			return { color: 'badge-error', text: 'REFUNDED' };
		case TaskStatusEnum.DISPUTED:
			return { color: 'badge-error', text: 'DISPUTED' };
		case TaskStatusEnum.DISPUTE_PROPOSAL:
			return { color: 'badge-warning', text: 'DISPUTE PROPOSAL' };
		default:
			return { color: 'badge-neutral', text: status };
	}
}
