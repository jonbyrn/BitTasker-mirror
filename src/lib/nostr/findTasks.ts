import { SimplePool, type Event, type Filter } from 'nostr-tools';
import { TaskStatusEnum, TaskTypeEnum, BudgetTypeEnum, SortByEnum, SortOrderEnum } from '$lib/utils/enums/task.enum';
import type {
    SearchTasksParams,
    Task,
    SavedSearch,
    TaskRecommendation,
    RecommendationParams,
    DateRange
} from '$lib/types/task';
import { browser } from '$app/environment';
import { getSignedEvent } from '$lib/utils/nostr';
import { PUBLIC_NOSTR_RELAY_URL } from '$env/static/public';
import { TASK_KINDS } from './task';
import { writable } from 'svelte/store';

// Define NostrFilter type that extends Filter
type NostrFilter = Filter & {
    [key: `#${string}`]: string[];
};

// Store implementation
export const tasksStore = writable<{
    items: Task[];
    loading: boolean;
    error: string | null;
    meta: {
        currentPage: number;
        totalItems: number;
        hasNextPage: boolean;
    } | null;
}>({
    items: [],
    loading: false,
    error: null,
    meta: null
});

// Constants
const BATCH_SIZE = 20;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// NIP-51 List Kinds
const LIST_KINDS = {
    SAVED_SEARCHES: 30001, // NIP-51 List for saved searches
    RECOMMENDATIONS: 30002, // NIP-51 List for recommendations
};

// NIP-33 Parameterized Replaceable Event Kinds
const REPLACEABLE_KINDS = {
    SAVED_SEARCH: 31001, // NIP-33 Parameterized replaceable event for saved searches
    USER_PREFERENCES: 31002, // NIP-33 Parameterized replaceable event for user preferences
};

// Initialize pool
const pool = new SimplePool();

// Memory cache
const cache = new Map<string, { data: Task[]; timestamp: number }>();

/**
 * Convert search params to Nostr filter
 */
function createNostrFilter(params: SearchTasksParams): Filter {
    const filter: Filter = {
        kinds: [TASK_KINDS.TASK_CREATION],
        limit: params.limit || BATCH_SIZE
    };

    // Add search criteria as tags
    const tags: string[][] = [];

    // Task type filter
    if (params.taskType) {
        tags.push(['t', params.taskType]);
    }

    // Status filter with multiple values support
    if (params.status && params.status.length > 0) {
        params.status.forEach(status => {
            tags.push(['s', status]);
        });
    }

    // Category filter
    if (params.categoryIds && params.categoryIds.length > 0) {
        params.categoryIds.forEach(categoryId => {
            tags.push(['c', categoryId.toString()]);
        });
    }

    // Skills filter
    if (params.skillIds && params.skillIds.length > 0) {
        params.skillIds.forEach(skillId => {
            tags.push(['k', skillId.toString()]);
        });
    }

    // Location filter
    if (params.location) {
        tags.push(['l', params.location]);
        if (params.radius) {
            tags.push(['r', params.radius.toString()]);
        }
    }

    // Budget range filter
    if (params.minBudget || params.maxBudget) {
        if (params.minBudget) tags.push(['min', params.minBudget.toString()]);
        if (params.maxBudget) tags.push(['max', params.maxBudget.toString()]);
        if (params.budgetType) tags.push(['bt', params.budgetType]);
    }

    // Date range filter
    if (params.dateRange) {
        filter.since = Math.floor(new Date(params.dateRange.start).getTime() / 1000);
        filter.until = Math.floor(new Date(params.dateRange.end).getTime() / 1000);
    }

    // Add NIP-50 search support
    if (params.searchTerm) {
        filter.search = params.searchTerm;
    }

    // Add all tags to filter
    if (tags.length > 0) {
        filter['#t'] = tags.map(t => t.join(':'));
    }

    return filter;
}

/**
 * Find tasks based on search parameters
 */
export async function findTasks(params: SearchTasksParams): Promise<{ tasks: Task[]; total: number; hasMore: boolean }> {
    tasksStore.update(state => ({ ...state, loading: true, error: null }));

    try {
        const filter = createNostrFilter(params);
        const cacheKey = JSON.stringify(filter);

        // Check cache
        const cached = cache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
            const tasks = cached.data;
            tasksStore.update(state => ({
                ...state,
                items: tasks,
                loading: false,
                meta: {
                    currentPage: params.page || 1,
                    totalItems: tasks.length,
                    hasNextPage: tasks.length >= (params.limit || BATCH_SIZE)
                }
            }));
            return {
                tasks,
                total: tasks.length,
                hasMore: tasks.length >= (params.limit || BATCH_SIZE)
            };
        }

        // Get total count using NIP-45
        const countResult = await pool.querySync([PUBLIC_NOSTR_RELAY_URL], filter);
        const total = countResult.length;

        // Fetch events
        const events = await pool.querySync([PUBLIC_NOSTR_RELAY_URL], filter);
        const tasks = events.map((event: Event) => convertEventToTask(event));

        // Update cache
        cache.set(cacheKey, { data: tasks, timestamp: Date.now() });

        // Update store
        tasksStore.update(state => ({
            ...state,
            items: tasks,
            loading: false,
            meta: {
                currentPage: params.page || 1,
                totalItems: total,
                hasNextPage: tasks.length >= (params.limit || BATCH_SIZE)
            }
        }));

        return {
            tasks,
            total,
            hasMore: tasks.length >= (params.limit || BATCH_SIZE)
        };
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
 * Subscribe to task updates in real-time
 */
export function subscribeToTasks(params: SearchTasksParams, onEvent: (task: Task) => void): () => void {
    const filter = createNostrFilter(params);
    const sub = pool.subscribe([PUBLIC_NOSTR_RELAY_URL], filter, {
        onevent: (event: Event) => {
            const task = convertEventToTask(event);
            onEvent(task);
        }
    });

    return () => {
        sub.close();
    };
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
            kind: REPLACEABLE_KINDS.SAVED_SEARCH,
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
            kind: LIST_KINDS.SAVED_SEARCHES,
            created_at: Math.floor(Date.now() / 1000),
            content: '',
            tags: [
                ['d', 'saved-searches'], // List identifier
                ['e', savedSearchEvent.id], // Reference to the saved search event
                ['name', name]
            ]
        });

        // Publish both events
        await Promise.all([
            pool.publish([PUBLIC_NOSTR_RELAY_URL], savedSearchEvent),
            pool.publish([PUBLIC_NOSTR_RELAY_URL], listEvent)
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
            kinds: [LIST_KINDS.SAVED_SEARCHES],
            authors: [await getCurrentPubkey()],
            '#d': ['saved-searches']
        };

        const listEvents = await pool.querySync([PUBLIC_NOSTR_RELAY_URL], filter);

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
            kinds: [REPLACEABLE_KINDS.SAVED_SEARCH],
            ids: searchIds
        };

        const savedSearchEvents = await pool.querySync([PUBLIC_NOSTR_RELAY_URL], savedSearchFilter);

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
        const existingEvents = await pool.querySync(
            [PUBLIC_NOSTR_RELAY_URL],
            {
                kinds: [REPLACEABLE_KINDS.SAVED_SEARCH],
                '#d': [searchId]
            }
        );

        if (!existingEvents.length) {
            throw new Error('Saved search not found');
        }

        const existing = existingEvents[0];
        const existingParams = JSON.parse(existing.content);
        const existingName = existing.tags.find(t => t[0] === 'name')?.[1] || '';
        const existingNotify = existing.tags.find(t => t[0] === 'notify')?.[1] === 'true';

        // Create updated event
        const updatedEvent = await getSignedEvent({
            kind: REPLACEABLE_KINDS.SAVED_SEARCH,
            created_at: Math.floor(Date.now() / 1000),
            content: JSON.stringify({ ...existingParams, ...updates.params }),
            tags: [
                ['d', searchId],
                ['name', updates.name || existingName],
                ['notify', (updates.notifyOnNew ?? existingNotify).toString()],
                ['type', 'saved-search']
            ]
        });

        // Publish update
        await pool.publish([PUBLIC_NOSTR_RELAY_URL], updatedEvent);

        // If name changed, update the list event
        if (updates.name) {
            const listEvents = await pool.querySync([PUBLIC_NOSTR_RELAY_URL], {
                kinds: [LIST_KINDS.SAVED_SEARCHES],
                authors: [await getCurrentPubkey()],
                '#d': ['saved-searches']
            });

            if (listEvents.length) {
                const latestList = listEvents.sort((a: Event, b: Event) => b.created_at - a.created_at)[0];
                const updatedTags = latestList.tags.map(tag =>
                    tag[0] === 'e' && tag[1] === existing.id ? ['e', updatedEvent.id, updates.name] : tag
                );

                const updatedList = await getSignedEvent({
                    kind: LIST_KINDS.SAVED_SEARCHES,
                    created_at: Math.floor(Date.now() / 1000),
                    content: '',
                    tags: updatedTags
                });

                await pool.publish([PUBLIC_NOSTR_RELAY_URL], updatedList);
            }
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
        const listEvents = await pool.querySync([PUBLIC_NOSTR_RELAY_URL], {
            kinds: [LIST_KINDS.SAVED_SEARCHES],
            authors: [await getCurrentPubkey()],
            '#d': ['saved-searches']
        });

        if (listEvents.length) {
            const latestList = listEvents.sort((a: Event, b: Event) => b.created_at - a.created_at)[0];
            const updatedTags = latestList.tags.filter(tag =>
                !(tag[0] === 'e' && tag[2] === searchId)
            );

            const updatedList = await getSignedEvent({
                kind: LIST_KINDS.SAVED_SEARCHES,
                created_at: Math.floor(Date.now() / 1000),
                content: '',
                tags: updatedTags
            });

            await Promise.all([
                pool.publish([PUBLIC_NOSTR_RELAY_URL], deletionEvent),
                pool.publish([PUBLIC_NOSTR_RELAY_URL], updatedList)
            ]);
        }
    } catch (error) {
        console.error('Error deleting saved search:', error);
        throw error;
    }
}

/**
 * Get task recommendations based on user preferences
 */
export async function getRecommendations(params: RecommendationParams): Promise<TaskRecommendation[]> {
    try {
        // Create user preferences as a parameterized replaceable event if not exists
        const preferencesEvent = await getSignedEvent({
            kind: REPLACEABLE_KINDS.USER_PREFERENCES,
            created_at: Math.floor(Date.now() / 1000),
            content: JSON.stringify({
                skills: params.skills,
                categories: params.categories,
                budgetRange: params.preferredBudgetRange,
                locations: params.preferredLocations
            }),
            tags: [
                ['d', 'user-preferences'],
                ['p', params.userId]
            ]
        });

        await pool.publish([PUBLIC_NOSTR_RELAY_URL], preferencesEvent);

        // Create recommendations list
        const recommendationsEvent = await getSignedEvent({
            kind: LIST_KINDS.RECOMMENDATIONS,
            created_at: Math.floor(Date.now() / 1000),
            content: '',
            tags: [
                ['d', 'recommendations'],
                ['p', params.userId],
                ...params.skills?.map(skill => ['k', skill]) || [],
                ...params.categories?.map(category => ['c', category]) || []
            ]
        });

        await pool.publish([PUBLIC_NOSTR_RELAY_URL], recommendationsEvent);

        // Fetch matching tasks
        const filter: Filter = {
            kinds: [TASK_KINDS.TASK_CREATION],
            limit: params.limit || 10
        };

        // Add skill and category filters
        const tags: string[][] = [];
        if (params.skills?.length) {
            params.skills.forEach(skill => tags.push(['k', skill]));
        }
        if (params.categories?.length) {
            params.categories.forEach(category => tags.push(['c', category]));
        }
        if (tags.length) {
            filter['#t'] = tags.map(t => t.join(':'));
        }

        // Add budget range filter
        if (params.preferredBudgetRange) {
            if (params.preferredBudgetRange.min) {
                filter['#min'] = [params.preferredBudgetRange.min.toString()];
            }
            if (params.preferredBudgetRange.max) {
                filter['#max'] = [params.preferredBudgetRange.max.toString()];
            }
        }

        // Add location filter
        if (params.preferredLocations?.length) {
            filter['#l'] = params.preferredLocations;
        }

        const events = await pool.querySync([PUBLIC_NOSTR_RELAY_URL], filter);

        // Calculate recommendations with scores
        return events.map(event => {
            const task = convertEventToTask(event);
            const matchedSkills = task.skills.filter(skill =>
                params.skills?.includes(skill)
            );
            const matchedCategories = task.categories.filter(category =>
                params.categories?.includes(category)
            );

            // Calculate score based on matches
            const score = calculateRecommendationScore(task, {
                matchedSkills,
                matchedCategories,
                budgetRange: params.preferredBudgetRange,
                locations: params.preferredLocations
            });

            return {
                taskId: task.id,
                score,
                reason: generateRecommendationReason(matchedSkills, matchedCategories),
                matchedSkills,
                matchedCategories
            };
        }).sort((a, b) => b.score - a.score);
    } catch (error) {
        console.error('Error getting recommendations:', error);
        throw error;
    }
}

/**
 * Calculate recommendation score based on matches
 */
function calculateRecommendationScore(
    task: Task,
    matches: {
        matchedSkills: string[];
        matchedCategories: string[];
        budgetRange?: { min: number; max: number };
        locations?: string[];
    }
): number {
    let score = 0;

    // Skills match (40% weight)
    const skillsScore = matches.matchedSkills.length / Math.max(task.skills.length, 1) * 40;
    score += skillsScore;

    // Categories match (30% weight)
    const categoriesScore = matches.matchedCategories.length / Math.max(task.categories.length, 1) * 30;
    score += categoriesScore;

    // Budget match (20% weight)
    if (matches.budgetRange && task.budget) {
        const budgetInRange = (
            (!matches.budgetRange.min || task.budget.amount >= matches.budgetRange.min) &&
            (!matches.budgetRange.max || task.budget.amount <= matches.budgetRange.max)
        );
        if (budgetInRange) score += 20;
    }

    // Location match (10% weight)
    if (matches.locations?.length && task.pickupLocation) {
        if (matches.locations.includes(task.pickupLocation.displayName)) {
            score += 10;
        }
    }

    return Math.min(score, 100); // Cap at 100
}

/**
 * Generate recommendation reason based on matches
 */
function generateRecommendationReason(matchedSkills: string[], matchedCategories: string[]): string {
    const reasons: string[] = [];

    if (matchedSkills.length) {
        reasons.push(`Matches ${matchedSkills.length} of your skills: ${matchedSkills.join(', ')}`);
    }

    if (matchedCategories.length) {
        reasons.push(`Matches ${matchedCategories.length} of your preferred categories: ${matchedCategories.join(', ')}`);
    }

    return reasons.join('. ') || 'Based on your preferences';
}

/**
 * Convert a Nostr event to a Task
 */
function convertEventToTask(event: Event): Task {
    const dateRange = event.tags.find(t => t[0] === 'dateRange')?.[1];
    let parsedDateRange: DateRange | null = null;

    if (dateRange) {
        try {
            parsedDateRange = JSON.parse(dateRange);
        } catch (e) {
            console.error('Error parsing date range:', e);
        }
    }

    const task: Task = {
        id: event.id,
        // author: event.pubkey,
        title: event.tags.find(t => t[0] === 'title')?.[1] || '',
        description: event.content,
        status: event.tags.find(t => t[0] === 's')?.[1] as TaskStatusEnum || TaskStatusEnum.OPEN,
        taskType: event.tags.find(t => t[0] === 't')?.[1] as TaskTypeEnum || TaskTypeEnum.REMOTE,
        budget: {
            amount: Number(event.tags.find(t => t[0] === 'amount')?.[1] || 0),
            type: event.tags.find(t => t[0] === 'bt')?.[1] as BudgetTypeEnum || BudgetTypeEnum.FIXED,
            currency: event.tags.find(t => t[0] === 'currency')?.[1] || 'USD'
        },
        pickupLocation: event.tags.find(t => t[0] === 'l')?.[1] ? {
            displayName: event.tags.find(t => t[0] === 'l')?.[1] || '',
            longitude: event.tags.find(t => t[0] === 'geo')?.[1]?.split(',').map(Number)[0] || null,
            latitude: event.tags.find(t => t[0] === 'geo')?.[1]?.split(',').map(Number)[1] || null,
            zipCode: event.tags.find(t => t[0] === 'zip')?.[1] || '',
            locationLoaded: true
        } : null,
        dropOffLocation: null,
        categories: event.tags.filter(t => t[0] === 'c').map(t => t[1]).filter((t): t is string => t !== undefined),
        skills: event.tags.filter(t => t[0] === 'k').map(t => t[1]).filter((t): t is string => t !== undefined),
        deadline: event.tags.find(t => t[0] === 'deadline')?.[1] || null,
        dateRange: parsedDateRange,
        createdAt: new Date(event.created_at * 1000).toISOString(),
        updatedAt: new Date(event.created_at * 1000).toISOString(),
        completedAt: null,
        cancelledAt: null,
        deletedAt: null,
        isDeleted: false,
        isRemovals: false,
        isBoosted: false,
        boostPercentage: null,
        requiredSkills: [],
        bids: []
    };

    return task;
}

/**
 * Get the current user's public key
 */
async function getCurrentPubkey(): Promise<string> {
    // This should be implemented based on your authentication system
    throw new Error('Not implemented');
}

/**
 * Get recommended tasks based on user preferences
 */
export async function getRecommendedTasks(limit: number = 10): Promise<Task[]> {
    try {
        // Get user preferences
        const userPrefs = await getUserPreferences();

        // Get recommendations based on preferences
        const recommendations = await getRecommendations({
            userId: await getCurrentPubkey(),
            skills: userPrefs.skills || [],
            categories: userPrefs.categories || [],
            preferredBudgetRange: userPrefs.budgetRange,
            preferredLocations: userPrefs.locations || [],
            limit
        });

        // Extract tasks from recommendations
        return recommendations.map(async rec => {
            const taskEvents = await pool.querySync([PUBLIC_NOSTR_RELAY_URL], {
                kinds: [TASK_KINDS.TASK_CREATION],
                ids: [rec.taskId]
            });

            return convertEventToTask(taskEvents[0]);
        }).filter(Boolean);
    } catch (error) {
        console.error('Error getting recommended tasks:', error);
        throw error;
    }
}

/**
 * Subscribe to new tasks in real-time
 */
export function subscribeToNewTasks(): () => void {
    const filter: NostrFilter = {
        kinds: [TASK_KINDS.TASK_CREATION],
        since: Math.floor(Date.now() / 1000)
    };

    const sub = pool.subscribe([PUBLIC_NOSTR_RELAY_URL], filter, {
        onevent(event: Event) {
            const task = convertEventToTask(event);
            tasksStore.update(state => ({
                ...state,
                items: [task, ...state.items]
            }));
        }
    });

    return () => {
        sub.close();
    };
}

/**
 * Get user preferences from NIP-33 parameterized replaceable event
 */
async function getUserPreferences(): Promise<{
    skills: string[];
    categories: string[];
    budgetRange?: { min: number; max: number };
    locations?: string[];
}> {
    try {
        const filter: Filter = {
            kinds: [REPLACEABLE_KINDS.USER_PREFERENCES],
            authors: [await getCurrentPubkey()],
            '#d': ['user-preferences']
        };

        const events = await pool.querySync([PUBLIC_NOSTR_RELAY_URL], filter);
        const latest = events[0];

        if (!latest) {
            return { skills: [], categories: [] };
        }

        return JSON.parse(latest.content);
    } catch (error) {
        console.error('Error getting user preferences:', error);
        return { skills: [], categories: [] };
    }
}

/**
 * Cleanup function to handle cleanup tasks
 */
export function cleanup(): void {
    pool.close([PUBLIC_NOSTR_RELAY_URL]);
    cache.clear();
}

// Cleanup pool when browser closes
if (browser) {
    window.addEventListener('beforeunload', () => {
        pool.close([PUBLIC_NOSTR_RELAY_URL]);
    });
}
