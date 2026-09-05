import type { SearchTasksParams, Task } from '$lib/types/task.d';
import { type Event, type Filter } from 'nostr-tools';
import { browser } from '$app/environment';
import { get } from 'svelte/store';
import { tasksStore } from '$lib/stores/task.store';
import nostrEventsService from '$lib/api/services/nostr/events';
import KINDS from '$lib/utils/constants/kinds';
import { muteStore } from '$lib/stores/mute.store';

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
		limit: params.limit ?? 10,
		until: params.until
	};
	if (params.since !== undefined) filter.since = params.since;
	if (params.search?.trim()) filter.search = params.search.trim();
	if (params.status?.length) filter['S'] = params.status;
	if (params.taskType) filter['T'] = [params.taskType];
	return filter;
}

function toTask(event: Event): Task {
	const content = JSON.parse(event.content) as Omit<Task, 'id' | 'npub' | 'createdAt'>;
	const dTag = event.tags.find((tag) => tag[0] === 'd')?.[1];
	return { ...content, id: dTag ?? event.id, npub: event.pubkey, createdAt: event.created_at };
}

function applyLocalFilters(tasks: Task[], params: SearchTasksParams): Task[] {
	const search = params.search?.trim().toLowerCase();
	const muted = get(muteStore).mutedPubkeys;
	return tasks.filter((task) => {
		if (muted.has(task.npub)) return false;
		if (params.taskType && task.taskType !== params.taskType) return false;
		if (params.status?.length && !params.status.includes(task.status)) return false;
		if (params.categories?.length && !params.categories.some((id) => task.categories?.some((category) =>
			(typeof category === 'string' ? category : category.id) === id))) return false;
		if (params.skills?.length && !params.skills.some((skill) => task.skills?.includes(skill))) return false;
		if (!search) return true;
		const haystack = [task.title, task.description, ...(task.skills ?? [])].join(' ').toLowerCase();
		return haystack.includes(search);
	});
}

export async function findTasks(params: SearchTasksParams): Promise<{ tasks: Task[]; total: number; hasMore: boolean }> {
	const limit = params.limit ?? 10;
	const cacheKey = JSON.stringify({ ...params, until: undefined });
	const cached = !params.until ? cache.get(cacheKey) : undefined;
	let tasks: Task[];

	try {
		if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
			tasks = cached.tasks;
			metrics = { ...metrics, totalOperations: metrics.totalOperations + 1, cacheHitRate: 1 };
		} else {
			const response = await nostrEventsService.findEvents(createTaskFilter(params));
			tasks = (Array.isArray(response.data) ? response.data : []).flatMap((event) => {
				try {
					return [toTask(event as Event)];
				} catch {
					return [];
				}
			});
			tasks.sort((left, right) => right.createdAt - left.createdAt);
			cache.set(cacheKey, { tasks, timestamp: Date.now() });
			metrics = { ...metrics, totalOperations: metrics.totalOperations + 1, cacheHitRate: 0 };
		}

		const visibleTasks = applyLocalFilters(tasks, params).slice(0, limit);
		tasksStore.update((state) => ({
			...state,
			items: params.page && params.page > 1 ? [...state.items, ...visibleTasks] : visibleTasks,
			loading: false,
			error: null,
			currentPage: params.page ?? 1,
			hasMore: tasks.length > visibleTasks.length,
			lastRelayTimestamp: visibleTasks.at(-1)?.createdAt ?? state.lastRelayTimestamp
		}));
		return { tasks: visibleTasks, total: visibleTasks.length, hasMore: tasks.length > visibleTasks.length };
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

