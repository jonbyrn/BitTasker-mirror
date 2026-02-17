# State of Testing — BitTasker

**Last updated:** 2025-02-15  
**Purpose:** Single place to understand what tests exist, what runs where, and what’s next.

**Team practices and gaps:** See [testing-practices-baseline.md](./testing-practices-baseline.md).

---

## 1. At a glance

| Layer | Location | In CI? | Count (approx) | Framework |
|-------|----------|--------|-----------------|-----------|
| **Unit + integration routes + components** | `src/lib/tests/unit/`, `integration/routes/`, `components/` | ✅ Yes (`test:ci`) | ~79 files, ~1046 tests | Vitest, jsdom |
| **Integration (escrow)** | `src/lib/tests/integration/escrow/` | ❌ No | 8 files | Vitest |
| **Other unit-style** | `src/lib/tests/utils/` (e.g. nostr-bid, blockscoutTransactionStatus) | ❌ No | 2+ files | Vitest |
| **Pending (excluded)** | `src/lib/tests/_pending/` | ❌ No | 6 files | Vitest |
| **E2E** | `tests/e2e/` | ❌ Commented out in CI | 4 specs (01–04) | Playwright |

**CI:** On merge requests the pipeline runs **build** + **coverage** (same suite with coverage for MR widget). On pushes to `dev`/`master` it runs **build** + **unit** (same suite, no coverage). E2E (Playwright) is disabled in CI until the dev backend is ready.

---

## 2. What runs in CI (`test:ci`)

**Command:** `npm run test:ci`  
**Equivalent to:**  
`vitest run src/lib/tests/unit/ src/lib/tests/integration/routes/ src/lib/tests/components/`

- **unit/** — Helpers, utils (escrow, wallet, payment, fee), api services, stores, routes (tasks-page). Pure logic and minimal mocks.
- **integration/routes/** — Tasks-page integration tests.
- **components/** — Svelte component tests (contract detection, escrow, wallet, bidding, chat, etc.).

Vitest is configured to **exclude** `**/_pending/**`, so nothing under `_pending/` is run by `test:ci`.

---

## 3. Directory layout (src/lib/tests)

```
src/lib/tests/
├── unit/                    # ✅ In CI
│   ├── helpers/             # Pure helpers (auth, date, formatters, validators, …)
│   ├── utils/               # Escrow, wallet, payment, fee, profile-cache
│   ├── api/                 # balanceHistory, token-balance services
│   ├── stores/              # app, auth, bid, task, user, wallet, theme, navigation
│   ├── routes/              # tasks-page unit + component
│   └── placeholder.test.ts  # Smoke
├── integration/
│   ├── routes/              # ✅ In CI — tasks-page integration
│   └── escrow/              # ❌ Not in CI — escrow lifecycle / permissions / dispute
├── components/              # ✅ In CI — Svelte components (wallet, contract, bidding, …)
├── utils/                   # ❌ Not in CI — e.g. nostr-bid, blockscoutTransactionStatus
└── _pending/                # ❌ Excluded by Vitest — fix blockers then move back
    ├── contract/            # DebugContractCard*, loadContractsByAddress, functionParsing
    └── components/          # ReceivePaymentForm (timeouts)
```

---

## 4. E2E (Playwright)

- **Location:** `tests/e2e/`
- **Specs:** `01-signup-onboarding`, `02-credentials-login`, `03-wallet-post-login`, `04-messages-start-new-chat`
- **Run:** `npm run test:e2e` (ordered; 01 creates credentials, rest use them)
- **CI:** Playwright job is **commented out** in `.gitlab-ci.yml` until the development backend is updated. When re-enabled, it will run after build and before deploy.

See [e2e-testing.md](./e2e-testing.md) for env vars, credentials, and run order.

---

## 5. Coverage

- **Command:** `npm run test:ci -- --coverage`
- **Report:** `coverage/index.html` (and Cobertura for GitLab MR)
- **Baseline (approx):** Statements ~19–22%, Branches ~65%, Functions ~30%, Lines ~19–22%
- **Scope:** `src/**` (excludes tests, stories, build, node_modules, etc.)

Coverage is reported in GitLab **only on merge requests** (coverage job). See [coverage-how-it-works.md](./coverage-how-it-works.md).

---

## 6. Pending / not in CI

| What | Why not in CI |
|------|----------------|
| **_pending/** | Vitest `exclude: ['**/_pending/**']`. ReceivePaymentForm (timeouts), DebugContractCard / contract (EventBus, wallet-core mocks). Some contract tests have been reimplemented in `unit/utils/wallet/` and run in CI. |
| **integration/escrow/** | Not included in `test:ci` paths. Can be run with `npm run test:unit:integration`. |
| **utils/** (e.g. nostr-bid, blockscoutTransactionStatus) | Not in `test:ci` paths. Run with `npm run test:unit:utils`. |
| **E2E** | Backend not ready; Playwright job commented out in CI. |

---

## 7. How to run tests

| Goal | Command |
|------|--------|
| **CI set (what runs in pipeline)** | `npm run test:ci` |
| **CI set + coverage** | `npm run test:ci -- --coverage` |
| **Full unit (watch)** | `npm run test:unit` |
| **Full unit (single run)** | `npm run test` |
| **By group** | `npm run test:unit:stores`, `test:unit:utils`, `test:unit:components`, etc. |
| **Triage (pass/fail by dir)** | `npm run test:triage` |
| **E2E** | `npm run test:e2e` (or `test:e2e:ui`) |

---

## 8. Strategy and next steps

- **Unit strategy:** [plans/unit-testing-strategy.md](../../plans/unit-testing-strategy.md) — layout, principles, pending work.
- **Coverage expansion:** [plans/coverage-expansion-plan.md](../../plans/coverage-expansion-plan.md) — phases (helpers → stores/utils → API → components), “only test used code,” chunk log.
- **Pipeline / branch strategy:** [../ci/pipeline-branch-strategy.md](../ci/pipeline-branch-strategy.md) — when CI runs, unit vs coverage, cache, re-enabling E2E.

**Suggested next:** Phase C (API services) or Phase D (critical path components); or fix _pending (ReceivePaymentForm, DebugContractCard) and move them back into CI.

---

## 9. References

| Doc | Content |
|-----|--------|
| [pipeline-improvement.md](./pipeline-improvement.md) | CI test set, MR coverage, triage, per-dir commands |
| [e2e-testing.md](./e2e-testing.md) | E2E specs, env vars, credentials, run order |
| [coverage-how-it-works.md](./coverage-how-it-works.md) | How GitLab gets coverage %, Cobertura, what else is possible |
| [../ci/pipeline-branch-strategy.md](../ci/pipeline-branch-strategy.md) | When pipeline runs, cache, re-enabling Playwright |
| `plans/unit-testing-strategy.md` | Unit layout, principles, pending |
| `plans/coverage-expansion-plan.md` | Coverage phases, helper inventory, next targets |
| `src/lib/tests/_pending/README.md` | Why each pending file is excluded, how to re-enable |
