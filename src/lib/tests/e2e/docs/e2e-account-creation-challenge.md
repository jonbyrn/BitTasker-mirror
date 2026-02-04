# E2E Account Creation Challenge: Documentation

This document describes what we need to consider to implement a Playwright e2e test that creates a new user account starting from the root page of the BitTasker app. It does **not** implement the test; it documents the app’s real flow, how the existing e2e auth handling works, and the main challenges.

**Current status (see [e2e-signup-onboarding-plan.md](../../../../../plans/e2e-signup-onboarding-plan.md) and [e2e-passkey-onboarding-phase.md](../../../../../plans/e2e-passkey-onboarding-phase.md)):** The signup-onboarding e2e runs in CI (build + preview) and (1) reaches the **“Set up passkey”** step, and (2) **passkey creation** is implemented: a second test uses the auth fixture (CDP virtual authenticator), clicks “Set up passkey”, and asserts the **Recovery** step is visible (proving credential creation and backend registration + login). Optional next: complete remaining onboarding steps to dashboard.

---

## 1. What the app actually expects to create a new user account

### 1.1 Route and flow overview

- **Signup entry:** `/auth/signup` (not `/auth/register`). The app uses “signup” everywhere (e.g. `goto('/auth/signup')`, `href="/auth/signup"`).
- **Flow:** Root → Signup → (Turnstile) → Onboarding (6 steps) → Dashboard.

### 1.2 Step-by-step: What “create account” really does

#### Step 0: Signup page (`/auth/signup`)

- **Purpose:** Human verification only (Cloudflare Turnstile).
- **No email/password.** No “Generate Nostr Key” or “Register Device” here; those live in onboarding.
- **UI:** Turnstile widget, then a single primary button that goes to onboarding (disabled until captcha succeeds).
- **Dependencies:**
  - `VITE_CLOUDFLARE_SITEKEY` (build-time) for the Turnstile widget.
  - GraphQL mutation `verifyTurnstileToken` (Houdini `VerifyTrunstileStore`) to verify the token with the backend.
  - Svelte store `isCaptchaVerified` must be set to `true` for the “Continue” button to be enabled.
- **After success:** User clicks the button and is sent to `/auth/onboarding`.

#### Step 1: Auth layout gate (`/auth/+layout.ts`)

- If the user is **not** logged in and goes to `/auth/onboarding`, the layout checks `isCaptchaVerified`.
- If `get(isCaptchaVerified)` is false → `redirect(303, '/auth/signup')`.
- So: **Turnstile must be completed (and store set) before onboarding is reachable.** In e2e we must either complete Turnstile or bypass this gate (e.g. mock/store).

#### Step 2: Onboarding – 6 steps (`/auth/onboarding`)

| Step | Component        | What it does |
|------|------------------|--------------|
| 0    | UsernameSetup    | User enters username; app checks availability via GraphQL `checkUsernameAvailability`. Must be valid and available to proceed. |
| 1    | PasskeySetup     | **Core account creation:** Generate Nostr keypair, create master key (mnemonic + device), create passkey (WebAuthn / native biometric), call backend to register user + device, then login. |
| 2    | RecoverySetup   | Optional recovery email/password. |
| 3    | ProfileSetup     | Profile fields. |
| 4    | LocationSetup   | Location. |
| 5    | CompleteSetup   | Done; user can go to dashboard. |

Real “account creation” (Nostr key, encryption, passkey, backend registration) happens in **PasskeySetup**, not on the signup page.

#### Step 3: PasskeySetup – technical details

- **Nostr:** `generateSecretKey()` / `getPublicKey()` (nostr-tools), nsec stored only in memory then encrypted.
- **Master key:** `encryptMasterKeyData(nsec, mnemonic, deviceId)` – encrypts both Nostr key and wallet mnemonic; uses Web Crypto, device id, and optional biometric storage.
- **Passkey:** Either native (Capacitor `checkBiometricAvailability` / `setBiometricKey`) or web (`checkWebBiometricAvailability` / `setWebBiometricKey`). Creates a WebAuthn credential; `credentialId` is sent to the backend.
- **Backend:**  
  - `authService.registerWithMasterKey({ username, publicKey, masterKeyData, authMethod: 'passkey', deviceId })`  
  - `authService.registerPasskeyDevice(npub, deviceId, deviceName, credentialId)`  
  - `authService.loginWithPasskey(npub, deviceId)`  
- **Session:** Access token and user data are stored (e.g. Capacitor Preferences, auth store). Redirect to `/dashboard`.

So creating an account in e2e means: pass the signup gate (Turnstile + store), then go through onboarding step 0 (username) and step 1 (PasskeySetup) at minimum, with a real or virtual WebAuthn credential and backend available.

---

## 2. What we need to consider to tackle this challenge

### 2.1 Turnstile (captcha)

- **Problem:** Turnstile is a real third-party widget; in CI there is no human to solve it.
- **Options:**
  - **Mock / bypass in test env:** e.g. in test build, skip Turnstile and set `isCaptchaVerified` when on signup (needs a test-only code path or env flag).
  - **Backend test mode:** If the backend supports a test key or bypass for Turnstile, we could use that (would need to confirm with backend/GraphQL).
  - **Avoid full signup in CI:** Focus e2e on “with a pre-created account” and document that full signup (including Turnstile) is manual or run only in environments where Turnstile can be solved.

### 2.2 WebAuthn / passkey in Playwright

- **Current setup:** `src/lib/tests/e2e/fixtures/auth.ts` configures a **virtual authenticator** via CDP on the **same page** that the test uses (not a temporary page). CDP virtual authenticators are bound to the frame/target; attaching to a temp page and closing it leaves the test page without an authenticator, so `credentials.create()` would hang. The fixture overrides the **page** fixture: it takes the default page, opens a CDP session from that page, calls `WebAuthn.enable` and `WebAuthn.addVirtualAuthenticator`, then yields the same page to the test.
- **Account creation:** PasskeySetup calls `setWebBiometricKey` / `setBiometricKey`, which creates a **new** credential. For that to work in e2e we need:
  - The virtual authenticator attached to the **test page** (the one that loads the app and runs `navigator.credentials.create()`).
  - One consistent browser context so that the credential created during onboarding can later be used for login (or we persist auth state and reuse it).
- **Considerations:** Virtual authenticator is supported in Chromium (CDP). Run signup/onboarding e2e with `--project=chromium`. See also [Corbado: Passkeys E2E Playwright Testing](https://corbado.com/blog/passkeys-e2e-playwright-testing-webauthn-virtual-authenticator).

### 2.3 Backend and network

- **Backend required:** Registration and login call real APIs (GraphQL + REST): `verifyTurnstileToken`, `checkUsernameAvailability`, `registerWithMasterKey`, `registerPasskeyDevice`, `loginWithPasskey`, etc.
- **Implications:**
  - E2E that creates an account needs a running backend (or a dedicated test backend).
  - CI must either start/point to a test backend or we restrict “full signup” e2e to runs that have backend + (optionally) Turnstile bypass.

### 2.4 Encryption and device identity

- **Device ID:** `getDeviceIdentifier()` is used for master key and passkey registration. In Playwright we get a new browser context each run unless we reuse storage/state; device id might be derived from something stable (e.g. storage). We should confirm whether test runs get a stable device id when reusing the same context/state.
- **Encryption:** All sensitive data is encrypted with Web Crypto and/or master key before being sent. No change needed for e2e except to ensure we don’t rely on real device-bound keys unless we intend to.

### 2.5 Route and selector mismatches in existing tests

- **Auth flow spec** (`auth-flow.spec.ts`) and **auth helpers** reference:
  - `/auth/register` → should be **`/auth/signup`**.
  - Selectors like “Generate Nostr Key”, “Register Device”, “input[type=email]”, “input[type=password]” on the signup page → **wrong**. Signup has no email/password or key generation; those are in onboarding.
- Any new “create account” e2e must use:
  - **Routes:** `/` → `/auth/signup` → `/auth/onboarding` (steps 0, 1, …).
  - **Selectors:** Aligned with actual components (e.g. UsernameSetup, PasskeySetup, Turnstile area, buttons from translation keys or stable `data-testid` if added).

### 2.6 Test user and isolation

- **Username:** `checkUsernameAvailability` prevents duplicates. E2E should use a unique username per run (e.g. timestamp, random suffix, or env-based).
- **Nostr key:** New keypair per run is fine; no server-side “user” exists until registration completes.
- **Cleanup:** If we create real users in backend, consider cleanup or a dedicated test backend that can be reset.

### 2.7 Where e2e tests live and what CI runs

- **Smoke (CI):** `tests/e2e/smoke.spec.ts` – runs in GitLab (playwright job). Only checks homepage/app shell.
- **Playwright config:** `testDir: './tests/e2e'` – so only `tests/e2e/` is run by default; `src/lib/tests/e2e/` is **not** run by current CI.
- **Auth suite:** Auth fixtures and auth-flow specs live under `src/lib/tests/e2e/`. To run “create account” e2e in CI we must either:
  - Move or duplicate the test under `tests/e2e/` and point CI at it, or
  - Change `testDir` / add a second Playwright config / add an explicit path in CI so that `src/lib/tests/e2e/` is included.

---

## 3. How the previous e2e tests handled login / account creation / auth

### 3.1 Auth fixtures (`src/lib/tests/e2e/fixtures/auth.ts`)

- **Context override:** Uses CDP to enable WebAuthn and add a **virtual authenticator** (ctap2, resident key, user verification, automatic presence). This is for **using** a passkey (e.g. login), not necessarily for **creating** one in the same run.
- **authHelper:** Injects `AuthHelper` and `authenticatedPage`.
- **authenticatedPage:** Calls `authHelper.ensureAuthenticated('virtual')` so that each test gets an already-logged-in page.

### 3.2 Auth helper (`src/lib/tests/e2e/utils/auth-helpers.ts`)

- **ensureAuthenticated(method):**  
  1. Tries to **load saved auth state** from `src/lib/tests/e2e/.auth/test-user.json` (cookies + localStorage).  
  2. If missing or invalid, authenticates by the given method: `virtual` | `nostr` | `bypass`.

- **authenticateWithVirtualPasskey():**  
  - Goes to `/auth/login`.  
  - Clicks “Biometric” or “Passkey” button.  
  - Waits for URL to match `/dashboard`.  
  - Saves storage state to `.auth/test-user.json`.  
  - **Assumption:** A passkey **already exists** for some test user. It does **not** create an account; it only simulates using an existing passkey. So it depends on a pre-created account (e.g. via `npm run test:e2e:setup-auth` or a prior run that created the user).

- **loginWithNostrKey(nsec):**  
  - Goes to `/auth/login`, fills nsec input, submits.  
  - Uses `TEST_NOSTR_KEY` or a hardcoded test key.  
  - Again, this only works if that Nostr key is **already registered** (account already created elsewhere).

- **bypassAuthentication():**  
  - Sets a fake `auth` object in localStorage.  
  - The real app uses Capacitor Preferences and backend-issued tokens; this likely does **not** satisfy protected routes that check token or backend session. So bypass is unreliable for full app flows.

- **isAuthenticated():**  
  - Based on URL (not on login page) and optionally body text (e.g. “Dashboard”, “Tasks”).  
  - Does not verify token or API session.

### 3.3 Auth flow spec (`src/lib/tests/e2e/auth-flow.spec.ts`)

- Uses **plain `@playwright/test`** (no auth fixtures). No virtual authenticator in this file.
- **Routes:** Targets `/auth/register` and selectors that don’t exist on the real signup page (email, password, “Generate Nostr Key”, “Register Device”).
- **Registration tests:** Assume a multi-field form on “register” and a “device” step; the real app has signup (Turnstile only) then onboarding (username → passkey → recovery → profile → location → complete).
- **Login tests:** Expect nsec input and Biometric/Passkey button; those exist on **login**, but “login with Nostr key” only works if the key is already registered.
- **Conclusion:** The spec was written against an assumed (or old) flow and does not match the current app. It will fail against the current code without updates to routes and selectors, and it does **not** implement or test “create account from root.”

### 3.4 README and setup (`src/lib/tests/e2e/README.md`)

- Describes `npm run test:e2e:setup-auth`: open browser, log in manually, save state to `.auth/test-user.json`. So “previous” handling is: **manual one-time login**, then reuse saved state. No automated account creation.
- Script path in `scripts/playwright.js` for setup-auth is `tests/e2e/scripts/setup-auth.ts`; the actual file is `src/lib/tests/e2e/scripts/setup-auth.ts` – path mismatch.

### 3.5 Summary: gaps for “create account from root” e2e

| Area              | Previous approach              | Gap for new-account e2e                          |
|-------------------|--------------------------------|--------------------------------------------------|
| Account creation  | Not automated; manual signup   | Need automated flow: signup → Turnstile → onboarding (at least username + passkey). |
| Turnstile         | Not addressed                  | Need bypass or test-only path in CI.             |
| Passkey creation  | Only “use existing” passkey    | Need virtual authenticator during **registration** (PasskeySetup). |
| Routes/selectors  | `/auth/register`, wrong form   | Use `/auth/signup`, then onboarding steps and real selectors. |
| Backend           | Implicit (login calls API)     | Must be explicit: backend required for full signup. |
| Test location/CI  | Auth tests in `src/lib/tests/e2e/`, CI runs `tests/e2e/` | Unify or wire so “account creation” e2e runs in CI if desired. |

---

## 4. Recommended next steps (planning only)

1. ~~**Decide scope**~~ **Done:** E2E goes “root → signup → onboarding” with Turnstile bypass and virtual passkey; account creation (username + passkey) runs in one test; assertion is “Recovery step visible”. See [e2e-passkey-onboarding-phase.md](../../../../../plans/e2e-passkey-onboarding-phase.md).

2. ~~**Turnstile**~~ **Done:** Frontend bypass with `VITE_E2E_TURNSTILE_BYPASS` (see e2e-signup-onboarding-plan).

3. ~~**Align routes and selectors**~~ **Done:** Signup-onboarding spec uses `/auth/signup`, `/auth/onboarding`, and `data-testid` for username, passkey, and recovery steps.

4. ~~**Reuse virtual authenticator for registration**~~ **Done:** Signup-onboarding spec uses the auth fixture so the same context (with CDP virtual authenticator) is used when PasskeySetup runs `credentials.create()`.

5. ~~**CI and test dir**~~ **Done:** Account creation e2e lives in `tests/e2e/signup-onboarding.spec.ts`; CI runs it with `--project=chromium`; `VITE_API_URL` set in CI.

6. **Optional:** Extend e2e to complete onboarding (Recovery → Profile → Location → Complete) and assert dashboard; or add a “login with passkey” e2e that reuses the credential created during signup.

This document should be updated when the app’s signup/onboarding flow or backend contracts change.
