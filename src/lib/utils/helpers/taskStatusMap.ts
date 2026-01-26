import { EscrowStatus } from '$lib/utils/escrow/v2/escrow.enum';
import { TaskStatusEnum } from '$lib/utils/enums/task.enum';

const TASK_STATUS_MAP: Partial<Record<EscrowStatus, TaskStatusEnum>> = {
	// ============================================
	// BLOCKCHAIN STATES (0-10)
	// ============================================
	[EscrowStatus.Funded]: TaskStatusEnum.ESCROW_FUNDED,
	[EscrowStatus.InDispute]: TaskStatusEnum.DISPUTED,
	[EscrowStatus.DisputeResolved]: TaskStatusEnum.REFUNDED,
	[EscrowStatus.DisputeUnresolved]: TaskStatusEnum.REFUNDED,
	[EscrowStatus.Completed]: TaskStatusEnum.COMPLETED,
	[EscrowStatus.Cancelled]: TaskStatusEnum.CANCELLED,
	[EscrowStatus.Refunded]: TaskStatusEnum.REFUNDED,
	[EscrowStatus.FundsReleased]: TaskStatusEnum.COMPLETED,
	[EscrowStatus.FundsClaimed]: TaskStatusEnum.COMPLETED,
	[EscrowStatus.NoShow]: TaskStatusEnum.IN_PROGRESS,
	[EscrowStatus.WorkInProgress]: TaskStatusEnum.IN_PROGRESS,

	// ============================================
	// PENDING STATES (100-111)
	// ============================================
	[EscrowStatus.PendingFunding]: TaskStatusEnum.ESCROW_FUNDED,
	[EscrowStatus.PendingCompletion]: TaskStatusEnum.IN_PROGRESS,
	[EscrowStatus.PendingCancellation]: TaskStatusEnum.CANCELLED,
	[EscrowStatus.PendingAcceptance]: TaskStatusEnum.COMPLETED,
	[EscrowStatus.PendingDispute]: TaskStatusEnum.DISPUTED,
	[EscrowStatus.PendingResolutionProposal]: TaskStatusEnum.DISPUTE_PROPOSAL,
	[EscrowStatus.PendingProposalAcceptance]: TaskStatusEnum.DISPUTE_PROPOSAL,
	[EscrowStatus.PendingTimelockResolution]: TaskStatusEnum.DISPUTED,
	[EscrowStatus.PendingMarkWorkInProgress]: TaskStatusEnum.IN_PROGRESS,
	[EscrowStatus.PendingMarkNoShow]: TaskStatusEnum.IN_PROGRESS,
	[EscrowStatus.PendingClaimNoShowRefund]: TaskStatusEnum.REFUNDED,
	[EscrowStatus.PendingClaimUpfrontDeposit]: TaskStatusEnum.IN_PROGRESS,

	// ============================================
	// APPLICATION STATES (112+)
	// ============================================
	[EscrowStatus.DisputeResolutionProposed]: TaskStatusEnum.DISPUTE_PROPOSAL,
};

export const mapEscrowStatusToTaskStatus = (
	status: EscrowStatus
): TaskStatusEnum | undefined => TASK_STATUS_MAP[status];

