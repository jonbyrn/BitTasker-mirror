# Plan: E2E ordered run and workers

**Status:** Draft  
**Goal:** Avoid manually listing test files in order and `--workers=1`; run credential-creation first (single worker), then remaining E2E tests with more workers.

---

## 1. Context

- **Current:** We run something like:
  ```bash
  npx playwright test tests/e2e/01-signup-onboarding.spec.ts tests/e2e/02-credentials-login.spec.ts tests/e2e/03-wallet-post-login.spec.ts --project=chromium --workers=1
  ```
- **Why:** `01-signup-onboarding.spec.ts` creates users and writes `tests/e2e/.auth/webauthn-credentials.json`. Tests in `02-*` and `03-*` (and future specs that use passkey-auth-from-file) need that file, so 01 must run first. We use `--workers=1` so the credentials file is written once and not raced.
- **Pain:** As we add more E2E specs, the command gets long and easy to get wrong (order, forgetting `--workers=1`). In CI we already use `workers=1` globally; locally we might want more workers for the *rest* of the tests after 01.

---

## 2. Requirements

| Requirement | Notes |
|-------------|--------|
| Run `01-signup-onboarding.spec.ts` first | Creates credentials; must complete before any test that uses them. |
| Use a single worker for that first run | Ensures one writer for the shared credentials file. |
| Run all other E2E tests after | 02, 03, and any future specs under `tests/e2e/` that depend on credentials. |
| Use more workers for the “rest” run (when not in CI) | Speed up local runs; CI can keep workers=1 for stability if desired. |
| Single entry point for “full E2E” | No need to remember order or worker counts (e.g. one script or one npm command). |
| CI-friendly | Same entry point works in GitLab CI; script or config can respect `CI` for worker count. |

---

## 3. Options considered

### A. Playwright project dependencies only

- Define a project that runs only 01, and a second project that runs the rest with `dependencies: ['first-project']`.
- **Limitation:** `workers` is global in `playwright.config.ts`. We cannot set workers=1 for the first project and workers=N for the second in a single run. So we either run everything with 1 worker (slow for the rest) or risk flakiness if we use more workers for the first run.

### B. Two-phase script (recommended)

- **Phase 1:** `playwright test tests/e2e/01-signup-onboarding.spec.ts --project=chromium --workers=1`
- **Phase 2:** `playwright test tests/e2e/ --ignore=**/01-signup-onboarding.spec.ts --project=chromium [--workers=N]`
- Script exits with failure if phase 1 fails; only then run phase 2. Same `testDir` and `webServer`; Playwright will start the server once per run (or reuse if we use a single long-lived process — see below).
- **Caveat:** Two Playwright invocations mean two dev-server startups unless we start the server once externally. For local dev we already have `reuseExistingServer: true` when not in CI, so if the user (or script) starts the app once, both phases could reuse it. For CI, each invocation runs `npm run build && npm run preview`; we could optimize later with a single server start and two test runs (same as now, just two runs).

### C. Config-only: single run with workers=1

- Keep one run, always `--workers=1`, and rely on Playwright’s default order (e.g. by file name so 01 runs first). No script.
- **Downside:** We don’t get parallel workers for the non-01 tests; slower as the suite grows.

---

## 4. Proposed direction: script (Option B)

- Add a small **orchestration script** (e.g. `scripts/e2e-ordered.js` or integrate into `scripts/playwright.js`) that:
  1. Runs phase 1: `01-signup-onboarding.spec.ts` with `--workers=1` and `--project=chromium` (or project from env/arg).
  2. On success, runs phase 2: all other E2E tests under `tests/e2e/` excluding `01-signup-onboarding.spec.ts`, with `--workers=1` in CI and optionally higher workers locally (e.g. 2–4 or leave default).
- Expose one npm script, e.g. `test:e2e` or `test:playwright e2e`, that runs this script so users and CI just run one command.
- Document in `docs/testing/e2e-testing.md`: “Run full E2E (ordered): `npm run test:e2e`” and keep the “run individual files” section for debugging.

### Script details to decide

- **Location:** New `scripts/e2e-ordered.js` vs. new command in existing `scripts/playwright.js` (e.g. `e2e` or `e2e:full`). The existing script already has `wallet:full` (unit then E2E) and `auth`; adding `e2e` there keeps all Playwright-related entry points in one place.
- **Phase 2 “rest” list:** Either:
  - **Pattern:** `tests/e2e/` with `--ignore=**/01-signup-onboarding.spec.ts` (simple; automatically includes new specs), or
  - **Explicit list:** e.g. `['02-credentials-login.spec.ts', '03-wallet-post-login.spec.ts', 'tests/e2e/smoke.spec.ts', ...]` (must update when adding specs). Prefer pattern + ignore unless we need to exclude more than 01.
- **Workers for phase 2:** In script: if `process.env.CI` use `--workers=1`; else use `--workers=2` (or 4) or omit so Playwright uses default. Document in plan and in docs.
- **Project:** Pass `--project=chromium` by default; allow override via extra args (e.g. `npm run test:e2e -- --project=firefox`).

### CI

- GitLab CI job runs the same single command (`npm run test:e2e` or equivalent). No change to env vars; `CI` is set so config already uses build+preview and can keep workers=1 for both phases in CI if we want maximum stability.

---

## 5. Open points

- [ ] Decide script location: new file vs. new command in `scripts/playwright.js`.
- [ ] Decide phase-2 worker count locally (e.g. 2 vs 4 vs default).
- [ ] Whether to add `test:e2e` to `package.json` or only `test:playwright e2e` (and document that as the main entry point).

---

## 6. When done

- Implement the script and npm script.
- Update `docs/testing/e2e-testing.md` (and `tests/e2e/README.md`) with the new “run full E2E” command and env/worker behavior.
- Move any lasting design notes into `docs/testing/` if useful; then remove or archive this plan from `plans/` per `plans/README.md`.
