# E2E Signup & Onboarding Plan

Single source of truth for the signup-onboarding e2e test: flow, setup, and next steps. See [e2e-account-creation-challenge.md](../src/lib/tests/e2e/docs/e2e-account-creation-challenge.md) for technical details (app flow, WebAuthn, selectors).

**→ Current implementation:** Two files. **01-signup-onboarding.spec.ts** (create two users, write credentials); **02-credentials-login.spec.ts** (load file, validate login). Run order and commands: **[e2e-auth-and-credentials.md](./e2e-auth-and-credentials.md)**.

---

## 1. Current Checkpoint (Done)

**File 1:** `tests/e2e/01-signup-onboarding.spec.ts` — two tests, **only** signup/onboarding (no login test in this file):

1. **Test 1:** root → signup → Turnstile bypass → username → **passkey creation** → Recovery (skip) → Profile (fill) → Location (default) → Complete (continue without) → **Dashboard**. Teardown writes credentials with label `signup`.
2. **Test 2:** root → /auth/login → **Login with nsec** → fill generated nsec → submit → passkey (if new user) + onboarding → **Dashboard**. Teardown writes credentials with label `nostr`.

**File 2:** `tests/e2e/02-credentials-login.spec.ts` — loads credentials file and validates each user can log in with passkey and reach dashboard.

Uses `signup-login-auth` fixture (default: no credential injection; opt-in via `injectWebAuthnCredentials: true`). Each test gets a fresh context and empty authenticator unless explicitly opted in. See [e2e-full-onboarding-phase.md](./e2e-full-onboarding-phase.md) for scope and checklist.

| What | Status |
|------|--------|
| Turnstile bypass | `VITE_E2E_TURNSTILE_BYPASS=true`; signup page sets `isCaptchaVerified` in `onMount`. |
| Auth fixture | `src/lib/tests/e2e/fixtures/auth.ts` attaches CDP virtual authenticator to the **test page** (same page as app; fixture overrides `page`, not `context`). |
| Passkey creation | Click “Set up passkey”; virtual authenticator receives `credentials.create()`; backend `registerWithMasterKey`, `registerPasskeyDevice`, `loginWithPasskey`; assert Recovery step. |
| Login with passkey | Test 2: clear auth, goto `/`, click Login; goto `/auth/login`; click "Continue with passkey"; virtual authenticator returns credential from Test 1; assert dashboard. |
| data-testid | `signup-link`, `login-link`, `signup-continue`, `onboarding-step-username`, `onboarding-username-input`, `onboarding-username-next`, `onboarding-step-passkey`, `passkey-setup-button`, `onboarding-step-recovery`, `passkey-setup-error`, `onboarding-recovery-next`, `onboarding-step-profile`, `onboarding-display-name`, `onboarding-professional-title`, `onboarding-profile-description`, `onboarding-skills`, `onboarding-profile-next`, `onboarding-step-location`, `onboarding-location-next`, `onboarding-step-complete`, `onboarding-continue-without-completing`, `login-continue-passkey`. |
| CI | Playwright job runs signup-onboarding with `--project=chromium`. No artifacts (trace/screenshot/video/report disabled to save pipeline time). |
| Backend | `VITE_API_URL` required (CI/CD variable and local). |

---

## 2. How to Run

Run **01** then **02** with **`--workers=1`** (so the credentials file exists for 02):

```bash
E2E_USE_DEV_SERVER=1 VITE_API_URL=https://your-dev-api.example.com npx playwright test tests/e2e/01-signup-onboarding.spec.ts tests/e2e/02-credentials-login.spec.ts --project=chromium --workers=1
```

**CI:** Set `VITE_API_URL` in GitLab CI/CD variables. Use the same file list and `--workers=1`.

**If passkey fails:** Test detects `passkey-setup-error` and fails with a clear message + hint to set `VITE_API_URL` and ensure backend is running.

---

## 3. Technical Notes

- **Virtual authenticator:** Must be on the **same page** that runs the app (CDP virtual authenticators are per-target). Signup-login-auth fixture: **one context per test** (no shared state), so each test starts fresh. Credential injection is **opt-in** (`injectWebAuthnCredentials: true`). Test 1 (signup) and Test 2 (Nostr) both run with empty authenticators; teardown exports credentials to file for use by 02-credentials-login.
- **Build + preview:** CI uses `npm run build && npm run preview` (port 4173) for stability. Local can use `E2E_USE_DEV_SERVER=1` for faster iteration.
- **Unique username:** `e2e-${Date.now()}` per run to avoid conflicts.

---

## 4. Next Steps (Optional)

| # | Task | Notes |
|---|------|-------|
| 1 | Full onboarding → dashboard | ✅ Done. See [e2e-full-onboarding-phase.md](./e2e-full-onboarding-phase.md). |
| 2 | Login-with-passkey e2e | ✅ Done. Same test clears auth, navigates to login, clicks passkey; virtual authenticator returns credential from signup. |
| 3 | Test user cleanup | Define policy for dev backend (no cleanup vs cleanup endpoint). |

---

## 5. References

| Doc | Purpose |
|-----|---------|
| [e2e-account-creation-challenge.md](../src/lib/tests/e2e/docs/e2e-account-creation-challenge.md) | App flow, Turnstile/WebAuthn/backend, selectors, gaps. |
| [authentication-flow.md](../requirements/details/authentication-flow.md) | Auth flows (passkey, master key, nsec, recovery). |
| [testing-pipeline-improvement-plan.md](./testing-pipeline-improvement-plan.md) | CI test set, E2E consolidation. |
| `playwright.config.ts` | webServer, baseURL, reporter. |
| `.gitlab-ci.yml` | Playwright job. |
| `src/lib/tests/e2e/fixtures/auth.ts` | CDP virtual authenticator (page override). |
| `tests/e2e/fixtures/signup-login-auth.ts` | Per-test context; opt-in credential injection; credential export to file for 02-credentials-login. |
| [e2e-passkey-credential-reuse.md](./e2e-passkey-credential-reuse.md) | Why Test 2 timed out; CDP getCredentials/addCredential; reuse pattern. |
| [e2e-passkey-credential-sharing-plan.md](./e2e-passkey-credential-sharing-plan.md) | Cross-file reuse: persist credentials to file; other specs (wallet, etc.) use passkey-auth-from-file. |

---

*Last updated: 2025-02-04*
