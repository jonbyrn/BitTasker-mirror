import type { RequestHandler } from '@sveltejs/kit';

export const GET: RequestHandler = async () => {
	// Return an empty JSON object with proper content-type
	return new Response(JSON.stringify({}), {
		headers: {
			'Content-Type': 'application/json'
		}
	});
}; 