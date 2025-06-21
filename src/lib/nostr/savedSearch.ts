import type { SearchTasksParams, SavedSearch } from '$lib/types/task.d';
import { SimplePool, type Filter } from 'nostr-tools';
import { appStore } from '$lib/stores/app.store';
import { getSignedEvent } from '$lib/utils/nostr';
import { getNpub } from '$lib/utils/nostrKeys';
import { PUBLIC_NOSTR_RELAY_URL } from '$env/static/public';
import { NotificationFrequency } from '$lib/utils/enums/task.enum';
import KINDS from '$lib/utils/constants/kinds';


// Pool for nostr queries (general Nostr network)
const pool = new SimplePool();

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