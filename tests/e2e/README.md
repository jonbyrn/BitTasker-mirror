# E2E tests (tests/e2e)

## Auth flow (run these in order)

1. **01-signup-onboarding.spec.ts** – Creates two users (signup + Nostr) and writes their passkey credentials to `tests/e2e/.auth/webauthn-credentials.json`.
2. **02-credentials-login.spec.ts** – Loads that file and checks that each user can log in with passkey and reach the dashboard.
3. **03-wallet-post-login.spec.ts** – Logs in with signup credentials, navigates to wallet, validates page loads.

**You must run 01 before 02 and 03**, and use **`--workers=1`** so the credentials file exists:

```bash
npx playwright test tests/e2e/01-signup-onboarding.spec.ts tests/e2e/02-credentials-login.spec.ts tests/e2e/03-wallet-post-login.spec.ts --project=chromium --workers=1
```

**Environment:** Set **VITE_API_URL** (and **VITE_E2E_TURNSTILE_BYPASS** if you start the dev server yourself). See **docs/testing/e2e-testing.md** for the full list of required environment variables. Locally, Playwright starts the dev server automatically; in CI it runs build + preview.

## Other specs

- **wallet/balance-management.spec.ts** – Skipped for now (`describe.skip`). Re-enable when adding wallet E2E back.
- **smoke.spec.ts** – Smoke tests (if present).

## Docs

- **E2E account creation (challenge + implementation):** `docs/testing/e2e-account-creation.md`
- **E2E pipeline:** `docs/testing/e2e-testing.md`
- **Migration from src:** `tests/e2e/MIGRATION.md`
