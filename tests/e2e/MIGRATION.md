# E2E Migration: src/lib/tests/e2e → tests/e2e

We are migrating E2E tests and supporting code from `src/lib/tests/e2e/` to the project-root `tests/e2e/` incrementally. This doc tracks what has been moved and what still lives under `src/`.

## Current E2E auth flow (two files)

1. **01-signup-onboarding.spec.ts** – Creates two users (signup + Nostr), writes passkey credentials to `tests/e2e/.auth/webauthn-credentials.json`.
2. **02-credentials-login.spec.ts** – Loads that file and validates each user can log in with passkey and reach dashboard.

**Run order (required):** Run 01 first, then 02, with **`--workers=1`** so the credentials file exists before 02 runs.

```bash
npx playwright test tests/e2e/01-signup-onboarding.spec.ts tests/e2e/02-credentials-login.spec.ts --project=chromium --workers=1
```

See **`plans/e2e-testing.md`** for full design.

## Migrated (canonical location: tests/e2e)

| Item | New path | Notes |
|------|----------|--------|
| Fixtures | `tests/e2e/fixtures/` | `auth.ts`, `signup-login-auth.ts`, `passkey-auth-from-file.ts` |
| Utils | `tests/e2e/utils/` | `webauthn-credentials.ts`, `auth-helpers.ts` |
| Specs | `01-signup-onboarding.spec.ts`, `02-credentials-login.spec.ts`, `wallet/*` (skipped for now) | Local imports: `./fixtures/...`, `../fixtures/...` |

**Import pattern:** Same dir `./fixtures/...`; subdir (e.g. wallet) `../fixtures/...`.

## Still in src/lib/tests/e2e (legacy)

- `src/lib/tests/e2e/fixtures/`, `utils/`, `docs/`, `scripts/`, `README.md` – used by specs still under `src/` until migrated.

## Plan reference

- **E2E pipeline:** `plans/e2e-testing.md`
- **Plans index:** `plans/README.md`

## Changelog

| Date | Change |
|------|--------|
| 2025-02-07 | Fixtures and utils moved to tests/e2e; local imports. |
| 2025-02-07 | Multi-user credentials file; credentialLabel; credentials-login. |
| 2025-02-07 | **Restructure:** 01-signup-onboarding (signup + Nostr users only, writes file); 02-credentials-login (loads file, validates login). Removed login-from-memory test from 01. Run order and --workers=1 documented. Wallet spec skipped for now. |
