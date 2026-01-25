import { getAssetFromKV, serveSinglePageApp, NotFoundError } from '@cloudflare/kv-asset-handler';

addEventListener('fetch', (event) => {
	event.respondWith(handleRequest(event));
});

/**
 * Structured logging helper for observability
 * Logs are automatically collected by Cloudflare Workers Logs
 */
function logEvent(event, data = {}) {
	const logEntry = {
		event,
		timestamp: new Date().toISOString(),
		...data
	};
	
	// Use console.log for structured logging (automatically captured by Workers Logs)
	console.log(JSON.stringify(logEntry));
}

/**
 * Error logging helper with context
 */
function logError(error, context = {}) {
	const errorEntry = {
		event: 'error',
		error: {
			message: error.message,
			stack: error.stack,
			status: error.status || 'unknown'
		},
		timestamp: new Date().toISOString(),
		...context
	};
	
	console.error(JSON.stringify(errorEntry));
}

async function handleRequest(event) {
	const requestStartTime = Date.now();
	const url = new URL(event.request.url);
	const pathname = url.pathname;
	const method = event.request.method;
	const userAgent = event.request.headers.get('User-Agent') || 'unknown';
	const cfRay = event.request.headers.get('CF-Ray') || 'unknown';
	
	// Request classification
	const isDataRequest = pathname.includes('/__data.json');
	const isAssetRequest = /\.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot|webp|txt|xml|pdf)$/i.test(pathname) && !isDataRequest;
	const isImmutableAsset = pathname.includes('/_app/immutable/');
	const requestType = isDataRequest ? 'data' : isAssetRequest ? 'asset' : 'page';
	
	// Log request start (only for non-asset requests to reduce log volume)
	if (!isAssetRequest) {
		logEvent('request_start', {
			method,
			pathname,
			requestType,
			cfRay,
			userAgent: userAgent.substring(0, 100) // Truncate for privacy
		});
	}
	
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
	
	try {
		const kvStartTime = Date.now();
		
		// Use serveSinglePageApp so "/" and all SPA routes map to index.html before lookup.
		// This fixes "Asset not found: /" when visiting the root path.
		const response = await getAssetFromKV(event, {
			mapRequestToAsset: serveSinglePageApp,
			cacheControl: {
				browserTTL: browserTTL,
				edgeTTL: edgeTTL,
				bypassCache: false,
			},
		});
		
		const kvDuration = Date.now() - kvStartTime;
		const totalDuration = Date.now() - requestStartTime;
		
		// Get cache status from response headers
		const cacheStatus = response.headers.get('CF-Cache-Status') || 'unknown';
		const contentType = response.headers.get('Content-Type') || 'unknown';
		const contentLength = response.headers.get('Content-Length') || 'unknown';
		
		// Log successful response (only for non-asset requests)
		if (!isAssetRequest) {
			logEvent('request_success', {
				method,
				pathname,
				requestType,
				status: response.status,
				cacheStatus,
				contentType,
				contentLength,
				kvDuration_ms: kvDuration,
				totalDuration_ms: totalDuration,
				cfRay
			});
		}
		
		// Apply compression if supported and not already compressed
		const compressedResponse = await compressResponse(event.request, response);
		
		// Log compression if applied
		if (compressedResponse.headers.get('Content-Encoding')) {
			const compressionRatio = contentLength !== 'unknown' 
				? ((1 - (compressedResponse.headers.get('Content-Length') || contentLength) / contentLength) * 100).toFixed(2)
				: 'unknown';
			
			if (!isAssetRequest) {
				logEvent('compression_applied', {
					pathname,
					encoding: compressedResponse.headers.get('Content-Encoding'),
					compressionRatio: compressionRatio !== 'unknown' ? `${compressionRatio}%` : 'unknown',
					cfRay
				});
			}
		}
		
		return compressedResponse;
	} catch (error) {
		const totalDuration = Date.now() - requestStartTime;
		const isNotFound = error?.status === 404 || error instanceof NotFoundError;
		
		// Handle 404 errors
		if (isNotFound) {
			// For SvelteKit __data.json requests that don't exist, return empty object
			if (isDataRequest) {
				logEvent('data_request_missing', {
					pathname,
					duration_ms: totalDuration,
					cfRay
				});
				
				return new Response(JSON.stringify({ type: 'data', nodes: [{}] }), {
					status: 200,
					headers: {
						'Content-Type': 'application/json',
						'Cache-Control': 'no-store'
					}
				});
			}
			
			// For non-asset requests (page navigation), serve index.html
			// Note: This should rarely be reached since serveSinglePageApp already maps routes to index.html
			// This is a safety fallback in case serveSinglePageApp doesn't catch something
			if (!isAssetRequest) {
				try {
					const indexStartTime = Date.now();
					const indexResponse = await getAssetFromKV(event, {
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
					
					const indexDuration = Date.now() - indexStartTime;
					
					logEvent('spa_fallback', {
						pathname,
						fallbackTo: '/index.html',
						indexDuration_ms: indexDuration,
						totalDuration_ms: totalDuration,
						cfRay
					});
					
					return await compressResponse(event.request, indexResponse);
				} catch (indexError) {
					logError(indexError, {
						pathname,
						errorType: 'index_not_found',
						duration_ms: totalDuration,
						cfRay
					});
					
					return new Response('Application not found. Please ensure the app is built correctly.', { 
						status: 500,
						headers: { 'Content-Type': 'text/plain' }
					});
				}
			}
		}
		
		// Log 404 errors for missing assets
		if (isNotFound && isAssetRequest) {
			logEvent('asset_not_found', {
				pathname,
				requestType: 'asset',
				duration_ms: totalDuration,
				cfRay
			});
		} else if (!isNotFound) {
			// Log non-404 errors
			logError(error, {
				pathname,
				method,
				requestType,
				duration_ms: totalDuration,
				cfRay
			});
		}
		
		// For actual missing assets, return 404
		return new Response(`Asset not found: ${pathname}`, {
			status: 404,
			headers: { 'Content-Type': 'text/plain' }
		});
	}
}

// Compression helper function
async function compressResponse(request, response) {
	// Check if client supports gzip (Workers CompressionStream supports gzip/deflate only, not Brotli)
	const acceptEncoding = request.headers.get('Accept-Encoding') || '';
	const supportsGzip = acceptEncoding.includes('gzip');
	
	// Don't compress if already compressed or if no gzip support
	if (response.headers.get('Content-Encoding') || !supportsGzip) {
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
	
	// Check if we're in dev mode first (before reading body)
	// In dev mode (wrangler dev), Miniflare may handle compression differently
	// Skip compression in dev to avoid double-compression issues
	const url = new URL(request.url);
	const isDevMode = url.hostname === 'localhost' || url.hostname.includes('127.0.0.1');
	
	if (isDevMode) {
		// In dev mode, return uncompressed to avoid double-compression
		// Miniflare may pre-compress assets, so we skip our compression
		return response;
	}
	
	// Production: compress the content
	// Read body into memory for compression (acceptable for static assets)
	try {
		const bodyArrayBuffer = await response.arrayBuffer();
		const encoding = 'gzip';
		const compressionStream = new CompressionStream(encoding);
		const stream = new ReadableStream({
			start(controller) {
				controller.enqueue(bodyArrayBuffer);
				controller.close();
			}
		});
		const compressedBody = stream.pipeThrough(compressionStream);
		
		return new Response(compressedBody, {
			status: response.status,
			statusText: response.statusText,
			headers: {
				...Object.fromEntries(response.headers),
				'Content-Encoding': 'gzip',
				'Vary': 'Accept-Encoding'
			}
		});
	} catch (error) {
		// If check fails, return original response (safer than double-compressing)
		console.warn('Failed to check/compress response:', error);
		return response;
	}
}
