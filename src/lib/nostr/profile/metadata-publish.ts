import type { NostrProfile } from '$lib/types/profile.d';
import type { Event, NostrEvent } from 'nostr-tools';
import { NDKEvent } from '@nostr-dev-kit/ndk';
import { ndk } from '$lib/nostr/ndk';
import { publishWithRelayAuth } from '$lib/nostr/relaySession';
import { queryRelayEvents } from '$lib/nostr/relayQuery';
import { profileCache } from '$lib/utils/profile-cache';
import { normalizeProfileLookupKey, profileRelays } from '$lib/nostr/profile/profile-keys';
import {
	buildProfileMetadataWire,
	mergeProfileMetadata,
	resolveDisplayNameFromProfileMetadataContent
} from '$lib/nostr/profile/metadata-wire';
import { NdkSignerNotConfiguredError } from '$lib/nostr/profile/ndk';
import type { ProfileMetadataVerifyOptions } from '$lib/nostr/profile/types';

const PROFILE_VERIFY_TIMEOUT_MS = 15_000;
const PROFILE_VERIFY_POLL_MS = 1_500;

/**
 * Poll relays until profile metadata includes the expected display name (or any name when not specified).
 */
export async function verifyProfileMetadataOnRelays(
	npubHex: string,
	options: ProfileMetadataVerifyOptions = {}
): Promise<void> {
	const {
		requiredDisplayName,
		timeoutMs = PROFILE_VERIFY_TIMEOUT_MS,
		pollIntervalMs = PROFILE_VERIFY_POLL_MS
	} = options;

	const { hexPubkey: authorHex } = normalizeProfileLookupKey(npubHex);
	if (!authorHex) {
		throw new Error('Invalid pubkey format');
	}
	profileCache.invalidate(authorHex);

	const expectedName = requiredDisplayName?.trim();
	const deadline = Date.now() + timeoutMs;
	const relays = profileRelays();

	while (Date.now() < deadline) {
		const name = await readProfileName(authorHex, relays);

		if (expectedName) {
			if (name === expectedName) {
				return;
			}
		} else if (name) {
			return;
		}

		await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
	}

	if (expectedName) {
		throw new Error('PROFILE_METADATA_VERIFY_TIMEOUT');
	}
	throw new Error('PROFILE_METADATA_VERIFY_TIMEOUT');
}

/**
 * Publish profile metadata via NDK, then verify read-back on profile relays.
 */
async function readProfileName(authorHex: string, relays: string[]): Promise<string | undefined> {
	if (relays.length === 0) return undefined;
	const events = await queryRelayEvents(relays, {
		kinds: [0],
		authors: [authorHex],
		limit: 1
	});
	const newest = events.reduce<Event | null>((best, event) => {
		if (!best || event.created_at >= best.created_at) return event;
		return best;
	}, null);
	if (!newest?.content) return undefined;
	try {
		const raw = JSON.parse(newest.content) as Record<string, unknown>;
		return resolveDisplayNameFromProfileMetadataContent(raw);
	} catch {
		return undefined;
	}
}

async function deliverProfile(event: Event, relays: string[]): Promise<void> {
	const results = await publishWithRelayAuth(event, relays);
	if (!results.some((result) => result.success)) {
		throw new Error('PROFILE_METADATA_PUBLISH_REJECTED');
	}
}

export async function publishProfileMetadata(
	metadata: NostrProfile,
	existingMetadata: NostrProfile = {},
	relays = profileRelays(),
	verifyOptions: ProfileMetadataVerifyOptions | false = {}
): Promise<NostrEvent> {
	if (!ndk.signer) {
		const { prepareSigner } = await import('$lib/utils/nostrKeys');
		await prepareSigner();
	}
	if (!ndk.signer) {
		throw new NdkSignerNotConfiguredError();
	}

	const mergedMetadata = mergeProfileMetadata(metadata, existingMetadata);
	const wireMetadata = buildProfileMetadataWire(mergedMetadata);

	if (!ndk.signer) {
		throw new NdkSignerNotConfiguredError();
	}

	if (relays.length === 0) {
		throw new Error('No profile relays configured');
	}

	const ndkEvent = new NDKEvent(ndk);
	ndkEvent.kind = 0;
	ndkEvent.created_at = Math.floor(Date.now() / 1000);
	ndkEvent.content = JSON.stringify(wireMetadata);
	ndkEvent.tags = [['v', __APP_VERSION__]];

	await ndkEvent.sign();

	const signedEvent = (await ndkEvent.toNostrEvent()) as Event;
	await deliverProfile(signedEvent, relays);

	if (verifyOptions !== false) {
		const npubHex = signedEvent.pubkey;
		const requiredDisplayName =
			verifyOptions.requiredDisplayName ??
			resolveDisplayNameFromProfileMetadataContent(wireMetadata as Record<string, unknown>);

		await verifyProfileMetadataOnRelays(npubHex, {
			requiredDisplayName,
			timeoutMs: verifyOptions.timeoutMs,
			pollIntervalMs: verifyOptions.pollIntervalMs
		});

		const picture = typeof wireMetadata.picture === 'string' ? wireMetadata.picture : undefined;
		if (requiredDisplayName || picture) {
			await profileCache.cacheProfile(npubHex, {
				...(requiredDisplayName
					? { name: requiredDisplayName, display_name: requiredDisplayName }
					: {}),
				...(picture ? { picture } : {}),
				...(typeof wireMetadata.about === 'string' ? { about: wireMetadata.about } : {})
			});
		}
	}

	return signedEvent;
}
