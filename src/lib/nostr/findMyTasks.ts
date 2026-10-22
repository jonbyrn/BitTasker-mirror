import type { Task } from '$lib/types/task.d';
import { type Event, type Filter } from 'nostr-tools';
import { browser } from '$app/environment';
import { myTasksStore } from '$lib/stores/task.store';
import nostrEventsService from '$lib/api/services/nostr/events';
import KINDS from '$lib/utils/constants/kinds';
import { getNpub } from '$lib/utils/nostrKeys';
import { nip19 } from 'nostr-tools';
import { get } from 'svelte/store';

// Constants
const BATCH_SIZE = 20; // Default tasks limit per page
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Memory cache for my tasks
const cache = new Map<string, { data: Task[]; timestamp: number }>();

/**
 * A kind 31000 event with no budget, or a non-finite/negative amount, is not a task
 * the list can render. Returning null lets callers skip it instead of throwing.
 */
function hasUsableBudget(budget: unknown): budget is { amount: number } {
	if (!budget || typeof budget !== 'object' || Array.isArray(budget)) return false;
	const amount = (budget as { amount?: unknown }).amount;
	return typeof amount === 'number' && Number.isFinite(amount) && amount >= 0;
}

/**
 * Convert a Nostr event to a Task.
 * Malformed content and missing/invalid budgets are skipped (null), never thrown.
 */
function convertEventToTask(event: Event): (Task & { eventId?: string }) | null {
	let content: { budget?: unknown };
	try {
		content = JSON.parse(event.content);
	} catch (error) {
		console.warn('[findMyTasks] Skipping malformed task event', event.id, error);
		return null;
	}
	if (!hasUsableBudget(content?.budget)) {
		console.warn('[findMyTasks] Skipping task event with missing or invalid budget', event.id);
		return null;
	}
	const dTag = event.tags?.find((t: string[]) => t[0] === 'd')?.[1];
	const taskId = dTag || event.id;
	return {
		...content,
		id: taskId,
		eventId: event.id,
		npub: event.pubkey,
		createdAt: event.created_at
	} as Task & { eventId?: string };
}

/**
 * Find my tasks with pagination support
 */
export async function findMyTasks(
	params: {
		page?: number;
		limit?: number;
		until?: number;
		refresh?: boolean; // If true, reset the store and reload from page 1
	} = {}
): Promise<{ tasks: Task[]; total: number; hasMore: boolean }> {
	try {
		myTasksStore.update((state) => ({ ...state, loading: true, error: null }));

		const npub = await getNpub();
		if (!npub) {
			throw new Error('No public key found');
		}

		// Convert npub to hex if needed
		let pubkeyHex = npub;
		if (npub.startsWith('npub')) {
			try {
				pubkeyHex = nip19.decode(npub).data as string;
			} catch (error) {
				console.error('Error decoding npub:', error);
				throw new Error('Invalid npub format');
			}
		}

		// If refresh is true, clear cache and reset to page 1
		if (params.refresh) {
			cache.clear();
			params.page = 1;
		}

		const cacheKey = `my-tasks-${pubkeyHex}-${params.page || 1}-${params.until || 'latest'}`;
		const cached = cache.get(cacheKey);

		if (cached && Date.now() - cached.timestamp < CACHE_TTL && !params.refresh) {
			myTasksStore.update((state) => ({
				...state,
				items: params.page === 1 ? cached.data : [...state.items, ...cached.data],
				loading: false,
				currentPage: params.page || 1,
				hasMore: cached.data.length >= (params.limit || BATCH_SIZE)
			}));

			console.debug(`[FindMyTasks] Cache hit - returned ${cached.data.length} tasks`);

			return {
				tasks: cached.data,
				total: cached.data.length,
				hasMore: cached.data.length >= (params.limit || BATCH_SIZE)
			};
		}

		// Create filter for my tasks
		const filter: Filter = {
			kinds: [KINDS.TASK_CREATION],
			authors: [pubkeyHex],
			limit: params.limit || BATCH_SIZE,
			until: params.until || undefined
		};

		try {
			const response = await nostrEventsService.findEvents(filter);
			// Safety check: ensure response.data is an array
			const events = Array.isArray(response?.data) ? response.data : [];
			const tasks = events.flatMap((event: Event) => {
				const task = convertEventToTask(event);
				return task ? [task] : [];
			});

			// Update cache
			cache.set(cacheKey, { data: tasks, timestamp: Date.now() });

			// Update store - concatenate for pagination
			// Only update items if we have a successful response (even if empty)
			myTasksStore.update((state) => ({
				...state,
				items: params.page === 1 ? tasks : [...state.items, ...tasks],
				loading: false,
				currentPage: params.page || 1,
				hasMore: tasks.length >= (params.limit || BATCH_SIZE)
			}));

			console.debug(`[FindMyTasks] Fresh data - fetched ${tasks.length} tasks`);

			return {
				tasks,
				total: tasks.length,
				hasMore: tasks.length >= (params.limit || BATCH_SIZE)
			};
		} catch (apiError) {
			console.error('API request failed - ', apiError);

			// Preserve existing items on API error - don't clear the store
			// Only update loading state and error message
			const currentState = get(myTasksStore);
			myTasksStore.update((state) => ({
				...state,
				loading: false,
				error: apiError instanceof Error ? apiError.message : 'Failed to fetch tasks'
				// Keep existing items - don't update items on error
			}));

			// Return current items from store instead of empty array
			return {
				tasks: currentState.items,
				total: currentState.items.length,
				hasMore: false
			};
		}
	} catch (error) {
		console.error('Error finding my tasks:', error);

		// Preserve existing items on critical errors (e.g., no public key, invalid npub)
		// Only update loading state and error message
		myTasksStore.update((state) => ({
			...state,
			loading: false,
			error: error instanceof Error ? error.message : 'Unknown error occurred'
			// Keep existing items - don't clear on error
		}));

		// Return current items from store instead of throwing
		// This allows the UI to continue showing existing tasks even if refresh fails
		const currentState = get(myTasksStore);
		return {
			tasks: currentState.items,
			total: currentState.items.length,
			hasMore: false
		};
	}
}

/**
 * Add a new task to the beginning of the my tasks list
 * This is useful when a new task is created and we want to show it immediately
 */
export function addNewTaskToMyTasks(newTask: Task): void {
	myTasksStore.update((state) => ({
		...state,
		items: [newTask, ...state.items]
	}));
}

/**
 * Cleanup function to handle cleanup tasks
 */
export function cleanupMyTasks(): void {
	cache.clear();
}

// Cleanup cache when browser closes
if (browser) {
	window.addEventListener('beforeunload', () => {
		cache.clear();
	});
}
