import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { get } from 'svelte/store';
import { findTasks, cleanup } from '$lib/nostr/findTasks';
import { tasksStore } from '$lib/stores/task.store';
import nostrEventsService from '$lib/api/services/nostr/events';
import { queryListingRelays } from '$lib/nostr/listing-relays';
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

vi.mock('$lib/nostr/listing-relays', async () => {
	const actual = await vi.importActual<typeof import('$lib/nostr/listing-relays')>(
		'$lib/nostr/listing-relays'
	);
	return {
		...actual,
		queryListingRelays: vi.fn().mockResolvedValue([])
	};
});

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
		vi.unstubAllEnvs();
		vi.unstubAllGlobals();
	});

	it('keeps a catalog task when the public relay only returns other apps', async () => {
		const junk = {
			id: 'ab'.repeat(32),
			pubkey: 'cd'.repeat(32),
			created_at: 1700000000,
			kind: KINDS.TASK_CREATION,
			tags: [['d', 'not-a-task']],
			content: JSON.stringify({ node_id: 'other-app' }),
			sig: ''
		} as Event;
		const catalogTask = createTaskEvent('11'.repeat(32), 'catalog-task', OTHER_NPUB, {
			title: 'Catalog task'
		});
		mockFindEvents.mockResolvedValueOnce({ data: [junk] });
		vi.mocked(queryListingRelays).mockResolvedValueOnce([catalogTask]);

		const result = await findTasks({ page: 1 });

		expect(result.tasks.map((task) => task.title)).toEqual(['Catalog task']);
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

	it('drops relay events that are not tasks', async () => {
		const task = createTaskEvent('aabbccdd' + '0'.repeat(56), 'solve-the-mystery', OTHER_NPUB, {
			title: 'Solve the mystery'
		});
		const agentProfile = createTaskEvent('b'.repeat(64), 'agent-profile', OTHER_NPUB);
		agentProfile.content = JSON.stringify({ node_id: 'agent_9bc0', name: '本灵' });
		const encrypted = createTaskEvent('c'.repeat(64), 'encrypted', OTHER_NPUB);
		encrypted.content = 'enc1:not-json';

		mockFindEvents.mockResolvedValueOnce({ data: [agentProfile, task, encrypted] });

		const result = await findTasks({ page: 1, search: 'mystery' });

		expect(result.tasks.map((item) => item.title)).toEqual(['Solve the mystery']);
	});

	it('reads the task relay when the indexer returns no tasks', async () => {
		vi.stubEnv('VITE_NOSTR_RELAY_URL', 'wss://nos.lol');
		vi.stubEnv('VITE_NOSTR_TASK_RELAY_URL', 'wss://relay2.bittasker.com');
		const event = createTaskEvent('aabbccdd' + '0'.repeat(56), 'solve-the-mystery', OTHER_NPUB, {
			title: 'Solve the mystery'
		});
		mockFindEvents.mockResolvedValueOnce({ data: [] });
		const opened: string[] = [];

		const requested: unknown[] = [];
		class FakeSocket {
			onopen: (() => void) | null = null;
			onmessage: ((message: { data: string }) => void) | null = null;
			onerror: (() => void) | null = null;
			readyState = 1;
			constructor(url: string) {
				opened.push(url);
				queueMicrotask(() => this.onopen?.());
			}
			send(payload: string) {
				const frame = JSON.parse(payload) as [string, string, unknown];
				requested.push(frame[2]);
				this.onmessage?.({ data: JSON.stringify(['EVENT', frame[1], event]) });
				this.onmessage?.({ data: JSON.stringify(['EOSE', frame[1]]) });
			}
			close() {
				this.readyState = 3;
			}
		}

		vi.stubGlobal('WebSocket', FakeSocket);
		const result = await findTasks({ page: 1, search: 'mystery' });

		expect(opened).toEqual(['wss://relay2.bittasker.com']);
		expect(requested).toEqual([{ kinds: [KINDS.TASK_CREATION], limit: 10 }]);
		expect(result.tasks.map((task) => task.title)).toEqual(['Solve the mystery']);
	});

	it('does not read production task relays from the sandbox', async () => {
		vi.stubEnv('VITE_CLIENT_HOSTNAME', 'rgb.bittasker.com');
		vi.stubEnv('VITE_NOSTR_RELAY_URL', 'wss://nos.lol');
		vi.stubEnv('VITE_NOSTR_TASK_RELAY_URL', 'wss://relay2.bittasker.com');
		vi.stubEnv('VITE_NOSTR_LISTING_RELAY_URL', 'wss://relay2.bittasker.com');
		mockFindEvents.mockResolvedValueOnce({ data: [] });
		const opened: string[] = [];
		class FakeSocket {
			onopen: (() => void) | null = null;
			onmessage: ((message: { data: string }) => void) | null = null;
			onerror: (() => void) | null = null;
			readyState = 1;
			constructor(url: string) {
				opened.push(url);
			}
			send() {}
			close() {
				this.readyState = 3;
			}
		}
		vi.stubGlobal('WebSocket', FakeSocket);
		const result = await findTasks({ page: 1 });
		expect(opened).toEqual([]);
		expect(result.tasks).toEqual([]);
	});

	// The NIP-50 iterative relay fallback loop (multi-round fetch, fill-loop, and
	// MAX_CONSECUTIVE_EMPTY early-exit) was removed from findTasks during the native
	// migration. findTasks now performs a single findEvents query per call. The
	// fallback/pagination tests that exercised that loop were removed with it.
});
