import { getAllEntries } from '$lib/content/learn/slug-map';

export const prerender = true;
export const ssr = true;

/**
 * Explicitly list all locale + slug combinations for prerendering.
 * This avoids SvelteKit needing to crawl the dynamic route.
 */
export function entries() {
	return getAllEntries();
}
