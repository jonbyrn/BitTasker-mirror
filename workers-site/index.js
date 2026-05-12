/**
 * BitTasker - Cloudflare Workers Static Assets
 *
 * Serves the SvelteKit SPA build with platform-level SPA fallback
 * (not_found_handling = "single-page-application").
 *
 * API routes run before the fallback:
 *   /api/cloudflare/stream/* - upload URLs, signed tokens, status
 *   /api/cloudflare/images/* - (future) direct image upload URLs
 *   /__data.json wildcards   - SvelteKit client-side navigation preload
 */

import { handleStreamRoute } from './handlers/stream.js';

export default {
	async fetch(request, env) {
		const url = new URL(request.url);
		const pathname = url.pathname;

		// API routes - checked first so they never hit the SPA fallback
		if (pathname.startsWith('/api/cloudflare/stream/')) {
			return handleStreamRoute(request, env);
		}

		// Future images endpoint
		if (pathname.startsWith('/api/cloudflare/images/')) {
			return new Response(
				JSON.stringify({
					error: { code: 'NOT_IMPLEMENTED', message: 'Images direct upload coming soon' }
				}),
				{ status: 501, headers: { 'Content-Type': 'application/json' } }
			);
		}

		// SvelteKit client-side navigation data requests
		// With adapter-static there are no server-rendered data files
		if (pathname.includes('/__data.json')) {
			return new Response(JSON.stringify({ type: 'data', nodes: [{}] }), {
				headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
			});
		}

		// Static assets - unmatched routes get index.html via SPA fallback
		return env.ASSETS.fetch(request);
	}
};
