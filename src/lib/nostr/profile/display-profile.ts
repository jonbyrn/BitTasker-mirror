import type { NostrEvent } from 'nostr-tools';
import { NDKRelaySet } from '@nostr-dev-kit/ndk';
import { ndk } from '$lib/nostr/ndk';
import { formatStandardDateShort } from '$lib/utils/helpers/dateFormatter';
import { profileCache } from '$lib/utils/profile-cache';
import KINDS from '$lib/utils/constants/kinds';
import { normalizeProfileLookupKey, profileRelays } from '$lib/nostr/profile/profile-keys';
import { resolveDisplayNameFromProfileMetadataContent } from '$lib/nostr/profile/metadata-wire';

export type ProfileSummary = {
	name?: string;
	picture?: string;
	createdAt?: string;
};

const inFlightFetches = new Map<string, Promise<ProfileSummary>>();

function hasProfileSummary(profile: ProfileSummary): boolean {
	return Boolean(profile.name || profile.picture || profile.createdAt);
}

/**
 * Parse kind 0 / 1063 / 30063 events into badge fields (name, picture, member-since).
 */
export function parseProfileEvents(events: NostrEvent[]): ProfileSummary {
	let name: string | undefined;
	let picture: string | undefined;
	let createdAt: string | undefined;

	const sortedEvents = [...events].sort((a, b) => b.created_at - a.created_at);

	for (const event of sortedEvents) {
		if (event.kind === KINDS.PROFILE_METADATA && event.content) {
			try {
				const content = JSON.parse(event.content) as Record<string, unknown>;
				name = resolveDisplayNameFromProfileMetadataContent(content) ?? name;

				if (event.created_at) {
					createdAt = formatStandardDateShort(new Date(event.created_at * 1000));
				}

				if (typeof content.picture === 'string' && content.picture && !picture) {
					picture = content.picture;
				}
				if (!picture && typeof content.avatar === 'string') {
					picture = content.avatar;
				}
				if (!picture && typeof content.image === 'string') {
					picture = content.image;
				}
			} catch (e) {
				console.error('Failed to parse profile metadata:', e);
			}
		} else if (!picture && event.kind === KINDS.FILE_METADATA) {
			const urlTag = event.tags.find((t) => t[0] === 'url');
			const altTag = event.tags.find((t) => t[0] === 'alt');
			const mTag = event.tags.find((t) => t[0] === 'm');

			if (urlTag?.[1]) {
				const alt = altTag?.[1]?.toLowerCase() ?? '';
				const mime = mTag?.[1]?.toLowerCase() ?? '';

				if (
					alt.includes('profile') ||
					alt.includes('avatar') ||
					mime.startsWith('image/') ||
					urlTag[1].match(/\.(jpg|jpeg|png|gif|webp)$/i)
				) {
					picture = urlTag[1];
				}
			}
		} else if (!picture && event.kind === KINDS.PROFILE_IMAGES) {
			const dTag = event.tags.find((t) => t[0] === 'd');
			if (dTag?.[1] === 'profile-images') {
				try {
					const images = JSON.parse(event.content) as Array<{ url?: string }>;
					if (Array.isArray(images) && images.length > 0 && images[0]?.url) {
						picture = images[0].url;
					}
				} catch (e) {
					console.error('Failed to parse profile images content:', e);
				}
			}
		}
	}

	return { name, picture, createdAt };
}

/** Apply a live subscription event onto an existing profile summary. */
export function mergeProfileEvent(current: ProfileSummary, event: NostrEvent): ProfileSummary {
	const parsed = parseProfileEvents([event]);
	return {
		name: parsed.name ?? current.name,
		picture: parsed.picture ?? current.picture,
		createdAt: parsed.createdAt ?? current.createdAt
	};
}

async function fetchProfileEvents(
	hexPubkey: string,
	relays = profileRelays()
): Promise<NostrEvent[]> {
	if (!hexPubkey || relays.length === 0) {
		return [];
	}

	const relaySet = NDKRelaySet.fromRelayUrls(relays, ndk);
	const ndkEvents = await ndk.fetchEvents(
		{
			kinds: [KINDS.PROFILE_METADATA, KINDS.FILE_METADATA, KINDS.PROFILE_IMAGES],
			authors: [hexPubkey],
			limit: 20
		},
		{ closeOnEose: true, relaySet }
	);

	const nostrEvents: NostrEvent[] = [];
	for (const ev of ndkEvents) {
		nostrEvents.push((await ev.toNostrEvent()) as NostrEvent);
	}
	return nostrEvents;
}

/**
 * Lightweight profile fetch (name, picture, member-since) via NDK with shared cache + dedup.
 */
export async function fetchProfileMetadata(
	pubkeyInput: string,
	relays = profileRelays()
): Promise<ProfileSummary> {
	try {
		const { cacheKey, hexPubkey } = normalizeProfileLookupKey(pubkeyInput);
		if (!cacheKey || !hexPubkey) {
			return {};
		}

		const cached = await profileCache.getProfile(cacheKey);
		if (cached) {
			return cached as ProfileSummary;
		}

		const inFlight = inFlightFetches.get(cacheKey);
		if (inFlight) {
			return inFlight;
		}

		const promise = (async (): Promise<ProfileSummary> => {
			const events = await fetchProfileEvents(hexPubkey, relays);
			const profile = parseProfileEvents(events);
			if (hasProfileSummary(profile)) {
				await profileCache.cacheProfile(cacheKey, profile);
			}
			return profile;
		})();

		inFlightFetches.set(cacheKey, promise);
		try {
			return await promise;
		} finally {
			inFlightFetches.delete(cacheKey);
		}
	} catch (error) {
		console.error('Failed to fetch profile metadata for', pubkeyInput, ':', error);
		return {};
	}
}

/** Read profile summary from cache only (no network). */
export async function getCachedProfile(pubkeyInput: string): Promise<ProfileSummary | null> {
	const { cacheKey } = normalizeProfileLookupKey(pubkeyInput);
	if (!cacheKey) return null;
	const cached = await profileCache.getProfile(cacheKey);
	return cached ? (cached as ProfileSummary) : null;
}

/** Batch fetch profile summaries for multiple authors (messages inbox). */
export async function fetchProfilesBatch(
	pubkeys: string[],
	relays = profileRelays()
): Promise<Map<string, ProfileSummary>> {
	const profileMap = new Map<string, ProfileSummary>();
	if (pubkeys.length === 0) {
		return profileMap;
	}

	const hexAuthors = pubkeys.map((pk) => normalizeProfileLookupKey(pk).hexPubkey).filter(Boolean);
	const uncached: string[] = [];

	for (const hex of hexAuthors) {
		const cached = await profileCache.getProfile(hex);
		if (cached) {
			profileMap.set(hex, cached as ProfileSummary);
		} else {
			uncached.push(hex);
		}
	}

	if (uncached.length === 0 || relays.length === 0) {
		return profileMap;
	}

	const relaySet = NDKRelaySet.fromRelayUrls(relays, ndk);
	const ndkEvents = await ndk.fetchEvents(
		{
			kinds: [KINDS.PROFILE_METADATA, KINDS.FILE_METADATA, KINDS.PROFILE_IMAGES],
			authors: uncached,
			limit: uncached.length * 3
		},
		{ closeOnEose: true, relaySet }
	);

	const eventsByAuthor = new Map<string, NostrEvent[]>();
	for (const ev of ndkEvents) {
		const nostrEv = (await ev.toNostrEvent()) as NostrEvent;
		const list = eventsByAuthor.get(nostrEv.pubkey) ?? [];
		list.push(nostrEv);
		eventsByAuthor.set(nostrEv.pubkey, list);
	}

	for (const hex of uncached) {
		const events = eventsByAuthor.get(hex) ?? [];
		const profile = parseProfileEvents(events);
		if (hasProfileSummary(profile)) {
			await profileCache.cacheProfile(hex, profile);
		}
		profileMap.set(hex, profile);
	}

	return profileMap;
}

export type ContractProfile = {
	name?: string;
	picture?: string;
	createdAt?: string;
	reviews?: Array<{ id: string; from: string; rating: number; text: string; date: string }>;
	averageRating?: number;
	tasksCompleted?: number;
};

/** Lightweight profile for contract panels (summary + kind 30004 reviews). */
export async function fetchContractProfile(pubkey: string): Promise<ContractProfile> {
	try {
		const { hexPubkey: authorHex } = normalizeProfileLookupKey(pubkey);
		if (!authorHex) {
			return {};
		}

		const cachedProfile = await profileCache.getProfile(authorHex);
		if (
			cachedProfile &&
			'reviews' in cachedProfile &&
			'averageRating' in cachedProfile &&
			Array.isArray(cachedProfile.reviews)
		) {
			return cachedProfile as ContractProfile;
		}

		const relays = profileRelays();
		if (relays.length === 0) {
			return {};
		}

		const relaySet = NDKRelaySet.fromRelayUrls(relays, ndk);
		const ndkEvents = await ndk.fetchEvents(
			{
				kinds: [KINDS.PROFILE_METADATA, KINDS.PROFILE_IMAGES, KINDS.PROFILE_REVIEWS],
				authors: [authorHex],
				limit: 15
			},
			{ closeOnEose: true, relaySet }
		);

		const events: NostrEvent[] = [];
		for (const ev of ndkEvents) {
			events.push((await ev.toNostrEvent()) as NostrEvent);
		}

		const parsed = parseProfileEvents(events);
		let reviews: Array<{ id: string; from: string; rating: number; text: string; date: string }> =
			[];

		for (const event of [...events].sort((a, b) => b.created_at - a.created_at)) {
			if (event.kind !== KINDS.PROFILE_REVIEWS) continue;
			try {
				const content = JSON.parse(event.content) as Array<Record<string, unknown>>;
				if (Array.isArray(content)) {
					reviews = content.map((review) => ({
						id: String(review.id ?? ''),
						from: String(review.from ?? ''),
						rating: Number(review.rating ?? 0),
						text: String(review.text ?? ''),
						date: String(review.date ?? '')
					}));
				}
			} catch (e) {
				console.error('Failed to parse contract profile reviews:', e);
			}
		}

		const averageRating =
			reviews.length > 0
				? reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length
				: 0;

		const profile: ContractProfile = {
			name: parsed.name,
			picture: parsed.picture,
			createdAt: parsed.createdAt,
			reviews,
			averageRating,
			tasksCompleted: reviews.length
		};

		await profileCache.cacheProfile(authorHex, profile);
		return profile;
	} catch (error) {
		console.error('Failed to fetch contract profile:', error);
		return {};
	}
}
