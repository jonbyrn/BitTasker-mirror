import type { SearchTasksParams, Task, SavedSearch } from '$lib/types/task.d';
import { type Event, type Filter, SimplePool } from 'nostr-tools';
import { browser } from '$app/environment';
import { getSignedEvent } from '$lib/utils/nostr';
import { PUBLIC_NOSTR_RELAY_URL } from '$env/static/public';
import { getNpub } from '$lib/utils/nostrKeys';
import { tasksStore } from '$lib/stores/task.store';
import { getDateRangeTags } from '$lib/utils/helpers/dateTier';
import nostrEventsService from '$lib/api/services/nostr/events';
import KINDS from '$lib/utils/constants/kinds';

// Constants
const BATCH_SIZE = 20; // Default tasks limit per page
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Memory cache
const cache = new Map<string, { data: Task[]; timestamp: number }>();

// Pool for profile data queries (general Nostr network)
const profilePool = new SimplePool();

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
 * Save a search using NIP-51 Lists and NIP-33 Parameterized Replaceable Events
 */
export async function saveSearch(name: string, params: SearchTasksParams, notifyOnNew = false): Promise<SavedSearch> {
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
                ['name', name],
                ['notify', notifyOnNew.toString()],
                ['type', 'saved-search']
            ]
        });

        // Add the saved search to the user's list (NIP-51)
        const listEvent = await getSignedEvent({
            kind: KINDS.SAVED_SEARCHES,
            created_at: Math.floor(Date.now() / 1000),
            content: '',
            tags: [
                ['d', 'saved-searches'], // List identifier
                ['e', savedSearchEvent.id], // Reference to the saved search event
                ['name', name]
            ]
        });

        // Publish both events using the API
        await Promise.all([
            nostrEventsService.publishEvent(savedSearchEvent),
            nostrEventsService.publishEvent(listEvent)
        ]);

        return {
            id: searchId,
            name,
            params,
            createdAt: savedSearchEvent.created_at,
            updatedAt: savedSearchEvent.created_at,
            notifyOnNew
        };
    } catch (error) {
        console.error('Error saving search:', error);
        throw error;
    }
}

/**
 * Get saved searches using NIP-51 Lists
 */
export async function getSavedSearches(): Promise<SavedSearch[]> {
    try {
        // Get the user's saved searches list
        const filter: Filter = {
            kinds: [KINDS.SAVED_SEARCHES],
            authors: [await getNpub()],
            '#d': ['saved-searches']
        };

        const apiParams = convertFilterToApiParams(filter);
        const listResponse = await nostrEventsService.findEvents(apiParams);
        const listEvents = listResponse.data || [];

        if (!listEvents.length) {
            return [];
        }

        // Get the most recent list event
        const latestList = listEvents.sort((a: Event, b: Event) => b.created_at - a.created_at)[0];

        // Get all saved search events referenced in the list
        const searchIds = latestList.tags
            .filter((tag: string[]): tag is [string, string, ...string[]] =>
                tag[0] === 'e' && typeof tag[1] === 'string'
            )
            .map(tag => tag[1]);

        const savedSearchFilter: Filter = {
            kinds: [KINDS.SAVED_SEARCH],
            ids: searchIds
        };

        const savedSearchApiParams = convertFilterToApiParams(savedSearchFilter);
        const savedSearchResponse = await nostrEventsService.findEvents(savedSearchApiParams);
        const savedSearchEvents = savedSearchResponse.data || [];

        // Convert events to SavedSearch objects
        return savedSearchEvents.map(event => ({
            id: event.tags.find(t => t[0] === 'd')?.[1] || event.id,
            name: event.tags.find(t => t[0] === 'name')?.[1] || '',
            params: JSON.parse(event.content),
            createdAt: event.created_at,
            updatedAt: event.created_at,
            notifyOnNew: event.tags.find(t => t[0] === 'notify')?.[1] === 'true'
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
    searchId: string,
    updates: Partial<{ name: string; params: SearchTasksParams; notifyOnNew: boolean }>
): Promise<SavedSearch> {
    try {
        // Get the existing saved search
        const existingFilter = {
            kinds: [KINDS.SAVED_SEARCH],
            '#d': [searchId]
        };
        const existingApiParams = convertFilterToApiParams(existingFilter);
        const existingResponse = await nostrEventsService.findEvents(existingApiParams);
        const existingEvents = existingResponse.data || [];

        if (!existingEvents.length) {
            throw new Error('Saved search not found');
        }

        const existing = existingEvents[0];
        const existingParams = JSON.parse(existing.content);
        const existingName = existing.tags.find(t => t[0] === 'name')?.[1] || '';
        const existingNotify = existing.tags.find(t => t[0] === 'notify')?.[1] === 'true';

        // Create updated event
        const updatedEvent = await getSignedEvent({
            kind: KINDS.SAVED_SEARCH,
            created_at: Math.floor(Date.now() / 1000),
            content: JSON.stringify({ ...existingParams, ...updates.params }),
            tags: [
                ['d', searchId],
                ['name', updates.name || existingName],
                ['notify', (updates.notifyOnNew ?? existingNotify).toString()],
                ['type', 'saved-search']
            ]
        });

        // Publish update using the API
        await nostrEventsService.publishEvent(updatedEvent);

        // If name changed, update the list event
        const listFilter = {
            kinds: [KINDS.SAVED_SEARCHES],
            authors: [await getNpub()],
            '#d': ['saved-searches']
        };
        const listApiParams = convertFilterToApiParams(listFilter);
        const listResponse = await nostrEventsService.findEvents(listApiParams);
        const listEvents = listResponse.data || [];

        if (listEvents.length) {
            const latestList = listEvents.sort((a: Event, b: Event) => b.created_at - a.created_at)[0];
            const updatedTags = latestList.tags
                .map(tag =>
                    tag[0] === 'e' && tag[1] === existing.id ? ['e', updatedEvent.id, updates.name] : tag
                )
                .filter((tag): tag is string[] => tag.every(item => item !== undefined));

            const updatedList = await getSignedEvent({
                kind: KINDS.SAVED_SEARCHES,
                created_at: Math.floor(Date.now() / 1000),
                content: '',
                tags: updatedTags
            });

            await nostrEventsService.publishEvent(updatedList);
        }

        return {
            id: searchId,
            name: updates.name || existingName,
            params: { ...existingParams, ...updates.params },
            createdAt: existing.created_at,
            updatedAt: updatedEvent.created_at,
            notifyOnNew: updates.notifyOnNew ?? existingNotify
        };
    } catch (error) {
        console.error('Error updating saved search:', error);
        throw error;
    }
}

/**
 * Delete a saved search
 */
export async function deleteSavedSearch(searchId: string): Promise<void> {
    try {
        // Create deletion event for the saved search
        const deletionEvent = await getSignedEvent({
            kind: 5,
            created_at: Math.floor(Date.now() / 1000),
            content: '',
            tags: [
                ['d', searchId],
                ['type', 'saved-search']
            ]
        });

        // Update the saved searches list to remove the deleted search
        const listFilter = {
            kinds: [KINDS.SAVED_SEARCHES],
            authors: [await getNpub()],
            '#d': ['saved-searches']
        };
        const listApiParams = convertFilterToApiParams(listFilter);
        const listResponse = await nostrEventsService.findEvents(listApiParams);
        const listEvents = listResponse.data || [];

        if (listEvents.length) {
            const latestList = listEvents.sort((a: Event, b: Event) => b.created_at - a.created_at)[0];
            const updatedTags = latestList.tags.filter(tag =>
                !(tag[0] === 'e' && tag[2] === searchId)
            );

            const updatedList = await getSignedEvent({
                kind: KINDS.SAVED_SEARCHES,
                created_at: Math.floor(Date.now() / 1000),
                content: '',
                tags: updatedTags
            });

            await Promise.all([
                nostrEventsService.publishEvent(deletionEvent),
                nostrEventsService.publishEvent(updatedList)
            ]);
        }
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
    profilePool.close([PUBLIC_NOSTR_RELAY_URL]);

    cache.clear();
}

// Cleanup pool and subscriptions when browser closes
if (browser) {
    window.addEventListener('beforeunload', () => {
        console.log('Cleaning up Nostr connections');
        cleanup();
    });
}