# Escrow Migration Plan: Old `utils/escrow` → New `utils/contract`

## Executive Summary

The old escrow system (`src/lib/utils/escrow/`) and the new contract system (`src/lib/utils/contract/`) are duplicate implementations. The new system is version-agnostic (v1 + v2), uses a rune-per-contract architecture, and has cleaner separation of chain writes, lifecycle orchestration, and Nostr event publishing.

**Delete target:** `src/lib/utils/escrow/` (9 files) + dead wallet wrappers (3 files).

**Main blocker:** `contract.store.ts` still uses old `escrow.contractOps.getContracts()` for Nostr contract queries. Once this is migrated, the old system can be deleted.

**Scope reduction from v1 analysis:**

- `escrowBid.ts` is dead code — no production callers. V2 `creation.ts` already replaced all bid operations.
- `contractPermissions.ts` (638 lines) is deprecated — the new `computeV1PermittedActions`/`computeV2PermittedActions` already power the contract rune path.
- `wallet/escrow.ts` and `wallet/loadContractsByAddress.ts` have zero non-test consumers.
- `wallet/escrowEvents.ts` has a broken import to a nonexistent file.
- V1 `createEscrow` is not needed for new contracts — all new contracts use V2 via `contract/v2/creation.ts`.
- `merkle-review-sdk` was deleted by the team.
- i18n keys and test files are NOT blockers — they are bulk cleanup after all code is migrated.

---

## 1. Current State

### 1.1 Old System (`src/lib/utils/escrow/`) — 9 files

| File                  | Lines | Status                                                                              |
| --------------------- | ----- | ----------------------------------------------------------------------------------- |
| `index.ts`            | ~700  | **EscrowManager singleton — main migration target**                                 |
| `types.ts`            | ~417  | Version handler interfaces                                                          |
| `v1/escrow.ts`        | ~1600 | V1 blockchain operations + `ensureEscrowReady`                                      |
| `v1/escrowBid.ts`     | ~400  | **DEAD CODE — no production callers**                                               |
| `v1/escrowEvents.ts`  | ~600  | Pending contract tracking + service acceptance retry                                |
| `v1/nostrContract.ts` | ~1100 | Nostr event publishing + `getContracts` + `handleStatusEvent`/`handleContractEvent` |
| `v1/escrow.enum.ts`   | ~46   | `EscrowStatus` enum (0-16)                                                          |
| `v1/abi.json`         | ~730  | V1 contract ABI (identical to `contract/v1/abi.json`)                               |
| `v1/index.ts`         | ~44   | V1 barrel exports                                                                   |

### 1.2 New System (`src/lib/utils/contract/`) — already the runtime path

The contract rune (`contractRune.svelte.ts`) uses `getPaymentContractLifecycle(version)` from the new system for ALL blockchain operations. The old `EscrowManager` is only used for:

1. Nostr contract querying (`getContracts`) — via `contract.store.ts`
2. Nostr event handling (`handleStatusEvent`, `handleContractEvent`) — via `contract.store.ts`
3. ABI access (`getABI`) — via `functionParsing.ts`
4. `EscrowStatus` enum — via helper files and type definitions

### 1.3 Confirmed: ABIs are byte-for-byte identical between old and new

---

## 2. Production Dependency Map (updated)

### 2.1 Files importing from old `$lib/utils/escrow`

| #   | File                                                      | Import                          | What it uses                                                           | Migration difficulty                   |
| --- | --------------------------------------------------------- | ------------------------------- | ---------------------------------------------------------------------- | -------------------------------------- |
| 1   | `stores/contract.store.ts`                                | `{ escrow }`                    | `contractOps.getContracts`, `handleStatusEvent`, `handleContractEvent` | **HARD — main blocker**                |
| 2   | `utils/wallet/functionParsing.ts`                         | `{ escrow }`                    | `escrow.getABI()` for ethers Interface                                 | **Trivial** — direct ABI import        |
| 3   | `utils/nostr-bid.ts`                                      | `{ escrow }`                    | `contractOps.getContracts` via `getUserContracts()` wrapper            | Medium                                 |
| 4   | `components/task/details/TaskTab.svelte`                  | `{ escrow }`                    | `contractOps.getContracts`, `escrowOps.checkEscrowFundingStatus`       | Medium                                 |
| 5   | `components/service/DashboardMyServicesPanel.svelte`      | `{ escrow }`                    | `contractOps.getContracts`                                             | Medium                                 |
| 6   | `routes/(protected)/dashboard/+page.svelte`               | `{ escrow }`                    | `contractOps.getContracts`                                             | Medium                                 |
| 7   | `types/contract.d.ts`                                     | `type { EscrowStatus }`         | 7 type fields                                                          | Medium — cascading                     |
| 8   | `types/wallet.d.ts`                                       | `{ EscrowStatus }`              | `EscrowData.status` field                                              | Medium                                 |
| 9   | `utils/helpers/task-status-reconciliation.ts`             | `{ EscrowStatus }`              | Enum comparisons                                                       | Medium                                 |
| 10  | `utils/helpers/contractStatusFormatter.ts`                | `{ EscrowStatus }`              | Enum comparisons                                                       | Medium                                 |
| 11  | `utils/helpers/contractStatusFormatterV2.ts`              | `{ EscrowStatus }`              | Partial — already uses ContractDisplayStatus too                       | Easy                                   |
| 12  | `utils/helpers/contractPermissions.ts`                    | `{ EscrowStatus }` from v1/enum | 638-line state machine                                                 | **DEPRECATED — delete, don't migrate** |
| 13  | `utils/contract/v1/legacyEscrowStatusToContractStatus.ts` | `{ EscrowStatus }` from v1/enum | Bridge — normalize old→new                                             | Last to migrate                        |
| 14  | `utils/constants/tags.ts`                                 | `type { EscrowStatus }`         | `TAG_PATTERNS.contractStatus()` action parameter                       | **Trivial** — change type annotation   |

### 2.2 Files importing from old v1 directly (debug/e2e only)

| #   | File                                            | Import                            | Priority             |
| --- | ----------------------------------------------- | --------------------------------- | -------------------- |
| 14  | `components/contracts/DebugContractCard.svelte` | `{ escrow }` from v1/escrow       | Debug — low priority |
| 15  | `routes/.../debug-smart-contract/+page.svelte`  | `{ escrow }` + `{ EscrowStatus }` | Debug — low priority |
| 16  | `routes/e2e/service-harness.html/+page.svelte`  | `{ EscrowStatus }`                | E2E — low priority   |

### 2.3 Dead code — zero production consumers

| File                                     | Reason                                                     |
| ---------------------------------------- | ---------------------------------------------------------- |
| `utils/wallet/escrow.ts`                 | Zero non-test importers                                    |
| `utils/wallet/loadContractsByAddress.ts` | Only used by debug page + tests                            |
| `utils/wallet/escrowEvents.ts`           | Broken import + dynamic imports of dead wallet/escrow      |
| `escrow/v1/escrowBid.ts`                 | All 6 functions have v2 equivalents; no production callers |

### 2.4 NOT escrow-dependent (false positives from v1 analysis)

| File                                         | Why it's not a blocker                                                                           |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `utils/wallet/contractRegistry.ts`           | Tracks smart contract addresses — general wallet utility, not old escrow code. Keep as-is.       |
| `utils/wallet/transactionHistory.ts`         | Uses `ESCROW_CONTRACT_ADDRESSES` from constants — data, not imports from old escrow. Keep as-is. |
| `utils/helpers/escrowErrors.ts`              | Custom error classes — renameable but works independently. Keep as-is for now.                   |
| `types/bid.d.ts`, `types/service-quote.d.ts` | Use `escrowId` as a data field name — backward-compatible convention, no code dependency.        |

---

## 3. Key Architectural Insight: Two Code Paths

The codebase has **two parallel contract code paths**:

### Path A — Legacy (old escrow)

```
UI Component → contract.store.ts → escrow.contractOps.getContracts()
                                  → escrow.contractOps.handleStatusEvent()
                                  → old v1/nostrContract.ts
                                  → old v1/escrow.ts (blockchain writes)
                                  → old contractPermissions.ts (permissions)
```

### Path B — Modern (new contract) — ALREADY THE PRIMARY RUNTIME PATH

```
UI Component → PaymentContractRune → getPaymentContractLifecycle(version)
                                   → lifecycle/v1.ts or lifecycle/v2.ts
                                   → contract/v1/blockchainWrites.ts or contract/v2/blockchainWrites.ts
                                   → contract/v1/permittedActions.ts or contract/v2/permittedActions.ts
```

**The migration is about switching `contract.store.ts` and remaining consumers from Path A to Path B**, then deleting Path A entirely.

The dashboard already has NDK-flavored components (`DashboardContractsPanelNDK`, `ContractCardNDK`, `ContractDrawerNDK`) that use Path B via `PaymentContractRune`. The legacy components that still call `contract.store.ts` → `getContracts` need to be switched.

---

## 4. Potential Issues and Risks

### 4.1 CRITICAL — `contract.store.ts` Migration

This is the main blocker. `contract.store.ts` uses:

1. `escrow.contractOps.getContracts(filter)` — bulk Nostr contract fetch
2. `escrow.contractOps.handleStatusEvent(event)` — real-time status subscription handler
3. `escrow.contractOps.handleContractEvent(event)` — real-time contract creation handler

The new system has NO standalone `getContracts()` function. Instead:

- Contracts are fetched via NDK at the component level (see `reviewContractsFromNdk.ts` for the pattern)
- Each contract is wrapped in a `PaymentContractRune` instance
- Status events are handled by `PaymentContractRune.setupSubscription()`

**Migration approach:** Convert `contract.store.ts` to use NDK-based fetching (following `reviewContractsFromNdk.ts` pattern) + `PaymentContractRune` instances per contract. The store's public API can be preserved while changing the implementation.

### 4.2 HIGH — `EscrowStatus` → `ContractStatus` in Type Definitions (Audit: UPGRADED from MEDIUM)

The enum values are different:

- `EscrowStatus` has 17 values (0-16) including pending-transaction states
- `ContractStatus` has 12 values (0-11) — blockchain states only
- `DisplayOnlyStatus` has 2 values (12-13) — DisputeResolutionProposed, InProgress

But the blockchain states (0-5) are the SAME numeric values between both enums:

- Funded=0, InDispute=1, DisputeResolved=2, DisputeUnresolved=3, Completed=4, Cancelled=5

The `legacyEscrowStatusToContractStatus.ts` bridge already maps every old value to new. The pending states (6, 8, 9, 11, 13-16) are replaced by the `isPending` flag + `isFreshPendingStatusEvent()` TTL check pattern.

**Audit finding: This is harder than originally rated.** `types/contract.d.ts` has 8 type fields using `EscrowStatus`. Two are particularly problematic:

- `NostrContract.status` (line 65) — Nostr event content field that can hold ANY value 0-16 on the wire
- `NostrContractStatus.action` (line 92) — describes status event action, can be any value 0-16

These are wire-format fields. Replacing them with `ContractStatus` would silently change the meaning of pending-state values. For example, `EscrowStatus.PendingFunding` (value 6) would become `ContractStatus.Refunded` (also value 6) if naively type-swapped. The bridge handles this at runtime, but the static type system won't catch the semantic mismatch.

**Mitigation:** Use `number` for wire-format fields that can carry legacy values, and `ContractDisplayStatus` for computed/display fields. Keep the bridge's runtime normalization in place.

### 4.3 MEDIUM — `contractPermissions.ts` Deletion

This 638-line file is **already deprecated**. The new system's `computeV1PermittedActions` and `computeV2PermittedActions` provide the same permission flags (renamed: `canComplete`→`canCompleteTask`, `canCancel`→`canCancelPaymentContract`, etc.) with one gap:

- **Missing `canDelete` flag** in `PermittedActions`. The old system allows deleting never-funded contracts. If this feature is still needed, add a `canDelete` field to `PermittedActions`.

The old `determineContractState` is only called from:

1. `escrow/v1/nostrContract.ts` — deleted with escrow/
2. `debug-smart-contract/+page.svelte` — deleted with debug page
3. Test files — updated or deleted

No migration is needed — just delete `contractPermissions.ts` after its callers are gone.

### 4.4 LOW — Pending-State Granularity

The old system distinguishes 8 pending states (PendingFunding, PendingCompletion, etc.) so the UI can show exactly what's pending. The new system uses a single `awaitingTx` boolean. The UI can infer context from the contract's current state. This is a UX trade-off, not a functional gap.

### 4.5 LOW — `escrowId` Data Field

`escrowId` is used extensively as a data field name in types, Nostr events, and service modules. It is NOT a code dependency on the old escrow system — it's a backward-compatible naming convention for the on-chain contract identifier. The NDK layer already maps it to `paymentId` for v2. Renaming is deferred to a separate task.

---

## 5. Prerequisites

1. All tests pass: `npm run test:ci`
2. Type check passes: `npm run check`
3. Lint passes: `npm run lint`
4. Backup branch: `git branch backup/pre-escrow-migration`

---

## 6. Migration Phases

### Phase 1: Delete Dead Code

**Risk: ZERO** — These files have no production consumers.

1. **Delete `src/lib/utils/wallet/escrow.ts`**

   - Zero non-test importers. Re-exports old v1 `loadEscrowDetails` + `ensureEscrowReady`.

2. **Delete `src/lib/utils/wallet/loadContractsByAddress.ts`**

   - Only imported by debug page + tests.

3. **Delete `src/lib/utils/wallet/escrowEvents.ts`**

   - Contains TWO broken imports (audit verified):
     - Line 7: `import { EscrowStatus } from '$lib/utils/enums/wallet.enum'` — file does not exist
     - Lines 185/219/310/371: `await import('$lib/utils/wallet/treeUpdateHelper')` — file does not exist
   - Has dynamic imports of wallet/escrow (deleted in step 1)
   - Zero external importers (audit verified)

4. **Delete `src/lib/utils/helpers/contractPermissions.ts` (638 lines)**

   - Already deprecated. The new `computeV1PermittedActions`/`computeV2PermittedActions` power the contract rune.
   - Only remaining callers:
     - `escrow/v1/nostrContract.ts` — deleted with escrow/ in Phase 5
     - `debug-smart-contract/+page.svelte` — deleted/migrated in Phase 3
   - If `canDelete` is still needed, add it to `PermittedActions` type before deleting.

5. **Delete corresponding test files for the above.**

**Verification:** `npm run check && npm run lint`

### Phase 2: Sever Easy Dependencies

**Risk: LOW** — Direct import swaps + dead function deletion.

#### 2.1 `functionParsing.ts` — Truly trivial (VERIFIED)

- Replace `import { escrow } from '$lib/utils/escrow'` with `import abi from '$lib/utils/contract/v1/abi.json'`
- Change `escrow.getABI()` → `abi`
- Remove the `initializeEscrowInterface()` lazy init wrapper
- **Verified:** Old and new ABIs are byte-for-byte identical. `escrow.getABI()` is the ONLY escrow usage in this file.

#### 2.2 `nostr-bid.ts` — `getUserContracts()` is dead code (VERIFIED)

- **Audit finding:** `getUserContracts()` at line 323 has ZERO callers in the entire codebase.
- No migration needed — simply delete lines 321-325 and the now-unused `escrow` import on line 7.
- The review system already uses `fetchNdkPaymentContractsForUser()` from `reviewContractsFromNdk.ts` instead.

#### 2.3 `EscrowStatus` → `ContractStatus` in type definitions (HARDER THAN ORIGINALLY RATED)

- **`types/contract.d.ts`** (8 type fields using `EscrowStatus`):

  - Wire-format fields (`NostrContract.status`, `NostrContractStatus.action`): Use `number` type since they can carry legacy values 0-16 on the wire. The bridge normalizes at runtime.
  - Computed fields (`ContractWithEvents.blockchainStatus`, `ContractWithEvents.status`): Use `ContractDisplayStatus` from `$lib/utils/contract/types`.
  - Filter/param fields (`ContractFilter.statuses`, `PublishStatusParams.action`, `PublishContractStatusParams.status`): Use `ContractDisplayStatus`.
  - **Do NOT naively swap `EscrowStatus` → `ContractStatus`** — value 6 would silently change from PendingFunding to Refunded.

- **`types/wallet.d.ts`** (`EscrowData.status` field): Use `ContractStatus`. This is a blockchain-only field (values 0-5), semantically clean match.
  - **Cascading consideration:** `ContractWithEvents.escrowData` uses `EscrowData`, so `wallet.d.ts` changes cascade into `contract.d.ts`. Both must be migrated in the same commit.

**Verification:** `npm run check` with zero errors. 42 files import from `$lib/types/contract` — type errors will surface any missed usages.

### Phase 3: Migrate or Delete Debug/E2E Code

**Risk: LOW** — Non-production paths.

1. **`DebugContractCard.svelte`** — Delete or migrate to use `contract/v1/blockchainWrites.ts`
2. **`debug-smart-contract/+page.svelte`** — Delete or migrate to use `contract/v1/blockchainWrites.ts`
3. **`e2e/service-harness.html/+page.svelte`** — Replace `EscrowStatus` with `ContractStatus`

**Verification:** `npm run check`

### Phase 4: Migrate `contract.store.ts` (MAIN BLOCKER)

**Risk: HIGH** — Central contract data store. Must not break contract display.

#### Confirmed: The dashboard is already migrated

`DashboardContractsPanelNDK.svelte`, `ContractCardNDK.svelte`, and `ContractDrawerNDK.svelte` already use NDK + `PaymentContractRune` exclusively. They do NOT call `contract.store.ts` or old `escrow.contractOps`. The "NDK" suffix was the migration marker — these are the primary production components.

#### Remaining call sites (7 files to fix)

| File                                                                    | What it does                                                                                               | Replacement                                                                                                                                                           |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TaskTab.svelte`                                                        | `escrow.contractOps.getContracts({ taskIds: [id] })` — checks if task has contracts (prevents edit/delete) | `ndk.fetchEvents({ kinds: [KINDS.CONTRACT], '#t': [taskId], limit: 1 }, { closeOnEose: true })` — simple existence check                                              |
| `TaskTab.svelte` (second call)                                          | `escrow.escrowOps.checkEscrowFundingStatus(contract)` — on-chain funding status check                      | **Needs blockchain read.** wrap in `PaymentContractRune` for chain data, or Use `loadPaymentContractDetails()` from new contract system.                              |
| `dashboard/+page.svelte`                                                | Same existence check as above                                                                              | Same `ndk.fetchEvents` replacement                                                                                                                                    |
| `DashboardMyServicesPanel.svelte`                                       | `escrow.contractOps.getContracts()` — builds contracts snapshot for service panel                          | NDK subscription pattern (same as `DashboardContractsPanelNDK`)                                                                                                       |
| `DashboardServiceRequestsPanel.svelte`                                  | `contractStore.loadContracts()` — continuity on mount                                                      | Same NDK subscription pattern                                                                                                                                         |
| `ServiceDetailsView.svelte`                                             | `get(contractStore)` — finds contracts linked to a service                                                 | `ndk.fetchEvents()` with `'#d': [serviceDtag]` tag filter                                                                                                             |
| `service-quote-ui.store.ts`                                             | `get(contractStore).contracts` — matches service quotes to contracts                                       | Query NDK by service ID tag                                                                                                                                           |
| `nostr-bid.ts`                                                          | `getUserContracts()` → `escrow.contractOps.getContracts()`                                                 | **Delete the function** (audit: zero callers). Already dead code.                                                                                                     |
| `recover.ts`                                                            | `contractStore.loadContractByEscrowId()` → `escrow.contractOps.getContracts`                               | **NOT dead** (audit: `ServiceDetailsView.svelte` line 93 imports `recoverBookNowContract` and calls it at line 1566). Migrate to use `ndk.fetchEvents` by payment ID. |
| Deprecated: `await-contract-creation.ts`, `recover-quote-acceptance.ts` | `contractStore.loadContractByEscrowId()`                                                                   | **Delete** — already marked `@deprecated` with zero production callers.                                                                                               |

#### Migration steps:

1. **Replace `TaskTab.svelte` and `dashboard/+page.svelte` first** — simple 5-line NDK fetch for existence checks. Add `loadPaymentContractDetails()` call for TaskTab's funding status check.

2. **Delete `getUserContracts()` from `nostr-bid.ts`** — audit confirmed zero callers. Remove the function and its `escrow` import.

3. **Migrate `recover.ts`** — NOT dead code. `ServiceDetailsView.svelte` imports `recoverBookNowContract`. Replace the internal `contractStore.loadContractByEscrowId()` call with `ndk.fetchEvents` by payment ID `d` tag.

4. **Delete `await-contract-creation.ts` and `recover-quote-acceptance.ts`** — confirmed zero production callers.

5. **Migrate service panels** — adopt NDK subscription + `PaymentContractRune` pattern. Note: `DashboardMyServicesPanel` does multi-page pagination (up to 20 pages) via `escrow.contractOps.getContracts()` directly — this needs paginated NDK fetch or a large single-fetch.

6. **Remove `loadMoreContracts()` from contract.store.ts** — audit confirmed zero callers. Dead code.

7. **Remove `contract.store.ts` dependency on old escrow** — after all consumers switched, delete the `escrow` import and old subscription logic.

**Verification:** `npm run test:ci` + manual smoke test of contract listing, status updates, contract detail views, and task/service panels.

### Phase 5: Migrate Remaining Helper Files

**Risk: MEDIUM**

1. **`contractStatusFormatter.ts`** — Replace `EscrowStatus` with `ContractStatus` + `DisplayOnlyStatus`. **Audit note:** This is significant restructuring, not a simple type swap. The file has 6 functions with exhaustive switches on 14-16 `EscrowStatus` values including Nostr-only pending states (PendingFunding, PendingCompletion, etc.) that have no direct `ContractStatus` equivalent. Each switch case must be mapped to the equivalent using `ContractDisplayStatus` + context (`isPending` boolean, TTL check).

2. **`contractStatusFormatterV2.ts`** — Already ~50% migrated (audit verified). `getStatusTranslationKey` and `getStatusColorClass` use `ContractDisplayStatus`. `getStatusMessages` and `getActionDescription` still use `EscrowStatus`. Complete the migration of those two functions.
3. **`task-status-reconciliation.ts`** — Replace `EscrowStatus` with `ContractStatus`; use `isTerminalPaymentState()` from new system
4. **`tags.ts`** — Update `EscrowStatus` type reference

**Verification:** Targeted helper tests.

### Phase 6: Migrate Component Consumers

**Risk: MEDIUM**

1. **`TaskTab.svelte`** — Replace `escrow.contractOps.getContracts()` → store method
2. **`DashboardMyServicesPanel.svelte`** — Replace `escrow.contractOps.getContracts()` → store method
3. **`dashboard/+page.svelte`** — Replace `escrow.contractOps.getContracts()` → store method
4. **`legacyEscrowStatusToContractStatus.ts`** — After ALL consumers use `ContractStatus`, inline the `EscrowStatus` enum values directly into this bridge file (only needs the numeric mapping, not the enum import)

**Verification:** `npm run check && npm run lint`

### Phase 7: Delete `src/lib/utils/escrow/`

**Risk: LOW** — All consumers migrated.

1. Delete the entire `src/lib/utils/escrow/` directory
2. Fix any remaining build errors
3. Verify: `grep -r "from.*utils/escrow" src/` returns NO results

**Verification:** `npm run check && npm run lint && npm run test:ci`

### Phase 8: Bulk Cleanup (Non-Blocking)

**Risk: NONE** — Production users unaffected.

1. **i18n keys:** Run `python3 scripts/find-missing-translations.py --fix-suggestions`. Remove unused escrow keys from en/es locales. Keep marketing/FAQ keys (`faq_escrow_*`, `escrow_title` in about/security pages) if still referenced.

2. **Test files:** Delete old escrow test suites:

   - `tests/unit/utils/escrow/` (7 files)
   - `tests/integration/escrow/` (7 files)
   - Update component tests that mock old escrow
   - These are already covered by new contract system tests

3. **Scripts:** Update `scripts/query-completed-tasks.js` (ABI path), `scripts/test-review-system.ts` (wallet/escrow import), `scripts/nostr-debug.mjs`, `scripts/playwright.js`

4. **`TaskStatusEnum.ESCROW_FUNDED`:** Rename to `CONTRACT_FUNDED` or keep as alias. Affects `taskStatusBadge.ts` and `DashboardTasksPanel.svelte`.

5. **Stale comment cleanup** (audit found): Remove comment references to deleted `retryPendingServiceAcceptanceByEscrowId` and `reverifyPublishedServiceAcceptanceByEscrowId` in `service-quote-ui.store.ts` and `DashboardServiceRequestsPanel.svelte`.

6. **Update `CLAUDE.md`:** Remove old escrow references.

---

## 7. Post-Migration Verification

- [ ] `npm run check` passes with zero errors
- [ ] `npm run lint` passes with zero warnings
- [ ] `npm run test:ci` passes all tests
- [ ] `npm run test:e2e` passes critical user journeys
- [ ] `python3 scripts/find-missing-translations.py --fix-suggestions` shows no issues
- [ ] `grep -r "from.*utils/escrow" src/` returns NO results
- [ ] Manual smoke test:
  - [ ] View contract list (dashboard)
  - [ ] View contract details (drawer)
  - [ ] View contract timeline
  - [ ] View contract permissions (correct action buttons)
  - [ ] Create a v2 service contract
  - [ ] Accept a bid (v2 contract creation)
  - [ ] Complete a task, accept completion
  - [ ] Dispute + propose resolution + accept proposal
  - [ ] Cancel an unfunded contract

---

## 8. Rollback Plan

1. `git checkout backup/pre-escrow-migration` — full rollback
2. Each phase can be on its own branch for partial rollback
3. `npm run test:ci` after any rollback

---

## 9. What This Plan Does NOT Do

- **Does NOT rename `escrowId` → `paymentId`** — this is a backward-compatible field name that the NDK layer already abstracts. A rename would touch Nostr wire protocols, filter APIs, and 40+ files. Deferred indefinitely.
- **Does NOT delete `contractRegistry.ts`** — it's a wallet utility (smart contract address tracking), not escrow code. Used by `contractDetection.ts` → `transactionHistory.ts` → wallet UI.
- **Does NOT delete `escrowErrors.ts`** — custom error classes that work independently. Can be renamed later.
- **Does NOT remove v1 smart contract support** — the new `contract/lifecycle/v1.ts` supports existing v1 contracts on-chain. Only the old code ORGANIZATION is being deleted.

---

_Plan v3 — 2026-05-13. Updated based on 5-agent audit swarm that verified every claim against actual code. All dependency counts, dead code status, and migration claims independently confirmed. Key corrections from audit: `recover.ts` is LIVE (not dead), `getUserContracts()` is dead code, Phase 2 type migration upgraded from MEDIUM to HIGH risk, `contractStatusFormatter.ts` migration is significant restructuring, `constants/tags.ts` added to dependency map._
