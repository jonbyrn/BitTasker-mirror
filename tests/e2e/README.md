# E2E tests (tests/e2e)

## Auth flow (run these in order)

1. **01-signup-onboarding.spec.ts** – Creates two users (signup + Nostr) and writes their passkey credentials to `tests/e2e/.auth/webauthn-credentials.json`.
2. **02-credentials-login.spec.ts** – Loads that file and checks that each user can log in with passkey and reach the dashboard.

**You must run 01 before 02**, and use **`--workers=1`** so the credentials file exists when 02 runs:

```bash
npx playwright test tests/e2e/01-signup-onboarding.spec.ts tests/e2e/02-credentials-login.spec.ts --project=chromium --workers=1
```

With dev server and API URL:

```bash
E2E_USE_DEV_SERVER=1 VITE_API_URL=https://your-api.example.com npx playwright test tests/e2e/01-signup-onboarding.spec.ts tests/e2e/02-credentials-login.spec.ts --project=chromium --workers=1
```

Requires **VITE_E2E_TURNSTILE_BYPASS** and **VITE_API_URL** for 01.

## Other specs

- **wallet/balance-management.spec.ts** – Skipped for now (`describe.skip`). Re-enable when adding wallet E2E back.
- **smoke.spec.ts** – Smoke tests (if present).

## Docs

- **E2E pipeline:** `plans/e2e-testing.md`
- **Migration from src:** `tests/e2e/MIGRATION.md`
