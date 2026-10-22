import {
	BROWSE_CATALOG_PAGE,
	BROWSE_CATALOG_PAGES,
	scanCatalogUntilLive
} from '$lib/browse/task-board';
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
 * The event pages browse, tiles, and category lists share.
 * Newest page first, then older pages until the relay page runs out.
 */
export function loadSharedCatalog(): Promise<Task[]> {
	if (!inflight) {
		inflight = scanCatalogUntilLive<Task>({
			pageSize: BROWSE_CATALOG_PAGE,
			maxPages: BROWSE_CATALOG_PAGES,
			fetchPage: async (until) => {
				const result = await findTasks({
					limit: BROWSE_CATALOG_PAGE,
					page: 1,
					catalogOnly: true,
					...(until != null ? { until } : {})
				});
				return {
					items: result.tasks || [],
					filled: result.filled,
					oldestCreatedAt: result.oldestCreatedAt
				};
			},
			hasLive: catalogScanIsComplete
		}).catch((error) => {
			inflight = null;
			throw error;
		});
	}
	return inflight;
}
