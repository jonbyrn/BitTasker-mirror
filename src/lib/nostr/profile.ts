import type { NostrProfile } from '$lib/types/profile.d';
import { nip19 } from 'nostr-tools';
import { fetchKind0Event } from './profile/ndk';
export { NdkSignerNotConfiguredError } from './profile/ndk';
export { publishProfileMetadata, verifyProfileMetadataOnRelays } from './profile/metadata-publish';
export {
	buildProfileMetadataWire,
	resolveDisplayNameFromProfileMetadataContent
} from './profile/metadata-wire';
export { generateProfileTranslations } from './profile/translations';
export { publishMultipleImages, publishSkillsUpdate } from './profile/kinds-publish';
export type { ProfileSetupMode } from './profile/types';
import { profileCache } from '$lib/utils/profile-cache';

function toHex(value: string): string {
	if (!value.startsWith('npub1')) return value;
	const decoded = nip19.decode(value);
	return typeof decoded.data === 'string' ? decoded.data : '';
}

export async function fetchProfileMetadata(pubkey: string): Promise<NostrProfile> {
	const hex = toHex(pubkey);
	if (!hex) return {};
	const cached = await profileCache.getProfile(hex);
	if (cached) return cached as NostrProfile;
	const event = await fetchKind0Event(hex);
	if (!event?.content) return {};
	try {
		const profile = JSON.parse(event.content) as NostrProfile;
		await profileCache.cacheProfile(hex, profile);
		return profile;
	} catch {
		return {};
	}
}

export async function getCachedProfile(pubkey: string): Promise<NostrProfile | null> {
	const hex = toHex(pubkey);
	if (!hex) return null;
	return ((await profileCache.getProfile(hex)) as NostrProfile | undefined) ?? null;
}

export async function fetchContractProfile(pubkey: string): Promise<NostrProfile> {
	return fetchProfileMetadata(pubkey);
}

export async function fetchComprehensiveProfile(pubkey: string): Promise<NostrProfile | null> {
	const profile = await fetchProfileMetadata(pubkey);
	return Object.keys(profile).length > 0 ? profile : null;
}

export async function fetchKind0Profile(pubkey: string): Promise<NostrProfile | null> {
	const event = await fetchKind0Event(toHex(pubkey));
	if (!event?.content) return null;
	try {
		return JSON.parse(event.content) as NostrProfile;
	} catch {
		return null;
	}
}

export async function getProfileEvent(pubkey: string): Promise<ReturnType<typeof fetchKind0Event>> {
	return fetchKind0Event(toHex(pubkey));
}

export async function loadAuthProfileSnapshot(pubkey: string): Promise<NostrProfile | null> {
	const metadata = await fetchComprehensiveProfile(pubkey);
	return metadata;
}

export function subscribeToProfileUpdates(): () => void {
	return () => undefined;
}

export function closeNostrPool(): void {
	// NDK owns the active relay pool; logout clears the signer and sessions.
}
