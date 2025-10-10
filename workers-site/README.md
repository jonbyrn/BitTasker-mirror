# Cloudflare Workers Site

This directory contains the Cloudflare Worker script that serves the static SvelteKit build.

## Why Workers Instead of Pages?

This project uses Cloudflare Workers Sites (not Pages) because:

1. **Capacitor Compatibility**: Requires `@sveltejs/adapter-static` for mobile app builds
2. **Client-Side Routing**: SPA routing is handled by the Worker fallback to `404.html`
3. **Better Control**: More flexibility over serving static assets and routing logic

## How It Works

The Worker (`index.js`) does the following:

1. **Serves Static Assets**: Uses `@cloudflare/kv-asset-handler` to serve files from the `./build` directory
2. **SPA Fallback**: When a route is not found and it's an HTML request, it serves `404.html` with a 200 status
3. **Security Headers**: Adds security headers to all responses
4. **Caching**: Implements edge and browser caching for better performance

## Deployment

### Development Environment (worker.dev.bittasker.com)
```bash
npm run deploy:workers
```

### Production Environment (bittasker.com)
```bash
npm run deploy:workers:production
```

## Environment Variables

Environment variables are configured in the root `wrangler.toml` file under `[vars]` sections.

To add secrets (sensitive data):
```bash
wrangler secret put SECRET_NAME
```

## Custom Domains

After deploying, set up custom domains in the Cloudflare dashboard:

1. Go to **Workers & Pages** → **Your Worker** → **Settings** → **Triggers**
2. Add custom domain routes:
   - Dev: `worker.dev.bittasker.com/*`
   - Production: `bittasker.com/*`

## Troubleshooting

### Worker not updating after deployment
Clear the Cloudflare cache or wait a few minutes for propagation.

### 404 errors on dynamic routes
Ensure your SvelteKit build has a `404.html` file (configured in `svelte.config.js` with `fallback: '404.html'`).

### Environment variables not working
Make sure they're defined in `wrangler.toml` under the correct environment section.

