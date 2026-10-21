import { get } from 'svelte/store';
import type { NostrProfile } from '$lib/types/profile.d';
import { fetchKind0Profile, publishProfileMetadata } from '$lib/nostr/profile';
import { user } from '$lib/stores/user.store';

export type SectionSaveResult = { ok: true } | { ok: false; error: string };

export function sectionSaved(): SectionSaveResult {
	return { ok: true };
}

export function sectionFailed(error: unknown, fallback: string): { ok: false; error: string } {
	const message = error instanceof Error && error.message ? error.message : fallback;
	return { ok: false, error: message };
}

/**
 * Publish one profile field without replacing the rest of the kind-0 record.
 * A read-back timeout still counts as saved: the relay already accepted the event.
 */
export async function publishMergedProfile(npub: string, patch: NostrProfile): Promise<void> {
	const existing = (await fetchKind0Profile(npub)) ?? {};
	const storedName = get(user).name?.trim() ?? '';
	const display =
		(typeof existing.display_name === 'string' && existing.display_name.trim()) || storedName;
	const metadata: NostrProfile = display ? { ...patch, display_name: display } : patch;
	const verify = display ? { timeoutMs: 5_000, requiredDisplayName: display } : (false as const);

	try {
		await publishProfileMetadata(metadata, existing, undefined, verify);
	} catch (error) {
		if (error instanceof Error && error.message === 'PROFILE_METADATA_VERIFY_TIMEOUT') return;
		throw error;
	}
}
