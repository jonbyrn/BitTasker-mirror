/**
 * Reporting — NIP-56 Kind 1984
 *
 * Builds and publishes a kind 1984 report event to the relay.
 * Reports are regular (non-replaceable) events — they create an audit trail
 * for relay operators and can be consumed by other clients.
 *
 * Spec: https://nips.nostr.com/56
 *
 * Report types (from NIP-56):
 *   - spam        — fake tasks, bid spam, message spam
 *   - illegal     — requests for illegal services
 *   - profanity   — hateful content in descriptions or messages
 *   - nudity      — inappropriate images in profiles or task attachments
 *   - impersonation — fake profiles impersonating real users
 *   - other       — catch-all (should include a text description)
 */

import { get } from 'svelte/store';
import { appStore } from '$lib/stores/app.store';
import { getSignedEvent } from '$lib/utils/nostr';
import KINDS from '$lib/utils/constants/kinds';

export type ReportType = 'spam' | 'illegal' | 'profanity' | 'nudity' | 'impersonation' | 'other';

export interface ReportParams {
	/** The pubkey of the user being reported */
	reportedPubkey: string;
	/** The type of report (from NIP-56) */
	reportType: ReportType;
	/** Optional: the event ID of the specific content being reported (task, bid, message) */
	reportedEventId?: string;
	/** Optional: additional context provided by the reporter */
	description?: string;
}

/**
 * Publish a NIP-56 kind 1984 report event to the relay.
 *
 * Event structure for reporting a user:
 *   tags: [["p", "<pubkey>", "<reportType>"]]
 *
 * Event structure for reporting a specific event (task, bid, message):
 *   tags: [["e", "<eventId>", "<reportType>"], ["p", "<authorPubkey>"]]
 *
 * The `content` field carries the optional description text.
 */
export async function publishReport(params: ReportParams): Promise<void> {
	const { reportedPubkey, reportType, reportedEventId, description } = params;

	const tags: string[][] = [];

	if (reportedEventId) {
		// Reporting a specific event: e-tag carries the report type, p-tag is the author
		tags.push(['e', reportedEventId, reportType]);
		tags.push(['p', reportedPubkey]);
	} else {
		// Reporting a user profile: p-tag carries the report type
		tags.push(['p', reportedPubkey, reportType]);
	}

	const { pool, relays } = get(appStore);

	const signedEvent = await getSignedEvent({
		kind: KINDS.REPORT,
		tags,
		content: description ?? ''
	});

	pool.publish(relays, signedEvent);
}
