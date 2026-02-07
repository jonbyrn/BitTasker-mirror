# E2E Auth & Credentials

**Single source of truth for E2E auth:** two test files, file-based WebAuthn credentials, multi-user (signup + Nostr).

---

## 1. The two test files

| File | Purpose |
|------|--------|
| **01-signup-onboarding.spec.ts** | **Creates** two users and **writes** their passkey credentials to the file. Test 1: signup → onboarding → dashboard (label `signup`). Test 2: Nostr login → passkey + onboarding → dashboard (label `nostr`). |
| **02-credentials-login.spec.ts** | **Loads** credentials from the file and **validates** that each user can log in: inject into virtual authenticator → /auth/login → Continue with passkey → dashboard. |

Run **01** first, then **02**. Use **`--workers=1`** so the first file finishes before the second starts (otherwise the credentials file may not exist yet when 02 runs).

```bash
npx playwright test tests/e2e/01-signup-onboarding.spec.ts tests/e2e/02-credentials-login.spec.ts --project=chromium --workers=1
```

With dev server (faster):

```bash
E2E_USE_DEV_SERVER=1 VITE_API_URL=https://your-api.example.com npx playwright test tests/e2e/01-signup-onboarding.spec.ts tests/e2e/02-credentials-login.spec.ts --project=chromium --workers=1
```

---

## 2. Credentials file

- **Path:** `tests/e2e/.auth/webauthn-credentials.json` (gitignored).
- **Format:** `{ credentialSets: [ { label: "signup", credentials: [...] }, { label: "nostr", credentials: [...] } ], exportedAt }`
- **Written by:** 01-signup-onboarding (fixture teardown after each test).
- **Read by:** 02-credentials-login (and any future spec that uses the passkey-auth-from-file fixture).

---

## 3. Fixtures (tests/e2e/fixtures)

| Fixture | Used in | Purpose |
|---------|---------|--------|
| **signup-login-auth** | 01-signup-onboarding | **One context per test** (no shared auth state); virtual authenticator; **no credential injection by default**. Opt-in via `test.use({ injectWebAuthnCredentials: true })` when a test needs pre-existing passkeys. Teardown exports to worker store and `writeCredentialSet(label, creds)` (label from title: "Nostr" → `nostr`, else `signup`). |
| **passkey-auth-from-file** | 02-credentials-login | Reads file by `credentialLabel`; injects into new context’s authenticator; goes to /auth/login → passkey → dashboard; yields page. |

### Credential injection control (signup-login-auth)

- **Default:** `injectWebAuthnCredentials: false` — no credentials injected. Each test starts with empty authenticator and fresh storage.
- **Opt-in:** `test.use({ injectWebAuthnCredentials: true })` — injects credentials from file or worker store before the test runs.
- **Why:** Test 1 (signup) and Test 2 (Nostr) must start fresh. Tests that need login-with-passkey should opt in or use `passkey-auth-from-file`.

---

## 4. Wallet and other specs

Wallet E2E (`tests/e2e/wallet/balance-management.spec.ts`) is **skipped for now** (describe.skip). When re-enabling, run 01 and 02 first so the credentials file exists; use the same command with `tests/e2e/wallet/` appended, still with `--workers=1`.

---

## 5. References

- **Migration (src → tests/e2e):** `tests/e2e/MIGRATION.md`
- **Signup/onboarding scope:** `plans/e2e-signup-onboarding-plan.md`
- **CDP/WebAuthn:** `plans/e2e-passkey-credential-reuse.md`
