import { ndk } from '$lib/nostr/ndk';
import { createDebug } from '$lib/utils/debug';
import { publishTaskCompletedForEscrow } from '$lib/utils/contract/v2/creation';
import {
	acceptTask,
	cancelPaymentContract,
	completeTask,
	refundTasker
} from '$lib/utils/contract/v2/blockchainWrites';
import { loadPaymentContractDetailsV2 } from '$lib/utils/contract/v2/loadPaymentContractDetailsV2';
import {
	computePermittedActions,
	emptyPermittedActions,
	type PermittedActions
} from '$lib/utils/contract/v2/permittedActions';
import type { Attachment } from '$lib/types/task';
import { ContractStatus, type ContractChain } from '$lib/utils/contract/types';
import {
	getRuneWriteIds,
	notifyContractCounterparty,
	publishV2ContractStatus,
	runV2Preflight,
	runV2SideEffects,
	type RuneWriteIds
} from './v2WriteHelpers';
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

/** Standard post-chain pipeline: 31006, optional extra parallel jobs (e.g. kind 31000), then push. */
async function broadcastThenParallelV2Effects(
	logLabel: string,
	ids: RuneWriteIds,
	signer: NonNullable<typeof ndk.activeUser>,
	transactionHash: string,
	recipientPubkey: string,
	chainStatus: ContractStatus,
	writeMethod: string,
	push: { title: string; body: string; type: string },
	extraBetweenStatusAndPush?: ReadonlyArray<{ name: string; run: () => Promise<unknown> }>,
	completionAttachments?: Attachment[]
): Promise<void> {
	const tasks: { name: string; run: () => Promise<unknown> }[] = [
		{
			name: 'nostrContractStatus',
			run: () =>
				publishV2ContractStatus({
					signer,
					ids,
					recipientPubkey,
					transactionHash,
					chainStatus,
					writeMethod,
					completionAttachments
				})
		}
	];
	if (extraBetweenStatusAndPush?.length) {
		tasks.push(...extraBetweenStatusAndPush);
	}
	tasks.push({
		name: 'push',
		run: () =>
			notifyContractCounterparty({
				recipientPubkey,
				title: push.title,
				body: push.body,
				type: push.type
			})
	});
	await runV2SideEffects(logLabel, tasks);
}

export async function markTaskCompleteV2(
	rune: PaymentContractRuneLike,
	completionAttachmentsArg?: Attachment[]
): Promise<ContractLifecycleResult> {
	const ids = getRuneWriteIds(rune);
	const taskerPk = rune.taskerPubkey;
	if (!ids || !taskerPk) {
		d.warn('markTaskCompleteV2: missing paymentId, contract address, parent id, or tasker pubkey');
		return { ok: false };
	}

	if (!ndk.activeUser?.pubkey) {
		d.warn('markTaskCompleteV2: not signed in with Nostr');
		return { ok: false };
	}

	const preflightErr = await runV2Preflight(rune, ids, {
		isAllowed: (p) => p.canCompleteTask,
		logLabel: 'markTaskCompleteV2'
	});
	if (preflightErr) return preflightErr;

	let transactionHash: string;
	try {
		const { tx } = await completeTask(ids.paymentId, {
			contractAddress: ids.contractAddress,
			chain: 'rsk'
		});
		transactionHash = tx.hash;
	} catch (e) {
		d.error('markTaskCompleteV2: completeTask failed', e);
		return { ok: false };
	}

	const signer = ndk.activeUser;
	if (!signer) {
		d.warn('markTaskCompleteV2: signer missing after broadcast');
		return { ok: false };
	}

	const completionAttachments =
		completionAttachmentsArg !== undefined && completionAttachmentsArg.length > 0
			? completionAttachmentsArg.map((a) => ({ ...a }))
			: undefined;
	if (completionAttachments) {
		d.log('markTaskCompleteV2: publishing with completion attachments', {
			count: completionAttachments.length
		});
	}

	await broadcastThenParallelV2Effects(
		'markTaskCompleteV2',
		ids,
		signer,
		transactionHash,
		taskerPk,
		ContractStatus.Completed,
		'completeTask',
		{
			title: 'Task marked complete',
			body: `"${rune.taskTitle}" was marked complete. Open Contracts to review.`,
			type: 'contract_task_completed'
		},
		undefined,
		completionAttachments
	);

	return { ok: true, transactionHash };
}

/**
 * Tasker accepts completed work: `acceptTask` → Kind 31006 (`s` = FundsReleased) + push to taskee.
 * TODO(gasless): prefer meta-tx when available.
 */
export async function acceptTaskV2(
	rune: PaymentContractRuneLike
): Promise<ContractLifecycleResult> {
	const ids = getRuneWriteIds(rune);
	const taskeePk = rune.contract.taskeePubkey;
	if (!ids || !taskeePk) {
		d.warn('acceptTaskV2: missing paymentId, contract address, parent id, or taskee pubkey');
		return { ok: false };
	}

	if (!rune.isTasker) {
		d.warn('acceptTaskV2: viewer is not tasker');
		return { ok: false };
	}

	if (!ndk.activeUser?.pubkey) {
		d.warn('acceptTaskV2: not signed in with Nostr');
		return { ok: false };
	}

	const preflightErr = await runV2Preflight(rune, ids, {
		isAllowed: (p) => p.canAcceptTask,
		logLabel: 'acceptTaskV2'
	});
	if (preflightErr) return preflightErr;

	let transactionHash: string;
	try {
		const { tx } = await acceptTask(ids.paymentId, {
			contractAddress: ids.contractAddress,
			chain: 'rsk'
		});
		transactionHash = tx.hash;
	} catch (e) {
		d.error('acceptTaskV2: acceptTask failed', e);
		return { ok: false };
	}

	const signer = ndk.activeUser;
	if (!signer) {
		d.warn('acceptTaskV2: signer missing after broadcast');
		return { ok: false };
	}

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

	await broadcastThenParallelV2Effects(
		'acceptTaskV2',
		ids,
		signer,
		transactionHash,
		taskeePk,
		ContractStatus.FundsReleased,
		'acceptTask',
		{
			title: 'Payment released',
			body: `"${rune.taskTitle}" — payment was released. Open Contracts to review.`,
			type: 'contract_payment_released'
		},
		[{ name: 'taskPublishReplaceable', run: publishTaskCompleted }]
	);

	return { ok: true, transactionHash };
}

/**
 * Taskee refunds tasker: `refundTasker` → 31006 `s=Refunded`, push to tasker.
 * TODO(gasless): prefer meta-tx when available.
 */
export async function refundTaskerV2(
	rune: PaymentContractRuneLike
): Promise<ContractLifecycleResult> {
	const ids = getRuneWriteIds(rune);
	const taskerPk = rune.taskerPubkey;
	if (!ids || !taskerPk) {
		d.warn('refundTaskerV2: missing paymentId, contract address, parent id, or tasker pubkey');
		return { ok: false };
	}

	if (rune.isTasker) {
		d.warn('refundTaskerV2: tasker cannot call refundTasker (taskee action)');
		return { ok: false };
	}

	if (!ndk.activeUser?.pubkey) {
		d.warn('refundTaskerV2: not signed in with Nostr');
		return { ok: false };
	}

	const preflightErr = await runV2Preflight(rune, ids, {
		isAllowed: (p) => p.canRefundTasker,
		logLabel: 'refundTaskerV2'
	});
	if (preflightErr) return preflightErr;

	let transactionHash: string;
	try {
		const { tx } = await refundTasker(ids.paymentId, {
			contractAddress: ids.contractAddress,
			chain: 'rsk'
		});
		transactionHash = tx.hash;
	} catch (e) {
		d.error('refundTaskerV2: refundTasker failed', e);
		return { ok: false };
	}

	const signer = ndk.activeUser;
	if (!signer) {
		d.warn('refundTaskerV2: signer missing after broadcast');
		return { ok: false };
	}

	await broadcastThenParallelV2Effects(
		'refundTaskerV2',
		ids,
		signer,
		transactionHash,
		taskerPk,
		ContractStatus.Refunded,
		'refundTasker',
		{
			title: 'Contract refunded',
			body: `"${rune.taskTitle}" — funds were returned to you. Open Contracts to review.`,
			type: 'contract_refund_to_tasker'
		}
	);

	return { ok: true, transactionHash };
}

/**
 * Tasker or taskee cancels escrow: `cancelPaymentContract` → 31006 `s=Cancelled`, push to counterparty.
 * TODO(gasless): prefer meta-tx when available.
 */
export async function cancelPaymentContractV2(
	rune: PaymentContractRuneLike
): Promise<ContractLifecycleResult> {
	const ids = getRuneWriteIds(rune);
	const taskerPk = rune.taskerPubkey;
	const taskeePk = rune.contract.taskeePubkey;
	if (!ids || !taskerPk || !taskeePk) {
		d.warn(
			'cancelPaymentContractV2: missing paymentId, contract address, parent id, tasker, or taskee pubkey'
		);
		return { ok: false };
	}

	if (!ndk.activeUser?.pubkey) {
		d.warn('cancelPaymentContractV2: not signed in with Nostr');
		return { ok: false };
	}

	const preflightErr = await runV2Preflight(rune, ids, {
		isAllowed: (p) => p.canCancelPaymentContract,
		logLabel: 'cancelPaymentContractV2'
	});
	if (preflightErr) return preflightErr;

	let transactionHash: string;
	try {
		const { tx } = await cancelPaymentContract(ids.paymentId, {
			contractAddress: ids.contractAddress,
			chain: 'rsk'
		});
		transactionHash = tx.hash;
	} catch (e) {
		d.error('cancelPaymentContractV2: cancelPaymentContract failed', e);
		return { ok: false };
	}

	const signer = ndk.activeUser;
	if (!signer) {
		d.warn('cancelPaymentContractV2: signer missing after broadcast');
		return { ok: false };
	}

	const counterpartyPk = rune.isTasker ? taskeePk : taskerPk;

	await broadcastThenParallelV2Effects(
		'cancelPaymentContractV2',
		ids,
		signer,
		transactionHash,
		counterpartyPk,
		ContractStatus.Cancelled,
		'cancelPaymentContract',
		{
			title: 'Contract cancelled',
			body: `"${rune.taskTitle}" — the secure payment was cancelled. Open Contracts to review.`,
			type: 'contract_payment_cancelled'
		}
	);

	return { ok: true, transactionHash };
}

export const v2Lifecycle: PaymentContractLifecycle = {
	loadPaymentContractDetails: loadPaymentContractDetailsV2ForRune,
	computePermittedActions: computePermittedActionsV2,
	markTaskComplete: markTaskCompleteV2,
	acceptTask: acceptTaskV2,
	refundTasker: refundTaskerV2,
	cancelPaymentContract: cancelPaymentContractV2,
	shouldAwaitStatusTransaction: true
};
