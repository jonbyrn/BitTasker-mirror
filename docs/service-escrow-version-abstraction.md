# Service-Escrow Version Abstraction Migration Plan

**Version:** 3.0 (Revised for true version-agnosticism - no explicit version checks)
**Last Updated:** April 25, 2026

## Executive Summary

This document outlines the comprehensive plan to decouple the services module from the escrow v1 implementation, enabling services to work seamlessly with any escrow version through the **existing EscrowManager** which already implements a proper registry pattern.

**Problem Statement:** The services module (`service-contract/`, `service-quote/`, stores, and components) is tightly coupled to escrow v1. This prevents services from utilizing newer escrow versions and creates bidirectional dependencies that cause circular imports and maintenance challenges.

**Goal:** Enable services to use escrow functionality through the EscrowManager abstraction, ensuring:

1. All new service contracts automatically use the latest escrow version
2. Existing contracts continue working with their original version
3. **No explicit version checks (`if version === 'v2'`)** in service code
4. **Services remain unaware of which version they're using** - the EscrowManager handles routing

---

## Current State Analysis

### Files with Direct V1 Escrow Imports

#### Category 1: Direct `escrow/v1/` Imports (Critical) - 12 Files

| File                                                                      | Import                                                                                    | Impact                      |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | --------------------------- |
| `service-contract/preflight.ts` (L3)                                      | `ensureEscrowReady`, `calculateTotalPayment`                                              | Bypasses version routing    |
| `service-contract/recover.ts` (L7)                                        | `ensureEscrowReady`                                                                       | V1 ABI hardcoded            |
| `service-contract/recover-quote-acceptance.ts` (L9)                       | `ensureEscrowReady`                                                                       | V1 ABI hardcoded            |
| `stores/service-quote-ui.store.ts` (L56)                                  | `retryPendingServiceAcceptanceByEscrowId`                                                 | V1 event handling           |
| `components/service/DashboardServiceRequestsPanel.svelte` (L23-26)        | `retryPendingServiceAcceptanceByEscrowId`, `reverifyPublishedServiceAcceptanceByEscrowId` | V1 event handling           |
| `routes/(protected)/dashboard/+page.svelte` (L21-23)                      | `retryPendingServiceAcceptanceByEscrowId`, `reverifyPublishedServiceAcceptanceByEscrowId` | V1 event handling           |
| `wallet/loadContractsByAddress.ts` (L2)                                   | `escrow` from `../escrow/v1/escrow`                                                       | Direct v1 module import     |
| `components/contracts/DebugContractCard.svelte` (L11)                     | `escrow` from `escrow/v1/escrow`                                                          | Debug component v1 coupling |
| `routes/(protected)/dashboard/debug-smart-contract/+page.svelte` (L8, 13) | `escrow`, `EscrowStatus`                                                                  | Debug route v1 coupling     |
| `routes/e2e/service-harness.html/+page.svelte` (L8)                       | `EscrowStatus`                                                                            | E2E test page               |
| `helpers/contractPermissions.ts` (L4)                                     | `EscrowStatus`                                                                            | Business logic v1 coupling  |
| `contract/v1/legacyEscrowStatusToContractStatus.ts` (L9)                  | `EscrowStatus`                                                                            | Status mapping v1 coupling  |

#### Category 2: Hardcoded Version Strings

| File                                      | Lines                | Usage                             |
| ----------------------------------------- | -------------------- | --------------------------------- |
| `service-contract/acceptance-snapshot.ts` | 10, 47-48            | `conversionFormulaVersion = 'v1'` |
| `service-contract/book-now-outbox.ts`     | 7                    | Storage key contains `v1`         |
| `service-contract/finality.ts`            | 8                    | Finality policy version           |
| `service-quote/protocol.ts`               | 24, 543, 612-737     | Schema version validation         |
| `service-quote/accept.ts`                 | 48                   | Purchase key prefix               |
| `service-quote/publish.ts`                | 131                  | Payload version                   |
| `service-quote/notifications.ts`          | 221, 236             | Mirror payload version            |
| `stores/service-quote-ui.store.ts`        | 389, 1512            | Status payload version            |
| `types/service-quote.d.ts`                | 55, 86, 96, 122, 223 | Type definitions                  |

#### Category 3: Service Logic Embedded in Escrow V1

**In `escrow/v1/escrowEvents.ts`:**

- `isServicePendingContract` (L49-51)
- `createServiceAcceptanceReplayTarget` (L65-92)
- `resolveServiceAcceptanceReplayTarget` (L94-125)
- `persistConfirmedServiceAcceptanceMonitor` (L127-147)
- `findPendingServiceContractByTransactionHashes` (L284-300)
- `getServiceAcceptanceUnknownMessage` (L302-317)
- `publishPendingServiceAcceptanceUnknownByTxHash` (L319-386) - Exported
- `retryPendingServiceAcceptanceByEscrowId` (L399-459) - Exported
- `reverifyPublishedServiceAcceptanceByEscrowId` (L461-613) - Exported
- `handleEscrowCreated` service branches (L759-867)

**In `escrow/v1/escrow.ts`:**

- `verifyServiceEscrowCreation` (L341-370)
- `reverifyPublishedServiceAcceptance` (L372-412) - Exported
- Service path in `createEscrow` (L521-686)

#### Category 4: EscrowManager Hardcoding

**In `escrow/index.ts`:**

- `LATEST_ESCROW_VERSION = 'v1'` (L64)
- `bidOps` always imports from `v1/escrowBid` (L42-47)
- All `eventOps` methods route to v1

---

## Abstraction Architecture

### Existing Contract Lifecycle Interface

The `PaymentContractLifecycle` interface (15 methods) handles **post-creation** contract operations:

```typescript
type PaymentContractLifecycle = {
	loadPaymentContractDetails(rune, chain?): Promise<SecurePaymentLegacy>;
	computeDisplayStatus(rune): ContractDisplayStatus;
	isTerminalRuneState(rune): boolean;
	computePermittedActions(rune): PermittedActions;
	markTaskComplete(rune, completionAttachments?): Promise<ContractLifecycleResult>;
	acceptTask(rune): Promise<ContractLifecycleResult>;
	refundTasker(rune): Promise<ContractLifecycleResult>;
	cancelPaymentContract(rune): Promise<ContractLifecycleResult>;
	markNoShow(rune): Promise<ContractLifecycleResult>;
	markWorkInProgress(rune): Promise<ContractLifecycleResult>;
	claimNoShowRefund(rune): Promise<ContractLifecycleResult>;
	disputeTask(rune): Promise<ContractLifecycleResult>;
	proposeResolution(rune, taskeeAmountWei): Promise<ContractLifecycleResult>;
	acceptProposal(rune): Promise<ContractLifecycleResult>;
	resolveAfterTimelock(rune): Promise<ContractLifecycleResult>;
};
```

### Missing Capabilities for Services

The lifecycle interface does NOT cover:

1. **Contract Creation/Funding** - `createEscrow`, `calculateTotalPayment`
2. **Preflight Checks** - `ensureEscrowReady`, gas estimation
3. **Pending Contract Pipeline** - `registerPendingContractByTxHash`, stores
4. **Service Acceptance Events** - retry, reverify, acceptance ledger
5. **Contract Recovery** - ABI parsing for recovery flows

---

## Migration Strategy

### Guiding Principles

1. **Version Agnostic by Default** - Services NEVER import from `escrow/v1/` or `escrow/v2/` directly
2. **Registry Pattern, Not Conditional Checks** - No `if (version === 'v2')` chains; use EscrowManager's registry
3. **Services Stay Separate** - No service imports in contract/escrow modules
4. **EscrowManager Is The API** - Services use `escrow.escrowOps.*` which routes internally
5. **Latest Version Automatic** - New contracts use `LATEST_ESCROW_VERSION` without services knowing
6. **Backward Compatible** - Existing contracts work with their version via Nostr tag metadata

### Anti-Patterns to Avoid

- `import { ... } from '$lib/utils/escrow/v1/escrow'` - Direct version imports
- `if (version === 'v2') return v2Lifecycle` - Explicit version conditionals
- `getContractCreationLifecycle(version)` - Duplicating EscrowManager's routing
- `detectVersionFromContract(address)` - Version comes from Nostr tags, not address
- `getLatestContractVersion()` in services - Services don't need to know the version

### Phase 1: Extract Service Logic from Escrow V1

**Goal:** Move all service-specific code out of `escrow/v1/` into service modules.

#### Step 1.1: Create Service Escrow Bridge Module

Create `src/lib/utils/service-contract/escrow-bridge.ts`:

```typescript
/**
 * Bridge between service modules and versioned escrow functionality.
 * Services should ONLY import escrow capabilities through this module.
 */

// Re-export version-agnostic escrow access
export { escrow } from '$lib/utils/escrow';

// Service-specific escrow event handling (extracted from v1/escrowEvents)
export {
	publishPendingServiceAcceptanceUnknown,
	retryPendingServiceAcceptance,
	reverifyPublishedServiceAcceptance
} from './escrow-events';

// Service-specific preflight (extracted from v1/escrow)
export { preflightServiceEscrowCreation, calculateServiceTotalPayment } from './escrow-preflight';
```

#### Step 1.2: Extract Service Event Functions

Create `src/lib/utils/service-contract/escrow-events.ts`:

Move from `escrow/v1/escrowEvents.ts`:

- `isServicePendingContract`
- `createServiceAcceptanceReplayTarget`
- `resolveServiceAcceptanceReplayTarget`
- `persistConfirmedServiceAcceptanceMonitor`
- `getServiceAcceptanceUnknownMessage`
- `publishPendingServiceAcceptanceUnknownByTxHash` → `publishPendingServiceAcceptanceUnknown`
- `retryPendingServiceAcceptanceByEscrowId` → `retryPendingServiceAcceptance`
- `reverifyPublishedServiceAcceptanceByEscrowId` → `reverifyPublishedServiceAcceptance`

#### Step 1.3: Extract Service Preflight Functions

Create `src/lib/utils/service-contract/escrow-preflight.ts`:

Move/abstract from `escrow/v1/escrow.ts`:

- `verifyServiceEscrowCreation` → `verifyServiceEscrow`
- `reverifyPublishedServiceAcceptance` → `reverifyServiceAcceptance`

#### Step 1.4: Create Escrow Event Hooks in V1

Replace extracted functions in `escrow/v1/escrowEvents.ts` with hooks:

```typescript
// In handleEscrowCreated, replace service-specific code with:
if (isServiceContext(pendingContract)) {
	await onServiceEscrowCreated?.(event, pendingContract);
}
```

### Phase 2: Leverage Existing Escrow Manager (NOT Create New Abstraction)

**Goal:** Use the existing `EscrowManager` pattern - services don't need their own lifecycle abstraction.

#### Key Insight: The EscrowManager Already Provides Version-Agnostic Access

The `EscrowManager` in `src/lib/utils/escrow/index.ts` already implements a proper **registry pattern**:

```typescript
// EXISTING: Version handlers are registered, not if/else chains
const VERSION_HANDLERS: Record<string, IVersionHandler> = {
  v1: v1,
  // v2: v2,  // Just add new versions here
};

// EXISTING: Runtime lookup - no explicit version checks
private getHandler(version: string): IVersionHandler {
  if (!(version in VERSION_HANDLERS)) {
    return VERSION_HANDLERS[LATEST_ESCROW_VERSION];  // Fallback to latest
  }
  return VERSION_HANDLERS[version];
}
```

**Services should NOT need:**

- `getContractCreationLifecycle()` - this duplicates EscrowManager
- `getLatestContractVersion()` - this duplicates `LATEST_ESCROW_VERSION`
- `detectVersionFromContract()` - EscrowManager already does this via `getVersionFromContract()`
- v1Creation.ts / v2Creation.ts - the handlers are already in `escrow/v1/`, `escrow/v2/`

#### Step 2.1: Services Use EscrowManager Directly

Services should use `escrow.escrowOps.*` and `escrow.eventOps.*` which already route to the correct version:

```typescript
// CORRECT: Version-agnostic - EscrowManager routes internally
import { escrow } from '$lib/utils/escrow';

// New escrow creation always uses LATEST_ESCROW_VERSION automatically
const result = await escrow.escrowOps.createEscrow(...);

// Existing contract operations use version from contract tags
await escrow.escrowOps.loadEscrowDetails(contract);
```

#### Step 2.2: What Services Actually Need from Escrow

The functions services currently import from `escrow/v1/escrow.ts` that are NOT exposed by EscrowManager:

1. **`ensureEscrowReady()`** - Gets contract instance, wallet, provider
2. **`calculateTotalPayment()`** - Fee calculation

**Solution:** Add these to `IVersionHandler` interface and expose via EscrowManager:

```typescript
// In escrow/types.ts - extend IEscrowHandler
export interface IEscrowHandler {
	// ... existing methods ...

	/** Initialize contract, wallet, provider for chain operations */
	ensureReady(
		contractAddress?: string,
		requireBalance?: boolean
	): Promise<{
		contract: ethers.Contract;
		wallet: ethers.Wallet;
		provider: ethers.JsonRpcProvider;
	}>;

	/** Calculate total payment including platform fees */
	calculateTotalPayment(baseAmount: bigint, clientFeeTier: number): bigint;
}
```

Then in EscrowManager:

```typescript
readonly escrowOps = {
  // ... existing methods ...

  /** Ensure escrow ready - uses LATEST version for new operations */
  ensureReady: async (contractAddress?: string, requireBalance?: boolean) => {
    const handler = this.getHandler(LATEST_ESCROW_VERSION);
    return handler.escrow.ensureReady(contractAddress, requireBalance);
  },

  /** Calculate total payment - uses LATEST version */
  calculateTotalPayment: (baseAmount: bigint, clientFeeTier: number) => {
    const handler = this.getHandler(LATEST_ESCROW_VERSION);
    return handler.escrow.calculateTotalPayment(baseAmount, clientFeeTier);
  },
};
```

#### Step 2.3: Create Hooks Registry for Service Callbacks

Create `src/lib/utils/contract/lifecycle/hooks-registry.ts`:

```typescript
/**
 * Registry for escrow lifecycle hooks.
 * Allows service modules to register callbacks without creating circular dependencies.
 */

export interface EscrowCreatedHookParams {
	escrowId: string;
	transactionHash: string;
	transactionHashes?: string[];
	client: string;
	freelancer: string;
	amount: string;
	acceptanceSnapshot?: unknown;
}

export interface PendingContractContext {
	contextType: string;
	proposalId?: string;
	proposalEventId?: string;
	quoteRequestId?: string;
	serviceId?: string;
	serviceAddress?: string;
	freelancerPubkey: string;
	acceptanceSnapshot?: unknown;
}

export type EscrowCreatedHook = (
	event: EscrowCreatedHookParams,
	pendingContract: PendingContractContext
) => Promise<void>;

const hooks: {
	onServiceEscrowCreated?: EscrowCreatedHook;
} = {};

export function registerEscrowHooks(newHooks: Partial<typeof hooks>): void {
	Object.assign(hooks, newHooks);
}

export function getEscrowHooks() {
	return hooks;
}

export function isServiceContext(context: PendingContractContext): boolean {
	return context.contextType === 'service';
}
```

#### Why NOT Create Separate v1Creation.ts / v2Creation.ts

1. **Duplication:** The version handlers already exist in `escrow/v1/index.ts`, `escrow/v2/index.ts`
2. **Drift risk:** Two separate version routing systems will diverge
3. **Anti-pattern:** Adding `if (version === 'v2')` is exactly what we're trying to eliminate
4. **Already solved:** EscrowManager uses registry pattern - just extend it

### Phase 3: Update Service Module Imports

**Goal:** Replace all direct v1 imports with EscrowManager.

#### Key Principle: Services Use EscrowManager, Period

Services should **never** import from `escrow/v1/` or `escrow/v2/`. They use `escrow` (the EscrowManager singleton) which handles all version routing internally.

#### Step 3.1: Update `service-contract/preflight.ts`

```diff
- import { ensureEscrowReady, calculateTotalPayment } from '$lib/utils/escrow/v1/escrow';
+ import { escrow } from '$lib/utils/escrow';

// In preflightServiceContractCreation:
- const { contract, wallet, provider } = await ensureEscrowReady(undefined, false);
+ const { contract, wallet, provider } = await escrow.escrowOps.ensureReady(undefined, false);

- const totalPaymentWei = calculateTotalPayment(baseAmountWei, DEFAULT_CLIENT_FEE_TIER);
+ const totalPaymentWei = escrow.escrowOps.calculateTotalPayment(baseAmountWei, DEFAULT_CLIENT_FEE_TIER);
```

#### Step 3.2: Update `service-contract/recover.ts` and `recover-quote-acceptance.ts`

Recovery flows need to work with existing contracts whose version may differ from LATEST.

**Solution:** For recovery, the version comes from the **contract metadata stored in Nostr**, not from the contract address. Use EscrowManager's existing version detection:

```diff
- import { ensureEscrowReady } from '$lib/utils/escrow/v1/escrow';
+ import { escrow } from '$lib/utils/escrow';

// For recovery where we have contract metadata:
// EscrowManager.loadEscrowDetails() already routes by version from contract tags
- const { contract } = await ensureEscrowReady(undefined, false);
+ const escrowData = await escrow.escrowOps.loadEscrowDetails(contractWithEvents);

// For recovery where we only have raw contract address (edge case):
// Use EscrowManager with LATEST version - the ABI is typically backward-compatible for reads
+ const { contract, wallet, provider } = await escrow.escrowOps.ensureReady(contractAddress, false);
```

**Why NOT add `detectVersionFromContract()`:**

1. Contract addresses can be deployed for ANY version - you can't know which ABI to use from address alone
2. The version is stored in Nostr event tags (`['v', 'v2']`) - that's the source of truth
3. EscrowManager already extracts version via `getVersionFromContract()` from Nostr data
4. Adding `if (address === v2Address)` is the anti-pattern we're eliminating

#### Step 3.3: Update `service-quote-ui.store.ts`

```diff
- import { retryPendingServiceAcceptanceByEscrowId } from '$lib/utils/escrow/v1/escrowEvents';
+ import { retryPendingServiceAcceptance } from '$lib/utils/service-contract/escrow-bridge';

// Usage:
- void retryPendingServiceAcceptanceByEscrowId(escrowId);
+ void retryPendingServiceAcceptance(escrowId);
```

#### Step 3.4: Update `DashboardServiceRequestsPanel.svelte`

```diff
- import {
-   retryPendingServiceAcceptanceByEscrowId,
-   reverifyPublishedServiceAcceptanceByEscrowId
- } from '$lib/utils/escrow/v1/escrowEvents';
+ import {
+   retryPendingServiceAcceptance,
+   reverifyPublishedServiceAcceptance,
+ } from '$lib/utils/service-contract/escrow-bridge';
```

### Phase 4: Extend EscrowManager Interface

**Goal:** Add missing methods to EscrowManager that services need.

#### Key Insight: EscrowManager Already Is Version-Agnostic

The EscrowManager uses a registry pattern (`VERSION_HANDLERS`) - we just need to expose more methods through it.

#### Step 4.1: Add Missing Methods to IEscrowHandler

In `src/lib/utils/escrow/types.ts`:

```typescript
export interface IEscrowHandler {
	// ... existing methods ...

	/** Initialize contract, wallet, provider for chain operations */
	ensureReady(
		contractAddress?: string,
		requireBalance?: boolean
	): Promise<{
		contract: ethers.Contract;
		wallet: ethers.Wallet;
		provider: ethers.JsonRpcProvider;
	}>;

	/** Calculate total payment including platform fees */
	calculateTotalPayment(baseAmount: bigint, clientFeeTier: number): bigint;
}
```

#### Step 4.2: Expose Methods via EscrowManager

In `src/lib/utils/escrow/index.ts`, add to `escrowOps`:

```typescript
readonly escrowOps = {
  // ... existing methods ...

  /**
   * Ensure escrow ready for operations
   * Uses LATEST version for new operations
   */
  ensureReady: async (contractAddress?: string, requireBalance?: boolean) => {
    const handler = this.getHandler(LATEST_ESCROW_VERSION);
    return handler.escrow.ensureReady(contractAddress, requireBalance);
  },

  /**
   * Calculate total payment including fees
   * Uses LATEST version (fee structures may differ by version)
   */
  calculateTotalPayment: (baseAmount: bigint, clientFeeTier: number) => {
    const handler = this.getHandler(LATEST_ESCROW_VERSION);
    return handler.escrow.calculateTotalPayment(baseAmount, clientFeeTier);
  },
};
```

#### Step 4.3: Move Utility Functions to Version-Agnostic Module

These utilities are NOT version-specific - move them out of `v1/`:

```diff
- // In escrow/index.ts
- import {
-   formatRBTCAmount,
-   getFeePercentageDisplay,
-   validateEscrowDetails,
-   validateSufficientBalance
- } from './v1/escrowBid';

+ // Create: src/lib/utils/contract/escrow-utilities.ts
+ // Move these pure functions there (they don't depend on contract version)
+ import {
+   formatRBTCAmount,
+   getFeePercentageDisplay,
+   validateEscrowDetails,
+   validateSufficientBalance
+ } from '$lib/utils/contract/escrow-utilities';
```

### Phase 5: Handle Protocol Versions

**Goal:** Separate protocol versioning from escrow versioning.

#### Key Insight

The `version: 'v1'` in service-quote types is a **Nostr protocol version**, not an escrow version. These should remain as protocol identifiers but be decoupled from escrow versioning.

#### Step 5.1: Additive Approach (DO NOT Rename)

**IMPORTANT:** Do NOT rename `version` to `protocolVersion` as this would break existing Nostr events. Instead, use an **additive approach**:

```typescript
interface ServiceProposalStatusContent {
	// ...
	version: 'v1'; // Keep existing field for backward compatibility
	escrowVersion?: string; // NEW: Add optional escrow version field
}
```

#### Step 5.2: Add Escrow Version Where Needed

When publishing acceptance status, include escrow version from EscrowManager:

```typescript
import { LATEST_ESCROW_VERSION } from '$lib/utils/escrow';

content: {
  type: SERVICE_QUOTE_MESSAGE_TYPES.STATUS,
  version: 'v1',  // Nostr protocol version (keep as-is)
  escrowVersion: LATEST_ESCROW_VERSION,  // NEW: Actual escrow version used
  // ...
}
```

**Note:** Services should import `LATEST_ESCROW_VERSION` from EscrowManager when they need to record which version was used. This is acceptable because:

1. It's a constant, not a function call
2. Services don't use it to route behavior - just to tag data
3. The tag is informational for debugging/recovery

#### Step 5.3: Update Acceptance Ledger

Add escrow version tracking to acceptance ledger entries:

```typescript
interface ServiceAcceptanceLedgerEntry {
	// existing fields...
	escrowVersion?: string; // NEW: Track which escrow version was used
}
```

---

## File Changes Summary

### New Files

| File                                   | Purpose                                                             |
| -------------------------------------- | ------------------------------------------------------------------- |
| `service-contract/escrow-bridge.ts`    | Central bridge for service-escrow interaction (calls EscrowManager) |
| `service-contract/escrow-events.ts`    | Service-specific escrow event handling                              |
| `service-contract/escrow-preflight.ts` | Service-specific preflight and verification                         |
| `contract/lifecycle/hooks-registry.ts` | Hook registration for cross-module callbacks                        |
| `contract/escrow-utilities.ts`         | Version-agnostic escrow utilities (moved from v1/)                  |

**NOT Creating (per version-agnostic principle):**

- ~~`contract/lifecycle/v1Creation.ts`~~ - Use existing `escrow/v1/` via EscrowManager
- ~~`contract/lifecycle/v2Creation.ts`~~ - Use existing `escrow/v2/` via EscrowManager
- ~~`getContractCreationLifecycle()`~~ - Services use `escrow.escrowOps.*` directly
- ~~`detectVersionFromContract()`~~ - Use EscrowManager's `getVersionFromContract()`

### Modified Files

| File                                                      | Changes                                                                 |
| --------------------------------------------------------- | ----------------------------------------------------------------------- |
| `service-contract/preflight.ts`                           | Import `escrow` from EscrowManager                                      |
| `service-contract/recover.ts`                             | Import `escrow` from EscrowManager                                      |
| `service-contract/recover-quote-acceptance.ts`            | Import `escrow` from EscrowManager                                      |
| `stores/service-quote-ui.store.ts`                        | Import from escrow-bridge                                               |
| `components/service/DashboardServiceRequestsPanel.svelte` | Import from escrow-bridge                                               |
| `routes/(protected)/dashboard/+page.svelte`               | Import from escrow-bridge                                               |
| `wallet/loadContractsByAddress.ts`                        | Import from escrow manager                                              |
| `helpers/contractPermissions.ts`                          | Import EscrowStatus from types                                          |
| `escrow/v1/escrowEvents.ts`                               | Remove service code, use hooks                                          |
| `escrow/v1/escrow.ts`                                     | Remove service code, expose `ensureReady()` / `calculateTotalPayment()` |
| `escrow/index.ts`                                         | Add `ensureReady()` / `calculateTotalPayment()` to escrowOps            |
| `escrow/types.ts`                                         | Add `ensureReady()` / `calculateTotalPayment()` to IEscrowHandler       |
| `types/service-quote.d.ts`                                | Add optional escrowVersion field                                        |

### Test Files to Update (17 files)

| File                                         | Changes                                |
| -------------------------------------------- | -------------------------------------- |
| `escrowBid.test.ts`                          | Update v1 imports to use EscrowManager |
| `escrowEvents.test.ts`                       | Update v1 imports, use hooks           |
| `feeCalculations.test.ts`                    | Update v1 imports                      |
| `contractPermissions.test.ts`                | Update EscrowStatus import             |
| `legacyEscrowStatusToContractStatus.test.ts` | Update EscrowStatus import             |
| `loadContractsByAddress.test.ts`             | Update v1 imports                      |
| `service-quote-ui.store.test.ts`             | Update v1 imports                      |
| `escrow.test.ts` (components)                | Update v1 imports                      |
| `escrow-two-party.integration.test.ts`       | Update v1 imports                      |
| `escrow-event-flow.integration.test.ts`      | Update v1 imports                      |
| `escrow-lifecycle.integration.test.ts`       | Update v1 imports                      |
| `escrow-dispute.integration.test.ts`         | Update v1 imports                      |
| `escrow-bid-acceptance.integration.test.ts`  | Update v1 imports                      |
| `escrow-permissions.integration.test.ts`     | Update v1 imports                      |
| Plus 3 more unit test files                  | Various v1 import updates              |

### Debug/E2E Files to Update

| File                                | Changes                    |
| ----------------------------------- | -------------------------- |
| `debug-smart-contract/+page.svelte` | Update v1 imports          |
| `service-harness.html/+page.svelte` | Update EscrowStatus import |
| `DebugContractCard.svelte`          | Update v1 imports          |

### Deprecated (Future Removal)

After migration:

- Direct imports from `escrow/v1/*` in service modules
- Service-specific functions in `escrow/v1/*` that belong in service modules

**NOT Changing:**

- `LATEST_ESCROW_VERSION` constant - this is properly used by EscrowManager
- Version handlers in `escrow/v1/`, `escrow/v2/` - these are the source of truth

---

## Testing Strategy

### Unit Tests

1. Test `escrow-bridge.ts` correctly calls EscrowManager
2. Test `escrow.escrowOps.ensureReady()` initializes contract properly
3. Test `escrow.escrowOps.calculateTotalPayment()` returns correct fees
4. Test extracted service functions work identically to original
5. Test protocol version vs escrow version separation

### Integration Tests

1. Service contract creation (uses LATEST version automatically)
2. Recovery flows (version from Nostr contract metadata)
3. Acceptance retry/reverify (version-aware via EscrowManager)

### Regression Tests

1. Existing service contracts continue to work
2. Dashboard displays correct for all versions
3. Acceptance ledger compatibility

---

## Migration Order

**IMPORTANT:** Phase 4 must be completed before Phase 3 to ensure the abstraction layer is ready before service modules start using it.

1. **Phase 1** - Extract service logic (no breaking changes)
2. **Phase 2** - Extend abstraction layer (additive only)
3. **Phase 4** - Update EscrowManager (make version-agnostic) - MOVED UP
4. **Phase 3** - Update service imports (use new abstraction) - MOVED DOWN
5. **Phase 5** - Handle protocol versions (additive approach - keep `version`, add `escrowVersion`)
6. **Phase 6** - Update test files (17 files need v1 import updates)
7. **Phase 7** - Update debug and E2E routes

Each phase can be merged independently. Backward compatibility maintained throughout.

### Phase 6: Test File Migration (17 files)

**Unit Tests to Update:**

- `escrowBid.test.ts` - Update v1 imports
- `escrowEvents.test.ts` - Update v1 imports
- `feeCalculations.test.ts` - Update v1 imports
- `escrow-create-ambiguity.test.ts` - Update v1 imports
- `index.test.ts` (escrow) - Update v1 imports
- `contractPermissions.test.ts` - Update EscrowStatus import
- `legacyEscrowStatusToContractStatus.test.ts` - Update EscrowStatus import
- `loadContractsByAddress.test.ts` - Update v1 imports
- `preflight.test.ts` - Update v1 imports
- `recover-quote-acceptance.test.ts` - Update v1 imports
- `service-quote-ui.store.test.ts` - Update v1 imports
- `escrow.test.ts` (components) - Update v1 imports

**Integration Tests to Update:**

- `escrow-two-party.integration.test.ts`
- `escrow-event-flow.integration.test.ts`
- `escrow-lifecycle.integration.test.ts`
- `escrow-dispute.integration.test.ts`
- `escrow-bid-acceptance.integration.test.ts`
- `escrow-permissions.integration.test.ts`

### Phase 7: Debug and E2E Routes

Update debug and E2E test pages:

- `routes/(protected)/dashboard/debug-smart-contract/+page.svelte`
- `routes/e2e/service-harness.html/+page.svelte`
- `components/contracts/DebugContractCard.svelte`

---

## Success Criteria

- [ ] No direct `escrow/v1/` imports in service modules
- [ ] No hardcoded version strings in service escrow-related code
- [ ] EscrowManager's `LATEST_ESCROW_VERSION` controls new contract version
- [ ] Services work with any escrow version via EscrowManager
- [ ] No `if (version === 'vN')` conditionals in service code
- [ ] No circular dependencies between service and escrow modules
- [ ] All existing tests pass
- [ ] New contracts automatically use latest version

---

## Risks and Mitigations

| Risk                        | Mitigation                                                                          |
| --------------------------- | ----------------------------------------------------------------------------------- |
| Breaking existing contracts | Maintain backward compatibility through version detection; default to v1 for legacy |
| Circular dependencies       | Use dependency injection, hooks registry, and lazy imports                          |
| Performance regression      | Minimize abstraction overhead, benchmark critical paths                             |
| Missing functionality       | Comprehensive audit of all escrow touchpoints (completed - 12 files, 17 tests)      |
| Protocol version confusion  | Keep `version` field, add separate `escrowVersion` field (additive approach)        |
| Wrong ABI in recovery       | Use version tag from Nostr contract event; fallback to LATEST for reads             |
| Hooks timing issues         | Use async hooks with proper error handling                                          |
| Duplicate version routing   | Integrate `ContractCreationLifecycle` into `IVersionHandler` interface              |

## Architectural Decisions

### AD-1: Hooks Registry Pattern

**Decision:** Use a centralized hooks registry instead of direct imports to break circular dependencies.

**Rationale:** Service modules need to react to escrow events, but escrow modules should not import service code. The hooks registry allows registration of callbacks without coupling.

**Implementation:** `contract/lifecycle/hooks-registry.ts` provides `registerEscrowHooks()` and `getEscrowHooks()`.

### AD-2: Additive Protocol Versioning

**Decision:** Keep existing `version: 'v1'` field in Nostr events, add optional `escrowVersion` field.

**Rationale:** Renaming `version` to `protocolVersion` would break backward compatibility with existing events. Adding `escrowVersion` as optional allows gradual adoption.

### AD-3: Version Detection from Nostr Metadata (NOT Address)

**Decision:** Use version tag from Nostr contract event (`['v', 'v2']`) as source of truth, NOT contract address.

**Rationale:**

1. Contract addresses can be deployed for ANY version - address doesn't determine ABI
2. Nostr events contain explicit version tags set at creation time
3. EscrowManager's `getVersionFromContract()` already extracts version from Nostr data
4. Avoids `if (address === v2Address)` anti-pattern that doesn't scale to Vn

### AD-4: Integration with EscrowManager

**Decision:** Integrate `ContractCreationLifecycle` into the existing `IVersionHandler` interface rather than creating parallel routing.

**Rationale:** Avoids two different version routing mechanisms that could drift apart.

---

## Appendix: Complete Coupling Inventory

### Direct V1 Imports - Production Files (12 locations)

1. `service-contract/preflight.ts:3` - `ensureEscrowReady`, `calculateTotalPayment`
2. `service-contract/recover.ts:7` - `ensureEscrowReady`
3. `service-contract/recover-quote-acceptance.ts:9` - `ensureEscrowReady`
4. `stores/service-quote-ui.store.ts:56` - `retryPendingServiceAcceptanceByEscrowId`
5. `components/service/DashboardServiceRequestsPanel.svelte:23-26` - retry/reverify functions
6. `routes/(protected)/dashboard/+page.svelte:21-23` - retry/reverify functions
7. `wallet/loadContractsByAddress.ts:2` - `escrow` from v1/escrow
8. `components/contracts/DebugContractCard.svelte:11` - `escrow` from v1/escrow
9. `routes/(protected)/dashboard/debug-smart-contract/+page.svelte:8,13` - `escrow`, `EscrowStatus`
10. `routes/e2e/service-harness.html/+page.svelte:8` - `EscrowStatus`
11. `helpers/contractPermissions.ts:4` - `EscrowStatus`
12. `contract/v1/legacyEscrowStatusToContractStatus.ts:9` - `EscrowStatus`

### Direct V1 Imports - Test Files (17 locations)

**Unit Tests:**

1. `escrowBid.test.ts:85-91`
2. `escrowEvents.test.ts:19-20`
3. `feeCalculations.test.ts:16`
4. `contractPermissions.test.ts:2`
5. `legacyEscrowStatusToContractStatus.test.ts:2`
6. `loadContractsByAddress.test.ts:16`
7. `escrow.test.ts:3,192`
8. `index.test.ts` (escrow)

**Integration Tests:** 9. `escrow-two-party.integration.test.ts:243-244` 10. `escrow-event-flow.integration.test.ts:208-209` 11. `escrow-lifecycle.integration.test.ts:256-258` 12. `escrow-dispute.integration.test.ts:167-168` 13. `escrow-bid-acceptance.integration.test.ts:142` 14. `escrow-permissions.integration.test.ts:2` 15. `escrow-state-transitions.integration.test.ts` 16. Plus 2 additional test files

### Service Functions in Escrow V1 (13 functions)

**escrowEvents.ts:**

1. `isServicePendingContract`
2. `createServiceAcceptanceReplayTarget`
3. `resolveServiceAcceptanceReplayTarget`
4. `persistConfirmedServiceAcceptanceMonitor`
5. `findPendingServiceContractByTransactionHashes`
6. `getServiceAcceptanceUnknownMessage`
7. `publishPendingServiceAcceptanceUnknownByTxHash`
8. `retryPendingServiceAcceptanceByEscrowId`
9. `reverifyPublishedServiceAcceptanceByEscrowId`
10. `configureServiceAcceptanceReverifyForTest`

**escrow.ts:** 11. `verifyServiceEscrowCreation` 12. `reverifyPublishedServiceAcceptance` 13. Service branches in `createEscrow`

### Hardcoded Version Strings (21 locations)

See "Category 2: Hardcoded Version Strings" in Current State Analysis.
