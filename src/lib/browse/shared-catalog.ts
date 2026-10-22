import { BROWSE_CATALOG_PAGE, dedupeReplaceableTasks } from '$lib/browse/task-board';
import { findTasks } from '$lib/nostr/findTasks';
import type { Task } from '$lib/types/task.d';

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
 * Newest page first, then older `until` pages until a relay page is short.
 * No page cap: relay.bittasker.com and relay2 both hold more than one page.
 */
export async function readTaskCatalog(): Promise<Task[]> {
	const collected: Task[] = [];
	const cursors = new Set<number>();
	let until: number | undefined;
	for (;;) {
		const result = await findTasks({
			limit: BROWSE_CATALOG_PAGE,
			page: 1,
			catalogOnly: true,
			...(until != null ? { until } : {})
		});
		collected.push(...(result.tasks || []));
		if (!result.filled || result.oldestCreatedAt == null) break;
		const next = result.oldestCreatedAt - 1;
		if (cursors.has(next)) break;
		cursors.add(next);
		until = next;
	}
	return dedupeReplaceableTasks(collected).sort(
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
