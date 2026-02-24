# feat/task-status Branch — Review and Testing Plan

**Purpose:** Guide a reviewer through understanding this branch compared to `origin/dev`, and outline how to add tests to validate the changes before merge.

**Status:** Active (for merge review)  
**Branch:** `feat/task-status` (17 commits ahead of `origin/dev`)  
**PR Theme:** Task status updates — but scope extends beyond that.

---

## 1. Executive Summary

| Metric            | Value                                           |
| ----------------- | ----------------------------------------------- |
| **Files changed** | 54                                              |
| **Insertions**    | 2,253                                           |
| **Deletions**     | 3,282                                           |
| **Net diff**      | −1,029 lines                                    |
| **Tests run**     | `npm run test:ci` → 1040 passed, 15 skipped     |
| **Test coverage** | Baseline ~19–22% (see `docs/testing/README.md`) |

**Bottom line:** The branch name suggests "task status updates" but the PR touches **bidding, contracts/escrow, task conversion/deletion, location handling, UI components, translations, and E2E tests**. There is **no new test coverage** for the new behavior; a few existing tests were updated (escrow, wallet store). Before merge, the reviewer should understand the scope, identify risk areas, and add tests.

**Note:** The `requirements/services-listing-feature-plan.md` document you may have open describes a different feature (Services Listing / NIP-99). It is **not** part of this branch.

---

## 2. Branch Overview

### 2.1 Commits (feature work, excludes merges)

| Commit     | Description                                                                                 |
| ---------- | ------------------------------------------------------------------------------------------- |
| `28fc1523` | feat(bidding): enhance bid form and dashboard with task details and notifications           |
| `e94378a0` | feat(bidding): refine bid form and task display with improved localization and structure    |
| `476b604f` | feat(location): prevent sending locations for remote tasks                                  |
| `6f5fbae5` | refactor(logging): remove debug logs for improved code clarity                              |
| `f4f70ebb` | feat(contract): update task status on completion and enhance task update logic              |
| `ab053d50` | Update task status handling in BidAcceptanceForm and escrowEvents                           |
| `bc6cd787` | Enhance task conversion and deletion logic                                                  |
| `58addee8` | Refactor user display components for consistency and clarity                                |
| `dcac74e0` | test: enhance mocks in escrow and wallet store tests for improved isolation and reliability |
| `881362e8` | Update prettier-plugin-tailwindcss and package-lock.json                                    |

### 2.2 What the PR Actually Covers

1. **Task status flow** — Task status transitions (OPEN → IN_PROGRESS on bid accept, COMPLETED on contract completion).
2. **Bidding UI and behavior** — Bid form, bid acceptance, dashboard panels, task details in bid flow.
3. **Escrow/contract integration** — Task status sync with contract lifecycle; task update on completion.
4. **Location handling** — No location sent for remote tasks (important for Nostr and UX).
5. **Task conversion/deletion** — Logic in `nostr/task.ts` and related stores.
6. **Code cleanup** — Removal of `import.meta.env.DEV` debug logs in `contractPermissions`, `nostrContract`, etc.
7. **Translations** — New/updated keys in `common.json`, bids, contracts.
8. **E2E refactor** — `tasks-page.spec.ts` heavily reformatted (structure/formatting, not necessarily behavior).

---

## 3. Change Areas by Domain

### 3.1 Task Status Core

| File                                       | Change                                              |
| ------------------------------------------ | --------------------------------------------------- |
| `src/lib/nostr/task.ts`                    | Task status updates, conversion/deletion logic      |
| `src/lib/utils/enums/task.enum.ts`         | (Reference only — no change; `TaskStatusEnum` used) |
| `src/lib/utils/helpers/taskStatusBadge.ts` | (Reference only)                                    |

**Behavior:** When a bid is accepted → task status set to `IN_PROGRESS`; when contract completes → task status set to `COMPLETED`. These updates publish Nostr addressable events (same kind/pubkey/d-tag, latest content).

### 3.2 Bidding

| File                                                               | Change                                                            |
| ------------------------------------------------------------------ | ----------------------------------------------------------------- |
| `src/lib/components/bidding/BidAcceptanceForm.svelte`              | Task status update on accept; location sending for in-person only |
| `src/lib/components/bidding/BidForm.svelte`                        | Major refactor — structure, localization, task display            |
| `src/lib/components/bidding/BidCardDetailed.svelte`                | Minor updates                                                     |
| `src/lib/components/bidding/DashboardBidsPanel.svelte`             | Task details, notifications, structure                            |
| `src/routes/(protected)/dashboard/task/[taskId]/bids/+page.svelte` | Page updates for bid flow                                         |

**Note:** `BidAcceptanceForm.test.ts` has **7 skipped tests**; Svelte warns about `props` closure references (`state_referenced_locally`).

### 3.3 Contracts / Escrow

| File                                                          | Change                                                                                      |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `src/lib/components/contracts/ContractActions.svelte`         | Task status update to COMPLETED on completion                                               |
| `src/lib/components/contracts/ContractDrawer.svelte`          | Minor                                                                                       |
| `src/lib/components/contracts/DashboardContractsPanel.svelte` | UI updates                                                                                  |
| `src/lib/components/contracts/DebugContractCard.svelte`       | Debug display                                                                               |
| `src/lib/stores/contract.store.ts`                            | Store logic updates                                                                         |
| `src/lib/utils/escrow/v1/escrow.ts`                           | Task status handling, contract lifecycle                                                    |
| `src/lib/utils/escrow/v1/escrowEvents.ts`                     | Status publish flow; note: "Task status update to IN_PROGRESS is done in BidAcceptanceForm" |
| `src/lib/utils/escrow/v1/escrowBid.ts`                        | Minor                                                                                       |
| `src/lib/utils/escrow/v1/nostrContract.ts`                    | Debug log removal; contract/status logic                                                    |
| `src/lib/utils/wallet/loadContractsByAddress.ts`              | Load logic changes                                                                          |

### 3.4 Location

| File                                                     | Change                               |
| -------------------------------------------------------- | ------------------------------------ |
| `src/lib/utils/location/sendLocation.ts`                 | Don't send location for remote tasks |
| `src/lib/components/location/LocationDetailsCard.svelte` | Display updates                      |
| `src/lib/components/maps/TaskLocationMap.svelte`         | Minor                                |
| `src/lib/components/task/TaskLocationDisplay.svelte`     | Minor                                |

### 3.5 Helpers and Removals

| File                                           | Change                                                                           |
| ---------------------------------------------- | -------------------------------------------------------------------------------- |
| `src/lib/utils/helpers/contractPermissions.ts` | **88 lines removed** — all `import.meta.env.DEV` debug logs (no behavior change) |
| `src/lib/utils/constants/tags.ts`              | Tag updates                                                                      |
| `src/lib/utils/constants/menu.constants.ts`    | Menu updates                                                                     |

### 3.6 UI Components (shared, task, user)

| File                                                  | Change                   |
| ----------------------------------------------------- | ------------------------ |
| `src/lib/components/Drawer.svelte`                    | Minor                    |
| `src/lib/components/shared/CollapsibleSection.svelte` | Structure                |
| `src/lib/components/shared/UsdSatsDisplay.svelte`     | Minor                    |
| `src/lib/components/task/TaskDetailsView.svelte`      | Minor                    |
| `src/lib/components/task/details/TaskTab.svelte`      | Status/behavior          |
| `src/lib/components/task/TaskDeadlineDisplay.svelte`  | Minor                    |
| `src/lib/components/user/UserInfoDisplay.svelte`      | Refactor for consistency |
| `src/lib/components/date/DateInput.svelte`            | Minor                    |
| `src/lib/components/task/steps/TaskBudget.svelte`     | 47 lines removed         |
| `src/lib/components/wallet/TransactionHistory.svelte` | Minor (7 lines removed)  |
| `src/lib/components/messages/MessageModal.svelte`     | Minor                    |

### 3.7 Routes and Stores

| File                                                                 | Change                          |
| -------------------------------------------------------------------- | ------------------------------- |
| `src/routes/(protected)/dashboard/+page.svelte`                      | Minor                           |
| `src/routes/(protected)/dashboard/create-task/+page.svelte`          | Minor (6 lines removed)         |
| `src/routes/(protected)/dashboard/find-tasks/+page.svelte`           | Minor                           |
| `src/routes/(protected)/dashboard/debug-smart-contract/+page.svelte` | Significant (123 lines changed) |
| `src/routes/tasks/[taskId]/+page.ts`                                 | Load logic (27 lines)           |
| `src/routes/taskees/+page.svelte`                                    | Minor                           |
| `src/lib/stores/wallet.store.ts`                                     | 55 lines changed                |
| `src/lib/nostr/findMyTasks.ts`                                       | Minor                           |

### 3.8 Tests

| File                                                       | Change                              |
| ---------------------------------------------------------- | ----------------------------------- |
| `src/lib/tests/components/contract/escrow.test.ts`         | 105 lines changed — mocks enhanced  |
| `src/lib/tests/unit/stores/wallet.store.functions.test.ts` | 69 lines changed — mocks            |
| `src/lib/tests/unit/utils/escrow/escrowBid.test.ts`        | 65 lines changed                    |
| `src/lib/tests/unit/utils/escrow/escrowEvents.test.ts`     | 74 lines changed                    |
| `tests/e2e/tasks-page.spec.ts`                             | Large reformat (2672 lines touched) |

### 3.9 Translations

| File                                                 | Change       |
| ---------------------------------------------------- | ------------ |
| `static/locales/en/common.json`                      | 4 changes    |
| `static/locales/en/dashboard/bids.json`              | 12 changes   |
| `static/locales/en/dashboard/contracts/actions.json` | 4 changes    |
| `static/locales/es/*`                                | Mirror of en |

---

## 4. Testing Gap Analysis

### 4.1 What Has Tests (and Was Updated)

- **Escrow utils** — `escrow.test.ts`, `escrowBid.test.ts`, `escrowEvents.test.ts` — mocks enhanced for isolation.
- **Wallet store** — `wallet.store.functions.test.ts` — mocks updated.
- **Contract component** — `escrow.test.ts` (component test) — updated.

### 4.2 What Lacks Coverage for New Behavior

| Area                     | Risk   | Recommendation                                                                                                             |
| ------------------------ | ------ | -------------------------------------------------------------------------------------------------------------------------- |
| Task status flow         | High   | Unit tests for `updateTask` calls in bid accept and contract complete; integration test for OPEN → IN_PROGRESS → COMPLETED |
| Location "remote" skip   | Medium | Unit test for `sendLocation.ts`: verify no send when `isRemote`                                                            |
| Bid form refactor        | Medium | Component tests for `BidForm.svelte`, `BidAcceptanceForm.svelte` (unskip existing 7 tests)                                 |
| Task conversion/deletion | Medium | Unit tests for new logic in `task.ts`                                                                                      |
| `loadContractsByAddress` | Medium | Unit test (was in \_pending; may need mock fixes)                                                                          |
| E2E tasks-page           | Low    | Verify E2E still passes; diff is mostly reformat                                                                           |

### 4.3 Current Test Status

- **`npm run test:ci`** → 1040 passed, 15 skipped.
- **BidAcceptanceForm.test.ts** → 7 tests skipped; Svelte rune warnings for `props` closure.
- **E2E** → Not in CI; run locally with `npm run test:e2e` if tasks flow is critical.

---

## 5. Review Strategy — How to Tackle This

### Phase 1: Overview (1–2 hours)

1. Read this plan end-to-end.
2. Run `git diff origin/dev --stat` and skim `git log origin/dev..HEAD --oneline`.
3. Run `npm run test:ci` and confirm all pass.
4. Skim `docs/testing/README.md` and `plans/unit-testing-strategy.md`.

### Phase 2: Core Logic Deep Dive (2–3 hours)

See **[task-status-flow-logic-deep-dive.md](./task-status-flow-logic-deep-dive.md)** for the full traced flow.

1. **Task status flow**

   - Trace: `BidAcceptanceForm.svelte` → `updateTask(taskId, { status: IN_PROGRESS })` on bid accept.
   - Trace: `ContractActions.svelte` → `updateTask(taskId, { status: COMPLETED })` on contract completion.
   - Read `src/lib/nostr/task.ts` — `updateTask` and conversion/deletion logic.

2. **Location logic**

   - Read `sendLocation.ts` — `isRemote` branch; ensure remote tasks never send locations.

3. **Escrow/contract integration**
   - Read `escrowEvents.ts` — `publishEscrowStatus` and relation to task status.
   - Read `loadContractsByAddress.ts` — changes and implications.

### Phase 3: UI and UX (1–2 hours)

1. Manually test:
   - Accept bid → task status becomes IN_PROGRESS; bidding closed.
   - Complete contract → task status becomes COMPLETED.
   - Create remote task → no location sent to taskee.
2. Check translations: switch language, verify new keys render.

### Phase 4: Add Tests (see §6)

Add unit, component, and (optionally) integration tests per the testing plan below.

---

## 6. Testing Plan — What to Add

### 6.1 Unit Tests

| Target                                       | Location                                                         | Focus                                                                        |
| -------------------------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `sendLocation.ts`                            | `src/lib/tests/unit/utils/location/sendLocation.test.ts`         | `isRemote === true` → no location sent; `isRemote === false` → location sent |
| `task.ts` (updateTask, conversion, deletion) | `src/lib/tests/unit/nostr/task.test.ts` (or extend existing)     | Status update behavior; conversion/deletion paths                            |
| `loadContractsByAddress.ts`                  | `src/lib/tests/unit/utils/wallet/loadContractsByAddress.test.ts` | New logic; mock wallet store, escrow                                         |

### 6.2 Component Tests

| Target                     | Location                                                           | Focus                                                                                               |
| -------------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| `BidAcceptanceForm.svelte` | `src/lib/tests/components/bidding/BidAcceptanceForm.test.ts`       | Fix Svelte rune warnings; **unskip 7 tests**; assert `updateTask` called with IN_PROGRESS on accept |
| `ContractActions.svelte`   | `src/lib/tests/components/contracts/ContractActions.test.ts` (new) | Assert `updateTask` called with COMPLETED on completion                                             |
| `BidForm.svelte`           | `src/lib/tests/components/bidding/BidForm.test.ts` (new)           | Basic render; task display; localization                                                            |

### 6.3 Integration Tests

| Target           | Location                                                                      | Focus                                                                    |
| ---------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Task status flow | `src/lib/tests/integration/routes/task-status-flow.integration.test.ts` (new) | Mock Nostr/task store; assert OPEN → IN_PROGRESS → COMPLETED transitions |

### 6.4 E2E (Optional)

- Run `npm run test:e2e` on `tests/e2e/tasks-page.spec.ts`.
- Confirm refactor did not change behavior; fix any failing tests.

### 6.5 References for Writing Tests

- **Unit tests:** `plans/unit-testing-strategy.md`, `plans/coverage-expansion-plan.md`
- **Component tests:** `src/lib/tests/components/` — patterns from `escrow.test.ts`, `BidAcceptanceForm.test.ts`
- **Store tests:** `plans/stores-testing-guide.md`
- **Commands:** `npm run test:unit`, `npm run test:unit:utils`, `npm run test:ci -- --coverage`

---

## 7. Risk Areas and Red Flags

| Risk                                 | Severity | Mitigation                                                                      |
| ------------------------------------ | -------- | ------------------------------------------------------------------------------- |
| Task status not synced on edge cases | High     | Add integration test; manual QA of accept/complete flow                         |
| Remote tasks still sending location  | Medium   | Unit test for `sendLocation`                                                    |
| BidAcceptanceForm 7 skipped tests    | Medium   | Fix rune warnings; unskip and extend tests                                      |
| E2E reformat introduced regressions  | Low      | Run E2E locally; compare behavior to dev                                        |
| contractPermissions debug removal    | Low      | Pure cleanup; `determineContractState` logic unchanged; existing tests cover it |
| Wallet/escrow store mock drift       | Low      | Tests pass; mocks were deliberately updated                                     |

---

## 8. Quick Reference

### Commands

```bash
# Compare to dev
git diff origin/dev --stat
git log origin/dev..HEAD --oneline

# Run tests
npm run test:ci
npm run test:ci -- --coverage
npm run test:unit:stores
npm run test:unit:utils
npm run test:e2e

# Type check
npm run check
npm run lint
```

### Key Files to Read

- `src/lib/components/bidding/BidAcceptanceForm.svelte` (lines 280–295) — task status update on accept
- `src/lib/components/contracts/ContractActions.svelte` — task status update on completion
- `src/lib/nostr/task.ts` — `updateTask`, conversion, deletion
- `src/lib/utils/location/sendLocation.ts` — remote-task branch

### Project Context

- **BitTasker:** Gig economy platform; Taskers post tasks, Taskees bid; Nostr for data, Rootstock for escrow.
- **Task status lifecycle:** OPEN → BID_ACCEPTED → ESCROW_FUNDED → IN_PROGRESS → COMPLETED (and variants).
- **Testing:** Vitest for unit/component; Playwright for E2E; see `docs/testing/README.md`.

---

## 9. Next Steps

1. Complete Phase 1–3 of the review strategy.
2. Add unit tests for `sendLocation` and `task.ts` logic.
3. Fix and unskip `BidAcceptanceForm` tests; add `ContractActions` and `BidForm` component tests.
4. Optionally add integration test for task status flow.
5. Run E2E locally; document any failures.
6. Update this plan as you progress (e.g., mark tests added, risks mitigated).
7. When stable, move relevant content to `docs/` per `plans/README.md`.
