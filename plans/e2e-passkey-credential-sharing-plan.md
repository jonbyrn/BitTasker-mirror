# E2E Passkey Credential Sharing (Cross-File Reuse)

**Goal:** Allow any E2E spec (e.g. wallet, tasks) to reuse the credentials created by the signup-onboarding flow by persisting WebAuthn credentials to a file and injecting them into a virtual authenticator before login.

**Parent docs:** [e2e-passkey-credential-reuse.md](./e2e-passkey-credential-reuse.md), [e2e-signup-onboarding-plan.md](./e2e-signup-onboarding-plan.md)

---

## 1. Current State

| What | Where | Limitation |
|------|--------|------------|
| Credential creation | `signup-onboarding.spec.ts` Test 1 | Creates passkey via virtual authenticator |
| Credential reuse (same file) | `signup-login-auth` fixture | Worker-scoped in-memory `webauthnCredentialStore`; Test 2 in same file gets passkey injected |
| Wallet / other specs | `auth` fixture + `authenticatedPage` | Relies on **saved storage state** (`test-user.json`) from manual `npm run test:e2e:setup-auth` or auth-helpers; **no WebAuthn credential file** |

**Gap:** Other test files cannot use the passkey created in signup-onboarding because credentials live only in worker memory for that one spec.

---

## 2. Target Design

### 2.1 Credential file (single source of truth)

- **Path:** `tests/e2e/.auth/webauthn-credentials.json` (project-root relative; gitignored via `tests/e2e/.auth/`).
- **Format:**
  ```json
  {
    "credentials": [ { "credentialId": "...", "rpId": "...", "privateKey": "...", ... } ],
    "exportedAt": "2025-02-07T12:00:00.000Z"
  }
  ```
- **Who writes:** The **signup-login-auth** fixture, when it exports credentials after a test (same place it currently pushes to `webauthnCredentialStore`). So after Test 1 (signup → onboarding → dashboard), the file is created/updated.
- **Who reads:** A new fixture used by wallet (and other) specs: create context + page, add virtual authenticator, **inject credentials from file**, then perform login flow (goto `/auth/login` → click "Continue with passkey") so the page ends up on dashboard. Tests then use this already-logged-in page.

### 2.2 Test flow (high level)

1. **Generate credentials (once per run or when missing):**
   - Run `signup-onboarding.spec.ts` (or a dedicated "e2e auth setup" spec). Test 1 creates account + passkey; fixture teardown exports credentials to **both** worker store (for Test 2) **and** `tests/e2e/.auth/webauthn-credentials.json`.
2. **Reuse in other specs:**
   - Wallet (and other) specs use a fixture that:
     - Reads `webauthn-credentials.json` (if missing, test can skip or fail with clear message).
     - Creates a browser context and page with virtual authenticator.
     - Injects credentials from the file into that authenticator.
     - Navigates to `/auth/login`, clicks "Continue with passkey", waits for `/dashboard`.
     - Yields the page so tests run already authenticated.

### 2.3 Run order (CI / local)

- **Option A (recommended):** Run signup-onboarding first, then wallet (and others). Same command, order defined in config or script:
  ```bash
  npx playwright test tests/e2e/signup-onboarding.spec.ts tests/e2e/wallet/
  ```
- **Option B:** Separate jobs: Job 1 runs signup-onboarding and publishes the artifact `webauthn-credentials.json`; Job 2 downloads it and runs wallet (and other) specs. More complex; use if tests must be split across workers/machines.

We will implement Option A first: single run, signup-onboarding first, then other specs that depend on the credential file.

---

## 3. Implementation Checklist

| # | Task | Status |
|---|------|--------|
| 1 | Define credential file path and format (helper or constant) | Done (`tests/e2e/utils/webauthn-credentials.ts`) |
| 2 | In signup-login-auth fixture: write credentials to file when exporting (after each test that had credentials) | Done |
| 3 | Add fixture `passkey-auth-from-file`: read file → create context + page → add authenticator → inject credentials → login flow → yield page | Done (`fixtures/passkey-auth-from-file.ts`) |
| 4 | Export `webauthnCredentialStore` type/format from signup-login-auth for reuse (or shared types file) | Done (shared type in webauthn-credentials.ts, re-exported from fixture) |
| 5 | Wire one wallet spec (e.g. balance-management) to use passkey-auth-from-file when file exists; document run order | Done (`tests/e2e/wallet/balance-management.spec.ts`) |
| 6 | Update E2E README and this plan with run instructions and "if credential file missing" behavior | Done |
| 7 | Update plans/README.md to link this plan | Done |
| 8 | Migrate fixtures/utils to tests/e2e; update spec imports; add MIGRATION.md | Done |

---

## 4. File Layout (after implementation)

**Canonical E2E location:** `tests/e2e/` (see `tests/e2e/MIGRATION.md` for migration from `src/lib/tests/e2e`).

```
tests/e2e/
  .auth/                          # gitignored
    test-user.json                # (existing) storage state from setup-auth
    webauthn-credentials.json    # WebAuthn credentials from signup flow
  fixtures/
    auth.ts                       # virtual authenticator, authenticatedPage
    signup-login-auth.ts          # worker-scoped context + writes credentials to file
    passkey-auth-from-file.ts     # read file, inject, login, yield page
  utils/
    webauthn-credentials.ts       # shared path, read/write, types
    auth-helpers.ts               # AuthHelper, createAuthHelper
  signup-onboarding.spec.ts       # uses signup-login-auth; writes credentials to file
  wallet/
    balance-management.spec.ts   # uses passkey-auth-from-file for shared login
  MIGRATION.md                    # tracks migration from src/lib/tests/e2e
```

---

## 5. Behavior When Credential File Is Missing

- **Specs that require the file (e.g. wallet with passkey-auth-from-file):**
  - **Option A:** Skip with `test.skip()` and message: "Run signup-onboarding.spec.ts first to generate webauthn-credentials.json."
  - **Option B:** Fail fast with same message.
  - We'll use **skip** so the rest of the suite can still run (e.g. smoke tests).

---

## 6. Progress Log

| Date | Change |
|------|--------|
| 2025-02-07 | Plan created. Design: file-based credential sharing, passkey-auth-from-file fixture, run signup-onboarding first. |
| 2025-02-07 | Implemented: webauthn-credentials.ts, signup-login-auth writes file, passkey-auth-from-file fixture, tests/e2e/wallet/balance-management.spec.ts; README and plans/README updated. |
| 2025-02-07 | Migrated fixtures and utils to tests/e2e (see tests/e2e/MIGRATION.md). Specs now use local imports (./fixtures, ../fixtures). |

---

## 7. References

- [e2e-passkey-credential-reuse.md](./e2e-passkey-credential-reuse.md) – CDP getCredentials/addCredential, worker-scoped store
- [e2e-full-onboarding-phase.md](./e2e-full-onboarding-phase.md) – Signup + login flow scope
- [e2e-signup-onboarding-plan.md](./e2e-signup-onboarding-plan.md) – Fixtures, Turnstile, data-testids
- `src/lib/tests/e2e/fixtures/signup-login-auth.ts` – Current worker-scoped credential export
