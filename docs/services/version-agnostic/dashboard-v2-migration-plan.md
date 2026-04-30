# Dashboard V2 Migration Plan

**Created:** April 27, 2026  
**Status:** Review Phase  
**Scope:** Migrate dashboard hiring page from v1 escrow patterns to v2 NDK-based contracts

---

## Executive Summary

The dashboard page (`src/routes/(protected)/dashboard/+page.svelte`) has uncommitted changes that revert to using:

1. `DashboardContractsPanel` (v1 deprecated) instead of `DashboardContractsPanelNDK` (v2 correct)
2. v1 escrow imports from `$lib/utils/escrow/v1/escrowEvents`
3. Service acceptance replay/reverify logic tied to v1 patterns

The goal is to **build forward** by:

- Using `DashboardContractsPanelNDK` for contracts display
- Adapting the NDK panel to handle services properly
- Migrating service quote acceptance to v2 patterns
- Removing v1 dependencies from the dashboard page

---

## Part 1: Analysis of Current Git Diff

### Changes Made (to be reviewed)

| Category      | Change                                                                                | Keep/Remove                                 |
| ------------- | ------------------------------------------------------------------------------------- | ------------------------------------------- |
| **Imports**   | Added `SvelteSet` from svelte/reactivity                                              | **KEEP** - useful utility                   |
| **Imports**   | Replaced `DashboardContractsPanelNDK` with `DashboardContractsPanel`                  | **REMOVE** - use NDK version                |
| **Imports**   | Removed `DashboardBidsPanel`                                                          | **REMOVE** - bids should be in earning page |
| **Imports**   | Removed `DashboardSavedSearchesPanel`                                                 | **REMOVE** - saved searches in earning page |
| **Imports**   | Added `MyQuotesPanel`                                                                 | **KEEP** - needed for service requests tab  |
| **Imports**   | Added v1 escrow imports (`contractCreationStore`, `retryPendingServiceAcceptance...`) | **REMOVE** - v1 patterns                    |
| **Imports**   | Added `acceptance-ledger` imports                                                     | **EVALUATE** - may need v2 equivalent       |
| **Imports**   | Added `pending-navigation` import                                                     | **KEEP** - needed for navigation            |
| **Imports**   | Added `service-quote-ui.store` imports                                                | **KEEP** - needed for service requests      |
| **Imports**   | Added `dashboardQuery` import                                                         | **KEEP** - URL handling                     |
| **Tabs**      | Removed `bids` and `saved-searches` tabs                                              | **KEEP** - these moved to earning page      |
| **Tabs**      | Added `service-requests` tab                                                          | **KEEP** - needed for tasker view           |
| **State**     | Added extensive service request state management                                      | **PARTIALLY KEEP** - simplify               |
| **onMount**   | Added v1 replay/reverify cycles                                                       | **REMOVE** - v1 patterns                    |
| **onMount**   | Added `contractCreationStore` subscription                                            | **EVALUATE** - may need v2 equivalent       |
| **Effects**   | Added multiple service quote effects                                                  | **KEEP** - but simplify                     |
| **Functions** | Added extensive URL/state management functions                                        | **KEEP** - needed                           |
| **Template**  | Changed header from "Dashboard" to "Hiring"                                           | **KEEP** - correct terminology              |
| **Template**  | Added `nonBlockingMessageCode` alerts                                                 | **KEEP** - good UX                          |
| **Template**  | Replaced `DashboardContractsPanelNDK` with `DashboardContractsPanel`                  | **REMOVE** - use NDK                        |
| **Template**  | Added `MyQuotesPanel` for service-requests                                            | **KEEP** - needed                           |

### Root Cause Issues

1. **Wrong contracts panel**: The diff uses `DashboardContractsPanel` which is marked `@deprecated` and uses v1 `ContractWithEvents` pattern
2. **v1 escrow dependencies**: Direct imports from `escrow/v1/escrowEvents` for retry/reverify
3. **Service acceptance replay logic**: The `runServiceAcceptanceReplayCycle` function uses v1 patterns

---

## Part 2: DashboardContractsPanelNDK vs DashboardContractsPanel

### DashboardContractsPanelNDK (CORRECT - v2)

**Source:** `src/lib/components/contracts/DashboardContractsPanelNDK.svelte` (401 lines)

**Key Features:**

- Uses NDK subscription (`ndk.$subscribe`) for real-time contract updates
- Uses `PaymentContractRune` for each contract
- Uses `ContractCardNDK` and `ContractDrawerNDK`
- Filters by `DashboardContractStatusFilter` (semantic buckets: funded, in_progress, completed_success, etc.)
- No v1 escrow dependencies
- Clean, modern implementation

**Props:** None - self-contained component

**Limitations (for services):**

- Does not have `typeFilter` (all/tasks/services)
- Does not have `highlightEscrowId` support
- Does not have `onHighlightConsumed` / `onHighlightMissing` callbacks
- Does not have `fixedRole` prop (always shows both client/freelancer)
- Does not have `showServiceFilter` option

### DashboardContractsPanel (DEPRECATED - v1)

**Source:** `src/lib/components/contracts/DashboardContractsPanel.svelte` (772 lines)

**Key Features:**

- Uses `contractStore` (v1 facade)
- Uses `ContractWithEvents` type
- Uses `ContractCard` and `ContractDrawer` (v1)
- Has `typeFilter` for tasks/services
- Has `highlightEscrowId` support
- Has `fixedRole` prop
- Has `showServiceFilter` option
- Much more complex with many props

**Props:**

```typescript
{
  initialType?: 'all' | 'tasks' | 'services';
  initialStatus?: EscrowStatus | 'all';
  showRoleFilters?: boolean;
  fixedRole?: 'all' | 'client' | 'freelancer';
  emptyStateActionLabel?: string | null;
  emptyStateActionHref?: string | null;
  emptyStateActionIcon?: Component | null;
  showServiceFilter?: boolean;
  selectedServiceAddress?: string | null;
  onServiceFilterChange?: (serviceAddress: string | null) => void;
  onClearFilters?: () => void;
  highlightEscrowId?: string | null;
  onHighlightConsumed?: (escrowId: string) => void;
  onHighlightMissing?: (escrowId: string) => void;
}
```

### Migration Path

**Option A: Enhance DashboardContractsPanelNDK** (Recommended)

- Add `fixedRole` prop (filter by client/freelancer)
- Add `typeFilter` prop (filter by tasks/services via `contextType`)
- Add `highlightEscrowId` support (scroll into view, callbacks)
- Keep the clean NDK-based architecture

**Option B: Keep both panels** (Not recommended)

- Would require maintaining two parallel implementations
- Increases technical debt

---

## Part 3: MyQuotesPanel Analysis

**Source:** `src/lib/components/dashboard/quotes/MyQuotesPanel.svelte` (1484 lines)

### Current Dependencies

| Import                                     | v1/v2           | Purpose                          | Migration        |
| ------------------------------------------ | --------------- | -------------------------------- | ---------------- |
| `preflightServiceContractCreation`         | v1 (DEPRECATED) | Balance checks before acceptance | Move to UI level |
| `describeServiceContractPreflightFailure`  | Helper          | Error messages                   | Keep             |
| `serviceQuoteUiStore.acceptTaskerProposal` | Store           | Calls v2 creation internally     | Keep             |

### Key Finding

The `acceptTaskerProposal` method in `service-quote-ui.store.ts` line ~56 already delegates to `createServiceContract` which uses v2 internally. The store correctly abstracts the v2 implementation.

The issue is the `preflightServiceContractCreation` call which uses deprecated v1 balance checking.

### Required Changes

1. **Replace `preflightServiceContractCreation`** with v2-compatible balance check:

   ```typescript
   // Instead of deprecated preflight
   const assets = await walletManager.loadAssets();
   const hasBalance = assets.rbtc >= totalNeeded;
   ```

2. **No NDK conversion needed** - the panel works via `serviceQuoteUiStore` which already uses v2 patterns internally

---

## Part 4: Earning Page Analysis

**Source:** `src/routes/(protected)/dashboard/earning/+page.svelte` (475 lines)

### Current State

The earning page:

- Uses `DashboardContractsPanel` (v1 deprecated) for contracts tab
- Has `fixedRole="freelancer"` (earning = taskee perspective)
- Has `showServiceFilter={true}`
- Uses proper URL state management

### Issue Identified

The earning page correctly uses `DashboardContractsPanel` for its feature-rich filtering (service filter, role filter, highlight support). However, this is the v1 component.

Both pages need the enhanced `DashboardContractsPanelNDK` to maintain feature parity.

---

## Part 5: v1 Dependencies in Dashboard Page

### Functions to Remove

These are imported from `$lib/utils/escrow/v1/escrowEvents`:

1. **`contractCreationStore`** - Svelte store for contract creation events

   - Used to: Navigate to contracts tab after creation
   - v2 alternative: Use NDK event subscription or `serviceQuoteUiStore` state

2. **`retryPendingServiceAcceptanceByEscrowId`** - Retry failed service acceptance

   - Used in: `runServiceAcceptanceReplayCycle`
   - v2 alternative: The v2 `afterConfirmed()` pattern handles this automatically

3. **`reverifyPublishedServiceAcceptanceByEscrowId`** - Re-check published acceptance
   - Used in: `runServiceAcceptanceReverifyCycle`
   - v2 alternative: Not needed with v2's transaction confirmation flow

### Functions from acceptance-ledger

These track pending service acceptances for retry:

1. **`getAcceptanceReplayEntriesDueForRetry`**
2. **`getAcceptanceConfirmedMonitorEntriesDueForReverify`**
3. **`SERVICE_ACCEPTANCE_CONFIRMED_MONITOR_REVERIFY_INTERVAL_MS`**
4. **`SERVICE_ACCEPTANCE_REPLAY_RETRY_INTERVAL_MS`**

**Analysis:** These are used to handle edge cases where:

- Transaction was broadcast but page was closed before confirmation
- Nostr publication failed after blockchain confirmation

**v2 Approach:** The `book-now-outbox.ts` system handles browser session persistence, and `afterConfirmed()` handles completion. The acceptance ledger is v1-specific retry logic.

---

## Part 6: Implementation Plan

### Phase 1: Enhance DashboardContractsPanelNDK

**Priority:** P0 - Required before dashboard migration

**Changes:**

1. Add props:

   ```typescript
   let {
     fixedRole = 'all',
     initialType = 'all',
     initialStatus = 'all',
     highlightEscrowId = null,
     onHighlightConsumed,
     onHighlightMissing,
     showServiceFilter = false,
     selectedServiceAddress = null,
     onServiceFilterChange,
     onClearFilters,
     emptyStateActionLabel = null,
     emptyStateActionHref = null
   } = $props<{...}>();
   ```

2. Add type filtering logic (filter by `contextType`):

   ```typescript
   const visibleContracts = $derived.by(() => {
   	return events.filter((contract) => {
   		// ... existing role/status filters

   		// Type filter
   		if (typeFilter === 'tasks') {
   			const contextType = contract.contextType;
   			return contextType == null || contextType === 'task';
   		}
   		if (typeFilter === 'services') {
   			return contract.contextType === 'service';
   		}

   		return true;
   	});
   });
   ```

3. Add highlight scroll-into-view logic
4. Add service filter dropdown (when `showServiceFilter=true`)

### Phase 2: Clean Dashboard Page

**Priority:** P0 - Required

**Changes:**

1. **Revert to `DashboardContractsPanelNDK`** (with enhanced version from Phase 1)
2. **Remove v1 imports:**
   - `contractCreationStore`
   - `retryPendingServiceAcceptanceByEscrowId`
   - `reverifyPublishedServiceAcceptanceByEscrowId`
   - `acceptance-ledger` imports
3. **Remove `runServiceAcceptanceReplayCycle`** function
4. **Remove `runServiceAcceptanceReverifyCycle`** function
5. **Simplify `onMount`** - remove v1 intervals
6. **Keep service-quote-ui.store** usage for `MyQuotesPanel`
7. **Keep URL state management** functions

### Phase 3: Clean MyQuotesPanel Preflight

**Priority:** P1 - After dashboard works

**Changes:**

1. Replace `preflightServiceContractCreation` with UI-level balance check
2. Keep `serviceQuoteUiStore.acceptTaskerProposal` (already v2)

### Phase 4: Update Earning Page

**Priority:** P1 - After dashboard works

**Changes:**

1. Switch to enhanced `DashboardContractsPanelNDK`
2. Remove any v1 dependencies

---

## Part 7: What to Keep vs Remove in Dashboard Diff

### KEEP (Essential functionality)

```typescript
// Imports
import { SvelteSet } from 'svelte/reactivity';
import MyQuotesPanel from '$lib/components/dashboard/quotes/MyQuotesPanel.svelte';
import { consumePendingServiceContractNavigationForContractsPage } from '$lib/utils/service-contract/pending-navigation';
import {
  createDashboardUrl,
  getTaskerTimelines,
  isRequestSyncActive,
  serviceQuoteUiStore,
  type DashboardContractsType,
  type DashboardTab
} from '$lib/stores/service-quote-ui.store';
import { buildEarningQueryUrl } from '$lib/utils/dashboardQuery';

// Helper function
function translateOrFallback(key: string, fallback: string): string {...}

// Tab configuration (without bids/saved-searches, with service-requests)
const tabs = $derived([
  { id: 'tasks', ... },
  { id: 'contracts', ... },
  { id: 'service-requests', ... }
]);

// State variables for service requests
let contractsType = $state<DashboardContractsType>('all');
let focusedRequestId = $state<string | null>(null);
let activeStatus = $state<string | null>(null);
let taskerTimelines = $state<...>([]);
let nonBlockingMessageCode = $state<string | null>(null);
let taskerQuotesStoreSyncing = $state(false);
let taskerQuotesError = $state<string | null>(null);
let taskerQuotesLoaded = $state(false);
let currentContractsHighlight = $state<string | null>(null);

// URL state management functions
function getInitialRouteState(currentUrl: URL) {...}
function getLegacyEarningRedirectUrl(currentUrl: URL): URL | null {...}
function syncRouteState() {...}
function handleTabChange(tabId: string) {...}
function handleTaskerRequestFocus(requestId: string | null) {...}
function handleTaskerRequestClear() {...}
function handleContractsHighlightConsumed() {...}
function handleContractsHighlightMissing() {...}

// Template: service-requests panel with MyQuotesPanel
// Template: nonBlockingMessageCode alerts
// Template: "Hiring" header
```

### REMOVE (v1 dependencies)

```typescript
// Remove these imports
import DashboardContractsPanel from '$lib/components/contracts/DashboardContractsPanel.svelte';
import {
  contractCreationStore,
  reverifyPublishedServiceAcceptanceByEscrowId,
  retryPendingServiceAcceptanceByEscrowId
} from '$lib/utils/escrow/v1/escrowEvents';
import {
  getAcceptanceConfirmedMonitorEntriesDueForReverify,
  getAcceptanceReplayEntriesDueForRetry,
  SERVICE_ACCEPTANCE_CONFIRMED_MONITOR_REVERIFY_INTERVAL_MS,
  SERVICE_ACCEPTANCE_REPLAY_RETRY_INTERVAL_MS
} from '$lib/utils/service-quote/acceptance-ledger';

// Remove these state variables
const attemptedServiceAcceptanceReplays = new SvelteSet<string>();
const inFlightServiceAcceptanceReplays = new SvelteSet<string>();
let serviceAcceptanceReplaySyncing = $state(false);

// Remove these functions
const runServiceAcceptanceReplayCycle = async (...) => {...};
const runServiceAcceptanceReverifyCycle = async () => {...};

// Remove from onMount
const unsubscribeContractCreation = contractCreationStore.subscribe(...);
void Promise.all([
  runServiceAcceptanceReplayCycle({ syncing: true }),
  runServiceAcceptanceReverifyCycle()
]);
replayIntervalId = window.setInterval(...);

// Remove this effect
$effect(() => {
  const highlightEscrowId = currentContractsHighlight;
  // ... attemptedServiceAcceptanceReplays logic
  void retryPendingServiceAcceptanceByEscrowId(highlightEscrowId);
});
```

### MODIFY (Use v2 component)

```svelte
<!-- Replace this -->
<DashboardContractsPanel
  initialType={contractsType}
  initialStatus={activeStatus as string | null}
  showRoleFilters={false}
  fixedRole="client"
  highlightEscrowId={page.url.searchParams.get('highlight')}
  onHighlightConsumed={handleContractsHighlightConsumed}
  onHighlightMissing={handleContractsHighlightMissing}
/>

<!-- With enhanced version of this -->
<DashboardContractsPanelNDK
  fixedRole="client"
  initialType={contractsType}
  initialStatus={activeStatus}
  highlightEscrowId={page.url.searchParams.get('highlight')}
  onHighlightConsumed={handleContractsHighlightConsumed}
  onHighlightMissing={handleContractsHighlightMissing}
/>
```

---

## Part 8: Verification Checklist

After implementation:

- [ ] Dashboard loads without errors
- [ ] Tasks tab shows user's tasks
- [ ] Contracts tab shows NDK-based contracts
- [ ] Contracts tab filters by tasks/services (when enhanced)
- [ ] Service Requests tab shows tasker's service quotes
- [ ] Accepting a service quote creates v2 contract
- [ ] Contract highlight navigation works
- [ ] No v1 escrow imports in dashboard page
- [ ] No interval-based retry/reverify logic
- [ ] Earning page continues to work
- [ ] `npm run check` passes
- [ ] `npm run lint` passes

---

## Part 9: Risk Assessment

| Risk                       | Likelihood | Impact | Mitigation                            |
| -------------------------- | ---------- | ------ | ------------------------------------- |
| NDK panel missing features | Medium     | High   | Phase 1 enhancement                   |
| Service acceptance breaks  | Low        | High   | `serviceQuoteUiStore` already uses v2 |
| URL state regressions      | Low        | Medium | Keep existing URL functions           |
| Performance degradation    | Low        | Low    | NDK subscription is efficient         |

---

## Appendix A: File Reference

| File                                                             | Role                            | Action                        |
| ---------------------------------------------------------------- | ------------------------------- | ----------------------------- |
| `src/routes/(protected)/dashboard/+page.svelte`                  | Hiring dashboard                | Clean up, use NDK panel       |
| `src/routes/(protected)/dashboard/earning/+page.svelte`          | Earning dashboard               | Update after dashboard works  |
| `src/lib/components/contracts/DashboardContractsPanelNDK.svelte` | v2 contracts panel              | Enhance with props            |
| `src/lib/components/contracts/DashboardContractsPanel.svelte`    | v1 contracts panel (deprecated) | Do not use                    |
| `src/lib/components/dashboard/quotes/MyQuotesPanel.svelte`       | Service quotes panel            | Works with v2 via store       |
| `src/lib/stores/service-quote-ui.store.ts`                       | Service quote state             | Uses v2 internally            |
| `src/lib/utils/escrow/v1/escrowEvents.ts`                        | v1 escrow events                | Remove imports from dashboard |
| `src/lib/utils/contract/v2/service-creation.ts`                  | v2 service contracts            | Source of truth               |
| `src/lib/runes/contractRune.svelte.ts`                           | PaymentContractRune             | Used by NDK panel             |

---

## Appendix B: Component Relationship Diagram

```
Dashboard Page (Hiring)
├── DashboardTasksPanel (unchanged)
├── DashboardContractsPanelNDK (enhanced) ← NEW
│   ├── NDK subscription for contracts
│   ├── PaymentContractRune per contract
│   ├── ContractCardNDK
│   └── ContractDrawerNDK
└── MyQuotesPanel (unchanged)
    └── serviceQuoteUiStore
        └── createServiceContract (v2)
            └── createServiceContractV2

Earning Page
├── DashboardBidsPanel (unchanged)
├── DashboardServiceRequestsPanel (unchanged)
├── DashboardContractsPanelNDK (enhanced) ← FUTURE
├── DashboardMyServicesPanel (unchanged)
└── DashboardSavedSearchesPanel (unchanged)
```

---

## Decision Required

Before implementation, confirm:

1. **Enhance DashboardContractsPanelNDK** to support:

   - `fixedRole` prop
   - `initialType` (tasks/services) filtering
   - `highlightEscrowId` with callbacks
   - Service filter (optional, for earning page)

2. **Remove v1 retry/reverify logic** from dashboard page entirely (v2 handles via `afterConfirmed`)

3. **Keep `serviceQuoteUiStore`** for `MyQuotesPanel` (already v2 compatible)

Please review this plan and let me know if you'd like to proceed with implementation or need any adjustments.
