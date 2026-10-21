import { countsFromRows, fetchTypesenseJson } from '$lib/search/browse-index';

export function mergeCountMaps(
	maps: Array<Record<string, number> | null | undefined>
): Record<string, number> {
	const counts: Record<string, number> = {};
	for (const map of maps) {
		if (!map) continue;
		for (const [key, value] of Object.entries(map)) {
			if (!key) continue;
			counts[key] = (counts[key] || 0) + Number(value || 0);
		}
	}
	return counts;
}

function countMap(body: Record<string, unknown> | null): Record<string, number> | null {
	if (!body) return null;
	const counts = body.counts;
	if (!counts || typeof counts !== 'object') return null;
	return counts as Record<string, number>;
}

/** Tile counts from Typesense. A relay pass is used only when Typesense is not ready. */
export async function loadHomeTileCounts(): Promise<Record<string, number> | null> {
	const [tasks, services, shifts] = await Promise.all([
		fetchTypesenseJson('/api/search/counts?type=task'),
		fetchTypesenseJson('/api/search/counts?type=service'),
		fetchTypesenseJson('/api/search/counts?type=shift')
	]);
	const taskCounts = countMap(tasks);
	const serviceCounts = countMap(services);
	if (taskCounts && serviceCounts) {
		const merged = mergeCountMaps([taskCounts, serviceCounts]);
		const shiftCounts = countMap(shifts);
		merged['temp-staff'] = shiftCounts
			? Object.values(shiftCounts).reduce((sum, value) => sum + Number(value || 0), 0)
			: 0;
		return merged;
	}
	if (import.meta.env.MODE === 'test') return null;
	try {
		const [{ findTasks }, { findServices }, { classifyListing }] = await Promise.all([
			import('$lib/nostr/findTasks'),
			import('$lib/nostr/findServices'),
			import('$lib/search/taxonomy.js')
		]);
		const [taskResult, serviceResult] = await Promise.all([
			findTasks({ limit: 60, page: 1 }),
			findServices({ limit: 60, page: 1 })
		]);
		return countsFromRows([
			...(taskResult.tasks || []).map((task) => ({
				categoryId: classifyListing(task).category
			})),
			...(serviceResult.services || []).map((service) => ({
				categoryId: classifyListing(service).category
			}))
		]);
	} catch {
		return null;
	}
}
