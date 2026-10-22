import {
	BROWSE_CATALOG_PAGE,
	BROWSE_CATALOG_PAGES,
	browseLiveCount,
	scanCatalogUntilLive
} from '$lib/browse/task-board';
import { findTasks } from '$lib/nostr/findTasks';
import type { Task } from '$lib/types/task.d';

let inflight: Promise<Task[]> | null = null;

/** Tests start from an empty catalog cache. */
export function resetSharedCatalog(): void {
	inflight = null;
}

/**
 * The event pages browse, tiles, and category lists share.
 * Newest page first, then older pages until a live task appears.
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
			hasLive: (rows) => browseLiveCount(rows, false).live > 0
		}).catch((error) => {
			inflight = null;
			throw error;
		});
	}
	return inflight;
}
