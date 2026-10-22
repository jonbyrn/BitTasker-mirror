import { BROWSE_CATALOG_PAGE, dedupeReplaceableTasks } from '$lib/browse/task-board';
import { listingRelayUrls } from '$lib/nostr/listing-relays';
import { parseTaskEvent } from '$lib/nostr/parseTaskEvent';
import { queryRelayEvents } from '$lib/nostr/relayQuery';
import type { Task } from '$lib/types/task.d';
import KINDS from '$lib/utils/constants/kinds';
import type { Event, Filter } from 'nostr-tools';

/** Same wait as a catalog page in findTasks. A short timeout must not look like the last page. */
const CATALOG_PAGE_MS = 20_000;

/**
 * The newest open row is not the end of the catalog. [TEST] tasks at the top
 * of the relay used to stop the scan, so older open tasks never reached /tasks.
 */
export function catalogScanIsComplete(): boolean {
	return false;
}

let inflight: Promise<Task[]> | null = null;

/** Tests start from an empty catalog cache. */
export function resetSharedCatalog(): void {
	inflight = null;
}

/**
 * One relay, newest page first, then `until` until that relay's own page is short.
 * A shared cursor across relay.bittasker.com and relay2 drops events: each relay
 * returns its own newest 200, the merged list is sliced back to 200, and the next
 * `until` is the oldest raw event. Rows that lost the slice are newer than that
 * cursor, so they never come back. task-82dcb53a is on relay.bittasker.com in that gap.
 */
async function readRelayTaskEvents(url: string): Promise<Event[]> {
	const collected: Event[] = [];
	const seen = new Set<string>();
	const cursors = new Set<number>();
	let until: number | undefined;
	for (;;) {
		const filter: Filter = {
			kinds: [KINDS.TASK_CREATION],
			limit: BROWSE_CATALOG_PAGE,
			...(until != null ? { until } : {})
		};
		const events = await queryRelayEvents([url], filter, { timeoutMs: CATALOG_PAGE_MS });
		let oldest: number | null = null;
		for (const event of events) {
			if (typeof event.created_at === 'number' && (oldest == null || event.created_at < oldest)) {
				oldest = event.created_at;
			}
			if (!event?.id || seen.has(event.id)) continue;
			seen.add(event.id);
			collected.push(event);
		}
		if (events.length < BROWSE_CATALOG_PAGE || oldest == null) break;
		const next = oldest - 1;
		if (cursors.has(next)) break;
		cursors.add(next);
		until = next;
	}
	return collected;
}

/**
 * Every kind 31000 event from each task relay. Dedupe is pubkey + d-tag, latest wins.
 */
export async function readTaskCatalog(): Promise<Task[]> {
	const groups = await Promise.all(listingRelayUrls().map((url) => readRelayTaskEvents(url)));
	const tasks = groups.flat().flatMap((event) => {
		const task = parseTaskEvent(event);
		return task ? [task] : [];
	});
	return dedupeReplaceableTasks(tasks).sort(
		(left, right) => (right.createdAt ?? 0) - (left.createdAt ?? 0)
	);
}

/**
 * The event pages browse, tiles, and category lists share.
 */
export function loadSharedCatalog(): Promise<Task[]> {
	if (!inflight) {
		inflight = readTaskCatalog().catch((error) => {
			inflight = null;
			throw error;
		});
	}
	return inflight;
}
