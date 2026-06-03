import type { NostrEvent } from 'nostr-tools';
import type { NDKFilter, NDKSubscription } from '@nostr-dev-kit/ndk';
import KINDS from '$lib/utils/constants/kinds';
import { getNpub } from '$lib/utils/nostrKeys';
import { ndk } from '$lib/nostr/ndk';
import { normalizeProfileLookupKey } from '$lib/nostr/profile/profile-keys';
import { mergeProfileEvent, type ProfileSummary } from '$lib/nostr/profile/display-profile';
import { profileCache } from '$lib/utils/profile-cache';

type OwnProfileSubscription = {
	subs: NDKSubscription[];
	callbacks: Set<(event: NostrEvent) => void>;
};

const profileSubscriptions = new Map<string, OwnProfileSubscription>();

type UserProfileSubscription = {
	subs: NDKSubscription[];
	callbacks: Set<(profile: ProfileSummary) => void>;
	profile: ProfileSummary;
};

const userProfileSubscriptions = new Map<string, UserProfileSubscription>();

export function createSubscriptionKey(
	npub: string,
	kindFilters?: { [kind: number]: { [tag: string]: string } | null | undefined }
): string {
	if (!kindFilters) {
		return `${npub}:default`;
	}
	const kinds = Object.keys(kindFilters).sort().join(',');
	const tags = Object.entries(kindFilters)
		.map(([tagFilters]) => {
			if (!tagFilters) return '';
			return Object.entries(tagFilters)
				.map(([tag, value]) => `${tag}:${value}`)
				.sort()
				.join(';');
		})
		.filter(Boolean)
		.join('|');
	return `${npub}:${kinds}:${tags}`;
}

function buildNdkFilters(
	authorHex: string,
	kindFilters?: { [kind: number]: { [tag: string]: string } | null | undefined }
): NDKFilter[] {
	if (!kindFilters) {
		return [{ authors: [authorHex], limit: 10 }];
	}

	return Object.entries(kindFilters).map(([kindStr, tagFilters]) => {
		const kind = parseInt(kindStr, 10);
		const filter: NDKFilter = {
			authors: [authorHex],
			kinds: [kind],
			limit: 10
		};

		if (tagFilters) {
			for (const [tag, value] of Object.entries(tagFilters)) {
				filter[`#${tag}` as `#${string}`] = [value];
			}
		}

		return filter;
	});
}

function startNdkSubscription(
	filters: NDKFilter[],
	onEvent: (event: NostrEvent) => void
): NDKSubscription[] {
	return filters.map((filter) =>
		ndk.subscribe(filter, {
			closeOnEose: false,
			onEvent: async (ndkEvent) => {
				try {
					const event = (await ndkEvent.toNostrEvent()) as NostrEvent;
					onEvent(event);
				} catch (error) {
					console.error('Failed to convert NDK profile event:', error);
				}
			}
		})
	);
}

/**
 * Subscribe to profile updates for the current user (own profile edit flows).
 */
export async function subscribeToProfileUpdates(
	callback: (event: NostrEvent) => void,
	kindFilters?: { [kind: number]: { [tag: string]: string } | null | undefined }
): Promise<() => void> {
	try {
		const npub = await getNpub();
		if (!npub) {
			console.error('No public key found');
			return () => {};
		}

		const { hexPubkey: authorHex } = normalizeProfileLookupKey(npub);
		if (!authorHex) {
			return () => {};
		}

		const subscriptionKey = createSubscriptionKey(authorHex, kindFilters);

		if (!profileSubscriptions.has(subscriptionKey)) {
			const filters = buildNdkFilters(authorHex, kindFilters);
			const subs = startNdkSubscription(filters, (event) => {
				const entry = profileSubscriptions.get(subscriptionKey);
				if (!entry) return;
				for (const cb of entry.callbacks) {
					cb(event);
				}
			});

			profileSubscriptions.set(subscriptionKey, {
				subs,
				callbacks: new Set([callback])
			});
		} else {
			profileSubscriptions.get(subscriptionKey)?.callbacks.add(callback);
		}

		return () => {
			const entry = profileSubscriptions.get(subscriptionKey);
			if (!entry) return;
			entry.callbacks.delete(callback);
			if (entry.callbacks.size === 0) {
				for (const sub of entry.subs) {
					sub.stop();
				}
				profileSubscriptions.delete(subscriptionKey);
			}
		};
	} catch (err) {
		console.error('Failed to get public key:', err);
		return () => {};
	}
}

/** Subscribe to lightweight profile updates for any pubkey (chat, badges). */
export function subscribeUserProfile(
	pubkeyInput: string,
	callback: (profile: ProfileSummary) => void
): () => void {
	const { hexPubkey: authorHex } = normalizeProfileLookupKey(pubkeyInput);
	if (!authorHex) {
		return () => {};
	}

	const subscriptionKey = `user-profile:${authorHex}`;

	if (!userProfileSubscriptions.has(subscriptionKey)) {
		let profile: ProfileSummary = {};

		const filters: NDKFilter[] = [
			{
				kinds: [KINDS.PROFILE_METADATA, KINDS.FILE_METADATA, KINDS.PROFILE_IMAGES],
				authors: [authorHex]
			}
		];

		const subs = startNdkSubscription(filters, async (event) => {
			const entry = userProfileSubscriptions.get(subscriptionKey);
			if (!entry) return;

			profile = mergeProfileEvent(profile, event);
			await profileCache.cacheProfile(authorHex, profile);

			for (const cb of entry.callbacks) {
				cb(profile);
			}
		});

		userProfileSubscriptions.set(subscriptionKey, {
			subs,
			callbacks: new Set([callback]),
			profile
		});
	} else {
		const entry = userProfileSubscriptions.get(subscriptionKey);
		if (entry) {
			entry.callbacks.add(callback);
			callback(entry.profile);
		}
	}

	return () => {
		const entry = userProfileSubscriptions.get(subscriptionKey);
		if (!entry) return;
		entry.callbacks.delete(callback);
		if (entry.callbacks.size === 0) {
			for (const sub of entry.subs) {
				sub.stop();
			}
			userProfileSubscriptions.delete(subscriptionKey);
		}
	};
}

/** Cleanup when completely shutting down profile subscriptions. */
export function closeNostrPool(): void {
	for (const entry of profileSubscriptions.values()) {
		for (const sub of entry.subs) {
			sub.stop();
		}
	}
	profileSubscriptions.clear();

	for (const entry of userProfileSubscriptions.values()) {
		for (const sub of entry.subs) {
			sub.stop();
		}
	}
	userProfileSubscriptions.clear();
}
