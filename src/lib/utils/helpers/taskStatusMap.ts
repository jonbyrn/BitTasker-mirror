import { EscrowStatus } from '$lib/utils/enums/escrow.enum';
import { TaskStatusEnum } from '$lib/utils/enums/task.enum';

const TASK_STATUS_MAP: Partial<Record<EscrowStatus, TaskStatusEnum>> = {
	[EscrowStatus.Funded]: TaskStatusEnum.ESCROW_FUNDED,
	[EscrowStatus.InProgress]: TaskStatusEnum.IN_PROGRESS,
	[EscrowStatus.PendingCompletion]: TaskStatusEnum.IN_PROGRESS,
	[EscrowStatus.Completed]: TaskStatusEnum.COMPLETED,
	[EscrowStatus.PendingAcceptance]: TaskStatusEnum.COMPLETED,
	[EscrowStatus.FundsReleased]: TaskStatusEnum.COMPLETED,
	[EscrowStatus.PendingDispute]: TaskStatusEnum.DISPUTED,
	[EscrowStatus.InDispute]: TaskStatusEnum.DISPUTED,
	[EscrowStatus.DisputeResolutionProposed]: TaskStatusEnum.DISPUTE_PROPOSAL,
	[EscrowStatus.DisputeResolved]: TaskStatusEnum.REFUNDED,
	[EscrowStatus.DisputeUnresolved]: TaskStatusEnum.REFUNDED,
	[EscrowStatus.PendingCancellation]: TaskStatusEnum.CANCELLED,
	[EscrowStatus.Cancelled]: TaskStatusEnum.CANCELLED
};

export const mapEscrowStatusToTaskStatus = (
	status: EscrowStatus
): TaskStatusEnum | undefined => TASK_STATUS_MAP[status];

