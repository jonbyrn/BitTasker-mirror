# Service Business Logic Integration into Version-Agnostic Contract Implementation

This document outlines how service-related business logic currently embedded in the `escrow v1` implementation should be integrated into the new NDK-based `contract` implementation. It separates business logic from UI concerns and provides a clear path forward for portability.

## Executive Summary

The analysis identified **three categories** of service-related code in the escrow implementation:

1. **SERVICE_SPECIFIC**: Code that only makes sense for services (quote acceptance, service notifications, acceptance ledger)
2. **CONTRACT_GENERIC**: Code that could apply to both tasks and services (context type detection, agreement snapshots)
3. **INTEGRATION_GLUE**: Code that bridges services with contracts (pending contract registration, acceptance replay/reverify)

**Recommendation**: Create a **Service Adapter Layer** that extends the NDK contract implementation rather than embedding service logic directly into it.

---

## 🔴 AUDIT FINDINGS: Redundant & Obsolete Code

After comparing the service-related code with the v2/NDK contract implementation, significant redundancies were identified. Much of the service-specific code was written when v1 was the only option and **re-implements functionality that v2/NDK already handles better**.

### Critical Finding: The v2/NDK Implementation Already Handles Pending States

The `PaymentContractRune` in `src/lib/runes/contractRune.svelte.ts` provides:

| Feature | V2/NDK Implementation | Service V1 Implementation | Verdict |
|---------|----------------------|---------------------------|---------|
| **Pending state tracking** | `isPending` state + `optimisticBlockchainStatus` | `acceptance-ledger.ts` with 680+ lines | **REDUNDANT** |
| **Transaction confirmation** | `resolvePaymentIdFromTxHash()` + `awaitStatusTxThenReload()` | `finality.ts` with polling + retry logic | **REDUNDANT** |
| **Status events** | NDK subscription with `statusEventsByNewest` | Custom Nostr publishing + in-memory maps | **REDUNDANT** |
| **Error recovery** | Automatic via lifecycle + subscription | Complex replay/reverify ledger | **OVER-ENGINEERED** |

### Code to REMOVE (Obsolete with v2/NDK)

#### 1. `src/lib/utils/service-contract/finality.ts` (77 lines) - **DELETE**

```typescript
// This entire file is redundant. V2 handles this via:
// - PaymentContractRune.resolvePaymentIdFromTxHash() 
// - PaymentContractRune.awaitStatusTxThenReload()
// - Provider.waitForTransaction() in lifecycle writes

// The "3 confirmations" policy was AI-invented paranoia. RSK has finality in 1 block.
export const SERVICE_ACCEPTANCE_REQUIRED_CONFIRMATIONS = 3; // UNNECESSARY
```

**Reason**: The v2 lifecycle already:
1. Waits for transaction confirmation via `provider.waitForTransaction()`
2. Reloads blockchain data after confirmation
3. Updates the rune's `isPending` state

#### 2. `src/lib/utils/service-quote/acceptance-ledger.ts` (681 lines) - **MOSTLY DELETE**

This file implements a complex local storage-backed state machine that duplicates what NDK events already provide:

```typescript
// These are redundant with NDK's event system:
- ServiceAcceptanceLedgerState // NDK status events track this
- ServiceAcceptanceReplayEntry // Kind 31006 events are the replay mechanism
- ServiceAcceptanceConfirmedMonitorEntry // NDK subscriptions handle monitoring

// Keep ONLY the simple in-memory ledger for UI state during acceptance:
- getAcceptanceLedgerEntry()
- upsertAcceptanceLedgerEntry()
```

**Reason**: The v2/NDK implementation stores contract status in **Nostr events (Kind 31006)** which:
1. Are persisted on relays (not local storage)
2. Are automatically synced via subscriptions
3. Provide the same "replay" capability via re-fetching

#### 3. `src/lib/utils/service-contract/ambiguity-reason.ts` (30 lines) - **DELETE**

```typescript
// This error classification is over-engineered. Standard error handling suffices.
// The "reasonCode" system was AI-generated complexity that doesn't add value.
export function classifyServiceAcceptanceAmbiguityError(...) // UNNECESSARY
```

**Reason**: The v2 lifecycle already handles errors via try/catch and returns `{ ok: false }`.

#### 4. Most of `escrowEvents.ts` Service Functions - **SIMPLIFY**

| Function | Lines | Status | Reason |
|----------|-------|--------|--------|
| `ServiceAcceptanceReplayPublishTarget` | 53-63 | **DELETE** | NDK events are the replay mechanism |
| `createServiceAcceptanceReplayTarget()` | 65-92 | **DELETE** | NDK events are the replay mechanism |
| `resolveServiceAcceptanceReplayTarget()` | 94-125 | **DELETE** | NDK events are the replay mechanism |
| `persistConfirmedServiceAcceptanceMonitor()` | 127-147 | **DELETE** | NDK subscriptions handle monitoring |
| `getServiceAcceptanceUnknownMessage()` | 302-317 | **SIMPLIFY** | Use standard error messages |
| `publishPendingServiceAcceptanceUnknownByTxHash()` | 319-386 | **DELETE** | V2 lifecycle handles errors |
| `retryPendingServiceAcceptanceByEscrowId()` | 399-459 | **DELETE** | NDK re-fetch handles retry |
| `reverifyPublishedServiceAcceptanceByEscrowId()` | 461-613 | **DELETE** | V2 lifecycle handles verification |
| `findPendingServiceContractByTransactionHashes()` | 284-300 | **SIMPLIFY** | Single lookup, not ledger |

#### 5. `escrow.ts` Service Functions - **SIMPLIFY**

| Function | Lines | Status | Reason |
|----------|-------|--------|--------|
| `verifyServiceEscrowCreation()` | 341-370 | **DELETE** | V2 lifecycle loads and verifies |
| `reverifyPublishedServiceAcceptance()` | 372-411 | **DELETE** | Rune handles re-verification |

### Code to KEEP (Actually Needed)

#### 1. Service Quote Protocol (`src/lib/utils/service-quote/`)

These are **actually service-specific** and cannot be replaced by contract code:

| File | Keep | Reason |
|------|------|--------|
| `protocol.ts` | ✅ YES | Defines event kinds 6420, 6421, 6422 |
| `publish.ts` | ✅ YES | Publishes service quote status updates |
| `accept.ts` | ⚠️ PARTIAL | Keep validation, remove ledger integration |
| `notifications.ts` | ✅ YES | Service-specific push notifications |
| `agreement-summary.ts` | ✅ YES | Service agreement display logic |
| `acceptance-ledger.ts` | ⚠️ PARTIAL | Keep only simple state tracking (50 lines max) |

#### 2. Service Contract Utilities (`src/lib/utils/service-contract/`)

| File | Keep | Reason |
|------|------|--------|
| `create.ts` | ✅ YES | Service contract creation (calls escrow.escrowOps) |
| `create-from-snapshot.ts` | ✅ YES | Builds PendingContractCreation |
| `context-presentation.ts` | ✅ YES | UI display logic |
| `location.ts` | ✅ YES | Service location handling |
| `dashboard-link.ts` | ✅ YES | Navigation helpers |
| `pending-navigation.ts` | ⚠️ REVIEW | May be replaced by URL params |
| `schedule.ts` | ✅ YES | Time calculations |
| `acceptance-snapshot.ts` | ⚠️ REVIEW | May be over-complicated |
| `finality.ts` | ❌ DELETE | Redundant with v2 lifecycle |
| `ambiguity-reason.ts` | ❌ DELETE | Over-engineered error handling |
| `recover.ts` | ❌ DELETE | NDK handles recovery |
| `recover-quote-acceptance.ts` | ❌ DELETE | NDK handles recovery |
| `reconcile-quote-acceptance.ts` | ❌ DELETE | NDK handles reconciliation |
| `await-contract-creation.ts` | ❌ DELETE | Rune handles this |
| `active-contracts.ts` | ⚠️ REVIEW | May be replaced by store queries |

### Estimated Code Reduction

| Category | Current Lines | After Cleanup | Reduction |
|----------|---------------|---------------|-----------|
| `acceptance-ledger.ts` | 681 | ~50 | **93%** |
| `finality.ts` | 77 | 0 | **100%** |
| `ambiguity-reason.ts` | 30 | 0 | **100%** |
| `escrowEvents.ts` service code | ~400 | ~100 | **75%** |
| `escrow.ts` service code | ~100 | ~20 | **80%** |
| **Total service slop** | **~1,288** | **~170** | **~87%** |

### Why This Code Existed

This code was written when:
1. **Only v1 escrow existed** - no lifecycle abstraction
2. **No NDK integration** - manual Nostr event handling
3. **AI-generated complexity** - over-engineering error cases that don't happen in practice
4. **No rune-based reactivity** - manual state tracking

The v2 implementation with `PaymentContractRune` + `PaymentContractLifecycle` solves these problems at the architecture level.

---

## ✅ REVISED: Simplified Migration Strategy

Given the audit findings above, the migration is much simpler than originally planned.

### Phase 1: Delete Redundant Files (Immediate)

**Delete these files entirely:**
```bash
rm src/lib/utils/service-contract/finality.ts
rm src/lib/utils/service-contract/ambiguity-reason.ts
rm src/lib/utils/service-contract/recover.ts
rm src/lib/utils/service-contract/recover-quote-acceptance.ts
rm src/lib/utils/service-contract/reconcile-quote-acceptance.ts
rm src/lib/utils/service-contract/await-contract-creation.ts
```

### Phase 2: Simplify `acceptance-ledger.ts` (Immediate)

Replace the 681-line file with this ~50 line version:

```typescript
// src/lib/utils/service-quote/acceptance-ledger.ts (SIMPLIFIED)

export type ServiceAcceptanceLedgerState = 
  | 'accepting' 
  | 'accepted' 
  | 'accept_failed';

interface LedgerEntry {
  state: ServiceAcceptanceLedgerState;
  transactionHash?: string;
  timestamp: number;
}

const ledger = new Map<string, LedgerEntry>();

export function getAcceptanceState(proposalId: string): ServiceAcceptanceLedgerState | null {
  return ledger.get(proposalId)?.state ?? null;
}

export function setAcceptanceState(
  proposalId: string, 
  state: ServiceAcceptanceLedgerState,
  transactionHash?: string
): void {
  ledger.set(proposalId, {
    state,
    transactionHash,
    timestamp: Date.now()
  });
}

export function clearAcceptanceState(proposalId: string): void {
  ledger.delete(proposalId);
}

export function getAcceptanceTransactionHash(proposalId: string): string | undefined {
  return ledger.get(proposalId)?.transactionHash;
}
```

### Phase 3: Add Minimal Service Context to NDK (When Porting)

```typescript
// Add to NDKPaymentContract class in src/lib/nostr/events/contract.ts

// Service context (encrypted tags)
get contextType(): string | undefined {
  return this.tagValue('contextType');
}

set contextType(value: string) {
  this.removeTag('contextType');
  this.tags.push(['contextType', value]);
}

get serviceId(): string | undefined {
  return this.tagValue('serviceId');
}

set serviceId(value: string) {
  this.removeTag('serviceId');
  this.tags.push(['serviceId', value]);
}
```

### Phase 4: Update Service Contract Creation

Update `src/lib/utils/service-contract/create.ts` to:
1. Use v2 creation flow instead of v1 `escrow.escrowOps.createEscrow`
2. Set service context tags on `NDKPaymentContract`
3. Let `PaymentContractRune` handle pending state

That's the entire migration. No complex adapter layer needed.

---

## 📋 Reference: Original Analysis (For Context)

The following sections document the original analysis before the audit. They are kept for reference but the recommendations have been superseded by the simplified strategy above.

---

### Files Analyzed in `src/lib/utils/escrow/v1/` (Reference)

#### 1. `escrowEvents.ts` - Service-Related Functions

| Function | Lines | Category | ~~Recommendation~~ | **AUDIT STATUS** |
|----------|-------|----------|---------------------|------------------|
| `isServicePendingContract()` | 49-51 | CONTRACT_GENERIC | ~~Move to contract/context.ts~~ | **KEEP** - useful check |
| `ServiceAcceptanceReplayPublishTarget` (type) | 53-63 | SERVICE_SPECIFIC | ~~Keep~~ | **DELETE** - redundant |
| `createServiceAcceptanceReplayTarget()` | 65-92 | SERVICE_SPECIFIC | ~~Keep~~ | **DELETE** - redundant |
| `resolveServiceAcceptanceReplayTarget()` | 94-125 | SERVICE_SPECIFIC | ~~Keep~~ | **DELETE** - redundant |
| `persistConfirmedServiceAcceptanceMonitor()` | 127-147 | SERVICE_SPECIFIC | ~~Keep~~ | **DELETE** - redundant |
| `getServiceAcceptanceUnknownMessage()` | 302-317 | SERVICE_SPECIFIC | ~~Keep~~ | **SIMPLIFY** - generic errors |
| `publishPendingServiceAcceptanceUnknownByTxHash()` | 319-386 | INTEGRATION_GLUE | ~~Adapter~~ | **DELETE** - v2 handles errors |
| `retryPendingServiceAcceptanceByEscrowId()` | 399-459 | INTEGRATION_GLUE | ~~Adapter~~ | **DELETE** - NDK handles |
| `reverifyPublishedServiceAcceptanceByEscrowId()` | 461-613 | INTEGRATION_GLUE | ~~Adapter~~ | **DELETE** - rune handles |
| `registerPendingContractByTxHash()` | 193-214 | INTEGRATION_GLUE | ~~Generalize~~ | **KEEP** - still needed |
| `findPendingServiceContractByTransactionHashes()` | 284-300 | SERVICE_SPECIFIC | ~~Keep~~ | **SIMPLIFY** - single lookup |
| `handleEscrowCreated()` (service parts) | 759-868 | INTEGRATION_GLUE | ~~Adapter~~ | **KEEP** - notifications needed |

#### 2. `nostrContract.ts` - Service-Related Code (Reference)

| Code Section | Lines | Category | **AUDIT STATUS** |
|--------------|-------|----------|------------------|
| `RuntimeContractContextType` type | 31 | CONTRACT_GENERIC | **KEEP** |
| `normalizeContractContextType()` | 33-37 | CONTRACT_GENERIC | **KEEP** |
| Service fields in `publishContractEvent()` | 65-97 | CONTRACT_GENERIC | **KEEP** |

#### 3. `escrow.ts` - Service-Related Code (Reference)

| Function | Lines | Category | **AUDIT STATUS** |
|----------|-------|----------|------------------|
| `verifyServiceEscrowCreation()` | 341-370 | INTEGRATION_GLUE | **DELETE** - v2 lifecycle |
| `reverifyPublishedServiceAcceptance()` | 372-411 | INTEGRATION_GLUE | **DELETE** - rune handles |
| Service handling in `createEscrow()` | 519-676 | INTEGRATION_GLUE | **REVIEW** - may simplify |

---

## 📚 Original Architectural Recommendation (SUPERSEDED)

The following section describes the originally proposed "Service Adapter Layer" architecture. After the audit, this is **no longer recommended** - the simplified approach above is preferred.

### ~~Architectural Recommendation: Service Adapter Layer~~

### Directory Structure

```
src/lib/utils/
├── contract/                         # Version-agnostic NDK contract implementation
│   ├── index.ts                      # Wallet/provider helpers
│   ├── types.ts                      # Contract types
│   ├── context.ts                    # NEW: Context type utilities
│   ├── lifecycle/                    # Lifecycle implementations
│   │   ├── types.ts                  # PaymentContractLifecycle interface
│   │   ├── v1.ts                     # V1 lifecycle
│   │   ├── v2.ts                     # V2 lifecycle
│   │   └── index.ts                  # Lifecycle exports
│   └── v1/, v2/                      # Version-specific implementations
│
├── service-contract/                 # Service-specific contract utilities
│   ├── adapter.ts                    # NEW: Service adapter for contract lifecycle
│   ├── acceptance-lifecycle.ts       # NEW: Service acceptance lifecycle hooks
│   ├── create.ts                     # Existing: Service contract creation
│   ├── finality.ts                   # Existing: Finality handling
│   └── ...                           # Other existing service utilities
│
└── service-quote/                    # Service quote utilities (unchanged)
    ├── accept.ts
    ├── publish.ts
    ├── acceptance-ledger.ts
    └── ...
```

### New File: `src/lib/utils/contract/context.ts`

```typescript
/**
 * Contract Context Utilities
 * 
 * Generic context handling for both task and service contracts.
 * Part of the version-agnostic contract implementation.
 */

export type ContractContextType = 'task' | 'service';
export type RuntimeContractContextType = ContractContextType | 'unknown';

/**
 * Normalizes context type from raw event data.
 * Handles backward compatibility (null/undefined -> 'task').
 */
export function normalizeContractContextType(value: unknown): RuntimeContractContextType {
    if (value === 'service') return 'service';
    if (value === 'task' || value == null) return 'task';
    return 'unknown';
}

/**
 * Type guard for service contracts
 */
export function isServiceContext(contextType: RuntimeContractContextType): boolean {
    return contextType === 'service';
}

/**
 * Type guard for task contracts
 */
export function isTaskContext(contextType: RuntimeContractContextType): boolean {
    return contextType === 'task';
}
```

### New File: `src/lib/utils/service-contract/adapter.ts`

```typescript
/**
 * Service Contract Adapter
 * 
 * Bridges service-specific logic with the version-agnostic contract implementation.
 * Implements hooks that are called at specific points in the contract lifecycle.
 */

import type { PendingContractCreation } from '$lib/types/contract';
import type { ServiceAcceptanceSnapshot } from '$lib/types/service-quote';
import { isServiceContext, normalizeContractContextType } from '$lib/utils/contract/context';

export interface ServiceContractCreatedEvent {
    escrowId: string;
    transactionHash: string;
    pendingContract: PendingContractCreation;
    acceptanceSnapshot?: ServiceAcceptanceSnapshot;
}

export interface ServiceAcceptancePublishResult {
    success: boolean;
    retainForRetry?: boolean;
}

/**
 * Checks if a pending contract is for a service
 */
export function isServicePendingContract(contract: PendingContractCreation): boolean {
    return normalizeContractContextType(contract.contextType) === 'service';
}

/**
 * Determines if a pending contract has the required service fields
 */
export function hasServiceContractFields(
    contract: PendingContractCreation
): contract is PendingContractCreation & {
    quoteRequestId: string;
    proposalId: string;
    proposalEventId: string;
    serviceId: string;
    serviceAddress: string;
} {
    return !!(
        contract.quoteRequestId &&
        contract.proposalId &&
        contract.proposalEventId &&
        contract.serviceId &&
        contract.serviceAddress
    );
}

/**
 * Hook: Called after escrow is successfully created
 * Publishes service acceptance status to Nostr
 */
export async function onServiceContractCreated(
    event: ServiceContractCreatedEvent
): Promise<ServiceAcceptancePublishResult> {
    const { publishServiceProposalStatus } = await import('$lib/utils/service-quote/publish');
    const { completeServiceProposalAcceptance } = await import('$lib/utils/service-quote/accept');
    const { dispatchServiceContractCreatedNotification } = await import(
        '$lib/utils/service-quote/notifications'
    );
    const { SERVICE_QUOTE_MESSAGE_TYPES } = await import('$lib/utils/service-quote/protocol');
    const { getNpub } = await import('$lib/utils/nostrKeys');
    const { 
        upsertAcceptanceReplayEntry,
        clearAcceptanceReplayEntry 
    } = await import('$lib/utils/service-quote/acceptance-ledger');

    const { escrowId, transactionHash, pendingContract, acceptanceSnapshot } = event;

    if (!isServicePendingContract(pendingContract) || !hasServiceContractFields(pendingContract)) {
        return { success: true }; // Not a service contract, nothing to do
    }

    // Dispatch push notification
    dispatchServiceContractCreatedNotification({
        recipientPubkey: pendingContract.freelancerPubkey,
        escrowId,
        serviceTitle:
            pendingContract.serviceTitle ??
            pendingContract.contextTitle ??
            pendingContract.taskTitle ?? 'Service',
        purchaseMode: pendingContract.purchaseMode ?? 'quote'
    });

    // Publish acceptance status to Nostr
    try {
        await publishServiceProposalStatus({
            content: {
                type: SERVICE_QUOTE_MESSAGE_TYPES.STATUS,
                proposalId: pendingContract.proposalId,
                quoteRequestId: pendingContract.quoteRequestId,
                serviceId: pendingContract.serviceId,
                serviceAddress: pendingContract.serviceAddress,
                status: 'accepted',
                actorPubkey: await getNpub(),
                timestamp: Math.floor(Date.now() / 1000),
                escrowId,
                transactionHash,
                acceptanceSnapshot,
                version: 'v1'
            },
            proposalEventId: pendingContract.proposalEventId,
            counterpartyPubkey: pendingContract.freelancerPubkey,
            taskerPubkey: await getNpub(),
            taskeePubkey: pendingContract.freelancerPubkey
        });

        completeServiceProposalAcceptance(pendingContract.proposalId, true, false, undefined, transactionHash);
        await clearAcceptanceReplayEntry(escrowId);
        return { success: true };
    } catch (error) {
        // Store for retry
        await upsertAcceptanceReplayEntry({
            escrowId,
            proposalId: pendingContract.proposalId,
            proposalEventId: pendingContract.proposalEventId,
            quoteRequestId: pendingContract.quoteRequestId,
            serviceId: pendingContract.serviceId,
            serviceAddress: pendingContract.serviceAddress,
            counterpartyPubkey: pendingContract.freelancerPubkey,
            transactionHash,
            acceptanceSnapshot
        });

        completeServiceProposalAcceptance(
            pendingContract.proposalId,
            false,
            false,
            'reconciliation_deferred',
            transactionHash
        );

        return { success: false, retainForRetry: true };
    }
}

/**
 * Hook: Called when escrow creation verification fails or is ambiguous
 * Publishes unknown status to service quote protocol
 */
export async function onServiceAcceptanceUnknown(
    transactionHash: string,
    reasonCode: 'tx_replaced' | 'pending_timeout' | 'rpc_unavailable' | 'nonce_conflict' | 'reconciliation_deferred',
    pendingContract: PendingContractCreation,
    transactionHashOverride?: string
): Promise<void> {
    if (!isServicePendingContract(pendingContract) || !hasServiceContractFields(pendingContract)) {
        return; // Not a service contract
    }

    const { publishServiceProposalStatus } = await import('$lib/utils/service-quote/publish');
    const { completeServiceProposalAcceptance } = await import('$lib/utils/service-quote/accept');
    const { SERVICE_QUOTE_MESSAGE_TYPES } = await import('$lib/utils/service-quote/protocol');
    const { getNpub } = await import('$lib/utils/nostrKeys');

    const statusTransactionHash = transactionHashOverride ?? transactionHash;
    const message = getServiceAcceptanceUnknownMessage(reasonCode);

    try {
        await publishServiceProposalStatus({
            content: {
                type: SERVICE_QUOTE_MESSAGE_TYPES.STATUS,
                proposalId: pendingContract.proposalId,
                quoteRequestId: pendingContract.quoteRequestId,
                serviceId: pendingContract.serviceId,
                serviceAddress: pendingContract.serviceAddress,
                status: 'accept_unknown',
                actorPubkey: await getNpub(),
                message,
                reasonCode,
                timestamp: Math.floor(Date.now() / 1000),
                transactionHash: statusTransactionHash,
                version: 'v1'
            },
            proposalEventId: pendingContract.proposalEventId,
            counterpartyPubkey: pendingContract.freelancerPubkey,
            taskerPubkey: await getNpub(),
            taskeePubkey: pendingContract.freelancerPubkey
        });
    } catch (error) {
        console.error('Failed to publish service acceptance unknown status:', error);
    } finally {
        completeServiceProposalAcceptance(
            pendingContract.proposalId,
            false,
            false,
            reasonCode,
            statusTransactionHash
        );
    }
}

function getServiceAcceptanceUnknownMessage(
    reasonCode: 'tx_replaced' | 'pending_timeout' | 'rpc_unavailable' | 'nonce_conflict' | 'reconciliation_deferred'
): string {
    switch (reasonCode) {
        case 'tx_replaced':
            return 'The wallet replaced the original escrow transaction. Contract confirmation is still syncing.';
        case 'pending_timeout':
            return 'The escrow transaction was submitted, but confirmation is still syncing.';
        case 'rpc_unavailable':
            return 'The escrow transaction state could not be verified because the RPC was unavailable.';
        case 'nonce_conflict':
            return 'The escrow transaction encountered a wallet nonce conflict and needs reconciliation.';
        case 'reconciliation_deferred':
            return 'The escrow transaction needs additional reconciliation before service acceptance can be confirmed.';
    }
}
```

### New File: `src/lib/utils/service-contract/acceptance-lifecycle.ts`

```typescript
/**
 * Service Acceptance Lifecycle
 * 
 * Manages retry and reverification of service acceptance states.
 * Used by dashboard to recover from failed acceptance publishing.
 */

import type { ServiceAcceptanceUnknownReasonCode, ServiceAcceptanceSnapshot } from '$lib/types/service-quote';

export type PendingServiceAcceptanceRetryResult =
    | { status: 'accepted' }
    | { status: 'deferred'; reasonCode: 'reconciliation_deferred' }
    | { status: 'not_found' };

export type PublishedServiceAcceptanceReverifyResult =
    | { status: 'confirmed' }
    | { status: 'downgraded'; reasonCode: ServiceAcceptanceUnknownReasonCode }
    | { status: 'deferred'; reasonCode: ServiceAcceptanceUnknownReasonCode }
    | { status: 'not_found' };

/**
 * Retry publishing service acceptance for a confirmed escrow
 */
export async function retryPendingServiceAcceptanceByEscrowId(
    escrowId: string
): Promise<PendingServiceAcceptanceRetryResult> {
    // Implementation moved from escrowEvents.ts
    // Uses acceptance-ledger for replay entry lookup
    // Calls publishServiceProposalStatus with 'accepted' status
    // Refer to escrowEvents.ts lines 399-459 for full implementation
    
    const { getAcceptanceReplayEntry, clearAcceptanceReplayEntry, upsertAcceptanceReplayEntry } = 
        await import('$lib/utils/service-quote/acceptance-ledger');
    const { publishServiceProposalStatus } = await import('$lib/utils/service-quote/publish');
    const { completeServiceProposalAcceptance } = await import('$lib/utils/service-quote/accept');
    const { SERVICE_QUOTE_MESSAGE_TYPES } = await import('$lib/utils/service-quote/protocol');
    const { getNpub } = await import('$lib/utils/nostrKeys');

    const replayEntry = await getAcceptanceReplayEntry(escrowId);
    if (!replayEntry) {
        return { status: 'not_found' };
    }

    try {
        await publishServiceProposalStatus({
            content: {
                type: SERVICE_QUOTE_MESSAGE_TYPES.STATUS,
                proposalId: replayEntry.proposalId,
                quoteRequestId: replayEntry.quoteRequestId,
                serviceId: replayEntry.serviceId,
                serviceAddress: replayEntry.serviceAddress,
                status: 'accepted',
                actorPubkey: await getNpub(),
                timestamp: Math.floor(Date.now() / 1000),
                escrowId,
                transactionHash: replayEntry.transactionHash,
                acceptanceSnapshot: replayEntry.acceptanceSnapshot,
                version: 'v1'
            },
            proposalEventId: replayEntry.proposalEventId,
            counterpartyPubkey: replayEntry.counterpartyPubkey,
            taskerPubkey: await getNpub(),
            taskeePubkey: replayEntry.counterpartyPubkey
        });

        completeServiceProposalAcceptance(
            replayEntry.proposalId,
            true,
            false,
            undefined,
            replayEntry.transactionHash
        );
        await clearAcceptanceReplayEntry(escrowId);
        return { status: 'accepted' };
    } catch (error) {
        await upsertAcceptanceReplayEntry(replayEntry);
        completeServiceProposalAcceptance(
            replayEntry.proposalId,
            false,
            false,
            'reconciliation_deferred',
            replayEntry.transactionHash
        );
        return { status: 'deferred', reasonCode: 'reconciliation_deferred' };
    }
}

/**
 * Reverify a published service acceptance against blockchain state
 */
export async function reverifyPublishedServiceAcceptanceByEscrowId(
    escrowId: string
): Promise<PublishedServiceAcceptanceReverifyResult> {
    // Implementation moved from escrowEvents.ts
    // Calls reverifyPublishedServiceAcceptance from escrow.ts
    // Updates acceptance-ledger based on result
    // Refer to escrowEvents.ts lines 461-613 for full implementation
    
    const { getAcceptanceConfirmedMonitorEntry, upsertAcceptanceConfirmedMonitorEntry } =
        await import('$lib/utils/service-quote/acceptance-ledger');

    const monitorEntry = await getAcceptanceConfirmedMonitorEntry(escrowId);
    if (!monitorEntry) {
        return { status: 'not_found' };
    }

    // Delegate to blockchain verification
    const { reverifyPublishedServiceAcceptance } = await import('./reverify');
    
    const result = await reverifyPublishedServiceAcceptance({
        escrowId: monitorEntry.escrowId,
        transactionHash: monitorEntry.transactionHash,
        acceptanceSnapshot: monitorEntry.acceptanceSnapshot
    });

    // Handle result and update ledger
    // (Full implementation in escrowEvents.ts lines 476-611)
    
    return result;
}
```

---

## Integration Points with NDK Contract Implementation

### 1. `PaymentContractLifecycle` Extension (Optional)

The existing `PaymentContractLifecycle` interface in `src/lib/utils/contract/lifecycle/types.ts` does **not** need modification for services. Instead, service-specific logic is handled through:

- **Creation-time hooks**: `onServiceContractCreated()`, `onServiceAcceptanceUnknown()`
- **Dashboard-level recovery**: `retryPendingServiceAcceptanceByEscrowId()`, `reverifyPublishedServiceAcceptanceByEscrowId()`

### 2. `PaymentContractRune` Service Context

The `PaymentContractRune` in `src/lib/runes/contractRune.svelte.ts` should expose:

```typescript
// Add to PaymentContractRune
get contextType(): RuntimeContractContextType {
    return normalizeContractContextType(this.contract.contextType);
}

get isServiceContract(): boolean {
    return isServiceContext(this.contextType);
}

get serviceContext(): ServiceContractContext | null {
    if (!this.isServiceContract) return null;
    return {
        serviceId: this.contract.serviceId,
        serviceAddress: this.contract.serviceAddress,
        serviceTitle: this.contract.serviceTitle,
        quoteRequestId: this.contract.quoteRequestId,
        proposalId: this.contract.proposalId,
        purchaseMode: this.contract.purchaseMode,
        agreementSnapshot: this.contract.agreementSnapshot,
        pricingSnapshot: this.contract.pricingSnapshot
    };
}
```

### 3. `NDKPaymentContract` Event Tags

Add service-related tags to `NDKPaymentContract` in `src/lib/nostr/events/contract.ts`:

```typescript
// Existing tags extended
set contextType(value: ContractContextType | undefined) {
    if (value) this.tags.push(['contextType', value]);
}
get contextType(): ContractContextType | undefined {
    return this.tagValue('contextType') as ContractContextType | undefined;
}

set serviceId(value: string | undefined) {
    if (value) this.tags.push(['serviceId', value]);
}
get serviceId(): string | undefined {
    return this.tagValue('serviceId');
}

// Similar for: serviceAddress, serviceTitle, quoteRequestId, proposalId, purchaseMode
```

---

## ⚠️ SUPERSEDED: Original Migration Steps

> **NOTE**: The migration steps below were written BEFORE the audit. After analyzing the v2/NDK implementation, these steps are **overly complex** and should be replaced by the simplified strategy at the top of this document.

### ~~Step 1: Create Context Utilities (CONTRACT_GENERIC)~~

1. ~~Create `src/lib/utils/contract/context.ts` with `normalizeContractContextType()` and type guards~~
2. ~~Update existing imports in escrow files to use new location~~

**REVISED**: Keep `isServicePendingContract()` where it is. Add minimal context helpers only when needed.

### ~~Step 2: Create Service Adapter (INTEGRATION_GLUE)~~

1. ~~Create `src/lib/utils/service-contract/adapter.ts` with hooks~~
2. ~~Refactor `handleEscrowCreated()` in `escrowEvents.ts` to call adapter hooks~~
3. ~~Test service contract creation flow~~

**REVISED**: Do NOT create an adapter layer. Simply update `service-contract/create.ts` to use v2 creation.

### ~~Step 3: Create Acceptance Lifecycle (SERVICE_SPECIFIC)~~

1. ~~Create `src/lib/utils/service-contract/acceptance-lifecycle.ts`~~
2. ~~Move retry/reverify logic from `escrowEvents.ts`~~
3. ~~Update dashboard pages to use new imports~~

**REVISED**: DELETE all replay/reverify code. The rune handles this automatically.

### ~~Step 4: Extend PaymentContractRune~~

1. Add service context getters to `PaymentContractRune`
2. Update `DashboardContractsPanelNDK` to support service filtering
3. Port service UI components to use rune-based data

### Step 5: Update NDK Contract Event

1. Add service-related tags to `NDKPaymentContract`
2. Update contract creation in `v2/creation.ts` to include service fields
3. Test bidirectional (v1 ↔ NDK) compatibility

---

## ⚠️ SUPERSEDED: Code Classification Summary (Pre-Audit)

> The table below was created before the audit. See the audit section for revised actions.

| Category | Files/Functions | ~~Original Action~~ | **Audit Action** |
|----------|----------------|---------------------|------------------|
| **SERVICE_SPECIFIC** | `service-quote/*` | Keep | **PARTIAL KEEP** - simplify `acceptance-ledger.ts` |
| **SERVICE_SPECIFIC** | `finality.ts`, `ambiguity-reason.ts` | Keep | **DELETE** - redundant with v2 |
| **CONTRACT_GENERIC** | `contextType` utilities | Move to `contract/` | **KEEP IN PLACE** - minimal change needed |
| **INTEGRATION_GLUE** | `handleEscrowCreated()` service parts | Adapter | **SIMPLIFY** - keep notifications only |
| **INTEGRATION_GLUE** | Finality/replay/reverify | Adapter | **DELETE** - rune handles all of this |

---

## ✅ IMPLEMENTATION STATUS (As of April 2026)

### What Was Actually Changed

After deeper analysis, the original audit recommendations were **too aggressive**. Many of the files marked for deletion are actually needed for:
- **Browser restart recovery**: Users may close browser mid-transaction
- **Network failure retry**: Acceptance publish may fail due to RPC issues
- **Timeline reconciliation**: UI state may not match blockchain/Nostr state

### Changes Implemented

#### 1. Consolidated `ambiguity-reason.ts` into `finality.ts`
- Inlined `classifyServiceAcceptanceAmbiguityError()` into `finality.ts`
- `ambiguity-reason.ts` now re-exports from `finality.ts` for backward compatibility
- Updated `escrow.ts` to import from `finality.ts` directly

#### 2. Added Deprecation Notices
All legacy service files now have clear `@deprecated` JSDoc comments explaining:
- What the file does
- Why it exists (v1 escrow flow)
- What to use instead (PaymentContractRune for v2)
- When it will be removed (after v2 migration)

Files marked deprecated:
- `src/lib/utils/service-contract/finality.ts`
- `src/lib/utils/service-contract/ambiguity-reason.ts` (re-export)
- `src/lib/utils/service-contract/recover.ts`
- `src/lib/utils/service-contract/recover-quote-acceptance.ts`
- `src/lib/utils/service-contract/reconcile-quote-acceptance.ts`
- `src/lib/utils/service-contract/await-contract-creation.ts`
- `src/lib/utils/service-quote/acceptance-ledger.ts`

### Files NOT Deleted (Still Needed)

| File | Status | Reason |
|------|--------|--------|
| `recover.ts` | ✅ KEEP | Browser restart recovery for Book Now |
| `recover-quote-acceptance.ts` | ✅ KEEP | Browser restart recovery for quotes |
| `reconcile-quote-acceptance.ts` | ✅ KEEP | Timeline reconciliation |
| `await-contract-creation.ts` | ✅ KEEP | Used by ServiceDetailsView.svelte |
| `acceptance-ledger.ts` | ✅ KEEP | Retry/reverify functionality |
| `finality.ts` | ✅ KEEP | Wait for confirmations (simplified) |

### Why Files Were Kept

The PaymentContractRune handles **in-memory** pending state, but does NOT handle:
1. **Persistence across browser sessions** - User closes browser, returns later
2. **Retry logic for failed publishes** - RPC errors, relay unavailability
3. **Reverification of uncertain acceptances** - Confirmations may be insufficient

These use cases still exist for v1 service contracts. The files will be removed when:
1. All services are migrated to use v2 creation flow
2. The v2 rune handles persistence (if needed)

### Actual Code Reduction

| Metric | Before | After | Change |
|--------|--------|-------|--------|
| Files deleted | 0 | 0 | N/A |
| Code inlined | 30 lines | 30 lines | `ambiguity-reason.ts` → `finality.ts` |
| Deprecation docs | 0 | 7 files | Added migration guidance |

---

## Conclusion

### What Was Learned

The initial audit overestimated how much code could be safely deleted. Key findings:

1. **PaymentContractRune handles in-memory state, not persistence**
   - Rune's `isPending` works during a session
   - Recovery files handle cross-session scenarios (browser restart)

2. **Local storage persistence is still needed for v1 services**
   - `acceptance-ledger.ts` stores retry/reverify state
   - Without it, failed publishes would be lost on page refresh

3. **The v2 lifecycle doesn't replace all v1 functionality**
   - v2 lifecycle is for task contracts with NDK
   - Service contracts still use v1 escrow for creation

### Actual Migration Path

Instead of deleting code, the correct approach is:

1. **Mark files as deprecated** (DONE)
2. **Add clear migration guidance** (DONE)
3. **Create v2-compatible service creation** (TODO)
4. **Test v2 service contracts** (TODO)
5. **Delete deprecated files after v2 migration** (FUTURE)

### For New Service Contracts (v2)

When implementing new service contract functionality:

```typescript
// Use PaymentContractRune instead of acceptance-ledger
const rune = new PaymentContractRune(ndkContract);
await rune.start();

// Pending state is reactive
if (rune.isPending) { /* show loading */ }

// Status comes from NDK subscription
rune.statusEventsByNewest // Kind 31006 events

// Transaction confirmation is automatic
// rune.resolvePaymentIdFromTxHash() runs on start() if needed
```

### Files Marked for Future Removal

These files will be removed after v2 service migration is complete:
- `finality.ts` - Use `provider.waitForTransaction()` directly
- `ambiguity-reason.ts` - Use standard error handling
- `acceptance-ledger.ts` - Use rune.isPending + NDK events
- `recover.ts`, `recover-quote-acceptance.ts` - NDK sync handles recovery
- `reconcile-quote-acceptance.ts` - Rune is source of truth
- `await-contract-creation.ts` - Use rune.start()
