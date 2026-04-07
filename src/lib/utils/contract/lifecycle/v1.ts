/**
 * V1 EscrowContract lifecycle: direct chain writes (`v1/blockchainWrites`) + v2-shaped Kind 31006 + push.
 *
 * **Wired:** `markTaskComplete`, `acceptTask`, `refundTasker`, `cancelPaymentContract`, `disputeTask`,
 * `proposeResolution`, `acceptProposal`, `resolveAfterTimelock`.
 *
 * **Not on v1 chain (stubs):** `markNoShow`, `markWorkInProgress`, `claimNoShowRefund`.
 */
import { ethers } from 'ethers';
import { ndk } from '$lib/nostr/ndk';
import { createDebug } from '$lib/utils/debug';
import { getProvider } from '$lib/utils/contract';
import { loadPaymentContractDetails } from '$lib/utils/contract/v1';
import { calculateV1BaseAmountWei } from '$lib/utils/contract/v1/calculateBaseAmount';
import {
	acceptProposal,
	acceptTask,
	cancelPaymentContract,
	completeTask,
	disputeTask,
	proposeResolution,
	refundTasker,
	resolveAfterTimelock
} from '$lib/utils/contract/v1/blockchainWrites';
import {
	computeV1PermittedActions,
	isTerminalV1ChainState
} from '$lib/utils/contract/v1/permittedActions';
import { buildDisputeProjectionForPayment } from '$lib/utils/contract/v2/disputeProjectionFromStatus';
import {
	emptyPermittedActions,
	type PermittedActions
} from '$lib/utils/contract/v2/permittedActions';
import { publishTaskCompletedForEscrow } from '$lib/utils/contract/v2/creation';
import type { ContractChain, SecurePaymentLegacy } from '$lib/utils/contract/types';
import { ContractStatus } from '$lib/utils/contract/types';
import type { Attachment } from '$lib/types/task';
import { runV1Preflight } from './v1Preflight';
import { broadcastThenParallelEffects, getRuneWriteIds, type RuneWriteIds } from './writeHelpers';
import type {
	ContractLifecycleResult,
	PaymentContractLifecycle,
	PaymentContractRuneLike
} from './types';
import { permissionsNowSeconds } from './time';

const d = createDebug('contract:lifecycle:v1');

const writeOpts = (ids: RuneWriteIds) => ({
	contractAddress: ids.contractAddress,
	chain: 'rsk' as const
});

export async function loadPaymentContractDetailsV1(
	rune: PaymentContractRuneLike,
	chain: ContractChain = 'rsk'
) {
	const paymentId = rune.paymentId?.trim();
	const contractAddress = rune.contractAddress?.trim() || rune.contract.contractAddress?.trim();
	if (!paymentId || !contractAddress) {
		throw new Error('Missing paymentId or contractAddress');
	}
	return loadPaymentContractDetails(paymentId, contractAddress, chain);
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
	rune: PaymentContractRuneLike,
	completionAttachmentsArg?: Attachment[]
): Promise<ContractLifecycleResult> {
	const ids = getRuneWriteIds(rune);
	const taskerPk = rune.taskerPubkey;
	if (!ids || !taskerPk) {
		d.warn('markTaskCompleteV1: missing paymentId, contract address, parent id, or tasker pubkey');
		return { ok: false };
	}

	if (!ndk.activeUser?.pubkey) {
		d.warn('markTaskCompleteV1: not signed in with Nostr');
		return { ok: false };
	}

	const preflightErr = await runV1Preflight(rune, ids, {
		isAllowed: (p) => p.canCompleteTask,
		logLabel: 'markTaskCompleteV1'
	});
	if (preflightErr) return preflightErr;

	let transactionHash: string;
	try {
		const { tx } = await completeTask(ids.paymentId, writeOpts(ids));
		transactionHash = tx.hash;
	} catch (e) {
		d.error('markTaskCompleteV1: completeTask failed', e);
		return { ok: false };
	}

	const signer = ndk.activeUser;
	if (!signer) {
		d.warn('markTaskCompleteV1: signer missing after broadcast');
		return { ok: false };
	}

	const completionAttachments =
		completionAttachmentsArg !== undefined && completionAttachmentsArg.length > 0
			? completionAttachmentsArg.map((a) => ({ ...a }))
			: undefined;

	await broadcastThenParallelEffects(
		'markTaskCompleteV1',
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
		completionAttachments,
		undefined
	);

	return { ok: true, transactionHash };
}

export async function acceptTaskV1(
	rune: PaymentContractRuneLike
): Promise<ContractLifecycleResult> {
	const ids = getRuneWriteIds(rune);
	const taskeePk = rune.contract.taskeePubkey;
	if (!ids || !taskeePk) {
		d.warn('acceptTaskV1: missing paymentId, contract address, parent id, or taskee pubkey');
		return { ok: false };
	}

	if (!rune.isTasker) {
		d.warn('acceptTaskV1: viewer is not tasker');
		return { ok: false };
	}

	if (!ndk.activeUser?.pubkey) {
		d.warn('acceptTaskV1: not signed in with Nostr');
		return { ok: false };
	}

	const preflightErr = await runV1Preflight(rune, ids, {
		isAllowed: (p) => p.canAcceptTask,
		logLabel: 'acceptTaskV1'
	});
	if (preflightErr) return preflightErr;

	let transactionHash: string;
	try {
		const { tx } = await acceptTask(ids.paymentId, writeOpts(ids));
		transactionHash = tx.hash;
	} catch (e) {
		d.error('acceptTaskV1: acceptTask failed', e);
		return { ok: false };
	}

	const signer = ndk.activeUser;
	if (!signer) {
		d.warn('acceptTaskV1: signer missing after broadcast');
		return { ok: false };
	}

	const publishTaskCompleted = async () => {
		if (!rune.task) {
			d.warn('acceptTaskV1: task event not loaded; skip kind 31000 COMPLETED replaceable');
			return;
		}
		try {
			await publishTaskCompletedForEscrow(rune.task);
		} catch (e) {
			d.warn('acceptTaskV1: publishTaskCompletedForEscrow failed', e);
		}
	};

	await broadcastThenParallelEffects(
		'acceptTaskV1',
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

export async function refundTaskerV1(
	rune: PaymentContractRuneLike
): Promise<ContractLifecycleResult> {
	const ids = getRuneWriteIds(rune);
	const taskerPk = rune.taskerPubkey;
	if (!ids || !taskerPk) {
		d.warn('refundTaskerV1: missing paymentId, contract address, parent id, or tasker pubkey');
		return { ok: false };
	}

	if (rune.isTasker) {
		d.warn('refundTaskerV1: tasker cannot call refund (taskee action)');
		return { ok: false };
	}

	if (!ndk.activeUser?.pubkey) {
		d.warn('refundTaskerV1: not signed in with Nostr');
		return { ok: false };
	}

	const preflightErr = await runV1Preflight(rune, ids, {
		isAllowed: (p) => p.canRefundTasker,
		logLabel: 'refundTaskerV1'
	});
	if (preflightErr) return preflightErr;

	let transactionHash: string;
	try {
		const { tx } = await refundTasker(ids.paymentId, writeOpts(ids));
		transactionHash = tx.hash;
	} catch (e) {
		d.error('refundTaskerV1: refundClient failed', e);
		return { ok: false };
	}

	const signer = ndk.activeUser;
	if (!signer) {
		d.warn('refundTaskerV1: signer missing after broadcast');
		return { ok: false };
	}

	await broadcastThenParallelEffects(
		'refundTaskerV1',
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

export async function cancelPaymentContractV1(
	rune: PaymentContractRuneLike
): Promise<ContractLifecycleResult> {
	const ids = getRuneWriteIds(rune);
	const taskerPk = rune.taskerPubkey;
	const taskeePk = rune.contract.taskeePubkey;
	if (!ids || !taskerPk || !taskeePk) {
		d.warn(
			'cancelPaymentContractV1: missing paymentId, contract address, parent id, tasker, or taskee pubkey'
		);
		return { ok: false };
	}

	if (!ndk.activeUser?.pubkey) {
		d.warn('cancelPaymentContractV1: not signed in with Nostr');
		return { ok: false };
	}

	const preflightErr = await runV1Preflight(rune, ids, {
		isAllowed: (p) => p.canCancelPaymentContract,
		logLabel: 'cancelPaymentContractV1'
	});
	if (preflightErr) return preflightErr;

	let transactionHash: string;
	try {
		const { tx } = await cancelPaymentContract(ids.paymentId, writeOpts(ids));
		transactionHash = tx.hash;
	} catch (e) {
		d.error('cancelPaymentContractV1: cancelEscrow failed', e);
		return { ok: false };
	}

	const signer = ndk.activeUser;
	if (!signer) {
		d.warn('cancelPaymentContractV1: signer missing after broadcast');
		return { ok: false };
	}

	const counterpartyPk = rune.isTasker ? taskeePk : taskerPk;

	await broadcastThenParallelEffects(
		'cancelPaymentContractV1',
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

export async function markNoShowV1(
	_rune: PaymentContractRuneLike
): Promise<ContractLifecycleResult> {
	return { ok: false };
}

export async function markWorkInProgressV1(
	_rune: PaymentContractRuneLike
): Promise<ContractLifecycleResult> {
	return { ok: false };
}

export async function claimNoShowRefundV1(
	_rune: PaymentContractRuneLike
): Promise<ContractLifecycleResult> {
	return { ok: false };
}

export async function disputeTaskV1(
	rune: PaymentContractRuneLike
): Promise<ContractLifecycleResult> {
	const ids = getRuneWriteIds(rune);
	const taskeePk = rune.contract.taskeePubkey;
	if (!ids || !taskeePk) {
		d.warn('disputeTaskV1: missing paymentId, contract address, parent id, or taskee pubkey');
		return { ok: false };
	}

	if (!rune.isTasker) {
		d.warn('disputeTaskV1: only tasker may dispute');
		return { ok: false };
	}

	if (!ndk.activeUser?.pubkey) {
		d.warn('disputeTaskV1: not signed in with Nostr');
		return { ok: false };
	}

	const preflightErr = await runV1Preflight(rune, ids, {
		isAllowed: (p) => p.canDisputeTask,
		logLabel: 'disputeTaskV1'
	});
	if (preflightErr) return preflightErr;

	let transactionHash: string;
	try {
		const { tx } = await disputeTask(ids.paymentId, writeOpts(ids));
		transactionHash = tx.hash;
	} catch (e) {
		d.error('disputeTaskV1: disputeTask failed', e);
		return { ok: false };
	}

	const signer = ndk.activeUser;
	if (!signer) {
		d.warn('disputeTaskV1: signer missing after broadcast');
		return { ok: false };
	}

	await broadcastThenParallelEffects(
		'disputeTaskV1',
		ids,
		signer,
		transactionHash,
		taskeePk,
		ContractStatus.InDispute,
		'disputeTask',
		{
			title: 'Dispute raised',
			body: `"${rune.taskTitle}" — a dispute was raised. Open Contracts to review.`,
			type: 'contract_dispute_raised'
		}
	);

	return { ok: true, transactionHash };
}

export async function proposeResolutionV1(
	rune: PaymentContractRuneLike,
	taskeeAmountWei: bigint
): Promise<ContractLifecycleResult> {
	const ids = getRuneWriteIds(rune);
	const taskerPk = rune.taskerPubkey;
	const taskeePk = rune.contract.taskeePubkey;
	if (!ids || !taskerPk || !taskeePk) {
		d.warn('proposeResolutionV1: missing ids or party pubkeys');
		return { ok: false };
	}

	if (!ndk.activeUser?.pubkey) {
		d.warn('proposeResolutionV1: not signed in with Nostr');
		return { ok: false };
	}

	const preflightErr = await runV1Preflight(rune, ids, {
		isAllowed: (p) => p.canProposeResolution,
		logLabel: 'proposeResolutionV1'
	});
	if (preflightErr) return preflightErr;

	let paymentBefore: SecurePaymentLegacy;
	try {
		paymentBefore = await loadPaymentContractDetails(ids.paymentId, ids.contractAddress, 'rsk');
	} catch (e) {
		d.error('proposeResolutionV1: load payment failed', e);
		return { ok: false };
	}

	if (paymentBefore.state !== ContractStatus.InDispute || taskeeAmountWei <= 0n) {
		d.warn('proposeResolutionV1: need InDispute and positive taskee amount');
		return { ok: false };
	}

	let totalWei: bigint;
	try {
		totalWei = ethers.parseEther(paymentBefore.amount);
	} catch {
		d.warn('proposeResolutionV1: invalid payment amount');
		return { ok: false };
	}

	const baseWei = calculateV1BaseAmountWei(totalWei, paymentBefore.taskerFeeTier);
	if (taskeeAmountWei > baseWei) {
		d.warn('proposeResolutionV1: taskee amount exceeds v1 base');
		return { ok: false };
	}

	const proposedTaskerWei = baseWei - taskeeAmountWei;

	let transactionHash: string;
	try {
		const { tx } = await proposeResolution(ids.paymentId, taskeeAmountWei, writeOpts(ids));
		transactionHash = tx.hash;
	} catch (e) {
		d.error('proposeResolutionV1: proposeResolution failed', e);
		return { ok: false };
	}

	const signer = ndk.activeUser;
	if (!signer) {
		d.warn('proposeResolutionV1: signer missing after broadcast');
		return { ok: false };
	}

	const recipientPubkey = rune.isTasker ? taskeePk : taskerPk;
	const proposedTaskeeAmount = ethers.formatEther(taskeeAmountWei);
	const proposedTaskerAmount = ethers.formatEther(proposedTaskerWei);

	await broadcastThenParallelEffects(
		'proposeResolutionV1',
		ids,
		signer,
		transactionHash,
		recipientPubkey,
		ContractStatus.InDispute,
		'proposeResolution',
		{
			title: 'Resolution proposed',
			body: `"${rune.taskTitle}" — a resolution was proposed. Open Contracts to review.`,
			type: 'contract_resolution_proposed'
		},
		undefined,
		undefined,
		{ proposedTaskeeAmount, proposedTaskerAmount }
	);

	return { ok: true, transactionHash };
}

export async function acceptProposalV1(
	rune: PaymentContractRuneLike
): Promise<ContractLifecycleResult> {
	const ids = getRuneWriteIds(rune);
	const taskerPk = rune.taskerPubkey;
	const taskeePk = rune.contract.taskeePubkey;
	if (!ids || !taskerPk || !taskeePk) {
		d.warn('acceptProposalV1: missing ids or party pubkeys');
		return { ok: false };
	}

	if (!ndk.activeUser?.pubkey) {
		d.warn('acceptProposalV1: not signed in with Nostr');
		return { ok: false };
	}

	const preflightErr = await runV1Preflight(rune, ids, {
		isAllowed: (p) => p.canAcceptProposal,
		logLabel: 'acceptProposalV1'
	});
	if (preflightErr) return preflightErr;

	let transactionHash: string;
	try {
		const { tx } = await acceptProposal(ids.paymentId, writeOpts(ids));
		transactionHash = tx.hash;
	} catch (e) {
		d.error('acceptProposalV1: acceptProposal failed', e);
		return { ok: false };
	}

	const signer = ndk.activeUser;
	if (!signer) {
		d.warn('acceptProposalV1: signer missing after broadcast');
		return { ok: false };
	}

	const recipientPubkey = rune.isTasker ? taskeePk : taskerPk;

	await broadcastThenParallelEffects(
		'acceptProposalV1',
		ids,
		signer,
		transactionHash,
		recipientPubkey,
		ContractStatus.DisputeResolved,
		'acceptProposal',
		{
			title: 'Dispute resolved',
			body: `"${rune.taskTitle}" — the proposed resolution was accepted. Open Contracts to review.`,
			type: 'contract_dispute_resolved'
		}
	);

	return { ok: true, transactionHash };
}

export async function resolveAfterTimelockV1(
	rune: PaymentContractRuneLike
): Promise<ContractLifecycleResult> {
	const ids = getRuneWriteIds(rune);
	const taskerPk = rune.taskerPubkey;
	const taskeePk = rune.contract.taskeePubkey;
	if (!ids || !taskerPk || !taskeePk) {
		d.warn('resolveAfterTimelockV1: missing ids or party pubkeys');
		return { ok: false };
	}

	if (!ndk.activeUser?.pubkey) {
		d.warn('resolveAfterTimelockV1: not signed in with Nostr');
		return { ok: false };
	}

	const preflightErr = await runV1Preflight(rune, ids, {
		isAllowed: (p) => p.canResolveAfterTimelock,
		logLabel: 'resolveAfterTimelockV1'
	});
	if (preflightErr) return preflightErr;

	let paymentBefore: SecurePaymentLegacy;
	try {
		paymentBefore = await loadPaymentContractDetails(ids.paymentId, ids.contractAddress, 'rsk');
	} catch (e) {
		d.error('resolveAfterTimelockV1: load payment failed', e);
		return { ok: false };
	}

	const disputeBranch = paymentBefore.state === ContractStatus.InDispute;
	if (disputeBranch && !rune.isTasker) {
		d.warn('resolveAfterTimelockV1: only tasker may resolve dispute timelock on v1');
		return { ok: false };
	}

	let transactionHash: string;
	try {
		const { tx } = await resolveAfterTimelock(ids.paymentId, writeOpts(ids));
		transactionHash = tx.hash;
	} catch (e) {
		d.error('resolveAfterTimelockV1: resolveAfterTimelock failed', e);
		return { ok: false };
	}

	const signer = ndk.activeUser;
	if (!signer) {
		d.warn('resolveAfterTimelockV1: signer missing after broadcast');
		return { ok: false };
	}

	const recipientPubkey = rune.isTasker ? taskeePk : taskerPk;

	const provider = await getProvider('rsk');
	await provider.waitForTransaction(transactionHash);
	let chainStatus: ContractStatus;
	try {
		const fresh = await loadPaymentContractDetails(ids.paymentId, ids.contractAddress, 'rsk');
		chainStatus = fresh.state as ContractStatus;
	} catch {
		chainStatus = disputeBranch ? ContractStatus.DisputeUnresolved : ContractStatus.Completed;
	}

	await broadcastThenParallelEffects(
		'resolveAfterTimelockV1',
		ids,
		signer,
		transactionHash,
		recipientPubkey,
		chainStatus,
		'resolveAfterTimelock',
		{
			title: 'Timelock resolution',
			body: `"${rune.taskTitle}" — the contract was resolved after the timelock. Open Contracts to review.`,
			type: 'contract_timelock_resolved'
		}
	);

	return { ok: true, transactionHash };
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
