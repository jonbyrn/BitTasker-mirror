# E2E Signup & Onboarding Plan

This plan answers whether we can run a Playwright e2e test for the **full signup and onboarding experience** and have it run in the CI/CD pipeline, including against the **dev backend on Cloudflare**. It documents feasibility, caveats, and a concrete path to implement.

**Related docs:**

- [testing-pipeline-improvement-plan.md](./testing-pipeline-improvement-plan.md) – CI test set, Playwright location, E2E consolidation.
- [workers-ci-setup-walkthrough.md](./workers-ci-setup-walkthrough.md) – GitLab CI variables and environments.
- [../src/lib/tests/e2e/docs/e2e-account-creation-challenge.md](../src/lib/tests/e2e/docs/e2e-account-creation-challenge.md) – Detailed account-creation flow, Turnstile/WebAuthn/backend notes.
- [../requirements/details/authentication-flow.md](../requirements/details/authentication-flow.md) – Auth flow (passkey, master key, nsec, recovery).

---

## 1. Short Answer

**Yes, it is possible** to have an e2e test that covers the whole onboarding experience (signup → Turnstile → onboarding steps → dashboard) and to run it in CI, including against the Cloudflare dev backend. Success depends on:

1. **Turnstile** – Bypass or test key in CI (no human to solve captcha).
2. **WebAuthn** – Playwright’s CDP virtual authenticator for both **creating** a passkey (during PasskeySetup) and **using** it (login). Already partially in place in `src/lib/tests/e2e/fixtures/auth.ts`.
3. **Backend** – E2E must run against a real API (e.g. dev backend on Cloudflare). The frontend is built or served with the correct `VITE_API_URL` (and related env) for that backend.
4. **Test isolation** – Unique username per run; optional cleanup or dedicated test backend to avoid pollution.
5. **CI** – Set `VITE_API_URL` so the app (started by Playwright’s webServer) calls the dev backend; no other URL config needed.

---

## 2. How E2E and the backend work (Playwright config)

We **do not** test against a local API. There is no local backend. The flow is:

| What | Role |
|------|------|
| **Web server** | Playwright runs **`npm run build && npm run preview`** (webServer in config). The build bakes in `VITE_E2E_TURNSTILE_BYPASS` and `VITE_API_URL`; preview serves the built app on **port 4173**. The browser loads from `http://localhost:4173` (baseURL). This avoids Vite dev cold start and hydration flakiness. |
| **VITE_API_URL** | Set in env when the build runs (local and CI). The **frontend** bundle uses it for API/GraphQL requests (e.g. username availability). Set `VITE_API_URL` to your dev backend base URL. |
| **VITE_E2E_TURNSTILE_BYPASS** | Passed as env into the build by Playwright’s webServer. The signup page skips Turnstile when `true`. |

- **Local:** `VITE_API_URL=https://your-dev-api.example.com npx playwright test tests/e2e/signup-onboarding.spec.ts --project=chromium`
- **CI:** Set **VITE_API_URL** in CI/CD variables; the Playwright job’s webServer runs build + preview with that env.

---

## 3. App Flows We Want to Test

Two user journeys matter for “signup + onboarding” e2e:

| Flow | Entry | Steps | What we need in e2e |
|------|--------|--------|----------------------|
| **A. Signup → Onboarding** | `/auth/signup` | Turnstile → `/auth/onboarding` → Username → PasskeySetup (create passkey + register) → (optional recovery/profile/location) → Complete → Dashboard | Turnstile bypass; virtual authenticator for **registration**; backend for registerWithMasterKey, registerPasskeyDevice, loginWithPasskey. |
| **B. Login with nsec (new user)** | `/auth/login` | Enter nsec → backend creates user → create passkey → onboarding or dashboard | No Turnstile; virtual authenticator for **registration** after nsec login; backend for loginWithNostr, registerPasskeyDevice. |

Flow A matches “generic signup” (signup page then onboarding). Flow B matches “first-time nsec login” from the auth deep dive. Both end with a passkey on the virtual authenticator and a session; both require the backend and WebAuthn.

---

## 4. Caveats (What Can Go Wrong)

### 4.1 Turnstile (captcha)

- **Issue:** In CI there is no human to complete the Cloudflare Turnstile widget. The “Continue” button on signup stays disabled until `isCaptchaVerified` is true (after successful `verifyTurnstileToken`).
- **Options:**
  1. **Backend test mode** – If the dev backend supports a test Turnstile site key or a bypass (e.g. special token or header), use that in CI. Requires backend change or configuration.
  2. **Frontend test bypass** – In e2e/test build only: e.g. `VITE_E2E_TURNSTILE_BYPASS=true` and on `/auth/signup` the app sets `isCaptchaVerified.set(true)` and enables the button without calling Turnstile. Requires a small, guarded code path in the signup page or layout.
  3. **Skip signup page in CI** – E2E starts at `/auth/onboarding` with a test-only route or query that sets `isCaptchaVerified` (e.g. `/auth/onboarding?e2e=1` and layout sets captcha verified when `e2e=1`). Avoids Turnstile entirely but diverges from real user path.

**Decision (implemented):** We use **Option 2 – Frontend bypass**. When `VITE_E2E_TURNSTILE_BYPASS=true`, the signup page sets `isCaptchaVerified.set(true)` in `onMount` and skips loading/using the Turnstile widget. The auth layout also allows onboarding when this env is set (so we don’t rely on store timing). Playwright’s webServer passes this env into the build, so no backend change is required and the test path matches the real user path (signup page → Continue → onboarding).

### 4.2 WebAuthn / passkey in CI

- **Registration (PasskeySetup):** The app calls `navigator.credentials.create()` (or Capacitor WebAuthn). Playwright’s **CDP virtual authenticator** can receive this credential so long as the **same browser context** that will later be used for login has the virtual authenticator attached **before** the page runs.
- **Assertion (login):** Same context later uses `navigator.credentials.get()`; the virtual authenticator can respond with the credential created during onboarding.
- **Current state:** `src/lib/tests/e2e/fixtures/auth.ts` already enables a virtual authenticator via CDP (`WebAuthn.enable`, `WebAuthn.addVirtualAuthenticator`) and uses it for **login**. For full signup e2e we must use this same fixture (or the same pattern) when running the **signup → onboarding** flow so that PasskeySetup’s “create passkey” stores the credential in that virtual authenticator.
- **Browser:** Virtual authenticator is supported in **Chromium** (CDP). CI should run the signup/onboarding e2e with the `chromium` project (as today’s Playwright job does for smoke).
- **Caveat:** If the app or Turnstile loads in a way that creates extra contexts or iframes, ensure the virtual authenticator is on the right context (the one that runs the app).

### 4.3 Backend (Cloudflare dev)

- **Requirement:** Registration and login call real APIs: `verifyTurnstileToken`, `checkUsernameAvailability`, `registerWithMasterKey`, `registerPasskeyDevice`, `loginWithPasskey` (and for nsec flow: `getLoginChallenge`, `loginWithNostr`). So a **live backend** is required for full signup e2e.
- **Using dev backend:** We use **local app + remote API**: the app runs via Playwright’s webServer and is given `VITE_API_URL` (e.g. your Cloudflare dev API). Set `VITE_API_URL` in the CI job (GitLab variables) and when running locally so the frontend can call the dev backend.
- **CORS / cookies:** The dev backend must allow the origin `http://localhost:4173` (preview server) so API/GraphQL requests from the app succeed.
- **Availability:** If the dev backend is down or slow, e2e will fail. Consider a simple health check or retry, and document that signup e2e depends on dev backend.

### 4.4 Test user and isolation

- **Username:** `checkUsernameAvailability` rejects duplicates. E2E must use a **unique username per run** (e.g. `e2e-${Date.now()}` or `e2e-${CI_JOB_ID}`) so concurrent or repeated runs don’t conflict.
- **Nostr key:** For Flow B (nsec login), each run can generate or use a dedicated test nsec; for Flow A, PasskeySetup generates a new keypair per run. No server-side user exists until registration completes.
- **Cleanup:** Real users are created on the dev backend. Options: (1) no cleanup (dev DB accumulates test users), (2) backend “test user” cleanup endpoint or job, (3) dedicated test environment that can be reset. Document the chosen policy.

### 4.5 Flakiness and CI stability

- **Build + preview (adopted):** We run **`npm run build && npm run preview`** instead of `npm run dev`. This removes Vite cold start and hydration timing issues; the signup-onboarding test runs smoothly in CI without retries.
- **Network:** Calls to Cloudflare backend can be slow or transiently failing. Playwright’s `retries: 2` in CI remains as a safety net.
- **WebAuthn timing:** Virtual authenticator should respond quickly; if the app has long timeouts or retries, ensure they don’t conflict with Playwright’s timeouts when we add the passkey step.

### 4.6 Where tests live and what CI runs

- **Current:** Playwright `testDir` is `./tests/e2e`; CI runs `npx playwright test --project=chromium tests/e2e/smoke.spec.ts`. Auth fixtures and auth-flow specs live under `src/lib/tests/e2e/` and are **not** run by default.
- **For signup/onboarding e2e:** Either:
  - **Consolidate:** Move (or copy) the auth fixture and the new signup/onboarding spec into `tests/e2e/` so one Playwright config and one CI job run everything (smoke + signup), or
  - **Second config/project:** Keep signup e2e in `src/lib/tests/e2e/` and add a CI job that runs Playwright with a config (or test path) that includes that directory.

The [testing-pipeline-improvement-plan](./testing-pipeline-improvement-plan.md) recommends consolidating into `tests/e2e/`. That keeps a single place for e2e and avoids path confusion.

---

## 5. What We Need to Implement

### 5.1 Prerequisites

| Prerequisite | Owner | Notes |
|--------------|--------|------|
| Turnstile bypass or test key for CI | Frontend or backend | See §3.1. |
| Virtual authenticator used during signup | E2E | Use same CDP setup as in `src/lib/tests/e2e/fixtures/auth.ts` for the spec that runs signup → PasskeySetup. |
| Backend URL for e2e | CI / env | `VITE_API_URL` (and any other `VITE_*` the app needs) pointing to Cloudflare dev (or test) backend. |
| Unique username per run | E2E | Generate in test (e.g. `e2e-${Date.now()}`) and use in UsernameSetup. |
| Backend for e2e | CI / env | Set `VITE_API_URL` so the app (started by webServer) calls the dev backend. |

### 5.2 Test design (high level)

1. **Spec file:** e.g. `tests/e2e/signup-onboarding.spec.ts` (after consolidation) or `src/lib/tests/e2e/signup-onboarding.spec.ts`.
2. **Fixture:** Reuse or re-export the auth fixture that adds the CDP virtual authenticator (so PasskeySetup’s `credentials.create` and later login’s `credentials.get` both use it).
3. **Flow A (signup → onboarding):**
   - Go to `/auth/signup`.
   - Resolve Turnstile (bypass or wait for test key).
   - Click Continue → `/auth/onboarding`.
   - Step 0: Username – fill unique username, wait for availability, next.
   - Step 1: PasskeySetup – trigger “Create passkey” / equivalent; virtual authenticator receives the credential; wait for backend registration and redirect (or next step).
   - Optionally complete remaining onboarding steps or short-circuit to Complete; then assert redirect to dashboard or final step.
4. **Flow B (optional, nsec then passkey):** Go to `/auth/login`, fill nsec (test key), submit; if new user, app creates account and may redirect to onboarding or dashboard; ensure virtual authenticator is active so passkey creation succeeds. Can be a separate test or a second scenario.
5. **Assertions:** URL contains `/dashboard` (or onboarding complete), and optionally visible dashboard content (e.g. “Tasks” or a known element).

### 5.3 Selectors and stability

- Prefer **stable selectors:** `data-testid` on signup/onboarding (e.g. `data-testid="signup-continue"`, `data-testid="onboarding-username-input"`, `data-testid="passkey-setup-button"`). If the app doesn’t have them yet, add minimal `data-testid` attributes for e2e.
- Fallback: role-based or translation-key-based selectors (e.g. button with text from `$t('signup.button')`). Document which keys are used so changes in copy don’t break tests silently.
- The existing [e2e-account-creation-challenge](../src/lib/tests/e2e/docs/e2e-account-creation-challenge.md) doc already calls out wrong routes/selectors in old specs; the new spec must use `/auth/signup`, `/auth/onboarding`, and the real step components (UsernameSetup, PasskeySetup, etc.).

### 5.4 CI job design

- Playwright starts the app via webServer: **`npm run build && npm run preview`**. The browser loads the built app from `http://localhost:4173`. Build receives `VITE_E2E_TURNSTILE_BYPASS` and `VITE_API_URL` from webServer env so they are baked into the client.
- CI sets **VITE_API_URL** (GitLab CI/CD variable) to the dev API base URL. No other URL variable is needed.

### 5.5 CI pipeline placement

- **Where:** Add a job (e.g. `playwright-signup` or extend existing `playwright`) that runs the signup/onboarding spec. Same stage as current Playwright (validate) or a dedicated “e2e” stage.
- **When:** Same rules as current Playwright job (e.g. on MR, and on `feat/workers-deployment`, `dev`, `main`) or only on branches that deploy to dev so the dev backend is guaranteed to exist.
- **Artifacts:** Keep `trace`, `screenshot`, `video` on failure (already in config) so failures are debuggable.

---

## 6. Checklist and Checkpoint (Phase 2a — Implemented)

This section tracks the **current checkpoint**: root → signup → Turnstile bypass → **username** (fill + submit) → **PasskeySetup step (“Set up passkey”)**. Reaching the passkey step validates that the **dev backend** is reachable (username availability check runs when submitting the username form).

### 6.1 Turnstile bypass decision

We use the **frontend bypass**: when `VITE_E2E_TURNSTILE_BYPASS=true`, the signup page sets `isCaptchaVerified.set(true)` in `onMount` and does not render or rely on the Turnstile widget. The auth layout also allows access to `/auth/onboarding` when this env is set (so we don’t depend on store timing). Playwright’s webServer passes this env into the build. No backend Turnstile test key or special API is required.

### 6.2 Checklist

| # | Task | Status | Notes |
|---|------|--------|--------|
| 1 | **Turnstile bypass** | ✅ Done | Frontend bypass via `VITE_E2E_TURNSTILE_BYPASS=true`; signup page sets `isCaptchaVerified.set(true)` in `onMount`. |
| 2 | **data-testid on root** | ✅ Done | `signup-link` (homepage hero CTA). |
| 3 | **data-testid on signup** | ✅ Done | `signup-continue` (Continue button). |
| 4 | **data-testid on onboarding** | ✅ Done | Username: `onboarding-step-username`, `onboarding-username-input`, `onboarding-username-next`. Passkey: `onboarding-step-passkey`, `passkey-setup-button`. |
| 5 | **Playwright config** | ✅ Done | **Build + preview:** `webServer: 'npm run build && npm run preview'`, `baseURL: 'http://localhost:4173'`. Env passed into build so `VITE_E2E_TURNSTILE_BYPASS` and `VITE_API_URL` are baked in. |
| 6 | **Signup-onboarding spec** | ✅ Done | Root → signup → bypass → onboarding username (fill unique name, click Next) → assert PasskeySetup step visible. |
| 7 | **CI runs signup spec** | ✅ Done | Playwright job runs smoke + signup-onboarding. **CI must set `VITE_API_URL`** to dev backend so username availability check succeeds. |
| 8 | **Run locally with dev API** | ✅ Supported | `VITE_API_URL=https://your-dev-api.example.com npx playwright test tests/e2e/signup-onboarding.spec.ts --project=chromium`. |

### 6.3 Checkpoint: “Set up passkey” step reached

The test **checkpoint** is: the user has completed signup (bypass) and the **username** step (unique username submitted; backend `checkUsernameAvailability` is called), and is on **onboarding step 1 — PasskeySetup**. We assert:

- Element with `data-testid="onboarding-step-passkey"` is visible
- Button with `data-testid="passkey-setup-button"` is visible and contains “Set up passkey” (or localized equivalent)

**Why this validates the dev backend:** Submitting the username form triggers a GraphQL call to `checkUsernameAvailability`. If the app is not pointed at a live backend, that call fails and the user cannot advance to the next step. Reaching the PasskeySetup screen therefore confirms the app can successfully call the dev backend. The test uses a unique username per run (`e2e-${Date.now()}`) to avoid conflicts.

### 6.4 How to run

**Local with dev backend (required for current checkpoint):**
```bash
VITE_API_URL=https://your-dev-api.example.com npx playwright test tests/e2e/signup-onboarding.spec.ts --project=chromium
```
The username step calls `checkUsernameAvailability`; without a live backend the test will not reach the PasskeySetup step.

**CI:** The GitLab `playwright` job runs both smoke and signup-onboarding. Set a CI/CD variable **`VITE_API_URL`** to the dev API base URL so the signup-onboarding test can reach the passkey step. Without it, the username availability check will fail and the test will not pass.

### 6.5 Watching the test live and capturing screenshots

**Playwright UI (watch tests run live)**  
Open the Playwright UI and run the signup test while watching the browser:

```bash
npx playwright test tests/e2e/signup-onboarding.spec.ts --project=chromium --ui
```

In the UI you can run a single test, step through, and see the browser. The webServer (build + preview) is started automatically when you run the test from the UI.

**Headed mode (visible browser, no UI)**  
Run with a visible browser window:

```bash
npx playwright test tests/e2e/signup-onboarding.spec.ts --project=chromium --headed
```

**Screenshots at each checkpoint**  
The signup-onboarding spec saves screenshots when `E2E_SCREENSHOTS=1`:

1. `test-results/01-root.png` — root page  
2. `test-results/02-signup-page.png` — signup page (Continue enabled)  
3. `test-results/03-onboarding-username-filled.png` — username step with name filled  
4. `test-results/04-onboarding-passkey-step.png` — PasskeySetup step (“Set up passkey”)  

Run with (and set `VITE_API_URL` so the test reaches the passkey step):

```bash
VITE_API_URL=https://your-dev-api.example.com E2E_SCREENSHOTS=1 npx playwright test tests/e2e/signup-onboarding.spec.ts --project=chromium
```

Then open the `test-results/` folder to confirm the flow.

**HTML report (after a run)**  
Playwright’s config uses the `html` reporter. After any run, open the report with:

```bash
npx playwright show-report
```

The report shows which tests ran, traces (when recorded), screenshots on failure, and videos on failure. To always record a trace for this spec (e.g. for debugging), run with `--trace=on`.

---

## 7. Implementation Phases (Suggested)

### Phase 1: Decisions and prep (no code yet)

1. **Turnstile:** Decide bypass vs test key vs skip-signup; document in this plan.
2. **Backend for e2e:** Confirm Cloudflare dev API base URL and that CORS/origin allow the e2e origin (localhost or dev site).
3. **CI:** Set `VITE_API_URL` in GitLab CI/CD variables to the dev API base URL.
4. **Test location:** Decide to consolidate e2e under `tests/e2e/` (recommended) and add `signup-onboarding.spec.ts` there.

### Phase 2: App and env (minimal changes) — **Partially done (see §5)**

1. **Turnstile:** ✅ Implemented: `VITE_E2E_TURNSTILE_BYPASS`; signup page sets `isCaptchaVerified.set(true)` in `onMount` when env is `'true'`.
2. **Selectors:** ✅ Added `data-testid` for signup link, signup continue, onboarding username step and input. Remaining: passkey button / step when we add that test.
3. **Env:** Documented in §6; set `VITE_API_URL` for dev API (local and CI).

### Phase 3: E2E spec and fixture — **Checkpoint spec done**

1. **Consolidate:** Auth fixture remains in `src/lib/tests/e2e/fixtures/` for now; signup-onboarding spec lives in `tests/e2e/` and does not require the authenticator for the current checkpoint (username step only).
2. **Spec:** ✅ `tests/e2e/signup-onboarding.spec.ts` implements: root → signup link → signup page → Continue (bypass) → onboarding username step visible. Next: add PasskeySetup step with virtual authenticator and unique username.
3. **Run locally:** ✅ `npx playwright test tests/e2e/signup-onboarding.spec.ts --project=chromium`. Optional: `VITE_API_URL=...` to point at dev API.

### Phase 4: CI integration — **Done for checkpoint**

1. **Playwright config:** ✅ Build + preview webServer, `baseURL: http://localhost:4173`; build receives `VITE_E2E_TURNSTILE_BYPASS` and `VITE_API_URL` from env.
2. **GitLab:** Set `VITE_API_URL` in CI/CD variables so the built app calls the dev backend.
3. **Job:** ✅ Playwright job runs `tests/e2e/smoke.spec.ts` and `tests/e2e/signup-onboarding.spec.ts`. Artifacts (test-results, playwright-report) saved on every run.
4. **Docs:** This plan documents the checkpoint and how to run locally and in CI.

### Phase 5 (optional): Flow B and cleanup

1. Add a test (or scenario) for nsec login creating a new user and then passkey setup, if desired.
2. Define policy for test users on dev (no cleanup vs cleanup endpoint vs test env reset) and document.

---

## 8. Success Criteria

- [x] **Turnstile:** Decision documented and implemented (frontend bypass with `VITE_E2E_TURNSTILE_BYPASS`; auth layout also allows onboarding when env set).
- [x] **Build + preview:** Playwright webServer uses `npm run build && npm run preview`; baseURL `http://localhost:4173`. Tests run stably in CI without retries.
- [x] **Checkpoint:** One Playwright spec runs root → signup → bypass → username (fill + submit) → **PasskeySetup step** visible. Reaching it validates the dev backend (username availability check).
- [ ] **Full path (next):** signup → onboarding (username + PasskeySetup complete) → dashboard; requires virtual authenticator and backend for `registerWithMasterKey` / `registerPasskeyDevice`. See §11.
- [ ] Virtual authenticator is used for both creating and asserting the passkey in the same run.
- [x] Test runs **locally** with `VITE_API_URL` pointing at dev backend.
- [x] Test runs in **CI**; CI sets `VITE_API_URL`; artifacts (test-results, playwright-report) saved.
- [x] Caveats, retrospective, and “how to run” documented in this plan.

---

## 9. Retrospective: Build + Preview

### What we tried first

- **Dev server (`npm run dev`):** Playwright started the app with `npm run dev`. In CI the test was flaky: the first run often failed (timeout or “still on signup”) and the retry passed. Causes included Vite cold start, SvelteKit hydration timing, and the first signup→onboarding transition being slow. We tried longer timeouts, `waitForLoadState('networkidle')`, CI warm-up (dummy visit + dummy signup→onboarding), and waiting for the onboarding element instead of the URL. Flakiness persisted.

### Decision: Build + preview

- We switched the webServer to **`npm run build && npm run preview`** and set `baseURL` to `http://localhost:4173`. The build receives `VITE_E2E_TURNSTILE_BYPASS` and `VITE_API_URL` from env so they are baked into the client.
- **Outcome:** The signup-onboarding test now runs smoothly in CI without needing a retry. No warm-up or `networkidle` is required; the built app is stable from the first load.
- **Trade-off:** CI is slower (full build each run). For BitTasker the stability gain was worth it. Local runs also use build + preview when executing the same Playwright config.

### When to consider other approaches

If in the future we need faster CI or different constraints, alternatives are still valid: smoke-only in CI with signup e2e on a schedule; “start at onboarding” test-only entry; or testing against a deployed e2e environment. See the testing-pipeline-improvement-plan for the overall E2E strategy.

---

## 10. References

| Doc | Purpose |
|-----|--------|
| [e2e-account-creation-challenge.md](../src/lib/tests/e2e/docs/e2e-account-creation-challenge.md) | Detailed signup/onboarding flow, Turnstile/WebAuthn/backend, gaps. |
| [testing-pipeline-improvement-plan.md](./testing-pipeline-improvement-plan.md) | CI test set, Playwright dir, E2E consolidation. |
| [authentication-flow.md](../requirements/details/authentication-flow.md) | Auth flows (passkey, master key, nsec, recovery). |
| [workers-ci-setup-walkthrough.md](./workers-ci-setup-walkthrough.md) | GitLab CI variables and environments. |
| `playwright.config.ts` | testDir, webServer (build + preview), baseURL 4173. |
| `.gitlab-ci.yml` | Validate stage, playwright job, artifacts. |
| `src/lib/tests/e2e/fixtures/auth.ts` | CDP virtual authenticator setup (for next phase). |

---

## 11. Next: Passkey Challenge

The current checkpoint is **done**: the test reaches the “Set up passkey” step and validates that the dev backend is reachable (username availability check). The next phase is to **complete the passkey flow** so that the e2e creates a real account and reaches the dashboard.

### 11.1 Goal

- Extend the signup-onboarding spec (or add a follow-up spec) so that after the username step we:
  1. **Attach the CDP virtual authenticator** to the browser context (same context for the whole run).
  2. **Click “Set up passkey”** (`data-testid="passkey-setup-button"`).
  3. Let the app call `navigator.credentials.create()`; the virtual authenticator receives the credential.
  4. Wait for the backend calls (`registerWithMasterKey`, `registerPasskeyDevice`, `loginWithPasskey`) to complete and for the app to redirect to `/dashboard` (or next onboarding step).
  5. **Assert** the user is on the dashboard (or a defined “account created” state).

### 11.2 Prerequisites

| Prerequisite | Status / Action |
|--------------|------------------|
| **Auth fixture** | Reuse or adapt `src/lib/tests/e2e/fixtures/auth.ts` so the signup-onboarding spec runs with the virtual authenticator **enabled before** the test (e.g. `test.extend` with the fixture, or call CDP `WebAuthn.enable` + `addVirtualAuthenticator` in a `beforeEach`). |
| **Backend** | Dev backend must support `registerWithMasterKey`, `registerPasskeyDevice`, `loginWithPasskey`. Already required for the app; no change for e2e except to ensure `VITE_API_URL` is set. |
| **Selectors** | PasskeySetup already has `data-testid="passkey-setup-button"`. Add any further `data-testid` for post-passkey steps (e.g. dashboard shell) if needed. |
| **Chromium only** | Virtual authenticator is CDP-based; keep running this spec with `--project=chromium` in CI. |

### 11.3 Technical notes (PasskeySetup)

- **App flow:** PasskeySetup generates Nostr keypair, master key, then calls WebAuthn `credentials.create()`. The credential is sent to the backend with the username and device id. See [e2e-account-creation-challenge.md](../src/lib/tests/e2e/docs/e2e-account-creation-challenge.md) §1.2 and §2.2 for the exact sequence and fixture requirements.
- **Device ID:** The app uses `getDeviceIdentifier()`; in Playwright the context has its own storage. Ensure the same context is used for the full run so device id is stable.
- **Optional:** After reaching the dashboard, we can persist auth state (e.g. `storageState`) and add a separate “login with passkey” e2e that reuses that state to assert the same credential can be used for login.

### 11.4 Suggested implementation order

1. **Wire the auth fixture** into `tests/e2e/signup-onboarding.spec.ts` (or a new `signup-onboarding-full.spec.ts`) so the test runs with the virtual authenticator attached.
2. **Click “Set up passkey”** and wait for navigation or a visible “success” / dashboard element (with a sensible timeout).
3. **Debug locally** with `--headed` and `--trace=on` if the credential or backend calls fail.
4. **CI:** Same job and env; no extra variables needed beyond `VITE_API_URL`.

---

*Last updated: 2025-02-04*
