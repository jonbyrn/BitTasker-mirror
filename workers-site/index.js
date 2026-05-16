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

/**
 * Weekly cleanup: delete abandoned Stream videos stuck in pendingupload state.
 * Runs Sunday 3am UTC via cron trigger in wrangler.toml.
 */
async function cleanupAbandonedUploads(env) {
	const ACCOUNT_ID = env.CLOUDFLARE_ACCOUNT_ID;
	const API_TOKEN = env.CLOUDFLARE_API_TOKEN;
	if (!ACCOUNT_ID || !API_TOKEN) return;

	const base = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/stream`;

	try {
		// List recent videos
		const listRes = await fetch(`${base}?limit=100&asc=false`, {
			headers: { Authorization: `Bearer ${API_TOKEN}` }
		});
		const listData = await listRes.json();
		const videos = listData?.result || [];

		let deleted = 0;
		const cutoff = Date.now() - 24 * 60 * 60 * 1000; // 24 hours ago

		for (const video of videos) {
			const isStuck = video.status?.state === 'pendingupload';
			const uploadedAt = new Date(video.uploaded || video.created).getTime();
			if (isStuck && uploadedAt < cutoff) {
				await fetch(`${base}/${video.uid}`, {
					method: 'DELETE',
					headers: { Authorization: `Bearer ${API_TOKEN}` }
				});
				deleted++;
			}
		}

		if (deleted > 0) {
			console.log(`cleanup: deleted ${deleted} abandoned uploads`);
		}
	} catch (e) {
		console.error('cleanup: failed', e.message);
	}
}

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
	},

	async scheduled(event, env, ctx) {
		ctx.waitUntil(cleanupAbandonedUploads(env));
	}
};
