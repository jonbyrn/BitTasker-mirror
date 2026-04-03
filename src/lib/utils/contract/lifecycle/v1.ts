import { loadPaymentContractDetails as loadV1 } from '$lib/utils/contract/v1';
import type { ContractChain } from '$lib/utils/contract/types';
import {
	emptyPermittedActions,
	type PermittedActions
} from '$lib/utils/contract/v2/permittedActions';
import type {
	ContractLifecycleResult,
	PaymentContractLifecycle,
	PaymentContractRuneLike
} from './types';

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

export function computePermittedActionsV1(_rune: PaymentContractRuneLike): PermittedActions {
	return emptyPermittedActions();
}

export async function markTaskCompleteV1(
	_rune: PaymentContractRuneLike
): Promise<ContractLifecycleResult> {
	return { ok: false, errorKey: 'dashboard.contracts.actions.mark_complete_not_allowed' };
}

export async function acceptTaskV1(
	_rune: PaymentContractRuneLike
): Promise<ContractLifecycleResult> {
	return { ok: false, errorKey: 'dashboard.contracts.actions.accept_task_not_allowed' };
}

export async function refundTaskerV1(
	_rune: PaymentContractRuneLike
): Promise<ContractLifecycleResult> {
	return { ok: false, errorKey: 'dashboard.contracts.actions.refund_tasker_not_allowed' };
}

export const v1Lifecycle: PaymentContractLifecycle = {
	loadPaymentContractDetails: loadPaymentContractDetailsV1,
	computePermittedActions: computePermittedActionsV1,
	markTaskComplete: markTaskCompleteV1,
	acceptTask: acceptTaskV1,
	refundTasker: refundTaskerV1,
	shouldAwaitStatusTransaction: false
};
