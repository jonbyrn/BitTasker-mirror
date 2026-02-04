# E2E Signup & Onboarding Plan

Single source of truth for the signup-onboarding e2e test: flow, setup, and next steps. See [e2e-account-creation-challenge.md](../src/lib/tests/e2e/docs/e2e-account-creation-challenge.md) for technical details (app flow, WebAuthn, selectors).

---

## 1. Current Checkpoint (Done)

**Test:** `tests/e2e/signup-onboarding.spec.ts` — one test: root → signup → Turnstile bypass → username → **passkey creation** → Recovery step visible.

| What | Status |
|------|--------|
| Turnstile bypass | `VITE_E2E_TURNSTILE_BYPASS=true`; signup page sets `isCaptchaVerified` in `onMount`. |
| Auth fixture | `src/lib/tests/e2e/fixtures/auth.ts` attaches CDP virtual authenticator to the **test page** (same page as app; fixture overrides `page`, not `context`). |
| Passkey creation | Click “Set up passkey”; virtual authenticator receives `credentials.create()`; backend `registerWithMasterKey`, `registerPasskeyDevice`, `loginWithPasskey`; assert Recovery step. |
| data-testid | `signup-link`, `signup-continue`, `onboarding-step-username`, `onboarding-username-input`, `onboarding-username-next`, `onboarding-step-passkey`, `passkey-setup-button`, `onboarding-step-recovery`, `passkey-setup-error`. |
| CI | Playwright job runs signup-onboarding with `--project=chromium`. No artifacts (trace/screenshot/video/report disabled to save pipeline time). |
| Backend | `VITE_API_URL` required (CI/CD variable and local). |

---

## 2. How to Run

**Local (build + preview):**
```bash
VITE_API_URL=https://your-dev-api.example.com npx playwright test tests/e2e/signup-onboarding.spec.ts --project=chromium
```

**Local (faster, dev server):** `E2E_USE_DEV_SERVER=1` uses `npm run dev` instead of build + preview (see `playwright.config.ts`).

**CI:** Set `VITE_API_URL` in GitLab CI/CD variables.

**If passkey fails:** Test detects `passkey-setup-error` and fails with a clear message + hint to set `VITE_API_URL` and ensure backend is running.

---

## 3. Technical Notes

- **Virtual authenticator:** Must be on the **same page** that runs the app (CDP virtual authenticators are per-target). Auth fixture overrides `page`: gets default page, `page.context().newCDPSession(page)`, `WebAuthn.enable`, `WebAuthn.addVirtualAuthenticator`, yields same page. Previously we used a temp page and closed it → test page had no authenticator → passkey creation hung.
- **Build + preview:** CI uses `npm run build && npm run preview` (port 4173) for stability. Local can use `E2E_USE_DEV_SERVER=1` for faster iteration.
- **Unique username:** `e2e-${Date.now()}` per run to avoid conflicts.

---

## 4. Next Steps (Optional)

| # | Task | Notes |
|---|------|-------|
| 1 | Full onboarding → dashboard | Skip recovery, minimal profile/location, complete → assert `/dashboard`. |
| 2 | Login-with-passkey e2e | Reuse credential created during signup; persist auth state and add separate “login with passkey” test. |
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

---

*Last updated: 2025-02-04*
