# E2E Migration: src/lib/tests/e2e → tests/e2e

We are migrating E2E tests and supporting code from `src/lib/tests/e2e/` to the project-root `tests/e2e/` incrementally. This doc tracks what has been moved and what still lives under `src/`.

## Why migrate

- **Playwright `testDir`** is `tests/e2e`; keeping specs and fixtures in one place avoids deep imports and matches common Playwright layout.
- **Incremental approach:** Move only what we update and validate, so existing specs under `src/` keep working until we migrate them.

## Migrated (canonical location: tests/e2e)

| Item | New path | Notes |
|------|----------|--------|
| Fixtures | `tests/e2e/fixtures/` | `auth.ts`, `signup-login-auth.ts`, `passkey-auth-from-file.ts` |
| Utils | `tests/e2e/utils/` | `webauthn-credentials.ts`, `auth-helpers.ts` |
| Specs | `tests/e2e/signup-onboarding.spec.ts`, `tests/e2e/wallet/*.spec.ts` | Use local imports: `./fixtures/...`, `../fixtures/...` |

**Import pattern for specs under tests/e2e:**

- Same directory as specs: `import { test, expect } from './fixtures/signup-login-auth';`
- In subdir (e.g. wallet): `import { ... } from '../fixtures/passkey-auth-from-file';`

## Still in src/lib/tests/e2e (legacy)

These remain until we migrate or remove them:

- `src/lib/tests/e2e/fixtures/` – same fixture names; used by specs still under `src/` (e.g. `auth-flow.spec.ts`, `auth-components.spec.ts`, `wallet/*.spec.ts` in that tree).
- `src/lib/tests/e2e/utils/`, `docs/`, `scripts/`, `README.md` – shared docs and helpers; update or duplicate as we migrate more specs.

When adding **new** E2E specs or fixture changes that we validate in CI, prefer **tests/e2e** and the local fixtures/utils above.

## Plan reference

- **Credential sharing:** `plans/e2e-passkey-credential-sharing-plan.md`
- **Signup/onboarding:** `plans/e2e-signup-onboarding-plan.md`
- **Plans index:** `plans/README.md`

## Changelog

| Date | Change |
|------|--------|
| 2025-02-07 | Fixtures and utils (auth, signup-login-auth, passkey-auth-from-file, webauthn-credentials, auth-helpers) moved to tests/e2e. signup-onboarding and wallet/balance-management updated to use local imports. MIGRATION.md added. |
