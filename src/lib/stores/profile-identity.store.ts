import { browser } from '$app/environment';
import type { UserData } from '$lib/types/auth';
import { writable } from 'svelte/store';
import { normalizeProfileLookupKey } from '$lib/nostr/profile/profile-keys';
import { profileStore } from '$lib/stores/profile.store';
import { user } from '$lib/stores/user.store';
import { StorageKeys } from '$lib/utils/constants/storage';
import { profileCache } from '$lib/utils/profile-cache';

/** Bumps after the signed-in user saves kind-0 display name or picture. */
export const profileIdentityRevision = writable(0);

function rememberCachedUser(patch: Partial<UserData>): void {
	if (!browser) return;
	try {
		const raw = localStorage.getItem(StorageKeys.USER_PROFILE);
		const parsed: unknown = raw ? JSON.parse(raw) : null;
		const current =
			parsed !== null && typeof parsed === 'object' ? (parsed as Partial<UserData>) : {};
		localStorage.setItem(StorageKeys.USER_PROFILE, JSON.stringify({ ...current, ...patch }));
	} catch {
		// Profile caching is best-effort.
	}
}

/**
 * Write a saved display name and picture into the stores and the kind-0 cache
 * so header, profile, cards, messages, reviews, and notifications update.
 */
export async function publishLocalIdentity(input: {
	npub?: string;
	displayName: string;
	picture: string;
	about?: string;
}): Promise<void> {
	const displayName = input.displayName.trim();
	const picture = input.picture.trim();
	const about = input.about?.trim() ?? '';

	user.updateProfile({ name: displayName, picture });
	profileStore.applyIdentity({ name: displayName, picture, about });
	rememberCachedUser({ name: displayName, picture });

	if (input.npub) {
		const { hexPubkey } = normalizeProfileLookupKey(input.npub);
		if (hexPubkey) {
			profileCache.invalidate(hexPubkey);
			await profileCache.cacheProfile(hexPubkey, {
				name: displayName || undefined,
				display_name: displayName || undefined,
				picture: picture || undefined,
				about: about || undefined
			});
		}
	}

	profileIdentityRevision.update((value) => value + 1);
}
