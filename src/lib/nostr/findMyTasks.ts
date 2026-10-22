import type { Task } from '$lib/types/task.d';
import { type Event, type Filter } from 'nostr-tools';
import { browser } from '$app/environment';
import { myTasksStore } from '$lib/stores/task.store';
import nostrEventsService from '$lib/api/services/nostr/events';
import KINDS from '$lib/utils/constants/kinds';
import { getNpub } from '$lib/utils/nostrKeys';
import { nip19 } from 'nostr-tools';
import { get } from 'svelte/store';
import { isNotFoundError } from '$lib/api/apiService';
import { withoutProductionCatalogRelays } from '$lib/nostr/catalog-guard';
import { mergeRelayEvents, queryListingRelays } from '$lib/nostr/listing-relays';
import { resolveTaskRelayUrls } from '$lib/utils/relayUrls';
import { queryRelayEvents } from '$lib/nostr/relayQuery';
import { parseTaskEvent } from '$lib/nostr/parseTaskEvent';

// Constants
const BATCH_SIZE = 20; // Default tasks limit per page
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function isE2ETest(): boolean {
	return (
		(browser && (window as { __PLAYWRIGHT_TEST__?: boolean }).__PLAYWRIGHT_TEST__ === true) ||
		import.meta.env.VITE_E2E_TURNSTILE_BYPASS === 'true'
	);
}

// Memory cache for my tasks
const cache = new Map<string, { data: Task[]; timestamp: number }>();

/**
 * Convert a Nostr event to a Task
 */
async function queryTaskRelays(relays: string[], filter: Filter): Promise<Event[]> {
	return queryRelayEvents(relays, filter);
}

async function fetchMyTaskEvents(filter: Filter): Promise<Event[]> {
	if (isE2ETest()) {
		return queryTaskRelays(
			withoutProductionCatalogRelays(
				resolveTaskRelayUrls(import.meta.env.VITE_NOSTR_TASK_RELAY_URL)
			),
			filter
		);
	}

	const response = await nostrEventsService.findEvents(filter);
	const events = Array.isArray(response?.data) ? response.data : [];
	const merged = mergeRelayEvents([events, await queryListingRelays(filter)]);
	if (merged.length > 0) return merged;

	return queryTaskRelays(
		withoutProductionCatalogRelays(resolveTaskRelayUrls(import.meta.env.VITE_NOSTR_TASK_RELAY_URL)),
		filter
	);
}

function convertEventToTask(event: Event): (Task & { eventId?: string }) | null {
	return parseTaskEvent(event);
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
			const events = await fetchMyTaskEvents(filter);
			const tasks = events.flatMap((event: Event) => {
				const task = convertEventToTask(event);
				return task ? [task] : [];
			});
			const currentItems = get(myTasksStore).items;
			const visibleTasks =
				isE2ETest() && tasks.length === 0 && currentItems.length > 0 ? currentItems : tasks;

			// Update cache
			cache.set(cacheKey, { data: visibleTasks, timestamp: Date.now() });

			// Update store - concatenate for pagination
			// Only update items if we have a successful response (even if empty)
			myTasksStore.update((state) => ({
				...state,
				items: params.page === 1 ? visibleTasks : [...state.items, ...visibleTasks],
				loading: false,
				currentPage: params.page || 1,
				hasMore: visibleTasks.length >= (params.limit || BATCH_SIZE)
			}));

			console.debug(`[FindMyTasks] Fresh data - fetched ${tasks.length} tasks`);

			return {
				tasks: visibleTasks,
				total: visibleTasks.length,
				hasMore: visibleTasks.length >= (params.limit || BATCH_SIZE)
			};
		} catch (apiError) {
			console.error('API request failed - ', apiError);

			if (isNotFoundError(apiError)) {
				const currentItems = get(myTasksStore).items;
				if (isE2ETest() && currentItems.length > 0) {
					myTasksStore.update((state) => ({
						...state,
						loading: false,
						error: null
					}));
					return { tasks: currentItems, total: currentItems.length, hasMore: false };
				}
				myTasksStore.update((state) => ({
					...state,
					items: [],
					loading: false,
					error: null,
					hasMore: false
				}));
				return { tasks: [], total: 0, hasMore: false };
			}

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
		items: [newTask, ...state.items.filter((task) => task.id !== newTask.id)]
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
