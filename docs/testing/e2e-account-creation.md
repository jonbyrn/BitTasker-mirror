# E2E Account Creation: Challenge and Implementation

This document describes the **challenges** of implementing Playwright e2e tests that create a new BitTasker user account from the root page, and **how we implemented it**. It is the single source of truth for the account-creation flow, Turnstile/WebAuthn/backend considerations, and the current test design.

**Current status:** E2E runs in CI (build + preview). We create two users (signup and Nostr), complete onboarding including passkey creation via a CDP virtual authenticator, and write credentials to a file for reuse by login specs. See [e2e-testing.md](./e2e-testing.md) for run order and commands.

---

## 1. What the app expects to create a new account

### 1.1 Route and flow

- **Signup entry:** `/auth/signup` (not `/auth/register`).
- **Flow:** Root → Signup → (Turnstile) → Onboarding (6 steps) → Dashboard.

### 1.2 Step-by-step

| Stage | What happens |
|-------|----------------|
| **Signup** (`/auth/signup`) | Human verification only (Cloudflare Turnstile). No email/password or key generation. Requires `VITE_CLOUDFLARE_SITEKEY`, GraphQL `verifyTurnstileToken`, and Svelte store `isCaptchaVerified` set to `true`. Then user goes to `/auth/onboarding`. |
| **Auth layout gate** | `/auth/+layout.ts` redirects to `/auth/signup` if `isCaptchaVerified` is false. So Turnstile must be completed (or bypassed in e2e) before onboarding is reachable. |
| **Onboarding** | 6 steps: Username → **PasskeySetup** (real account creation) → Recovery → Profile → Location → Complete. |
| **PasskeySetup** | Generates Nostr keypair, creates master key (mnemonic + device), creates passkey (WebAuthn), calls backend to register user + device, then login. |

Real "account creation" (Nostr key, encryption, passkey, backend registration) happens in **PasskeySetup**, not on the signup page.

### 1.3 PasskeySetup technical details

- **Nostr:** `generateSecretKey()` / `getPublicKey()` (nostr-tools); nsec encrypted and stored.
- **Master key:** Encrypts Nostr key and wallet mnemonic (Web Crypto, device id, optional biometric storage).
- **Passkey:** WebAuthn credential creation (native or web). `credentialId` is sent to the backend.
- **Backend:** `registerWithMasterKey`, `registerPasskeyDevice`, `loginWithPasskey`. Session and redirect to `/dashboard`.

So e2e account creation means: pass the signup gate (Turnstile + store), then complete onboarding step 0 (username) and step 1 (PasskeySetup) with a virtual WebAuthn credential and a running backend.

---

## 2. Challenges we had to solve

### 2.1 Turnstile (captcha)

- **Problem:** Turnstile is a real third-party widget; in CI there is no human to solve it.
- **Solution:** Frontend bypass when `VITE_E2E_TURNSTILE_BYPASS` is set. Signup page enables "Continue" and sets `isCaptchaVerified` so onboarding is reachable without solving the widget. See [e2e-testing.md](./e2e-testing.md).

### 2.2 WebAuthn / passkey in Playwright

- **Problem:** PasskeySetup calls `navigator.credentials.create()`. We need a virtual authenticator attached to the **same page** that runs the app; CDP virtual authenticators are bound to the frame/target.
- **Solution:** Fixture attaches the CDP virtual authenticator to the **test page** (not a temporary page), then yields that page. So when the app runs `credentials.create()` during PasskeySetup, it succeeds. We run signup/onboarding e2e with `--project=chromium` (CDP is Chromium-only). Credentials are exported after each test and written to `tests/e2e/.auth/webauthn-credentials.json` for use by 02-credentials-login and 03-wallet-post-login.

### 2.3 Backend and network

- **Requirement:** Registration and login call real APIs: `verifyTurnstileToken`, `checkUsernameAvailability`, `registerWithMasterKey`, `registerPasskeyDevice`, `loginWithPasskey`.
- **Implication:** E2E that creates an account needs a running backend. CI sets `VITE_API_URL` and runs build + preview; backend must be available for passkey creation and login.

### 2.4 Routes and selectors

- **Historical mismatch:** Older specs used `/auth/register` and selectors for email/password and "Generate Nostr Key" on signup. The real app has no such form on signup; those live in onboarding.
- **Solution:** Specs use `/auth/signup`, `/auth/onboarding`, and `data-testid` attributes (e.g. `signup-continue`, `onboarding-step-username`, `passkey-setup-button`, `onboarding-step-recovery`) aligned with the actual components.

### 2.5 Test user and isolation

- **Username:** `checkUsernameAvailability` prevents duplicates. We use a unique username per run (e.g. `e2e-${Date.now()}`).
- **Per-test context:** No shared storage between tests; each test gets a fresh context. Test 2 does not inherit Test 1's auth state; credentials are exported per test and written to the shared file with distinct labels (`signup`, `nostr`).

---

## 3. How we implemented it

### 3.1 Test layout and run order

| File | Purpose |
|------|---------|
| **01-signup-onboarding.spec.ts** | Creates two users. Test 1: signup → full onboarding → dashboard; Test 2: Nostr login → passkey + onboarding → dashboard. Teardown writes passkey credentials to `tests/e2e/.auth/webauthn-credentials.json` with labels `signup` and `nostr`. |
| **02-credentials-login.spec.ts** | Loads credentials from that file and validates each user can log in with passkey and reach the dashboard. |
| **03-wallet-post-login.spec.ts** | Logs in with signup credentials and validates the wallet page. |

**Run order:** Run 01 first, then 02 and 03, with **`--workers=1`** so the credentials file exists and is stable.

### 3.2 Fixtures

- **signup-login-auth** (`tests/e2e/fixtures/signup-login-auth.ts`): Used by 01-signup-onboarding. Provides per-test context, CDP virtual authenticator, and **no** credential injection by default (empty authenticator for new account creation). Teardown exports credentials to worker store and to `webauthn-credentials.json`.
- **passkey-auth-from-file** (`tests/e2e/fixtures/passkey-auth-from-file.ts`): Used by 02 and 03. Reads credentials from file by label, injects into authenticator, and provides a helper to perform passkey login.

### 3.3 Environment and CI

- **Required env:** `VITE_E2E_TURNSTILE_BYPASS`, `VITE_API_URL`.
- **CI:** Playwright job runs build + preview (port 4173). Backend URL is set via GitLab CI/CD variables.

### 3.4 Optional next steps

- Extend e2e to cover more onboarding steps or post-login flows.
- Add or re-enable wallet balance E2E when ready (see `tests/e2e/wallet/balance-management.spec.ts`, currently skipped).

---

## 4. References

| Document | Purpose |
|----------|---------|
| [e2e-testing.md](./e2e-testing.md) | E2E pipeline: test files, credentials file, fixtures, run commands, technical notes. |
| [tests/e2e/README.md](../../tests/e2e/README.md) | How to run auth e2e tests and required env. |
| [tests/e2e/MIGRATION.md](../../tests/e2e/MIGRATION.md) | Migration from `src/lib/tests/e2e` to `tests/e2e`. |
| [e2e-wallet-post-login.md](./e2e-wallet-post-login.md) | Wallet post-login E2E and helper. |
| [requirements/details/authentication-flow.md](../../requirements/details/authentication-flow.md) | App authentication flow. |
| [Chrome DevTools Protocol – WebAuthn](https://chromedevtools.github.io/devtools-protocol/tot/WebAuthn/) | CDP WebAuthn domain for virtual authenticators. |

This document should be updated when the app's signup/onboarding flow or backend contracts change.
