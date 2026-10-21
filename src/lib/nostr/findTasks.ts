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
import { endFromTags } from '$lib/utils/helpers/taskDeadline';
import { resolveTaskRelayUrls } from '$lib/utils/relayUrls';

type TaskMetrics = {
	totalOperations: number;
	averageFilterTime: number;
	cacheHitRate: number;
	filterEfficiency: number;
};

const cache = new Map<string, { tasks: Task[]; timestamp: number }>();
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

function isTaskContent(value: unknown): value is Omit<Task, 'id' | 'npub' | 'createdAt'> {
	if (typeof value !== 'object' || value === null) return false;
	const task = value as { title?: unknown; budget?: { amount?: unknown } };
	return (
		typeof task.title === 'string' &&
		task.title.trim().length > 0 &&
		typeof task.budget?.amount === 'number' &&
		typeof (task as { status?: unknown }).status === 'string'
	);
}

function toTask(event: Event): Task | null {
	let content: unknown;
	try {
		content = JSON.parse(event.content);
	} catch {
		return null;
	}
	if (!isTaskContent(content)) return null;
	const taggedEnd = endFromTags(event.tags);
	if (!content.deadline && taggedEnd) content.deadline = taggedEnd;
	const dTag = event.tags.find((tag) => tag[0] === 'd')?.[1];
	return {
		...content,
		id: dTag ?? event.id,
		eventId: event.id,
		npub: event.pubkey,
		createdAt: event.created_at
	};
}

/**
 * Deduplicate replaceable task events by their d-tag id. Nostr addressable
 * events are replaceable, so relays may return multiple versions of the same
 * task. Per Nostr coordinate ownership semantics, the first publisher (oldest
 * created_at) owns the d-tag; a later event with the same d-tag from a
 * different pubkey is a zombie and is discarded.
 */
function deduplicateById(tasks: Task[]): Task[] {
	const byId = new Map<string, Task>();
	for (const task of tasks) {
		const existing = byId.get(task.id);
		if (!existing) {
			byId.set(task.id, task);
			continue;
		}
		if (task.npub === existing.npub) {
			// Same author republishing an update — keep the newest version.
			if (task.createdAt >= existing.createdAt) byId.set(task.id, task);
		} else if (task.createdAt < existing.createdAt) {
			// Different pubkey claiming the d-tag — earliest publisher owns it.
			byId.set(task.id, task);
		}
	}
	return [...byId.values()];
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

function tasksFromEvents(events: Event[]): Task[] {
	const tasks = deduplicateById(
		events.flatMap((event) => {
			const task = toTask(event);
			return task ? [task] : [];
		})
	);
	tasks.sort((left, right) => right.createdAt - left.createdAt);
	return tasks;
}

export async function findTasks(
	params: SearchTasksParams,
	onBatch?: (tasks: Task[]) => void
): Promise<{ tasks: Task[]; total: number; hasMore: boolean }> {
	const limit = params.limit ?? 10;
	const cacheKey = JSON.stringify({ ...params, until: undefined });
	const cached = !params.until ? cache.get(cacheKey) : undefined;
	let tasks: Task[];

	try {
		if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
			tasks = cached.tasks;
			metrics = { ...metrics, totalOperations: metrics.totalOperations + 1, cacheHitRate: 1 };
		} else if (params.catalogOnly) {
			const filter = createTaskFilter(params);
			const started = Date.now();
			const publishTasks = (arrived: Event[]) => {
				onBatch?.(applyLocalFilters(tasksFromEvents(arrived), params).slice(0, limit));
			};
			const events = await withinBudget(
				queryListingRelays(filter, {
					timeoutMs: LISTING_QUERY_MS,
					onEvents: publishTasks
				}),
				[] as Event[],
				started
			);
			tasks = tasksFromEvents(events);
			cache.set(cacheKey, { tasks, timestamp: Date.now() });
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
			cache.set(cacheKey, { tasks, timestamp: Date.now() });
			metrics = { ...metrics, totalOperations: metrics.totalOperations + 1, cacheHitRate: 0 };
		}

		const visibleTasks = applyLocalFilters(tasks, params).slice(0, limit);
		onBatch?.(visibleTasks);
		tasksStore.update((state) => ({
			...state,
			items: params.page && params.page > 1 ? [...state.items, ...visibleTasks] : visibleTasks,
			loading: false,
			error: null,
			currentPage: params.page ?? 1,
			hasMore: tasks.length > visibleTasks.length,
			lastRelayTimestamp: visibleTasks.at(-1)?.createdAt ?? state.lastRelayTimestamp
		}));
		return {
			tasks: visibleTasks,
			total: visibleTasks.length,
			hasMore: tasks.length > visibleTasks.length
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
