import type { Attachment } from '$lib/types/task.d';

export const FEATURED_HOMEPAGE_LIMIT = 8;
export const FEATURED_HOMEPAGE_CACHE_TTL = 5 * 60 * 1000;

const featuredHomepageCache = new Map<string, { timestamp: number; data: unknown[] }>();

export interface FeaturedSectionState<T> {
	items: T[];
	loading: boolean;
	error: string | null;
	visible: boolean;
}

interface LoadFeaturedHomepageItemsOptions<T> {
	cacheKey: string;
	limit?: number;
	fetcher: () => Promise<T[]>;
	getId: (item: T) => string;
	sorter?: (a: T, b: T) => number;
}

/** Returns the canonical homepage section state before the async loader resolves. */
export function createFeaturedSectionState<T>(): FeaturedSectionState<T> {
	return {
		items: [],
		loading: true,
		error: null,
		visible: true
	};
}

/** Finalizes a homepage section state and optionally hides it when empty or errored. */
export function completeFeaturedSectionState<T>(
	items: T[],
	error: string | null,
	options: { hideWhenEmpty?: boolean } = {}
): FeaturedSectionState<T> {
	const shouldHide = Boolean(options.hideWhenEmpty) && (error !== null || items.length === 0);

	return {
		items,
		error,
		loading: false,
		visible: !shouldHide
	};
}

/**
 * Loads, sorts, deduplicates, caches, and caps featured homepage items for a single section.
 */
export async function loadFeaturedHomepageItems<T>({
	cacheKey,
	limit = FEATURED_HOMEPAGE_LIMIT,
	fetcher,
	getId,
	sorter
}: LoadFeaturedHomepageItemsOptions<T>): Promise<T[]> {
	const cached = featuredHomepageCache.get(cacheKey);
	if (cached && Date.now() - cached.timestamp < FEATURED_HOMEPAGE_CACHE_TTL) {
		return (cached.data as T[]).slice(0, limit);
	}

	const fetchedItems = await fetcher();
	const sortedItems = sorter ? [...fetchedItems].sort(sorter) : [...fetchedItems];
	const dedupedItems = dedupeFeaturedItems(sortedItems, getId);
	const limitedItems = dedupedItems.slice(0, limit);

	featuredHomepageCache.set(cacheKey, {
		timestamp: Date.now(),
		data: dedupedItems
	});

	return limitedItems;
}

/** Clears the shared featured-homepage cache for one section or every section. */
export function clearFeaturedHomepageCache(cacheKey?: string): void {
	if (cacheKey) {
		featuredHomepageCache.delete(cacheKey);
		return;
	}

	featuredHomepageCache.clear();
}

/** Returns true when the provided attachment list contains at least one image URL. */
export function hasImageAttachment(attachments?: Attachment[] | null): boolean {
	if (!attachments?.length) {
		return false;
	}

	return attachments.some((attachment) => isImageUrl(attachment?.url));
}

/** Returns the first usable image URL for a featured homepage card. */
export function getFirstImageUrl(attachments?: Attachment[] | null): string {
	if (!attachments?.length) {
		return '';
	}

	const imageAttachment = attachments.find((attachment) => isImageUrl(attachment?.url));
	return imageAttachment?.url ?? '';
}

function dedupeFeaturedItems<T>(items: T[], getId: (item: T) => string): T[] {
	const seenIds = new Set<string>();
	const dedupedItems: T[] = [];

	for (const item of items) {
		const id = getId(item);
		if (!id || seenIds.has(id)) {
			continue;
		}

		seenIds.add(id);
		dedupedItems.push(item);
	}

	return dedupedItems;
}

function isImageUrl(url?: string): boolean {
	if (!url) {
		return false;
	}

	const lowerUrl = url.toLowerCase();
	return ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'].some((extension) =>
		lowerUrl.includes(extension)
	);
}
