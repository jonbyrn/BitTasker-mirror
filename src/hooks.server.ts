import type { Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
	const response = await resolve(event);
	
	// Prevent caching of HTML responses to avoid infinite loading loops
	response.headers.set('cache-control', 'no-cache, no-store, must-revalidate');
	response.headers.set('pragma', 'no-cache');
	response.headers.set('expires', '0');
	
	return response;
};
