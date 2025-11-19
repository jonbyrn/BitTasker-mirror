import type { PageLoad } from './$types';
import { browser } from '$app/environment';

// Capacitor/SSR note: Project uses Capacitor, so SSR is not possible
// All rendering is client-side only
export const prerender = false;
export const ssr = false;

export const load = (async ({ params }) => {
	// Validation happens in component since we're client-side only
	// Just return the npub param for use in component
	return {
		npub: params.npub
	};
}) satisfies PageLoad;

