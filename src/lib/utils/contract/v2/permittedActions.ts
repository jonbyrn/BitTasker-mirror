/**
 * Pure eligibility for SecurePayment v2 participant writes.
 * @see SECURE-PAYMENT-PARTICIPANT-ACTIONS.md — reconcile with contract if it changes.
 *
 * `now` is unix seconds. Callers may use chain time or **device time + a small offset** (e.g. +30s on RSK) so predicates stay usable without an RPC round-trip.
 *
 * Doc → code map:
 * - completeTask → `canCompleteTask`
 * - acceptTask → `canAcceptTask`
 * - disputeTask → `canDisputeTask` + `canDisputeTaskPredicate`
 * - resolveAfterTimelock → `canResolveAfterTimelock`
 * - proposeResolution / acceptProposal → `canProposeResolution` / `canAcceptProposal` (+ optional `disputeProjection`)
 * - cancelPaymentContract → `taskerCanCancel` + taskee branch
 * - refundTasker → `canRefundTasker`
 * - markNoShow → `canMarkNoShow`
 * - markWorkInProgress → `canMarkWorkInProgress`
 * - claimNoShowRefund → `canClaimNoShowRefund`
 * - claimUpfrontDeposit → `canClaimUpfrontDeposit` (+ optional `upfrontDeposit`)
 *
 * Not modeled here (doc footnotes / submit-time): `amount == 0` gate; `taskeeAmount` / `baseAmount` on propose.
 */

import { ethers } from 'ethers';
import type { SecurePaymentLegacy } from '../types';
import { ContractStatus } from '../types';

/** Seconds — matches SECURE-PAYMENT-PARTICIPANT-ACTIONS.md */
export const GRACE_PERIOD = 3600;
export const CANCELLATION_WINDOW = 86400;
export const COMPLETION_TIMELOCK = 7 * 86400;
export const DISPUTE_WINDOW = 7 * 86400;
/** Doc reference only; resolution gating uses on-chain `timelockEnd`. */
export const DISPUTE_TIMELOCK = 14 * 86400;
/** Doc reference only; proposal UX may use wall-clock separately from chain reads. */
export const PROPOSAL_RESPONSE_PERIOD = 86400;
export const NO_SHOW_RESPONSE_PERIOD = 86400;

export type ParticipantRole = 'tasker' | 'taskee' | 'none';

/** From Nostr / indexer for propose & accept; omit → both false in dispute states (Phase E). */
export type DisputeProjection = {
	totalProposalCount: number;
	/** `true` if tasker proposed last, `false` if taskee proposed last */
	lastProposerIsTasker: boolean;
	disputeAccepted: boolean;
};

/** Not on `getPaymentContract`; omit → `canClaimUpfrontDeposit` is false */
export type UpfrontDepositContext = {
	upfrontDepositWei: bigint;
	upfrontDepositReleased: boolean;
	taskerFeeOnUpfrontWei: bigint;
};

export type ComputePermittedActionsArgs = {
	payment: SecurePaymentLegacy;
	/** `true` = tasker (Kind 30006 author); `false` = taskee — only these two parties use the contract UI. */
	isTasker: boolean;
	/** Unix seconds (chain time or device time + offset — see module doc) */
	now: number;
	awaitingTx: boolean;
	disputeProjection?: DisputeProjection;
	upfrontDeposit?: UpfrontDepositContext;
};

export type PermittedActions = {
	canCompleteTask: boolean;
	canAcceptTask: boolean;
	canDisputeTask: boolean;
	canResolveAfterTimelock: boolean;
	canProposeResolution: boolean;
	canAcceptProposal: boolean;
	canCancelPaymentContract: boolean;
	canRefundTasker: boolean;
	canMarkNoShow: boolean;
	canMarkWorkInProgress: boolean;
	canClaimNoShowRefund: boolean;
	canClaimUpfrontDeposit: boolean;
};

const TERMINAL = new Set<number>([
	ContractStatus.DisputeResolved,
	ContractStatus.DisputeUnresolved,
	ContractStatus.Cancelled,
	ContractStatus.Refunded,
	ContractStatus.FundsReleased,
	ContractStatus.FundsClaimed
]);

/** Terminal chain states — no further lifecycle writes. */
export function isTerminalPaymentState(state: number): boolean {
	return TERMINAL.has(state);
}

function allFalse(): PermittedActions {
	return {
		canCompleteTask: false,
		canAcceptTask: false,
		canDisputeTask: false,
		canResolveAfterTimelock: false,
		canProposeResolution: false,
		canAcceptProposal: false,
		canCancelPaymentContract: false,
		canRefundTasker: false,
		canMarkNoShow: false,
		canMarkWorkInProgress: false,
		canClaimNoShowRefund: false,
		canClaimUpfrontDeposit: false
	};
}

/** All flags false — e.g. no chain snapshot yet. */
export function emptyPermittedActions(): PermittedActions {
	return allFalse();
}

function taskerCanCancel(payment: SecurePaymentLegacy, now: number): boolean {
	const { createdAt, estimatedStartTime, estimatedCompletionTime } = payment;
	return (
		now <= createdAt + GRACE_PERIOD ||
		now + CANCELLATION_WINDOW < estimatedStartTime ||
		now >= estimatedCompletionTime + CANCELLATION_WINDOW
	);
}

function canDisputeTaskPredicate(payment: SecurePaymentLegacy, now: number): boolean {
	const { state, timelockEnd, createdAt, estimatedStartTime } = payment;

	if (state === ContractStatus.WorkInProgress) return true;

	if (state === ContractStatus.Completed) {
		if (timelockEnd === 0) return false;
		const disputeWindowEnd = timelockEnd - COMPLETION_TIMELOCK + DISPUTE_WINDOW;
		return now <= disputeWindowEnd;
	}

	if (state === ContractStatus.Funded) {
		return (
			now < estimatedStartTime &&
			now > createdAt + GRACE_PERIOD &&
			estimatedStartTime - now <= CANCELLATION_WINDOW
		);
	}

	return false;
}

function canProposeWithProjection(
	isTasker: boolean,
	state: number,
	projection: DisputeProjection
): boolean {
	if (state !== ContractStatus.InDispute && state !== ContractStatus.InDisputeWorkInProgress)
		return false;
	if (projection.disputeAccepted) return false;
	if (projection.totalProposalCount >= 4) return false;

	const isTaskee = !isTasker;

	if (projection.totalProposalCount === 0) return true;

	if (isTasker && projection.lastProposerIsTasker) return false;
	if (isTaskee && !projection.lastProposerIsTasker) return false;

	return true;
}

function canAcceptWithProjection(
	isTasker: boolean,
	state: number,
	projection: DisputeProjection
): boolean {
	if (state !== ContractStatus.InDispute && state !== ContractStatus.InDisputeWorkInProgress)
		return false;
	if (projection.disputeAccepted) return false;
	if (projection.totalProposalCount < 1) return false;

	const isTaskee = !isTasker;

	if (isTasker && projection.lastProposerIsTasker) return false;
	if (isTaskee && !projection.lastProposerIsTasker) return false;

	return true;
}

/**
 * Which lifecycle writes the connected wallet may attempt, from chain + time (+ optional dispute/upfront context).
 */
export function computePermittedActions(args: ComputePermittedActionsArgs): PermittedActions {
	const { payment, isTasker, now, awaitingTx, disputeProjection, upfrontDeposit } = args;
	const base = allFalse();

	if (awaitingTx) return base;

	const { state, timelockEnd, noShowMarked, createdAt, estimatedStartTime } = payment;
	const isTaskee = !isTasker;

	if (isTerminalPaymentState(state)) return base;

	// --- Taskee: completeTask
	base.canCompleteTask =
		isTaskee &&
		(state === ContractStatus.Funded ||
			state === ContractStatus.NoShow ||
			state === ContractStatus.WorkInProgress) &&
		now >= estimatedStartTime;

	// --- Tasker: acceptTask
	base.canAcceptTask = isTasker && state === ContractStatus.Completed;

	// --- Tasker: disputeTask
	base.canDisputeTask =
		isTasker &&
		(state === ContractStatus.Funded ||
			state === ContractStatus.Completed ||
			state === ContractStatus.WorkInProgress) &&
		canDisputeTaskPredicate(payment, now);

	// --- resolveAfterTimelock
	if (
		(state === ContractStatus.Completed ||
			state === ContractStatus.InDispute ||
			state === ContractStatus.InDisputeWorkInProgress) &&
		timelockEnd !== 0 &&
		now > timelockEnd
	) {
		if (state === ContractStatus.Completed) {
			base.canResolveAfterTimelock = isTasker || isTaskee;
		} else {
			base.canResolveAfterTimelock = isTasker;
		}
	}

	// --- Dispute proposals (needs projection from Nostr / indexer in production)
	if (disputeProjection) {
		base.canProposeResolution = canProposeWithProjection(isTasker, state, disputeProjection);
		base.canAcceptProposal = canAcceptWithProjection(isTasker, state, disputeProjection);
	}

	// --- cancel
	if (state === ContractStatus.Funded || state === ContractStatus.WorkInProgress) {
		if (isTaskee) base.canCancelPaymentContract = true;
		else if (isTasker) base.canCancelPaymentContract = taskerCanCancel(payment, now);
	}

	// --- refundTasker (taskee)
	const refundStates = new Set([
		ContractStatus.Funded,
		ContractStatus.InDispute,
		ContractStatus.InDisputeWorkInProgress,
		ContractStatus.Completed,
		ContractStatus.NoShow,
		ContractStatus.WorkInProgress
	]);
	base.canRefundTasker = isTaskee && refundStates.has(state);

	// --- markNoShow
	base.canMarkNoShow =
		isTasker &&
		state === ContractStatus.Funded &&
		!noShowMarked &&
		now >= estimatedStartTime + GRACE_PERIOD;

	// --- markWorkInProgress
	base.canMarkWorkInProgress =
		isTaskee && state === ContractStatus.NoShow && timelockEnd !== 0 && now <= timelockEnd;

	// --- claimNoShowRefund (tasker only — on-chain; taskee responds with markWorkInProgress while now <= timelockEnd)
	base.canClaimNoShowRefund =
		isTasker && state === ContractStatus.NoShow && timelockEnd !== 0 && now > timelockEnd;

	// --- claimUpfrontDeposit (needs creation / view data)
	if (
		upfrontDeposit &&
		isTaskee &&
		(state === ContractStatus.Funded || state === ContractStatus.WorkInProgress)
	) {
		const { upfrontDepositWei, upfrontDepositReleased, taskerFeeOnUpfrontWei } = upfrontDeposit;
		let amountWei: bigint;
		try {
			amountWei = ethers.parseEther(payment.amount);
		} catch {
			amountWei = 0n;
		}
		if (
			!upfrontDepositReleased &&
			upfrontDepositWei > 0n &&
			amountWei > 0n &&
			now > createdAt + GRACE_PERIOD &&
			amountWei >= upfrontDepositWei + taskerFeeOnUpfrontWei
		) {
			base.canClaimUpfrontDeposit = true;
		}
	}

	return base;
}
