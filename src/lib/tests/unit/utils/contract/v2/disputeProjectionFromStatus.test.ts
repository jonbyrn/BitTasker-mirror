import { describe, expect, it } from 'vitest';
import { disputeProjectionFromStatusEvents } from '$lib/utils/contract/v2/disputeProjectionFromStatus';
import { ContractStatus } from '$lib/utils/contract/types';

function mockStatus(params: {
	created_at: number;
	writeMethod?: string;
	authorPk: string;
}): Parameters<typeof disputeProjectionFromStatusEvents>[2][number] {
	return {
		created_at: params.created_at,
		author: { pubkey: params.authorPk },
		tagValue: (name: string) => (name === 'writeMethod' ? params.writeMethod : undefined)
	} as Parameters<typeof disputeProjectionFromStatusEvents>[2][number];
}

describe('disputeProjectionFromStatusEvents', () => {
	const tasker = 'a'.repeat(64);
	const taskee = 'b'.repeat(64);

	it('returns undefined when chain is not in dispute', () => {
		expect(
			disputeProjectionFromStatusEvents(tasker, taskee, [], ContractStatus.Funded)
		).toBeUndefined();
	});

	it('returns undefined without tasker or taskee', () => {
		expect(
			disputeProjectionFromStatusEvents(undefined, taskee, [], ContractStatus.InDispute)
		).toBeUndefined();
		expect(
			disputeProjectionFromStatusEvents(tasker, undefined, [], ContractStatus.InDispute)
		).toBeUndefined();
	});

	it('counts proposeResolution and sets last proposer (newest-first input ok)', () => {
		const ev1 = mockStatus({
			created_at: 100,
			writeMethod: 'proposeResolution',
			authorPk: tasker
		});
		const ev2 = mockStatus({
			created_at: 200,
			writeMethod: 'proposeResolution',
			authorPk: taskee
		});
		const p = disputeProjectionFromStatusEvents(
			tasker,
			taskee,
			[ev2, ev1],
			ContractStatus.InDisputeWithTimelock
		);
		expect(p?.totalProposalCount).toBe(2);
		expect(p?.lastProposerIsTasker).toBe(false);
		expect(p?.disputeAccepted).toBe(false);
	});

	it('sets disputeAccepted when acceptProposal follows last propose', () => {
		const ev1 = mockStatus({
			created_at: 100,
			writeMethod: 'proposeResolution',
			authorPk: tasker
		});
		const ev2 = mockStatus({
			created_at: 200,
			writeMethod: 'acceptProposal',
			authorPk: taskee
		});
		const p = disputeProjectionFromStatusEvents(
			tasker,
			taskee,
			[ev2, ev1],
			ContractStatus.InDispute
		);
		expect(p?.disputeAccepted).toBe(true);
	});
});
