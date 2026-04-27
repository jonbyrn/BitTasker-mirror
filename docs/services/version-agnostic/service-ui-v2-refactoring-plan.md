# Service UI V2 Refactoring Plan

**Created:** April 26, 2026  
**Updated:** April 27, 2026  
**Status:** Ready for Implementation Tonight  
**Scope:** Critical fixes and v2 migration for service contract creation

---

## Executive Summary

This document provides **immediately actionable** fixes for service-related UI components. Based on comprehensive analysis of:

- 3 documentation files (contract-implementation-analysis.md, services-escrow-v2-porting-checklist.md, service-escrow-version-abstraction.md)
- Last commit (cd7d4441) and staged changes
- All service components in `src/lib/components/service/` (30 files)
- All dashboard quotes components (4 files)
- Earning page and services page routes
- All service utility modules

---

## Key Clarifications

### BookNowOutboxState vs ContractStatus

These are **completely different** concepts:

| Concept              | Location                              | Purpose                                                      | Values                                                                              |
| -------------------- | ------------------------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| `BookNowOutboxState` | `service-contract/book-now-outbox.ts` | Client-side UI state machine for browser session persistence | `submission_locked`, `funding_submitted`, `contract_sync_pending`, `contract_ready` |
| `ContractStatus`     | `contract/types.ts`                   | Blockchain state from smart contract                         | `Funded=0`, `InDispute=1`, `Completed=4`, etc.                                      |

The `@src/lib/utils/contract` folder does **NOT** use `BookNowOutboxState` - they are separate systems.

### Version-Agnostic Principle

- **Services will be v2 only** (not released to users yet)
- **Code should be version-agnostic** for future v3, v4 support
- **Source of truth**: `@src/lib/utils/contract` module
- **Don't import directly from** `contract/v1/*` or `contract/v2/*` in UI code
- **Use abstraction layer**: `PaymentContractLifecycle` and `PaymentContractRune`

### Balance Check Function

The `@src/lib/utils/contract` module does **NOT** have a balance check function. Balance checks should be done at the UI level:

```typescript
const assets = await walletManager.loadAssets();
const hasBalance = assets.rbtc >= totalNeeded;
```

The `service-contract/preflight.ts` module is **DEPRECATED** and should not be used for new code.

---

## Part 1: Critical Bug Fixes (Do First)

### 1.1 ServiceDetailsView.svelte - Invalid BookNowOutboxState Values

**Problem:** Component writes invalid states that get silently dropped by `book-now-outbox.ts`

**Valid States (from `book-now-outbox.ts` lines 11-15):**

```typescript
export type BookNowOutboxState =
	| 'submission_locked' // Lock acquired, about to submit
	| 'funding_submitted' // Transaction broadcast, waiting for confirmation
	| 'contract_sync_pending' // Transaction confirmed, waiting for Nostr sync
	| 'contract_ready'; // Contract fully ready
```

**Current BROKEN code in staged changes:**

```svelte
// Line 1166 - INVALID state 'contract_created'
entry = updateBookNowOutboxForDraft(instantBuyDraft, 'contract_created', {...});

// Line 1194 - INVALID state 'escrow_created'
updateBookNowOutboxForDraft(instantBuyDraft, 'escrow_created', {...});

// Line 1254 - INVALID state 'contract_creation_failed'
updateBookNowOutboxForDraft(instantBuyDraft, 'contract_creation_failed');
```

**FIX - Replace with valid states:**

```svelte
// After tx broadcast (line ~1166):
entry = updateBookNowOutboxForDraft(instantBuyDraft, 'funding_submitted', {
    transactionHash: contractResult.transactionHash,
    amountRbtc: contractResult.estimatedCostFormatted // or correct field
});

// After tx.wait() confirmation (line ~1194):
updateBookNowOutboxForDraft(instantBuyDraft, 'contract_ready', {
    escrowId: String(paymentId)
});

// On failure (line ~1254) - just clear, don't write invalid state:
clearBookNowOutboxForDraft(instantBuyDraft);
```

### 1.2 ServiceDetailsView.svelte - Premature Outbox Clearing

**Problem:** The `finally` block calls `submissionLockRelease()` which clears the outbox before `tx.wait()` completes.

**Current BROKEN pattern:**

```svelte
} finally {
    instantBuySubmitting = false;
    submissionLockRelease(); // This clears outbox TOO EARLY
}
```

**FIX - Move outbox clearing to correct locations:**

```svelte
} finally {
    instantBuySubmitting = false;
    // DO NOT clear outbox here - let the IIFE handle it
}

// In the IIFE success path (after afterConfirmed completes):
clearBookNowOutboxForDraft(instantBuyDraft);
goto(buildContractsHighlightUrl(String(paymentId)));

// In the IIFE error path:
clearBookNowOutboxForDraft(instantBuyDraft);
appStore.showErrorToast(...);
```

### 1.3 ServiceDetailsView.svelte - Broken Recovery Logic

**Problem:** Recovery calls `readRecoverableBookNowOutboxEntry` with null fingerprint and checks for invalid `'contract_created'` state.

**Current BROKEN (line ~1480):**

```svelte
const recoverable = readRecoverableBookNowOutboxEntry(getBookNowOutboxStorage(), null);
if (recoverable && recoverable.state === 'contract_created') { // INVALID state check
```

**FIX - Use proper fingerprint and valid states:**

```svelte
if (browser && service && instantBuyDraft) {
    const fingerprint = buildBookNowFingerprint(instantBuyDraft);
    const recoverable = readRecoverableBookNowOutboxEntry(getBookNowOutboxStorage(), fingerprint);

    // Check for valid recoverable states
    if (recoverable &&
        (recoverable.state === 'funding_submitted' || recoverable.state === 'contract_sync_pending') &&
        recoverable.transactionHash
    ) {
        // Attempt recovery...
    }
}
```

### 1.4 ServiceDetailsView.svelte - Missing State Reset

**Problem:** `instantBuyCreationState` not reset when closing drawer.

**FIX - Add to `resetInstantBuyState()`:**

```svelte
function resetInstantBuyState() {
    instantBuyPreparing = false;
    instantBuySubmitting = false;
    instantBuyPendingTransactionHash = '';
    _instantBuyPendingAmountRbtc = '';
    instantBuyPostSubmitErrorMessage = '';
    instantBuyCreationState = { state: 'idle' }; // ADD THIS
    // ... other resets
}
```

---

## Part 2: V1 Dependencies to Remove

### 2.1 DashboardServiceRequestsPanel.svelte - Explicit v1 Imports

**Current BROKEN imports:**

```typescript
import {
	retryPendingServiceAcceptanceByEscrowId,
	reverifyPublishedServiceAcceptanceByEscrowId
} from '$lib/utils/escrow/v1/escrowEvents';
```

**These functions are DEPRECATED.** The v2 `PaymentContractRune` handles:

- Pending state tracking via `isPending` state
- Transaction confirmation via `tx.wait()` + `afterConfirmed()`
- Status event subscriptions via NDK

**FIX:** Remove these imports and the interval-based retry/reverify logic. The v2 pattern handles this automatically through the creation flow's `afterConfirmed()` callback.

### 2.2 DashboardMyServicesPanel.svelte - escrow Facade Usage

**Current:**

```typescript
import { escrow } from '$lib/utils/escrow';
// Uses: escrow.contractOps.getContracts({ limit, before })
```

**This is using the v1 escrow facade.** For read operations, this is acceptable during transition, but should eventually migrate to `contractStore` or NDK-based queries.

**Action:** Mark as tech debt, but not blocking for tonight's release.

### 2.3 service-quote-ui.store.ts - V1 Event Functions

**Current BROKEN imports (line ~56):**

```typescript
import { retryPendingServiceAcceptanceByEscrowId } from '$lib/utils/escrow/v1/escrowEvents';
```

**FIX:** The store's `acceptTaskerProposal` method should use `createServiceContract` from `service-contract/create.ts`, which already delegates to `contract/v2/service-creation.ts`. Remove the v1 retry import.

---

## Part 3: Files to Keep vs Delete

### DELETE These Files (Redundant with v2)

| File                                             | Reason                                   |
| ------------------------------------------------ | ---------------------------------------- |
| `service-contract/finality.ts`                   | v2 lifecycle handles tx confirmation     |
| `service-contract/ambiguity-reason.ts`           | Over-engineered error handling           |
| `service-contract/recover.ts`                    | v2 `afterConfirmed` pattern handles this |
| `service-contract/recover-quote-acceptance.ts`   | v2 pattern handles this                  |
| `service-contract/reconcile-quote-acceptance.ts` | NDK handles reconciliation               |
| `contract/v2/utils.ts`                           | Unnecessary readiness checks             |
| `contract/v2/pending-contracts.ts`               | In-memory store doesn't survive refresh  |

### KEEP These Files (Still Needed)

| File                                       | Purpose                          |
| ------------------------------------------ | -------------------------------- |
| `service-contract/create.ts`               | Entry point, delegates to v2     |
| `service-contract/book-now-outbox.ts`      | Browser session persistence      |
| `service-contract/active-contracts.ts`     | Uses v2 `isTerminalPaymentState` |
| `service-contract/location.ts`             | UI presentation                  |
| `service-contract/dashboard-link.ts`       | Navigation helpers               |
| `service-contract/schedule.ts`             | Time calculations                |
| `service-contract/create-from-snapshot.ts` | Snapshot building                |
| `service-contract/context-presentation.ts` | UI labels                        |
| `service-contract/pending-navigation.ts`   | Navigation glue                  |

### DEPRECATE These Files (Remove after migration)

| File                                          | Reason                            |
| --------------------------------------------- | --------------------------------- |
| `service-contract/preflight.ts`               | Balance checks should be UI-level |
| `service-contract/preflight-feedback.ts`      | Tied to deprecated preflight      |
| `service-contract/await-contract-creation.ts` | v2 uses `tx.wait()` pattern       |

---

## Part 4: Component Migration Priority

### P0 - Fix Tonight

| Component                   | Issue                                                      | Fix                     |
| --------------------------- | ---------------------------------------------------------- | ----------------------- |
| `ServiceDetailsView.svelte` | Invalid outbox states, premature clearing, broken recovery | Apply fixes from Part 1 |

### P1 - Next Session

| Component                              | Issue                     | Fix                                     |
| -------------------------------------- | ------------------------- | --------------------------------------- |
| `DashboardServiceRequestsPanel.svelte` | v1 imports                | Remove `escrow/v1/escrowEvents` imports |
| `service-quote-ui.store.ts`            | v1 retry import           | Remove and use v2 creation flow         |
| `MyQuotesPanel.svelte`                 | Uses deprecated preflight | Move balance check to UI level          |

### P2 - Tech Debt

| Component                         | Issue              | Fix                          |
| --------------------------------- | ------------------ | ---------------------------- |
| `DashboardMyServicesPanel.svelte` | Uses escrow facade | Migrate to contractStore/NDK |
| Multiple components               | i18n violations    | Add translation keys         |

---

## Part 5: Exact Code Changes for Tonight

### File: `src/lib/components/service/ServiceDetailsView.svelte`

#### Change 1: Fix outbox state after broadcast

Find (around line 1166):

```svelte
entry = updateBookNowOutboxForDraft(instantBuyDraft, 'contract_created', {
    transactionHash: contractResult.transactionHash,
    amountRbtc: contractResult.amount
});
```

Replace with:

```svelte
entry = updateBookNowOutboxForDraft(instantBuyDraft, 'funding_submitted', {
    transactionHash: contractResult.transactionHash,
    amountRbtc: contractResult.estimatedCostFormatted
});
```

#### Change 2: Fix outbox state after confirmation

Find (around line 1194):

```svelte
updateBookNowOutboxForDraft(instantBuyDraft, 'escrow_created', {
    escrowId: String(paymentId)
});
```

Replace with:

```svelte
updateBookNowOutboxForDraft(instantBuyDraft, 'contract_ready', {
    escrowId: String(paymentId)
});
```

#### Change 3: Fix error handling - don't write invalid state

Find (around line 1254):

```svelte
updateBookNowOutboxForDraft(instantBuyDraft, 'contract_creation_failed');
```

Replace with:

```svelte
clearBookNowOutboxForDraft(instantBuyDraft);
```

#### Change 4: Remove premature clearing from finally block

Find the finally block (around line 1256-1258):

```svelte
} finally {
    instantBuySubmitting = false;
    submissionLockRelease();
}
```

Replace with:

```svelte
} finally {
    instantBuySubmitting = false;
    // Outbox clearing is handled in success/error paths above
}
```

#### Change 5: Fix recovery state check

Find (around line 1483):

```svelte
if (recoverable && recoverable.state === 'contract_created') {
```

Replace with:

```svelte
if (recoverable &&
    (recoverable.state === 'funding_submitted' || recoverable.state === 'contract_sync_pending') &&
    recoverable.transactionHash
) {
```

#### Change 6: Add missing state reset

Find `resetInstantBuyState()` function and add:

```svelte
instantBuyCreationState = { state: 'idle' };
```

---

## Part 6: Verification Checklist

After applying fixes:

- [ ] `npm run check` passes (or only pre-existing errors)
- [ ] Can open instant buy modal
- [ ] Can submit instant buy (or mock the tx)
- [ ] Outbox entry persists with valid state
- [ ] Recovery works on page refresh
- [ ] Error handling shows toast, doesn't break UI
- [ ] Drawer closes cleanly with state reset

---

## Appendix A: Component Dependency Graph

```
ServiceDetailsView.svelte (P0 - CRITICAL)
├── Uses: createServiceContract (service-contract/create.ts)
│   └── Calls: createServiceContractV2 (contract/v2/service-creation.ts) ✅ v2
├── Uses: book-now-outbox.ts (valid states: submission_locked, funding_submitted, contract_sync_pending, contract_ready)
├── Uses: preflightServiceContractCreation (DEPRECATED - move to UI level)
├── Uses: active-contracts.ts (uses v2 isTerminalPaymentState) ✅ v2
└── Uses: recover.ts (DEPRECATED - use afterConfirmed pattern)

DashboardServiceRequestsPanel.svelte (P1)
├── BROKEN: imports from escrow/v1/escrowEvents
└── Fix: Remove v1 imports, rely on v2 creation flow

MyQuotesPanel.svelte (P1)
├── Uses: preflightServiceContractCreation (DEPRECATED)
├── Uses: serviceQuoteUiStore.acceptTaskerProposal
└── Fix: Move balance check to UI, store calls v2

DashboardMyServicesPanel.svelte (P2)
├── Uses: escrow facade (acceptable for now)
└── Tech debt: Migrate to contractStore/NDK
```

---

## Appendix B: Valid BookNowOutboxState Transitions

```
┌─────────────────────┐
│   (initial state)   │
└──────────┬──────────┘
           │ acquireBookNowSubmissionLock()
           ▼
┌─────────────────────┐
│  submission_locked  │ ← Lock acquired, about to submit tx
└──────────┬──────────┘
           │ tx broadcast (transactionHash available)
           ▼
┌─────────────────────┐
│  funding_submitted  │ ← Waiting for blockchain confirmation
└──────────┬──────────┘
           │ tx.wait() completes (paymentId available)
           ▼
┌─────────────────────┐
│ contract_sync_pending│ ← (Optional) Waiting for Nostr sync
└──────────┬──────────┘
           │ Nostr event published
           ▼
┌─────────────────────┐
│   contract_ready    │ ← Final state, safe to clear
└──────────┬──────────┘
           │ clearBookNowOutboxForDraft()
           ▼
┌─────────────────────┐
│   (entry removed)   │
└─────────────────────┘
```

---

## Appendix C: createServiceContract Return Type

From `contract/v2/service-creation.ts`:

```typescript
export type ServiceContractCreationResultV2 =
	| {
			success: true;
			transactionHash: string;
			estimatedCostFormatted: string;
			tx: WriteTxResult['tx'];
			afterBroadcast: Promise<{ failures: { name: string; error: unknown }[] }>;
			afterConfirmed: (receipt: TransactionReceipt) => Promise<{ paymentId: number }>;
	  }
	| {
			success: false;
			error: string;
	  };
```

**Usage pattern:**

```typescript
const result = await createServiceContract(input);
if (!result.success) {
	throw new Error(result.error);
}

// Update outbox to 'funding_submitted'
const receipt = await result.tx.wait();
const { paymentId } = await result.afterConfirmed(receipt);
// Update outbox to 'contract_ready'
// Clear outbox
// Navigate to contract
```
