import type { SearchTasksParams, Task } from '$lib/types/task.d';
import { type Event, type Filter } from 'nostr-tools';
import { browser } from '$app/environment';
import { tasksStore } from '$lib/stores/task.store';
import { TaskStatusEnum } from '$lib/utils/enums/task.enum';
import { getDateRangeTags } from '$lib/utils/helpers/dateTier';
import nostrEventsService from '$lib/api/services/nostr/events';
import KINDS from '$lib/utils/constants/kinds';

// Constants
const BATCH_SIZE = 20; // Default tasks limit per page
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Memory cache
const cache = new Map<string, { data: Task[]; timestamp: number }>();

/**
 * Convert search params to Nostr filter
 */
function createTaskFilter(params: SearchTasksParams): Filter {
    const filter: Filter & { [key: string]: string[] | number[] | string | number | undefined } = {
        kinds: [KINDS.TASK_CREATION],
        limit: params.limit || BATCH_SIZE,
        until: params.until || undefined
    };

    // Status filter
    if (params.status && params.status.length > 0) {
        filter['S'] = params.status;
    }

    // Category filter
    if (params.categories && params.categories.length > 0) {
        filter['c'] = params.categories;
    }

    // Skills filter
    if (params.skills && params.skills.length > 0) {
        filter['s'] = params.skills;
    }

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

    // Date tier filtering
    if (params.dateRange) {
        const dateRangeTags = getDateRangeTags(params.dateRange?.end, params.dateRange?.start);
        filter['M'] = dateRangeTags.months;
        filter['D'] = dateRangeTags.days;
    }

    // Deadline filter using tier system (single date)
    if (params.deadline) {
        const dateRangeTags = getDateRangeTags(params.deadline);
        filter['M'] = dateRangeTags.months;
        filter['D'] = dateRangeTags.days;
    }


    // Task type filter (onsite or remote)
    if (params.taskType) {
        filter['T'] = [params.taskType];
    }

    // Location filter with enhanced structure
    if (params.location) {
        filter['T'] = ['onsite'];
        filter['L'] = [params.location];
    }

    // Add NIP-50 search support
    if (params.search) {
        filter.search = params.search.trim();
    }

    filter['S'] = [TaskStatusEnum.OPEN];

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
    }
}

/**
 * Find tasks based on search parameters
 */
export async function findTasks(params: SearchTasksParams): Promise<{ tasks: Task[]; total: number; hasMore: boolean }> {
    try {
        tasksStore.update(state => ({ ...state, loading: true, error: null }));

        const filter = createTaskFilter(params);

        const cacheKey = JSON.stringify(filter);
        const cached = cache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
            const tasks = cached.data;
            tasksStore.update(state => ({
                ...state,
                items: tasks,
                loading: false,
                currentPage: params.page || 1,
                hasMore: tasks.length >= (params.limit || BATCH_SIZE),
            }));
            return {
                tasks,
                total: tasks.length,
                hasMore: tasks.length >= (params.limit || BATCH_SIZE)
            };
        }

        try {
            const response = await nostrEventsService.findEvents(filter);

            const events = response.data || [];
            const total = events.length;

            // TODO: To be removed and handled by the find-tasks page for better performance
            const tasks = events.map((event: Event) => convertEventToTask(event));

            // Update cache
            cache.set(cacheKey, { data: tasks, timestamp: Date.now() });

            // Update store
            tasksStore.update(state => ({
                ...state,
                items: [...state.items, ...tasks],
                loading: false,
                currentPage: params.page || 1,
                hasMore: tasks.length >= (params.limit || BATCH_SIZE),
            }));

            return {
                tasks,
                total,
                hasMore: tasks.length >= (params.limit || BATCH_SIZE)
            };
        } catch (apiError) {
            console.error('API request failed - ', apiError);

            return {
                tasks: [],
                total: 0,
                hasMore: false
            }
        }
    } catch (error) {
        console.error('Error finding tasks:', error);
        tasksStore.update(state => ({
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
}

// Cleanup pool and subscriptions when browser closes
if (browser) {
    window.addEventListener('beforeunload', () => {
        console.log('Cleaning up Nostr connections');
        cache.clear();
    });
}