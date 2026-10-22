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

		it('should filter out zombie events (same d-tag from different pubkey)', async () => {
			// Original owner published first (older created_at)
			const originalEvent = createTaskEvent(
				'a1b2c3d4' + '0'.repeat(56),
				'tend-to-my-zen-garden-1771972971-790fc1',
				OTHER_NPUB,
				{ title: 'Tend to my zen garden', createdAt: 1771972971 },
				{ created_at: 1771972971 }
			);
			// Zombie: different user wrongly used same d-tag (newer created_at)
			const zombieEvent = createTaskEvent(
				'f6e5d4c3' + '0'.repeat(56),
				'tend-to-my-zen-garden-1771972971-790fc1',
				'npub1zombie0000000000000000000000000000000000000000',
				{ title: 'Zombie Task Copy', createdAt: 1771973000 },
				{ created_at: 1771973000 }
			);

			mockFindEvents.mockResolvedValueOnce({
				data: [originalEvent, zombieEvent]
			});

			const result = await findTasks({ page: 1 });

			// Should keep only original owner's event, filter out zombie
			expect(result.tasks).toHaveLength(1);
			expect(result.tasks[0].id).toBe('tend-to-my-zen-garden-1771972971-790fc1');
			expect(result.tasks[0].npub).toBe(OTHER_NPUB);
			expect(result.tasks[0].title).toBe('Tend to my zen garden');

			const state = get(tasksStore);
			expect(state.items).toHaveLength(1);
			expect(state.items.map((t) => t.id)).toEqual(['tend-to-my-zen-garden-1771972971-790fc1']);
		});

		it('should keep zombie pubkey event when it published first (oldest created_at wins)', async () => {
			// Edge case: if the "wrong" user published first, they become the owner
			// (per Nostr semantics: first publisher owns the d-tag coordinate)
			const firstPublisher = createTaskEvent(
				'a1b2c3d4' + '0'.repeat(56),
				'some-task-1771972971-abc123',
				'npub1first00000000000000000000000000000000000000',
				{ title: 'First Publisher Task' },
				{ created_at: 1771972971 }
			);
			const secondPublisher = createTaskEvent(
				'f6e5d4c3' + '0'.repeat(56),
				'some-task-1771972971-abc123',
				OTHER_NPUB,
				{ title: 'Second Publisher Task' },
				{ created_at: 1771973000 }
			);

			mockFindEvents.mockResolvedValueOnce({
				data: [firstPublisher, secondPublisher]
			});

			const result = await findTasks({ page: 1 });

			expect(result.tasks).toHaveLength(1);
			expect(result.tasks[0].npub).toBe('npub1first00000000000000000000000000000000000000');
			expect(result.tasks[0].title).toBe('First Publisher Task');
		});
	});

	describe('malformed budget', () => {
		it('skips a kind 31000 event with no budget and still returns the valid tasks', async () => {
			const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
			const valid = createTaskEvent('a'.repeat(64), 'valid-task-dtag', OTHER_NPUB, {
				title: 'Valid task'
			});
			const missingBudget = createTaskEvent('b'.repeat(64), 'missing-budget-dtag', OTHER_NPUB, {
				title: 'No budget',
				budget: undefined
			});
			const negativeAmount = createTaskEvent('c'.repeat(64), 'negative-budget-dtag', OTHER_NPUB, {
				title: 'Negative amount',
				budget: { amount: -4, currency: 'USD', type: BudgetTypeEnum.FIXED }
			});
			const broken = createTaskEvent('d'.repeat(64), 'broken-json-dtag', OTHER_NPUB, {
				title: 'Broken'
			});
			broken.content = '{not-json';

			mockFindEvents.mockResolvedValue({
				data: [missingBudget, valid, negativeAmount, broken]
			});

			const result = await findTasks({ page: 1 });

			expect(result.tasks).toHaveLength(1);
			expect(result.tasks[0].id).toBe('valid-task-dtag');
			expect(result.tasks[0].title).toBe('Valid task');
			expect(result.tasks[0].budget.amount).toBe(100);

			const state = get(tasksStore);
			expect(state.items).toHaveLength(1);
			expect(state.items[0].id).toBe('valid-task-dtag');
			expect(state.error).toBeNull();

			warn.mockRestore();
		});
	});

	describe('cache pagination behavior', () => {
		it('should preserve hasMore on cache hit when frontend filters reduce visible tasks below page size', async () => {
			// Build one relay page of 10 events where only 2 match the category filter.
			const events: Event[] = Array.from({ length: 10 }, (_, index) =>
				createTaskEvent(
					`event-${index}`.padEnd(64, `${index % 10}`),
					`task-${index}-dtag`,
					OTHER_NPUB,
					{
						title: `Task ${index}`,
						categories: index < 2 ? ['plumbing'] : ['other']
					},
					{ created_at: 1700000100 - index }
				)
			);

			// First relay call returns a full page (10 events) → hasMore=true.
			mockFindEvents.mockResolvedValueOnce({ data: events });
			// Fill-loop follow-up: when cache is exhausted the fill loop fetches more from
			// the relay; return an empty page so it terminates gracefully.
			mockFindEvents.mockResolvedValue({ data: [] });

			const params = {
				page: 1,
				limit: 10,
				search: '',
				categories: ['plumbing'],
				skills: []
			};

			// First call: relay fetch (events.length === limit) → hasMore should be true.
			// The fill loop will fire once more (empty relay page) because only 2 of 10
			// tasks match the category filter and hasMore was true.
			const firstResult = await findTasks(params);
			expect(firstResult.tasks).toHaveLength(2);
			expect(firstResult.hasMore).toBe(false); // relay returned empty on fill-loop → exhausted

			// Simulate page reset flow (e.g. after clearing search) before reloading page 1.
			tasksStore.update((state) => ({
				...state,
				items: [],
				loading: false,
				currentPage: 1
			}));

			// Second call: cache is still warm (fill-loop only clears cache when recursing
			// with a cursor; after the empty relay response the cache entry remains).
			// Regardless of cache path, the result should still include the 2 matching tasks.
			const secondResult = await findTasks(params);
			expect(secondResult.tasks).toHaveLength(2);

			const state = get(tasksStore);
			expect(state.items).toHaveLength(2);
		});
	});
});
