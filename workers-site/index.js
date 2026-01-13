import { getAssetFromKV } from '@cloudflare/kv-asset-handler';

addEventListener('fetch', (event) => {
	event.respondWith(handleRequest(event));
});

async function handleRequest(event) {
	const url = new URL(event.request.url);
	const pathname = url.pathname;
	
	// Check if this is a SvelteKit data request (__data.json)
	const isDataRequest = pathname.includes('/__data.json');
	
	// Check if this is an asset request (not a page navigation)
	const isAssetRequest = /\.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot|webp|txt|xml|pdf)$/i.test(pathname) && !isDataRequest;
	
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
	
	try {
		// Try to serve the requested asset
		const response = await getAssetFromKV(event, {
			cacheControl: {
				browserTTL: browserTTL,
				edgeTTL: edgeTTL,
				bypassCache: false,
			},
		});
		
		// Apply compression if supported and not already compressed
		return compressResponse(event.request, response);
	} catch (error) {
		// Handle 404 errors
		if (error.status === 404) {
			// For SvelteKit __data.json requests that don't exist, return empty object
			if (isDataRequest) {
				return new Response(JSON.stringify({ type: 'data', nodes: [{}] }), {
					status: 200,
					headers: {
						'Content-Type': 'application/json',
						'Cache-Control': 'no-store'
					}
				});
			}
			
			// For non-asset requests (page navigation), serve index.html
			if (!isAssetRequest) {
				try {
					const response = await getAssetFromKV(event, {
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
					return compressResponse(event.request, response);
				} catch (indexError) {
					return new Response('Application not found. Please ensure the app is built correctly.', { 
						status: 500,
						headers: { 'Content-Type': 'text/plain' }
					});
				}
			}
		}
		
		// For actual missing assets, return 404
		return new Response(`Asset not found: ${pathname}`, {
			status: 404,
			headers: { 'Content-Type': 'text/plain' }
		});
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
