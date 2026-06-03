import type { NostrProfile, NostrProfileImage, Skill } from '$lib/types/profile.d';
import type { NostrEvent } from 'nostr-tools';
import { NDKRelaySet } from '@nostr-dev-kit/ndk';
import { ndk } from '$lib/nostr/ndk';
import KINDS from '$lib/utils/constants/kinds';
import { normalizeProfileLookupKey, profileRelays } from '$lib/nostr/profile/profile-keys';
import { parseProfileMetadataContent } from '$lib/nostr/profile/metadata-wire';
import { fetchKind0Event } from '$lib/nostr/profile/ndk';
import type { AuthProfileSnapshot } from '$lib/nostr/profile/types';

/**
 * One-shot NDK load for signup/login profile step (no nostr-tools subscription).
 */
export async function loadAuthProfileSnapshot(
	npubHex: string,
	relays = profileRelays()
): Promise<AuthProfileSnapshot> {
	const snapshot: AuthProfileSnapshot = {
		metadata: null,
		picture: null,
		skills: [],
		imageEventId: null
	};

	if (relays.length === 0) {
		return snapshot;
	}

	const { hexPubkey: author } = normalizeProfileLookupKey(npubHex);
	if (!author) {
		return snapshot;
	}
	const relaySet = NDKRelaySet.fromRelayUrls(relays, ndk);

	const events = await ndk.fetchEvents(
		[
			{ kinds: [KINDS.PROFILE_METADATA], authors: [author], limit: 3 },
			{
				kinds: [KINDS.PROFILE_IMAGES],
				authors: [author],
				'#d': ['profile-images'],
				limit: 3
			},
			{ kinds: [KINDS.PROFILE_SKILLS], authors: [author], '#d': ['skills'], limit: 3 }
		],
		{ closeOnEose: true, relaySet }
	);

	const byKind = new Map<number, NostrEvent[]>();

	for (const ev of events) {
		const nostrEv = (await ev.toNostrEvent()) as NostrEvent;
		const list = byKind.get(nostrEv.kind) ?? [];
		list.push(nostrEv);
		byKind.set(nostrEv.kind, list);
	}

	const sortNewest = (a: NostrEvent, b: NostrEvent) => b.created_at - a.created_at;

	const metadataEvent = (byKind.get(KINDS.PROFILE_METADATA) ?? []).sort(sortNewest)[0];
	if (metadataEvent?.content) {
		snapshot.metadata = parseProfileMetadataContent(metadataEvent.content);
		if (snapshot.metadata?.picture) {
			snapshot.picture = {
				url: snapshot.metadata.picture,
				type: 'image/png',
				alt: 'Profile picture',
				key: snapshot.metadata.picture
			};
		} else if (snapshot.metadata?.banner) {
			snapshot.picture = {
				url: snapshot.metadata.banner,
				type: 'image/png',
				alt: 'Profile banner',
				key: snapshot.metadata.banner
			};
		}
	}

	const imagesEv = (byKind.get(KINDS.PROFILE_IMAGES) ?? []).sort(sortNewest)[0];
	if (imagesEv) {
		snapshot.imageEventId = imagesEv.id;
		try {
			const images = JSON.parse(imagesEv.content) as NostrProfileImage[];
			if (Array.isArray(images) && images.length > 0 && !snapshot.picture) {
				snapshot.picture = images[0];
			}
		} catch {
			// ignore parse errors
		}
	}

	const skillsEv = (byKind.get(KINDS.PROFILE_SKILLS) ?? []).sort(sortNewest)[0];
	if (skillsEv) {
		try {
			const skillsData = JSON.parse(skillsEv.content) as Skill[];
			if (Array.isArray(skillsData)) {
				snapshot.skills = skillsData.map((skill) => ({
					...skill,
					id: skill.id ?? crypto.randomUUID()
				}));
			}
		} catch {
			// ignore parse errors
		}
	}

	return snapshot;
}

export async function getProfileEvent(npub: string): Promise<NostrEvent | null> {
	try {
		return await fetchKind0Event(npub, profileRelays());
	} catch (error) {
		console.error('Error fetching profile metadata:', error);
		return null;
	}
}

/** Parsed kind-0 profile for auth/onboarding (NDK). */
export async function fetchKind0Profile(
	npub: string,
	relays = profileRelays()
): Promise<NostrProfile | null> {
	const event = await fetchKind0Event(npub, relays);
	if (!event?.content) {
		return null;
	}
	return parseProfileMetadataContent(event.content);
}
