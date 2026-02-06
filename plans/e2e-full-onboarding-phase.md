# E2E Full Onboarding & Login Phase

Tracks extension of the signup-onboarding e2e test from Recovery step through **full onboarding** to the **dashboard**, then **login with passkey** to verify the account can log back in.

**Parent:** [e2e-signup-onboarding-plan.md](./e2e-signup-onboarding-plan.md)

**Current checkpoint:** Test reaches Recovery step (passkey creation done). This phase extends it to dashboard and login.

---

## 1. Scope

**Test 1:** signup → onboarding → dashboard  
**Test 2:** root → Login (not Signup) → passkey → dashboard

Tests share a worker-scoped context so the passkey from Test 1 is available in Test 2.

| Step | Component | E2E action |
|------|-----------|------------|
| 2 | RecoverySetup | Skip recovery (enableRecovery=false); click Next |
| 3 | ProfileSetup | Fill display name, professional title, profile description (100 min chars), 2 skills; no picture; click Next |
| 4 | LocationSetup | Use default location (onMount sets it); click Next |
| 5 | CompleteSetup | Missing picture etc → click "Continue without completing" → goto `/dashboard` |
| 6 | Dashboard | Assert URL `/dashboard` |
| 7 | Test 2: Clear auth | Clear CapacitorStorage keys; reload |
| 8 | Root page | Goto `/`; click Login (data-testid="login-link") |
| 9 | Login page | Click "Continue with passkey" |
| 10 | Dashboard | Assert URL `/dashboard` |

**Test data (e2e-style):**
- Display name: `e2e-user-${Date.now()}`
- Professional title: `E2E Test Professional`
- Profile description: 100+ chars (generic text)
- Skills: 2 generic skills (e.g. `JavaScript`, `Testing`)

---

## 2. Checklist

| # | Task | Status |
|---|------|--------|
| 1 | Add data-testid to RecoverySetup Next button | ✅ |
| 2 | Add data-testid to ProfileSetup (step, inputs, Next) | ✅ |
| 3 | Add data-testid to LocationSetup (step, Next) | ✅ |
| 4 | Add data-testid to CompleteSetup (continue-without-completing) | ✅ |
| 5 | Extend spec: Recovery → Profile → Location → Complete → Dashboard | ✅ |
| 6 | Update e2e-signup-onboarding-plan | ✅ |
| 7 | Add data-testid to login passkey button | ✅ |
| 8 | Add data-testid to Login link in TopBar | ✅ |
| 9 | Create signup-login-auth fixture (worker-scoped context) | ✅ |
| 10 | Split spec: Test 1 signup+onboarding, Test 2 Login→passkey→Dashboard | ✅ |

---

## 3. Progress Log

| Date | Change |
|------|--------|
| 2025-02-04 | Doc created. |
| 2025-02-04 | Added data-testids to Recovery, Profile, Location, CompleteSetup. Extended spec with full flow to dashboard. |
| 2025-02-04 | Added login flow: clear auth state → login with passkey → assert dashboard. Proves create + login both work. |
| 2025-02-04 | Refactored: two tests with worker-scoped context. Test 1: signup+onboarding. Test 2: root → Login → passkey → dashboard. |

---

*Last updated: 2025-02-04*
