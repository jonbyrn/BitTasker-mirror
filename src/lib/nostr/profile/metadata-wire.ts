import type { NostrProfile } from '$lib/types/profile.d';

export function sanitizeProfileDisplayName(value: unknown): string | undefined {
	if (typeof value !== 'string') {
		return undefined;
	}

	const trimmedValue = value.trim();
	if (!trimmedValue) {
		return undefined;
	}

	if (trimmedValue.startsWith('npub')) {
		return undefined;
	}

	if (trimmedValue.includes('...')) {
		return undefined;
	}

	if (/^[0-9a-fA-F]{64}$/.test(trimmedValue)) {
		return undefined;
	}

	if (trimmedValue.startsWith('[object')) {
		return undefined;
	}

	if (/^\d+$/.test(trimmedValue) && trimmedValue.length > 3) {
		return undefined;
	}

	return trimmedValue;
}

/** Enrichment fields allowed on profile metadata (kind 0) wire JSON. */
export const PROFILE_METADATA_WIRE_ENRICHMENT_KEYS = [
	'about',
	'picture',
	'banner',
	'website',
	'nip05',
	'lud16',
	'lud06',
	'professionalTitle',
	'location',
	'translations',
	'languages'
] as const satisfies readonly (keyof NostrProfile)[];

/**
 * Read priority for profile metadata JSON (backward compatible).
 * display_name → name → displayName → username
 */
export function resolveDisplayNameFromProfileMetadataContent(
	content: Record<string, unknown> | null | undefined
): string | undefined {
	if (!content || typeof content !== 'object') {
		return undefined;
	}
	return sanitizeProfileDisplayName(
		content.display_name ?? content.name ?? content.displayName ?? content.username
	);
}

/**
 * Parse relay profile metadata content into in-memory NostrProfile (read path).
 * Only stores display_name for the human label — never legacy wire-only duplicates.
 */
export function parseProfileMetadataContent(content: string): NostrProfile | null {
	try {
		const raw = JSON.parse(content) as Record<string, unknown>;
		const profile: NostrProfile = {};
		const display = resolveDisplayNameFromProfileMetadataContent(raw);
		if (display) {
			profile.display_name = display;
		}
		for (const key of PROFILE_METADATA_WIRE_ENRICHMENT_KEYS) {
			if (raw[key] !== undefined && raw[key] !== null) {
				(profile as Record<string, unknown>)[key] = raw[key];
			}
		}
		return profile;
	} catch {
		return null;
	}
}

/**
 * Build profile metadata JSON for broadcast.
 * BitTasker publishes display_name only for the human label (never name / displayName / username).
 */
export function buildProfileMetadataWire(merged: NostrProfile): Record<string, unknown> {
	const wire: Record<string, unknown> = {};

	const displayName =
		merged.display_name?.trim() ||
		resolveDisplayNameFromProfileMetadataContent(merged as Record<string, unknown>);

	if (displayName) {
		wire.display_name = displayName;
	}

	for (const key of PROFILE_METADATA_WIRE_ENRICHMENT_KEYS) {
		const value = merged[key];
		if (value === undefined || value === null) {
			continue;
		}
		if (typeof value === 'string' && !value.trim()) {
			continue;
		}
		wire[key] = value;
	}

	return wire;
}

export function mergeProfileMetadata(
	metadata: NostrProfile,
	existingMetadata: NostrProfile
): NostrProfile {
	const merged: NostrProfile = { ...existingMetadata };

	const applyField = <K extends keyof NostrProfile>(key: K, value: NostrProfile[K] | undefined) => {
		if (value === undefined || value === null) {
			return;
		}
		if (key === 'display_name' && typeof value === 'string' && !value.trim()) {
			return;
		}
		merged[key] = value;
	};

	applyField('display_name', metadata.display_name);
	applyField('about', metadata.about);
	applyField('picture', metadata.picture);
	applyField('banner', metadata.banner);
	applyField('website', metadata.website);
	applyField('nip05', metadata.nip05);
	applyField('lud16', metadata.lud16);
	applyField('lud06', metadata.lud06);
	applyField('professionalTitle', metadata.professionalTitle);
	applyField('location', metadata.location);

	if (metadata.translations !== undefined) {
		merged.translations = metadata.translations;
	}

	if (metadata.languages !== undefined) {
		merged.languages = metadata.languages;
	}

	if (metadata.pictures !== undefined) {
		delete merged.pictures;
	}

	// Never carry legacy identity aliases into the publish merge
	delete merged.name;
	delete (merged as Record<string, unknown>).displayName;
	delete (merged as Record<string, unknown>).username;

	return merged;
}
