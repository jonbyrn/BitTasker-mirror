import { loadPaymentContractDetails as loadV1 } from '$lib/utils/contract/v1';
import { createDebug } from '$lib/utils/debug';
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

export function computePermittedActionsV1(_rune: PaymentContractRuneLike): PermittedActions {
	return emptyPermittedActions();
}

export async function markTaskCompleteV1(
	_rune: PaymentContractRuneLike
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

export const v1Lifecycle: PaymentContractLifecycle = {
	loadPaymentContractDetails: loadPaymentContractDetailsV1,
	computePermittedActions: computePermittedActionsV1,
	markTaskComplete: markTaskCompleteV1,
	acceptTask: acceptTaskV1,
	refundTasker: refundTaskerV1,
	cancelPaymentContract: cancelPaymentContractV1,
	shouldAwaitStatusTransaction: false
};
