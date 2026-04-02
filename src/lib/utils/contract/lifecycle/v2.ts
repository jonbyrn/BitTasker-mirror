import { nip19 } from 'nostr-tools';
import { pushNotificationService } from '$lib/api/services/push-notification.service';
import { NDKContractStatus } from '$lib/nostr/events/contractStatus';
import { ndk } from '$lib/nostr/ndk';
import { createDebug } from '$lib/utils/debug';
import { runParallelNamed } from '$lib/utils/contract/parallelEffects';
import { publishTaskCompletedForEscrow } from '$lib/utils/contract/v2/creation';
import { acceptTask, completeTask } from '$lib/utils/contract/v2/blockchainWrites';
import { loadPaymentContractDetailsV2 } from '$lib/utils/contract/v2/loadPaymentContractDetailsV2';
import {
	computePermittedActions,
	emptyPermittedActions,
	type PermittedActions
} from '$lib/utils/contract/v2/permittedActions';
import { ContractStatus, type ContractChain } from '$lib/utils/contract/types';
import type {
	ContractLifecycleResult,
	PaymentContractLifecycle,
	PaymentContractRuneLike
} from './types';
import { permissionsNowSeconds } from './time';

const d = createDebug('contract:lifecycle:v2');

export async function loadPaymentContractDetailsV2ForRune(
	rune: PaymentContractRuneLike,
	chain: ContractChain = 'rsk'
) {
	const paymentId = rune.paymentId?.trim();
	const contractAddress = rune.contractAddress?.trim() || rune.contract.contractAddress?.trim();
	if (!paymentId || !contractAddress) {
		throw new Error('Missing paymentId or contractAddress');
	}
	return loadPaymentContractDetailsV2(paymentId, contractAddress, chain);
}

export function computePermittedActionsV2(rune: PaymentContractRuneLike): PermittedActions {
	const payment = rune.blockchainData;
	if (!payment) return emptyPermittedActions();
	return computePermittedActions({
		payment,
		isTasker: rune.isTasker,
		now: permissionsNowSeconds(),
		awaitingTx: rune.isPending
	});
}

export async function markTaskCompleteV2(
	rune: PaymentContractRuneLike
): Promise<ContractLifecycleResult> {
	const paymentId = rune.paymentId?.trim();
	const contractAddress = rune.contractAddress?.trim() || rune.contract.contractAddress?.trim();
	const taskerPk = rune.taskerPubkey;
	const parentId = rune.parentEventId;

	if (!paymentId || !contractAddress || !taskerPk || !parentId) {
		return { ok: false, errorKey: 'dashboard.contracts.actions.mark_complete_missing_context' };
	}

	if (!ndk.activeUser?.pubkey) {
		return { ok: false, errorKey: 'dashboard.contracts.actions.mark_complete_not_signed_in' };
	}

	try {
		const payment = await loadPaymentContractDetailsV2(paymentId, contractAddress, 'rsk');
		const perms = computePermittedActions({
			payment,
			isTasker: rune.isTasker,
			now: permissionsNowSeconds(),
			awaitingTx: false
		});
		if (!perms.canCompleteTask) {
			return { ok: false, errorKey: 'dashboard.contracts.actions.mark_complete_not_allowed' };
		}
	} catch (e) {
		d.error('markTaskCompleteV2: preflight failed', e);
		return { ok: false, errorKey: 'dashboard.contracts.actions.mark_complete_preflight_failed' };
	}

	let transactionHash: string;
	try {
		const { tx } = await completeTask(paymentId, { contractAddress, chain: 'rsk' });
		transactionHash = tx.hash;
	} catch (e) {
		d.error('markTaskCompleteV2: completeTask failed', e);
		return { ok: false, errorKey: 'dashboard.contracts.actions.task_completed_error' };
	}

	const signer = ndk.activeUser;
	if (!signer) {
		return { ok: false, errorKey: 'dashboard.contracts.actions.mark_complete_not_signed_in' };
	}

	const publishStatus = async () => {
		const status = new NDKContractStatus(ndk);
		status.author = signer;
		status.paymentId = paymentId;
		status.parentContractEventId = parentId;
		status.recipientPubkey = taskerPk;
		status.version = 'v2';
		status.messageType = 'contract-status';
		status.action = ContractStatus.Completed;
		status.transactionHash = transactionHash;
		status.tags.push(['writeMethod', 'completeTask']);
		await status.publish();
	};

	const taskerNpub = nip19.npubEncode(taskerPk);

	const push = async () => {
		await pushNotificationService.sendNotificationToNpubs({
			npubs: [taskerNpub],
			title: 'Task marked complete',
			body: `"${rune.taskTitle}" was marked complete. Open Contracts to review.`,
			type: 'contract_task_completed',
			clickAction: `${import.meta.env.VITE_CLIENT_URL}/dashboard?tab=contracts`,
			icon: 'https://bittasker.com/images/Logos/BitTasker-square-logo.svg'
		});
	};

	const { failures } = await runParallelNamed([
		{ name: 'nostrContractStatus', run: publishStatus },
		{ name: 'push', run: push }
	]);
	if (failures.length > 0) {
		d.warn('markTaskCompleteV2: side effects had failures', failures);
	}

	return { ok: true, transactionHash };
}

/**
 * Tasker accepts completed work: `acceptTask` → Kind 31006 (`s` = FundsReleased) + push to taskee.
 * TODO(gasless): prefer meta-tx when available.
 */
export async function acceptTaskV2(
	rune: PaymentContractRuneLike
): Promise<ContractLifecycleResult> {
	const paymentId = rune.paymentId?.trim();
	const contractAddress = rune.contractAddress?.trim() || rune.contract.contractAddress?.trim();
	const parentId = rune.parentEventId;
	const taskeePk = rune.contract.taskeePubkey;

	if (!paymentId || !contractAddress || !parentId || !taskeePk) {
		return { ok: false, errorKey: 'dashboard.contracts.actions.accept_task_missing_context' };
	}

	if (!rune.isTasker) {
		return { ok: false, errorKey: 'dashboard.contracts.actions.accept_task_not_allowed' };
	}

	if (!ndk.activeUser?.pubkey) {
		return { ok: false, errorKey: 'dashboard.contracts.actions.accept_task_not_signed_in' };
	}

	try {
		const payment = await loadPaymentContractDetailsV2(paymentId, contractAddress, 'rsk');
		const perms = computePermittedActions({
			payment,
			isTasker: rune.isTasker,
			now: permissionsNowSeconds(),
			awaitingTx: false
		});
		if (!perms.canAcceptTask) {
			return { ok: false, errorKey: 'dashboard.contracts.actions.accept_task_not_allowed' };
		}
	} catch (e) {
		d.error('acceptTaskV2: preflight failed', e);
		return { ok: false, errorKey: 'dashboard.contracts.actions.accept_task_preflight_failed' };
	}

	let transactionHash: string;
	try {
		const { tx } = await acceptTask(paymentId, { contractAddress, chain: 'rsk' });
		transactionHash = tx.hash;
	} catch (e) {
		d.error('acceptTaskV2: acceptTask failed', e);
		return { ok: false, errorKey: 'dashboard.contracts.actions.payment_released_error' };
	}

	const signer = ndk.activeUser;
	if (!signer) {
		return { ok: false, errorKey: 'dashboard.contracts.actions.accept_task_not_signed_in' };
	}

	const publishStatus = async () => {
		const status = new NDKContractStatus(ndk);
		status.author = signer;
		status.paymentId = paymentId;
		status.parentContractEventId = parentId;
		status.recipientPubkey = taskeePk;
		status.version = 'v2';
		status.messageType = 'contract-status';
		status.status = ContractStatus.FundsReleased;
		status.transactionHash = transactionHash;
		status.tags.push(['writeMethod', 'acceptTask']);
		await status.publish();
	};

	const taskeeNpub = nip19.npubEncode(taskeePk);

	const push = async () => {
		await pushNotificationService.sendNotificationToNpubs({
			npubs: [taskeeNpub],
			title: 'Payment released',
			body: `"${rune.taskTitle}" — payment was released. Open Contracts to review.`,
			type: 'contract_payment_released',
			clickAction: `${import.meta.env.VITE_CLIENT_URL}/dashboard?tab=contracts`,
			icon: 'https://bittasker.com/images/Logos/BitTasker-square-logo.svg'
		});
	};

	const publishTaskCompleted = async () => {
		if (!rune.task) {
			d.warn('acceptTaskV2: task event not loaded; skip kind 31000 COMPLETED replaceable');
			return;
		}
		try {
			await publishTaskCompletedForEscrow(rune.task);
		} catch (e) {
			d.warn('acceptTaskV2: publishTaskCompletedForEscrow failed', e);
		}
	};

	const { failures } = await runParallelNamed([
		{ name: 'nostrContractStatus', run: publishStatus },
		{ name: 'taskPublishReplaceable', run: publishTaskCompleted },
		{ name: 'push', run: push }
	]);
	if (failures.length > 0) {
		d.warn('acceptTaskV2: side effects had failures', failures);
	}

	return { ok: true, transactionHash };
}

export const v2Lifecycle: PaymentContractLifecycle = {
	loadPaymentContractDetails: loadPaymentContractDetailsV2ForRune,
	computePermittedActions: computePermittedActionsV2,
	markTaskComplete: markTaskCompleteV2,
	acceptTask: acceptTaskV2,
	shouldAwaitStatusTransaction: true
};
