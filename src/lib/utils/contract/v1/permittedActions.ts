/**
 * Pure eligibility for EscrowContract v1 participant writes.
 * @see ESCROW-PARTICIPANT-ACTIONS.md — reconcile with EscrowContract.sol if it changes.
 *
 * `now` is unix seconds (same contract as v2: chain time or device time + offset).
 *
 * v1 has no on-chain NoShow / WorkInProgress / claimUpfront — those flags stay false.
 */

import { ContractStatus } from '../types';
import type {
	ComputePermittedActionsArgs,
	DisputeProjection,
	PermittedActions
} from '../v2/permittedActions';
import { emptyPermittedActions, GRACE_PERIOD } from '../v2/permittedActions';
import { isTerminalV1EffectiveState } from './effectiveContractState';

/** 24h before `estimatedStartTime` — cancel window & funded dispute window (see ESCROW doc). */
const PRE_START_GAP = 86400;

function canProposeWithProjectionV1(isTasker: boolean, projection: DisputeProjection): boolean {
	if (projection.disputeAccepted) return false;
	if (projection.totalProposalCount >= 4) return false;

	const isTaskee = !isTasker;

	if (projection.totalProposalCount === 0) return true;

	if (isTasker && projection.lastProposerIsTasker) return false;
	if (isTaskee && !projection.lastProposerIsTasker) return false;

	return true;
}

function canAcceptWithProjectionV1(isTasker: boolean, projection: DisputeProjection): boolean {
	if (projection.disputeAccepted) return false;
	if (projection.totalProposalCount < 1) return false;

	const isTaskee = !isTasker;

	if (isTasker && projection.lastProposerIsTasker) return false;
	if (isTaskee && !projection.lastProposerIsTasker) return false;

	return true;
}

function canDisputeTaskV1(
	now: number,
	createdAt: number,
	estimatedStartTime: number,
	state: number
): boolean {
	if (state === ContractStatus.Completed) return true;
	if (state === ContractStatus.Funded) {
		return now >= estimatedStartTime - PRE_START_GAP && now > createdAt + GRACE_PERIOD;
	}
	return false;
}

function canCancelEscrowV1(now: number, createdAt: number, estimatedStartTime: number): boolean {
	return now <= createdAt + GRACE_PERIOD || now < estimatedStartTime - PRE_START_GAP;
}

/**
 * Which lifecycle writes the wallet may attempt for v1 escrow (chain + time + optional Nostr dispute projection).
 */
export function computeV1PermittedActions(args: ComputePermittedActionsArgs): PermittedActions {
	const base: PermittedActions = { ...emptyPermittedActions() };
	const { payment, isTasker, now, awaitingTx, disputeProjection } = args;
	if (awaitingTx) return base;

	const { state, timelockEnd, createdAt, estimatedStartTime } = payment;
	const isTaskee = !isTasker;

	if (isTerminalV1EffectiveState(state)) return base;

	// --- Taskee: completeTask (state Funded only on v1)
	base.canCompleteTask = isTaskee && state === ContractStatus.Funded && now >= estimatedStartTime;

	// --- Tasker: acceptTask
	base.canAcceptTask = isTasker && state === ContractStatus.Completed;

	// --- Tasker: disputeTask
	base.canDisputeTask =
		isTasker &&
		(state === ContractStatus.Funded || state === ContractStatus.Completed) &&
		canDisputeTaskV1(now, createdAt, estimatedStartTime, state);

	// --- resolveAfterTimelock (contract uses `>= timelockEnd`)
	if (timelockEnd !== 0 && now >= timelockEnd) {
		if (state === ContractStatus.Completed) {
			base.canResolveAfterTimelock = isTasker || isTaskee;
		} else if (state === ContractStatus.InDispute) {
			base.canResolveAfterTimelock = isTasker;
		}
	}

	if (disputeProjection && state === ContractStatus.InDispute) {
		base.canProposeResolution = canProposeWithProjectionV1(isTasker, disputeProjection);
		base.canAcceptProposal = canAcceptWithProjectionV1(isTasker, disputeProjection);
	}

	// --- cancelEscrow (both parties; Funded only)
	if (state === ContractStatus.Funded && canCancelEscrowV1(now, createdAt, estimatedStartTime)) {
		base.canCancelPaymentContract = true;
	}

	// --- refundClient (taskee)
	base.canRefundTasker =
		isTaskee &&
		(state === ContractStatus.Funded ||
			state === ContractStatus.InDispute ||
			state === ContractStatus.Completed);

	return base;
}
