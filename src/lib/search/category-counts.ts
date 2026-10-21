import { findTasks } from '$lib/nostr/findTasks';
import { fetchTypesenseJson } from '$lib/search/browse-index';
import { SEARCH_CATEGORIES, suggestCategory } from '$lib/search/taxonomy.js';

function fill(counts: Record<string, number>): Record<string, number> {
	const filled: Record<string, number> = {};
	for (const category of SEARCH_CATEGORIES) {
		filled[category.id] = Number(counts[category.id] || 0);
	}
	return filled;
}

/** Listing counts for the category grid. A cold search index falls back to the catalog relay. */
export async function loadCategoryListingCounts(): Promise<Record<string, number>> {
	const indexed = await fetchTypesenseJson('/api/search/counts?type=task');
	const fromIndex = indexed?.counts;
	if (fromIndex && typeof fromIndex === 'object') {
		return fill(fromIndex as Record<string, number>);
	}
	const { tasks } = await findTasks({ limit: 80, page: 1, catalogOnly: true });
	const counts: Record<string, number> = {};
	for (const task of tasks) {
		const match = suggestCategory({
			title: task.title,
			description: task.description,
			skills: task.skills,
			categories: task.categories
		});
		if (!match || match.source !== 'auto' || match.score <= 0) continue;
		counts[match.category] = (counts[match.category] || 0) + 1;
	}
	return fill(counts);
}
