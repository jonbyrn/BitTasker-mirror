import type { NostrEvent } from 'nostr-tools';
import { NDKEvent, NDKRelaySet } from '@nostr-dev-kit/ndk';
import { ndk } from '$lib/nostr/ndk';
import { PUBLISH_TIMEOUT_MS } from '$lib/utils/nostr';
import KINDS from '$lib/utils/constants/kinds';
import { normalizeProfileLookupKey, profileRelays } from '$lib/nostr/profile/profile-keys';
import { resolveDisplayNameFromProfileMetadataContent } from '$lib/nostr/profile/metadata-wire';

/** Thrown by {@link publishSignedNdkEvent} when `ndk.signer` isn't set; callers may catch it to skip non-critical publishes without blocking. */
export class NdkSignerNotConfiguredError extends Error {
	constructor() {
		super('NDK signer not configured');
		this.name = 'NdkSignerNotConfiguredError';
	}
}

export async function fetchKind0Event(
	pubkeyHex: string,
	relays = profileRelays()
): Promise<NostrEvent | null> {
	if (relays.length === 0) {
		return null;
	}
	const { hexPubkey } = normalizeProfileLookupKey(pubkeyHex);
	if (!hexPubkey) {
		return null;
	}
	const relaySet = NDKRelaySet.fromRelayUrls(relays, ndk);
	const event = await ndk.fetchEvent(
		{ kinds: [KINDS.PROFILE_METADATA], authors: [hexPubkey], limit: 1 },
		{ closeOnEose: true },
		relaySet
	);
	if (!event) {
		return null;
	}
	return (await event.toNostrEvent()) as NostrEvent;
}

export async function fetchProfileName(
	pubkeyHex: string,
	relays = profileRelays()
): Promise<string | undefined> {
	const nostrEvent = await fetchKind0Event(pubkeyHex, relays);
	if (!nostrEvent?.content) {
		return undefined;
	}
	const raw = JSON.parse(nostrEvent.content) as Record<string, unknown>;
	return resolveDisplayNameFromProfileMetadataContent(raw);
}

export async function publishSignedNdkEvent(
	kind: number,
	content: string,
	tags: string[][],
	relays = profileRelays()
): Promise<NostrEvent> {
	if (!ndk.signer) {
		throw new NdkSignerNotConfiguredError();
	}
	if (relays.length === 0) {
		throw new Error('No profile relays configured');
	}

	const ndkEvent = new NDKEvent(ndk);
	ndkEvent.kind = kind;
	ndkEvent.created_at = Math.floor(Date.now() / 1000);
	ndkEvent.content = content;
	ndkEvent.tags = [...tags, ['v', __APP_VERSION__]];

	await ndkEvent.sign();

	const relaySet = NDKRelaySet.fromRelayUrls(relays, ndk);
	const requiredRelayCount = Math.min(1, relays.length);
	const published = await ndkEvent.publish(relaySet, PUBLISH_TIMEOUT_MS, requiredRelayCount);

	if (!published || published.size < requiredRelayCount) {
		throw new Error('PROFILE_METADATA_PUBLISH_REJECTED');
	}

	return (await ndkEvent.toNostrEvent()) as NostrEvent;
}

export async function publishDeletionEventNdk(
	eventId: string,
	eventKind?: number | string,
	relays = profileRelays()
): Promise<NostrEvent> {
	const tags: string[][] = [['e', eventId]];
	if (eventKind !== undefined && eventKind !== '') {
		tags.push(['k', String(eventKind)]);
	}
	return publishSignedNdkEvent(5, 'Delete event', tags, relays);
}

export async function fetchEventByIdNdk(
	eventId: string,
	relays = profileRelays()
): Promise<NostrEvent | null> {
	if (relays.length === 0) {
		return null;
	}
	const relaySet = NDKRelaySet.fromRelayUrls(relays, ndk);
	const event = await ndk.fetchEvent({ ids: [eventId] }, { closeOnEose: true }, relaySet);
	if (!event) {
		return null;
	}
	return (await event.toNostrEvent()) as NostrEvent;
}

export async function deleteNostrEvent(
	eventId: string,
	eventKind?: string,
	relays = profileRelays()
): Promise<void> {
	await publishDeletionEventNdk(eventId, eventKind, relays);
}

export async function getEventById(
	eventId: string,
	relays = profileRelays()
): Promise<NostrEvent | null> {
	return fetchEventByIdNdk(eventId, relays);
}
