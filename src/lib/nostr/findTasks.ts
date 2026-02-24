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
import { createDebug } from '$lib/utils/debug';

const d = createDebug('findTasks');

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
	const dTag = event.tags?.find((t: string[]) => t[0] === 'd')?.[1];
	// Use d-tag as id when present (Addressable Event: stable, readable identifier for URLs/SEO)
	const taskId = dTag || event.id;
	// Prefer event timestamp so dedup keeps latest replaceable event; fallback to 0 so sort is deterministic
	const createdAt =
		typeof event.created_at === 'number' && !Number.isNaN(event.created_at) ? event.created_at : 0;
	return {
		...JSON.parse(event.content),
		id: taskId,
		npub: event.pubkey,
		createdAt
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
			d.log('cache hit', {
				cachedCount: cached.data.length,
				cacheAgeMs: Date.now() - cached.timestamp,
				sampleStatuses: cached.data
					.slice(0, 10)
					.map((t) => ({ id: t.id, status: (t as Task).status, createdAt: (t as Task).createdAt }))
			});
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
			d.log('cache hit → store', {
				limitedCount: limitedTasks.length,
				statuses: limitedTasks.map((t) => ({ id: t.id, status: t.status }))
			});

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
			d.log('fetch start', { cacheKey: cacheKey.slice(0, 80) });
			const response = await nostrEventsService.findEvents(filter);

			const events = response.data || [];
			// Log raw API events: id, S tag, content.status, created_at (to verify replaceable event handling)
			const eventSamples = events.slice(0, 15).map((ev: Event) => {
				const content = (() => {
					try {
						return JSON.parse(ev.content) as { status?: string };
					} catch {
						return {};
					}
				})();
				const sTag = ev.tags?.find((t: string[]) => t[0] === 'S')?.[1];
				return {
					eventId: ev.id?.slice(0, 8),
					dTag: ev.tags?.find((t: string[]) => t[0] === 'd')?.[1],
					contentStatus: content.status,
					sTag,
					created_at: ev.created_at
				};
			});
			d.log('api response', { eventsCount: events.length, sample: eventSamples });

			// Convert all events to tasks first (no npub filter yet). We need every version for dedup.
			const rawTasks = events.map((event: Event) => convertEventToTask(event));

			// Task creator = pubkey of the oldest event per task id (who created the task). Used to exclude "own tasks" after dedup.
			const byIdForCreator = new Map<string, Task[]>();
			for (const t of rawTasks) {
				const list = byIdForCreator.get(t.id) ?? [];
				list.push(t);
				byIdForCreator.set(t.id, list);
			}
			const creatorByTaskId = new Map<string, string>();
			for (const [id, list] of byIdForCreator) {
				const oldest = list.reduce(
					(acc, t) => ((t.createdAt ?? 0) < (acc.createdAt ?? 0) ? t : acc),
					list[0]
				);
				creatorByTaskId.set(id, oldest.npub);
			}

			// Deduplicate by task.id: keep only the most recent (highest createdAt). Sort desc so first wins = newest.
			const sortedByNewest = [...rawTasks].sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
			const taskById = new Map<string, Task>();
			for (const task of sortedByNewest) {
				if (!taskById.has(task.id)) {
					taskById.set(task.id, task);
				}
			}
			const uniqueTasks = Array.from(taskById.values());

			// Exclude own tasks: tasks I created (creator = my npub). Applied after dedup so we don't drop the latest version.
			const { value: npub } = await Preferences.get({ key: StorageKeys.NPUB });
			const tasksExcludingOwn = npub
				? uniqueTasks.filter((t) => creatorByTaskId.get(t.id) !== npub)
				: uniqueTasks;
			const excludedOwnCount = uniqueTasks.length - tasksExcludingOwn.length;
			d.log('after dedup + exclude own', {
				rawCount: rawTasks.length,
				uniqueCount: uniqueTasks.length,
				excludedOwn: excludedOwnCount,
				sampleStatuses: tasksExcludingOwn
					.slice(0, 10)
					.map((t) => ({ id: t.id, status: t.status, createdAt: t.createdAt }))
			});

			// Pre-index tasks for optimized filtering (use tasks after excluding own)
			const indexedTasks = indexTaskData(tasksExcludingOwn);

			// Apply optimized frontend filtering
			const { tasks: filteredTasks, metrics } = filterIndexedTasks(indexedTasks, params);
			performanceMonitor.addMetric(metrics);

			// Get existing cached data if available
			const existingCached = cache.get(cacheKey);
			let allCachedTasks: IndexedTask[] = [];

			if (existingCached && Date.now() - existingCached.timestamp < CACHE_TTL) {
				// Merge with existing cache, avoiding duplicates
				const existingIds = new Set(existingCached.data.map((t) => t.id));
				const newTasks = filteredTasks.filter((t) => !existingIds.has(t.id));
				allCachedTasks = [...existingCached.data, ...newTasks];
				const excludedByMerge = filteredTasks.filter((t) => existingIds.has(t.id));
				d.log('merge with existing cache', {
					existingCachedCount: existingCached.data.length,
					filteredCount: filteredTasks.length,
					existingIdsCount: existingIds.size,
					newTasksCount: newTasks.length,
					allCachedCount: allCachedTasks.length,
					excludedIds: excludedByMerge.map((t) => t.id),
					excludedStatusInFresh: excludedByMerge.map((t) => ({
						id: t.id,
						status: (t as Task).status,
						createdAt: (t as Task).createdAt
					})),
					statusInExistingForExcluded: excludedByMerge.map((t) => {
						const inExisting = existingCached.data.find((c) => c.id === t.id) as Task | undefined;
						return inExisting
							? { id: t.id, status: inExisting.status, createdAt: inExisting.createdAt }
							: null;
					})
				});
			} else {
				allCachedTasks = filteredTasks;
				d.log('no existing cache', { filteredCount: filteredTasks.length });
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
			d.log('fetch → store', {
				limitedCount: limitedTasks.length,
				statusesWrittenToStore: limitedTasks.map((t) => ({ id: t.id, status: t.status })),
				cacheStoredCount: allCachedTasks.length,
				cacheSampleStatuses: allCachedTasks
					.slice(0, 10)
					.map((t) => ({ id: t.id, status: (t as Task).status }))
			});

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
