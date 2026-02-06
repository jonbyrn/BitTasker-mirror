# E2E Signup & Onboarding Plan

Single source of truth for the signup-onboarding e2e test: flow, setup, and next steps. See [e2e-account-creation-challenge.md](../src/lib/tests/e2e/docs/e2e-account-creation-challenge.md) for technical details (app flow, WebAuthn, selectors).

---

## 1. Current Checkpoint (Done)

**Test:** `tests/e2e/signup-onboarding.spec.ts` — two tests sharing a worker-scoped context:

1. **Test 1:** root → signup → Turnstile bypass → username → **passkey creation** → Recovery (skip) → Profile (fill) → Location (default) → Complete (continue without) → **Dashboard**.
2. **Test 2:** root (fresh UI) → Login button (not Signup) → **passkey login** → **Dashboard**.

Proves: (1) account creation works, (2) onboarding completes, (3) login with passkey works (fresh user flow).

Uses `signup-login-auth` fixture (worker-scoped context). See [e2e-full-onboarding-phase.md](./e2e-full-onboarding-phase.md) for scope and checklist.

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

**Local (recommended, dev server – faster):**
```bash
E2E_USE_DEV_SERVER=1 VITE_API_URL=https://your-dev-api.example.com npx playwright test tests/e2e/signup-onboarding.spec.ts --project=chromium
```

**Local (build + preview):**
```bash
VITE_API_URL=https://your-dev-api.example.com npx playwright test tests/e2e/signup-onboarding.spec.ts --project=chromium
```

**CI:** Set `VITE_API_URL` in GitLab CI/CD variables.

**If passkey fails:** Test detects `passkey-setup-error` and fails with a clear message + hint to set `VITE_API_URL` and ensure backend is running.

---

## 3. Technical Notes

- **Virtual authenticator:** Must be on the **same page** that runs the app (CDP virtual authenticators are per-target). Auth fixture overrides `page`: gets default page, `page.context().newCDPSession(page)`, `WebAuthn.enable`, `WebAuthn.addVirtualAuthenticator`, yields same page. Signup and login tests share a worker-scoped context so the credential created in Test 1 is available in Test 2.
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
| `src/lib/tests/e2e/fixtures/signup-login-auth.ts` | Worker-scoped context + credential export/import so Test 2 gets passkey from Test 1. |
| [e2e-passkey-credential-reuse.md](./e2e-passkey-credential-reuse.md) | Why Test 2 timed out; CDP getCredentials/addCredential; reuse pattern. |

---

*Last updated: 2025-02-04*
