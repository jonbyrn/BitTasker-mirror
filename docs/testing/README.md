# Testing — BitTasker

**Start here** for what tests exist, how to run them, and team practices. For CI pipeline details and coverage in GitLab, see [testing-in-ci.md](./testing-in-ci.md). For E2E, see [e2e-testing.md](./e2e-testing.md).

---

## 1. How we test (policy)

- Run **`npm run test:ci`** before pushing or opening a merge request. The same suite runs in CI (on MRs with coverage, on dev/master without).
- **New or changed** helpers, stores, API services, or critical UI should include or extend tests where practical.
- **If you break a test:** update or remove it; don’t leave it skipped without a tracked reason (e.g. in `_pending/` with a note in `src/lib/tests/_pending/README.md`).
- **E2E** is not in CI yet; run `npm run test:e2e` locally for changes that touch auth, wallet, or messages.

See also [CONTRIBUTING.md](../../CONTRIBUTING.md) and the root [README](../../README.md) “How we test” section.

---

## 2. State of testing

### 2.1 What runs in CI

| Layer                                      | Location                                                    | In CI?                 | Approx                     |
| ------------------------------------------ | ----------------------------------------------------------- | ---------------------- | -------------------------- |
| **Unit + integration routes + components** | `src/lib/tests/unit/`, `integration/routes/`, `components/` | ✅ Yes                 | ~79 files, ~1046 tests     |
| **Integration (escrow)**                   | `src/lib/tests/integration/escrow/`                         | ❌ No                  | 8 files                    |
| **Other**                                  | `src/lib/tests/utils/`                                      | ❌ No                  | Run with `test:unit:utils` |
| **Pending**                                | `src/lib/tests/_pending/`                                   | ❌ Excluded by Vitest  | 6 files                    |
| **E2E**                                    | `tests/e2e/`                                                | ❌ Commented out in CI | 4 specs                    |

**Command:** `npm run test:ci` → `vitest run src/lib/tests/unit/ src/lib/tests/integration/routes/ src/lib/tests/components/`

- **MRs:** pipeline runs **build** + **coverage** (tests with coverage for MR widget).
- **Pushes to dev/master:** pipeline runs **build** + **unit** (tests only). E2E is disabled until the dev backend is ready.

### 2.2 Directory layout

```
src/lib/tests/
├── unit/                    # ✅ In CI — helpers, utils, api, stores, routes
├── integration/routes/      # ✅ In CI — tasks-page
├── integration/escrow/      # ❌ Not in CI — run test:unit:integration
├── components/             # ✅ In CI — Svelte components
├── utils/                   # ❌ Not in CI — run test:unit:utils
└── _pending/                # ❌ Excluded — fix blockers then move back
```

**Where to add new tests:** `$lib/utils/helpers/X` → `unit/helpers/X.test.ts`; stores → `unit/stores/`; API → `unit/api/`; Svelte components → `components/`. Don’t put tests in `_pending/` unless they’re broken and being fixed.

### 2.3 How to run tests

| Goal                  | Command                                             |
| --------------------- | --------------------------------------------------- |
| **CI set**            | `npm run test:ci`                                   |
| **CI set + coverage** | `npm run test:ci -- --coverage`                     |
| **Watch**             | `npm run test:unit`                                 |
| **By group**          | `npm run test:unit:stores`, `test:unit:utils`, etc. |
| **Triage**            | `npm run test:triage`                               |
| **E2E**               | `npm run test:e2e`                                  |

### 2.4 Coverage

- **Report:** `coverage/index.html` (and Cobertura for GitLab MR). Baseline ~19–22% statements/lines.
- **In GitLab:** Coverage appears on merge requests only; see [testing-in-ci.md](./testing-in-ci.md#coverage-in-gitlab).

---

## 3. Practices: what we have and what’s next

### 3.1 Already in place

- CI runs `test:ci` (unit job on dev/master, coverage job on MRs).
- Coverage in MR widget and Cobertura diff.
- CONTRIBUTING.md and README “How we test” with policy and links.
- MR description template with testing checklist.
- Triage and per-dir scripts; cache (package-lock key, pull vs pull-push).
- E2E “run locally” guidance in CONTRIBUTING.
- **Git hooks (Husky):** **Pre-commit** runs Prettier + ESLint on staged files via `lint-staged`. **Pre-push** runs `npm run test:ci`. See [CONTRIBUTING § Git hooks](../../CONTRIBUTING.md#git-hooks); use `git push --no-verify` only in emergencies.

### 3.2 Do next

1. **GitLab:** In **Settings → Merge requests**, enable **“Pipelines must succeed”** so red pipelines block merge.

### 3.3 Optional / when ready

- Add **check + lint** to CI once they pass.
- One line in CONTRIBUTING: “Flaky tests: fix or quarantine (e.g. \_pending/ with a note).”
- Short **mocking** note: point to `src/lib/mocks/`, vitest-setup-client, mock at boundary.

---

## 4. Strategy and references

- **Unit strategy:** [plans/unit-testing-strategy.md](../../plans/unit-testing-strategy.md)
- **Coverage expansion:** [plans/coverage-expansion-plan.md](../../plans/coverage-expansion-plan.md)
- **Pipeline / branch strategy:** [../ci/pipeline-branch-strategy.md](../ci/pipeline-branch-strategy.md)
- **Pending tests:** [src/lib/tests/\_pending/README.md](../../src/lib/tests/_pending/README.md)

| Doc                                                                | Content                                                                                                                           |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| [testing-in-ci.md](./testing-in-ci.md)                             | CI test set, triage, per-dir commands, how to test the pipeline, **coverage in GitLab** (how widget works, what else is possible) |
| [e2e-testing.md](./e2e-testing.md)                                 | E2E specs, env vars, credentials, run order                                                                                       |
| [e2e-account-creation.md](./e2e-account-creation.md)               | Account creation challenges and implementation                                                                                    |
| [e2e-wallet-post-login.md](./e2e-wallet-post-login.md)             | Wallet E2E flow                                                                                                                   |
| [e2e-messages-start-new-chat.md](./e2e-messages-start-new-chat.md) | Messages E2E flow                                                                                                                 |
