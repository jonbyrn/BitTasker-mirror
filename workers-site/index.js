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
	
	try {
		// Try to serve the requested asset
		return await getAssetFromKV(event, {
			cacheControl: {
				browserTTL: 60 * 60 * 24 * 30, // 30 days
				edgeTTL: 60 * 60 * 24 * 30,
				bypassCache: false,
			},
		});
	} catch (error) {
		// Handle 404 errors
		if (error.status === 404) {
			// For SvelteKit __data.json requests that don't exist, return empty object
			// This allows CSR-only pages to work
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
					return await getAssetFromKV(event, {
						mapRequestToAsset: (req) => {
							const url = new URL(req.url);
							url.pathname = '/index.html';
							return new Request(url.toString(), req);
						},
						cacheControl: {
							browserTTL: 60 * 60 * 24 * 30,
							edgeTTL: 60 * 60 * 24 * 30,
							bypassCache: false,
						},
					});
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