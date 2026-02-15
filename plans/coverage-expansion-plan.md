# Plan: Coverage Expansion for BitTasker

**Status:** Phase A largely complete; Phase B next  
**Created:** 2025-02-15  
**Goal:** Systematically increase test coverage with the highest-value targets first. Use `coverage/index.html` (from `npm run test:ci -- --coverage`) to track progress.

---

## Assessment & Next Focus (post–Phase A)

**Progress so far:** Phase A (helpers) — **31/42** helpers tested; 6 pending (biometrics, fcm, generateQrCodeUrl, migratePasskey, mnemonic, webBiometrics). Escrow utils and several wallet/formatting helpers are well covered.

**Where to add tests next (by value for BitTasker):**

| Priority | Area | Why | Effort |
|----------|------|-----|--------|
| **1** | **Phase B — Wallet utils** (`$lib/utils/wallet/`) | **Done.** `contractErrorHandler`, `swapTransaction`, `rpcHelpers`, `transactionHistory` ✅ tested (`unit/utils/wallet/`). `contractDetection` already tested. `balanceManager` not used — skip. | Medium — mock ethers/wallet |
| **2** | **Phase B — Stores** (`task.store`, `auth.store`) | **Done.** `task.store.test.ts` (myTasksStore, tasksStore.reset, TASKS_PER_PAGE), `auth.store.test.ts` (setLoading, setError, login, logout with mocks). See `plans/stores-testing-guide.md`. | Medium |
| **3** | **Unblock _pending** | **Done.** `functionParsing.test.ts` and `loadContractsByAddress.test.ts` moved to `unit/utils/wallet/` with fixed mocks (escrow v1, loadEscrowDetails). Run in CI. | Low–medium |
| **4** | **Phase C — API services** | `push-notification.service`, crypto-price, Nostr services. Mock fetch/WebSocket. | Medium |
| **5** | **Phase D — Critical path components** | Auth (login/recover), task create, bidding. High impact but more mocks (i18n, Capacitor, stores). | High |

**Recommendation:** Start with **Phase B — wallet utils** (e.g. `transactionHistory`, `balanceManager`) or **unblocking _pending** contract tests so more business logic is in CI. Then add **store tests** for `task.store` / `auth.store` where logic is testable in isolation.

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

#### Phase A — Full Inventory (42 helpers in `$lib/utils/helpers/`)

| Helper | Status | Notes |
|--------|--------|-------|
| `auth` | ✅ Tested | unit/helpers/auth.test.ts |
| `biometricErrorHandler` | ✅ Tested | unit/helpers/biometricErrorHandler.test.ts |
| `biometrics` | ⬜ Pending | Login, recover, nostrKeys, PasskeySetup; requires Capacitor mock |
| `budgetTier` | ✅ Done | Task creation |
| `clipboard` | ✅ Tested | unit/helpers/clipboard.test.ts |
| `common` | ✅ Done | debounce |
| `contractPermissions` | ✅ Tested | unit/utils/escrow/contractPermissions.test.ts |
| `contractStatusFormatter` | ✅ Done | Task/escrow flows |
| `cookies` | ⬜ Not used | No imports — skip |
| `crypto` | ✅ Tested | unit/helpers/crypto.test.ts |
| `currencyFormatter` | ✅ Tested | unit/helpers/currencyFormatter.test.ts |
| `date` | ✅ Tested | unit/helpers/date.test.ts |
| `dateFormatter` | ✅ Tested | unit/helpers/dateFormatter.test.ts |
| `dateTier` | ✅ Done | Task creation |
| `deviceCompatibility` | ✅ Tested | unit/helpers/deviceCompatibility.test.ts |
| `deviceIdentity` | ✅ Tested | unit/helpers/deviceIdentity.test.ts |
| `deviceSettings` | ✅ Tested | unit/helpers/deviceSettings.test.ts |
| `encoding` | ✅ Tested | unit/helpers/encoding.test.ts |
| `errorTypeDetector` | ✅ Done | Error troubleshooting |
| `escrowErrors` | ✅ Tested | unit/utils/escrow/escrowErrors.test.ts |
| `fcm` | ⬜ Pending | push-notification.service; Firebase mock |
| `generateQrCodeUrl` | ⬜ Pending | Wallet QR; canvas/async |
| `haptics` | ✅ Tested | unit/helpers/haptics.test.ts |
| `keyboard` | ⬜ Not used | No imports — skip |
| `lightningInvoice` | ✅ Done | Wallet flows |
| `linkParser` | ✅ Done | Chat/messages |
| `lru-cache` | ✅ Tested | unit/helpers/lru-cache.test.ts |
| `messageParser` | ✅ Done | Chat/messages |
| `migratePasskey` | ⬜ Pending | Login, auth.store; complex flow |
| `mnemonic` | ⬜ Pending | wallet.store; getMnemonic |
| `pageVisibility` | ⬜ Not used | No imports — skip |
| `password` | ✅ Tested | unit/helpers/password.test.ts |
| `paymentAddressParser` | ✅ Tested | unit/utils/paymentAddressParser.test.ts |
| `profile` | ✅ Done | Profile URLs |
| `showErrorModal` | ✅ Tested | unit/helpers/showErrorModal.test.ts |
| `splashScreen` | ✅ Tested | unit/helpers/splashScreen.test.ts |
| `statusBar` | ✅ Tested | unit/helpers/statusBar.test.ts |
| `task-id` | ✅ Done | Task IDs |
| `taskStatusBadge` | ✅ Done | Task status display |
| `userDisplayName` | ✅ Done | Display logic |
| `validators` | ✅ Tested | unit/helpers/validators.test.ts |
| `webBiometrics` | ⬜ Pending | Recover, PasskeySetup; requires Web Authn mock |

**Phase A Checklist (chunks completed):** 1–21 (…splashScreen, statusBar, biometricErrorHandler, password).

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
| 13-15 | 2025-02-15 | date, lru-cache, showErrorModal | Tests added; all pass |
| 16-18 | 2025-02-15 | deviceSettings, deviceCompatibility, clipboard | Tests added; all pass |
| 19-20 | 2025-02-15 | haptics, splashScreen | Tests added; all pass (hoisted mocks, module state reset for splash) |
| 21 | 2025-02-15 | statusBar, biometricErrorHandler, password | Tests added; all pass |

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
- **Wallet utils (Phase B):** `plans/wallet-utils-testing-guide.md` — usage matrix, what to test, behavior guidelines, implementation order.
- **Stores (Phase B):** `plans/stores-testing-guide.md` — what to test, minimal mocks, reset between tests.
