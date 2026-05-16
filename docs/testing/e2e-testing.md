# E2E Testing

**Single source of truth** for the E2E testing pipeline: auth flow, credentials, fixtures, and run order.

---

## 1. Overview

| What           | Details                                                                                                 |
| -------------- | ------------------------------------------------------------------------------------------------------- |
| **Framework**  | Playwright                                                                                              |
| **Location**   | `tests/e2e/`                                                                                            |
| **Auth tests** | 01-signup-onboarding (creates users + credentials), 02-credentials-login (validates login with passkey) |
| **Run order**  | 01 first (creates credentials), then the rest. Use `npm run test:e2e` for the full ordered run.         |

---

## 2. Test Files

| File                                   | Purpose                                                                                                                                                                                                                                                                                                         |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **01-signup-onboarding.spec.ts**       | **Creates** two users and writes passkey credentials. Test 1: signup → onboarding → dashboard (label `signup`). Test 2: Nostr login → passkey + onboarding → dashboard (label `nostr`).                                                                                                                         |
| **02-credentials-login.spec.ts**       | **Loads** credentials from file and validates each user can log in: inject → /auth/login → Continue with passkey → dashboard. Uses fixed labels `['signup', 'nostr']` so tests are discovered at load time.                                                                                                     |
| **03-wallet-post-login.spec.ts**       | Logs in with signup credentials, navigates to `/dashboard/wallet`, validates page loads. See [e2e-wallet-post-login.md](./e2e-wallet-post-login.md).                                                                                                                                                            |
| **04-messages-start-new-chat.spec.ts** | (1) Nostr user: Messages → new message → search signup user → start chat → send test message → assert in history. (2) Signup user: Messages → open conversation with test message → assert same message received. See [e2e-messages-start-new-chat.md](./e2e-messages-start-new-chat.md). Requires Nostr relay. |
| **05-reviews-page.spec.ts**            | Deterministic full flow for reviews: signup → onboarding with passkey → `/dashboard/reviews` → validate tabs and empty states for a new user. Does **not** depend on the credentials file.                                                                                                                      |
| **reviews/management.spec.ts**         | Logs in with the signup credential set from file and validates the deterministic empty-state review management experience.                                                                                                                                                                                      |
| **wallet/balance-management.spec.ts**  | Skipped (`describe.skip`). Re-enable when adding wallet E2E back.                                                                                                                                                                                                                                               |

---

## 3. Environment Variables

Set these **before** running Playwright so the app and tests behave correctly:

| Variable                      | Required              | Purpose                                                                                                                                                                          |
| ----------------------------- | --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **VITE_API_URL**              | Yes                   | Backend API base URL. The app uses it for signup, onboarding, and passkey registration. Example: `https://your-api.example.com`. In CI, set this in GitLab CI/CD variables.      |
| **VITE_E2E_TURNSTILE_BYPASS** | Yes (for auth tests)  | Must be `true` so Turnstile is bypassed in E2E. The Playwright config injects this into the webServer process; if you start the dev server yourself, set it in your environment. |
| **VITE_NOSTR_RELAY_URL**      | Yes (for 04-messages) | Nostr relay URL (e.g. `wss://relay.example.com`). Required for Messages E2E (user search, send/receive). Set in GitLab CI/CD variables when running the full E2E suite in CI.    |

**Note:** Backend must be running and reachable at `VITE_API_URL` for passkey creation and login tests.

### Service E2E bootstrap contract

The service-quote browser suites currently used in CI are narrower than the auth/messages E2E flow:

- In managed CI they run against the built preview app (`build/` plus `.svelte-kit/output/` + `npm run preview`) unless `PW_E2E_BASE_URL` is explicitly provided.
- That preview contract needs `build/`, `.svelte-kit/output/server/manifest.js`, and `.svelte-kit/output/client` from the upstream build job; `vite preview` fails before Playwright starts if any of those artifacts are missing.
- They depend on the in-app harness route `src/routes/e2e/service-harness.html/+page.svelte` plus deterministic route-level request mocks.
- They do **not** currently require seeded passkey accounts, `tests/e2e/.auth/webauthn-credentials.json`, or a live relay bootstrap to execute the service-specific browser slices.
- CI still requires `VITE_API_URL`, `VITE_NOSTR_RELAY_URL`, and `VITE_E2E_TURNSTILE_BYPASS=true` to be present so the preview bundle is environment-complete and future shared app flows do not silently diverge.
- CI now declares `SERVICE_E2E_BOOTSTRAP_MODE=route-harness` explicitly in `service-quote-e2e`; switching to any future seeded-account browser slices should change that mode rather than silently reusing the harness contract.

The fail-fast bootstrap validator for these suites is `npm run test:e2e:validate-service-bootstrap`, and `service-quote-e2e` runs it before Playwright starts.

---

## 4. How to Run

**Full E2E (recommended):** Runs credentials phase first (single worker), then the rest with more workers. No need to list files or pass `--workers=1`.

```bash
npm run test:e2e
```

Optional: pass Playwright args after `--`, e.g. `npm run test:e2e -- --project=firefox`.

**Manual (individual files):** If you need to run a subset or debug order:

```bash
npx playwright test tests/e2e/01-signup-onboarding.spec.ts tests/e2e/02-credentials-login.spec.ts --project=chromium --workers=1
```

- **Local:** Playwright starts the dev server (port 3000) automatically. Ensure `VITE_API_URL` is set in your environment.
- **CI:** The pipeline builds the app **once** in a `build` job; the Playwright job receives the `build/` artifact and runs only `npm run preview` (no second build). The preview start contract is `build/` plus `.svelte-kit/output/server/manifest.js` and `.svelte-kit/output/client`, so all of those artifacts must be preserved by the upstream build job unless `PW_E2E_BASE_URL` points at an externally managed app instance. Set **VITE_API_URL**, **VITE_NOSTR_RELAY_URL**, and **VITE_E2E_TURNSTILE_BYPASS=true** in GitLab CI/CD variables. `service-quote-e2e` also declares **SERVICE_E2E_BOOTSTRAP_MODE=route-harness** so the bootstrap validator can fail fast if the expected service-browser contract changes. The build job uses the same variables so the bundle matches the environment. Local `CI=1` runs do a fresh build + preview by default so they do not accidentally reuse stale artifacts. See `.gitlab-ci.yml` for stages and branch strategy.

---

## 5. Credentials File

| Item           | Details                                                                                                               |
| -------------- | --------------------------------------------------------------------------------------------------------------------- |
| **Path**       | `tests/e2e/.auth/webauthn-credentials.json` (gitignored)                                                              |
| **Format**     | `{ credentialSets: [ { label: "signup", credentials: [...] }, { label: "nostr", credentials: [...] } ], exportedAt }` |
| **Written by** | 01-signup-onboarding (fixture teardown after each test)                                                               |
| **Read by**    | 02-credentials-login, 04-messages-start-new-chat, passkey-auth-from-file fixture                                      |

---

## 6. Fixtures

| Fixture                    | Used in                                                                | Purpose                                                                                                                                                                                                   |
| -------------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **signup-login-auth**      | 01-signup-onboarding                                                   | Per-test context (no shared state), virtual authenticator, **no credential injection by default**. Opt-in via `test.use({ injectWebAuthnCredentials: true })`. Teardown exports to worker store and file. |
| **passkey-auth-from-file** | 02-credentials-login, 03-wallet-post-login, 04-messages-start-new-chat | Reads file by `credentialLabel`, injects into authenticator, uses `performPasskeyLogin` helper, yields page.                                                                                              |

### Credential injection control (signup-login-auth)

- **Default:** `injectWebAuthnCredentials: false` — empty authenticator, fresh storage. Tests that create new users (signup, Nostr) run with this.
- **Opt-in:** `test.use({ injectWebAuthnCredentials: true })` — injects credentials from file or worker store before the test runs.
- **Skip when file missing:** Use a function so the condition runs at runtime (after 01 runs):  
  `test.skip(() => !webauthnCredentialsFileExists(), CREDENTIALS_MISSING_MESSAGE)`

---

## 7. Technical Notes

- **CDP virtual authenticator:** Each page gets its own authenticator. Credentials live per authenticator, not per context. We export via `WebAuthn.getCredentials` and inject via `WebAuthn.addCredential`.
- **Chromium only for WebAuthn:** The virtual authenticator flow uses Chromium CDP. Specs that create or inject passkeys should run under `--project=chromium`; other browser projects should skip those specs.
- **Per-test context:** No shared storage. Each test starts fresh; Test 2 does not inherit Test 1's auth state.
- **Fixed labels in 02:** `getCredentialSetLabels()` runs at load time, so the file may not exist. We use `EXPECTED_LABELS = ['signup', 'nostr']` so tests are always discovered.
- **CI:** In managed CI (for example GitLab CI), Playwright can reuse upstream preview artifacts; local `CI=1` runs build fresh by default. Set `VITE_API_URL` in GitLab CI/CD variables.

### Ordered run script (`npm run test:e2e`)

The entry point is **`scripts/e2e-ordered.js`** (invoked via `npm run test:e2e`). It runs two phases so that credentials are created first with a single worker, then the rest of the E2E specs can run with more workers for speed:

1. **Phase 1:** `01-signup-onboarding.spec.ts` only, with `--workers=1` (writes `webauthn-credentials.json` once).
2. **Phase 2:** All other `*.spec.ts` under `tests/e2e/` (discovered automatically), with `--workers=1` in CI and `--workers=2` locally.

New specs under `tests/e2e/` are included in phase 2 without changing the script. The script warns if `VITE_API_URL` or `VITE_E2E_TURNSTILE_BYPASS` are not set; it does not exit, so you can still run (e.g. smoke-only). To change behavior (e.g. switch to a single phase later), edit `scripts/e2e-ordered.js`.

---

## 8. References

- **E2E account creation (challenge + implementation):** [e2e-account-creation.md](./e2e-account-creation.md)
- **Tests README:** `tests/e2e/README.md`
- **Wallet post-login:** [e2e-wallet-post-login.md](./e2e-wallet-post-login.md)
- **Messages start new chat:** [e2e-messages-start-new-chat.md](./e2e-messages-start-new-chat.md)
- **Migration from src:** `tests/e2e/MIGRATION.md`
- **Auth requirements:** `requirements/details/authentication-flow.md`
- **CDP WebAuthn:** [Chrome DevTools Protocol – WebAuthn](https://chromedevtools.github.io/devtools-protocol/tot/WebAuthn/)
