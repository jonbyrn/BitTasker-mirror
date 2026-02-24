import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { get } from 'svelte/store';
import { findTasks, cleanup } from '$lib/nostr/findTasks';
import { tasksStore } from '$lib/stores/task.store';
import nostrEventsService from '$lib/api/services/nostr/events';
import { Preferences } from '@capacitor/preferences';
import type { Event } from 'nostr-tools';
import KINDS from '$lib/utils/constants/kinds';
import { BudgetTypeEnum, TaskStatusEnum, TaskTypeEnum } from '$lib/utils/enums/task.enum';

const DUPLICATE_D_TAG = 'limpieza-y-organizacin-profunda-de-la-cocina-1771124933-4d31ba';
const OTHER_NPUB = 'npub1other000000000000000000000000000000000000000';
const MY_NPUB = 'npub1myuser0000000000000000000000000000000000000000';

/** Minimal task content for Nostr event */
function createTaskContent(overrides: Record<string, unknown> = {}) {
	return {
		title: 'Test Task',
		description: 'Description',
		status: TaskStatusEnum.OPEN,
		taskType: TaskTypeEnum.IN_PERSON,
		estimatedHours: 1,
		budget: { amount: 100, currency: 'USD', type: BudgetTypeEnum.FIXED },
		deadline: null,
		dateRange: null,
		pickupLocation: null,
		dropOffLocation: null,
		skills: [],
		categories: [],
		isRemovals: false,
		isBoosted: false,
		boostPercentage: null,
		createdAt: 1700000000,
		updatedAt: '',
		completedAt: null,
		cancelledAt: null,
		deletedAt: null,
		isDeleted: false,
		requiredSkills: [],
		...overrides
	};
}

/** Create a Nostr-like event for task creation */
function createTaskEvent(
	eventId: string,
	dTag: string,
	pubkey: string,
	contentOverrides: Record<string, unknown> = {},
	eventOverrides: { created_at?: number } = {}
): Event {
	return {
		id: eventId,
		pubkey,
		created_at: 1700000000,
		kind: KINDS.TASK_CREATION,
		tags: [['d', dTag]],
		content: JSON.stringify(createTaskContent(contentOverrides)),
		sig: '',
		...eventOverrides
	};
}

vi.mock('$lib/api/services/nostr/events', () => ({
	default: {
		findEvents: vi.fn()
	}
}));

describe('findTasks', () => {
	const mockFindEvents = vi.mocked(nostrEventsService.findEvents);

	beforeEach(async () => {
		vi.clearAllMocks();
		cleanup();
		tasksStore.update((s) => ({ ...s, items: [], loading: false }));
		vi.mocked(Preferences.get).mockResolvedValue({ value: MY_NPUB });
	});

	afterEach(() => {
		cleanup();
	});

	describe('deduplication by task.id', () => {
		it('should deduplicate tasks when API returns duplicate events with same d-tag', async () => {
			// Simulate multiple relays returning the same task (same d-tag, different event ids)
			const event1 = createTaskEvent('a1b2c3d4e5f6' + '0'.repeat(52), DUPLICATE_D_TAG, OTHER_NPUB, {
				title: 'Task A'
			});
			const event2 = createTaskEvent('f6e5d4c3b2a1' + '0'.repeat(52), DUPLICATE_D_TAG, OTHER_NPUB, {
				title: 'Task A'
			});

			mockFindEvents.mockResolvedValueOnce({
				data: [event1, event2]
			});

			const result = await findTasks({ page: 1 });

			// Should return only 1 unique task, not 2
			expect(result.tasks).toHaveLength(1);
			expect(result.tasks[0].id).toBe(DUPLICATE_D_TAG);

			// Store should also have unique items (no duplicate keys for Svelte each block)
			const state = get(tasksStore);
			expect(state.items).toHaveLength(1);
			const ids = state.items.map((t) => t.id);
			expect(ids).toEqual([DUPLICATE_D_TAG]);
		});

		it('should keep the most recent event when duplicate d-tags (replaceable addressable events)', async () => {
			// Older event (created first)
			const olderEvent = createTaskEvent(
				'a1b2c3d4' + '0'.repeat(56),
				DUPLICATE_D_TAG,
				OTHER_NPUB,
				{ title: 'Original Title', createdAt: 1700000000 },
				{ created_at: 1700000000 }
			);
			// Newer event (replaceable - same d-tag, later created_at)
			const newerEvent = createTaskEvent(
				'f6e5d4c3' + '0'.repeat(56),
				DUPLICATE_D_TAG,
				OTHER_NPUB,
				{ title: 'Updated Title', createdAt: 1700000100 },
				{ created_at: 1700000100 }
			);

			// API returns older first, then newer
			mockFindEvents.mockResolvedValueOnce({
				data: [olderEvent, newerEvent]
			});

			const result = await findTasks({ page: 1 });

			expect(result.tasks).toHaveLength(1);
			expect(result.tasks[0].id).toBe(DUPLICATE_D_TAG);
			// Should keep the most recent (updated) version
			expect(result.tasks[0].title).toBe('Updated Title');
			expect(result.tasks[0].createdAt).toBe(1700000100);
		});

		it('should keep most recent when newer event appears first in API response', async () => {
			const olderEvent = createTaskEvent(
				'a1b2c3d4' + '0'.repeat(56),
				DUPLICATE_D_TAG,
				OTHER_NPUB,
				{ title: 'Original Title' },
				{ created_at: 1700000000 }
			);
			const newerEvent = createTaskEvent(
				'f6e5d4c3' + '0'.repeat(56),
				DUPLICATE_D_TAG,
				OTHER_NPUB,
				{ title: 'Updated Title' },
				{ created_at: 1700000100 }
			);

			// API returns newer first, then older
			mockFindEvents.mockResolvedValueOnce({
				data: [newerEvent, olderEvent]
			});

			const result = await findTasks({ page: 1 });

			expect(result.tasks).toHaveLength(1);
			expect(result.tasks[0].title).toBe('Updated Title');
			expect(result.tasks[0].createdAt).toBe(1700000100);
		});

		it('should keep tasks with different d-tags', async () => {
			const event1 = createTaskEvent('a'.repeat(64), 'task-one-1700000000-abc123', OTHER_NPUB, {
				title: 'Task One'
			});
			const event2 = createTaskEvent('b'.repeat(64), 'task-two-1700000001-def456', OTHER_NPUB, {
				title: 'Task Two'
			});

			mockFindEvents.mockResolvedValueOnce({
				data: [event1, event2]
			});

			const result = await findTasks({ page: 1 });

			expect(result.tasks).toHaveLength(2);
			expect(result.tasks.map((t) => t.id).sort()).toEqual([
				'task-one-1700000000-abc123',
				'task-two-1700000001-def456'
			]);
		});
	});
});
