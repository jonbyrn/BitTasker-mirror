import type { PageLoad } from './$types';

export const prerender = false;

export const load: PageLoad = async ({ params }) => {
	// Return the npub parameter to ensure it's available
	return {
		npub: params.npub
	};
};