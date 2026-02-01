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
2. **SPA Fallback**: When a route is not found, it serves `index.html` to enable client-side routing
3. **Caching**: Implements edge and browser caching for better performance

## Dependencies

Dependencies for the worker are managed in the root `package.json` file:
- `@cloudflare/kv-asset-handler`: Handles serving static assets from KV storage

## Deployment

### Development/Staging Environment
```bash
npm run deploy:workers
```
Deploys to: `worker.dev.bittasker.com` (worker: `bittasker-dev-worker`)

### Production Environment
```bash
npm run deploy:workers:production
```
Deploys to: `bittasker.com` (worker: `bittasker-prod-worker`)

**Note:** The deploy commands explicitly specify the environment using `--env=""` (for default) or `--env production` to avoid deployment ambiguity.

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

### Client-side env (`VITE_*`) when using `wrangler dev`

`VITE_*` variables are **baked into the client bundle at build time** by Vite. They are not read from the Worker env at runtime. So when you run `npx wrangler dev`, the browser receives the files from `build/`; if that folder was built without your `.env` (e.g. old build or CI), the client will see `undefined` for keys like `VITE_CLOUDFLARE_SITEKEY`.

**Fix:** Run a fresh build with your `.env` loaded, then start the Worker:

```bash
npm run build
npx wrangler dev
```

Then open the app in the browser; the built JS will have the correct `VITE_*` values inlined.

### Turnstile (captcha) slow or errors when using `wrangler dev`

When you run the app with `npx wrangler dev`, Turnstile may:

- **Take ~30 seconds to enable the sign-up button** after you pass the challenge (vs instant with `npm run dev`).
- Log in the console: `POST https://localhost:…/cdn-cgi/challenge-platform/… net::ERR_SSL_PROTOCOL_ERROR` and `[Cloudflare Turnstile] Error contacting Turnstile, aborting clearance redemption.`

**Why:** Turnstile tries to redeem the challenge by POSTing to your **page origin** at `/cdn-cgi/challenge-platform/…`. That path is normally handled by Cloudflare’s edge when the site is on a real Cloudflare-proxied domain. On localhost with wrangler dev there is no Cloudflare edge, so the POST fails (SSL or 404). Turnstile retries/timeouts (~30s) and then may still call your success callback, so the button eventually enables.

**What to do:** For normal local dev (Vite), use `npm run dev` so Turnstile behaves as expected. When testing the Worker locally with `wrangler dev`, either accept the delay or test Turnstile on a deployed URL (e.g. worker.dev.bittasker.com) where Cloudflare handles the challenge platform.
