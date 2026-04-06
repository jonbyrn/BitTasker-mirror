import { loadPaymentContractDetails as loadV1 } from '$lib/utils/contract/v1';
import {
	computeV1PermittedActions,
	isTerminalV1ChainState
} from '$lib/utils/contract/v1/permittedActions';
import { createDebug } from '$lib/utils/debug';
import type { ContractChain } from '$lib/utils/contract/types';
import { buildDisputeProjectionForPayment } from '$lib/utils/contract/v2/disputeProjectionFromStatus';
import {
	emptyPermittedActions,
	type PermittedActions
} from '$lib/utils/contract/v2/permittedActions';
import type { Attachment } from '$lib/types/task';
import type {
	ContractLifecycleResult,
	PaymentContractLifecycle,
	PaymentContractRuneLike
} from './types';
import { permissionsNowSeconds } from './time';

const d = createDebug('contract:lifecycle:v1');

export async function loadPaymentContractDetailsV1(
	rune: PaymentContractRuneLike,
	chain: ContractChain = 'rsk'
) {
	const paymentId = rune.paymentId?.trim();
	const contractAddress = rune.contractAddress?.trim() || rune.contract.contractAddress?.trim();
	if (!paymentId || !contractAddress) {
		throw new Error('Missing paymentId or contractAddress');
	}
	return loadV1(paymentId, contractAddress, chain);
}

export function computePermittedActionsV1(rune: PaymentContractRuneLike): PermittedActions {
	const payment = rune.blockchainData;
	if (!payment) return emptyPermittedActions();
	const disputeProjection = buildDisputeProjectionForPayment(
		{
			taskerPubkey: rune.taskerPubkey,
			taskeePubkey: rune.contract.taskeePubkey,
			statusEventsByNewest: rune.statusEventsByNewest
		},
		payment.state
	);
	return computeV1PermittedActions({
		payment,
		isTasker: rune.isTasker,
		now: permissionsNowSeconds(),
		awaitingTx: rune.isPending,
		disputeProjection
	});
}

export async function markTaskCompleteV1(
	_rune: PaymentContractRuneLike,
	_completionAttachments?: Attachment[]
): Promise<ContractLifecycleResult> {
	d.warn('markTaskCompleteV1: v1 lifecycle does not support this action');
	return { ok: false };
}

export async function acceptTaskV1(
	_rune: PaymentContractRuneLike
): Promise<ContractLifecycleResult> {
	d.warn('acceptTaskV1: v1 lifecycle does not support this action');
	return { ok: false };
}

export async function refundTaskerV1(
	_rune: PaymentContractRuneLike
): Promise<ContractLifecycleResult> {
	d.warn('refundTaskerV1: v1 lifecycle does not support this action');
	return { ok: false };
}

export async function cancelPaymentContractV1(
	_rune: PaymentContractRuneLike
): Promise<ContractLifecycleResult> {
	d.warn('cancelPaymentContractV1: v1 lifecycle does not support this action');
	return { ok: false };
}

export async function markNoShowV1(
	_rune: PaymentContractRuneLike
): Promise<ContractLifecycleResult> {
	d.warn('markNoShowV1: v1 lifecycle does not support this action');
	return { ok: false };
}

export async function markWorkInProgressV1(
	_rune: PaymentContractRuneLike
): Promise<ContractLifecycleResult> {
	d.warn('markWorkInProgressV1: v1 lifecycle does not support this action');
	return { ok: false };
}

export async function claimNoShowRefundV1(
	_rune: PaymentContractRuneLike
): Promise<ContractLifecycleResult> {
	d.warn('claimNoShowRefundV1: v1 lifecycle does not support this action');
	return { ok: false };
}

export async function disputeTaskV1(
	_rune: PaymentContractRuneLike
): Promise<ContractLifecycleResult> {
	d.warn('disputeTaskV1: v1 lifecycle does not support this action');
	return { ok: false };
}

export async function proposeResolutionV1(
	_rune: PaymentContractRuneLike,
	_taskeeAmountWei: bigint
): Promise<ContractLifecycleResult> {
	d.warn('proposeResolutionV1: v1 lifecycle does not support this action');
	return { ok: false };
}

export async function acceptProposalV1(
	_rune: PaymentContractRuneLike
): Promise<ContractLifecycleResult> {
	d.warn('acceptProposalV1: v1 lifecycle does not support this action');
	return { ok: false };
}

export async function resolveAfterTimelockV1(
	_rune: PaymentContractRuneLike
): Promise<ContractLifecycleResult> {
	d.warn('resolveAfterTimelockV1: v1 lifecycle does not support this action');
	return { ok: false };
}

export const v1Lifecycle: PaymentContractLifecycle = {
	loadPaymentContractDetails: loadPaymentContractDetailsV1,
	isChainTerminalState: isTerminalV1ChainState,
	computePermittedActions: computePermittedActionsV1,
	markTaskComplete: markTaskCompleteV1,
	acceptTask: acceptTaskV1,
	refundTasker: refundTaskerV1,
	cancelPaymentContract: cancelPaymentContractV1,
	markNoShow: markNoShowV1,
	markWorkInProgress: markWorkInProgressV1,
	claimNoShowRefund: claimNoShowRefundV1,
	disputeTask: disputeTaskV1,
	proposeResolution: proposeResolutionV1,
	acceptProposal: acceptProposalV1,
	resolveAfterTimelock: resolveAfterTimelockV1
};
