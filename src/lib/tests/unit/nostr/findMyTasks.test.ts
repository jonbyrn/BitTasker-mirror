import { beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import nostrEventsService from '$lib/api/services/nostr/events';
import { cleanupMyTasks, findMyTasks } from '$lib/nostr/findMyTasks';
import { myTasksStore } from '$lib/stores/task.store';
import { getNpub } from '$lib/utils/nostrKeys';
import KINDS from '$lib/utils/constants/kinds';

const AUTHOR = 'b4d8e5b172938c1848b1eb4c77c09cbe4acd67cbb717f147450b60b961a5f0d8';
const querySync = vi.hoisted(() => vi.fn());
const close = vi.hoisted(() => vi.fn());

vi.mock('$lib/api/services/nostr/events', () => ({
	default: { findEvents: vi.fn() }
}));

vi.mock('$lib/utils/nostrKeys', () => ({
	getNpub: vi.fn()
}));

vi.mock('nostr-tools', async () => {
	const actual = await vi.importActual<typeof import('nostr-tools')>('nostr-tools');
	return {
		...actual,
		SimplePool: class {
			querySync = querySync;
			close = close;
		}
	};
});

function taskEvent(title: string) {
	return {
		id: '332469c6b1bf33daf93e5ab50e6b2106c612da79ad8d05a6fdf2e89bd6d1d590',
		pubkey: AUTHOR,
		created_at: 1790257586,
		kind: KINDS.TASK_CREATION,
		tags: [
			['d', 'solve-the-mystery-1790257586748'],
			['S', 'OPEN']
		],
		content: JSON.stringify({ title, status: 'OPEN' }),
		sig: ''
	};
}

describe('findMyTasks', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		cleanupMyTasks();
		myTasksStore.reset();
		vi.stubEnv('VITE_NOSTR_RELAY_URL', 'wss://nos.lol');
		vi.mocked(getNpub).mockResolvedValue(AUTHOR);
	});

	it('uses indexer events when the API returns tasks', async () => {
		vi.mocked(nostrEventsService.findEvents).mockResolvedValue({ data: [taskEvent('Indexed')] });

		const result = await findMyTasks({ page: 1 });

		expect(result.tasks.map((task) => task.title)).toEqual(['Indexed']);
		expect(querySync).not.toHaveBeenCalled();
	});

	it('reads the task relay when the indexer has no tasks', async () => {
		vi.stubEnv('VITE_NOSTR_RELAY_URL', 'wss://nos.lol');
		vi.stubEnv('VITE_NOSTR_TASK_RELAY_URL', 'wss://relay2.bittasker.com');
		vi.mocked(nostrEventsService.findEvents).mockResolvedValue({ data: [] });
		const opened: string[] = [];
		const event = taskEvent('Solve the mystery');

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
				this.onmessage?.({ data: JSON.stringify(['EVENT', frame[1], event]) });
				this.onmessage?.({ data: JSON.stringify(['EOSE', frame[1]]) });
			}
			close() {
				this.readyState = 3;
			}
		}

		vi.stubGlobal('WebSocket', FakeSocket);
		const result = await findMyTasks({ page: 1, refresh: true });

		expect(opened).toEqual(['wss://relay2.bittasker.com']);
		expect(result.tasks).toHaveLength(1);
		expect(result.tasks[0]?.title).toBe('Solve the mystery');
		expect(get(myTasksStore).items[0]?.title).toBe('Solve the mystery');
	});
});
