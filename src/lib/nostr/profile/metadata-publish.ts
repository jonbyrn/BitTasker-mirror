import type { NostrProfile } from '$lib/types/profile.d';
import type { NostrEvent } from 'nostr-tools';
import { NDKEvent, NDKRelaySet } from '@nostr-dev-kit/ndk';
import { get } from 'svelte/store';
import { appStore } from '$lib/stores/app.store';
import { ndk } from '$lib/nostr/ndk';
import { PUBLISH_TIMEOUT_MS } from '$lib/utils/nostr';
import { profileCache } from '$lib/utils/profile-cache';
import { normalizeProfileLookupKey, profileRelays } from '$lib/nostr/profile/profile-keys';
import {
	buildProfileMetadataWire,
	mergeProfileMetadata,
	resolveDisplayNameFromProfileMetadataContent
} from '$lib/nostr/profile/metadata-wire';
import { fetchProfileName, NdkSignerNotConfiguredError } from '$lib/nostr/profile/ndk';
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
		const name = await fetchProfileName(authorHex, relays);

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
export async function publishProfileMetadata(
	metadata: NostrProfile,
	existingMetadata: NostrProfile = {},
	relays = get(appStore)?.relays ?? [],
	verifyOptions: ProfileMetadataVerifyOptions | false = {}
): Promise<NostrEvent> {
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

	const relaySet = NDKRelaySet.fromRelayUrls(relays, ndk);
	const requiredRelayCount = Math.min(1, relays.length);
	const published = await ndkEvent.publish(relaySet, PUBLISH_TIMEOUT_MS, requiredRelayCount);

	if (!published || published.size < requiredRelayCount) {
		throw new Error('PROFILE_METADATA_PUBLISH_REJECTED');
	}

	const signedEvent = (await ndkEvent.toNostrEvent()) as NostrEvent;

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

		if (requiredDisplayName) {
			await profileCache.cacheProfile(npubHex, { name: requiredDisplayName });
		}
	}

	return signedEvent;
}

