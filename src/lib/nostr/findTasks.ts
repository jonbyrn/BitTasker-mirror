import type { SearchTasksParams, Task, SavedSearch } from '$lib/types/task.d';
import { type Event, type Filter, SimplePool } from 'nostr-tools';
import { browser } from '$app/environment';
import { appStore } from '$lib/stores/app.store';
import { getSignedEvent } from '$lib/utils/nostr';
import { getNpub } from '$lib/utils/nostrKeys';
import { tasksStore } from '$lib/stores/task.store';
import { PUBLIC_NOSTR_RELAY_URL } from '$env/static/public';
import { getDateRangeTags } from '$lib/utils/helpers/dateTier';
import { NotificationFrequency, TaskStatusEnum } from '$lib/utils/enums/task.enum';
import nostrEventsService from '$lib/api/services/nostr/events';
import KINDS from '$lib/utils/constants/kinds';

// Constants
const BATCH_SIZE = 20; // Default tasks limit per page
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Memory cache
const cache = new Map<string, { data: Task[]; timestamp: number }>();

// Pool for profile data queries (general Nostr network)
const pool = new SimplePool();

/**
 * Convert Nostr filter to API query parameters
 * The API expects tag filters without the '#' prefix
 */
function convertFilterToApiParams(filter: Filter): Record<string, any> {
    const params: Record<string, any> = {};

    // Direct mappings
    if (filter.ids) params.ids = filter.ids;
    if (filter.authors) params.authors = filter.authors;
    if (filter.kinds) params.kinds = filter.kinds;
    if (filter.since) params.since = filter.since;
    if (filter.until) params.until = filter.until;
    if (filter.limit) params.limit = filter.limit;
    if (filter.search) params.search = filter.search;

    // Convert tag filters from #tagname to tagname
    Object.keys(filter).forEach(key => {
        if (key.startsWith('#')) {
            // const tagName = key.substring(1); // Remove the '#'
            const value = filter[key as keyof Filter];
            if (Array.isArray(value)) {
                params[key] = value;
            }
        }
    });

    return params;
}

/**
 * Extract all category values from an event's tags
 */
function extractCategories(event: Event): string[] {
    return event.tags
        .filter(tag => tag[0] === 'c')
        .flatMap(tag => tag.slice(1));
}

/**
 * Check if an event has all the required categories
 */
function hasAllCategories(event: Event, requiredCategories: string[]): boolean {
    if (!requiredCategories || requiredCategories.length === 0) return true;
    const eventCategories = extractCategories(event);
    return requiredCategories.every(cat => eventCategories.includes(cat));
}

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
            console.error('API request failed, falling back to direct pool query:', apiError);

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
 * SAVED SEARCHES - Simplified Nostr Implementation
 * 
 * Uses NIP-33 Parameterized Replaceable Events only
 * - Each saved search = one NIP-33 event with d-tag as unique ID
 * - Updates = replace the event (NIP-33 behavior)
 * - Deletion = NIP-09 deletion event (kind 5)
 * - Query = get all by author+kind, filter out deleted ones
 * 
 * Single character tags used per Nostr conventions:
 * - d: unique identifier
 * - n: name
 * - m: notifyOnMatch
 * - a: isActive  
 * - f: frequency
 * - u: unreadNotifications
 * - t: type
 */

/**
 * Save a search using NIP-33 Parameterized Replaceable Events
 */
export async function saveSearch(
    name: string,
    params: SearchTasksParams,
    options: {
        notifyOnMatch?: boolean;
        isActive?: boolean;
        notificationFrequency?: string;
    } = {}
): Promise<SavedSearch> {
    try {
        // Create a unique identifier for this saved search
        const searchId = crypto.randomUUID();

        // Create the saved search as a parameterized replaceable event (NIP-33)
        const savedSearchEvent = await getSignedEvent({
            kind: KINDS.SAVED_SEARCH,
            created_at: Math.floor(Date.now() / 1000),
            content: JSON.stringify(params),
            tags: [
                ['d', searchId], // Unique identifier
                ['n', name], // name
                ['m', (options.notifyOnMatch ?? true).toString()], // notifyOnMatch
                ['a', (options.isActive ?? true).toString()], // isActive
                ['f', options.notificationFrequency ?? NotificationFrequency.DAILY], // frequency
                ['u', '0'], // unreadNotifications
                ['t', 'saved-search'] // type
            ]
        });

        // Publish single event to the relay
        pool.publish([PUBLIC_NOSTR_RELAY_URL], savedSearchEvent);

        appStore.showSuccessToast('Search saved successfully');

        return {
            id: searchId,
            name,
            params,
            createdAt: savedSearchEvent.created_at,
            notifyOnMatch: options.notifyOnMatch ?? true,
            isActive: options.isActive ?? true,
            notificationFrequency: options.notificationFrequency ?? 'DAILY',
            unreadNotifications: 0
        };
    } catch (error) {
        console.error('Error saving search:', error);
        appStore.showErrorToast('Error saving search');
        throw error;
    }
}

/**
 * Get saved searches using direct NIP-33 query
 */
export async function getSavedSearches(): Promise<SavedSearch[]> {
    try {
        // Get all saved searches directly by author and kind
        const filter: Filter = {
            kinds: [KINDS.SAVED_SEARCH],
            authors: [await getNpub()],
            '#t': ['saved-search'] // Filter by type tag
        };

        const savedSearchEvents = await pool.querySync([PUBLIC_NOSTR_RELAY_URL], filter);

        // Convert events to SavedSearch objects and filter out deleted ones
        return savedSearchEvents
            .map(event => ({
                id: event.id,
                name: event.tags.find(t => t[0] === 'n')?.[1] || '',
                params: JSON.parse(event.content),
                createdAt: event.created_at,
                notifyOnMatch: event.tags.find(t => t[0] === 'm')?.[1] === 'true',
                isActive: event.tags.find(t => t[0] === 'a')?.[1] !== 'false',
                notificationFrequency: event.tags.find(t => t[0] === 'f')?.[1] || 'DAILY',
                unreadNotifications: parseInt(event.tags.find(t => t[0] === 'u')?.[1] || '0', 10)
            }));
    } catch (error) {
        console.error('Error getting saved searches:', error);
        throw error;
    }
}

/**
 * Update a saved search using NIP-33 Parameterized Replaceable Events
 */
export async function updateSavedSearch(
    eventId: string,
    updates: Partial<{
        name: string;
        params: SearchTasksParams;
        notifyOnMatch: boolean;
        isActive: boolean;
        notificationFrequency: string;
        unreadNotifications: number;
    }>
): Promise<SavedSearch> {
    try {
        // Get the existing saved search
        const existingFilter = {
            kinds: [KINDS.SAVED_SEARCH],
            authors: [await getNpub()],
            ids: [eventId],
            '#t': ['saved-search']
        };
        const existingEvents = await pool.querySync([PUBLIC_NOSTR_RELAY_URL], existingFilter);

        if (!existingEvents.length) {
            throw new Error('Saved search not found');
        }

        const existing = existingEvents[0];
        const existingUniqueId = existing.tags.find(t => t[0] === 'd')?.[1] || '';
        const existingParams = JSON.parse(existing.content);
        const existingName = existing.tags.find(t => t[0] === 'n')?.[1] || '';
        const existingNotifyOnMatch = existing.tags.find(t => t[0] === 'm')?.[1] === 'true';
        const existingIsActive = existing.tags.find(t => t[0] === 'a')?.[1] !== 'false';
        const existingNotificationFrequency = existing.tags.find(t => t[0] === 'f')?.[1] || 'DAILY';
        const existingUnreadNotifications = parseInt(existing.tags.find(t => t[0] === 'u')?.[1] || '0', 10);

        // Create updated event
        const updatedEvent = await getSignedEvent({
            kind: KINDS.SAVED_SEARCH,
            created_at: Math.floor(Date.now() / 1000),
            content: JSON.stringify({ ...existingParams, ...updates.params }),
            tags: [
                ['d', existingUniqueId],
                ['n', updates.name || existingName],
                ['m', (updates.notifyOnMatch ?? existingNotifyOnMatch).toString()],
                ['a', (updates.isActive ?? existingIsActive).toString()],
                ['f', updates.notificationFrequency || existingNotificationFrequency],
                ['u', (updates.unreadNotifications ?? existingUnreadNotifications).toString()],
                ['t', 'saved-search']
            ]
        });

        // Publish update to the relay
        pool.publish([PUBLIC_NOSTR_RELAY_URL], updatedEvent);

        return {
            id: eventId,
            name: updates.name || existingName,
            params: { ...existingParams, ...updates.params },
            createdAt: existing.created_at,
            notifyOnMatch: updates.notifyOnMatch ?? existingNotifyOnMatch,
            isActive: updates.isActive ?? existingIsActive,
            notificationFrequency: updates.notificationFrequency || existingNotificationFrequency,
            unreadNotifications: updates.unreadNotifications ?? existingUnreadNotifications
        };
    } catch (error) {
        console.error('Error updating saved search:', error);
        throw error;
    }
}

/**
 * Update notification preferences for a saved search
 */
export async function updateNotificationPreferences(
    searchId: string,
    notifyOnMatch: boolean,
    notificationFrequency: string
): Promise<void> {
    await updateSavedSearch(searchId, {
        notifyOnMatch,
        notificationFrequency
    });
}

/**
 * Mark notifications as read for a saved search
 */
export async function markNotificationsAsRead(searchId: string): Promise<void> {
    await updateSavedSearch(searchId, {
        unreadNotifications: 0
    });
}

/**
 * Delete a saved search
 */
export async function deleteSavedSearch(eventId: string): Promise<void> {
    try {
        if (!eventId) throw new Error('Saved search not found');

        // Create deletion event for the saved search (NIP-09)
        const deletionEvent = await getSignedEvent({
            kind: 5, // Deletion event
            created_at: Math.floor(Date.now() / 1000),
            content: 'Deleted saved search',
            tags: [
                ['e', eventId], // Reference to the event being deleted
                ['k', KINDS.SAVED_SEARCH.toString()] // Kind of event being deleted
            ]
        });

        // Publish deletion event
        pool.publish([PUBLIC_NOSTR_RELAY_URL], deletionEvent);
    } catch (error) {
        console.error('Error deleting saved search:', error);
        throw error;
    }
}

/**
 * Cleanup function to handle cleanup tasks with improved subscription handling
 */
export function cleanup(): void {
    // Close task pool
    tasksStore.pool.close([PUBLIC_NOSTR_RELAY_URL]);
    // Close profile pool
    pool.close([PUBLIC_NOSTR_RELAY_URL]);

    cache.clear();
}

// Cleanup pool and subscriptions when browser closes
if (browser) {
    window.addEventListener('beforeunload', () => {
        console.log('Cleaning up Nostr connections');
        cleanup();
    });
}