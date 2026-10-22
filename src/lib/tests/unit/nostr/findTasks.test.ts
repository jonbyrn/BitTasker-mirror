import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { get } from 'svelte/store';
import { findTasks, cleanup } from '$lib/nostr/findTasks';
import { beginTasksSearch } from '$lib/search/search-epoch';
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

	describe('NIP-50 fallback early exit', () => {
		it('keeps paging when the first unfiltered page has no literal match', async () => {
			// Relay NIP-50 search returns 0, so the client scans catalog pages.
			// A full page with no match must not be cached as "term not found".
			const events: Event[] = Array.from({ length: 10 }, (_, index) =>
				createTaskEvent(
					`event-${index}`.padEnd(64, `${index % 10}`),
					`task-${index}-dtag`,
					OTHER_NPUB,
					{ title: `Task ${index} about plumbing` },
					{ created_at: 1700000100 - index }
				)
			);

			mockFindEvents.mockResolvedValueOnce({ data: [] });
			mockFindEvents.mockResolvedValueOnce({ data: events });
			mockFindEvents.mockResolvedValue({ data: [] });

			const result = await findTasks({
				page: 1,
				limit: 10,
				search: 'nonexistent-term'
			});

			expect(result.tasks).toHaveLength(0);
			expect(result.hasMore).toBe(false);
			// Page 1 search + unfiltered page, then page 2 search + empty page.
			expect(mockFindEvents).toHaveBeenCalledTimes(4);

			expect(mockFindEvents.mock.calls[0][0].search).toBe('nonexistent-term');
			expect(mockFindEvents.mock.calls[1][0].search).toBeUndefined();
			expect(mockFindEvents.mock.calls[2][0].search).toBe('nonexistent-term');
		});

		it('should accumulate visible tasks when fallback returns matches', async () => {
			// Scenario: relay search returns 0, fallback returns 10 tasks,
			// frontend filter matches 3 of them
			const matchingEvents: Event[] = Array.from({ length: 3 }, (_, index) =>
				createTaskEvent(
					`match-${index}`.padEnd(64, `${index % 10}`),
					`match-task-${index}`,
					OTHER_NPUB,
					{ title: `Urgent plumbing repair ${index}` },
					{ created_at: 1700000100 - index }
				)
			);
			const nonMatchingEvents: Event[] = Array.from({ length: 7 }, (_, index) =>
				createTaskEvent(
					`other-${index}`.padEnd(64, `${(index + 3) % 10}`),
					`other-task-${index}`,
					OTHER_NPUB,
					{ title: `Electrical work ${index}` },
					{ created_at: 1700000000 - index }
				)
			);
			const allEvents = [...matchingEvents, ...nonMatchingEvents];

			// Relay search returns 0 (triggers fallback)
			mockFindEvents.mockResolvedValueOnce({ data: [] });
			// Fallback returns all 10 events
			mockFindEvents.mockResolvedValueOnce({ data: allEvents });
			// If fill loop continues, return empty to terminate
			mockFindEvents.mockResolvedValue({ data: [] });

			const result = await findTasks({
				page: 1,
				limit: 10,
				search: 'plumbing'
			});

			// Should return 3 matching tasks
			expect(result.tasks).toHaveLength(3);
			expect(result.tasks.every((t) => t.title.includes('plumbing'))).toBe(true);

			// 4 calls: round 1 (search + fallback) + round 2 (search + fallback, both empty → early exit)
			// Round 2 fires because 3 visible < limit(10) and hasMore=true
			expect(mockFindEvents).toHaveBeenCalledTimes(4);
		});

		it('should break after MAX_CONSECUTIVE_EMPTY rounds when tasks are all filtered (no fallback)', async () => {
			// Scenario: relay returns events, but frontend filter removes all
			// (e.g., category filter doesn't match). No NIP-50 fallback involved.
			const events: Event[] = Array.from({ length: 10 }, (_, index) =>
				createTaskEvent(
					`event-${index}`.padEnd(64, `${index % 10}`),
					`task-${index}-dtag`,
					OTHER_NPUB,
					{ title: `Task ${index}`, categories: ['other'] },
					{ created_at: 1700000100 - index }
				)
			);

			// Round 1: 10 events, 0 match category "plumbing"
			mockFindEvents.mockResolvedValueOnce({ data: events });
			// Round 2: 10 events, 0 match
			mockFindEvents.mockResolvedValueOnce({ data: events });
			// Should not reach round 3

			const result = await findTasks({
				page: 1,
				limit: 10,
				categories: ['plumbing']
			});

			expect(result.tasks).toHaveLength(0);
			// Should break after 2 consecutive empty rounds (MAX_CONSECUTIVE_EMPTY = 2)
			// not continue to 10 rounds
			expect(mockFindEvents).toHaveBeenCalledTimes(2);
		});
	});

	describe('cache coherence with fallback', () => {
		it('caches an exhausted scan so the same empty search does not hit the relay again', async () => {
			const events: Event[] = Array.from({ length: 3 }, (_, index) =>
				createTaskEvent(
					`event-${index}`.padEnd(64, `${index % 10}`),
					`task-${index}-dtag`,
					OTHER_NPUB,
					{ title: `Task ${index}` },
					{ created_at: 1700000100 - index }
				)
			);

			const params = { page: 1, limit: 10, search: 'xyz-nonexistent' };

			// Search miss, then a short catalog page (shorter than the limit) so the scan ends.
			mockFindEvents.mockResolvedValueOnce({ data: [] });
			mockFindEvents.mockResolvedValueOnce({ data: events });

			const firstResult = await findTasks(params);
			expect(firstResult.tasks).toHaveLength(0);
			expect(firstResult.hasMore).toBe(false);
			expect(mockFindEvents).toHaveBeenCalledTimes(2);

			// Reset store for second call
			tasksStore.update((state) => ({
				...state,
				items: [],
				loading: false,
				currentPage: 1
			}));

			// Second call: should hit cache and NOT make any relay calls
			mockFindEvents.mockClear();
			const secondResult = await findTasks(params);
			expect(secondResult.tasks).toHaveLength(0);
			expect(secondResult.hasMore).toBe(false);
			// No relay calls — cache served the result with hasMore: false
			expect(mockFindEvents).toHaveBeenCalledTimes(0);
		});
	});

	describe('malformed kind 31000 events', () => {
		it('lists real tasks when the page includes a budget-less probe and invalid JSON', async () => {
			const real = createTaskEvent(
				'a'.repeat(64),
				'real-task-dtag',
				OTHER_NPUB,
				{ title: 'Polish my English CV' },
				{ created_at: 1700000000 }
			);
			const probe = createTaskEvent(
				'b'.repeat(64),
				'auth-url-probe-dtag',
				OTHER_NPUB,
				{ title: 'auth url probe' },
				{ created_at: 1700000002 }
			);
			probe.content = JSON.stringify({ title: 'auth url probe' });
			const broken = createTaskEvent(
				'c'.repeat(64),
				'broken-json-dtag',
				OTHER_NPUB,
				{ title: 'broken' },
				{ created_at: 1699999990 }
			);
			broken.content = '{';

			mockFindEvents.mockResolvedValueOnce({ data: [probe, real, broken] });

			const result = await findTasks({ page: 1, limit: 10 });

			expect(result.tasks).toHaveLength(1);
			expect(result.tasks[0].title).toBe('Polish my English CV');
			expect(result.tasks[0].budget.amount).toBe(100);
			expect(get(tasksStore).items.map((task) => task.title)).toEqual(['Polish my English CV']);
			expect(get(tasksStore).error).toBeNull();
			expect(get(tasksStore).loading).toBe(false);
			// The oldest raw event still advances the cursor, including the unparsed one.
			expect(get(tasksStore).lastRelayTimestamp).toBe(1699999990);
		});
	});

	describe('cache pagination behavior', () => {
		it('publishes the first page before later relay rounds finish', async () => {
			const visible = Array.from({ length: 2 }, (_, index) =>
				createTaskEvent(
					`vis-${index}`.padEnd(64, 'a'),
					`vis-${index}`,
					OTHER_NPUB,
					{ title: `Visible ${index}` },
					{ created_at: 1700000200 - index }
				)
			);
			const probes = Array.from({ length: 8 }, (_, index) =>
				createTaskEvent(
					`probe-${index}`.padEnd(64, 'b'),
					`probe-${index}`,
					OTHER_NPUB,
					{ title: 'relay probe', budget: undefined },
					{ created_at: 1700000100 - index }
				)
			);

			let releaseSecond: (value: { data: Event[] }) => void = () => undefined;
			mockFindEvents.mockResolvedValueOnce({ data: [...visible, ...probes] });
			mockFindEvents.mockImplementationOnce(
				() =>
					new Promise((resolve) => {
						releaseSecond = resolve;
					})
			);

			const pending = findTasks({ page: 1, limit: 10 });
			await vi.waitFor(() => {
				const state = get(tasksStore);
				expect(state.loading).toBe(true);
				expect(state.items).toHaveLength(2);
			});

			releaseSecond({ data: [] });
			const result = await pending;
			expect(result.tasks).toHaveLength(2);
			expect(get(tasksStore).loading).toBe(false);
		});

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

	it('does not let an older search overwrite a newer one', async () => {
		let releaseOlder: (value: { data: Event[] }) => void = () => {};
		mockFindEvents.mockImplementationOnce(
			() =>
				new Promise((resolve) => {
					releaseOlder = resolve;
				})
		);
		const olderEpoch = beginTasksSearch();
		const older = findTasks({ page: 1, limit: 5, search: 'plumber' }, olderEpoch);
		await vi.waitFor(() => {
			expect(mockFindEvents).toHaveBeenCalled();
		});

		mockFindEvents.mockResolvedValueOnce({
			data: [
				createTaskEvent('2'.repeat(64), 'electrician-task', OTHER_NPUB, {
					title: 'Electrician visit'
				})
			]
		});
		const newerEpoch = beginTasksSearch();
		await findTasks({ page: 1, limit: 5, search: 'electrician' }, newerEpoch);
		expect(get(tasksStore).items.map((task) => task.title)).toEqual(['Electrician visit']);

		releaseOlder({
			data: [
				createTaskEvent('4'.repeat(64), 'plumber-task', OTHER_NPUB, {
					title: 'Plumber visit'
				})
			]
		});
		await older;
		expect(get(tasksStore).items.map((task) => task.title)).toEqual(['Electrician visit']);
	});
});
