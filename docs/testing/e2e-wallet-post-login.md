# E2E Wallet Post-Login

**Goal:** Validate that a user logged in with passkey credentials (from the credentials file) can navigate to the wallet route and that the page loads correctly.

---

## 1. Overview

| Item | Details |
|------|---------|
| **Spec** | `tests/e2e/03-wallet-post-login.spec.ts` |
| **Runs after** | 01-signup-onboarding (credentials file must exist) |
| **Fixture** | `passkey-auth-from-file` with `credentialLabel: 'signup'` |
| **Flow** | Login with signup credentials → navigate to `/dashboard/wallet` → validate page content |

---

## 2. Helper: performPasskeyLogin

**Location:** `tests/e2e/utils/passkey-login-helper.ts`

Completes the passkey login flow when credentials are already injected into the page's virtual authenticator:

1. Navigate to `/auth/login`
2. Click "Continue with passkey" (`login-continue-passkey`)
3. Wait for URL `/dashboard`

Tests and fixtures can use this helper to focus on post-login behavior instead of duplicating the login flow.

---

## 3. Wallet Page Validation

The wallet route (`/dashboard/wallet`) can show two states:

| State | Visible elements |
|-------|------------------|
| **Connected** | Receive button, Send button, Transactions button, BalanceCard |
| **No wallet** | "No Wallet Found" title, "Try Again" button |

The E2E test validates that the page loads by asserting one of these is visible. New signup users may not have a wallet set up yet, so both states are valid.

---

## 4. Run Order

```bash
npx playwright test tests/e2e/01-signup-onboarding.spec.ts tests/e2e/02-credentials-login.spec.ts tests/e2e/03-wallet-post-login.spec.ts --project=chromium --workers=1
```

---

## 5. References

- **E2E pipeline:** [e2e-testing.md](./e2e-testing.md)
- **Wallet route:** `src/routes/(protected)/dashboard/wallet/+page.svelte`
