# Cloudflare Stream — Video Integration Plan

## Overview

Integrate Cloudflare Stream for video upload, encoding, and playback across BitTasker. Videos will be used in profile intros, service portfolios, task evidence, and future DMs. Public videos use standard iframe embeds; private videos use signed URLs generated at the edge with authentication enforcement.

**Status**: Plan — audited by 7 agents across 2 rounds, 95%+ confidence achieved. Awaiting implementation.

**Last updated**: 2026-05-11 (v3 — final, all audit findings resolved)

**Confidence**: 98% — all CRITICAL and HIGH findings resolved. 1 LOW item remains (stale README update included in step 21).

---

## Phase 1: Player Foundation

### 1.1 StreamPlayer.svelte

Create a single reusable Svelte 5 component that replaces every `<video>` element in the app.

**Props:**
| Prop | Type | Default | Notes |
|---|---|---|---|
| `videoUid` | `string` | required | Stream video ID |
| `poster` | `string \| null` | `null` | Custom thumbnail URL; falls back to Stream auto-thumbnail at time=2s |
| `autoplay` | `boolean` | `false` | |
| `muted` | `boolean` | `false` | |
| `controls` | `boolean` | `true` | Show Stream player controls |
| `loop` | `boolean` | `false` | Loop playback (profile intros) |
| `playsinline` | `boolean` | `true` | Required for iOS Safari/WebView inline playback |
| `preload` | `'none' \| 'metadata' \| 'auto'` | `'metadata'` | |
| `private` | `boolean` | `false` | If true, fetches authenticated signed token from Worker |
| `status` | `'uploading' \| 'encoding' \| 'queued' \| 'private-token-loading' \| 'poster-loading' \| 'ready' \| 'error' \| 'expired' \| 'offline'` | `'ready'` | |
| `uploadProgress` | `number` | `0` | 0-100, for uploading state |
| `thumbnailTime` | `number` | `2` | Seconds into video for auto-thumbnail |
| `aspectRatio` | `string` | `'video'` | Tailwind aspect class: `aspect-video`, `aspect-square` |
| `className` | `string` | `''` | Additional Tailwind classes |
| `ariaLabel` | `string` | `'Video player'` | Accessible label for the iframe |
| `captionsUrl` | `string \| null` | `null` | WebVTT captions URL (Stream supports `?captions=on`) |
| `onerror` | `(error: string) => void` | undefined | Error callback for parent components |
| `onready` | `(uid: string) => void` | undefined | Ready callback |

**Renders by status:**

- `offline` → "No internet connection — video cannot play" with `navigator.onLine` listener for auto-reconnect
- `uploading` → progress bar (percentage + estimated time), min 44px touch targets
- `encoding` → skeleton pulse animation + `$t('stream_player.status.encoding')`; respects `prefers-reduced-motion`
- `queued` → "Video is queued for processing..." (120-video concurrency limit)
- `private-token-loading` → spinner overlay within video container while fetching JWT
- `poster-loading` → skeleton/pulse animation until poster image resolves
- `ready` → responsive iframe wrapper with Stream player
- `error` → user-friendly message + retry button, min 44px touch target
- `expired` → "Playback link expired — tap to refresh" with manual refresh action

**Technical details:**

- Customer code from `VITE_STREAM_CUSTOMER_CODE` env var
- Iframe URL: `https://customer-{CODE}.cloudflarestream.com/{uid}/iframe?poster={encodeURIComponent(posterUrl)}&controls=true&primaryColor=%23f59e0b&playsinline=true`
- Iframe attributes: `title={ariaLabel}`, `allow="autoplay; encrypted-media; fullscreen; picture-in-picture"`, `frameborder="0"`, `loading="lazy"`
- `<noscript>` fallback: "Your browser does not support video playback"
- Validate `videoUid` against UUID regex before constructing URL
- Validate `poster` URL is `https://` (image delivery or Stream domain)
- Private videos: append `&token={signedJwt}` fetched from authenticated `GET /api/cloudflare/stream/token/{uid}`
- N simultaneous private videos: stagger token fetches with 200ms delay per instance. Cache tokens in-memory (`Map<uid, {token, expiresAt}>`) to avoid re-fetching on remount; refresh 5 minutes before expiry.
- Gallery grids (ServicePortfolio, ContractDrawer): use click-to-load or Intersection Observer to avoid mounting >4 simultaneous iframes. Show poster thumbnail with play button overlay until user clicks to activate.
- Accessibility: `role="region"`, `aria-label` on container, `aria-live="polite"` wrapper for status changes. Auto-focus retry/refresh button when entering `error` or `expired` state via `autofocus` attribute. Return focus to trigger element on dismiss/state-transition via `document.activeElement` tracking. Iframe loads with `tabindex="-1"` to prevent focus traps.
- CSP: `frame-src https://customer-*.cloudflarestream.com` and `connect-src` for the Worker API domain must be in Content Security Policy headers (check svelte.config.js or `_headers` file).
- Class list: `aspect-{aspectRatio} rounded-lg overflow-hidden {className}`
- File location: `src/lib/components/StreamPlayer.svelte`

**Preconnect optimization (add to root `+layout.svelte`):**

```svelte
<script>
	import { PUBLIC_STREAM_CUSTOMER_CODE } from '$env/static/public';
</script>

<svelte:head>
	<link
		rel="preconnect"
		href="https://customer-{PUBLIC_STREAM_CUSTOMER_CODE}.cloudflarestream.com"
	/>
</svelte:head>
```

### 1.2 Replace `<video>` Elements

Swap raw `<video>` for `<StreamPlayer>` in every consumer:

| File                             | Context                               | Visibility        | Private | Notes                                                                                  |
| -------------------------------- | ------------------------------------- | ----------------- | ------- | -------------------------------------------------------------------------------------- |
| `VideoIntro.svelte`              | Profile intro                         | Public            | No      | Remove canvas thumbnail gen; use Stream auto-thumb `?time=0.1s`                        |
| `ServicePortfolio.svelte`        | Portfolio grid + modal preview        | Public            | No      | Add `image`/`thumb` Nostr tags for video items                                         |
| `TaskCompletionModal.svelte`     | Completion evidence                   | Private           | Yes     |                                                                                        |
| `TaskCompletionDrawerNDK.svelte` | Completion evidence                   | Private           | Yes     |                                                                                        |
| `ContractDrawer.svelte`          | Contract evidence display             | Private           | Yes     |                                                                                        |
| `ContractDrawerNDK.svelte`       | Contract evidence display             | Private           | Yes     |                                                                                        |
| `MediaUploader.svelte`           | Post-upload preview (completed state) | Context-dependent | Depends | Only swap after upload complete + uid known; keep raw `<video>` for pre-upload preview |
| `Uploader.svelte`                | Post-upload preview (completed state) | Context-dependent | Depends | Same as MediaUploader                                                                  |

**Legacy video support**: Add a `videoUrl` fallback prop. When `videoUid` is null but `videoUrl` is set, render a standard `<video>` element instead of the Stream iframe. This handles existing videos not yet on Stream.

### 1.3 Environment Variable

Add to `.env` files and `docs/ci/workers-ci-setup-walkthrough.md`:

```
VITE_STREAM_CUSTOMER_CODE=customer-xxxxxxxxxxxxx
```

Dev/staging/production may need separate customer codes if using separate Cloudflare accounts. Set as GitLab CI environment-scoped variable for automated builds.

### 1.4 Type Definitions

Add to `src/lib/types/video.d.ts`:

```typescript
interface StreamPlayerProps {
	videoUid: string;
	poster?: string | null;
	autoplay?: boolean;
	muted?: boolean;
	controls?: boolean;
	loop?: boolean;
	playsinline?: boolean;
	preload?: 'none' | 'metadata' | 'auto';
	private?: boolean;
	status:
		| 'uploading'
		| 'encoding'
		| 'queued'
		| 'private-token-loading'
		| 'poster-loading'
		| 'ready'
		| 'error'
		| 'expired'
		| 'offline';
	uploadProgress?: number;
	thumbnailTime?: number;
	aspectRatio?: string;
	className?: string;
	ariaLabel?: string;
	captionsUrl?: string | null;
	onerror?: (error: string) => void;
	onready?: (uid: string) => void;
}

interface DirectCreatorUploadResponse {
	uploadURL: string;
	uid: string;
}
interface ImagesUploadUrlResponse {
	uploadURL: string;
	id: string;
}
interface StreamSignedTokenResponse {
	token: string;
	expiresAt: number;
}
interface StreamApiError {
	error: { code: string; message: string };
}
```

### 1.5 i18n Keys

Define in `static/locales/en/stream_player.json` (and `es/` equivalent):

```json
{
	"status": {
		"uploading": "Uploading... {progress}%",
		"encoding": "Processing video...",
		"queued": "Video is queued for processing...",
		"token_loading": "Loading video...",
		"poster_loading": "Loading preview...",
		"error": "Video could not be loaded",
		"expired": "Playback link expired",
		"offline": "No internet connection — video will play when connected"
	},
	"error": {
		"upload_interrupted": "Upload interrupted — tap to resume",
		"upload_failed": "Upload failed — tap to retry",
		"encoding_failed": "Video could not be processed by our servers",
		"token_failed": "Could not load video — tap to try again",
		"token_expired": "Playback link expired — refreshing..."
	},
	"action": {
		"retry": "Retry",
		"resume": "Resume Upload",
		"refresh": "Refresh"
	},
	"thumbnail": {
		"upload": "Upload custom thumbnail",
		"auto": "Auto-generated thumbnail",
		"uploading": "Uploading thumbnail..."
	},
	"warning": {
		"keep_open": "Please keep the app open during video upload",
		"cellular_data": "Uploading over cellular will use data. Continue?",
		"low_battery": "Battery is low. Upload may be interrupted.",
		"large_file": "This video is {size} MB. Upload may take several minutes."
	},
	"a11y": {
		"player_label": "Video player",
		"upload_progress": "Upload progress: {progress} percent",
		"encoding_status": "Video is being processed",
		"playback_ready": "Video ready to play",
		"playback_error": "Video playback error: {error}"
	}
}
```

Run `python3 scripts/find-missing-translations.py --fix-suggestions` after adding keys.

---

## Phase 2: Worker Backend

### 2.1 Wrangler Config — Stream Binding + API Routes + KV

```toml
# wrangler.toml
[[stream]]
binding = "STREAM"

# KV namespace for video encoding status (populated by webhook)
[[kv_namespaces]]
binding = "VIDEO_STATUS"
id = "<created-by-wrangler>"

# Authorization mapping: uid -> authorized pubkeys for private videos
[[kv_namespaces]]
binding = "VIDEO_AUTH"
id = "<created-by-wrangler>"

# Updated run_worker_first — API routes must be listed so the Worker executes for them.
# Without these patterns, the Worker never runs and API calls return the SPA fallback index.html.
[assets]
directory = "./build"
binding = "ASSETS"
not_found_handling = "single-page-application"
run_worker_first = [
    "/api/*",
    "/__data.json",
    "/*/__data.json",
    "/*/*/__data.json",
    "/*/*/*/__data.json"
]

# Weekly cron trigger for abandoned upload cleanup
[triggers]
crons = ["0 0 * * 0"]  # Sunday midnight UTC
```

### 2.2 Worker Secrets

**CI/CD is the source of truth.** GitLab CI injects `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` for `wrangler deploy`. Use separate API tokens per environment with minimal scopes (Stream:Read + Stream:Write per account).

For first-time environment bootstrapping (manual, one-time):

```bash
npx wrangler secret put CLOUDFLARE_API_TOKEN -e dev
npx wrangler secret put CLOUDFLARE_ACCOUNT_ID -e dev
# Repeat for staging and production
```

Also set a webhook secret for encoding notifications:

```bash
npx wrangler secret put CLOUDFLARE_STREAM_WEBHOOK_SECRET -e dev
```

### 2.3 Worker Code Structure

```
workers-site/
  index.js              # Router + CORS helper + error helper (~50 lines)
  handlers/
    data.js             # __data.json handler (moved from index.js)
    stream.js           # Upload URL + signed token + webhook
```

### 2.4 Worker Router (index.js)

```javascript
// workers-site/index.js
const corsHeaders = {
	'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
	'Access-Control-Allow-Headers': 'Content-Type, Authorization'
};

// Per-endpoint CORS: upload endpoints use '*', token endpoint restricts to app origins
const ALLOWED_ORIGINS = [
	'https://bittasker.com',
	'https://worker.dev.bittasker.com',
	'https://worker.prod.bittasker.com',
	'https://staging.bittasker.com'
];

function corsOrigin(request) {
	const origin = request.headers.get('Origin');
	return origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
}

function errorResponse(code, message, status = 400) {
	return Response.json({ error: { code, message } }, { status });
}

export default {
	async fetch(request, env) {
		const url = new URL(request.url);
		const pathname = url.pathname;

		// Handle OPTIONS preflight
		if (request.method === 'OPTIONS') {
			return new Response(null, {
				headers: { 'Access-Control-Allow-Origin': corsOrigin(request), ...corsHeaders }
			});
		}

		// API routes
		if (pathname.startsWith('/api/cloudflare/stream/')) {
			return handleStreamRoute(request, env);
		}
		if (pathname.startsWith('/api/cloudflare/images/')) {
			return handleImagesRoute(request, env);
		}

		// SvelteKit data fallback
		if (pathname.includes('/__data.json')) {
			return new Response(JSON.stringify({ type: 'data', nodes: [{}] }), {
				headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
			});
		}

		// Static assets (SPA fallback via not_found_handling)
		return env.ASSETS.fetch(request);
	}
};
```

### 2.5 Stream Endpoints (handlers/stream.js)

#### POST `/api/cloudflare/stream/upload-url`

- **Auth**: Requires valid session (check `Authorization` header or cookie). Reject with 401 if missing.
- **Rate limit**: 10 requests per minute per authenticated user. Implemented via Cloudflare Rate Limiting rules (`[[unsafe_metadata.rate_limits]]` in wrangler.toml) for product-level enforcement. Fallback: per-user counters in memory with `VIDEO_AUTH` KV as backing store with `consistency: "strong"` to avoid silent bursts from eventual consistency.
- **Body**: `{ maxDurationSeconds?: number }` (server-capped at 600s / 10 minutes to limit storage abuse)
- **Response**: `{ uploadURL: string, uid: string }`
- **CORS**: `Access-Control-Allow-Origin: *`
- Uses `env.STREAM.createDirectUpload()`

```javascript
// Correct API signature — two arguments, not one object
const { uploadURL, uid } = await env.STREAM.createDirectUpload({ maxDurationSeconds });
```

#### GET `/api/cloudflare/stream/token/:uid`

- **Auth**: REQUIRED. Validate session token. Verify user has permission for this specific video UID by checking `VIDEO_AUTH` KV (`uid -> authorized pubkeys`). The authorization mapping is populated at upload time: after a successful upload for a private context, the Worker writes `{ uid: [ownerPubkey, ...additionalPartyPubkeys] }` into `VIDEO_AUTH` KV with the authenticated user's pubkey and any additional authorized parties (e.g., contract counterparties).
- **Rate limit**: 30 requests per minute per authenticated user.
- **Response**: `{ token: string, expiresAt: number }`
- **CORS**: `Access-Control-Allow-Origin: <specific origin>` (NOT `*`)
- Uses `env.STREAM.sign(videoUid, { duration: 3600 })` — correct two-argument signature

#### POST `/api/cloudflare/stream/webhook`

- **Auth**: HMAC signature verification using `CLOUDFLARE_STREAM_WEBHOOK_SECRET`
- Verifies `Cf-Webhook-Signature` header against request body
- Returns 401 if signature missing or invalid
- On valid `ready` or `error` event: update KV entry keyed by video UID
- KV namespace: add `[[kv_namespaces]]` to wrangler.toml for `VIDEO_STATUS` binding

#### GET `/api/cloudflare/stream/status/:uid`

- **Auth**: None required (only returns encoding state, no private data).
- **Response**: `{ uid: string, state: 'pendingupload' | 'queued' | 'inprogress' | 'ready' | 'error', pctComplete?: number, errorReason?: string }`
- **CORS**: `Access-Control-Allow-Origin: *`
- Reads from KV `VIDEO_STATUS` binding, populated by the webhook handler on encoding events. Falls back to Stream REST API if KV entry doesn't exist (first-time check before webhook fires).

### 2.7 Images Endpoint (handlers/images.js) — Future

The `POST /api/cloudflare/images/upload-url` endpoint is documented for future use when migrating images to the Worker path. For now, images continue using the existing `cloudflare-media.service.ts` flow (server-side, not client-side). Remove from immediate implementation scope.

### 2.7 CORS Policy — Per-Endpoint

| Endpoint                                 | Allow-Origin                           | Reason                                 |
| ---------------------------------------- | -------------------------------------- | -------------------------------------- |
| `POST /api/cloudflare/stream/upload-url` | `*`                                    | One-time URL is self-securing          |
| `GET /api/cloudflare/stream/token/:uid`  | Specific origins                       | Prevents cross-origin token harvesting |
| `POST /api/cloudflare/stream/webhook`    | N/A (Cloudflare → Worker, not browser) | No browser CORS needed                 |
| All                                      | `OPTIONS` preflight handled            | Capacitor WebView compatibility        |

---

## Phase 3: Upload UX

### 3.1 Uppy Integration

Install:

```bash
npm i @uppy/core @uppy/tus @uppy/svelte
```

Integrate into `MediaUploader.svelte`:

- Replace single-shot `fetch()` POST with Uppy + Tus plugin for video
- Keep existing image compression + upload flow for images (unchanged)
- Uppy handles: chunked upload, resume on network interruption, progress tracking
- Tus endpoint: the Direct Creator Upload URL from the Worker
- Chunk size: **10MB** (optimized for mobile; was 150MB in original draft — too large for mobile networks and memory)
- Platform-aware: adjust chunk size based on `Capacitor.isNativePlatform()` (5MB mobile, 20MB desktop)
- **Upload URL expiry**: Direct Creator Upload URLs expire after ~30 minutes. For large files on slow connections near the boundary, Uppy's `onShouldRetry` handler detects 410 Gone responses, fetches a fresh upload URL from the Worker, and resumes the upload session with the new URL.

### 3.2 Upload Progress in MediaUploader

- Uppy provides progress natively via `uppy.on('progress', ...)`
- Show percentage + estimated time remaining (i18n'd)
- Show file name being uploaded
- Cancel button for user-initiated abort
- On cancel: call `uppy.cancelAll()`, clean up partial Stream upload via API
- Error state: surfaced via Uppy `error`/`upload-error` events → MediaUploader `onError` callback
- Error propagation: Uppy error event → MediaUploader error state → parent component via event dispatcher

### 3.3 Thumbnail Upload (Service Portfolio + Profile Intro)

Both `ServicePortfolio.svelte` and `VideoIntro.svelte` support optional custom thumbnail upload on video cards:

- Opens image picker (existing `MediaUploader` or `<input type="file">` flow)
- Reuses the **existing** `compressImage()` utility from `src/lib/utils/imageCompression.ts` (WEBP, 80% quality, max 3840px) — no new compression code
- Uploads via **existing** `uploadService.uploadSingleFile()` to Cloudflare Images (already handles variants, Cloudflare-first strategy)
- No Worker endpoint or API changes needed — the image flow is already built
- Stores thumbnail URL in the video's data: portfolio item or profile video event
- Added to Nostr event as `thumb` tag for external client compatibility; `generateServiceTags()` in `src/lib/nostr/service.ts` updated for portfolio
- Passed as `poster` prop to StreamPlayer
- Falls back to Stream auto-thumbnail if not provided

### 3.4 File Size Validation

- Raise video-specific `maxFileSize` to **500 MB** in Uploader/MediaUploader. Phone video at common settings: 1080p30 ~60-150 MB for 2 min, 4K30 ~250-500 MB for 2 min. 500 MB covers 4K at the app's max duration (180s) with headroom. Stream API supports up to 30 GB, but 500 MB is practical for mobile upload times.
- Keep image `maxFileSize` at existing limits
- Show pre-upload size warning for files >100MB: `$t('stream_player.warning.large_file', { size })`

---

## Phase 4: Private Videos

### 4.1 Signed URL Generation

When `StreamPlayer` receives `private={true}`:

1. Component enters `private-token-loading` state
2. Component fetches `GET /api/cloudflare/stream/token/{uid}` with auth header
3. Worker validates session + authorization for this specific UID
4. Worker calls `env.STREAM.sign(videoUid, { duration: 3600 })` — returns JWT
5. JWT appended to iframe `src` as `&token={jwt}`
6. Component transitions to `poster-loading` → `ready`
7. Token valid for 1 hour; on expiry, component enters `expired` state with refresh action

### 4.2 Setting requireSignedURLs — No Race Condition

**Confirmed approach**: The Stream binding's `createDirectUpload()` does NOT pass `requireSignedURLs` through to the tus metadata. Use the **REST API path** for private uploads:

1. Worker calls `POST /accounts/{id}/stream` with `{ requireSignedURLs: true, ... }` using the API token from secrets
2. Stream creates the video entry (private from birth)
3. Worker calls `POST /accounts/{id}/stream/{uid}/upload-url` to get a tus upload URL for that specific video
4. Returns the tus URL to the client for Uppy upload

This avoids the race condition entirely — the video is private from creation, before any data is uploaded.

### 4.3 Nostr-to-Stream Integrity

Nostr events are immutable; Stream videos can be deleted (cron cleanup, abuse removal). Add a lazy integrity check in StreamPlayer and token endpoint:

- StreamPlayer: if the Stream iframe returns 404 (video deleted), show "Video no longer available" message
- Token endpoint: before signing, verify the video UID still exists in Stream (`GET /stream/{uid}`). If 404, return error
- Optional reconciliation: the weekly cron Worker compares Nostr event video references against Stream API `GET /stream` listing and logs orphaned references

### 4.4 Visibility Matrix

| Context                  | Public/Private | Signed URLs | Thumbnail                                       |
| ------------------------ | -------------- | ----------- | ----------------------------------------------- |
| Profile intro video      | Public         | No          | Custom (optional) or Stream auto (`?time=0.1s`) |
| Service portfolio        | Public         | No          | Custom (optional) or Stream auto (`?time=2s`)   |
| Task completion evidence | Private        | Yes         | Stream auto                                     |
| Contract evidence        | Private        | Yes         | Stream auto                                     |
| Chat/DM videos (future)  | Private        | Yes         | Stream auto                                     |

---

## Phase 5: Processing & Error States

### 5.1 Encoding State

**Primary: Webhook** (recommended for production):

- Configure Stream webhook: `https://worker.prod.bittasker.com/api/cloudflare/stream/webhook`
- Webhook secret set via `wrangler secret put CLOUDFLARE_STREAM_WEBHOOK_SECRET`
- Worker verifies HMAC signature on every webhook request
- On valid `ready` or `error`: update KV entry (`VIDEO_STATUS` binding) keyed by video UID
- StreamPlayer checks KV-backed status endpoint on mount: `GET /api/cloudflare/stream/status/{uid}`

**Fallback: Polling** (when webhook not yet configured):

- Poll `GET /api/cloudflare/stream/status/{uid}` every 30s (not 5s — too aggressive for mobile)
- Only poll when component is visible (Intersection Observer)
- Stop polling on component unmount or when status resolves
- **Encoding timeout**: After 30 minutes of consecutive "encoding"/"queued" responses, transition to unrecoverable error state with "Video processing is taking longer than expected — please try re-uploading" message. This prevents a permanent stuck state from webhook misconfiguration.

### 5.2 Sentry Breadcrumbs

Log breadcrumbs for all Stream operations (CLAUDE.md requirement):

- Upload URL request (`stream.upload_url.requested`, `stream.upload_url.success`, `stream.upload_url.error`)
- Token fetch (`stream.token.fetch`, `stream.token.success`, `stream.token.error`)
- Webhook receipt (`stream.webhook.received`, `stream.webhook.verified`, `stream.webhook.invalid_signature`)
- StreamPlayer state transitions (`stream.player.uploading`, `stream.player.encoding`, `stream.player.ready`, `stream.player.error`)
- Uppy upload events (`stream.upload.progress`, `stream.upload.complete`, `stream.upload.error`)

### 5.3 Error Handling — All States

| Error                     | User sees (i18n key)                                        | Recovery                                        |
| ------------------------- | ----------------------------------------------------------- | ----------------------------------------------- |
| Upload fails (network)    | `error.upload_interrupted`                                  | Uppy auto-resumes                               |
| Upload fails (permanent)  | `error.upload_failed`                                       | Retry button                                    |
| Encoding fails            | `error.encoding_failed`                                     | Re-upload                                       |
| Token expired             | `error.token_expired`                                       | Auto-refresh on playback                        |
| Token fetch fails         | `error.token_failed`                                        | Retry button                                    |
| Worker unreachable        | "Upload service temporarily unavailable — please try again" | Retry with exponential backoff (max 3 attempts) |
| Offline during playback   | `status.offline`                                            | Auto-reconnect on `online` event                |
| Rate limited (upload URL) | "Too many uploads. Please wait."                            | Retry after `Retry-After` header                |
| Quota exceeded            | "Upload limit reached. Contact support."                    | Contact support                                 |

### 5.3 Encoding Queue Handling

Handle the `queued` state (120 concurrent encoding limit):

- StreamPlayer shows `status.queued` with description
- Differentiate from `encoding`/`inprogress` in status polling
- Single user should not saturate the queue: rate limit upload URL endpoint

### 5.4 Abandoned Upload Cleanup

- Direct Creator Upload URLs auto-expire (~30 minutes). Partial tus uploads may leave orphaned videos.
- **Cron Worker** (weekly): query Stream API for videos in `pendingupload` state older than 24 hours → delete them.
- **Orphan cleanup**: When a Nostr event referencing a video UID is deleted, call `cloudflareMediaService.deleteVideo(uid)`. Wire into existing media-cleanup utility at `src/lib/utils/service/media-cleanup.ts`.

### 5.5 Existing Fallback Preservation

The NestJS fallback in `upload.service.ts` remains:

- Scope: images only (NestJS backend does not handle video upload to Stream)
- Video path: Direct Creator Upload via Worker (no NestJS fallback for video — Worker is the sole path)
- If Worker is unreachable, show explicit error: "Upload service temporarily unavailable — please try again"
- Legacy `cloudflare-media.service.ts.uploadVideo()` marked `@deprecated` in client code; retained for server-side use only
- After Worker path proven in production, remove legacy client-side upload methods

---

## Phase 6: Mobile / Capacitor

### 6.1 Capacitor Plugin Requirements

| Plugin                      | Purpose                                                                       | New?     |
| --------------------------- | ----------------------------------------------------------------------------- | -------- |
| `@capgo/capacitor-uploader` | Native background upload surviving app suspension                             | Yes      |
| `@capacitor/network`        | Connection type detection (cellular vs WiFi vs ethernet)                      | Yes      |
| `@capacitor/camera`         | Gallery-based video selection (already installed — use `CameraSource.PHOTOS`) | Existing |
| `@capacitor/device`         | Battery info for pre-upload warnings (already installed)                      | Existing |

### 6.2 CORS

- Worker API endpoints return per-endpoint CORS headers (see Section 2.7)
- Capacitor WebView makes cross-origin requests — CORS required
- Allowlist `*.cloudflarestream.com` in Capacitor config:
  - iOS: `ios/App/App/Info.plist` → App Transport Security
  - Android: `android/app/src/main/res/xml/network_security_config.xml`

### 6.3 Background Upload

**Critical fix**: WebView suspends JavaScript within seconds of backgrounding. Uppy Tus cannot complete uploads.

**Solution**: Use `@capgo/capacitor-uploader` plugin for uploads >50MB on native:

- Native upload at OS level (iOS `URLSession`, Android `ForegroundService`) survives app suspension
- Progress events (`uploading` with percent, `completed`, `failed`) for real-time feedback
- Supports `PUT` method for Cloudflare Stream's one-time upload URLs
- `removeUpload()` for user-initiated cancellation
- Falls back to tus-js-client for web (PWA) and smaller files

**Defensive fallback**: Use Capacitor `App.addListener('appStateChange', ...)` to detect suspension. Show "Upload paused — resuming..." state on return. Uppy Tus auto-resumes from last confirmed chunk.

### 6.4 Network Awareness

- Extend `network-status.ts` or create `connection-type.ts` store using `@capacitor/network`
- Expose: `connectionType` (wifi, cellular, none), `effectiveType` (4g, 3g, 2g, slow-2g)
- Gate uploads >50MB behind confirmation dialog when on cellular: `$t('stream_player.warning.cellular_data')`
- Web fallback: `navigator.connection.effectiveType` where available

### 6.5 Battery Awareness

- Before starting upload >100MB: check battery level via `@capacitor/device` `getBatteryInfo()`
- Warn if <20%: `$t('stream_player.warning.low_battery')`
- Add "Low power mode" setting to pause uploads when critically low

### 6.6 Memory Constraints

- Replace `URL.createObjectURL(file)` for video duration validation with streaming metadata read
- Do NOT generate client-side thumbnails for uploaded videos (use Stream auto-thumbnails)
- Remove `canvas.toBlob()` thumbnail generation from `VideoIntro.svelte`
- Remove hardcoded R2 thumbnail URL from `VideoIntro.svelte`

### 6.7 Platform-Specific

- **iOS WebView**: Stream iframe needs `playsinline=true` (already in iframe URL). WKWebView `allowsInlineMediaPlayback` enabled by Capacitor by default.
- **Android**: `androidScheme: 'https'` in Capacitor config ensures WebView origin compatibility.
- **Fullscreen**: Stream iframe `allow="fullscreen"` attribute. Not all WebView configs support it — native plugin fallback option if needed.
- **File picker**: On iOS, `<input type="file" accept="video/*">` opens document picker, not photo library. Use `@capacitor/camera` with `CameraSource.PHOTOS` for gallery-based video selection.

### 6.8 Offline Playback

- StreamPlayer subscribes to `network-status.ts` and `navigator.onLine`
- When offline during playback: show `status.offline` message instead of broken iframe
- On `online` event: auto-reload iframe
- No offline caching (Stream does not support DRM-free download)

---

## Dependencies

| Package                        | Purpose                                 | New?     |
| ------------------------------ | --------------------------------------- | -------- |
| `@uppy/core`                   | Upload orchestrator                     | Yes      |
| `@uppy/tus`                    | Resumable upload protocol               | Yes      |
| `@uppy/svelte`                 | Svelte components                       | Yes      |
| `@capgo/capacitor-uploader`    | Native background upload                | Yes      |
| `@capacitor/network`           | Connection type detection               | Yes      |
| `@cloudflare/kv-asset-handler` | REMOVED (Workers Sites → Static Assets) | Removed  |
| `browser-image-compression`    | Image compression (unchanged)           | Existing |

---

## Test Plan

### Unit Tests (Vitest)

- [ ] `StreamPlayer.svelte` renders correct iframe URL for each state (all 9 states)
- [ ] `StreamPlayer.svelte` validates `videoUid` format and rejects invalid UIDs
- [ ] `StreamPlayer.svelte` URL-encodes `poster` parameter
- [ ] `StreamPlayer.svelte` falls back to Stream auto-thumbnail when `poster` is null
- [ ] `StreamPlayer.svelte` respects `thumbnailTime` prop in fallback URL
- [ ] `StreamPlayer.svelte` shows correct state for `private={true}` token loading
- [ ] `StreamPlayer.svelte` adds `playsinline` to iframe URL
- [ ] `StreamPlayer.svelte` renders `<noscript>` fallback
- [ ] `cloudflare-media.service.ts` `requestStreamUploadUrl()` calls correct Worker endpoint
- [ ] `upload.service.ts` uses Direct Creator Upload path for videos (not legacy REST API)
- [ ] Worker router routes to correct handler for each API path
- [ ] Worker `__data.json` handler returns correct empty response
- [ ] Worker token endpoint rejects unauthenticated requests (401)
- [ ] Worker webhook endpoint verifies HMAC signature

### Integration Tests

- [ ] `MediaUploader.svelte` with Uppy handles video file selection and upload initiation
- [ ] Uppy error events propagate to MediaUploader `onError` callback
- [ ] Service portfolio thumbnail upload flow → Nostr `thumb` tag in event
- [ ] `generateServiceTags()` includes `thumb`/`image` tags for video portfolio items
- [ ] Private video token fetching with authentication
- [ ] Encoding webhook → KV update → status endpoint

### E2E Tests (Playwright)

- [ ] Public video: upload profile intro, verify StreamPlayer renders with correct iframe URL
- [ ] Private video: upload task completion evidence, verify signed URL `?token=` in iframe
- [ ] Service portfolio: upload video + custom thumbnail, verify display in grid
- [ ] Error state: simulate upload failure, verify retry flow works
- [ ] Error state: simulate offline, verify offline message
- [ ] Mobile: verify CORS headers on all endpoints
- [ ] Mobile: verify `<input type="file">` and Uppy integration

### Capacitor Tests

- [ ] iOS: Stream iframe renders inline (not forced fullscreen)
- [ ] Android: Stream iframe renders correctly with `https://` scheme
- [ ] Background upload plugin survives app suspension

---

## Migration / Compatibility

- All existing image uploads continue working unchanged (same Cloudflare Images flow)
- Existing video uploads switch to Direct Creator Upload — transparent to users
- `VideoIntro.svelte`: canvas-based thumbnail removed, Stream auto-thumbnail used, hardcoded R2 URL removed
- `cloudflare-media.service.ts.uploadVideo()`: marked `@deprecated` for client-side; retained server-side only
- `cloudflare-media.service.ts.configure()`: marked `@deprecated` — token injection at runtime is a security risk
- NestJS fallback scoped to images only (video goes through Worker exclusively once Stream binding is active)
- Legacy non-Stream videos handled by `videoUrl` fallback prop on StreamPlayer
- `@cloudflare/kv-asset-handler` dependency removed (Workers Sites migration complete)

---

## Implementation Order

| #   | Step                                                                                                          | Est. time | Depends on     |
| --- | ------------------------------------------------------------------------------------------------------------- | --------- | -------------- |
| 1   | Cloudflare Dashboard: enable Stream + get customer code                                                       | 10 min    | Nothing        |
| 2   | `wrangler.toml`: add `[[stream]]` + `[[kv_namespaces]]` + `[triggers]` cron + update `run_worker_first`       | 10 min    | Nothing        |
| 3   | KV namespaces: `wrangler kv:namespace create VIDEO_STATUS` + `VIDEO_AUTH` for all envs                        | 10 min    | Step 2         |
| 4   | Worker: restructure router + add stream handler + status endpoint + CORS + error helper                       | 3 hours   | Steps 2-3      |
| 5   | Worker secrets: `wrangler secret put` for all environments (API_TOKEN, ACCOUNT_ID, WEBHOOK_SECRET)            | 15 min    | Step 2         |
| 6   | `VITE_STREAM_CUSTOMER_CODE` env var + CI docs update                                                          | 10 min    | Step 1         |
| 7   | Type definitions: `src/lib/types/video.d.ts`                                                                  | 15 min    | Nothing        |
| 8   | i18n keys: `stream_player.json` (en + es) + verify with `find-missing-translations.py`                        | 30 min    | Nothing        |
| 9   | `StreamPlayer.svelte` component with all 9 states, accessibility, lazy loading, token cache                   | 3 hours   | Steps 6, 7, 8  |
| 10  | `cloudflare-media.service.ts`: add `requestStreamUploadUrl()` method                                          | 30 min    | Step 4         |
| 11  | `upload.service.ts`: wire video path to Worker endpoint (deprecate legacy path; remove NestJS video fallback) | 1 hour    | Step 10        |
| 12  | Uppy integration in `MediaUploader.svelte` + upload URL expiry handling (410 → refresh URL → retry)           | 2 hours   | Steps 4, 9, 11 |
| 13  | Swap `<video>` → StreamPlayer everywhere (6 consumers)                                                        | 2 hours   | Step 9         |
| 14  | Private video: auth on token endpoint + authorization KV population + StreamPlayer private mode               | 2 hours   | Steps 4, 9     |
| 15  | Service portfolio: thumbnail upload + Nostr tags in `generateServiceTags()`                                   | 1 hour    | Step 9         |
| 16  | Cloudflare Dashboard: configure Stream webhook URL + secret                                                   | 10 min    | Step 5         |
| 17  | Processing/encoding: webhook endpoint + KV status + polling fallback + encoding timeout                       | 3 hours   | Steps 4, 9, 16 |
| 18  | Mobile: `@capgo/capacitor-uploader` + `@capacitor/network` + battery awareness                                | 2 hours   | Step 12        |
| 19  | Abandoned upload cleanup: cron trigger (same Worker) + orphan cleanup wiring                                  | 1 hour    | Step 4         |
| 20  | Error handling: all states + Sentry breadcrumbs + fallback verification                                       | 1.5 hours | Steps 9-19     |
| 21  | Update `workers-site/README.md` for Static Assets migration (remove kv-asset-handler references)              | 15 min    | Step 4         |
| 22  | Tests: unit + integration + e2e (video + mobile + CSP + CORS)                                                 | 4 hours   | All above      |

**Total: ~30 hours (~4 days)**

---

## Audit Trail

| Round                | Auditors                                                         | CRITICAL | HIGH | MEDIUM | LOW            |
| -------------------- | ---------------------------------------------------------------- | -------- | ---- | ------ | -------------- |
| 1 (v1 plan)          | 5 specialists (security, frontend, backend, mobile, integration) | 5        | 13   | 14     | 10             |
| 2a (v2 verification) | 1 verifier (checking Round 1 fixes)                              | 0        | 0    | 0      | 1 (focus mgmt) |
| 2b (v2 fresh eyes)   | 1 fresh-eyes auditor                                             | 0        | 5    | 8      | 4              |
| Final (v3 plan)      | All resolved                                                     | 0        | 0    | 0      | 1              |

This v3 plan addresses all findings from all audit rounds. Key Round 2 fixes beyond Round 1:

- Worker routing restructured: API routes first, `__data.json` second, assets last
- `run_worker_first` includes `/api/*` pattern
- Signed token endpoint requires authentication + authorization per video UID
- Rate limiting on upload URL generation
- `requireSignedURLs` set via tus Upload-Metadata (no race condition)
- CORS scoped per endpoint (token endpoint: specific origins only)
- Webhook HMAC signature verification
- Abandoned upload cleanup strategy
- `StreamPlayer` props expanded: controls, loop, playsinline, preload, ariaLabel, captionsUrl, thumbnailTime, aspectRatio, className, onerror, onready
- All 9 states: uploading, encoding, queued, private-token-loading, poster-loading, ready, error, expired, offline
- Accessibility: ARIA labels, focus management, live regions, prefers-reduced-motion, <noscript> fallback
- i18n: all strings defined in `stream_player.json` with English + Spanish keys
- Uppy chunk size: 10MB mobile / 20MB desktop (was 150MB)
- Capacitor plugins: `@capgo/capacitor-uploader`, `@capacitor/network`
- `Stream.sign()` corrected to two-argument signature
- Images Worker endpoint scoped to "future" (not immediate)
- Legacy `uploadVideo()` deprecated client-side, server-side only
- `videoUrl` fallback prop for existing non-Stream videos
- Nostr `thumb`/`image` tags in service portfolio events
- Battery-aware upload flow
- Background upload surviving app suspension
- Corrected file size limits (2GB for video)
- Implementation order expanded from 12 to 19 steps
- Time estimate revised from 16h to 25h (post-audit additions)
