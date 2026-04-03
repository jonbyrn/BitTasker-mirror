/**
 * Mute List — NIP-51 Kind 10000
 *
 * Handles fetching, updating, and publishing the user's mute list.
 * The mute list is a replaceable event — publishing a new one replaces the old one on the relay.
 *
 * Public entries (pubkeys and event IDs) go in the `tags` array.
 * We do not use encrypted `content` entries — public tags are sufficient for BitTasker.
 *
 * Spec: https://nips.nostr.com/51
 */

import type { NostrEvent } from 'nostr-tools';
import { get } from 'svelte/store';
import { appStore } from '$lib/stores/app.store';
import { muteStore } from '$lib/stores/mute.store';
import { tasksStore } from '$lib/stores/task.store';
import { bidStore } from '$lib/stores/bid.store';
import { getSignedEvent } from '$lib/utils/nostr';
import KINDS from '$lib/utils/constants/kinds';

/**
 * Fetch the user's kind 10000 mute list from the relay and populate muteStore.
 * Called once on login. Safe to call multiple times — subsequent calls refresh the store.
 */
export async function fetchMuteList(userPubkey: string): Promise<void> {
	try {
		const { pool, relays } = get(appStore);

		const events = await pool.querySync(relays, {
			kinds: [KINDS.MUTE_LIST],
			authors: [userPubkey],
			limit: 1
		});

		if (events.length === 0) {
			// User has no mute list yet — mark as loaded with empty sets
			muteStore.load([], []);
			return;
		}

		// Use the most recent event (relay may return multiple)
		const latest = events.reduce((a: NostrEvent, b: NostrEvent) =>
			a.created_at > b.created_at ? a : b
		);

		const mutedPubkeys = latest.tags
			.filter((tag: string[]) => tag[0] === 'p' && tag[1])
			.map((tag: string[]) => tag[1]);

		const mutedEventIds = latest.tags
			.filter((tag: string[]) => tag[0] === 'e' && tag[1])
			.map((tag: string[]) => tag[1]);

		muteStore.load(mutedPubkeys, mutedEventIds);
	} catch (error) {
		console.error('[muteList] Failed to fetch mute list:', error);
		// Mark as loaded even on error so the app doesn't wait forever
		muteStore.load([], []);
	}
}

/**
 * Add a pubkey to the user's mute list and publish the updated kind 10000 event.
 * Only updates the store and removes tasks after the relay confirms the publish.
 * Returns the number of tasks removed from the store so callers can refill if needed.
 */
export async function mutePubkey(pubkey: string): Promise<number> {
	await publishMuteList(pubkey);
	muteStore.mutePubkey(pubkey);
	bidStore.removePubkeyBids(pubkey);
	return tasksStore.removePubkeyTasks(pubkey);
}

/**
 * Add an event ID to the user's mute list and publish the updated kind 10000 event.
 */
export async function muteEventId(eventId: string): Promise<void> {
	muteStore.muteEventId(eventId);

	await publishMuteList();
}

/**
 * Remove a pubkey from the mute list and publish the updated kind 10000 event.
 */
export async function unmutePubkey(pubkey: string): Promise<void> {
	muteStore.unmutePubkey(pubkey);

	await publishMuteList();
}

/**
 * Remove an event ID from the mute list and publish the updated kind 10000 event.
 */
export async function unmuteEventId(eventId: string): Promise<void> {
	muteStore.unmuteEventId(eventId);

	await publishMuteList();
}

/**
 * Build and publish the current mute list state as a kind 10000 replaceable event.
 * Accepts an optional newPubkey that will be included in the published tags even
 * before the store is updated — this avoids the optimistic-update pattern.
 */
async function publishMuteList(newPubkey?: string): Promise<void> {
	try {
		const { relays, pool } = get(appStore);
		const currentMutes = get(muteStore);

		const pubkeysToPublish = newPubkey
			? new Set([...currentMutes.mutedPubkeys, newPubkey])
			: currentMutes.mutedPubkeys;

		const tags: string[][] = [
			...Array.from(pubkeysToPublish).map((pubkey) => ['p', pubkey]),
			...Array.from(currentMutes.mutedEventIds).map((eventId) => ['e', eventId])
		];

		const signedEvent = await getSignedEvent({
			kind: KINDS.MUTE_LIST,
			tags,
			content: ''
		});

		pool.publish(relays, signedEvent);
	} catch (error) {
		console.error('[muteList] Failed to publish mute list:', error);
		throw error;
	}
}

/**
 * Check if a pubkey is in the current mute list.
 * Convenience helper for use outside of Svelte components.
 */
export function isPubkeyMuted(pubkey: string): boolean {
	return get(muteStore).mutedPubkeys.has(pubkey);
}
