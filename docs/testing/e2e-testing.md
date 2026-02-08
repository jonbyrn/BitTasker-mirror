# E2E Testing

**Single source of truth** for the E2E testing pipeline: auth flow, credentials, fixtures, and run order.

---

## 1. Overview

| What | Details |
|------|---------|
| **Framework** | Playwright |
| **Location** | `tests/e2e/` |
| **Auth tests** | 01-signup-onboarding (creates users + credentials), 02-credentials-login (validates login with passkey) |
| **Run order** | 01 first, then 02. Use `--workers=1`. |

---

## 2. Test Files

| File | Purpose |
|------|---------|
| **01-signup-onboarding.spec.ts** | **Creates** two users and writes passkey credentials. Test 1: signup → onboarding → dashboard (label `signup`). Test 2: Nostr login → passkey + onboarding → dashboard (label `nostr`). |
| **02-credentials-login.spec.ts** | **Loads** credentials from file and validates each user can log in: inject → /auth/login → Continue with passkey → dashboard. Uses fixed labels `['signup', 'nostr']` so tests are discovered at load time. |
| **03-wallet-post-login.spec.ts** | Logs in with signup credentials, navigates to `/dashboard/wallet`, validates page loads. See [e2e-wallet-post-login.md](./e2e-wallet-post-login.md). |
| **wallet/balance-management.spec.ts** | Skipped (`describe.skip`). Re-enable when adding wallet E2E back. |

---

## 3. How to Run

**Basic:**
```bash
npx playwright test tests/e2e/01-signup-onboarding.spec.ts tests/e2e/02-credentials-login.spec.ts --project=chromium --workers=1
```

**With dev server (faster):**
```bash
E2E_USE_DEV_SERVER=1 VITE_API_URL=https://your-api.example.com npx playwright test tests/e2e/01-signup-onboarding.spec.ts tests/e2e/02-credentials-login.spec.ts --project=chromium --workers=1
```

**Via npm script:**
```bash
npm run test:playwright run -- tests/e2e/01-signup-onboarding.spec.ts tests/e2e/02-credentials-login.spec.ts --project=chromium --workers=1
```

**Requirements:** `VITE_E2E_TURNSTILE_BYPASS`, `VITE_API_URL`. Backend must be running for passkey creation.

---

## 4. Credentials File

| Item | Details |
|------|---------|
| **Path** | `tests/e2e/.auth/webauthn-credentials.json` (gitignored) |
| **Format** | `{ credentialSets: [ { label: "signup", credentials: [...] }, { label: "nostr", credentials: [...] } ], exportedAt }` |
| **Written by** | 01-signup-onboarding (fixture teardown after each test) |
| **Read by** | 02-credentials-login, passkey-auth-from-file fixture |

---

## 5. Fixtures

| Fixture | Used in | Purpose |
|---------|---------|---------|
| **signup-login-auth** | 01-signup-onboarding | Per-test context (no shared state), virtual authenticator, **no credential injection by default**. Opt-in via `test.use({ injectWebAuthnCredentials: true })`. Teardown exports to worker store and file. |
| **passkey-auth-from-file** | 02-credentials-login, 03-wallet-post-login | Reads file by `credentialLabel`, injects into authenticator, uses `performPasskeyLogin` helper, yields page. |

### Credential injection control (signup-login-auth)

- **Default:** `injectWebAuthnCredentials: false` — empty authenticator, fresh storage. Tests that create new users (signup, Nostr) run with this.
- **Opt-in:** `test.use({ injectWebAuthnCredentials: true })` — injects credentials from file or worker store before the test runs.
- **Skip when file missing:** Use a function so the condition runs at runtime (after 01 runs):  
  `test.skip(() => !webauthnCredentialsFileExists(), CREDENTIALS_MISSING_MESSAGE)`

---

## 6. Technical Notes

- **CDP virtual authenticator:** Each page gets its own authenticator. Credentials live per authenticator, not per context. We export via `WebAuthn.getCredentials` and inject via `WebAuthn.addCredential`.
- **Per-test context:** No shared storage. Each test starts fresh; Test 2 does not inherit Test 1's auth state.
- **Fixed labels in 02:** `getCredentialSetLabels()` runs at load time, so the file may not exist. We use `EXPECTED_LABELS = ['signup', 'nostr']` so tests are always discovered.
- **CI:** Playwright job runs build + preview (port 4173). Set `VITE_API_URL` in GitLab CI/CD variables.

---

## 7. References

- **E2E account creation (challenge + implementation):** [e2e-account-creation.md](./e2e-account-creation.md)
- **Tests README:** `tests/e2e/README.md`
- **Wallet post-login:** [e2e-wallet-post-login.md](./e2e-wallet-post-login.md)
- **Migration from src:** `tests/e2e/MIGRATION.md`
- **Auth requirements:** `requirements/details/authentication-flow.md`
- **CDP WebAuthn:** [Chrome DevTools Protocol – WebAuthn](https://chromedevtools.github.io/devtools-protocol/tot/WebAuthn/)
