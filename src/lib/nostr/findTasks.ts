import type { SearchTasksParams, Task } from '$lib/types/task.d';
import { type Event, type Filter } from 'nostr-tools';
import { browser } from '$app/environment';
import { tasksStore } from '$lib/stores/task.store';
import { get } from 'svelte/store';
import nostrEventsService from '$lib/api/services/nostr/events';
import KINDS from '$lib/utils/constants/kinds';
import {
	indexTaskData,
	filterIndexedTasks,
	cleanupIndexedTasks,
	performanceMonitor,
	type IndexedTask
} from '$lib/utils/task-indexing';
import { Preferences } from '@capacitor/preferences';
import { StorageKeys } from '$lib/utils/constants/storage';
import { TASKS_PER_PAGE } from '$lib/stores/task.store';

// Constants
const BATCH_SIZE = TASKS_PER_PAGE; // Default tasks limit per page
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const MAX_CACHE_SIZE = 100; // Maximum number of tasks to keep in cache

// Memory cache with indexed tasks for better performance
const cache = new Map<string, { data: IndexedTask[]; timestamp: number }>();

/**
 * Convert search params to Nostr filter
 */
function createTaskFilter(params: SearchTasksParams): Filter {
	const filter: Filter & { [key: string]: string[] | number[] | string | number | undefined } = {
		kinds: [KINDS.TASK_CREATION],
		limit: params.limit || BATCH_SIZE,
		until: params.until || undefined
	};

	// Enhanced search with NIP-50
	if (params.search) {
		const searchTerm = params.search.trim();

		// Search in multiple fields
		if (params.searchFields?.includes('title')) {
			filter.title = searchTerm;
		}

		if (params.searchFields?.includes('description')) {
			filter.description = searchTerm;
		}

		if (params.searchFields?.includes('skills')) {
			filter.skills = searchTerm;
		}

		// Fallback to general search if no specific fields
		if (!params.searchFields || params.searchFields.length === 0) {
			filter.search = searchTerm;
		}
	}

	// Status filter
	if (params.status && params.status.length > 0) {
		filter['S'] = params.status;
	}

	// Category filter - REMOVED: Now handled in frontend filtering
	// if (params.categories && params.categories.length > 0) {
	//     filter['c'] = params.categories;
	// }

	// Skills filter - REMOVED: Now handled in frontend filtering
	// if (params.skills && params.skills.length > 0) {
	//     filter['s'] = params.skills;
	// }

	// Budget filters
	if (params.budget?.tier) {
		filter['b'] = [params.budget.tier];
	}
	if (params.budget?.currency) {
		filter['P'] = [params.budget.currency]; // P for price
	}
	if (params.budget?.type) {
		filter['t'] = [params.budget.type];
	}

	// Date range filtering - we'll handle this in frontend filtering
	// since Nostr doesn't have native date range filtering
	// if (params.dateRange) {
	//     const dateRangeTags = getDateRangeTags(params.dateRange?.end, params.dateRange?.start);
	//     filter['M'] = dateRangeTags.months;
	//     filter['D'] = dateRangeTags.days;
	// }

	// Deadline filtering - we'll handle this in frontend filtering
	// since we need to compare actual deadline dates
	// if (params.deadline) {
	//     const dateRangeTags = getDateRangeTags(params.deadline);
	//     filter['M'] = dateRangeTags.months;
	//     filter['D'] = dateRangeTags.days;
	// }

	// Task type filter (onsite or remote)
	if (params.taskType) {
		filter['T'] = [params.taskType];
	}

	// Location filter - REMOVED: Now handled in frontend filtering
	// The frontend will handle location filtering with radius calculation
	// if (params.location) {
	//     filter['T'] = ['onsite'];
	//     filter['L'] = [params.location];
	// }

	// Add NIP-50 search support
	if (params.search) {
		filter.search = params.search.trim();
	}

	// No automatic filters - show all tasks regardless of status
	// Only apply status filter if explicitly requested by user
	if (params.status && params.status.length > 0) {
		filter['S'] = params.status;
	}

	return filter;
}

/**
 * Convert a Nostr event to a Task
 */
function convertEventToTask(event: Event): Task {
	return {
		...JSON.parse(event.content),
		id: event.id,
		npub: event.pubkey,
		createdAt: event.created_at
	};
}

/**
 * Find tasks based on search parameters
 */
export async function findTasks(
	params: SearchTasksParams
): Promise<{ tasks: Task[]; total: number; hasMore: boolean }> {
	try {
		tasksStore.update((state) => ({ ...state, loading: true, error: null }));

		const filter = createTaskFilter(params);

		const cacheKey = JSON.stringify(filter);
		const cached = cache.get(cacheKey);
		if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
			// Use optimized filtering with pre-indexed data
			const { tasks: filteredTasks, metrics } = filterIndexedTasks(cached.data, params);
			metrics.cacheHit = true;
			performanceMonitor.addMetric(metrics);

			// Convert back to regular Task objects for the store
			const cleanTasks = cleanupIndexedTasks(filteredTasks);

			const limit = params.limit || BATCH_SIZE;
			const currentItemsCount = get(tasksStore).items.length;
			
			// If we're loading more (page > 1), get the next batch from cache
			if (params.page && params.page > 1) {
				const startIndex = currentItemsCount;
				const endIndex = Math.min(startIndex + limit, cleanTasks.length);
				const limitedTasks = cleanTasks.slice(startIndex, endIndex);
				const hasMore = endIndex < cleanTasks.length || cleanTasks.length >= MAX_CACHE_SIZE;

				tasksStore.update((state) => ({
					...state,
					items: [...state.items, ...limitedTasks],
					loading: false,
					currentPage: params.page || 1,
					hasMore
				}));

				return {
					tasks: limitedTasks,
					total: limitedTasks.length,
					hasMore
				};
			}

			// For page 1, check if we should use cache or start fresh
			// If cache has more than what's in store, use cache from current position
			if (currentItemsCount > 0 && cleanTasks.length > currentItemsCount) {
				// Continue from where we left off in cache
				const startIndex = currentItemsCount;
				const endIndex = Math.min(startIndex + limit, cleanTasks.length);
				const limitedTasks = cleanTasks.slice(startIndex, endIndex);
				const hasMore = endIndex < cleanTasks.length || cleanTasks.length >= MAX_CACHE_SIZE;

				tasksStore.update((state) => ({
					...state,
					items: [...state.items, ...limitedTasks],
					loading: false,
					currentPage: params.page || 1,
					hasMore
				}));

				return {
					tasks: limitedTasks,
					total: limitedTasks.length,
					hasMore
				};
			}

			// Limit results to requested batch size for initial load
			const limitedTasks = cleanTasks.slice(0, limit);
			
			// hasMore: true if we got the full limit AND there are more tasks available in cache
			const hasMore = limitedTasks.length >= limit && cleanTasks.length > limit;

			tasksStore.update((state) => ({
				...state,
				items: params.page === 1 ? limitedTasks : [...state.items, ...limitedTasks],
				loading: false,
				currentPage: params.page || 1,
				hasMore
			}));

			return {
				tasks: limitedTasks,
				total: limitedTasks.length,
				hasMore
			};
		}

		try {
			const response = await nostrEventsService.findEvents(filter);

			const events = response.data || [];
			// const total = events.length;

		// For public users, show all tasks without filtering by npub
		// This avoids triggering biometric authentication for public users
		const { value: npub } = await Preferences.get({ key: StorageKeys.NPUB });

		const rawTasks = events
			.map((event: Event) => convertEventToTask(event))
			.filter((task: Task) => {
				// Exclude own tasks
				return task.npub !== npub;
			});

			// Pre-index tasks for optimized filtering
			const indexedTasks = indexTaskData(rawTasks);

			// Apply optimized frontend filtering
			const { tasks: filteredTasks, metrics } = filterIndexedTasks(indexedTasks, params);
			performanceMonitor.addMetric(metrics);

			// Get existing cached data if available
			const existingCached = cache.get(cacheKey);
			let allCachedTasks: IndexedTask[] = [];
			
			if (existingCached && Date.now() - existingCached.timestamp < CACHE_TTL) {
				// Merge with existing cache, avoiding duplicates
				const existingIds = new Set(existingCached.data.map(t => t.id));
				const newTasks = filteredTasks.filter(t => !existingIds.has(t.id));
				allCachedTasks = [...existingCached.data, ...newTasks];
			} else {
				allCachedTasks = filteredTasks;
			}

			// Limit cache to MAX_CACHE_SIZE to prevent memory issues
			if (allCachedTasks.length > MAX_CACHE_SIZE) {
				allCachedTasks = allCachedTasks.slice(0, MAX_CACHE_SIZE);
			}

			// Update cache with merged indexed data
			cache.set(cacheKey, { data: allCachedTasks, timestamp: Date.now() });

			// Convert back to regular Task objects for the store
			const cleanTasks = cleanupIndexedTasks(filteredTasks);

			const limit = params.limit || BATCH_SIZE;
			// Limit results to requested batch size
			const limitedTasks = cleanTasks.slice(0, limit);
			
			// hasMore: true if we got the full limit from API
			const hasMore = events.length >= limit;

			// Update store - REEMPLAZAR en lugar de concatenar
			tasksStore.update((state) => ({
				...state,
				items: params.page === 1 ? limitedTasks : [...state.items, ...limitedTasks],
				loading: false,
				currentPage: params.page || 1,
				hasMore
			}));

			return {
				tasks: limitedTasks,
				total: limitedTasks.length,
				hasMore
			};
		} catch (apiError) {
			console.error('API request failed - ', apiError);

			return {
				tasks: [],
				total: 0,
				hasMore: false
			};
		}
	} catch (error) {
		console.error('Error finding tasks:', error);
		tasksStore.update((state) => ({
			...state,
			loading: false,
			error: error instanceof Error ? error.message : 'Unknown error occurred'
		}));
		throw error;
	}
}

/**
 * Cleanup function to handle cleanup tasks with improved subscription handling
 */
export function cleanup(): void {
	cache.clear();
	performanceMonitor.clear();
}

/**
 * Get performance metrics for task filtering operations
 */
export function getFilterPerformanceReport() {
	return performanceMonitor.getPerformanceReport();
}

// Cleanup cache when browser closes
if (browser) {
	window.addEventListener('beforeunload', () => {
		cache.clear();
	});
}
