import type { SearchTasksParams, Task } from '$lib/types/task.d';
import { type Event, type Filter } from 'nostr-tools';
import { browser } from '$app/environment';
import { get } from 'svelte/store';
import { tasksStore } from '$lib/stores/task.store';
import nostrEventsService from '$lib/api/services/nostr/events';
import KINDS from '$lib/utils/constants/kinds';
import { muteStore } from '$lib/stores/mute.store';
import { withoutProductionCatalogRelays } from '$lib/nostr/catalog-guard';
import { mergeRelayEvents, queryListingRelays } from '$lib/nostr/listing-relays';
import { LISTING_QUERY_MS, queryRelayEvents } from '$lib/nostr/relayQuery';
import { dedupeReplaceableTasks } from '$lib/browse/task-board';
import { parseTaskEvent } from '$lib/nostr/parseTaskEvent';
import { resolveTaskRelayUrls } from '$lib/utils/relayUrls';

/** A full catalog page waits for EOSE. The 2.5s paint budget used to resolve to [] and stop paging. */
const CATALOG_PAGE_MS = 20_000;

type TaskMetrics = {
	totalOperations: number;
	averageFilterTime: number;
	cacheHitRate: number;
	filterEfficiency: number;
};

const cache = new Map<
	string,
	{ tasks: Task[]; timestamp: number; filled: boolean; oldestCreatedAt: number | null }
>();
const CACHE_TTL = 5 * 60 * 1000;
let metrics: TaskMetrics = {
	totalOperations: 0,
	averageFilterTime: 0,
	cacheHitRate: 0,
	filterEfficiency: 1
};

function createTaskFilter(params: SearchTasksParams): Filter {
	const filter: Filter & Record<string, unknown> = {
		kinds: params.kinds ?? [KINDS.TASK_CREATION],
		limit: params.limit ?? 10
	};
	if (params.until !== undefined) filter.until = params.until;
	if (params.since !== undefined) filter.since = params.since;
	if (params.status?.length) filter['S'] = params.status;
	if (params.taskType) filter['T'] = [params.taskType];
	return filter;
}

/**
 * Deduplicate replaceable task events by their d-tag id. Nostr addressable
 * events are replaceable, so relays may return multiple versions of the same
 * task. Per Nostr coordinate ownership semantics, the first publisher (oldest
 * created_at) owns the d-tag; a later event with the same d-tag from a
 * different pubkey is a zombie and is discarded.
 */
function deduplicateById(tasks: Task[]): Task[] {
	return dedupeReplaceableTasks(tasks);
}

function applyLocalFilters(tasks: Task[], params: SearchTasksParams): Task[] {
	const search = params.search?.trim().toLowerCase();
	const muted = get(muteStore).mutedPubkeys;
	return tasks.filter((task) => {
		if (muted.has(task.npub)) return false;
		if (params.taskType && task.taskType !== params.taskType) return false;
		if (params.status?.length && !params.status.includes(task.status)) return false;
		if (
			params.categories?.length &&
			!params.categories.some((id) =>
				task.categories?.some(
					(category) => (typeof category === 'string' ? category : category.id) === id
				)
			)
		)
			return false;
		if (params.skills?.length && !params.skills.some((skill) => task.skills?.includes(skill)))
			return false;
		if (!search) return true;
		const haystack = [task.title, task.description, ...(task.skills ?? [])].join(' ').toLowerCase();
		return haystack.includes(search);
	});
}

async function findTasksFromRelays(filter: Filter): Promise<Event[]> {
	return queryRelayEvents(
		withoutProductionCatalogRelays(resolveTaskRelayUrls(import.meta.env.VITE_NOSTR_TASK_RELAY_URL)),
		filter,
		{ timeoutMs: LISTING_QUERY_MS }
	);
}

function withinBudget<T>(work: Promise<T>, fallback: T, started: number): Promise<T> {
	const left = LISTING_QUERY_MS - (Date.now() - started);
	if (left <= 0) return Promise.resolve(fallback);
	return Promise.race([
		work,
		new Promise<T>((resolve) => {
			setTimeout(() => resolve(fallback), left);
		})
	]);
}

function pageCursor(
	events: Event[],
	limit: number
): { filled: boolean; oldestCreatedAt: number | null } {
	let oldestCreatedAt: number | null = null;
	for (const event of events) {
		if (typeof event.created_at !== 'number') continue;
		if (oldestCreatedAt === null || event.created_at < oldestCreatedAt) {
			oldestCreatedAt = event.created_at;
		}
	}
	return { filled: events.length >= limit, oldestCreatedAt };
}

function tasksFromEvents(events: Event[]): Task[] {
	const tasks = deduplicateById(
		events.flatMap((event) => {
			const task = parseTaskEvent(event);
			return task ? [task] : [];
		})
	);
	tasks.sort((left, right) => right.createdAt - left.createdAt);
	return tasks;
}

function oldestShownAt(tasks: Task[]): number | null {
	let oldest: number | null = null;
	for (const task of tasks) {
		if (typeof task.createdAt !== 'number') continue;
		if (oldest === null || task.createdAt < oldest) oldest = task.createdAt;
	}
	return oldest;
}

export async function findTasks(
	params: SearchTasksParams,
	onBatch?: (tasks: Task[]) => void
): Promise<{
	tasks: Task[];
	total: number;
	hasMore: boolean;
	filled: boolean;
	oldestCreatedAt: number | null;
}> {
	const limit = params.limit ?? 10;
	const cacheKey = JSON.stringify({ ...params, until: undefined });
	const cached = !params.until ? cache.get(cacheKey) : undefined;
	let tasks: Task[];
	let filled = false;
	let oldestCreatedAt: number | null = null;

	try {
		if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
			tasks = cached.tasks;
			filled = cached.filled;
			oldestCreatedAt = cached.oldestCreatedAt;
			metrics = { ...metrics, totalOperations: metrics.totalOperations + 1, cacheHitRate: 1 };
		} else if (params.catalogOnly) {
			const filter = createTaskFilter(params);
			const publishTasks = (arrived: Event[]) => {
				onBatch?.(applyLocalFilters(tasksFromEvents(arrived), params).slice(0, limit));
			};
			// Keep every event the relay sent. A paint timeout must not look like the last page.
			const events = await queryListingRelays(filter, {
				timeoutMs: CATALOG_PAGE_MS,
				onEvents: publishTasks
			});
			tasks = tasksFromEvents(events);
			({ filled, oldestCreatedAt } = pageCursor(events, limit));
			if (!params.until)
				cache.set(cacheKey, { tasks, timestamp: Date.now(), filled, oldestCreatedAt });
			metrics = { ...metrics, totalOperations: metrics.totalOperations + 1, cacheHitRate: 0 };
		} else {
			const filter = createTaskFilter(params);
			const started = Date.now();
			const publishTasks = (arrived: Event[]) => {
				onBatch?.(applyLocalFilters(tasksFromEvents(arrived), params).slice(0, limit));
			};
			// Indexer, catalog, and the task-relay fallback share one 2.5s budget.
			const catalog = queryListingRelays(filter, {
				timeoutMs: LISTING_QUERY_MS,
				onEvents: publishTasks
			});
			const response = await withinBudget(
				nostrEventsService
					.findEvents({
						...filter,
						relayTimeoutMs: LISTING_QUERY_MS,
						onRelayEvents: publishTasks
					})
					.catch(() => ({ data: [] as Event[] })),
				{ data: [] as Event[] },
				started
			);
			const primary = Array.isArray(response.data) ? response.data : [];
			let events = mergeRelayEvents([primary, await withinBudget(catalog, [], started)]);
			if (tasksFromEvents(events).length === 0) {
				events = mergeRelayEvents([
					events,
					await withinBudget(findTasksFromRelays(filter), [], started)
				]);
			}
			tasks = tasksFromEvents(events);
			({ filled, oldestCreatedAt } = pageCursor(events, limit));
			if (!params.until)
				cache.set(cacheKey, { tasks, timestamp: Date.now(), filled, oldestCreatedAt });
			metrics = { ...metrics, totalOperations: metrics.totalOperations + 1, cacheHitRate: 0 };
		}

		// A catalog scan must not use this slice with a shared until. Two relays each
		// return `limit` events; keeping only `limit` of the merge, then walking to
		// the oldest raw created_at, skips the rows that lost the slice.
		const visibleTasks = applyLocalFilters(tasks, params).slice(0, limit);
		const relayHasMore = filled || tasks.length > visibleTasks.length;
		const cursor = oldestShownAt(visibleTasks) ?? oldestCreatedAt;
		onBatch?.(visibleTasks);
		// Catalog paging reads the return value. Writing each page into the store
		// replaced the /tasks list with whichever page finished last.
		if (!params.catalogOnly) {
			tasksStore.update((state) => ({
				...state,
				items:
					params.page && params.page > 1
						? dedupeReplaceableTasks([...state.items, ...visibleTasks]).sort(
								(left, right) => right.createdAt - left.createdAt
							)
						: visibleTasks,
				loading: false,
				error: null,
				currentPage: params.page ?? 1,
				hasMore: relayHasMore,
				lastRelayTimestamp: cursor ?? state.lastRelayTimestamp
			}));
		}
		return {
			tasks: visibleTasks,
			total: visibleTasks.length,
			hasMore: relayHasMore,
			filled,
			// Catalog pages use the oldest raw event. The visible cursor can sit on a
			// future-dated [TEST] row and never walk backward through the relay.
			oldestCreatedAt: params.catalogOnly ? oldestCreatedAt : cursor
		};
	} catch (error) {
		tasksStore.update((state) => ({
			...state,
			loading: false,
			error: error instanceof Error ? error.message : 'Failed to fetch tasks'
		}));
		throw error;
	}
}

export function cleanup(): void {
	cache.clear();
}

export function getFilterPerformanceReport(): TaskMetrics {
	return { ...metrics };
}

if (browser) {
	window.addEventListener('beforeunload', cleanup);
}
