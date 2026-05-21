# Cloudflare Streams — Developer Guide

---

## 1. What Cloudflare Streams Is

Cloudflare Streams is a **video encoding, storage, and delivery service** — it takes raw video files and turns them into a streaming-ready format your users can watch. Think of it as "YouTube's backend, but you own it and embed it in your own app."

### The three things it does

| Thing       | What happens                                                                                                                  | Why you need it                                                                                                         |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| **Ingest**  | Your app uploads a raw video file (mp4, mov, webm, etc.) to Cloudflare's servers via a one-time upload URL                    | You don't build or run upload servers                                                                                   |
| **Encode**  | Cloudflare automatically transcodes the video into multiple bitrates and formats (H.264, VP9, etc.) so it plays on any device | You don't manage ffmpeg, bitrate ladders, or codec compatibility                                                        |
| **Deliver** | Cloudflare serves the video through its global CDN via an iframe embed or HLS/DASH manifest URL                               | You get adaptive bitrate streaming for free — the player automatically adjusts quality based on the viewer's connection |

### Key concept: Direct Creator Upload

This is the **primary upload mechanism**. Instead of your server receiving the file and forwarding it to Cloudflare (which would burn your server's bandwidth), you:

1. Ask Cloudflare's API for a **one-time upload URL** (valid for ~30 minutes)
2. Give that URL to the client (browser or mobile app)
3. The client uploads directly to Cloudflare using HTTP PUT or the tus resumable upload protocol

Your server never touches the video bytes. This is critical for a mobile app — users on cellular can upload 500MB videos without your infrastructure paying the bandwidth cost.

### Key concept: Signed URLs (private videos)

By default, anyone who knows a video's UID can embed it. For private content (task evidence, contract videos, DMs), you enable `requireSignedURLs` on the video and generate short-lived JWT tokens at your Worker. The iframe URL gets `&token=<jwt>` appended. Without a valid token, the video won't play — even if someone extracts the UID from the DOM.

### Key concept: Webhooks

Cloudflare Stream writes webhooks to a URL of your choice when a video's encoding state changes (`ready`, `error`, `inprogress`). Your Worker stores the updated state in KV (key-value store), so the client can poll the status without hitting Cloudflare's API directly (which would expose an API token). Webhooks URLs are signed with HMAC-SHA256 — verify the signature before trusting the payload.

---

## 2. Architecture in BitTasker

```
┌─────────────────────────────────────────────────────────────────┐
│  CLIENT (SvelteKit SPA / Capacitor mobile)                       │
│                                                                   │
│  src/lib/api/services/cloudflare-media.service.ts                │
│    requestStreamUploadUrl()  ──── fetches one-time upload URL    │
│                                                                   │
│  src/lib/utils/video-upload.ts                                   │
│    uploadVideoFile()  ──── platform-aware chunked upload         │
│    checkUploadWarnings() ── cellular/battery/large-file checks  │
│                                                                   │
│  src/lib/components/StreamPlayer.svelte                          │
│    9-state player — offline / uploading / encoding / queued      │
│    / error / expired / ready / token-loading / poster-loading   │
└───────────────┬─────────────────────────────────────────────────┘
                │  POST /api/cloudflare/stream/upload-url
                │  GET  /api/cloudflare/stream/token/:uid
                │  GET  /api/cloudflare/stream/status/:uid
                ▼
┌─────────────────────────────────────────────────────────────────┐
│  WORKER (workers-site/handlers/stream.js)                        │
│                                                                   │
│  POST /upload-url   → env.STREAM.createDirectUpload()            │
│  GET  /token/:uid   → env.STREAM.video(uid).generateToken()     │
│  GET  /status/:uid  → read KV (VIDEO_STATUS)                    │
│  POST /webhook      → verify HMAC → write KV                    │
└───────────────┬─────────────────────────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────────────────────────┐
│  CLOUDFLARE STREAM API                                           │
│                                                                   │
│  Direct Creator Upload  → generates one-time tus URL             │
│  Encoding pipeline     → H.264 + VP9, multiple bitrates          │
│  Signed tokens         → JWT with configurable expiry             │
│  Webhooks              → push encoding state changes             │
│  Auto-thumbnails       → thumbnail.jpg?time=2s                   │
└─────────────────────────────────────────────────────────────────┘
```

### The upload flow, step by step

1. **User picks a video file** (file input or Capacitor camera plugin)
2. **Pre-flight checks**: `checkUploadWarnings()` warns if >100MB, on cellular, or battery <20%
3. **Fetch upload URL**: `POST /api/cloudflare/stream/upload-url` → Worker calls `env.STREAM.createDirectUpload({ maxDurationSeconds: 600 })` → returns `{ uploadURL, uid }`
4. **Upload the bytes**:

- **Web**: `tus-js-client` chunks the file into 10MB pieces, uploads via HTTP PATCH with automatic retry
- **Native (iOS/Android)**: `@capgo/capacitor-uploader` hands off to OS-level upload (survives app backgrounding)

5. **Cloudflare encodes the video** (takes seconds to minutes, depending on length and resolution)
6. **StreamPlayer shows encoding state**: polls `GET /api/cloudflare/stream/status/:uid` every 30s until `ready` or `error`
7. **User watches**: StreamPlayer renders an iframe from `https://customer-{CODE}.cloudflarestream.com/{uid}/iframe`

---

## 3. Best Practices for Video Features

### 3.1 Upload — don't let users shoot themselves in the foot

**Validate before upload, not after.** Check file size, duration, and format client-side before requesting the upload URL. Getting the URL first and then failing wastes a one-time URL.

```typescript
// From src/lib/utils/video-upload.ts — pre-upload checks
const warnings = await checkUploadWarnings(file.size);
// → warns at >100MB (large file), >50MB on cellular, battery <20%
```

**Use chunked/resumable uploads.** Never upload a video with a single `fetch()` or `XMLHttpRequest`. If the connection drops at 95%, the user starts over. Use `tus-js-client` (web) or `@capgo/capacitor-uploader` (native) — both support resuming from the last successful chunk.

```typescript
// tus-js-client configuration (from video-upload.ts:191)
new Upload(file, {
	endpoint: uploadURL,
	chunkSize: 10 * 1024 * 1024, // 10MB — optimal for mobile
	retryDelays: [0, 3000, 5000, 10000, 20000] // exponential backoff
});
```

**Chunk size matters.** Too small (<1MB) = too many HTTP requests = slow. Too large (>50MB) = memory pressure on mobile, and a single failed chunk wastes a lot of progress. 10MB is the sweet spot for 4G/5G.

**Cap max duration server-side.** Your Worker caps `maxDurationSeconds` at 600 (10 minutes). This prevents abuse — someone uploading a 2-hour 4K video as their "profile intro." Stream charges by minutes stored and minutes streamed.

**Mobile background upload is non-negotiable.** On iOS, the WebView suspends JavaScript within seconds of the app going to background. If the user switches to another app during a 200MB upload, a JavaScript-based upload (Uppy, tus-js-client) will die. `@capgo/capacitor-uploader` uses native `URLSession` (iOS) and `ForegroundService` (Android) to keep the upload alive.

### 3.2 Playback — the player must handle every state

A video player isn't just a `<video>` or `<iframe>` tag. It renders different content for every state. The BitTasker `StreamPlayer.svelte` handles 9 states:

| State                   | When                             | What the user sees               |
| ----------------------- | -------------------------------- | -------------------------------- |
| `offline`               | `navigator.onLine === false`     | "No internet connection" message |
| `uploading`             | During upload                    | Progress bar with percentage     |
| `encoding`              | Cloudflare is transcoding        | Skeleton pulse + "Processing..." |
| `queued`                | Encoding queue (120-video limit) | "Video is queued..."             |
| `private-token-loading` | Fetching JWT for private video   | Spinner overlay                  |
| `poster-loading`        | Thumbnail image is loading       | Skeleton pulse                   |
| `ready`                 | Video playable                   | Cloudflare Stream iframe         |
| `error`                 | Encoding/upload/network failure  | Error message + retry button     |
| `expired`               | Signed token expired (>1 hour)   | "Link expired" + refresh button  |

**Every interactive element needs a loading, disabled, and error state.** The retry button in error state, the refresh button in expired state — these are minimum requirements, not polish.

**Lazy-load iframes.** Each Cloudflare Stream iframe loads resources from Cloudflare's CDN. In gallery views (service portfolio, contract evidence), mounting more than ~4 simultaneous iframes will degrade performance. Show a poster thumbnail with a play button overlay. Only mount the iframe when the user clicks to play.

**Accessibility is not optional.** Every `<iframe>` needs a `title` attribute. Error and status changes need `role="alert"` and `aria-live="polite"`. Interactive elements (retry/refresh buttons) need 44px minimum touch targets. Focus management: when entering error/expired state, auto-focus the retry button so keyboard users can act immediately.

**Playsinline is critical for iOS.** Without `playsinline` on the iframe URL, iOS Safari and WKWebView will force the video into fullscreen mode — a terrible experience for profile intros and embedded portfolio videos. This is already set to `true` by default in StreamPlayer.

**Preconnect to Stream's CDN.** Add a `<link rel="preconnect">` to your root layout for `https://customer-{CODE}.cloudflarestream.com`. Without it, the browser delays the first iframe load by an extra DNS lookup + TLS handshake (~200-400ms).

### 3.3 Network awareness — mobile is not desktop

**Cellular is expensive and slow.** Before starting an upload >50MB on cellular, show a confirmation dialog. Users on metered connections should not be surprised by a 300MB data charge.

**Battery awareness.** If the battery is below 20%, warn the user that the upload may be interrupted. A large upload on low battery is a recipe for frustration.

**Offline is normal.** This is a mobile app. The player subscribes to `navigator.onLine` and the app's `network-status.ts` store. When offline, don't show a broken iframe — show an explicit offline state. When connectivity returns, auto-reload.

**Upload URL timeout.** Direct Creator Upload URLs expire after ~30 minutes. For very large files on slow connections, the tus client will get a 410 Gone response if the URL expires mid-upload. Handle this: detect 410, fetch a fresh upload URL, and resume.

### 3.4 Private videos — signed URLs, not obscurity

**Never rely on "nobody will guess the UID."** Cloudflare Stream video UIDs are not secrets — they appear in the DOM, network tab, and browser history. For task evidence, contract videos, and DMs, use signed URLs.

**Signed token flow:**

1. StreamPlayer sets `private={true}`
2. On mount, fetches `GET /api/cloudflare/stream/token/{uid}` (with auth cookie or header)
3. Worker validates the user has permission to view this video
4. Worker calls `env.STREAM.video(uid).generateToken()` → returns JWT
5. JWT appended to iframe URL: `&token=<jwt>`
6. Token valid for 1 hour; player auto-refreshes 5 minutes before expiry

**Cache tokens aggressively.** Don't re-fetch the token on every component remount (e.g., tab switches in a drawer). The player caches tokens in-memory and only refreshes when within 5 minutes of expiry.

**CORS on the token endpoint must be restrictive.** The upload URL endpoint can have `Access-Control-Allow-Origin: `\* because the URL itself is self-securing (one-time use). The token endpoint must restrict to specific origins — otherwise any website could fetch signed tokens for your users' private videos.

### 3.5 Encoding — it's async, plan for it

**Encoding is not instant.** A 2-minute 1080p video takes ~30-90 seconds to encode. A 10-minute 4K video can take 10+ minutes. The user needs to see progress, not a frozen screen.

**Primary: webhooks.** Configure Cloudflare Stream to POST to your Worker when encoding completes. The Worker verifies the HMAC signature and stores the state in KV. This is push-based — no polling needed.

**Fallback: polling.** When the webhook hasn't fired yet (or isn't configured), poll `GET /api/cloudflare/stream/status/:uid` every 30 seconds. Only poll while the component is visible (use Intersection Observer). Stop on unmount.

**Encoding timeout.** If the video is still "encoding" or "queued" after 30 minutes, something is wrong (webhook misconfigured, encoding failed silently). Transition to an error state with "please try re-uploading" — don't leave the user in an infinite loading state.

### 3.6 Thumbnails — use what Stream gives you

**Don't generate thumbnails client-side.** Pulling a video file into a `<video>` element, seeking to a frame, and drawing to `<canvas>` is slow, memory-intensive, and broken on mobile. BitTasker used to do this in `VideoIntro.svelte` — it was removed in favor of Stream auto-thumbnails.

**Stream auto-thumbnails are free.** `https://customer-{CODE}.cloudflarestream.com/{uid}/thumbnails/thumbnail.jpg?time=2s` gives you a thumbnail at the 2-second mark. No code needed.

**Custom thumbnails for service portfolios.** Users can optionally upload a custom thumbnail image for their portfolio videos. This reuses the existing Cloudflare Images upload flow — no new infrastructure needed.

### 3.7 Monitoring — you can't fix what you can't see

**Log every state transition as a Sentry breadcrumb.** The player already does this: upload started/completed/failed, token fetch success/error, iframe loaded, state changes. These breadcrumbs are the only debugging tool in production — there are no server-side logs for the client.

**Watch for orphaned videos.** Direct Creator Upload creates a video entry before the upload starts. If the user abandons the upload, that video stays in `pendingupload` state forever. The weekly cron Worker (Sunday 3am UTC) queries for `pendingupload` videos older than 24 hours and deletes them. Don't skip setting up this cron — abandoned uploads cost storage money.

---

## 4. What's Implemented vs What's Left

### Done and deployed (`feat/workers-seo-video` → `worker.dev.bittasker.com`)

- **StreamPlayer.svelte** — 9-state player with accessibility, i18n (en/es), and Sentry breadcrumbs
- **Worker API** — 4 endpoints (upload URL, token, status, webhook) with CORS and auth gates
- **Upload pipeline** — tus-js-client (web) + @capgo/capacitor-uploader (native) with battery/cellular checks
- **Consumer integration** — VideoIntro, ServicePortfolio, ContractDrawer, ContractDrawerNDK, TaskDetailsView, TaskReview
- **Type definitions** — `src/lib/types/video.d.ts`
- **i18n** — `static/locales/{en,es}/stream_player.json`
- **Tests** — 35 unit tests (21 StreamPlayer states + 14 Worker handler)

### Needs to be done

| Item                    | What to do                                                                                                     | Where                  |
| ----------------------- | -------------------------------------------------------------------------------------------------------------- | ---------------------- |
| Purchase Stream storage | Cloudflare Dashboard → Stream → buy minutes                                                                    | Cloudflare Dashboard   |
| Create API token        | Account → Stream → Edit + Read                                                                                 | Cloudflare Dashboard   |
| Set Worker secrets      | `wrangler secret put CLOUDFLARE_API_TOKEN` for dev/staging/prod                                                | CLI                    |
| Create KV namespaces    | `wrangler kv:namespace create VIDEO_STATUS` (dev/staging/prod), uncomment bindings in `wrangler.toml`          | CLI                    |
| Configure webhook       | Dashboard → Stream → Settings → Webhook URL → `https://worker.dev.bittasker.com/api/cloudflare/stream/webhook` | Cloudflare Dashboard   |
| Set webhook secret      | `wrangler secret put CLOUDFLARE_STREAM_WEBHOOK_SECRET`                                                         | CLI                    |
| E2E tests               | Playwright tests for upload → encoding → playback flow                                                         | `tests/e2e/`           |
| Full Uppy Dashboard UI  | Replace bare file inputs with Uppy Dashboard for drag-and-drop + progress                                      | `MediaUploader.svelte` |

### Quickest path to working video upload

1. Purchase Stream storage in Cloudflare Dashboard ($5 per 1,000 minutes stored)
2. Create API token with Stream:Edit + Stream:Read
3. Run `wrangler secret put CLOUDFLARE_API_TOKEN -e dev`
4. Run `wrangler secret put CLOUDFLARE_ACCOUNT_ID -e dev` (account ID: `0e47af3ee55b77b43b150879938ebbec`)
5. Deploy: `npx wrangler deploy -e dev`

After these 5 steps, video upload and playback will work end-to-end on `worker.dev.bittasker.com`. KV namespaces and webhooks can follow to enable encoding status tracking and private videos.

---

## 5. Key Files Reference

| File                                               | What it does                                      | Read when            |
| -------------------------------------------------- | ------------------------------------------------- | -------------------- |
| `src/lib/components/StreamPlayer.svelte`           | The video player. All 9 states.                   | Any playback bug     |
| `src/lib/utils/video-upload.ts`                    | Upload logic. Chunked, platform-aware.            | Upload failures      |
| `src/lib/api/services/cloudflare-media.service.ts` | API client. `requestStreamUploadUrl()`.           | Upload URL issues    |
| `src/lib/api/services/upload.service.ts`           | Upload orchestrator. Cloudflare-first strategy.   | Upload flow changes  |
| `workers-site/handlers/stream.js`                  | Worker API. All 4 endpoints + HMAC verification.  | Backend issues       |
| `workers-site/index.js`                            | Worker router. API-first routing.                 | Routing/404 issues   |
| `wrangler.toml`                                    | Worker config. Stream binding, KV bindings, cron. | Deployment config    |
| `src/lib/types/video.d.ts`                         | All video types.                                  | Type errors          |
| `static/locales/en/stream_player.json`             | English UI strings.                               | Missing translations |
| `static/locales/es/stream_player.json`             | Spanish UI strings.                               | Missing translations |

---

## 6. Debugging Tips

**"Failed to create upload URL"** → The Worker's `STREAM` binding isn't connected to a Cloudflare account with Stream enabled. Check that Stream storage is purchased and the API token has Stream permissions.

**"Video won't play — iframe loads but stays blank"** → The video is still encoding or the UID is wrong. Check `GET /api/cloudflare/stream/status/{uid}`. Check browser console for CSP errors (missing `frame-src https://customer-*.cloudflarestream.com`).

**"Upload always fails on mobile"** → If it's a large file and the user backgrounded the app, the WebView upload died. The native uploader (`@capgo/capacitor-uploader`) isn't wired in yet — check `isNativePlatform` detection in `video-upload.ts`.

**"Token endpoint returns 401"** → The user isn't authenticated. The token endpoint checks for an `Authorization` header or session cookie. If you're calling it from a non-browser context, include the header.

**"Webhook isn't updating KV"** → The webhook secret in the Worker (`CLOUDFLARE_STREAM_WEBHOOK_SECRET`) doesn't match the one configured in the Cloudflare Dashboard. Or the KV namespace isn't created yet — check `wrangler.toml` for uncommented `[[kv_namespaces]]` blocks.

**"StreamPlayer shows 'error' state after deployment"** → Check that `VITE_STREAM_CUSTOMER_CODE` is set in the CI environment. It's `customer-h1uh9jc2wp9hnxue` for all environments. Without it, the iframe URL is malformed.
