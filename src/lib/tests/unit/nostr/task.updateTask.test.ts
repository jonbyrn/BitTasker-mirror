import { describe, it, expect, vi, beforeEach } from 'vitest';
import { assignTask, completeTask, updateTask } from '$lib/nostr/task';
import { queryRelayEvents } from '$lib/nostr/relayQuery';
import { getSignedEvent } from '$lib/utils/nostr';
import nostrEventsService from '$lib/api/services/nostr/events';
import KINDS from '$lib/utils/constants/kinds';
import { TaskStatusEnum } from '$lib/utils/enums/task.enum';

const TASK_AUTHOR_PUBKEY = 'a'.repeat(64);
const OTHER_USER_PUBKEY = 'b'.repeat(64);
const D_TAG = 'test-task-1700000000-abc123';
const TASK_ID = D_TAG;

/** Minimal task content for Nostr event */
function createTaskContent(overrides: Record<string, unknown> = {}) {
	return {
		title: 'Test Task',
		description: 'Description',
		status: TaskStatusEnum.OPEN,
		taskType: 'in-person',
		estimatedHours: 1,
		budget: { amount: 100, currency: 'USD', type: 'fixed' },
		categories: [] as number[],
		skills: [] as string[],
		requiredSkills: [] as string[],
		createdAt: 1700000000,
		...overrides
	};
}

/** Create a Nostr task event for testing */
function createTaskEvent(pubkey: string, dTag: string) {
	return {
		id: 'e1' + '0'.repeat(62),
		pubkey,
		created_at: 1700000000,
		kind: KINDS.TASK_CREATION,
		tags: [['d', dTag]],
		content: JSON.stringify(createTaskContent()),
		sig: ''
	};
}

vi.mock('$lib/utils/nostrKeys', () => ({
	getNpub: vi.fn()
}));

vi.mock('$lib/api/services/nostr/events', () => ({
	default: {
		requestEvents: vi.fn(),
		findEventById: vi.fn(),
		publishEvent: vi.fn()
	}
}));

vi.mock('$lib/nostr/relayQuery', () => ({
	queryRelayEvents: vi.fn().mockResolvedValue([])
}));

vi.mock('$lib/utils/nostr', () => ({
	getSignedEvent: vi.fn().mockResolvedValue({
		id: 'signed' + '0'.repeat(60),
		pubkey: 'a'.repeat(64),
		kind: 30078,
		content: '{}',
		tags: [['d', 'test-task-1700000000-abc123']],
		sig: '',
		created_at: 1700000000
	}),
	publishToMultipleRelays: vi.fn().mockResolvedValue([{ relay: 'wss://relay.test', success: true }])
}));

vi.mock('$lib/nostr', () => ({
	calculatePOW: vi.fn().mockResolvedValue(['0', '0'])
}));

vi.mock('$lib/nostr/findTasks', () => ({
	cleanup: vi.fn()
}));

vi.mock('$lib/nostr/findMyTasks', () => ({
	cleanupMyTasks: vi.fn()
}));

describe('updateTask', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(nostrEventsService.requestEvents).mockResolvedValue({
			data: [createTaskEvent(TASK_AUTHOR_PUBKEY, D_TAG)]
		} as unknown as Awaited<ReturnType<typeof nostrEventsService.requestEvents>>);
	});

	describe('authorization: only task author may update', () => {
		it('throws "Only the task author may update this task" when current user pubkey does not match task author', async () => {
			const { getNpub } = await import('$lib/utils/nostrKeys');
			vi.mocked(getNpub).mockResolvedValue(OTHER_USER_PUBKEY);

			await expect(updateTask(TASK_ID, { status: TaskStatusEnum.COMPLETED })).rejects.toThrow(
				'Only the task author may update this task'
			);

			expect(nostrEventsService.requestEvents).toHaveBeenCalled();
			expect(getNpub).toHaveBeenCalled();
		});

		it('throws "Only the task author may update this task" when current user pubkey (uppercase) does not match task author (lowercase)', async () => {
			const { getNpub } = await import('$lib/utils/nostrKeys');
			// Different pubkey - uppercase vs task's lowercase still fails (different users)
			vi.mocked(getNpub).mockResolvedValue(OTHER_USER_PUBKEY.toUpperCase());

			await expect(updateTask(TASK_ID, { status: TaskStatusEnum.COMPLETED })).rejects.toThrow(
				'Only the task author may update this task'
			);
		});

		it('throws "User not authenticated" when getNpub returns empty string', async () => {
			const { getNpub } = await import('$lib/utils/nostrKeys');
			vi.mocked(getNpub).mockResolvedValue('');

			await expect(updateTask(TASK_ID, { status: TaskStatusEnum.COMPLETED })).rejects.toThrow(
				'User not authenticated'
			);

			expect(nostrEventsService.requestEvents).toHaveBeenCalled();
			expect(getNpub).toHaveBeenCalled();
		});

		it('allows update when current user pubkey matches task author (same pubkey)', async () => {
			const { getNpub } = await import('$lib/utils/nostrKeys');
			vi.mocked(getNpub).mockResolvedValue(TASK_AUTHOR_PUBKEY);

			const result = await updateTask(TASK_ID, { status: TaskStatusEnum.COMPLETED });

			expect(result).toBeDefined();
			expect(nostrEventsService.requestEvents).toHaveBeenCalled();
			expect(getNpub).toHaveBeenCalled();
		});

		it('allows update when pubkeys match case-insensitively', async () => {
			const { getNpub } = await import('$lib/utils/nostrKeys');
			// Task has lowercase pubkey, user provides uppercase - should still match
			const taskEvent = createTaskEvent(TASK_AUTHOR_PUBKEY.toLowerCase(), D_TAG);
			vi.mocked(nostrEventsService.requestEvents).mockResolvedValueOnce({
				data: [taskEvent]
			} as unknown as Awaited<ReturnType<typeof nostrEventsService.requestEvents>>);

			vi.mocked(getNpub).mockResolvedValue(TASK_AUTHOR_PUBKEY.toUpperCase());

			const result = await updateTask(TASK_ID, { status: TaskStatusEnum.COMPLETED });

			expect(result).toBeDefined();
		});
	});
});

describe('completeTask', () => {
	const eventId = 'c'.repeat(64);

	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('publishes COMPLETED for the task behind a contract event id', async () => {
		const { getNpub } = await import('$lib/utils/nostrKeys');
		vi.mocked(getNpub).mockResolvedValue(TASK_AUTHOR_PUBKEY);
		vi.mocked(nostrEventsService.requestEvents)
			.mockResolvedValueOnce({ data: [] } as unknown as Awaited<
				ReturnType<typeof nostrEventsService.requestEvents>
			>)
			.mockResolvedValueOnce({
				data: [createTaskEvent(TASK_AUTHOR_PUBKEY, D_TAG)]
			} as unknown as Awaited<ReturnType<typeof nostrEventsService.requestEvents>>);
		vi.mocked(nostrEventsService.findEventById).mockResolvedValue({
			data: { ...createTaskEvent(TASK_AUTHOR_PUBKEY, D_TAG), id: eventId }
		} as unknown as Awaited<ReturnType<typeof nostrEventsService.findEventById>>);

		await expect(completeTask(eventId)).resolves.toBe(true);

		const signed = vi.mocked(getSignedEvent).mock.calls[0]?.[0];
		expect(signed?.tags).toEqual(expect.arrayContaining([['S', TaskStatusEnum.COMPLETED]]));
		expect(signed?.content).toContain(TaskStatusEnum.COMPLETED);
	});

	it('does not republish a task that is already completed', async () => {
		const done = createTaskEvent(TASK_AUTHOR_PUBKEY, D_TAG);
		done.content = JSON.stringify(createTaskContent({ status: TaskStatusEnum.COMPLETED }));
		vi.mocked(nostrEventsService.requestEvents).mockResolvedValue({
			data: [done]
		} as unknown as Awaited<ReturnType<typeof nostrEventsService.requestEvents>>);

		await expect(completeTask(D_TAG)).resolves.toBe(true);
		expect(getSignedEvent).not.toHaveBeenCalled();
	});
});

describe('assignTask', () => {
	const bidId = 'd'.repeat(64);

	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(queryRelayEvents).mockResolvedValue([]);
	});

	it('publishes BID_ACCEPTED and the accepted bid from the relay when the indexer is empty', async () => {
		const { getNpub } = await import('$lib/utils/nostrKeys');
		vi.mocked(getNpub).mockResolvedValue(TASK_AUTHOR_PUBKEY);
		const open = createTaskEvent(TASK_AUTHOR_PUBKEY, D_TAG);
		open.tags = [
			['d', D_TAG],
			['S', TaskStatusEnum.OPEN]
		];
		vi.mocked(queryRelayEvents).mockResolvedValue([open]);

		await expect(assignTask(D_TAG, bidId)).resolves.toBe(true);

		const taskLookup = vi
			.mocked(nostrEventsService.requestEvents)
			.mock.calls.some((call) => JSON.stringify(call[0]).includes(String(KINDS.TASK_CREATION)));
		expect(taskLookup).toBe(false);
		const signed = vi.mocked(getSignedEvent).mock.calls[0]?.[0];
		expect(signed?.tags).toEqual(
			expect.arrayContaining([
				['S', TaskStatusEnum.BID_ACCEPTED],
				['acceptedBid', bidId]
			])
		);
		expect(signed?.content).toContain(TaskStatusEnum.BID_ACCEPTED);
	});

	it('returns false when neither the relay nor the indexer has the task', async () => {
		vi.mocked(nostrEventsService.requestEvents).mockResolvedValue({
			data: []
		} as unknown as Awaited<ReturnType<typeof nostrEventsService.requestEvents>>);

		await expect(assignTask('missing-task', bidId)).resolves.toBe(false);
		expect(getSignedEvent).not.toHaveBeenCalled();
	});
});
