# E2E Test Documentation

## E2E migration (src → tests/e2e)

We are migrating E2E specs and fixtures from `src/lib/tests/e2e/` to **`tests/e2e/`** incrementally. Current auth design (file-based credentials, multi-user, run order): **`docs/testing/e2e-testing.md`**. Status and import patterns: **`tests/e2e/MIGRATION.md`**. New E2E work should use `tests/e2e/` and the fixtures there.

## Overview

This directory contains end-to-end tests for BitTasker using Playwright. Tests are organized by feature area and use authentication helpers for consistent test setup.

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Setup Authentication

Before running E2E tests that require authentication, you need to create a test user account and save the authentication state:

```bash
npm run test:e2e:setup-auth
```

This will:
- Open a browser window
- Guide you through authenticating with a test account
- Save the authentication state to `tests/e2e/.auth/test-user.json`
- Allow tests to reuse this authentication state

**Important**: The authentication state file is gitignored and should never be committed.

### 3. Create Test User Account

Before running the setup script, ensure you have a test user account:

1. Register a new account using the registration flow
2. Use a test email (e.g., `test@example.com`)
3. Save the Nostr key or set up passkey authentication
4. Complete the registration process

## Running Tests

### Run All E2E Tests

```bash
npm run test:e2e
```

### Run Specific Test Suite

```bash
# Wallet tests only
npm run test:e2e:wallet

# Authentication tests only
npm run test:e2e -- tests/e2e/auth-flow.spec.ts
```

### Run Tests in UI Mode

```bash
npm run test:e2e:ui
```

### Run Tests in Headed Mode (see browser)

```bash
npm run test:e2e:headed
```

### Debug Tests

```bash
npm run test:e2e:debug
```

## Test Structure

```
tests/e2e/
├── fixtures/
│   └── auth.ts              # Authentication fixtures
├── utils/
│   ├── auth-helpers.ts      # Authentication helper utilities
│   └── test-helpers.ts      # General test utilities
├── wallet/
│   ├── send-payment.spec.ts
│   ├── receive-payment.spec.ts
│   ├── balance-management.spec.ts
│   ├── transaction-history.spec.ts
│   └── error-scenarios.spec.ts
├── auth-flow.spec.ts
└── auth-components.spec.ts
```

## Authentication Methods

### 1. Pre-created Test User (Recommended)

- Authenticate once using `npm run test:e2e:setup-auth`
- Tests automatically load saved authentication state
- Fastest and most reliable method
- Session data stored in `tests/e2e/.auth/test-user.json`

### 2. Virtual Authenticator

- Uses Playwright's virtual WebAuthn authenticator
- Simulates passkey authentication
- No real biometrics required
- Useful for CI/CD environments

### 3. Shared Passkey Credentials (Cross-File Reuse)

- **Signup-onboarding** creates a passkey and persists it to `tests/e2e/.auth/webauthn-credentials.json`.
- Other specs (e.g. wallet) can use the **passkey-auth-from-file** fixture to log in with that passkey and test app flows without re-running full signup.
- **Run order:** Run signup-onboarding first, then wallet (or other) specs:
  ```bash
  npx playwright test tests/e2e/signup-onboarding.spec.ts tests/e2e/wallet/ --project=chromium
  ```
- If the credential file is missing, specs that depend on it will skip (or fail with a clear message). See `docs/testing/e2e-testing.md` in the repo root.

### 4. Nostr Key Login

- Fallback authentication method
- Uses test Nostr private key
- Configured via environment variables

## Writing New Tests

### Using Authentication Fixtures

```typescript
import { test, expect } from '../fixtures/auth';

test('my authenticated test', async ({ authenticatedPage }) => {
  // authenticatedPage is already authenticated
  await authenticatedPage.goto('/hiring');
  // ... test code
});
```

### Using Auth Helpers Directly

```typescript
import { test } from '@playwright/test';
import { createAuthHelper } from '../utils/auth-helpers';

test('my test', async ({ page }) => {
  const authHelper = createAuthHelper(page);
  await authHelper.ensureAuthenticated('virtual');
  // ... test code
});
```

### Using Shared Passkey Credentials (Cross-File)

For specs that should run after signup-onboarding and reuse the same passkey (e.g. wallet, hiring flows):

```typescript
import {
  test,
  expect,
  webauthnCredentialsFileExists,
  CREDENTIALS_MISSING_MESSAGE
} from '../../src/lib/tests/e2e/fixtures/passkey-auth-from-file';

test.describe('My feature', () => {
  test.skip(!webauthnCredentialsFileExists(), CREDENTIALS_MISSING_MESSAGE);

  test('my test', async ({ authenticatedPageFromPasskeyFile }) => {
    // Page is already logged in via passkey (credentials from file)
    await authenticatedPageFromPasskeyFile.goto('/wallet');
    // ... test code
  });
});
```

Run signup-onboarding first so the credential file exists:  
`npx playwright test tests/e2e/signup-onboarding.spec.ts tests/e2e/wallet/ --project=chromium`

## Troubleshooting

### Authentication State Expired

If tests fail with authentication errors:

1. Delete `tests/e2e/.auth/test-user.json`
2. Run `npm run test:e2e:setup-auth` again
3. Re-authenticate with your test account

### Tests Fail in CI/CD

- Ensure virtual authenticator is configured
- Check that test environment variables are set
- Verify backend/testnet is accessible from CI environment

### Browser Not Found

```bash
npx playwright install
```

### Port Already in Use

If port 3000 is already in use:

1. Stop the existing dev server
2. Or change the port in `playwright.config.ts`

## Best Practices

1. **Use authentication fixtures** for tests that require login
2. **Keep tests isolated** - each test should be independent
3. **Use data-testid attributes** for reliable element selection
4. **Wait for network idle** after navigation
5. **Clean up test data** if tests create resources
6. **Use descriptive test names** that explain what is being tested

## Environment Variables

Create `.env.test` (based on `.env.test.example`) with:

- `TEST_NOSTR_KEY` - Test Nostr private key
- `TEST_BACKEND_URL` - Test backend URL

## CI/CD Integration

For CI/CD environments:

1. Set up virtual authenticator in Playwright config
2. Use environment variables for test credentials
3. Ensure test backend is accessible
4. Run tests in headless mode

## Support

For issues or questions:
- Check existing test files for examples
- Review Playwright documentation: https://playwright.dev
- Check project documentation in `.cursor/rules/`





