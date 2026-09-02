import { ethers } from 'ethers';
import { ndk } from '$lib/nostr/ndk';
import { createDebug } from '$lib/utils/debug';
import { getProvider } from '$lib/utils/contract';
import { publishTaskCompletedForEscrow } from '$lib/utils/contract/v2/creation';
import {
	acceptProposal,
	acceptTask,
	cancelPaymentContract,
	claimNoShowRefund,
	completeTask,
	disputeTask,
	markNoShow,
	markWorkInProgress,
	proposeResolution,
	refundTasker,
	resolveAfterTimelock
} from '$lib/utils/contract/v2/blockchainWrites';
import {
	buildDisputeProjectionForPayment,
	nextProposeResolutionProposalNumberFromStatusEvents
} from '$lib/utils/contract/v2/disputeProjectionFromStatus';
import { loadPaymentContractDetailsV2 } from '$lib/utils/contract/v2/loadPaymentContractDetailsV2';
import {
	computePermittedActions,
	emptyPermittedActions,
	isTerminalPaymentState,
	type PermittedActions
} from '$lib/utils/contract/v2/permittedActions';
import { GAS_REIMBURSEMENT_PER_OP } from '$lib/utils/contract/v2/types';
import type { Attachment } from '$lib/types/task';
import {
	ContractStatus,
	DisplayOnlyStatus,
	type ContractChain,
	type ContractDisplayStatus,
	type SecurePaymentLegacy
} from '$lib/utils/contract/types';
import { applyFundedStartedInProgressDisplay } from './displayFundedInProgress';
import { runV2Preflight } from './v2Preflight';
import { broadcastThenParallelEffects, getRuneWriteIds } from './writeHelpers';
import type {
	ContractLifecycleResult,
	PaymentContractLifecycle,
	PaymentContractRuneLike
} from './types';
import { permissionsNowSeconds } from './time';
import type { EnrichmentRequest } from '$lib/types/notification';

const d = createDebug('contract:lifecycle:v2');

function buildEnrichment(
	rune: PaymentContractRuneLike,
	action: string,
	escrowId: string
): EnrichmentRequest | undefined {
	const data = rune.blockchainData;
	if (!data) return undefined;

	const recipientNpub = rune.isTasker ? rune.contract.taskeePubkey : rune.taskerPubkey;
	const taskId = rune.contract.taskId || undefined;

	const base: EnrichmentRequest = {
		action,
		escrowId,
		taskId,
		recipientNpub,
		taskTitle: rune.taskTitle,
		amount: data.amount
	};

	if (action === 'task_completed' || action === 'dispute_raised') {
		if (!data.timelockEnd) return base;
		const remainingSeconds = data.timelockEnd - Math.floor(Date.now() / 1000);
		if (remainingSeconds <= 0) return base;
		return { ...base, timelockDuration: remainingSeconds };
	}

	if (action === 'work_started') {
		if (!data.estimatedCompletionTime) return undefined;
		return { ...base, estimatedCompletionTime: data.estimatedCompletionTime };
	}

	if (action === 'no_show_marked') {
		if (!data.timelockEnd) return undefined;
		return { ...base, responseDeadline: data.timelockEnd };
	}

	return base;
}

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
	const disputeProjection = buildDisputeProjectionForPayment(
		{
			taskerPubkey: rune.taskerPubkey,
			taskeePubkey: rune.contract.taskeePubkey,
			statusEventsByNewest: rune.statusEventsByNewest
		},
		payment.state
	);
	return computePermittedActions({
		payment,
		isTasker: rune.isTasker,
		now: permissionsNowSeconds(),
		awaitingTx: rune.isPending,
		disputeProjection
	});
}

export async function markTaskCompleteV2(
	rune: PaymentContractRuneLike,
	completionAttachmentsArg?: Attachment[],
	completionText?: string
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
	if (completionText !== undefined && completionText !== '') {
		d.log('markTaskCompleteV2: publishing with completion text', {
			textLength: completionText.length
		});
	}

	await broadcastThenParallelEffects({
		logLabel: 'markTaskCompleteV2',
		ids,
		signer,
		transactionHash,
		recipientPubkey: taskerPk,
		chainStatus: ContractStatus.Completed,
		writeMethod: 'completeTask',
		completionAttachments,
		completionText,
		enrichment: buildEnrichment(rune, 'task_completed', ids.paymentId)
	});

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

	await broadcastThenParallelEffects({
		logLabel: 'acceptTaskV2',
		ids,
		signer,
		transactionHash,
		recipientPubkey: taskeePk,
		chainStatus: ContractStatus.FundsReleased,
		writeMethod: 'acceptTask',
		extraTasks: [{ name: 'taskPublishReplaceable', run: publishTaskCompleted }],
		enrichment: buildEnrichment(rune, 'funds_released', ids.paymentId)
	});

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

	await broadcastThenParallelEffects({
		logLabel: 'refundTaskerV2',
		ids,
		signer,
		transactionHash,
		recipientPubkey: taskerPk,
		chainStatus: ContractStatus.Refunded,
		writeMethod: 'refundTasker',
		enrichment: buildEnrichment(rune, 'refunded', ids.paymentId)
	});

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

	await broadcastThenParallelEffects({
		logLabel: 'cancelPaymentContractV2',
		ids,
		signer,
		transactionHash,
		recipientPubkey: counterpartyPk,
		chainStatus: ContractStatus.Cancelled,
		writeMethod: 'cancelPaymentContract',
		enrichment: buildEnrichment(rune, 'cancelled', ids.paymentId)
	});

	return { ok: true, transactionHash };
}

/**
 * Tasker marks taskee no-show: `markNoShow` → 31006 `s=NoShow`, push to taskee.
 * TODO(gasless): prefer meta-tx when available.
 */
export async function markNoShowV2(
	rune: PaymentContractRuneLike
): Promise<ContractLifecycleResult> {
	const ids = getRuneWriteIds(rune);
	const taskeePk = rune.contract.taskeePubkey;
	if (!ids || !taskeePk) {
		d.warn('markNoShowV2: missing paymentId, contract address, parent id, or taskee pubkey');
		return { ok: false };
	}

	if (!rune.isTasker) {
		d.warn('markNoShowV2: only tasker may mark no-show');
		return { ok: false };
	}

	if (!ndk.activeUser?.pubkey) {
		d.warn('markNoShowV2: not signed in with Nostr');
		return { ok: false };
	}

	const preflightErr = await runV2Preflight(rune, ids, {
		isAllowed: (p) => p.canMarkNoShow,
		logLabel: 'markNoShowV2'
	});
	if (preflightErr) return preflightErr;

	let transactionHash: string;
	try {
		const { tx } = await markNoShow(ids.paymentId, {
			contractAddress: ids.contractAddress,
			chain: 'rsk'
		});
		transactionHash = tx.hash;
	} catch (e) {
		d.error('markNoShowV2: markNoShow failed', e);
		return { ok: false };
	}

	const signer = ndk.activeUser;
	if (!signer) {
		d.warn('markNoShowV2: signer missing after broadcast');
		return { ok: false };
	}

	await broadcastThenParallelEffects({
		logLabel: 'markNoShowV2',
		ids,
		signer,
		transactionHash,
		recipientPubkey: taskeePk,
		chainStatus: ContractStatus.NoShow,
		writeMethod: 'markNoShow',
		enrichment: buildEnrichment(rune, 'no_show_marked', ids.paymentId)
	});

	return { ok: true, transactionHash };
}

/**
 * Taskee marks work in progress after no-show: `markWorkInProgress` → 31006 `s=WorkInProgress`, push to tasker.
 * TODO(gasless): prefer meta-tx when available.
 */
export async function markWorkInProgressV2(
	rune: PaymentContractRuneLike
): Promise<ContractLifecycleResult> {
	const ids = getRuneWriteIds(rune);
	const taskerPk = rune.taskerPubkey;
	if (!ids || !taskerPk) {
		d.warn(
			'markWorkInProgressV2: missing paymentId, contract address, parent id, or tasker pubkey'
		);
		return { ok: false };
	}

	if (rune.isTasker) {
		d.warn('markWorkInProgressV2: taskee action only');
		return { ok: false };
	}

	if (!ndk.activeUser?.pubkey) {
		d.warn('markWorkInProgressV2: not signed in with Nostr');
		return { ok: false };
	}

	const preflightErr = await runV2Preflight(rune, ids, {
		isAllowed: (p) => p.canMarkWorkInProgress,
		logLabel: 'markWorkInProgressV2'
	});
	if (preflightErr) return preflightErr;

	let transactionHash: string;
	try {
		const { tx } = await markWorkInProgress(ids.paymentId, {
			contractAddress: ids.contractAddress,
			chain: 'rsk'
		});
		transactionHash = tx.hash;
	} catch (e) {
		d.error('markWorkInProgressV2: markWorkInProgress failed', e);
		return { ok: false };
	}

	const signer = ndk.activeUser;
	if (!signer) {
		d.warn('markWorkInProgressV2: signer missing after broadcast');
		return { ok: false };
	}

	await broadcastThenParallelEffects({
		logLabel: 'markWorkInProgressV2',
		ids,
		signer,
		transactionHash,
		recipientPubkey: taskerPk,
		chainStatus: ContractStatus.WorkInProgress,
		writeMethod: 'markWorkInProgress',
		enrichment: buildEnrichment(rune, 'work_started', ids.paymentId)
	});

	return { ok: true, transactionHash };
}

/**
 * Tasker claims refund after no-show response window: `claimNoShowRefund` → 31006 `s=FundsClaimed`, push to taskee.
 * TODO(gasless): prefer meta-tx when available.
 */
export async function claimNoShowRefundV2(
	rune: PaymentContractRuneLike
): Promise<ContractLifecycleResult> {
	const ids = getRuneWriteIds(rune);
	const taskeePk = rune.contract.taskeePubkey;
	if (!ids || !taskeePk) {
		d.warn('claimNoShowRefundV2: missing paymentId, contract address, parent id, or taskee pubkey');
		return { ok: false };
	}

	if (!rune.isTasker) {
		d.warn('claimNoShowRefundV2: only tasker may claim no-show refund');
		return { ok: false };
	}

	if (!ndk.activeUser?.pubkey) {
		d.warn('claimNoShowRefundV2: not signed in with Nostr');
		return { ok: false };
	}

	const preflightErr = await runV2Preflight(rune, ids, {
		isAllowed: (p) => p.canClaimNoShowRefund,
		logLabel: 'claimNoShowRefundV2'
	});
	if (preflightErr) return preflightErr;

	let transactionHash: string;
	try {
		const { tx } = await claimNoShowRefund(ids.paymentId, {
			contractAddress: ids.contractAddress,
			chain: 'rsk'
		});
		transactionHash = tx.hash;
	} catch (e) {
		d.error('claimNoShowRefundV2: claimNoShowRefund failed', e);
		return { ok: false };
	}

	const signer = ndk.activeUser;
	if (!signer) {
		d.warn('claimNoShowRefundV2: signer missing after broadcast');
		return { ok: false };
	}

	await broadcastThenParallelEffects({
		logLabel: 'claimNoShowRefundV2',
		ids,
		signer,
		transactionHash,
		recipientPubkey: taskeePk,
		chainStatus: ContractStatus.FundsClaimed,
		writeMethod: 'claimNoShowRefund',
		enrichment: buildEnrichment(rune, 'no_show_refund_claimed', ids.paymentId)
	});

	return { ok: true, transactionHash };
}

function expectedChainStatusAfterDisputeTask(payment: SecurePaymentLegacy): ContractStatus {
	return payment.state === ContractStatus.WorkInProgress
		? ContractStatus.InDisputeWorkInProgress
		: ContractStatus.InDispute;
}

/**
 * Tasker raises dispute: `disputeTask` → 31006 + push to taskee.
 */
export async function disputeTaskV2(
	rune: PaymentContractRuneLike
): Promise<ContractLifecycleResult> {
	const ids = getRuneWriteIds(rune);
	const taskeePk = rune.contract.taskeePubkey;
	if (!ids || !taskeePk) {
		d.warn('disputeTaskV2: missing paymentId, contract address, parent id, or taskee pubkey');
		return { ok: false };
	}

	if (!rune.isTasker) {
		d.warn('disputeTaskV2: only tasker may dispute');
		return { ok: false };
	}

	if (!ndk.activeUser?.pubkey) {
		d.warn('disputeTaskV2: not signed in with Nostr');
		return { ok: false };
	}

	const preflightErr = await runV2Preflight(rune, ids, {
		isAllowed: (p) => p.canDisputeTask,
		logLabel: 'disputeTaskV2'
	});
	if (preflightErr) return preflightErr;

	let paymentBefore: SecurePaymentLegacy;
	try {
		paymentBefore = await loadPaymentContractDetailsV2(ids.paymentId, ids.contractAddress, 'rsk');
	} catch (e) {
		d.error('disputeTaskV2: load payment failed', e);
		return { ok: false };
	}

	const nextStatus = expectedChainStatusAfterDisputeTask(paymentBefore);

	let transactionHash: string;
	try {
		const { tx } = await disputeTask(ids.paymentId, {
			contractAddress: ids.contractAddress,
			chain: 'rsk'
		});
		transactionHash = tx.hash;
	} catch (e) {
		d.error('disputeTaskV2: disputeTask failed', e);
		return { ok: false };
	}

	const signer = ndk.activeUser;
	if (!signer) {
		d.warn('disputeTaskV2: signer missing after broadcast');
		return { ok: false };
	}

	await broadcastThenParallelEffects({
		logLabel: 'disputeTaskV2',
		ids,
		signer,
		transactionHash,
		recipientPubkey: taskeePk,
		chainStatus: nextStatus,
		writeMethod: 'disputeTask',
		enrichment: buildEnrichment(rune, 'dispute_raised', ids.paymentId)
	});

	return { ok: true, transactionHash };
}

/**
 * Either party proposes resolution (`taskeeAmount` wei). 31006 carries proposed amounts + push to counterparty.
 */
export async function proposeResolutionV2(
	rune: PaymentContractRuneLike,
	taskeeAmountWei: bigint
): Promise<ContractLifecycleResult> {
	const ids = getRuneWriteIds(rune);
	const taskerPk = rune.taskerPubkey;
	const taskeePk = rune.contract.taskeePubkey;
	if (!ids || !taskerPk || !taskeePk) {
		d.warn('proposeResolutionV2: missing ids or party pubkeys');
		return { ok: false };
	}

	if (!ndk.activeUser?.pubkey) {
		d.warn('proposeResolutionV2: not signed in with Nostr');
		return { ok: false };
	}

	const preflightErr = await runV2Preflight(rune, ids, {
		isAllowed: (p) => p.canProposeResolution,
		logLabel: 'proposeResolutionV2'
	});
	if (preflightErr) return preflightErr;

	let paymentBefore: SecurePaymentLegacy;
	try {
		paymentBefore = await loadPaymentContractDetailsV2(ids.paymentId, ids.contractAddress, 'rsk');
	} catch (e) {
		d.error('proposeResolutionV2: load payment failed', e);
		return { ok: false };
	}

	if (paymentBefore.state === ContractStatus.InDispute && taskeeAmountWei <= 0n) {
		d.warn('proposeResolutionV2: taskee amount must be positive in InDispute');
		return { ok: false };
	}

	let baseWei: bigint;
	try {
		baseWei = ethers.parseEther(paymentBefore.amount);
	} catch {
		d.warn('proposeResolutionV2: invalid payment amount');
		return { ok: false };
	}
	if (taskeeAmountWei > baseWei) {
		d.warn('proposeResolutionV2: taskee amount exceeds base');
		return { ok: false };
	}

	const twoGaslessOps = 2n * GAS_REIMBURSEMENT_PER_OP;
	const proposedTaskerWei = baseWei - twoGaslessOps - taskeeAmountWei;
	if (proposedTaskerWei < 0n) {
		d.warn('proposeResolutionV2: taskee amount leaves no room for gas reserve + tasker share');
		return { ok: false };
	}

	const proposalNumber = nextProposeResolutionProposalNumberFromStatusEvents(
		rune.statusEventsByNewest
	);
	if (proposalNumber > 4) {
		d.warn('proposeResolutionV2: proposal number exceeds allowed limit');
		return { ok: false };
	}

	let transactionHash: string;
	try {
		const { tx } = await proposeResolution(ids.paymentId, taskeeAmountWei, proposalNumber, {
			contractAddress: ids.contractAddress,
			chain: 'rsk'
		});
		transactionHash = tx.hash;
	} catch (e) {
		d.error('proposeResolutionV2: proposeResolution failed', e);
		return { ok: false };
	}

	const signer = ndk.activeUser;
	if (!signer) {
		d.warn('proposeResolutionV2: signer missing after broadcast');
		return { ok: false };
	}

	const recipientPubkey = rune.isTasker ? taskeePk : taskerPk;

	const chainStatus = paymentBefore.state as ContractStatus;

	const proposedTaskeeAmount = ethers.formatEther(taskeeAmountWei);
	const proposedTaskerAmount = ethers.formatEther(proposedTaskerWei);

	await broadcastThenParallelEffects({
		logLabel: 'proposeResolutionV2',
		ids,
		signer,
		transactionHash,
		recipientPubkey,
		chainStatus,
		writeMethod: 'proposeResolution',
		proposedAmounts: { proposedTaskeeAmount, proposedTaskerAmount },
		enrichment: buildEnrichment(rune, 'resolution_proposed', ids.paymentId)
	});

	return { ok: true, transactionHash };
}

/**
 * Non-proposer accepts the latest proposal → `DisputeResolved` + 31006 + push.
 */
export async function acceptProposalV2(
	rune: PaymentContractRuneLike
): Promise<ContractLifecycleResult> {
	const ids = getRuneWriteIds(rune);
	const taskerPk = rune.taskerPubkey;
	const taskeePk = rune.contract.taskeePubkey;
	if (!ids || !taskerPk || !taskeePk) {
		d.warn('acceptProposalV2: missing ids or party pubkeys');
		return { ok: false };
	}

	if (!ndk.activeUser?.pubkey) {
		d.warn('acceptProposalV2: not signed in with Nostr');
		return { ok: false };
	}

	const preflightErr = await runV2Preflight(rune, ids, {
		isAllowed: (p) => p.canAcceptProposal,
		logLabel: 'acceptProposalV2'
	});
	if (preflightErr) return preflightErr;

	let transactionHash: string;
	try {
		const { tx } = await acceptProposal(ids.paymentId, {
			contractAddress: ids.contractAddress,
			chain: 'rsk'
		});
		transactionHash = tx.hash;
	} catch (e) {
		d.error('acceptProposalV2: acceptProposal failed', e);
		return { ok: false };
	}

	const signer = ndk.activeUser;
	if (!signer) {
		d.warn('acceptProposalV2: signer missing after broadcast');
		return { ok: false };
	}

	const recipientPubkey = rune.isTasker ? taskeePk : taskerPk;

	await broadcastThenParallelEffects({
		logLabel: 'acceptProposalV2',
		ids,
		signer,
		transactionHash,
		recipientPubkey,
		chainStatus: ContractStatus.DisputeResolved,
		writeMethod: 'acceptProposal',
		enrichment: buildEnrichment(rune, 'dispute_resolved', ids.paymentId)
	});

	return { ok: true, transactionHash };
}

/**
 * `resolveAfterTimelock` after completion or dispute timelock; 31006 uses on-chain outcome + push to counterparty.
 */
export async function resolveAfterTimelockV2(
	rune: PaymentContractRuneLike
): Promise<ContractLifecycleResult> {
	const ids = getRuneWriteIds(rune);
	const taskerPk = rune.taskerPubkey;
	const taskeePk = rune.contract.taskeePubkey;
	if (!ids || !taskerPk || !taskeePk) {
		d.warn('resolveAfterTimelockV2: missing ids or party pubkeys');
		return { ok: false };
	}

	if (!ndk.activeUser?.pubkey) {
		d.warn('resolveAfterTimelockV2: not signed in with Nostr');
		return { ok: false };
	}

	const preflightErr = await runV2Preflight(rune, ids, {
		isAllowed: (p) => p.canResolveAfterTimelock,
		logLabel: 'resolveAfterTimelockV2'
	});
	if (preflightErr) return preflightErr;

	let paymentBefore: SecurePaymentLegacy;
	try {
		paymentBefore = await loadPaymentContractDetailsV2(ids.paymentId, ids.contractAddress, 'rsk');
	} catch (e) {
		d.error('resolveAfterTimelockV2: load payment failed', e);
		return { ok: false };
	}

	const disputeBranch =
		paymentBefore.state === ContractStatus.InDispute ||
		paymentBefore.state === ContractStatus.InDisputeWorkInProgress;
	if (disputeBranch && !rune.isTasker) {
		d.warn('resolveAfterTimelockV2: only tasker may resolve dispute timelock');
		return { ok: false };
	}

	let transactionHash: string;
	try {
		const { tx } = await resolveAfterTimelock(ids.paymentId, {
			contractAddress: ids.contractAddress,
			chain: 'rsk'
		});
		transactionHash = tx.hash;
	} catch (e) {
		d.error('resolveAfterTimelockV2: resolveAfterTimelock failed', e);
		return { ok: false };
	}

	const signer = ndk.activeUser;
	if (!signer) {
		d.warn('resolveAfterTimelockV2: signer missing after broadcast');
		return { ok: false };
	}

	const recipientPubkey = rune.isTasker ? taskeePk : taskerPk;

	const provider = await getProvider('rsk');
	await provider.waitForTransaction(transactionHash);
	let chainStatus: ContractStatus;
	try {
		const fresh = await loadPaymentContractDetailsV2(ids.paymentId, ids.contractAddress, 'rsk');
		chainStatus = fresh.state as ContractStatus;
	} catch {
		chainStatus = ContractStatus.DisputeResolved;
	}

	await broadcastThenParallelEffects({
		logLabel: 'resolveAfterTimelockV2',
		ids,
		signer,
		transactionHash,
		recipientPubkey,
		chainStatus,
		writeMethod: 'resolveAfterTimelock',
		enrichment: buildEnrichment(rune, 'timelock_resolved', ids.paymentId)
	});

	return { ok: true, transactionHash };
}

export function computeDisplayStatusV2(rune: PaymentContractRuneLike): ContractDisplayStatus {
	if (rune.isFailed) return DisplayOnlyStatus.Failed;
	const d = rune.blockchainData;
	if (!d) {
		// Without blockchain data the chain state is unknown — show Funded without
		// applying the InProgress display override (that requires confirmed chain data).
		return ContractStatus.Funded;
	}
	const base = d.state as ContractDisplayStatus;
	return applyFundedStartedInProgressDisplay(base, rune);
}

export function isTerminalRuneStateV2(rune: PaymentContractRuneLike): boolean {
	const d = rune.blockchainData;
	if (!d) return false;
	return isTerminalPaymentState(d.state);
}

export const v2Lifecycle: PaymentContractLifecycle = {
	loadPaymentContractDetails: loadPaymentContractDetailsV2ForRune,
	computeDisplayStatus: computeDisplayStatusV2,
	isTerminalRuneState: isTerminalRuneStateV2,
	computePermittedActions: computePermittedActionsV2,
	markTaskComplete: markTaskCompleteV2,
	acceptTask: acceptTaskV2,
	refundTasker: refundTaskerV2,
	cancelPaymentContract: cancelPaymentContractV2,
	markNoShow: markNoShowV2,
	markWorkInProgress: markWorkInProgressV2,
	claimNoShowRefund: claimNoShowRefundV2,
	disputeTask: disputeTaskV2,
	proposeResolution: proposeResolutionV2,
	acceptProposal: acceptProposalV2,
	resolveAfterTimelock: resolveAfterTimelockV2
};
