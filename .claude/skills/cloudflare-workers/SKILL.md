---
name: cloudflare-workers
description: 'Use when writing or modifying Cloudflare Workers backend code. Examples: API route handlers, wrangler.toml configuration, KV/D1/R2 bindings, cron triggers, CORS, Workers-specific runtime constraints.'
---

# Cloudflare Workers — BitTasker

## Project-Specific Architecture

The Workers backend lives in `workers-site/`. It uses the **vanilla Service Worker format** (`export default { fetch(request, env) }`), NOT Hono, NOT ES modules format. The worker serves:

- **Static Assets** — SvelteKit SPA build from `./build` directory, with `not_found_handling = "single-page-application"` for client-side routing fallback
- **API routes** — selected paths (`/api/*`, `/__data.json`) run through the worker before the static asset fallback (configured via `run_worker_first` in wrangler.toml)
- **Cron cleanup** — weekly abandoned Stream video cleanup (Sunday 3am UTC)

Worker entry: `workers-site/index.js`. Handlers: `workers-site/handlers/stream.js`, `workers-site/handlers/changelly.js`, `workers-site/handlers/changelly-fiat.js`.

## Runtime Constraints

Workers run on **V8 isolates**, NOT Node.js. The following Node.js APIs are UNAVAILABLE:

| Unavailable | Alternative |
|---|---|
| `fs`, `path` | Use KV, R2, or D1 for persistence; `URL` and string manipulation for paths |
| `process.env` | Use `env` binding passed to `fetch(request, env)` |
| `child_process`, `net`, `tls` | Use `fetch()` for outbound HTTP |
| `require()` | Use ES module `import` syntax |
| `Buffer` | Use `Uint8Array` or `TextEncoder`/`TextDecoder` |
| `__dirname`, `__filename` | Not available; use relative paths in Workers code |
| `setTimeout` > 30s (free) / no limit (paid) | Wall-clock time is unlimited, but CPU time is capped per plan |

**Available Web APIs**: `fetch`, `URL`, `Request`, `Response`, `Headers`, `crypto` (Web Crypto), `WebSocket` (outbound only, via `fetch` upgrade), `TextEncoder`/`TextDecoder`, `atob`/`btoa`, `console`, `setTimeout`/`setInterval`, `structuredClone`, `AbortController`/`AbortSignal`, `ReadableStream`/`WritableStream`/`TransformStream`.

## Wrangler CLI

```bash
npx wrangler dev              # Local dev server (default env)
npx wrangler dev --env dev    # Local dev with specific environment
npx wrangler deploy            # Deploy default environment
npx wrangler deploy --env staging  # Deploy staging
npx wrangler deploy --env production  # Deploy production
npx wrangler tail              # Live logs for default env
npx wrangler tail --env dev    # Live logs for specific env
npx wrangler secret put MY_SECRET  # Set a secret for default env
npx wrangler secret put MY_SECRET --env production  # Set secret per env
```

## wrangler.toml Configuration

### Route Patterns

```toml
[env.dev.route]
pattern = "worker.dev.bittasker.com/*"
zone_id = "2f577970e10b49266dbfc1ff6c5c8dc4"
```

Routes determine which URLs the worker handles. The zone must be in your Cloudflare account. Use `*` suffix for wildcard subpath matching.

### Environment Variables (`[vars]`)

```toml
[env.dev.vars]
VITE_CLIENT_HOSTNAME = "dev.bittasker.com"
```

Accessed in code via `env.VITE_CLIENT_HOSTNAME` — NOT `process.env.VITE_CLIENT_HOSTNAME`. All values are strings. For secrets (API keys, tokens), use `wrangler secret put` instead of vars.

### Secrets

```bash
wrangler secret put CHANGELLY_API_KEY --env dev
```

Secrets are encrypted at rest and accessed the same way as vars: `env.CHANGELLY_API_KEY`. Never hardcode secrets in wrangler.toml (dev-only placeholders are acceptable with clear documentation).

### KV Namespaces

```toml
[[env.dev.kv_namespaces]]
binding = "VIDEO_STATUS"
id = "096ca6be2d3b4b7db628f57fdba1dd21"
```

First create the namespace: `wrangler kv namespace create "VIDEO_STATUS"`. KV API:

```js
await env.VIDEO_STATUS.put('key', 'value');                        // Write
await env.VIDEO_STATUS.put('key', 'value', { expirationTtl: 86400 }); // With TTL (seconds)
const value = await env.VIDEO_STATUS.get('key');                   // Read (string)
const value = await env.VIDEO_STATUS.get('key', 'json');          // Read (parsed JSON)
const value = await env.VIDEO_STATUS.get('key', 'text');          // Read (text, default)
const value = await env.VIDEO_STATUS.get('key', 'arrayBuffer');   // Read (binary)
await env.VIDEO_STATUS.delete('key');                              // Delete
const list = await env.VIDEO_STATUS.list({ prefix: 'user:', limit: 100 }); // List keys
```

**KV is eventually consistent** — writes may not be immediately visible to subsequent reads. Do NOT use KV for atomic operations, counters with exact values, or transactional data. Use D1 for those.

### D1 (SQLite)

```toml
[[d1_databases]]
binding = "DB"
database_name = "bittasker-db"
database_id = "your-database-id"
```

First create: `wrangler d1 create bittasker-db`. D1 uses **SQLite dialect**, NOT Postgres or MySQL:

```js
// Query
const { results } = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(userId).all();
const user = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(userId).first();

// Write (returns success + optional lastRowId)
const { success, meta } = await env.DB.prepare('INSERT INTO users (name) VALUES (?)').bind(name).run();

// Batch (all succeed or all fail — atomic)
await env.DB.batch([
  env.DB.prepare('INSERT INTO users (name) VALUES (?)').bind('Alice'),
  env.DB.prepare('INSERT INTO users (name) VALUES (?)').bind('Bob'),
]);
```

SQLite-specific differences to watch for:
- No `RETURNING` clause in older D1/SQLite — use a separate SELECT if you need the inserted row
- Use `INSERT OR REPLACE` instead of `INSERT ... ON CONFLICT`
- TEXT affinity — all values are strings unless explicitly typed
- D1 supports foreign keys, indexes, and triggers

### R2 (Object Storage)

```toml
[[r2_buckets]]
binding = "MY_BUCKET"
bucket_name = "user-uploads"
```

```js
await env.MY_BUCKET.put('path/to/file.jpg', imageBytes);           // Upload
const obj = await env.MY_BUCKET.get('path/to/file.jpg');           // Download
await env.MY_BUCKET.delete('path/to/file.jpg');                    // Delete
```

Use R2 for large files, user uploads, images, and binary data. R2 is strongly consistent (unlike KV).

### Cron Triggers

```toml
[env.dev.triggers]
crons = ["0 3 * * SUN"]  # Sunday 3am UTC
```

Cron syntax is standard 5-field (minute hour day month weekday). Handled via the `scheduled()` export, NOT the `fetch()` handler:

```js
export default {
  async fetch(request, env) {
    // Normal HTTP requests
  },
  async scheduled(event, env) {
    // Cron trigger — event.cron, event.scheduledTime, event.type
    await cleanupAbandonedUploads(env);
  }
};
```

BitTasker uses this for weekly cleanup of abandoned Stream video uploads. Note: Cloudflare cron uses SUN-SAT (not Unix 0-6 numbering).

## Project Pattern: Vanilla Service Worker

The BitTasker worker uses the **Service Worker format**, not ES modules. The pattern:

```js
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const pathname = url.pathname;

    // API routes checked FIRST — before static asset fallback
    if (pathname.startsWith('/api/some-endpoint/')) {
      return handleSomeRoute(request, env);
    }

    // Static Assets handles everything else via SPA fallback
    // (configured in wrangler.toml [assets] section)
    return env.ASSETS.fetch(request);
  }
};
```

Key points:
- `request` is a standard `Request` object (use `request.url`, `request.method`, `request.headers`, `request.json()`)
- `env` is the bindings object (everything declared in wrangler.toml: vars, KV, D1, R2, secrets)
- `env.ASSETS.fetch(request)` delegates to the Static Assets binding for SPA fallback
- API routes must be checked before the ASSETS fallback — order matters

## Request Handling

```js
const url = new URL(request.url);
const pathname = url.pathname;
const method = request.method;                         // GET, POST, PUT, DELETE, OPTIONS
const params = Object.fromEntries(url.searchParams);   // Query string
const body = await request.json();                     // JSON body (with try/catch!)
const headers = request.headers.get('authorization');  // Specific header
const hostname = url.hostname;                         // Dev vs prod routing
```

## Response Helpers

```js
// JSON response
return new Response(JSON.stringify({ data: result }), {
  status: 200,
  headers: { 'Content-Type': 'application/json', ...corsHeaders }
});

// Error response
return new Response(JSON.stringify({ error: 'Not found' }), {
  status: 404,
  headers: { 'Content-Type': 'application/json', ...corsHeaders }
});

// No content
return new Response(null, { status: 204 });
```

## CORS

Workers need explicit CORS headers for browser access. The project pattern:

```js
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
};

// Handle preflight
if (request.method === 'OPTIONS') {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

// Attach to all responses
return new Response(JSON.stringify(data), {
  headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
});
```

For restricted origins, validate `request.headers.get('Origin')` against an allow list before returning `*`.

## Error Handling

- Always wrap `request.json()` in try/catch — the body may not be valid JSON
- Return proper HTTP status codes (400, 401, 403, 404, 500) — don't let errors crash the worker
- Uncaught exceptions trigger a **cold start penalty** (the worker is torn down and restarted)
- Use `console.error()` for debugging; these appear in `wrangler tail`
- Return structured error responses: `{ error: "message", code: "ERROR_CODE" }`

## Anti-Patterns

| Don't | Do Instead |
|---|---|
| `require('fs')` or any Node.js built-in | Use KV, R2, or D1 for persistence |
| `process.env.MY_VAR` | `env.MY_VAR` |
| `require('./handler')` | `import { handler } from './handler.js'` |
| Store secrets in wrangler.toml vars | `wrangler secret put` or Dashboard secrets |
| Assume `request.json()` succeeds | Wrap in try/catch with 400 error response |
| Block the event loop with synchronous work | Use async/await for network, crypto, storage |
| Large synchronous crypto operations | Use `crypto.subtle` (Web Crypto, not Node.js crypto) |
| Return HTML from API routes without CORS headers | Always include CORS headers for API responses |

## Quick Reference

| Feature | Setup | Usage |
|---|---|---|
| Environment vars | `[env.dev.vars]` in wrangler.toml | `env.MY_VAR` |
| Secrets | `wrangler secret put KEY` | `env.KEY` |
| KV | `wrangler kv namespace create` + toml | `env.NS.get/put/delete/list` |
| D1 | `wrangler d1 create` + toml | `env.DB.prepare().bind().all/first/run` |
| R2 | Create bucket in Dashboard + toml | `env.BUCKET.put/get/delete` |
| Cron | `[triggers] crons = [...]` in toml | `export default { scheduled(event, env) }` |
| Static Assets | `[assets]` in toml | `env.ASSETS.fetch(request)` |
| Local dev | `npx wrangler dev` | Serves on localhost:8787 |
| Deploy | `npx wrangler deploy --env X` | Pushes to Cloudflare edge |
| Live logs | `npx wrangler tail --env X` | Streams console output |
| CORS | Manual headers in handler | `Access-Control-Allow-Origin` etc. |
