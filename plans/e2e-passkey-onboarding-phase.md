# E2E Passkey Login & Onboarding Phase

This document tracks implementation of **passkey creation** and **onboarding completion** in the signup-onboarding e2e test, so the test reaches the dashboard (or a defined “account created” state).

**Parent plans:**
- [e2e-signup-onboarding-plan.md](./e2e-signup-onboarding-plan.md) – §11 “Next: Passkey Challenge”
- [e2e-account-creation-challenge.md](../src/lib/tests/e2e/docs/e2e-account-creation-challenge.md) – WebAuthn, backend, selectors

**Current checkpoint (already done):** Root → signup → Turnstile bypass → username → **PasskeySetup step visible** (“Set up passkey” button).

**Goal of this phase:** After the passkey step, **create the passkey** (CDP virtual authenticator), complete backend registration, and assert the user advances (next onboarding step or dashboard).

---

## 1. Scope

| Item | Description |
|------|-------------|
| **Passkey creation** | Click “Set up passkey”; virtual authenticator receives `credentials.create()`; backend `registerWithMasterKey`, `registerPasskeyDevice`, `loginWithPasskey` run. |
| **Assertion (minimal)** | User advances to **next onboarding step** (Recovery) after passkey success (proves registration + login worked). |
| **Assertion (full, optional)** | User can complete remaining onboarding steps and reach **dashboard** (Recovery → Profile → Location → Complete → goto dashboard). |
| **Browser** | Chromium only (CDP virtual authenticator). |
| **Fixture** | Use `src/lib/tests/e2e/fixtures/auth.ts`: it attaches the virtual authenticator to the **test page** (same page that runs the app), not a temp page. |

---

## 2. Prerequisites

| Prerequisite | Status / Action |
|--------------|------------------|
| Auth fixture with CDP virtual authenticator | ✅ Exists in `src/lib/tests/e2e/fixtures/auth.ts`. |
| Signup-onboarding spec uses that fixture | ✅ `tests/e2e/signup-onboarding.spec.ts` imports test/expect from auth fixture. |
| Backend (dev) | ✅ Required; `VITE_API_URL` set in CI and local. |
| data-testid for passkey step | ✅ `onboarding-step-passkey`, `passkey-setup-button`. |
| data-testid for Recovery / later steps | 🔲 Add if we automate “full onboarding to dashboard”. |

---

## 3. Implementation Checklist

| # | Task | Status | Notes |
|---|------|--------|--------|
| 1 | Create this tracking doc | ✅ Done | plans/e2e-passkey-onboarding-phase.md |
| 2 | Use auth fixture in signup-onboarding.spec.ts | ✅ | Import test/expect from auth fixture; run with --project=chromium. |
| 3 | In existing flow: click “Set up passkey” after username step | ✅ | Use `data-testid="passkey-setup-button"`. |
| 4 | Wait for passkey creation + backend (next step or dashboard) | ✅ | Wait for `onboarding-step-recovery` visible (60s timeout). |
| 5 | Assert: Recovery step visible (or dashboard) | ✅ | Assert Recovery step visible; proves registration + login succeeded. |
| 6 | (Optional) Add steps to complete onboarding → dashboard | 🔲 | Skip recovery, minimal profile/location, complete → assert dashboard. |
| 7 | Update e2e-signup-onboarding-plan.md §11 | ✅ | §11.5 added; success criteria updated. |
| 8 | Update e2e-account-creation-challenge.md | ✅ | Update “Current status” and “Recommended next steps”. |

---

## 4. Technical Notes

- **PasskeySetup flow (app):** On “Set up passkey”, app generates Nostr keypair, master key, calls `setWebBiometricKey` → `navigator.credentials.create()`. Then `registerWithMasterKey`, `registerPasskeyDevice`, `loginWithPasskey`. On success, `nextStep()` is called after 1.5s → user sees **Recovery** step.
- **Virtual authenticator:** Must be attached to the **same** browser context that loads the app (so the page’s `credentials.create` hits the virtual authenticator). Auth fixture overrides `context` and adds CDP WebAuthn before any page; using that fixture in the spec guarantees one context for the whole run.
- **webBiometrics.ts:** Uses `residentKey: 'required'` and test-environment detection (localhost, etc.). Auth fixture uses `hasResidentKey: true`; should be compatible.
- **Device ID:** Stable for the same context; no extra handling needed for e2e.

---

## 5. How to Run

**Local (with dev backend, build + preview):**
```bash
VITE_API_URL=https://your-dev-api.example.com npx playwright test tests/e2e/signup-onboarding.spec.ts --project=chromium
```

**Local (faster: use dev server instead of build + preview):**
```bash
VITE_API_URL=... E2E_USE_DEV_SERVER=1 npx playwright test tests/e2e/signup-onboarding.spec.ts --project=chromium
```
Playwright will start `npm run dev` if nothing is already listening on port 5173 (reuseExistingServer: true).

**With screenshots:**
```bash
VITE_API_URL=... E2E_SCREENSHOTS=1 npx playwright test tests/e2e/signup-onboarding.spec.ts --project=chromium
```

**If the passkey test fails:** The test now detects when the app shows a passkey/registration error. The failure message will include an error snippet and a reminder to set `VITE_API_URL` and ensure the dev backend is running.

**CI:** Unchanged; Playwright uses build + preview and `VITE_API_URL` from CI variables.

---

## 6. Progress Log

| Date | Change |
|------|--------|
| 2025-02-04 | Doc created; scope and checklist defined. |
| 2025-02-04 | Auth fixture wired; second test added (create passkey → Recovery); data-testid for Recovery; plans and challenge doc updated. |
| 2025-02-04 | Passkey test: wait for Recovery OR error (data-testid passkey-setup-error); fail with clear message + VITE_API_URL hint. Playwright: E2E_USE_DEV_SERVER=1 uses dev server locally for faster runs. |
| 2025-02-04 | **Fixture fix:** Virtual authenticator was attached to a temp page then closed, so the test page had no authenticator and passkey creation hung. Auth fixture now overrides **page** (not context) and attaches CDP WebAuthn to the same page the test uses. See requirements/details/authentication-flow.md and §4 Technical Notes. |

---

*Last updated: 2025-02-04*
