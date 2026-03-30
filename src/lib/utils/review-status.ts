import { EscrowStatus } from '$lib/utils/escrow/v1/escrow.enum';

export function isReviewableContractStatus(status: string | number | undefined): boolean {
	return (
		status === 'completed' ||
		status === 'resolved' ||
		status === EscrowStatus.Completed ||
		status === EscrowStatus.DisputeResolved ||
		status === EscrowStatus.FundsReleased
	);
}

export function isConfirmedReviewCompletionAction(action: string | number | undefined): boolean {
	return (
		action === 'task-completed' ||
		action === 'payment-released' ||
		action === 'dispute-resolved' ||
		action === EscrowStatus.Completed ||
		action === EscrowStatus.FundsReleased ||
		action === EscrowStatus.DisputeResolved
	);
}
