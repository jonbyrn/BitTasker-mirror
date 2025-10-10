/**
 * Cloudflare Pages Function to handle SvelteKit routing
 * This replicates the logic from workers-site/index.js
 */

export async function onRequest(context: {
    request: Request;
    next: () => Promise<Response>;
    env: { ASSETS: { fetch: (request: Request) => Promise<Response> } };
}) {
    const url = new URL(context.request.url);
    const pathname = url.pathname;

    // Check if this is a SvelteKit data request (__data.json)
    const isDataRequest = pathname.includes('/__data.json');

    // Check if this is an asset request (not a page navigation)
    const isAssetRequest =
        /\.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot|webp|txt|xml|pdf|map|wasm|mjs|json)$/i.test(
            pathname
        ) && !isDataRequest;

    // Try to serve the requested asset first
    const response = await context.next();

    // If we got a successful response, return it
    if (response.status !== 404) {
        return response;
    }

    // Handle 404 errors
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
            // Fetch index.html from the static assets
            const indexUrl = new URL('/index.html', url.origin);
            const indexRequest = new Request(indexUrl.toString(), {
                method: 'GET',
                headers: context.request.headers
            });

            const indexResponse = await context.env.ASSETS.fetch(indexRequest);

            // Clone the response body and return with 200 status
            return new Response(indexResponse.body, {
                status: 200,
                statusText: 'OK',
                headers: indexResponse.headers
            });
        } catch (err) {
            // Fallback: return a basic error page
            return new Response(
                '<html><body><h1>Error loading page</h1><p>Please try refreshing.</p></body></html>',
                {
                    status: 500,
                    headers: { 'Content-Type': 'text/html' }
                }
            );
        }
    }

    // For actual missing assets, return 404
    return response;
}

