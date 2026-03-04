# PWA InjectManifest Risk Mitigation Review and Implementation Plan

## Scope

Implement full PWA support using `@vite-pwa/sveltekit` with `injectManifest`, while preserving Firebase background push behavior and reducing operational risk on Cloudflare Workers.

This plan is intentionally conservative because BitTasker includes high-stakes user flows (wallet, contracts, bids, auth).

## Current State (Verified)

- Manifest is linked in app head: `src/routes/+layout.svelte`.
- Manifest file exists: `static/site.webmanifest`.
- Firebase service worker exists: `static/firebase-messaging-sw.js`.
- Firebase SW is manually registered from app code: `src/lib/utils/helpers/fcm.ts`.
- `@vite-pwa/sveltekit` will be the integration layer in `vite.config.ts` (with `injectManifest` strategy).
- Cloudflare Worker currently applies broad cache TTL rules in `workers-site/index.js`.

## Recommended Target Behavior

1. Offline capability:

- App shell + static assets available offline.
- Public read-only pages cached with stale-while-revalidate.
- Authenticated pages use network-first with offline fallback page.
- Sensitive API calls (wallet, contracts, bids, messages, auth/session) remain network-only.

2. Update behavior:

- Use `registerType: 'prompt'`.
- Show update prompt UI (Update now / Later) instead of auto-refresh.

3. Platform targets:

- Web desktop + mobile browsers, Safari/iOS, Android Chrome.
- One root-scope SW only.

## Primary Risks and Mitigations

### R0: Advisory chain in current PWA plugin ecosystem

Severity: High
Likelihood: High
Risk: Current stable `@vite-pwa/sveltekit` depends on `vite-plugin-pwa` and may still surface transitive audit findings (`workbox-build` / `serialize-javascript`) depending on npm advisory state.
Mitigation:

- Proceed with `@vite-pwa/sveltekit` for SvelteKit integration and maintainability.
- Track upstream advisories/issues and update promptly.
- Treat this as a documented risk acceptance item until upstream chain is fully clean.
- Keep rollback switch and canary gating mandatory.

### R1: Dual service worker conflict (PWA SW vs Firebase SW)

Severity: Critical
Likelihood: High
Risk: Competing root SW registration breaks push/offline/update behavior unpredictably.
Mitigation:

- Use single SW via `injectManifest`.
- Merge Firebase messaging/background handlers into injected SW.
- Remove separate runtime registration of `/firebase-messaging-sw.js` once merged.

### R2: Stale SW due to CDN/edge cache

Severity: High
Likelihood: High
Risk: Users remain on old SW; updates/security fixes delayed.
Mitigation:

- Explicit cache headers for SW/manifest:
  - SW file: `Cache-Control: no-cache, no-store, must-revalidate`.
  - Manifest: short TTL or must-revalidate.
- Verify Cloudflare Worker does not apply long TTL to SW/manifest.

### R3: Offline cache serves stale sensitive data

Severity: High
Likelihood: Medium
Risk: Wrong wallet/task/contract/message state shown offline.
Mitigation:

- Network-only for sensitive API endpoints.
- Network-first for authenticated routes.
- Offline fallback page only, no aggressive data caching for private state.

### R4: Update prompt or SW lifecycle bugs disrupt active sessions

Severity: Medium
Likelihood: Medium
Risk: Form/message state loss, UX confusion.
Mitigation:

- Prompt-based updates only.
- Do not force `skipWaiting` without explicit user action.
- E2E tests for update flow.

### R5: iOS Safari/PWA behavioral differences

Severity: Medium
Likelihood: Medium
Risk: Push/offline inconsistencies on iOS installed web app.
Mitigation:

- Platform-specific validation matrix (Safari+iOS installed app path).
- Graceful fallback where push capability is unavailable.

## Implementation Plan (Phased)

### Phase 0: Safety Prep

- Create feature flag for PWA registration (env-driven).
- Add baseline telemetry events:
  - SW install/activate/update available/update accepted/offline ready.
- Define rollback switch (disable registration flag).

Exit criteria:

- Feature flag and telemetry merged.
- Rollback behavior documented.

### Phase 1: SW Unification with InjectManifest

- Add `SvelteKitPWA` config in `vite.config.ts` using `injectManifest`.
- Create custom injected SW source (new file) that includes:
  - Workbox precache + route handlers.
  - Existing Firebase background messaging + notification click logic.
- Ensure only one root SW is registered from client code.
- Remove legacy direct registration path for `firebase-messaging-sw.js` from runtime flow.

Exit criteria:

- Single SW active in browser devtools.
- Push notifications still work in foreground/background.
- Build produces expected SW artifact.

### Phase 2: Caching Policy Hardening

- Apply route strategy rules:
  - Public pages: SWR.
  - Auth pages: network-first + fallback.
  - Sensitive APIs: network-only.
- Cloudflare Worker header exceptions for SW/manifest files to prevent long-term edge/browser caching.
- Confirm SPA fallback does not rewrite SW/manifest requests.

Exit criteria:

- SW/manifest response headers are correct in deployed env.
- Sensitive API responses are not cached by SW.

### Phase 3: Update UX + Offline UX

- Implement update prompt component wired to PWA register callbacks.
- Implement offline-ready notification.
- Add offline fallback page/message for network-first route failures.

Exit criteria:

- Manual test: new deploy shows update prompt and updates safely.
- Offline mode behaves as designed.

### Phase 4: Validation and Controlled Rollout

- Run full regression suite + PWA E2E smoke tests.
- Canary release in dev/staging domain.
- Observe telemetry for SW errors, update churn, push failures.
- Promote to production with rollback switch ready.

Exit criteria:

- No critical regressions in canary period.
- Production rollout approved.

## Test Plan (Required for 98% Confidence)

### Automated

1. Unit tests:

- SW registration state handling (supported/unsupported browser).
- Update prompt state transitions.

2. Integration tests:

- Push helper behavior with active SW registration.
- Notification click navigation message handling.

3. E2E tests:

- PWA registration occurs once.
- Offline public route still renders shell/fallback.
- Authenticated sensitive pages fail gracefully offline (no stale fake data).
- Update prompt appears after new build and applies on user confirm.

### Manual matrix

- Chrome desktop
- Safari desktop
- iOS Safari + installed Home Screen app
- Android Chrome (installed and normal tab)

Validate on each:

- Installability
- Offline behavior
- Push permission + receipt path
- Notification click routing
- Update prompt behavior

## Cloudflare-Specific Validation Checklist

1. HTTPS and same-origin SW scope verified on final production hostname.
2. SW and manifest cache headers verified via response inspection in dev/staging/prod.
3. `workers-site/index.js` rules confirm SW/manifest not cached long-term.
4. SPA fallback does not intercept `/sw.js` (or chosen SW path), manifest, and worker scripts.
5. No conflicting rewrite/redirect rules for SW endpoints.

## Rollback Plan

- Immediate: disable client SW registration via feature flag.
- Redeploy quickly with SW registration disabled.
- Keep push fallback behavior documented during rollback window.
- Postmortem with telemetry and browser-specific failure analysis.

## Complexity Estimate

- Engineering: Medium-High
- Time: 2-4 days implementation + 1-2 days staged validation/canary
- Main complexity driver: safe merge of Firebase messaging SW logic into a single injected SW and Cloudflare cache semantics.
- Note: Using `@vite-pwa/sveltekit` lowers integration complexity vs generic plugin wiring, but does not remove current transitive advisory management work.

## Go/No-Go Criteria

Go only if all pass:

1. Single SW confirmed in all target platforms.
2. Push behavior unchanged or improved.
3. No stale sensitive data offline.
4. Update prompt works without user data loss.
5. Cloudflare caching for SW/manifest verified.

No-Go triggers:

- Duplicate SW registration detected.
- Push delivery regression.
- Incorrect cached auth/wallet/task data.
- Uncontrolled SW update lag from caching.
