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
import { muteStore } from '$lib/stores/mute.store';
import { createDebug } from '$lib/utils/debug';
import { currentTasksSearchEpoch, isTasksSearchCurrent } from '$lib/search/search-epoch';
import { fastRelayQueriesEnabled, firstRelayEvents } from '$lib/nostr/firstRelayEvents';
import { resolveExplicitRelayUrls, resolveTaskRelayUrls } from '$lib/utils/relayUrls';

type MuteState = { mutedPubkeys: Set<string>; mutedEventIds: Set<string>; isLoaded: boolean };

const d = createDebug('findTasks');

// Constants
const BATCH_SIZE = TASKS_PER_PAGE; // Default tasks limit per page
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const MAX_CACHE_SIZE = 100; // Maximum number of tasks to keep in cache
const REQUEST_TIMEOUT_MS = 15000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
	const timeout = new Promise<T>((_, reject) =>
		setTimeout(() => reject(new Error('Request timeout')), ms)
	);
	return Promise.race([promise, timeout]);
}

function taskRelayUrls(): string[] {
	return [
		...new Set([
			...resolveTaskRelayUrls(import.meta.env.VITE_NOSTR_TASK_RELAY_URL),
			...resolveExplicitRelayUrls(import.meta.env.VITE_NOSTR_RELAY_URL)
		])
	];
}

function isSearchAbort(error: unknown, signal?: AbortSignal): boolean {
	if (signal?.aborted) return true;
	if (error instanceof DOMException && error.name === 'AbortError') return true;
	return error instanceof Error && (error.name === 'CanceledError' || error.message === 'canceled');
}

async function findEventsWithRetry(
	filter: Filter,
	signal?: AbortSignal
): Promise<{ data?: Event[] }> {
	if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

	const runPrimary = async (): Promise<{ data?: Event[] }> => {
		try {
			return await withTimeout(
				nostrEventsService.findEvents(filter, { signal }),
				REQUEST_TIMEOUT_MS
			);
		} catch (error) {
			if (signal?.aborted || isSearchAbort(error, signal)) throw error;
			if (error instanceof Error && error.message === 'Request timeout') {
				return await withTimeout(
					nostrEventsService.findEvents(filter, { signal }),
					REQUEST_TIMEOUT_MS
				);
			}
			throw error;
		}
	};

	const primary = runPrimary();
	if (!fastRelayQueriesEnabled()) return primary;

	// Paint from the first relay that answers. Do not wait for every relay.
	const controller = new AbortController();
	const onAbort = () => controller.abort();
	signal?.addEventListener('abort', onAbort, { once: true });
	const fast = firstRelayEvents(taskRelayUrls(), filter, fetch, controller.signal).then(
		(events) => {
			if (!events || events.length === 0) throw new Error('empty');
			return { data: events as Event[] };
		}
	);

	try {
		return await Promise.any([primary, fast]);
	} catch (error) {
		if (signal?.aborted || isSearchAbort(error, signal)) throw error;
		return primary;
	} finally {
		signal?.removeEventListener('abort', onAbort);
		controller.abort();
	}
}

// Memory cache with indexed tasks and pagination metadata
type TaskCacheEntry = {
	data: IndexedTask[];
	timestamp: number;
	hasMore: boolean;
};
const cache = new Map<string, TaskCacheEntry>();

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

	// Status is a browse filter. An exact title search must not require it.
	if (params.status && params.status.length > 0 && !params.search?.trim()) {
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

	return filter;
}

/**
 * Deduplicate tasks by id (defense in depth: ensures unique keys for Svelte each blocks).
 * For same id, keeps the task with highest createdAt (latest version).
 */
function deduplicateTasksById<T extends { id: string; createdAt?: number }>(tasks: T[]): T[] {
	const byId = new Map<string, T>();
	for (const task of tasks) {
		const existing = byId.get(task.id);
		if (
			!existing ||
			(task.createdAt != null && existing.createdAt != null && task.createdAt > existing.createdAt)
		) {
			byId.set(task.id, task);
		}
	}
	return Array.from(byId.values());
}

/**
 * Filter out "zombie" events: for addressable replaceable events (same d-tag),
 * only the original owner (pubkey that published first = oldest created_at) may use that d-tag.
 * Events from other pubkeys using the same d-tag are invalid and must be ignored.
 */
function filterZombieEvents(events: Event[]): Event[] {
	// Map: d-tag -> { pubkey: original owner, created_at: first publish time }
	const dTagOwner = new Map<string, { pubkey: string; created_at: number }>();

	for (const event of events) {
		const dTag = event.tags?.find((t: string[]) => t[0] === 'd')?.[1];
		if (!dTag) continue; // Events without d-tag use event.id (globally unique), no conflict

		const existing = dTagOwner.get(dTag);
		if (!existing || event.created_at < existing.created_at) {
			dTagOwner.set(dTag, { pubkey: event.pubkey, created_at: event.created_at });
		}
	}

	return events.filter((event) => {
		const dTag = event.tags?.find((t: string[]) => t[0] === 'd')?.[1];
		if (!dTag) return true; // No d-tag: keep (uses event.id)
		const owner = dTagOwner.get(dTag);
		return owner && event.pubkey === owner.pubkey;
	});
}

/**
 * A kind 31000 event is only a listable task when its content is JSON and
 * includes a numeric budget. Probe events such as `{ "title": "auth url probe" }`
 * have no budget. TaskCard reads `task.budget.amount` while rendering the list,
 * so one of those events throws and Svelte drops every card.
 */
function isListableTaskContent(content: unknown): content is Record<string, unknown> {
	if (!content || typeof content !== 'object' || Array.isArray(content)) return false;
	const budget = (content as { budget?: unknown }).budget;
	if (!budget || typeof budget !== 'object' || Array.isArray(budget)) return false;
	const amount = (budget as { amount?: unknown }).amount;
	return typeof amount === 'number' && Number.isFinite(amount);
}

/**
 * Convert a Nostr event to a Task, or null when the event cannot be shown.
 */
function convertEventToTask(event: Event): Task | null {
	let content: unknown;
	try {
		content = JSON.parse(event.content);
	} catch {
		return null;
	}
	if (!isListableTaskContent(content)) return null;

	const dTag = event.tags?.find((t: string[]) => t[0] === 'd')?.[1];
	// Use d-tag as id when present (Addressable Event: stable, readable identifier for URLs/SEO)
	const taskId = dTag || event.id;
	// Prefer event timestamp so dedup keeps latest replaceable event; fallback to 0 so sort is deterministic
	const createdAt =
		typeof event.created_at === 'number' && !Number.isNaN(event.created_at) ? event.created_at : 0;
	return {
		...content,
		id: taskId,
		npub: event.pubkey,
		createdAt
	} as Task;
}

function oldestEventTimestamp(events: Event[]): number | undefined {
	const timestamps = events
		.map((event) => event.created_at)
		.filter(
			(timestamp): timestamp is number =>
				typeof timestamp === 'number' && Number.isFinite(timestamp)
		);
	return timestamps.length > 0 ? Math.min(...timestamps) : undefined;
}

/**
 * Fetch one page of tasks from the relay and process them.
 * Returns the visible (post-mute, post-filter) tasks, the oldest relay timestamp
 * from this batch (for the next page cursor), whether the relay has more,
 * and whether the NIP-50 fallback was used (relay search returned 0).
 */
async function fetchOnePage(
	params: SearchTasksParams,
	npub: string | null,
	currentMutes: MuteState,
	signal?: AbortSignal
): Promise<{
	visibleTasks: Task[];
	lastRelayTimestamp: number | undefined;
	hasMore: boolean;
	usedFallback: boolean;
}> {
	const filter = createTaskFilter(params);
	const limit = params.limit || BATCH_SIZE;

	let response = await findEventsWithRetry(filter, signal);
	let events = response.data || [];

	// NIP-50 miss: the relay's Meili query returned nothing for this term.
	// Page the Postgres listing with the term removed and let the client text
	// filter keep only real matches. One short page is not the whole catalog.
	let usedFallback = false;
	if (params.search?.trim() && events.length === 0) {
		usedFallback = true;
		const fallbackFilter = { ...filter } as Filter & { search?: string };
		delete fallbackFilter.search;
		response = await findEventsWithRetry(fallbackFilter, signal);
		events = response.data || [];
	}

	const validEvents = filterZombieEvents(events);
	const rawTasks = validEvents.flatMap((event: Event) => {
		const task = convertEventToTask(event);
		return task ? [task] : [];
	});

	// Deduplicate: keep only the most recent version of each task id
	const sortedByNewest = [...rawTasks].sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
	const taskById = new Map<string, Task>();
	for (const task of sortedByNewest) {
		if (!taskById.has(task.id)) taskById.set(task.id, task);
	}
	const uniqueTasks = Array.from(taskById.values());

	// Oldest raw event time is the next-page cursor. Dropped events (no budget,
	// invalid JSON) must not freeze the cursor on the newest valid task.
	const lastRelayTimestamp =
		oldestEventTimestamp(events) ??
		(uniqueTasks.length > 0 ? Math.min(...uniqueTasks.map((t) => t.createdAt ?? 0)) : undefined);

	// Relay has more if it returned a full page
	const hasMore = events.length >= limit;

	// Exclude own tasks
	const tasksExcludingOwn = npub ? uniqueTasks.filter((t) => t.npub !== npub) : uniqueTasks;

	// Apply mute filter — muted tasks are excluded from what the user sees
	const tasksMuteFiltered =
		currentMutes.mutedPubkeys.size > 0
			? tasksExcludingOwn.filter((t) => !currentMutes.mutedPubkeys.has(t.npub))
			: tasksExcludingOwn;

	// Single index pass: index the pre-mute superset once, then derive cache and display subsets.
	// Mute filtering only removes items (npub check) — it doesn't affect indexed properties,
	// so indexing the superset and filtering the IndexedTask[] is equivalent to indexing each subset.
	const allIndexed = indexTaskData(tasksExcludingOwn);

	// Store pre-mute data in cache so muting/unmuting is instant without relay refetch
	const cacheKey = (() => {
		const { until: _u, ...f } = filter as typeof filter & { until?: unknown };
		return JSON.stringify(f);
	})();
	const existingCached = cache.get(cacheKey);
	let allCachedTasks: IndexedTask[];
	if (existingCached && Date.now() - existingCached.timestamp < CACHE_TTL) {
		const mergedById = new Map<string, IndexedTask>();
		for (const t of existingCached.data) mergedById.set(t.id, t);
		for (const t of allIndexed) {
			const existing = mergedById.get(t.id);
			if (!existing || ((t as Task).createdAt ?? 0) > ((existing as Task)?.createdAt ?? 0)) {
				mergedById.set(t.id, t);
			}
		}
		allCachedTasks = Array.from(mergedById.values());
	} else {
		allCachedTasks = [...allIndexed];
	}
	allCachedTasks = deduplicateTasksById(allCachedTasks);
	if (allCachedTasks.length > MAX_CACHE_SIZE)
		allCachedTasks = allCachedTasks.slice(0, MAX_CACHE_SIZE);

	// Apply frontend filters (categories, skills, location, etc.)
	const indexedVisible =
		currentMutes.mutedPubkeys.size > 0
			? allIndexed.filter((t) => !currentMutes.mutedPubkeys.has(t.npub))
			: allIndexed;
	const { tasks: filteredTasks, metrics } = filterIndexedTasks(indexedVisible, params);
	performanceMonitor.addMetric(metrics);
	const visibleTasks = deduplicateTasksById(cleanupIndexedTasks(filteredTasks));

	// Keep the relay's hasMore. A search page with no visible match is not
	// proof the term is absent — the next page may hold it.
	cache.set(cacheKey, { data: allCachedTasks, timestamp: Date.now(), hasMore });

	d.log('fetchOnePage', {
		raw: rawTasks.length,
		unique: uniqueTasks.length,
		muted: tasksExcludingOwn.length - tasksMuteFiltered.length,
		visible: visibleTasks.length,
		hasMore,
		usedFallback,
		lastRelayTimestamp
	});

	return { visibleTasks, lastRelayTimestamp, hasMore, usedFallback };
}

/**
 * Find tasks based on search parameters.
 *
 * Core guarantee: always returns `limit` visible tasks (or everything the relay
 * has left) before resolving. If muted users fill up a relay page, this function
 * automatically fetches additional pages until the limit is satisfied or the relay
 * is exhausted — so the caller never has to deal with under-full pages.
 *
 * Cache: stores raw relay events (pre-mute) keyed by search shape. Mute filtering
 * is re-applied at read time so muting/unmuting takes effect without a relay refetch.
 * The cache is bypassed when an explicit `until` cursor is provided (pagination
 * requests always go to the relay to get fresh deeper data).
 */
export async function findTasks(
	params: SearchTasksParams,
	epoch?: number,
	signal?: AbortSignal
): Promise<{ tasks: Task[]; total: number; hasMore: boolean }> {
	const MAX_FILL_ROUNDS = 10; // Safety cap: at most 10 relay round-trips per findTasks call
	// Callers that only pass search params still participate in stale-response
	// cancellation: the page bumps the epoch before calling, and we snapshot it here.
	const activeEpoch = epoch ?? currentTasksSearchEpoch();
	const cancelled = () => signal?.aborted || !isTasksSearchCurrent(activeEpoch);
	try {
		if (!isTasksSearchCurrent(activeEpoch)) {
			return { tasks: [], total: 0, hasMore: false };
		}
		tasksStore.update((state) => ({ ...state, loading: true, error: null }));

		const limit = params.limit || BATCH_SIZE;
		const isInitialLoad = !params.until;

		// ── CACHE PATH (initial load only, no `until` cursor) ──
		if (isInitialLoad) {
			const filter = createTaskFilter(params);
			const { until: _u, ...filterWithoutUntil } = filter as typeof filter & { until?: unknown };
			const cacheKey = JSON.stringify(filterWithoutUntil);
			const cached = cache.get(cacheKey);

			if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
				const muteState = get(muteStore);
				// Re-apply mute filter live so recent mutes are reflected immediately
				const unmuted =
					muteState.mutedPubkeys.size > 0
						? cached.data.filter((t) => !muteState.mutedPubkeys.has(t.npub))
						: cached.data;

				const { tasks: filteredTasks, metrics } = filterIndexedTasks(unmuted, params);
				metrics.cacheHit = true;
				performanceMonitor.addMetric(metrics);

				const cleanTasks = deduplicateTasksById(cleanupIndexedTasks(filteredTasks));
				const currentItemsCount = get(tasksStore).items.length;

				// Serve next slice from cache when navigating back to tasks
				const startIndex = params.page && params.page > 1 ? currentItemsCount : 0;
				const endIndex = Math.min(startIndex + limit, cleanTasks.length);
				const slicedTasks = cleanTasks.slice(startIndex, endIndex);
				const hasMore = endIndex < cleanTasks.length || cached.hasMore;

				const cachedRelayTimestamp =
					cached.data.length > 0
						? Math.min(
								...cached.data.map((t) => (t as unknown as { createdAt?: number }).createdAt ?? 0)
							)
						: undefined;

				d.log('cache hit', { cached: cached.data.length, visible: slicedTasks.length, hasMore });

				if (!isTasksSearchCurrent(activeEpoch)) {
					return { tasks: [], total: 0, hasMore: false };
				}
				tasksStore.update((state) => ({
					...state,
					items: deduplicateTasksById(
						startIndex === 0 ? slicedTasks : [...state.items, ...slicedTasks]
					),
					loading: false,
					currentPage: params.page || 1,
					hasMore,
					lastRelayTimestamp: cachedRelayTimestamp ?? state.lastRelayTimestamp
				}));

				// If cache is fully muted out but relay has more, fall through to relay path
				if (slicedTasks.length < limit && cached.hasMore) {
					const storeTs = get(tasksStore).lastRelayTimestamp ?? cachedRelayTimestamp;
					if (storeTs) {
						d.log('cache exhausted, continuing from relay', { storeTs });
						// Don't return here — fall through below by clearing cache and re-entering relay loop
						cache.delete(cacheKey);
						// Recurse with cursor so we pick up from where cache left off
						const moreResult = await findTasks(
							{ ...params, until: storeTs - 1, limit },
							activeEpoch,
							signal
						);
						// Merge the extra tasks into the store (already done inside recursive call)
						return {
							tasks: [...slicedTasks, ...moreResult.tasks],
							total: slicedTasks.length + moreResult.total,
							hasMore: moreResult.hasMore
						};
					}
				}

				return { tasks: slicedTasks, total: slicedTasks.length, hasMore };
			}
		}

		// ── RELAY PATH ──
		// Fetch pages from the relay, accumulating visible tasks until `limit` is met.
		const { value: npub } = await Preferences.get({ key: StorageKeys.NPUB });
		const currentMutes = get(muteStore);

		const accumulatedTasks: Task[] = [];
		let cursor = params.until; // advances with each round-trip
		let hasMore = true;
		let lastRelayTimestamp: number | undefined;
		let rounds = 0;
		let consecutiveEmptyRounds = 0;
		let lastPageHasMore = false;
		const MAX_CONSECUTIVE_EMPTY = 2;

		while (accumulatedTasks.length < limit && hasMore && rounds < MAX_FILL_ROUNDS) {
			if (cancelled()) return { tasks: [], total: 0, hasMore: false };
			rounds++;
			const roundParams = { ...params, until: cursor, limit };
			const result = await fetchOnePage(roundParams, npub, currentMutes, signal);
			if (cancelled()) return { tasks: [], total: 0, hasMore: false };

			// Merge new tasks, dedup in case relay sends duplicates across pages
			const prevCount = accumulatedTasks.length;
			const combined = deduplicateTasksById([...accumulatedTasks, ...result.visibleTasks]);
			accumulatedTasks.length = 0;
			accumulatedTasks.push(...combined);
			const newTasksAdded = accumulatedTasks.length - prevCount;

			// A NIP-50 miss still has more catalog pages. Keep scanning those
			// pages instead of treating the first empty page as "no such task".
			if (newTasksAdded === 0 && !(result.usedFallback && result.hasMore)) {
				consecutiveEmptyRounds++;
				if (consecutiveEmptyRounds >= MAX_CONSECUTIVE_EMPTY) {
					d.log('fill loop: consecutive empty rounds, stopping', { round: rounds });
					hasMore = false;
					break;
				}
			} else if (newTasksAdded > 0) {
				consecutiveEmptyRounds = 0;
			}

			lastPageHasMore = result.hasMore;
			hasMore = result.hasMore;
			if (result.lastRelayTimestamp !== undefined) {
				lastRelayTimestamp = result.lastRelayTimestamp;
				cursor = result.lastRelayTimestamp - 1;
			} else {
				// Relay returned nothing — no point continuing
				break;
			}

			// Show the first page before later rounds finish.
			if (!params.until && accumulatedTasks.length > 0 && isTasksSearchCurrent(activeEpoch)) {
				const progressive = accumulatedTasks.slice(0, limit);
				tasksStore.update((state) => ({
					...state,
					items: deduplicateTasksById(progressive),
					loading: true,
					error: null,
					currentPage: params.page || 1,
					hasMore,
					lastRelayTimestamp: lastRelayTimestamp ?? state.lastRelayTimestamp
				}));
			}

			d.log('fill loop', { round: rounds, accumulated: accumulatedTasks.length, limit, hasMore });
		}

		// Hitting the page cap is not the end of the catalog. Leave hasMore set
		// when the last relay page was full so the next scroll continues the scan.
		if (rounds >= MAX_FILL_ROUNDS && accumulatedTasks.length < limit) {
			hasMore = lastPageHasMore;
		}

		const finalTasks = accumulatedTasks.slice(0, limit);

		if (!isTasksSearchCurrent(activeEpoch)) {
			return { tasks: [], total: 0, hasMore: false };
		}

		// Commit to store
		tasksStore.update((state) => ({
			...state,
			items: deduplicateTasksById(params.page === 1 ? finalTasks : [...state.items, ...finalTasks]),
			loading: false,
			currentPage: params.page || 1,
			hasMore,
			lastRelayTimestamp: lastRelayTimestamp ?? state.lastRelayTimestamp
		}));

		return { tasks: finalTasks, total: finalTasks.length, hasMore };
	} catch (error) {
		if (isSearchAbort(error, signal) || !isTasksSearchCurrent(activeEpoch)) {
			return { tasks: [], total: 0, hasMore: false };
		}
		console.error('[findTasks] Error:', error);
		if (!isTasksSearchCurrent(activeEpoch)) {
			return { tasks: [], total: 0, hasMore: false };
		}
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
