import { ndk } from '$lib/nostr/ndk';
import KINDS from '$lib/utils/constants/kinds';
import type { NDKFilter } from '@nostr-dev-kit/ndk';
import { normalizeNostrPubkey } from '$lib/utils/nostr-pubkey';
import { createDebug } from '$lib/utils/debug';
import type { Task } from '$lib/types/task';

const d = createDebug('nostr:findProfileTasks');

/**
 * Parse a raw Nostr event into a Task object.
 * Mirrors the pattern in findMyTasks.ts and findTasks.ts:
 * - JSON.parse(event.content) for task data
 * - Merge with event-level fields (id, pubkey, created_at)
 * - Try-catch for resilience against malformed events
 */
function parseProfileTaskEvent(event: {
	id?: string;
	pubkey: string;
	kind: number;
	content: string;
	created_at: number;
}): Task | null {
	try {
		const contentData = JSON.parse(event.content);
		return {
			...contentData,
			id: event.id ?? contentData.id ?? '',
			npub: event.pubkey,
			createdAt: contentData.createdAt ?? event.created_at
		} as Task;
	} catch (err) {
		d.log('Failed to parse task event:', event.id?.slice(0, 8), err);
		return null;
	}
}

/**
 * Fetch tasks created by a specific author using NDK.
 * Uses ndk.subscribe with closeOnEose, matching the pattern in reviews/queries.ts.
 * Returns tasks sorted by createdAt descending.
 */
export async function findProfileTasksByAuthor(
	authorPubkey: string,
	limit: number = 8
): Promise<Task[]> {
	const hexPubkey = normalizeNostrPubkey(authorPubkey);
	if (!hexPubkey) {
		d.log('Invalid pubkey:', authorPubkey);
		return [];
	}

	const filter: NDKFilter = {
		kinds: [KINDS.TASK_CREATION as number],
		authors: [hexPubkey],
		limit
	};

	d.log('Fetching profile tasks for', hexPubkey.slice(0, 8), 'limit', limit);

	const tasks: Task[] = [];

	return new Promise((resolve) => {
		let resolved = false;
		const timeout = setTimeout(() => {
			if (!resolved) {
				resolved = true;
				d.log('Timeout - returning', tasks.length, 'tasks');
				resolve(tasks);
			}
		}, 10000);

		const sub = ndk.subscribe(filter, { closeOnEose: true });

		sub.on('event', (event) => {
			try {
				const parsed = parseProfileTaskEvent(event);
				if (parsed) {
					tasks.push(parsed);
				}
			} catch (err) {
				d.log('Error in task event handler:', err);
			}
		});

		sub.on('eose', () => {
			if (!resolved) {
				resolved = true;
				clearTimeout(timeout);
				tasks.sort((a, b) => b.createdAt - a.createdAt);
				d.log('Eose - returning', tasks.length, 'tasks');
				resolve(tasks);
			}
		});

		sub.on('error', (err) => {
			if (!resolved) {
				resolved = true;
				clearTimeout(timeout);
				d.log('Task subscription error:', err);
				resolve(tasks);
			}
		});

		sub.start();
	});
}
