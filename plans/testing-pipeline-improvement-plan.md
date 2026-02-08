# Testing Pipeline Improvement Plan

This plan describes how BitTasker will improve its testing practices and integrate them into the CI/CD pipeline. The goal is to move from shipping code with a broken, ignored test suite to a sustainable testing culture where developers run tests locally and CI enforces quality gates.

**Related docs:**
- **Pipeline migration:** [workers-pipeline-migration-plan.md](./workers-pipeline-migration-plan.md) – GitLab CI/CD, deployment flow.
- **CI setup:** [workers-ci-setup-walkthrough.md](./workers-ci-setup-walkthrough.md) – variables, branch strategy, troubleshooting.
- **Testing overview:** [../.cursor/rules/testing/testing-overview.mdc](../.cursor/rules/testing/testing-overview.mdc) – testing strategy and patterns.
- **E2E testing:** [e2e-testing.md](./e2e-testing.md) – auth flow, signup/onboarding, credentials, fixtures, run order.

---

## 0. Progress & Decisions (Latest)

### Decisions Taken

1. **Adopted Option B (Curated CI directory)** – We created `src/lib/tests/ci/` to hold validated, passing tests. CI runs only this directory. As we fix tests in other directories, we move them into `ci/` and they automatically join the CI run.

2. **Test triage script** – `scripts/test-triage.js` runs all tests once and groups results by directory. Use `npm run test:triage` to see pass/fail per group and identify where to focus.

3. **First green set migrated** – `ci-placeholder.test.ts` and `routes/` (tasks-page tests) were moved into `src/lib/tests/ci/`. Both passed in triage.

### Current CI Test Set

| What runs in CI | Path | Tests |
|-----------------|------|-------|
| CI Placeholder | `src/lib/tests/ci/ci-placeholder.test.ts` | 1 |
| Routes (tasks-page) | `src/lib/tests/ci/routes/*.test.ts` | 34 |
| **Total** | `src/lib/tests/ci/` | **35** |

### How to Run CI Tests

**Locally:**
```bash
npm run test:ci
```

**In CI:** The GitLab pipeline validate job runs `npm run test:ci`, which executes `vitest run src/lib/tests/ci/`. No extra configuration needed.

### How to Run Other Directories (Step-by-Step Fixing)

Use these commands to run each directory independently and fix tests before moving them into `ci/`:

| Command | Directory | Use when |
|---------|-----------|----------|
| `npm run test:unit:validators` | validators.test.ts | Fixing validators |
| `npm run test:unit:formatters` | currencyFormatter, dateFormatter | Fixing formatters |
| `npm run test:unit:crypto` | crypto, encoding | Fixing crypto/encoding |
| `npm run test:unit:auth` | auth, auth-cache-validation, auth-error-recovery | Fixing auth tests |
| `npm run test:unit:root-other` | deviceIdentity, findTasks, nostr, profile | Fixing root-level tests |
| `npm run test:unit:api` | api/services/ | Fixing API service tests |
| `npm run test:unit:utils` | utils/ (escrow, wallet, etc.) | Fixing util tests |
| `npm run test:unit:stores` | stores/ | Fixing store tests |
| `npm run test:unit:components` | components/ | Fixing component tests |
| `npm run test:unit:integration` | integration/escrow/ | Fixing integration tests |

**Workflow:**
1. Pick a directory (suggested order: formatters → crypto → validators → api → utils → stores → components → integration).
2. Run `npm run test:unit:<directory>` to see failures.
3. Fix or skip tests until the directory passes.
4. Move the fixed test files into `src/lib/tests/ci/` (preserving subdir structure if desired, e.g. `ci/utils/`).
5. Run `npm run test:ci` to confirm CI still passes.
6. Commit. CI will now run the expanded set.

---

## 1. Current State

### 1.1 Test Suite Overview

| Category          | Location                         | Count | Framework | CI Status              |
|-------------------|----------------------------------|-------|-----------|------------------------|
| **CI tests**      | `src/lib/tests/ci/`              | 4     | Vitest    | ✅ Run in CI           |
| **Unit tests**    | `src/lib/tests/` (remainder)     | ~56   | Vitest    | Run per-directory only |
| **Integration**   | `src/lib/tests/integration/`     | 8     | Vitest    | Not in CI              |
| **Component**     | `src/lib/tests/components/`      | ~20   | Vitest    | Not in CI              |
| **E2E (Playwright)** | `tests/e2e/`                  | 2     | Playwright| ✅ Smoke + signup-onboarding (build+preview, stable in CI) |
| **E2E (orphaned)**   | `src/lib/tests/e2e/`          | 8+    | Playwright| ⚠️ Not wired (wrong dir) |

**Latest run (npm run test):**
- 47 test files failed | 21 passed
- 174 tests failed | 459 passed
- 4 errors (e.g. mock/import issues)

### 1.2 Directory Tree: `src/lib/tests/`

```
src/lib/tests/
├── ci/                             # ✅ CI runs this directory only (validated, passing tests)
│   ├── ci-placeholder.test.ts
│   └── routes/
│       ├── tasks-page.component.test.ts
│       ├── tasks-page.integration.test.ts
│       └── tasks-page.unit.test.ts
│
├── validators.test.ts
├── auth.test.ts
├── auth-cache-validation.test.ts
├── auth-error-recovery.test.ts
├── crypto.test.ts
├── currencyFormatter.test.ts
├── dateFormatter.test.ts
├── deviceIdentity.test.ts
├── encoding.test.ts
├── findTasks.test.ts
├── nip44-message.test.ts
├── nostr-message.test.ts
├── profile-cache.test.ts
│
├── api/services/
│   ├── balanceHistory.service.test.ts
│   └── token-balance.service.test.ts
│
├── components/
│   ├── AmountDisplay.test.ts
│   ├── BalanceHistory.test.ts
│   ├── CalculatorKeypad.test.ts
│   ├── ChatMessage.test.ts
│   ├── InvoiceDisplay.test.ts
│   ├── ReceivePaymentForm.test.ts
│   ├── ReceivePaymentForm.integration.test.ts
│   ├── SendPaymentForm.test.ts
│   ├── TransactionHistory.test.ts
│   ├── TransactionSuccessScreen.test.ts
│   ├── WalletPaymentModal.test.ts
│   ├── contract/
│   │   ├── contractDetection.test.ts
│   │   ├── DebugContractCard.test.ts
│   │   ├── DebugContractCard.logic.test.ts
│   │   ├── escrow.test.ts
│   │   ├── functionParsing.test.ts
│   │   └── loadContractsByAddress.test.ts
│   └── wallet/
│       ├── DebugWalletAssetList.test.ts
│       └── DebugWalletSendForm.test.ts
│
├── integration/escrow/
│   ├── escrow-bid-acceptance.integration.test.ts
│   ├── escrow-dispute.integration.test.ts
│   ├── escrow-event-flow.integration.test.ts
│   ├── escrow-lifecycle.integration.test.ts
│   ├── escrow-permissions.integration.test.ts
│   ├── escrow-state-transitions.integration.test.ts
│   └── escrow-two-party.integration.test.ts
│
├── stores/
│   ├── bid.store.test.ts
│   ├── user-profile-optimization.test.ts
│   ├── wallet.store.test.ts
│   ├── wallet.store.debug.test.ts
│   ├── wallet.store.functions.test.ts
│   └── wallet.store.state.test.ts
│
├── utils/
│   ├── feeCalculation.test.ts
│   ├── nostr-bid.test.ts
│   ├── paymentAddressParser.test.ts
│   ├── escrow/
│   │   ├── contractPermissions.test.ts
│   │   ├── escrowBid.test.ts
│   │   ├── escrowErrors.test.ts
│   │   ├── escrowEvents.test.ts
│   │   └── feeCalculations.test.ts
│   └── wallet/
│       └── blockscoutTransactionStatus.test.ts
│
└── e2e/                             # ⚠️ Orphaned: Playwright config uses tests/e2e/
    ├── auth-flow.spec.ts
    ├── auth-components.spec.ts
    ├── wallet/
    │   ├── balance-management.spec.ts
    │   ├── error-scenarios.spec.ts
    │   ├── receive-payment.spec.ts
    │   ├── send-payment.spec.ts
    │   └── transaction-history.spec.ts
    ├── fixtures/
    ├── utils/
    └── docs/
```

### 1.3 Known Issues

1. **CI runs curated set:** `.gitlab-ci.yml` validate job runs `npm run test:ci` (i.e. `src/lib/tests/ci/`). Check, lint, build are still commented out.
2. **Playwright split:** Config points to `./tests/e2e` (smoke.spec.ts). E2E specs in `src/lib/tests/e2e/` are not run by default.
3. **Stale script references:** `scripts/playwright.js` `wallet:unit` references non-existent files (BalanceCard.test.ts, AmountInputSection.integration.test.ts, SendPaymentForm.integration.test.ts, `src/lib/utils/wallet/__tests__/*`).
4. **Mock gaps:** Tests fail due to incomplete mocks (e.g. `@bittasker/wallet-core` missing `FEE_TIERS` export).
5. **Outdated tests:** Many tests were written for older APIs or UI and no longer reflect current behavior.
6. **No test discipline:** No pre-commit hooks, no MR requirement to run tests, no convention for "add tests with features."

---

## 2. Goals

1. **Re-establish a passing baseline** – Identify and fix or exclude broken tests so CI can run a real subset.
2. **Incremental pipeline integration** – Add validated test directories to CI one at a time.
3. **Developer workflow** – Make it easy to run relevant tests during development.
4. **Sustainable practices** – "Add tests with new features" and "fix or remove tests you break."

---

## 3. Strategy Options

### Option A: Directory-by-Directory Validation (Recommended)

Keep tests in place. Validate each directory locally, fix or skip failing tests, then add that directory to CI.

- **Pros:** No file moves, incremental, low risk.
- **Cons:** Some directories may have many interdependent failures.

### Option B: Curated Test Directory

Create `src/lib/tests/ci/` (or `tests/ci/`). Move only validated, passing tests there. Point CI at that directory. Gradually migrate tests as they are fixed.

- **Pros:** CI always runs a known-good set; clear separation.
- **Cons:** Duplication during migration; two locations to manage.

### Option C: Vitest Projects + Include/Exclude

Use Vitest [workspace/projects](https://vitest.dev/guide/workspace) or `include`/`exclude` to define tiers:
- `ci:fast` – small, fast, always run
- `ci:full` – run on MR/merge
- `local` – for development only, not in CI

- **Pros:** Flexible, no file moves.
- **Cons:** More config; need to keep project lists up to date.

**Recommendation:** We adopted **Option B** – `src/lib/tests/ci/` holds validated tests; CI runs only that directory. As directories are fixed, their tests are moved into `ci/`.

---

## 4. Staged Implementation Plan

### Phase 1: Triage and Tooling (1–2 days)

**Goal:** Understand what passes, what fails, and why. Add npm scripts for targeted runs.

1. **Add npm scripts** in `package.json`:
   ```json
   "test:unit": "vitest",
   "test:unit:run": "vitest run",
   "test:unit:ci-placeholder": "vitest run src/lib/tests/ci-placeholder.test.ts",
   "test:unit:validators": "vitest run src/lib/tests/validators.test.ts",
   "test:unit:utils": "vitest run src/lib/tests/utils/",
   "test:unit:crypto": "vitest run src/lib/tests/crypto.test.ts src/lib/tests/encoding.test.ts",
   "test:unit:formatters": "vitest run src/lib/tests/currencyFormatter.test.ts src/lib/tests/dateFormatter.test.ts",
   "test:unit:stores": "vitest run src/lib/tests/stores/",
   "test:unit:components": "vitest run src/lib/tests/components/",
   "test:unit:integration": "vitest run src/lib/tests/integration/",
   "test:unit:api": "vitest run src/lib/tests/api/",
   "test:unit:routes": "vitest run src/lib/tests/routes/"
   ```

2. **Triage script** – `scripts/test-triage.js` runs all tests once and groups results by directory. Use it to track progress:
   ```bash
   npm run test:triage                    # Console report
   npm run test:triage -- --json=report.json   # JSON output
   ```

3. **Document triage results** in a table (e.g. in this plan or `plans/testing-triage-results.md`):
   - Directory | Total | Pass | Fail | Blockers

4. **Fix `scripts/playwright.js`** – Remove or update references to non-existent tests (BalanceCard.test.ts, AmountInputSection.integration.test.ts, etc.).

**Exit criteria:** npm scripts work; triage table populated; no stale references in playwright.js.

---

### Phase 2: Establish a "Green Set" — IN PROGRESS

**Goal:** Expand `src/lib/tests/ci/` with more passing tests.

1. **Done:** Created `ci/`, moved ci-placeholder + routes. CI runs `npm run test:ci`.

2. **Ongoing:** Run each directory with `npm run test:unit:<dir>`, fix tests, then **move** the fixed files into `ci/`. Suggested order:
   - formatters (currencyFormatter, dateFormatter)
   - crypto (crypto, encoding)
   - validators
   - api, utils, stores, components
   - integration (last; most complex)

3. **Fix or skip** failing tests:
   - Prefer fixing (update mocks, assertions, imports).
   - If unfixable short-term: `it.skip` or `describe.skip` with a TODO.
   - Avoid deleting tests without a ticket.

4. **No config changes needed** – CI runs the whole `ci/` directory. Adding files to `ci/` automatically includes them.

**Exit criteria:** CI runs real tests and passes. Expand `ci/` as more directories turn green.

---

### Phase 3: Expand the Green Set (ongoing)

**Goal:** Add more directories to CI as they are fixed.

1. **One directory per MR (or sprint):** Pick the next directory, fix tests, add to CI include list.

2. **Suggested order:**
   - Utils (pure logic, low mock dependency)
   - Stores (may need mock setup)
   - API services
   - Components (often need more mocks)
   - Integration/escrow (complex, mock-heavy)
   - Routes

3. **Integration tests:** Consider running them in a separate CI job (e.g. `validate:integration`) so they don’t block fast feedback. They can be slower and more flaky.

4. **E2E (current state):**
   - **Consolidated** in `tests/e2e/`: 01-signup-onboarding, 02-credentials-login. Playwright config uses **build + preview** (no dev server) for stability in CI.
   - See [e2e-testing.md](./e2e-testing.md) for run commands, fixtures, and credential handling.

---

### Phase 4: Developer Workflow and Conventions (ongoing)

**Goal:** Make testing part of normal development.

1. **Pre-commit (optional):** Add husky + lint-staged to run `test:unit:run` on staged test files only, or a small smoke subset. Start lightweight to avoid slowing commits.

2. **MR guidelines:** Require that:
   - CI is green before merge.
   - New features include tests (or a ticket to add them).
   - Changing behavior requires updating or removing affected tests.

3. **Documentation:**
   - README or CONTRIBUTING: "How to run tests," "How to add tests."
   - Point to `.cursor/rules/testing/testing-overview.mdc` for patterns.

4. **Re-enable check and lint in CI** (from workers-pipeline-migration-plan):
   - Uncomment `npm run check` and `npm run lint` in validate job once the team is ready.
   - These are fast and catch many issues before tests.

---

## 5. Quick Commands Reference

| Command | Purpose |
|---------|---------|
| `npm run test:ci` | **CI tests only** – runs `src/lib/tests/ci/` (use locally and in CI) |
| `npm run test` | Full unit test run (currently many failures) |
| `npm run test:unit` | Vitest watch mode |
| `npm run test:triage` | Run triage script – pass/fail report per directory |
| `npm run test:unit:validators` | Validators only |
| `npm run test:unit:formatters` | Currency + date formatters |
| `npm run test:unit:crypto` | Crypto + encoding |
| `npm run test:unit:auth` | Auth tests |
| `npm run test:unit:root-other` | deviceIdentity, findTasks, nostr, profile |
| `npm run test:unit:api` | API services |
| `npm run test:unit:utils` | Utils (escrow, wallet, etc.) |
| `npm run test:unit:stores` | Stores |
| `npm run test:unit:components` | Components |
| `npm run test:unit:integration` | Integration (escrow) |
| `npm run test:playwright run` | Playwright E2E (uses tests/e2e/) |
| `npm run test:playwright run tests/e2e/smoke.spec.ts` | Smoke only |

---

## 6. Vitest Include/Exclude (Alternative)

If you prefer config over explicit file lists in CI:

```ts
// vite.config.ts – test section
test: {
  environment: 'jsdom',
  setupFiles: ['./vitest-setup-client.ts'],
  globals: true,
  // Optional: exclude known-broken directories until fixed
  exclude: [
    '**/node_modules/**',
    '**/build/**',
    // 'src/lib/tests/integration/**',  // Uncomment to exclude
  ],
  include: [
    'src/**/*.test.ts',
    // Or be explicit:
    // 'src/lib/tests/validators.test.ts',
    // 'src/lib/tests/utils/**/*.test.ts',
  ],
}
```

We use a simpler approach: CI runs `npm run test:ci` which executes `vitest run src/lib/tests/ci/`. No separate config needed – add files to `ci/` and they run automatically.

---

## 7. Playwright and E2E

### Current

- **Config:** `playwright.config.ts` → `testDir: './tests/e2e'`
- **CI:** Runs `tests/e2e/smoke.spec.ts` (chromium)
- **Orphaned:** `src/lib/tests/e2e/` – auth and wallet specs not in default run

### Options

1. **Move** `src/lib/tests/e2e/*` → `tests/e2e/` and delete `src/lib/tests/e2e/`. Single source of truth.
2. **Or** change `testDir` to include both: `['tests/e2e', 'src/lib/tests/e2e']` (if Playwright supports multiple dirs).
3. **Or** leave as-is; migrate E2E specs in a separate effort once unit/integration CI is stable.

**Recommendation:** Option 1 – consolidate into `tests/e2e/`. Update `scripts/playwright.js` wallet/auth paths to point to `tests/e2e/`.

---

## 8. Success Metrics

- [x] CI validate job runs real Vitest tests (ci-placeholder + routes in `ci/`).
- [x] Curated `ci/` directory with validated tests.
- [x] `npm run test:ci` for local and CI.
- [x] `npm run test:unit:<dir>` for each directory.
- [x] Triage script for pass/fail report.
- [x] Playwright 01/02 auth tests pass in CI (build + preview; see e2e-testing.md).
- [ ] Expand `ci/` with more directories (formatters, crypto, etc.).
- [ ] Fix `scripts/playwright.js` stale references.
- [ ] New features have a documented expectation to add tests.
- [ ] (Stretch) Pre-commit runs a fast test subset.
- [ ] (Stretch) Check and lint re-enabled in CI.

---

## 9. Checklist for First Implementation

1. [x] Create `src/lib/tests/ci/` and move ci-placeholder + routes.
2. [x] Add `test:ci` and `test:unit:*` npm scripts.
3. [x] Update `.gitlab-ci.yml` to run `npm run test:ci`.
4. [ ] Run each directory with `npm run test:unit:<dir>` and fix tests.
5. [ ] Move fixed directories into `ci/` (e.g. `ci/formatters/`, `ci/validators/`).
6. [ ] Fix `scripts/playwright.js` stale references.
7. [ ] Document "how to run tests" in README or CONTRIBUTING.
8. [ ] (Optional) Consolidate E2E into `tests/e2e/`.

---

## 10. Related Files

| File | Role |
|------|------|
| `.gitlab-ci.yml` | Validate job runs `npm run test:ci` |
| `package.json` | `test:ci`, `test:unit:*`, `test:triage` scripts |
| `src/lib/tests/ci/` | Curated tests run in CI (ci-placeholder, routes) |
| `scripts/test-triage.js` | Triage script – pass/fail per directory |
| `vite.config.ts` | Vitest config (env, setupFiles, resolve) |
| `vitest.triage.config.ts` | Config for triage script (JSON reporter) |
| `vitest-setup-client.ts` | Global test setup (jest-dom, vi) |
| `scripts/playwright.js` | Playwright command router; has stale paths |
| `playwright.config.ts` | E2E config; testDir = tests/e2e |
| `tests/e2e/01-signup-onboarding.spec.ts` | Auth: creates users + credentials |
| `tests/e2e/02-credentials-login.spec.ts` | Auth: validates passkey login |

---

*Last updated: 2025-02-04*
