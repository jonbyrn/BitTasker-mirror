/**
 * Nostr Account Deletion Broadcast
 *
 * Broadcasts two Nostr events when a user deletes their account:
 *   1. Kind 5  — NIP-09 Event Deletion Request (k-tag per kind used in BitTasker)
 *   2. Kind 62 — NIP-62 Request to Vanish (ALL_RELAYS)
 *
 * Both events are signed with the user's private key and published to:
 *   - The BitTasker primary relay
 *   - Any relays in the user's NIP-65 relay list
 *   - A set of well-known fallback public relays
 *
 * See: docs/google-play-store/account-deletion.md — Section 3
 */

import { get } from 'svelte/store';
import { appStore } from '$lib/stores/app.store';
import { publishToMultipleRelays, getSignedEvent } from '$lib/utils/nostr';
import KINDS from '$lib/utils/constants/kinds';

/**
 * Broadcast NIP-09 Kind 5 — Event Deletion Request.
 *
 * Uses `k` tags (delete by kind) rather than individual `e` tags to avoid
 * the performance cost of fetching every event ID. A single kind 5 event
 * with `k` tags covers all events of those kinds authored by this pubkey.
 *
 * The kind 5 event itself persists on relays permanently — this is by design.
 * It serves as a verifiable signal of the user's deletion intent.
 */
async function broadcastKind5DeletionRequest(relays: string[]): Promise<void> {
	const kTags = Object.values(KINDS).map((kind) => ['k', String(kind)]);

	const event = await getSignedEvent({
		kind: 5,
		tags: kTags,
		content:
			'Account deletion request. All events published by this key on BitTasker are requested to be deleted.'
	});

	await publishToMultipleRelays(event, relays);
}

/**
 * Broadcast NIP-62 Kind 62 — Request to Vanish.
 *
 * Merged into the Nostr specification on February 19, 2025.
 * Instructs all relays to fully delete all events from this pubkey
 * and prevent re-broadcasting. Legally binding in some jurisdictions (GDPR).
 *
 * Uses ALL_RELAYS to maximise network-wide propagation.
 */
async function broadcastKind62RequestToVanish(relays: string[]): Promise<void> {
	const event = await getSignedEvent({
		kind: 62,
		tags: [['relay', 'ALL_RELAYS']],
		content: 'Account deletion request. Please delete all events associated with this public key.'
	});

	await publishToMultipleRelays(event, relays);
}

/**
 * Broadcast all Nostr deletion signals for account deletion.
 *
 * Publishes kind 5 (NIP-09) and kind 62 (NIP-62) events to the BitTasker
 * relay, any user-configured relays, and well-known fallback relays.
 *
 * IMPORTANT: This must be called BEFORE clearing local storage, because
 * the user's nsec (needed to sign both events) is read from Capacitor
 * Preferences / appStore during signing.
 */
export async function broadcastAccountDeletion(): Promise<void> {
	const relays = get(appStore).relays;

	// Broadcast both events concurrently — they are independent of each other.
	// We use allSettled so that a failure in one does not block the other.
	const results = await Promise.allSettled([
		broadcastKind5DeletionRequest(relays),
		broadcastKind62RequestToVanish(relays)
	]);

	// Log any failures for observability, but do not throw — the deletion
	// flow must continue regardless of relay cooperation.
	results.forEach((result, index) => {
		const label = index === 0 ? 'Kind 5 (NIP-09)' : 'Kind 62 (NIP-62)';
		if (result.status === 'rejected') {
			console.error(`[accountDeletion] ${label} broadcast failed:`, result.reason);
		}
	});
}
