import { getAssetFromKV } from '@cloudflare/kv-asset-handler';
import puppeteer from '@cloudflare/puppeteer';

const PRERENDER_BYPASS_HEADER = 'x-prerender-bypass';
const PRERENDERED_HEADER = 'x-prerendered';

const TRACKING_QUERY_PARAMS = [
	'fbclid',
	'gclid',
	'mc_cid',
	'mc_eid'
];

const TRACKING_QUERY_PREFIXES = ['utm_'];

const BOT_UA_RE =
	/(googlebot|bingbot|duckduckbot|yandex(bot)?|baiduspider|slurp|twitterbot|facebookexternalhit|linkedinbot|slackbot|discordbot|applebot|embedly|pinterest(bot)?)/i;

// Debug mode allowlist (to avoid leaking internals in production).
// Enable by sending `X-Prerender-Debug: 1` and hitting an allowlisted hostname.
const DEBUG_ALLOWED_HOSTS = new Set([
	// Staging worker hostname(s)
	'worker.dev.bittasker.com',
	'worker.staging.bittasker.com'
]);
const DEBUG_ALLOWED_HOST_SUFFIXES = ['.pages.dev'];

// Query abuse guards (defense-in-depth)
const MAX_QUERY_STRING_LENGTH = 512;
const MAX_QUERY_PARAMS = 12;
const MAX_QUERY_VALUE_LENGTH = 200;

// Keep this allowlist tight: only routes that should be "stable" for SEO.
const STATIC_MARKETING_PATHS = new Set([
	'/',
	'/about',
	'/careers',
	'/community-guidelines',
	'/contact',
	'/faq',
	'/how-it-works',
	'/press',
	'/privacy',
	'/security',
	'/secure-payments',
	'/taskee-fees',
	'/tasker-fees',
	'/tasker-principles',
	'/terms',
	'/ab-25-contest'
]);

function isHtmlNavigationRequest(request) {
	if (request.method !== 'GET') return false;
	const accept = request.headers.get('Accept') || '';
	// Require explicit HTML accept (reduces false positives)
	return accept.includes('text/html') || accept.includes('application/xhtml+xml');
}

function isBotRequest(request) {
	const ua = request.headers.get('User-Agent') || '';
	return BOT_UA_RE.test(ua);
}

function hasSensitiveHeaders(request) {
	// Prevent caching personalized content.
	return Boolean(request.headers.get('Cookie') || request.headers.get('Authorization'));
}

function shouldNeverPrerender(pathname) {
	// Avoid auth/protected and internal paths.
	if (pathname.startsWith('/_app/')) return true;
	if (pathname.startsWith('/dashboard')) return true;
	if (pathname.startsWith('/auth')) return true;
	if (pathname.startsWith('/verify-email')) return true;
	if (pathname.startsWith('/api/')) return true;
	return false;
}

function allowedQueryParamsForPath(pathname) {
	// Only include query params that are actually used by the public routes we prerender.
	// This prevents cache-busting via fake/pointless query params.
	//
	// Identified in this repo:
	// - `search` is referenced in SEO SearchAction (`seo.constants.ts`) as `/tasks?search=...`
	// - most other query params are used in /dashboard or /auth flows (which are denied)
	if (pathname.startsWith('/tasks')) return new Set(['search']);
	// Marketing pages: do not vary by query params
	if (STATIC_MARKETING_PATHS.has(pathname)) return new Set();
	// Default: no query params
	return new Set();
}

function normalizeSearchParams(searchParams, pathname) {
	// Remove tracking params (utm_*, gclid, fbclid, etc.), drop unknown params, and sort.
	const allowed = allowedQueryParamsForPath(pathname);
	const cleaned = new URLSearchParams();
	for (const [key, value] of searchParams.entries()) {
		const lowerKey = key.toLowerCase();
		if (TRACKING_QUERY_PARAMS.includes(lowerKey)) continue;
		if (TRACKING_QUERY_PREFIXES.some((p) => lowerKey.startsWith(p))) continue;

		// Drop unknown params
		if (!allowed.has(key)) continue;

		// Abuse guard: skip extremely long values
		if (value.length > MAX_QUERY_VALUE_LENGTH) continue;

		cleaned.append(key, value);
	}
	// Sort by key for stable cache keys
	const sorted = new URLSearchParams();
	for (const key of Array.from(cleaned.keys()).sort()) {
		for (const value of cleaned.getAll(key)) sorted.append(key, value);
	}
	return sorted;
}

function classifyTtlSeconds(url) {
	// Dynamic pages: 1 hour
	// Static marketing pages: 24 hours
	const pathname = url.pathname;
	const normalizedParams = normalizeSearchParams(url.searchParams, pathname);
	const hasQuery = Array.from(normalizedParams.keys()).length > 0;

	if (pathname.startsWith('/tasks')) return 60 * 60;
	if (hasQuery) return 60 * 60;

	if (STATIC_MARKETING_PATHS.has(pathname)) return 60 * 60 * 24;

	// Safe default: 1 hour
	return 60 * 60;
}

function buildPrerenderCacheKey(originalUrl) {
	const cacheUrl = new URL(originalUrl.toString());
	const normalizedParams = normalizeSearchParams(cacheUrl.searchParams, cacheUrl.pathname);
	cacheUrl.search = normalizedParams.toString();

	// Prevent collisions with real routes and allow future invalidation schemes.
	cacheUrl.pathname = `/__prerender__${cacheUrl.pathname}`;
	return new Request(cacheUrl.toString(), { method: 'GET' });
}

function withAddedHeaders(response, headers) {
	const newHeaders = new Headers(response.headers);
	for (const [k, v] of Object.entries(headers)) newHeaders.set(k, v);
	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers: newHeaders
	});
}

function isDebugEnabled(url, request) {
	const debugRequested = request.headers.get('X-Prerender-Debug') === '1';
	if (!debugRequested) return false;
	const hostname = url.hostname;
	if (DEBUG_ALLOWED_HOSTS.has(hostname)) return true;
	return DEBUG_ALLOWED_HOST_SUFFIXES.some((suffix) => hostname.endsWith(suffix));
}

function withDebugHeaders(response, debugInfo) {
	return withAddedHeaders(response, {
		'X-Prerender-Debug': '1',
		...debugInfo
	});
}

async function renderHtmlSnapshot(targetUrl, env) {
	if (!env?.BROWSER) {
		throw new Error('Browser Rendering binding (env.BROWSER) not configured');
	}

	const browser = await puppeteer.launch(env.BROWSER);
	try {
		const page = await browser.newPage();
		// Prevent recursion: all requests from the renderer carry bypass header.
		await page.setExtraHTTPHeaders({ [PRERENDER_BYPASS_HEADER]: '1' });

		await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });

		// Wait for at least one key SEO tag. If it never appears, we still snapshot.
		try {
			// Prefer explicit app-level ready flag (set globally by the app)
			await page.waitForFunction('window.__PRERENDER_READY__ === true', { timeout: 10_000 });
		} catch {
			// Fallback: wait for a minimal head signal
			try {
				await page.waitForSelector('meta[name="description"][content], link[rel="canonical"][href], title', {
					timeout: 5_000
				});
			} catch {
				// ignore
			}
		} catch {
			// ignore
		}

		return await page.content();
	} finally {
		await browser.close();
	}
}

async function handleRequest(request, env, ctx) {
	const url = new URL(request.url);
	const pathname = url.pathname;
	const debugEnabled = isDebugEnabled(url, request);
	
	// Check if this is a SvelteKit data request (__data.json)
	const isDataRequest = pathname.includes('/__data.json');
	
	// Check if this is an asset request (not a page navigation)
	const isAssetRequest = /\.(js|mjs|cjs|css|map|wasm|json|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot|otf|webp|avif|txt|xml|pdf|zip|gz|br|mp4|webm|mp3|wav|ogg)$/i.test(pathname) && !isDataRequest;
	
	// Check if this is an immutable asset (hashed filename in _app/immutable/)
	const isImmutableAsset = pathname.includes('/_app/immutable/');
	
	// Determine cache TTLs
	const htmlBrowserTTL = 60 * 30;              // 30 minutes for HTML browser cache
	const htmlEdgeTTL = 60 * 60 * 24 * 7;        // 7 days for HTML edge cache
	const immutableBrowserTTL = 60 * 60 * 24 * 30; // 30 days for immutable assets browser
	const immutableEdgeTTL = 60 * 60 * 24 * 30;    // 30 days for immutable assets edge
	const staticBrowserTTL = 60 * 60 * 24 * 7;     // 7 days for other static assets browser
	const staticEdgeTTL = 60 * 60 * 24 * 30;       // 30 days for other static assets edge
	
	// Determine cache TTL based on file type
	let browserTTL, edgeTTL;
	if (isImmutableAsset) {
		browserTTL = immutableBrowserTTL;
		edgeTTL = immutableEdgeTTL;
	} else if (isAssetRequest) {
		browserTTL = staticBrowserTTL;
		edgeTTL = staticEdgeTTL;
	} else {
		// HTML files
		browserTTL = htmlBrowserTTL;
		edgeTTL = htmlEdgeTTL;
	}

	// Bot-only prerender: serve rendered HTML snapshots with TTL-based edge caching.
	// This runs BEFORE getAssetFromKV fallback-to-index.html behavior.
	const bypassRequested =
		request.headers.get(PRERENDER_BYPASS_HEADER) === '1' ||
		request.headers.get(PRERENDERED_HEADER) === '1';

	// Abuse guard: extremely long query strings / too many params -> don't prerender
	const rawQuery = url.search || '';
	const rawParamsCount = Array.from(url.searchParams.keys()).length;
	const queryLooksAbusive =
		rawQuery.length > MAX_QUERY_STRING_LENGTH || rawParamsCount > MAX_QUERY_PARAMS;

	// Determine why we might skip prerender (for debug visibility).
	let skipReason = null;
	if (bypassRequested) skipReason = 'bypass';
	else if (isAssetRequest) skipReason = 'asset';
	else if (isDataRequest) skipReason = 'data';
	else if (!isHtmlNavigationRequest(request)) skipReason = 'not_html_accept';
	else if (!isBotRequest(request)) skipReason = 'not_bot';
	else if (hasSensitiveHeaders(request)) skipReason = 'sensitive_headers';
	else if (shouldNeverPrerender(pathname)) skipReason = 'denied_path';
	else if (queryLooksAbusive) skipReason = 'abusive_query';

	const shouldAttemptPrerender = skipReason === null;

	if (shouldAttemptPrerender) {
		const ttlSeconds = classifyTtlSeconds(url);
		const cacheKey = buildPrerenderCacheKey(url);

		const cached = await caches.default.match(cacheKey);
		if (cached) {
			const hit = withAddedHeaders(cached, {
				'X-Prerender': '1',
				'X-Prerender-Cache': 'HIT',
				'X-Prerender-TTL': String(ttlSeconds),
				[PRERENDERED_HEADER]: '1'
			});
			const compressed = compressResponse(request, hit);
			return debugEnabled
				? withDebugHeaders(compressed, {
						'X-Prerender-Decision': 'HIT',
						'X-Prerender-Host': url.hostname
					})
				: compressed;
		}

		try {
			const html = await renderHtmlSnapshot(url.toString(), env);
			const responseToCache = new Response(html, {
				status: 200,
				headers: {
					'Content-Type': 'text/html; charset=UTF-8',
					// Cache at edge for bots; browsers don't need to cache this response.
					'Cache-Control': `public, max-age=0, s-maxage=${ttlSeconds}`,
					'X-Prerender': '1',
					'X-Prerender-Cache': 'MISS',
					'X-Prerender-TTL': String(ttlSeconds),
					[PRERENDERED_HEADER]: '1'
				}
			});

			// Store a clone; Cache API requires the response body be unused.
			ctx.waitUntil(caches.default.put(cacheKey, responseToCache.clone()));
			const compressed = compressResponse(request, responseToCache);
			return debugEnabled
				? withDebugHeaders(compressed, {
						'X-Prerender-Decision': 'MISS',
						'X-Prerender-Host': url.hostname
					})
				: compressed;
		} catch (err) {
			// If rendering fails, fall back to normal SPA behavior.
			const message = err instanceof Error ? err.message : String(err);
			console.error('[Prerender] failed:', message);
			// In debug mode, surface a short error hint for curl.
			if (debugEnabled) {
				skipReason = 'render_error';
			}
		}
	}
	
	try {
		const cfEvent = {
			request,
			waitUntil: (promise) => ctx.waitUntil(promise)
		};

		// Try to serve the requested asset
		const response = await getAssetFromKV(cfEvent, {
			cacheControl: {
				browserTTL: browserTTL,
				edgeTTL: edgeTTL,
				bypassCache: false,
			},
		});
		
		// Apply compression if supported and not already compressed
		const compressed = compressResponse(request, response);
		return debugEnabled
			? withDebugHeaders(compressed, {
					'X-Prerender-Decision': 'SKIP',
					'X-Prerender-Skip-Reason': skipReason || 'unknown',
					'X-Prerender-Host': url.hostname
				})
			: compressed;
	} catch (error) {
		// Handle 404 errors
		if (error.status === 404) {
			// For SvelteKit __data.json requests that don't exist, return empty object
			if (isDataRequest) {
				const r = new Response(JSON.stringify({ type: 'data', nodes: [{}] }), {
					status: 200,
					headers: {
						'Content-Type': 'application/json',
						'Cache-Control': 'no-store'
					}
				});
				return debugEnabled
					? withDebugHeaders(r, {
							'X-Prerender-Decision': 'SKIP',
							'X-Prerender-Skip-Reason': 'data_404_fallback',
							'X-Prerender-Host': url.hostname
						})
					: r;
			}
			
			// For non-asset requests (page navigation), serve index.html
			if (!isAssetRequest) {
				try {
					const cfEvent = {
						request,
						waitUntil: (promise) => ctx.waitUntil(promise)
					};
					const response = await getAssetFromKV(cfEvent, {
						mapRequestToAsset: (req) => {
							const url = new URL(req.url);
							url.pathname = '/index.html';
							return new Request(url.toString(), req);
						},
						cacheControl: {
							browserTTL: htmlBrowserTTL,
							edgeTTL: htmlEdgeTTL,
							bypassCache: false,
						},
					});
					const compressed = compressResponse(request, response);
					return debugEnabled
						? withDebugHeaders(compressed, {
								'X-Prerender-Decision': 'SKIP',
								'X-Prerender-Skip-Reason': skipReason || 'spa_fallback',
								'X-Prerender-Host': url.hostname
							})
						: compressed;
				} catch (indexError) {
					const r = new Response('Application not found. Please ensure the app is built correctly.', { 
						status: 500,
						headers: { 'Content-Type': 'text/plain' }
					});
					return debugEnabled
						? withDebugHeaders(r, {
								'X-Prerender-Decision': 'ERROR',
								'X-Prerender-Skip-Reason': 'index_not_found',
								'X-Prerender-Host': url.hostname
							})
						: r;
				}
			}
		}
		
		// For actual missing assets, return 404
		const r = new Response(`Asset not found: ${pathname}`, {
			status: 404,
			headers: { 'Content-Type': 'text/plain' }
		});
		return debugEnabled
			? withDebugHeaders(r, {
					'X-Prerender-Decision': 'SKIP',
					'X-Prerender-Skip-Reason': 'asset_404',
					'X-Prerender-Host': url.hostname
				})
			: r;
	}
}

// Compression helper function
function compressResponse(request, response) {
	// Check if client supports compression
	const acceptEncoding = request.headers.get('Accept-Encoding') || '';
	const supportsBrotli = acceptEncoding.includes('br');
	const supportsGzip = acceptEncoding.includes('gzip');
	
	// Don't compress if already compressed or if no compression supported
	if (response.headers.get('Content-Encoding') || (!supportsBrotli && !supportsGzip)) {
		return response;
	}
	
	// Don't compress small files (< 1KB) or already compressed types
	const contentType = response.headers.get('Content-Type') || '';
	const shouldCompress = response.body && 
		!contentType.includes('image/') && 
		!contentType.includes('font/') && 
		!contentType.includes('video/') &&
		!contentType.includes('audio/');
	
	if (!shouldCompress) {
		return response;
	}
	
	// Choose compression format (prefer Brotli)
	const encoding = supportsBrotli ? 'br' : 'gzip';
	const compressionStream = new CompressionStream(encoding);
	
	// Create new response with compression
	const compressedBody = response.body.pipeThrough(compressionStream);
	
	return new Response(compressedBody, {
		status: response.status,
		statusText: response.statusText,
		headers: {
			...Object.fromEntries(response.headers),
			'Content-Encoding': encoding,
			'Vary': 'Accept-Encoding'
		}
	});
}

export default {
	async fetch(request, env, ctx) {
		return handleRequest(request, env, ctx);
	}
};
