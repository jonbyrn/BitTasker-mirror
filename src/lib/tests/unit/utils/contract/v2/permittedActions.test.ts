import { describe, it, expect } from 'vitest';
import { ethers } from 'ethers';
import { ContractStatus } from '$lib/utils/contract/types';
import type { SecurePaymentLegacy } from '$lib/utils/contract/types';
import {
	computePermittedActions,
	GRACE_PERIOD,
	CANCELLATION_WINDOW,
	COMPLETION_TIMELOCK,
	inferParticipantRole,
	type ComputePermittedActionsArgs,
	type ParticipantRole
} from '$lib/utils/contract/v2/permittedActions';

const ADDR = {
	tasker: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
	taskee: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
};

function basePayment(overrides: Partial<SecurePaymentLegacy> = {}): SecurePaymentLegacy {
	const t0 = 1_700_000_000;
	return {
		tasker: ADDR.tasker,
		taskee: ADDR.taskee,
		amount: '1.0',
		estimatedStartTime: t0 + 3600,
		estimatedCompletionTime: t0 + 86400,
		timelockEnd: 0,
		createdAt: t0,
		taskerFeeTier: 0,
		taskeeFeeTier: 0,
		state: ContractStatus.Funded,
		noShowMarked: false,
		...overrides
	};
}

function run(
	payment: SecurePaymentLegacy,
	role: ParticipantRole,
	now: number,
	extra?: Partial<Omit<ComputePermittedActionsArgs, 'payment' | 'role' | 'now'>>
) {
	return computePermittedActions({
		payment,
		role,
		now,
		awaitingTx: false,
		...extra
	});
}

describe('inferParticipantRole', () => {
	it('maps tasker and taskee addresses', () => {
		const p = basePayment();
		expect(inferParticipantRole(ADDR.tasker, p)).toBe('tasker');
		expect(inferParticipantRole(ADDR.taskee.toUpperCase(), p)).toBe('taskee');
	});

	it('returns none for outsider or empty', () => {
		const p = basePayment();
		expect(inferParticipantRole('0xcccccccccccccccccccccccccccccccccccccccc', p)).toBe('none');
		expect(inferParticipantRole('', p)).toBe('none');
		expect(inferParticipantRole(undefined, p)).toBe('none');
	});
});

describe('computePermittedActions', () => {
	describe('awaitingTx and role', () => {
		it('returns all false when awaitingTx', () => {
			const p = basePayment();
			const r = computePermittedActions({
				payment: p,
				role: 'taskee',
				now: p.estimatedStartTime,
				awaitingTx: true
			});
			expect(Object.values(r).every((v) => v === false)).toBe(true);
		});

		it('returns all false when role is none', () => {
			const p = basePayment({ state: ContractStatus.Completed });
			const r = run(p, 'none', p.estimatedCompletionTime + 100);
			expect(r.canAcceptTask).toBe(false);
			expect(r.canDisputeTask).toBe(false);
		});
	});

	describe('terminal states', () => {
		it.each([
			ContractStatus.DisputeResolved,
			ContractStatus.DisputeUnresolved,
			ContractStatus.Cancelled,
			ContractStatus.Refunded,
			ContractStatus.FundsReleased,
			ContractStatus.FundsClaimed
		] as const)('state %i yields no actions for tasker', (state) => {
			const p = basePayment({ state });
			const r = run(p, 'tasker', p.createdAt + 999999);
			expect(Object.values(r).every((v) => v === false)).toBe(true);
		});
	});

	describe('completeTask (taskee)', () => {
		it('true for Funded when now >= estimatedStartTime', () => {
			const p = basePayment({ state: ContractStatus.Funded });
			const r = run(p, 'taskee', p.estimatedStartTime);
			expect(r.canCompleteTask).toBe(true);
		});

		it('false before estimatedStartTime', () => {
			const p = basePayment({ state: ContractStatus.Funded });
			const r = run(p, 'taskee', p.estimatedStartTime - 1);
			expect(r.canCompleteTask).toBe(false);
		});

		it('false for tasker', () => {
			const p = basePayment({ state: ContractStatus.Funded });
			const r = run(p, 'tasker', p.estimatedStartTime);
			expect(r.canCompleteTask).toBe(false);
		});

		it('true for WorkInProgress at start boundary', () => {
			const p = basePayment({ state: ContractStatus.WorkInProgress });
			const r = run(p, 'taskee', p.estimatedStartTime);
			expect(r.canCompleteTask).toBe(true);
		});

		it('true for NoShow when past start', () => {
			const p = basePayment({ state: ContractStatus.NoShow });
			const r = run(p, 'taskee', p.estimatedStartTime);
			expect(r.canCompleteTask).toBe(true);
		});
	});

	describe('acceptTask (tasker)', () => {
		it('true only in Completed', () => {
			const p = basePayment({ state: ContractStatus.Completed });
			expect(run(p, 'tasker', p.estimatedCompletionTime).canAcceptTask).toBe(true);
			expect(run(p, 'taskee', p.estimatedCompletionTime).canAcceptTask).toBe(false);
		});

		it('false in Funded', () => {
			const p = basePayment({ state: ContractStatus.Funded });
			expect(run(p, 'tasker', p.estimatedStartTime).canAcceptTask).toBe(false);
		});
	});

	describe('disputeTask (tasker)', () => {
		it('true in WorkInProgress without extra time checks', () => {
			const p = basePayment({ state: ContractStatus.WorkInProgress });
			expect(run(p, 'tasker', p.createdAt).canDisputeTask).toBe(true);
		});

		it('false for taskee', () => {
			const p = basePayment({ state: ContractStatus.WorkInProgress });
			expect(run(p, 'taskee', p.createdAt).canDisputeTask).toBe(false);
		});

		it('Completed: requires timelockEnd and now within dispute window', () => {
			const completionTime = 1_700_010_000;
			const timelockEnd = completionTime + COMPLETION_TIMELOCK;
			const p = basePayment({
				state: ContractStatus.Completed,
				timelockEnd,
				estimatedCompletionTime: completionTime
			});
			expect(run(p, 'tasker', timelockEnd).canDisputeTask).toBe(true);
			expect(run(p, 'tasker', timelockEnd + 1).canDisputeTask).toBe(false);
		});

		it('Completed: false if timelockEnd is zero', () => {
			const p = basePayment({
				state: ContractStatus.Completed,
				timelockEnd: 0
			});
			expect(run(p, 'tasker', 1_800_000_000).canDisputeTask).toBe(false);
		});

		it('Funded pre-start: within cancellation window after grace', () => {
			const createdAt = 1_700_000_000;
			const estimatedStartTime = createdAt + 7200;
			const p = basePayment({
				state: ContractStatus.Funded,
				createdAt,
				estimatedStartTime
			});
			const now = createdAt + GRACE_PERIOD + 1;
			expect(now < estimatedStartTime).toBe(true);
			expect(estimatedStartTime - now <= CANCELLATION_WINDOW).toBe(true);
			expect(run(p, 'tasker', now).canDisputeTask).toBe(true);
		});

		it('Funded: false before grace elapses', () => {
			const createdAt = 1_700_000_000;
			const p = basePayment({
				state: ContractStatus.Funded,
				createdAt,
				estimatedStartTime: createdAt + 7200
			});
			expect(run(p, 'tasker', createdAt + GRACE_PERIOD).canDisputeTask).toBe(false);
		});
	});

	describe('resolveAfterTimelock', () => {
		it('Completed: either party when now > timelockEnd', () => {
			const timelockEnd = 1_700_100_000;
			const p = basePayment({
				state: ContractStatus.Completed,
				timelockEnd
			});
			expect(run(p, 'tasker', timelockEnd + 1).canResolveAfterTimelock).toBe(true);
			expect(run(p, 'taskee', timelockEnd + 1).canResolveAfterTimelock).toBe(true);
		});

		it('Completed: false at exactly timelockEnd', () => {
			const timelockEnd = 1_700_100_000;
			const p = basePayment({
				state: ContractStatus.Completed,
				timelockEnd
			});
			expect(run(p, 'tasker', timelockEnd).canResolveAfterTimelock).toBe(false);
		});

		it('InDispute: tasker only', () => {
			const timelockEnd = 1_700_100_000;
			const p = basePayment({
				state: ContractStatus.InDispute,
				timelockEnd
			});
			expect(run(p, 'tasker', timelockEnd + 1).canResolveAfterTimelock).toBe(true);
			expect(run(p, 'taskee', timelockEnd + 1).canResolveAfterTimelock).toBe(false);
		});
	});

	describe('cancelPaymentContract', () => {
		it('taskee can cancel in Funded and WIP', () => {
			expect(
				run(basePayment({ state: ContractStatus.Funded }), 'taskee', 1).canCancelPaymentContract
			).toBe(true);
			expect(
				run(basePayment({ state: ContractStatus.WorkInProgress }), 'taskee', 1)
					.canCancelPaymentContract
			).toBe(true);
		});

		it('tasker in Funded: early grace window', () => {
			const createdAt = 1_700_000_000;
			const p = basePayment({ state: ContractStatus.Funded, createdAt });
			expect(run(p, 'tasker', createdAt + GRACE_PERIOD).canCancelPaymentContract).toBe(true);
		});

		it('tasker: can cancel when now + CANCELLATION_WINDOW < estimatedStartTime', () => {
			const createdAt = 1_700_000_000;
			const estimatedStartTime = createdAt + 200_000;
			const p = basePayment({
				state: ContractStatus.Funded,
				createdAt,
				estimatedStartTime,
				estimatedCompletionTime: estimatedStartTime + 86400
			});
			const now = createdAt + GRACE_PERIOD + 1;
			expect(now + CANCELLATION_WINDOW < estimatedStartTime).toBe(true);
			expect(run(p, 'tasker', now).canCancelPaymentContract).toBe(true);
		});
	});

	describe('refundTasker (taskee)', () => {
		it('true in allowed states', () => {
			for (const state of [
				ContractStatus.Funded,
				ContractStatus.InDispute,
				ContractStatus.InDisputeWithTimelock,
				ContractStatus.Completed,
				ContractStatus.NoShow,
				ContractStatus.WorkInProgress
			]) {
				const p = basePayment({ state });
				expect(run(p, 'taskee', p.createdAt).canRefundTasker).toBe(true);
			}
		});

		it('false for tasker', () => {
			const p = basePayment({ state: ContractStatus.Funded });
			expect(run(p, 'tasker', p.createdAt).canRefundTasker).toBe(false);
		});
	});

	describe('markNoShow', () => {
		it('tasker when Funded, not marked, past start + grace', () => {
			const p = basePayment({ state: ContractStatus.Funded, noShowMarked: false });
			const now = p.estimatedStartTime + GRACE_PERIOD;
			expect(run(p, 'tasker', now).canMarkNoShow).toBe(true);
		});

		it('false if noShowMarked', () => {
			const p = basePayment({
				state: ContractStatus.Funded,
				noShowMarked: true
			});
			expect(run(p, 'tasker', p.estimatedStartTime + GRACE_PERIOD + 1).canMarkNoShow).toBe(false);
		});

		it('false before start + grace', () => {
			const p = basePayment({ state: ContractStatus.Funded });
			expect(run(p, 'tasker', p.estimatedStartTime + GRACE_PERIOD - 1).canMarkNoShow).toBe(false);
		});
	});

	describe('no-show timelock (taskee / tasker)', () => {
		const timelockEnd = 1_700_200_000;
		const pNoShow = basePayment({
			state: ContractStatus.NoShow,
			timelockEnd
		});

		it('markWorkInProgress when now <= timelockEnd', () => {
			expect(run(pNoShow, 'taskee', timelockEnd).canMarkWorkInProgress).toBe(true);
			expect(run(pNoShow, 'taskee', timelockEnd - 1).canMarkWorkInProgress).toBe(true);
		});

		it('markWorkInProgress false after timelockEnd', () => {
			expect(run(pNoShow, 'taskee', timelockEnd + 1).canMarkWorkInProgress).toBe(false);
		});

		it('claimNoShowRefund when now > timelockEnd', () => {
			expect(run(pNoShow, 'tasker', timelockEnd + 1).canClaimNoShowRefund).toBe(true);
			expect(run(pNoShow, 'tasker', timelockEnd).canClaimNoShowRefund).toBe(false);
		});
	});

	describe('disputeProjection', () => {
		const pDispute = basePayment({ state: ContractStatus.InDispute });

		it('without projection, propose and accept stay false', () => {
			const r = run(pDispute, 'tasker', pDispute.createdAt);
			expect(r.canProposeResolution).toBe(false);
			expect(r.canAcceptProposal).toBe(false);
		});

		it('first proposal: either party can propose', () => {
			const proj = {
				totalProposalCount: 0,
				lastProposerIsTasker: false,
				disputeAccepted: false
			};
			expect(
				run(pDispute, 'tasker', pDispute.createdAt, { disputeProjection: proj })
					.canProposeResolution
			).toBe(true);
			expect(
				run(pDispute, 'taskee', pDispute.createdAt, { disputeProjection: proj })
					.canProposeResolution
			).toBe(true);
			expect(
				run(pDispute, 'tasker', pDispute.createdAt, { disputeProjection: proj }).canAcceptProposal
			).toBe(false);
		});

		it('after tasker proposed: taskee can accept, tasker cannot propose again', () => {
			const proj = {
				totalProposalCount: 1,
				lastProposerIsTasker: true,
				disputeAccepted: false
			};
			expect(
				run(pDispute, 'taskee', pDispute.createdAt, { disputeProjection: proj }).canAcceptProposal
			).toBe(true);
			expect(
				run(pDispute, 'tasker', pDispute.createdAt, { disputeProjection: proj })
					.canProposeResolution
			).toBe(false);
			expect(
				run(pDispute, 'taskee', pDispute.createdAt, { disputeProjection: proj })
					.canProposeResolution
			).toBe(true);
		});

		it('false when disputeAccepted', () => {
			const proj = {
				totalProposalCount: 1,
				lastProposerIsTasker: true,
				disputeAccepted: true
			};
			const r = run(pDispute, 'taskee', pDispute.createdAt, { disputeProjection: proj });
			expect(r.canAcceptProposal).toBe(false);
			expect(r.canProposeResolution).toBe(false);
		});

		it('false when totalProposalCount >= 4', () => {
			const proj = {
				totalProposalCount: 4,
				lastProposerIsTasker: false,
				disputeAccepted: false
			};
			expect(
				run(pDispute, 'tasker', pDispute.createdAt, { disputeProjection: proj })
					.canProposeResolution
			).toBe(false);
		});
	});

	describe('claimUpfrontDeposit', () => {
		it('false without upfrontDeposit context', () => {
			const p = basePayment({ state: ContractStatus.Funded });
			const r = run(p, 'taskee', p.createdAt + GRACE_PERIOD + 1);
			expect(r.canClaimUpfrontDeposit).toBe(false);
		});

		it('true when amount covers deposit + fee and past grace', () => {
			const p = basePayment({ state: ContractStatus.Funded, amount: '1.0' });
			const r = run(p, 'taskee', p.createdAt + GRACE_PERIOD + 1, {
				upfrontDeposit: {
					upfrontDepositWei: ethers.parseEther('0.5'),
					upfrontDepositReleased: false,
					taskerFeeOnUpfrontWei: ethers.parseEther('0.01')
				}
			});
			expect(r.canClaimUpfrontDeposit).toBe(true);
		});

		it('false when amount too small', () => {
			const p = basePayment({ state: ContractStatus.Funded, amount: '0.1' });
			const r = run(p, 'taskee', p.createdAt + GRACE_PERIOD + 1, {
				upfrontDeposit: {
					upfrontDepositWei: ethers.parseEther('0.09'),
					upfrontDepositReleased: false,
					taskerFeeOnUpfrontWei: ethers.parseEther('0.02')
				}
			});
			expect(r.canClaimUpfrontDeposit).toBe(false);
		});
	});
});
