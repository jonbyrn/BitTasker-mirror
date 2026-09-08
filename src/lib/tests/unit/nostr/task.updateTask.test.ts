import { describe, it, expect, vi, beforeEach } from 'vitest';
import { updateTask } from '$lib/nostr/task';
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
