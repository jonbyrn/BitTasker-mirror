import { beforeEach, describe, expect, it } from 'vitest';
import type { NDKPaymentContract } from '$lib/nostr/events/contract';
import type { NDKContractStatus } from '$lib/nostr/events/contractStatus';
import { buildContractTimelineRows } from '$lib/utils/contract/buildContractTimelineRows';
import {
	mergeContractEvents,
	mergeTimelineStatus,
	type TimelineStatusLike
} from '$lib/utils/contract/localContractFeed';
import {
	localPublishedContracts,
	rememberPublishedContract,
	resetLocalPublishedContracts
} from '$lib/utils/contract/localPublishedContracts.svelte';
import { ContractStatus } from '$lib/utils/contract/types';

const contract = {
	created_at: 1_700_000_000,
	pubkey: 'tasker-pubkey'
} as NDKPaymentContract;

function status(partial: TimelineStatusLike): NDKContractStatus {
	return partial as NDKContractStatus;
}

describe('contract timeline updates without a reload', () => {
	beforeEach(() => {
		resetLocalPublishedContracts();
	});

	it('adds complete and release rows onto Contract initiated', () => {
		const initial = buildContractTimelineRows({ contract, statusEvents: [] });
		expect(initial.map((row) => row.kind)).toEqual(['initiation']);

		const completed = mergeTimelineStatus(
			[],
			status({
				status: ContractStatus.Completed,
				transactionHash: '0x6fefdb19dd8d',
				created_at: 1_700_000_100,
				pubkey: 'taskee-pubkey',
				id: 'complete-1'
			})
		);
		expect(completed.added).toBe(true);
		const afterComplete = buildContractTimelineRows({
			contract,
			statusEvents: completed.events
		});
		expect(afterComplete.map((row) => row.kind)).toEqual(['initiation', 'status']);
		expect(afterComplete[1]).toMatchObject({
			kind: 'status',
			event: { status: ContractStatus.Completed, transactionHash: '0x6fefdb19dd8d' }
		});

		const duplicate = mergeTimelineStatus(completed.events, completed.events[0]);
		expect(duplicate.added).toBe(false);

		const released = mergeTimelineStatus(
			completed.events,
			status({
				status: ContractStatus.FundsReleased,
				transactionHash: '0xrelease',
				created_at: 1_700_000_200,
				pubkey: 'tasker-pubkey',
				id: 'release-1'
			})
		);
		const afterRelease = buildContractTimelineRows({
			contract,
			statusEvents: released.events
		});
		expect(afterRelease.filter((row) => row.kind === 'status')).toHaveLength(2);
		expect(afterRelease[2]).toMatchObject({
			kind: 'status',
			event: { status: ContractStatus.FundsReleased }
		});
	});

	it('keeps a newly funded contract before the relay echoes it', () => {
		const funded = { id: 'event-id-789' } as NDKPaymentContract;
		expect(mergeContractEvents([], [funded])).toEqual([funded]);
		expect(mergeContractEvents([funded], [funded])).toEqual([funded]);

		rememberPublishedContract(funded);
		expect(localPublishedContracts().map((item) => item.id)).toEqual(['event-id-789']);
		rememberPublishedContract(funded);
		expect(localPublishedContracts()).toHaveLength(1);
	});
});
