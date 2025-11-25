import type { SearchTasksParams, Task } from '$lib/types/task.d';
import { type Event, type Filter } from 'nostr-tools';
import { browser } from '$app/environment';
import { tasksStore } from '$lib/stores/task.store';
import { TaskStatusEnum } from '$lib/utils/enums/task.enum';
// import { getDateRangeTags } from '$lib/utils/helpers/dateTier';
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

// Constants
const BATCH_SIZE = 20; // Default tasks limit per page
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Memory cache with indexed tasks for better performance
const cache = new Map<string, { data: IndexedTask[]; timestamp: number }>();

/**
 * Convert search params to Nostr filter
 */
function createTaskFilter(params: SearchTasksParams): Filter {
    const filter: Filter & { [key: string]: any } = {
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

    // Always filter to show only OPEN tasks
    // Override any status filter to ensure we only show active tasks
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
            // Use optimized filtering with pre-indexed data
            const { tasks: filteredTasks, metrics } = filterIndexedTasks(cached.data, params);
            metrics.cacheHit = true;
            performanceMonitor.addMetric(metrics);

            // Convert back to regular Task objects for the store
            const cleanTasks = cleanupIndexedTasks(filteredTasks);

            tasksStore.update(state => ({
                ...state,
                items: cleanTasks,
                loading: false,
                currentPage: params.page || 1,
                hasMore: cleanTasks.length >= (params.limit || BATCH_SIZE),
            }));

            console.debug(`[FindTasks] Cache hit - returned ${cleanTasks.length} tasks in ${metrics.filterTime.toFixed(2)}ms`);
            
            return {
                tasks: cleanTasks,
                total: cleanTasks.length,
                hasMore: cleanTasks.length >= (params.limit || BATCH_SIZE)
            };
        }

        try {
            const response = await nostrEventsService.findEvents(filter);

            const events = response.data || [];
            // const total = events.length;

            // For public users, show all tasks without filtering by npub
            // This avoids triggering biometric authentication for public users
            const { value: npub } = await Preferences.get({ key: StorageKeys.NPUB });
            
            // TEMPORARY: Allow showing own tasks in development for testing
            // Set this to true to see your own tasks in Find Tasks for testing purposes
            const SHOW_OWN_TASKS_FOR_TESTING = typeof window !== 'undefined' && 
                (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') &&
                new URLSearchParams(window.location.search).get('showOwnTasks') === 'true';
            
            const rawTasks = events.map((event: Event) => convertEventToTask(event)).filter((task: Task) => {
                if (SHOW_OWN_TASKS_FOR_TESTING) {
                    // In testing mode, show all tasks including own tasks
                    return true;
                }
                // Normal mode: exclude own tasks
                return task.npub !== npub;
            });

            // Pre-index tasks for optimized filtering
            const indexedTasks = indexTaskData(rawTasks);

            // Apply optimized frontend filtering
            const { tasks: filteredTasks, metrics } = filterIndexedTasks(indexedTasks, params);
            performanceMonitor.addMetric(metrics);

            // Update cache with indexed data for faster subsequent operations
            cache.set(cacheKey, { data: indexedTasks, timestamp: Date.now() });

            // Convert back to regular Task objects for the store
            const cleanTasks = cleanupIndexedTasks(filteredTasks);

            // Update store - REEMPLAZAR en lugar de concatenar
            tasksStore.update(state => ({
                ...state,
                items: params.page === 1 ? cleanTasks : [...state.items, ...cleanTasks], // Solo concatenar si no es la primera página
                loading: false,
                currentPage: params.page || 1,
                hasMore: cleanTasks.length >= (params.limit || BATCH_SIZE),
            }));

            console.debug(`[FindTasks] Fresh data - processed ${rawTasks.length} → ${cleanTasks.length} tasks (index: ${metrics.indexTime?.toFixed(2)}ms, filter: ${metrics.filterTime.toFixed(2)}ms)`);

            return {
                tasks: cleanTasks,
                total: cleanTasks.length,
                hasMore: cleanTasks.length >= (params.limit || BATCH_SIZE)
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
    performanceMonitor.clear();
}

/**
 * Get performance metrics for task filtering operations
 */
export function getFilterPerformanceReport() {
    return performanceMonitor.getPerformanceReport();
}

// Cleanup pool and subscriptions when browser closes
if (browser) {
    window.addEventListener('beforeunload', () => {
        cache.clear();
    });
}
