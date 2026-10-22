/**
 * BitTasker - Cloudflare Workers Static Assets
 *
 * Serves the SvelteKit build with prerendered public pages and
 * SPA fallback for client-side routed pages.
 *
 * Prerendered pages (/, /about, /faq, etc.) have real HTML content
 * for SEO. Non-prerendered routes (/dashboard, /auth, etc.) fall
 * through to Cloudflare's SPA fallback (not_found_handling = "single-page-application")
 * which serves index.html where SvelteKit's client-side router takes over.
 *
 * API routes run before the static asset lookup:
 *   /api/cloudflare/stream/* - upload URLs, signed tokens, status
 *   /api/cloudflare/images/* - (future) direct image upload URLs
 *   /api/explorer/rsk/v2/*     - Blockscout proxy (RSK mainnet)
 *   /api/explorer/rsk-testnet/v2/* - Blockscout proxy (RSK testnet)
 *   /api/changelly/fiat/*  - Changelly fiat on/off-ramp proxy
 *   /api/search/*          - Search API. Meilisearch while SEARCH_PROVIDER=meilisearch.
 *                            Typesense only when TYPESENSE_HOST is set.
 *   /api/qvac/*            - Sandbox proxy to a self-hosted QVAC server. Off unless QVAC_ENABLED=true.
 *   /__data.json wildcards   - SvelteKit client-side navigation preload
 */

import { handleStreamRoute } from './handlers/stream.js';
import { handleExplorerRoute } from './handlers/explorer.js';
import { handleChangellyFiatRoute } from './handlers/changelly-fiat.js';
import { handleSearchRequest } from '../src/lib/search/http.js';
import { spaShellStatus } from '../src/lib/routing/known-routes.js';
import { handleQvacRoute } from './handlers/qvac.js';

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

		if (pathname.startsWith('/api/explorer/')) {
			return handleExplorerRoute(request);
		}

		// Changelly fiat API proxy
		if (pathname.startsWith('/api/changelly/fiat/')) {
			return handleChangellyFiatRoute(request, env);
		}

		// In-app search. Meilisearch is the rollback provider until Typesense is configured.
		if (pathname === '/api/search' || pathname.startsWith('/api/search/')) {
			return handleSearchRequest(request, env);
		}

		// Local model proxy. Production leaves QVAC_ENABLED unset, so this is a 404 there.
		if (pathname.startsWith('/api/qvac/')) {
			return handleQvacRoute(request, env);
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

		// Static assets — if not found, serve SPA fallback for client-side routing.
		// With not_found_handling = "single-page-application", Cloudflare serves index.html
		// automatically. This worker fallback is a safety net for edge cases.
		const response = await env.ASSETS.fetch(request);
		if (response.status === 404) {
			const status = spaShellStatus(pathname);
			if (status == null) return response;
			const fallbackUrl = new URL('/index.html', url.origin);
			const fallbackResponse = await env.ASSETS.fetch(new Request(fallbackUrl, request));
			if (fallbackResponse.status !== 404) {
				return new Response(fallbackResponse.body, {
					status,
					headers: fallbackResponse.headers
				});
			}
		}
		return response;
	},

	async scheduled(event, env, ctx) {
		ctx.waitUntil(cleanupAbandonedUploads(env));
	}
};
