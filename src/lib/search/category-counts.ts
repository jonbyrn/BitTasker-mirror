import { selectSharedTasks } from '$lib/browse/task-board';
import { loadSharedCatalog } from '$lib/browse/shared-catalog';
import { SEARCH_CATEGORIES, suggestCategory } from '$lib/search/taxonomy.js';
import type { Task } from '$lib/types/task.d';

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
	if (!match) return null;
	if (match.source === 'fallback') {
		return { category: match.category, subcategory: match.subcategory };
	}
	if (match.source !== 'auto' || match.score <= 0) return null;
	return { category: match.category, subcategory: match.subcategory };
}

/** Open tasks the homepage tiles count. Same selector browse and category lists use. */
export function tasksForTileCounts(tasks: readonly Task[]): Task[] {
	return selectSharedTasks(tasks).filter((task) => listingCategory(task));
}

/** Open-task counts keyed by category id. */
export function openTaskCounts(tasks: readonly Task[]): Record<string, number> {
	const counts: Record<string, number> = {};
	for (const task of tasksForTileCounts(tasks)) {
		const match = listingCategory(task);
		if (!match) continue;
		counts[match.category] = (counts[match.category] || 0) + 1;
	}
	return counts;
}

function fill(counts: Record<string, number>): Record<string, number> {
	const filled: Record<string, number> = {};
	for (const category of SEARCH_CATEGORIES) {
		filled[category.id] = Number(counts[category.id] || 0);
	}
	return filled;
}

/** Listing counts for the category grid. The same catalog browse reads. */
export async function loadCategoryListingCounts(): Promise<Record<string, number>> {
	const tasks = await loadSharedCatalog();
	return fill(openTaskCounts(tasks));
}
