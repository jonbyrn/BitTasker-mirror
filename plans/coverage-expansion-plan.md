# Plan: Coverage Expansion for BitTasker

**Status:** In progress — Phase A  
**Created:** 2025-02-15  
**Goal:** Systematically increase test coverage with the highest-value targets first. Use `coverage/index.html` (from `npm run test:ci -- --coverage`) to track progress.

**Chunk strategy:** One helper per chunk (or batch 2–3 short helpers). Run `test:ci` and `test:ci -- --coverage` after each. Update this log before moving on.

**Only test used code:** Before adding tests for a helper, verify it is imported by routes or components (grep `from '$lib/...'` in `src/routes`, `src/lib/components`). Skip helpers that are not used in the app.

---

## 1. Current Baseline

| Metric | Value |
|--------|-------|
| **Statements** | ~19% |
| **Branches** | ~65% |
| **Functions** | ~30% |
| **Lines** | ~19% |

Coverage is scoped to `src/**` (excludes node_modules, build, stories, tests). Report: `coverage/index.html`.

---

## 2. Value Framework

**High value** = used on critical paths (wallet, auth, tasks, bidding), pure logic, or shared across many modules.  
**Low effort** = pure functions, few dependencies, easy to mock.

| Tier | Criteria | ROI |
|------|----------|-----|
| **T1** | Pure helpers/utils, high reuse | Highest — easy tests, broad impact |
| **T2** | Stores, API services (mock HTTP) | High — core business logic |
| **T3** | Critical path components (wallet, auth forms) | Medium — more mocking, user-flow validation |
| **T4** | Route load logic, secondary components | Lower — integration-style tests |

---

## 3. Recommended Start Order

### Phase A — Highest ROI (Start Here)

**Target: `$lib/utils/helpers/`**

- **Why:** Pure functions, used everywhere. One helper per chunk to avoid losing focus.
- **Location:** Add `unit/helpers/<name>.test.ts` (e.g. `contractStatusFormatter.test.ts`).
- **After each chunk:** Run `npm run test:ci` and `npm run test:ci -- --coverage`; update Chunk log below.

#### Phase A Checklist

| Chunk | Helper | Status | Notes |
|-------|--------|--------|-------|
| 1 | `contractStatusFormatter` | ✅ Done | Task/escrow flows |
| 2 | `budgetTier` | ✅ Done | Task creation |
| 3 | `dateTier` | ✅ Done | Task creation |
| 4 | `task-id` | ✅ Done | Task IDs |
| 5 | `userDisplayName` | ✅ Done | Display logic |
| 6 | `linkParser` | ✅ Done | Form/display |
| 7 | `lightningInvoice` | ✅ Done | Wallet flows |
| 8 | `common` | ✅ Done | debounce |
| 9 | `errorTypeDetector` | ✅ Done | Error troubleshooting |
| 10 | `taskStatusBadge` | ✅ Done | Task status display |
| 11 | `messageParser` | ✅ Done | Chat/messages |
| 12 | `profile` | ✅ Done | Profile URLs |

**Already tested (skip):** validators, auth, crypto, currencyFormatter, encoding, dateFormatter, deviceIdentity, nostr-message, nip44-message; paymentAddressParser (unit/utils/).

#### Phase A Chunk Log

| Chunk | Date | Helper | Result |
|-------|------|--------|--------|
| 1 | 2025-02-15 | contractStatusFormatter | Tests added; all pass |
| 2 | 2025-02-15 | budgetTier | Tests added; all pass |
| 3 | 2025-02-15 | dateTier | Tests added; all pass |
| 4 | 2025-02-15 | task-id | Tests added; all pass |
| 5 | 2025-02-15 | userDisplayName | Tests added; all pass |
| 6 | 2025-02-15 | linkParser | Tests added; all pass |
| 7 | 2025-02-15 | lightningInvoice | Tests added; all pass |
| 8-12 | 2025-02-15 | common, errorTypeDetector, taskStatusBadge, messageParser, profile | Tests added; all pass |

### Phase B — Core Business Logic

**Target: `$lib/utils/` (non-helpers)**

- **Escrow** — Already well-tested (unit/utils/escrow/). Extend if gaps in coverage report.
- **Wallet utils** — `transactionHistory`, `swapTransaction`, `balanceManager`, `functionParsing`, `contractDetection`. Some have tests; check coverage for untested branches.
- **Nostr** — `nostr-bid`, `findTasks` (fix or remove dead test). Used by tasks + bidding.
- **Effort:** Medium. Mock wallet-core, ethers, Nostr relays.
- **Impact:** Wallet and task flows are critical.

**Target: `$lib/stores/`**

- **Already have:** wallet.store, bid.store.
- **Add:** task.store (tasks list, task pages), auth/app store pure logic if extractable.
- **Effort:** Medium. Mock subscriptions, external deps.

### Phase C — API Services

**Target: `$lib/api/services/`**

- **Current:** balanceHistory (~34% services), token-balance tested.
- **Gaps:** crypto-price, push-notification, nostr services. Check coverage report for specific files.
- **Effort:** Medium. Mock fetch, WebSocket, external APIs.
- **Impact:** Data layer; failures affect UX directly.

### Phase D — Critical Path Components

**Target: Wallet, Auth, Task Forms**

- **Wallet:** SendPaymentForm ✓, ReceivePaymentForm in _pending_. Fix pending first.
- **Auth:** Login, signup, recover flows — often 0% or low. High user impact.
- **Tasks:** Create-task form, task details, bid forms. Bidding ~48% coverage.
- **Effort:** High. Many mocks (walletStore, i18n, Capacitor). Follow component quality guidelines below.
- **Impact:** User-facing flows; catch regressions.

### Phase E — Lower Priority

- **Route load functions** — tasks-page has tests; extend to other routes with non-trivial load logic.
- **Debug* components** — Dev-only; low priority.
- **Contract components** — 0% coverage; in _pending_ due to EventBus. Fix blockers first.

---

## 4. Guidelines

### 4.1 Only Test Used Code

A module is **used** if it is imported by:
- Any route (`src/routes/**/+page.svelte`, `+layout.svelte`, `+page.ts`)
- Any component (`src/lib/components/**`)
- Another `$lib` module that is itself used (transitive)

Before adding tests: `grep -r "from '\$lib/utils/helpers/<name>" src/routes src/lib/components src/lib/utils src/lib/stores src/lib/api`

### 4.2 Component Test Quality

When adding or fixing component tests:

| Do | Don't |
|----|-------|
| Read the component — props, flows, branches | Mock away so much that real logic isn't tested |
| Assert behavior — state changes, callbacks, DOM | Assert implementation details (classes, structure) |
| Use semantic queries — `getByRole`, `getByLabelText` | Rely on fragile selectors (nth-child) |
| Test user flows — render → interact → assert | Test only "renders" without interaction |

---

## 5. Execution Workflow

**Per-chunk (Phase A):**

1. Pick next unchecked helper from Phase A Checklist.
2. **Verify used in app:** `grep -r "from '\$lib/.*<helper>" src/routes src/lib/components` — skip if not found.
3. Read the helper source; list exported functions and edge cases.
4. Create `src/lib/tests/unit/helpers/<name>.test.ts`.
5. Run `npm run test:ci` → must stay green.
6. Run `npm run test:ci -- --coverage` → note coverage delta.
7. Update Checklist and Chunk Log.
8. Commit. Move to next chunk.

---

## 6. Success Metrics

| Metric | Target (Phase A complete) | Target (Phase B complete) |
|--------|---------------------------|---------------------------|
| Helpers coverage | >90% | >90% |
| Utils (escrow, wallet) | — | >60% |
| Overall statements | >25% | >35% |

Track in coverage report. No strict gate — use as guidance.

---

## 7. References

- **Strategy:** `plans/unit-testing-strategy.md`
- **Coverage config:** `vite.config.ts` (test.coverage)
- **Test layout:** `src/lib/tests/README.md`
