# Escrow Migration Plan: Old `utils/escrow` → New `utils/contract`

## Status: CODE MIGRATION COMPLETE

The old escrow system has been fully deleted. All consumers use the new `utils/contract` system or direct NDK queries. Remaining work is architectural cleanup of version-specific import paths.

---

## 1. What Was Done

### Phase 1-2: Dead Code + Easy Dependencies

| File | Change |
|------|--------|
| `functionParsing.ts` | `escrow.getABI()` → direct ABI import from `contract/v1/abi.json` |
| `nostr-bid.ts` | Removed dead `getUserContracts()` function and `escrow` import |
| `tags.ts` | `EscrowStatus` type → `ContractDisplayStatus` |
| `types/wallet.d.ts` | `EscrowStatus` → `ContractStatus` |
| `types/contract.d.ts` | `EscrowStatus` → `ContractDisplayStatus` / `number` for wire fields |
| `contractStatusFormatterV2.ts` | Removed `EscrowStatus` import (already had `ContractStatus`/`DisplayOnlyStatus`) |
| `task-status-reconciliation.ts` | `EscrowStatus` → `ContractStatus`/`DisplayOnlyStatus` |

### Phase 3: Debug/E2E Pages

| File | Change |
|------|--------|
| `DebugContractCard.svelte` | `escrow.estimateContractGas` → `estimateWrite` from `contract/v1/blockchainWrites` |
| `debug-smart-contract/+page.svelte` | `escrow.*` methods → `blockchainWrites` functions; `determineContractState` → inline permissions |
| `e2e/service-harness.html/+page.svelte` | `EscrowStatus` → `ContractStatus` |

### Phase 4: Consumer Migrations (contract.store.ts consumers → NDK)

| File | Change |
|------|--------|
| `TaskTab.svelte` | `escrow.contractOps.getContracts()` → `ndk.fetchEvents()` |
| `dashboard/+page.svelte` | `escrow.contractOps.getContracts()` → `ndk.fetchEvents()` |
| `DashboardServiceRequestsPanel.svelte` | Removed `contractStore.loadContracts()` call |
| `DashboardMyServicesPanel.svelte` | `escrow.contractOps.getContracts()` → `ndk.fetchEvents()`; removed `$contractStore.contracts` fallback; removed `loadContractsContinuity` prop |
| `ServiceDetailsView.svelte` | `get(contractStore)` + `getActiveServiceContractsForService` → `ndk.fetchEvents()` with tag inspection |
| `service-quote-ui.store.ts` | `get(contractStore).contracts.find()` → `ndk.fetchEvents()` |
| `recover.ts` | `contractStore.loadContractByEscrowId()` → `ndk.fetchEvents()` |
| `session.ts` | Removed `contractStore.reset()` |

### Phase 5: Helper File Cleanup

| File | Change |
|------|--------|
| `contractStatusFormatter.ts` | Deleted (replaced by V2 formatter) |
| `contractPermissions.ts` | Deleted (replaced by `computeV1PermittedActions`/`computeV2PermittedActions`) |
| `task-status-reconciliation.ts` | Deleted (no production callers) |
| `legacyEscrowStatusToContractStatus.ts` | Inlined `EscrowStatus` numeric values, removed `escrow/` import |

### Phase 6: Deletion

| Deleted | Reason |
|---------|--------|
| `src/lib/utils/escrow/` (9 files) | All consumers migrated |
| `src/lib/stores/contract.store.ts` | All consumers use NDK directly |
| `wallet/escrow.ts` | Dead code |
| `wallet/loadContractsByAddress.ts` | Dead code |
| `wallet/escrowEvents.ts` | Dead code (broken imports) |
| `helpers/contractPermissions.ts` | Replaced by new permitted actions |
| `helpers/task-status-reconciliation.ts` | No production callers |
| `helpers/contractStatusFormatter.ts` | Replaced by V2 formatter |
| `service-contract/active-contracts.ts` | Inlined into consumers |
| `service-contract/await-contract-creation.ts` | Tests only |
| `service-contract/recover-quote-acceptance.ts` | Dead production chain |
| `service-contract/reconcile-quote-acceptance.ts` | Dead production chain |

### Architecture After Migration

```
Tasks:      ndk.fetchEvents({ '#t': [taskId] })           ← existence check
Services:   ndk.fetchEvents({ '#p': [pubkey] })           ← filtered by service tags
Dashboard:  ndk.$subscribe() + PaymentContractRune        ← live contract list
Operations: contractRune.markTaskComplete() → lifecycle    ← version-agnostic
```

Zero imports from old `escrow/`. Zero `contractStore` references. Zero `nostr-tools` in contract paths.

---

## 2. Remaining Tasks

### 2.1 Refactor `DashboardMyServicesPanel.svelte`

The component was cleaned of escrow/contractStore dependencies but still has:
- `ndkContractToSnapshot` — converts NDK events to `ContractWithEvents` shape for internal filtering
- Inlined `getActiveServiceContractsForService`, `isActiveServiceContract` — operate on `ContractWithEvents`
- These could be simplified to work directly with NDK event tags instead of the intermediate type

**Effort:** Medium. Requires understanding the delete-guard and active-contract-check logic.

### 2.2 Fix `contractStatusFormatter.ts` Duplicate Cases (if restored)

The sed-based migration created duplicate switch cases (e.g., `ContractStatus.Completed` appearing twice). The V2 formatter was kept; the V1 formatter was deleted. If the V1 formatter is needed, the `getStatusMessages` and `getActionDescription` functions need restructuring to accept `ContractDisplayStatus` + `isPending: boolean` instead of relying on pending-specific enum values.

**Effort:** Low. Only needed if `getStatusMessages`/`getActionDescription` are needed outside deleted `escrowEvents.ts`.

### 2.3 Clean Up Stale Comment References

`service-quote-ui.store.ts` and `DashboardServiceRequestsPanel.svelte` have comments referencing deleted `retryPendingServiceAcceptanceByEscrowId` and `reverifyPublishedServiceAcceptanceByEscrowId` functions.

**Effort:** Trivial.

### 2.4 Update Test Files

Test suites under `tests/unit/utils/escrow/` and `tests/integration/escrow/` reference deleted files. Tests under `tests/unit/helpers/` reference deleted `contractPermissions.ts` and `contractStatusFormatter.ts`. These need updating or deletion.

**Effort:** Medium. Bulk search-and-replace + targeted test rewrites.

### 2.5 i18n Key Cleanup

~100 translation keys in `static/locales/{en,es}/` contain "escrow". Run `python3 scripts/find-missing-translations.py --fix-suggestions` and remove unused keys.

**Effort:** Low but tedious.

### 2.6 Script Updates

`scripts/query-completed-tasks.js` imports old ABI path. `scripts/test-review-system.ts` imports old `wallet/escrow`. `scripts/nostr-debug.mjs` and `scripts/playwright.js` reference escrow paths.

**Effort:** Low.

---

## 3. Complete the Lifecycle Interface

The `PaymentContractLifecycle` interface (`contract/lifecycle/types.ts`) is the **version boundary** — it dispatches to v1 or v2 implementations based on the contract's version. Consumers use `getPaymentContractLifecycle(version)` and never import from `contract/v1/` or `contract/v2/` directly.

However, 15 files bypass this boundary with direct v1/v2 imports. The lifecycle interface needs to be completed so ALL version-specific access goes through it.

### 3.1 Current State: What Bypasses the Lifecycle

| Consumer | Direct import | Should use |
|----------|--------------|------------|
| `functionParsing.ts` | `contract/v1/abi.json` | `getAllAbis()` — multi-version ABI scan |
| `features.ts` | `contract/v1/abi.json` + `contract/v2/abi.json` | `getAllAbis()` — feature detection across versions |
| `recover.ts` | `contract/v2/abi.json`, `v2/creation`, `v2/contractAddress`, `v2/service-creation` | `getAbi('v2')`, lifecycle utils |
| `contractRune.svelte.ts` | `v2/creation` (parsePaymentContract), `v2/permittedActions` (type) | Shared utils + types |
| `BidAcceptanceFormV2.svelte` | `v2/creation` (deriveContractParams, createContract) | `deriveContractParams` + `createPaymentContract` from contract/ |
| `ProposeResolutionModalNDK.svelte` | `v2/types` (GAS_REIMBURSEMENT_PER_OP) | Shared constant |
| `DashboardMyServicesPanel.svelte` | `v2/permittedActions` (isTerminalPaymentState) | Shared util |
| `parallelEffects.ts` | `v2/types` (ParallelEffectFailure) | Shared type |
| `contractStatus.ts` | `v1/legacyEscrowStatusToContractStatus` | Move file to `contract/` |
| `create.ts` | `v2/service-creation` | Shared creation entry point |
| `preflight.ts` | `v2/contractAddress`, `v2/types`, `v2/abi.json` | Internal lifecycle — keep |
| `creation.ts` | `v2/types` | Internal v2 impl — keep |
| `reviewContractsFromNdk.ts` | `v1` + `v2/loadPaymentContractDetailsV2` | Already dispatches by version — correct |
| `DebugContractCard.svelte` | `v1/blockchainWrites` | Debug page — low priority |
| `debug-smart-contract/+page.svelte` | `v1/blockchainWrites` | Debug page — low priority |

### 3.2 Target Architecture

```
Consumer code
    ↓ imports from
$lib/utils/contract          ← types, constants, shared utilities
$lib/utils/contract/lifecycle ← getPaymentContractLifecycle(version)
    ↓ dispatches to (internal only)
contract/v1/                 ← v1 implementation
contract/v2/                 ← v2 implementation
```

### 3.3 Implementation Plan

**Step A — Move shared items to `contract/types.ts`**

These work identically across v1 and v2 and don't need version dispatch:

```
Move to contract/types.ts:
  PermittedActions           (from v2/permittedActions)
  ParallelEffectFailure      (from v2/types)
  ParallelEffectsReport      (from v2/types)
  WriteTxResult              (from v2/types)
```

**Step B — Add shared utilities to `contract/index.ts`**

These functions/constants work identically across versions:

```typescript
// contract/index.ts — add:

// ABIs
export { default as v1Abi } from './v1/abi.json';
export { default as v2Abi } from './v2/abi.json';
export function getAbi(version?: string): InterfaceAbi;
export function getAllAbis(): Record<string, InterfaceAbi>;

// Shared utilities
export { isTerminalPaymentState } from './v2/permittedActions';
export { GAS_REIMBURSEMENT_PER_OP } from './v2/types';
export { getSecurePaymentContractAddress } from './v2/contractAddress';
export { parsePaymentContractCreatedPaymentId } from './v2/creation';
export { deriveContractCreationParams, createContract } from './v2/creation';
```

**Step C — Move the bridge file**

```
contract/v1/legacyEscrowStatusToContractStatus.ts
    → contract/legacyEscrowStatusToContractStatus.ts
```

**Step D — Per-consumer migration**

| File | Remove import from | Add import from |
|------|-------------------|-----------------|
| `functionParsing.ts` | `contract/v1/abi.json` | `contract` (getAllAbis) |
| `features.ts` | `contract/v1/abi.json`, `contract/v2/abi.json` | `contract` (getAllAbis) |
| `recover.ts` | `contract/v2/abi.json`, `v2/creation`, `v2/contractAddress`, `v2/service-creation` | `contract` (getAbi, parsePaymentContract, getSecureAddress) |
| `contractRune.svelte.ts` | `v2/creation`, `v2/permittedActions` | `contract` (parsePaymentContract, PermittedActions type) |
| `BidAcceptanceFormV2.svelte` | `v2/creation` | `contract` (deriveContractParams, createContract) |
| `ProposeResolutionModalNDK.svelte` | `v2/types` | `contract` (GAS_REIMBURSEMENT_PER_OP) |
| `DashboardMyServicesPanel.svelte` | `v2/permittedActions` | `contract` (isTerminalPaymentState) |
| `parallelEffects.ts` | `v2/types` | `contract/types` (ParallelEffectFailure, etc.) |
| `contractStatus.ts` | `v1/legacyEscrowStatusToContractStatus` | `contract/legacyEscrowStatusToContractStatus` |
| `create.ts` | `v2/service-creation` | `contract` (createServiceContract) |

**Step E — Result**

After migration, zero consumer imports from `contract/v1/` or `contract/v2/`. The `v1/` and `v2/` directories are internal implementation only, called by:
- `lifecycle/v1.ts` and `lifecycle/v2.ts` (the lifecycle dispatch)
- `contract/index.ts` (shared utility re-exports)

Adding v3 in the future:
1. Create `contract/v3/` with implementation
2. Register `v3Lifecycle` in `lifecycle/index.ts`
3. Add `v3Abi` to `getAbi('v3')` and `getAllAbis()`
4. Zero consumer code changes

### 3.4 What Does NOT Change

- `contract/lifecycle/v1.ts`, `v2.ts` — internal implementation, must import from their version dirs
- `contract/v1/blockchainWrites.ts`, `contract/v2/blockchainWrites.ts` — called by lifecycle, not consumers
- `contract/lifecycle/v1Preflight.ts`, `v2Preflight.ts`, `writeHelpers.ts` — internal implementation
- `reviewContractsFromNdk.ts` — already dispatches by version internally (correct pattern)
- Debug pages — low priority, can be migrated or deleted later

---

*Plan v4 — 2026-05-13. Updated post-migration with completion status, remaining tasks, and lifecycle-completion plan.*
