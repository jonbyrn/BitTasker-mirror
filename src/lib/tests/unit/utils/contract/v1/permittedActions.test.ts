import { describe, expect, it } from 'vitest';
import {
	deriveV1EffectiveContractStatus,
	isTerminalV1ChainState,
	isTerminalV1EffectiveState
} from '$lib/utils/contract/v1/effectiveContractState';
import { computeV1PermittedActions } from '$lib/utils/contract/v1/permittedActions';
import { ContractStatus } from '$lib/utils/contract/types';
import type { SecurePaymentLegacy } from '$lib/utils/contract/types';

function payment(overrides: Partial<SecurePaymentLegacy>): SecurePaymentLegacy {
	return {
		tasker: '0x1',
		taskee: '0x2',
		amount: '1',
		estimatedStartTime: 1_000,
		estimatedCompletionTime: 10_000,
		timelockEnd: 0,
		createdAt: 100,
		taskerFeeTier: 1,
		taskeeFeeTier: 1,
		state: ContractStatus.Funded,
		noShowMarked: false,
		...overrides
	};
}

describe('isTerminalV1EffectiveState', () => {
	it('treats FundsReleased as terminal for UI/permissions', () => {
		expect(isTerminalV1EffectiveState(ContractStatus.FundsReleased)).toBe(true);
		expect(isTerminalV1EffectiveState(ContractStatus.Completed)).toBe(false);
	});
});

describe('deriveV1EffectiveContractStatus', () => {
	it('maps Completed + any FundsReleased 31006 to FundsReleased', () => {
		const ev = {
			status: ContractStatus.FundsReleased
		} as import('$lib/nostr/events/contractStatus').NDKContractStatus;
		expect(deriveV1EffectiveContractStatus(ContractStatus.Completed, [ev])).toBe(
			ContractStatus.FundsReleased
		);
	});

	it('keeps Completed when no FundsReleased event', () => {
		const ev = {
			status: ContractStatus.Completed
		} as import('$lib/nostr/events/contractStatus').NDKContractStatus;
		expect(deriveV1EffectiveContractStatus(ContractStatus.Completed, [ev])).toBe(
			ContractStatus.Completed
		);
	});
});

describe('isTerminalV1ChainState', () => {
	it('is true for DisputeResolved, DisputeUnresolved, Cancelled', () => {
		expect(isTerminalV1ChainState(ContractStatus.DisputeResolved)).toBe(true);
		expect(isTerminalV1ChainState(ContractStatus.DisputeUnresolved)).toBe(true);
		expect(isTerminalV1ChainState(ContractStatus.Cancelled)).toBe(true);
	});

	it('is false for active v1 states', () => {
		expect(isTerminalV1ChainState(ContractStatus.Funded)).toBe(false);
		expect(isTerminalV1ChainState(ContractStatus.InDispute)).toBe(false);
		expect(isTerminalV1ChainState(ContractStatus.Completed)).toBe(false);
	});
});

describe('computeV1PermittedActions', () => {
	it('returns all false when awaitingTx', () => {
		const r = computeV1PermittedActions({
			payment: payment({}),
			isTasker: false,
			now: 2_000,
			awaitingTx: true
		});
		expect(r.canCompleteTask).toBe(false);
		expect(r.canRefundTasker).toBe(false);
	});

	it('returns all false for terminal states', () => {
		const r = computeV1PermittedActions({
			payment: payment({ state: ContractStatus.Cancelled }),
			isTasker: true,
			now: 2_000,
			awaitingTx: false
		});
		expect(r.canAcceptTask).toBe(false);
		expect(r.canDisputeTask).toBe(false);
	});

	it('allows taskee completeTask when Funded and past start', () => {
		const r = computeV1PermittedActions({
			payment: payment({ state: ContractStatus.Funded, estimatedStartTime: 1_000 }),
			isTasker: false,
			now: 1_500,
			awaitingTx: false
		});
		expect(r.canCompleteTask).toBe(true);
	});

	it('allows tasker acceptTask when Completed', () => {
		const r = computeV1PermittedActions({
			payment: payment({ state: ContractStatus.Completed }),
			isTasker: true,
			now: 2_000,
			awaitingTx: false
		});
		expect(r.canAcceptTask).toBe(true);
	});

	it('allows tasker dispute from Completed without extra time checks', () => {
		const r = computeV1PermittedActions({
			payment: payment({ state: ContractStatus.Completed }),
			isTasker: true,
			now: 50,
			awaitingTx: false
		});
		expect(r.canDisputeTask).toBe(true);
	});

	it('allows funded dispute only after grace and within pre-start window', () => {
		const p = payment({
			state: ContractStatus.Funded,
			createdAt: 100,
			estimatedStartTime: 100_000
		});
		const tooEarly = computeV1PermittedActions({
			payment: p,
			isTasker: true,
			now: 150,
			awaitingTx: false
		});
		expect(tooEarly.canDisputeTask).toBe(false);

		const ok = computeV1PermittedActions({
			payment: p,
			isTasker: true,
			now: 99_500,
			awaitingTx: false
		});
		expect(ok.canDisputeTask).toBe(true);
	});

	it('allows cancel for both parties in grace on Funded', () => {
		const r = computeV1PermittedActions({
			payment: payment({ state: ContractStatus.Funded, createdAt: 1_000 }),
			isTasker: true,
			now: 2_000,
			awaitingTx: false
		});
		expect(r.canCancelPaymentContract).toBe(true);
	});

	it('allows resolveAfterTimelock on Completed for both when past timelock', () => {
		const r = computeV1PermittedActions({
			payment: payment({
				state: ContractStatus.Completed,
				timelockEnd: 5_000
			}),
			isTasker: false,
			now: 5_000,
			awaitingTx: false
		});
		expect(r.canResolveAfterTimelock).toBe(true);
	});

	it('allows resolveAfterTimelock on InDispute for tasker only', () => {
		const tasker = computeV1PermittedActions({
			payment: payment({
				state: ContractStatus.InDispute,
				timelockEnd: 5_000
			}),
			isTasker: true,
			now: 5_000,
			awaitingTx: false
		});
		const taskee = computeV1PermittedActions({
			payment: payment({
				state: ContractStatus.InDispute,
				timelockEnd: 5_000
			}),
			isTasker: false,
			now: 5_000,
			awaitingTx: false
		});
		expect(tasker.canResolveAfterTimelock).toBe(true);
		expect(taskee.canResolveAfterTimelock).toBe(false);
	});

	it('leaves v2-only flags false', () => {
		const r = computeV1PermittedActions({
			payment: payment({ state: ContractStatus.Funded }),
			isTasker: false,
			now: 9_999,
			awaitingTx: false
		});
		expect(r.canMarkNoShow).toBe(false);
		expect(r.canMarkWorkInProgress).toBe(false);
		expect(r.canClaimNoShowRefund).toBe(false);
		expect(r.canClaimUpfrontDeposit).toBe(false);
	});
});
