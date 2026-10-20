# Cloudflare Worker (Static Assets + API)

This directory contains the Cloudflare Worker script that runs alongside the static SvelteKit build.

## Architecture Overview

The Worker runs on the edge using **Cloudflare Workers Static Assets** (not Workers Sites / `@cloudflare/kv-asset-handler`, which is deprecated in Wrangler v4).

### How It Works

1. **Static Assets** — The SvelteKit build output in `./build/` is served directly from Cloudflare's edge cache via the `[assets]` configuration in `wrangler.toml`. Static files never hit the Worker, so there are no Worker invocation fees for assets.

2. **API-first Routing** — Certain paths are configured with `run_worker_first` so they always hit the Worker before the static asset fallback:

   - `/api/*` — Stream upload, token, and status endpoints
   - `/__data.json` and wildcards — SvelteKit client-side navigation preload
   - All other paths serve static files from the edge cache directly

3. **SPA Fallback** — When a route doesn't match a static file, `not_found_handling = "single-page-application"` serves `index.html` automatically, enabling client-side routing without Worker involvement.

### Worker Responsibilities

The Worker (`index.js`) handles:

- **`/api/cloudflare/stream/`** — Cloudflare Stream integration:
  - `POST /upload-url` — Generate one-time direct creator upload URLs
  - `GET /token/:uid` — Generate signed playback JWTs for private videos
  - `GET /status/:uid` — Poll video encoding status (backed by KV)
  - `POST /webhook` — Receive encoding state change notifications (HMAC-signed)
- **`/api/cloudflare/images/`** — (Future) Direct image upload URLs
- **`/__data.json`** — Returns empty SvelteKit data response (adapter-static has no SSR)

This approach keeps the Worker lightweight: only API requests and SvelteKit navigation data requests invoke it. Everything else is served directly from Cloudflare's edge — faster, cheaper, and with unlimited request volume.

## Dependencies

Worker dependencies are managed in the root `package.json`:

- No `@cloudflare/kv-asset-handler` — static assets are handled natively by `[assets]` configuration
- KV bindings (`VIDEO_STATUS`, `VIDEO_AUTH`) are configured via `wrangler.toml` `[[kv_namespaces]]`

## Deployment

### Cloudflare Workers Builds (CI — recommended)

Push to GitLab triggers build/deploy on Cloudflare (Settings → Builds on each worker).

| Worker                  | Production branch | Build command   | Deploy command                         |
| ----------------------- | ----------------- | --------------- | -------------------------------------- |
| `bittasker-dev-worker`  | `dev`             | `npm run build` | `npx wrangler deploy --env dev`        |
| `bittasker-prod-worker` | `master`          | `npm run build` | `npx wrangler deploy --env production` |

**Build variables and secrets** (Settings → Builds, not runtime Variables & Secrets): all `VITE_*` needed by `npm run build`, plus build-only secrets such as `SENTRY_AUTH_TOKEN`. Runtime-only values stay in `[env.*.vars]` / Worker Variables & Secrets.

Optional cache purge after deploy (add to deploy command if `CLOUDFLARE_CACHE_*` are set as build secrets):

```bash
npx wrangler deploy --env dev && ENVIRONMENT=dev node scripts/purge-cache.js
```

GitLab CI no longer runs worker build/deploy; it keeps MR coverage, Android, and DB backups.

### Local deploy

#### Dev Worker (worker.dev.bittasker.com)

```bash
npm run deploy:workers:dev
```

Builds with dev vars, deploys to worker `bittasker-dev-worker`, then runs cache purge when in CI (skips locally).

### Staging (staging.bittasker.com)

```bash
npm run deploy:workers
```

Deploys to staging worker.

### Production Environment

```bash
npm run deploy:workers:production
```

Deploys to: `bittasker.com` (worker: `bittasker-prod-worker`)

**Note:** The deploy commands explicitly specify the environment using `--env=""` (for default) or `--env production` to avoid deployment ambiguity.

## Environment Variables

Two separate Cloudflare surfaces (Workers Builds does not merge them):

| Purpose                                       | Where to configure                                                     | Used by                       |
| --------------------------------------------- | ---------------------------------------------------------------------- | ----------------------------- |
| **Build-time** (`VITE_*` for Vite)            | Worker → Settings → **Builds** → Build variables and secrets           | `npm run build` on Cloudflare |
| **Runtime** (Worker `env`, non-secret config) | `wrangler.toml` `[env.*.vars]` and/or Settings → Variables and Secrets | Deployed Worker               |

Secrets: `wrangler secret put` or the dashboard. `wrangler deploy` (Wrangler 4) sends `bindings_inherit=strict` and drops secret bindings unless the deploy passes `--keep-vars` or `--secrets-file`, or the name is listed in `[env.*.secrets].required` so Wrangler sends an inherit binding. Plain text variables that exist only in the dashboard are removed on deploy (`--keep-vars` defaults to false). Production `MEILI_HOST` lives in `[env.production.vars]`. Production `MEILI_SEARCH_KEY` is a dashboard secret named in `[env.production.secrets].required`.

To add secrets (sensitive data):

```bash
npx wrangler secret put SECRET_NAME
npx wrangler secret put CLOUDFLARE_STREAM_WEBHOOK_SECRET
```

## KV Namespaces

Two KV namespaces support the Stream integration:

| Binding        | Purpose                                                              |
| -------------- | -------------------------------------------------------------------- |
| `VIDEO_STATUS` | Caches encoding state (populated by webhook) for the status endpoint |
| `VIDEO_AUTH`   | Maps video UIDs to authorized pubkeys for private video access       |

Create them before deploying:

```bash
npx wrangler kv:namespace create VIDEO_STATUS
npx wrangler kv:namespace create VIDEO_AUTH
```

Then copy the returned IDs into `wrangler.toml` under `[[kv_namespaces]]`.

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

Ensure `svelte.config.js` uses `fallback: '404.html'` and `wrangler.toml` has `not_found_handling = "single-page-application"`.

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

**Why:** Turnstile tries to redeem the challenge by POSTing to your **page origin** at `/cdn-cgi/challenge-platform/…`. That path is normally handled by Cloudflare's edge when the site is on a real Cloudflare-proxied domain. On localhost with wrangler dev there is no Cloudflare edge, so the POST fails (SSL or 404). Turnstile retries/timeouts (~30s) and then may still call your success callback, so the button eventually enables.

**What to do:** For normal local dev (Vite), use `npm run dev` so Turnstile behaves as expected. When testing the Worker locally with `wrangler dev`, either accept the delay or test Turnstile on a deployed URL (e.g. worker.dev.bittasker.com) where Cloudflare handles the challenge platform.
