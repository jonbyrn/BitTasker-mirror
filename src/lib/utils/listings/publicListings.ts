import { textMatchesQuery } from '$lib/search/text-match';

export interface PublicListingFields {
	title?: string | null;
	description?: string | null;
	status?: string | null;
	skills?: unknown;
	categories?: unknown;
	tags?: unknown;
	budget?: { amount?: unknown } | null;
}

function textOf(value: unknown): string {
	if (typeof value === 'string') return value;
	if (typeof value === 'number' && Number.isFinite(value)) return String(value);
	if (Array.isArray(value)) return value.map(textOf).filter(Boolean).join(' ');
	if (value && typeof value === 'object') {
		const record = value as Record<string, unknown>;
		return [record.name, record.title, record.id, record.slug]
			.map(textOf)
			.filter(Boolean)
			.join(' ');
	}
	return '';
}

/** Title, description, skills, categories, and tags. The same haystack feeds the count and the cards. */
export function listingHaystack(listing: PublicListingFields | null | undefined): string {
	if (!listing) return '';
	return [listing.title, listing.description, listing.skills, listing.categories, listing.tags]
		.map(textOf)
		.filter((part) => part.length > 0)
		.join(' ');
}

export function matchesListingQuery(
	listing: PublicListingFields | null | undefined,
	query: string | null | undefined
): boolean {
	const trimmed = query?.trim() ?? '';
	if (!trimmed) return true;
	return textMatchesQuery(listingHaystack(listing), trimmed);
}

/**
 * Test events published while checking relays. Real titles that merely contain
 * "probe" (for example a soil probe) stay listed.
 */
export function isTestListingTitle(title: string | null | undefined): boolean {
	const normalized = (title ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
	if (!normalized) return false;
	if (normalized === 'probe') return true;
	if (normalized.includes('relay probe')) return true;
	if (normalized.includes('relay publish check')) return true;
	if (normalized.includes('auth url probe')) return true;
	if (normalized.includes('publish check')) return true;
	if (/\bprobe\b/.test(normalized) && /\b(relay|auth|publish|url)\b/.test(normalized)) return true;
	return false;
}

export function isCancelledTask(listing: PublicListingFields | null | undefined): boolean {
	return (listing?.status ?? '').trim().toUpperCase() === 'CANCELLED';
}

export function hasListableBudget(listing: PublicListingFields | null | undefined): boolean {
	const amount = listing?.budget?.amount;
	return typeof amount === 'number' && Number.isFinite(amount);
}

export function filterPublicTasks<T extends PublicListingFields>(
	tasks: readonly T[],
	query: string | null | undefined
): T[] {
	return tasks.filter(
		(task) =>
			hasListableBudget(task) &&
			!isCancelledTask(task) &&
			!isTestListingTitle(task.title) &&
			matchesListingQuery(task, query)
	);
}

export function filterPublicServices<T extends PublicListingFields>(
	services: readonly T[],
	query: string | null | undefined
): T[] {
	return services.filter(
		(service) => !isTestListingTitle(service.title) && matchesListingQuery(service, query)
	);
}

/** Compact stand-in when a service has no gallery image. A full-bleed hero is only for real media. */
export function serviceHeroLayout(imageCount: number): 'media' | 'compact' {
	return imageCount > 0 ? 'media' : 'compact';
}
