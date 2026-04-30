import type { SearchServicesParams, SavedServiceSearch } from '$lib/types/service.d';
import { type Filter } from 'nostr-tools';
import { appStore } from '$lib/stores/app.store';
import { getNpub } from '$lib/utils/nostrKeys';
import { getSignedEvent } from '$lib/utils/nostr';
import KINDS from '$lib/utils/constants/kinds';
import { t } from 'svelte-i18n';
import { get } from 'svelte/store';

const SERVICE_SAVED_SEARCH_TYPE = 'saved-search-service';

/**
 * Ensures a relay URL is valid:
 * 1. Trims whitespace
 * 2. Ensures it starts with ws:// or wss://
 * 3. Handles potentially multiple URLs (comma separated)
 */
function sanitizeRelayUrls(input: string | string[] | undefined): string[] {
	if (!input) return [];

	const rawUrls = Array.isArray(input) ? input : input.split(',');

	return rawUrls
		.map((url) => url.trim())
		.filter((url) => {
			return (
				Boolean(url) &&
				url.length > 0 &&
				url !== 'undefined' &&
				url !== 'null' &&
				url !== '[object Object]'
			);
		})
		.map((url) => {
			if (!url.startsWith('ws://') && !url.startsWith('wss://')) {
				return `wss://${url}`;
			}
			return url;
		});
}

const RELAYS = sanitizeRelayUrls(import.meta.env.VITE_NOSTR_RELAY_URL);

function getPool() {
	const pool = get(appStore)?.pool;
	if (!pool) {
		throw new Error('Pool not found');
	}
	return pool;
}

/**
 * Save a service search using NIP-33 (same kind as task saved searches, type tag distinguishes)
 */
export async function saveServiceSearch(
	name: string,
	params: SearchServicesParams,
	options: {
		notifyOnMatch?: boolean;
		isActive?: boolean;
		notificationFrequency?: string;
	} = {}
): Promise<SavedServiceSearch> {
	try {
		const searchId = crypto.randomUUID();
		const savedSearchEvent = await getSignedEvent({
			kind: KINDS.SAVED_SEARCH,
			created_at: Math.floor(Date.now() / 1000),
			content: JSON.stringify(params),
			tags: [
				['d', searchId],
				['n', name],
				['m', (options.notifyOnMatch ?? true).toString()],
				['a', (options.isActive ?? true).toString()],
				['f', options.notificationFrequency ?? 'WEEKLY'],
				['u', '0'],
				['t', SERVICE_SAVED_SEARCH_TYPE]
			]
		});

		const pool = getPool();
		await Promise.any(pool.publish(RELAYS, savedSearchEvent));

		appStore.showSuccessToast(get(t)('dashboard.services.browse.saved_search_success'));

		return {
			id: searchId,
			name,
			params,
			createdAt: savedSearchEvent.created_at,
			notifyOnMatch: options.notifyOnMatch ?? true,
			isActive: options.isActive ?? true,
			notificationFrequency: options.notificationFrequency ?? 'WEEKLY',
			unreadNotifications: 0
		};
	} catch (error) {
		console.error('Error saving service search:', error);
		appStore.showErrorToast(get(t)('dashboard.services.browse.saved_search_error'));
		throw error;
	}
}

/**
 * Get saved service searches (NIP-33, filtered by type tag)
 */
export async function getSavedServiceSearches(): Promise<SavedServiceSearch[]> {
	try {
		const filter: Filter = {
			kinds: [KINDS.SAVED_SEARCH],
			authors: [await getNpub()],
			'#t': [SERVICE_SAVED_SEARCH_TYPE]
		};

		const pool = getPool();
		const events = await pool.querySync(RELAYS, filter);

		return events
			.sort((a, b) => b.created_at - a.created_at)
			.map((event) => ({
				id: event.tags.find((t) => t[0] === 'd')?.[1] ?? event.id,
				name: event.tags.find((t) => t[0] === 'n')?.[1] ?? '',
				params: JSON.parse(event.content || '{}') as SearchServicesParams,
				createdAt: event.created_at,
				notifyOnMatch: event.tags.find((t) => t[0] === 'm')?.[1] === 'true',
				isActive: event.tags.find((t) => t[0] === 'a')?.[1] !== 'false',
				notificationFrequency: event.tags.find((t) => t[0] === 'f')?.[1] ?? 'WEEKLY',
				unreadNotifications: parseInt(event.tags.find((t) => t[0] === 'u')?.[1] ?? '0', 10)
			}));
	} catch (error) {
		console.error('Error getting saved service searches:', error);
		throw error;
	}
}

/**
 * Update a saved service search (NIP-33 replace by d-tag)
 */
export async function updateSavedServiceSearch(
	eventId: string,
	updates: Partial<{
		name: string;
		params: SearchServicesParams;
		notifyOnMatch: boolean;
		isActive: boolean;
		notificationFrequency: string;
		unreadNotifications: number;
	}>
): Promise<SavedServiceSearch> {
	try {
		const pool = getPool();
		const existingFilter: Filter = {
			kinds: [KINDS.SAVED_SEARCH],
			authors: [await getNpub()],
			'#t': [SERVICE_SAVED_SEARCH_TYPE]
		};
		// We use d-tag as identifier; eventId passed is the search id (d-tag value)
		const existingEvents = await pool.querySync(RELAYS, existingFilter);
		const existing = existingEvents.find((e) => e.tags.find((t) => t[0] === 'd')?.[1] === eventId);
		if (!existing) {
			throw new Error('Saved search not found');
		}

		const dTag = existing.tags.find((t) => t[0] === 'd')?.[1] ?? eventId;
		const existingParams = JSON.parse(existing.content || '{}') as SearchServicesParams;
		const existingName = existing.tags.find((t) => t[0] === 'n')?.[1] ?? '';
		const existingNotify = existing.tags.find((t) => t[0] === 'm')?.[1] === 'true';
		const existingActive = existing.tags.find((t) => t[0] === 'a')?.[1] !== 'false';
		const existingFreq = existing.tags.find((t) => t[0] === 'f')?.[1] ?? 'WEEKLY';
		const existingUnread = parseInt(existing.tags.find((t) => t[0] === 'u')?.[1] ?? '0', 10);

		const updatedEvent = await getSignedEvent({
			kind: KINDS.SAVED_SEARCH,
			created_at: Math.floor(Date.now() / 1000),
			content: JSON.stringify({ ...existingParams, ...updates.params }),
			tags: [
				['d', dTag],
				['n', updates.name ?? existingName],
				['m', (updates.notifyOnMatch ?? existingNotify).toString()],
				['a', (updates.isActive ?? existingActive).toString()],
				['f', updates.notificationFrequency ?? existingFreq],
				['u', (updates.unreadNotifications ?? existingUnread).toString()],
				['t', SERVICE_SAVED_SEARCH_TYPE]
			]
		});

		await Promise.any(pool.publish(RELAYS, updatedEvent));

		return {
			id: dTag,
			name: updates.name ?? existingName,
			params: { ...existingParams, ...updates.params },
			createdAt: existing.created_at,
			notifyOnMatch: updates.notifyOnMatch ?? existingNotify,
			isActive: updates.isActive ?? existingActive,
			notificationFrequency: updates.notificationFrequency ?? existingFreq,
			unreadNotifications: updates.unreadNotifications ?? existingUnread
		};
	} catch (error) {
		console.error('Error updating saved service search:', error);
		throw error;
	}
}

/**
 * Delete a saved service search (NIP-09)
 */
export async function deleteSavedServiceSearch(searchId: string): Promise<void> {
	try {
		if (!searchId) throw new Error('Saved search not found');
		const pool = getPool();
		const filter: Filter = {
			kinds: [KINDS.SAVED_SEARCH],
			authors: [await getNpub()],
			'#t': [SERVICE_SAVED_SEARCH_TYPE]
		};
		const events = await pool.querySync(RELAYS, filter);
		const event = events.find((e) => e.tags.find((t) => t[0] === 'd')?.[1] === searchId);
		if (!event) throw new Error('Saved search not found');

		const deletionEvent = await getSignedEvent({
			kind: 5,
			created_at: Math.floor(Date.now() / 1000),
			content: 'Deleted saved service search',
			tags: [
				['e', event.id],
				['k', KINDS.SAVED_SEARCH.toString()]
			]
		});
		await Promise.any(pool.publish(RELAYS, deletionEvent));
	} catch (error) {
		console.error('Error deleting saved service search:', error);
		throw error;
	}
}
