import { dedupeIdenticalTasks } from '$lib/browse/task-board';
import { findTasks } from '$lib/nostr/findTasks';
import { fetchTypesenseJson } from '$lib/search/browse-index';
import { SEARCH_CATEGORIES, suggestCategory } from '$lib/search/taxonomy.js';
import type { Task } from '$lib/types/task.d';
import { displayTaskStatus } from '$lib/utils/helpers/taskDeadline';

type ListingInput = {
	title?: string;
	description?: string;
	skills?: string[];
	categories?: Array<string | { id?: string; name?: string }>;
};

/** The category the homepage tile counts. Same keyword match, including a clear title. */
export function listingCategory(
	input: ListingInput
): { category: string; subcategory: string } | null {
	const match = suggestCategory({
		title: input.title,
		description: input.description,
		skills: input.skills,
		categories: input.categories
	});
	if (!match || match.source !== 'auto' || match.score <= 0) return null;
	return { category: match.category, subcategory: match.subcategory };
}

/** Same rows the homepage count uses: live catalog tasks, one copy each, keyword category. */
export function tasksForTileCounts(tasks: readonly Task[]): Task[] {
	const live = tasks.filter((task) => displayTaskStatus(task) !== 'EXPIRED');
	return dedupeIdenticalTasks(live).filter((task) => listingCategory(task));
}

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
	for (const task of tasksForTileCounts(tasks)) {
		const match = listingCategory(task);
		if (!match) continue;
		counts[match.category] = (counts[match.category] || 0) + 1;
	}
	return fill(counts);
}
