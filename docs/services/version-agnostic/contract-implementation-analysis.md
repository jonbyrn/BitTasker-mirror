# Contract Implementation Analysis

**Author:** Technical Analysis  
**Last Updated:** April 26, 2026  
**Purpose:** Deep-dive analysis of the contract implementation to understand the architecture, dependencies, and component duplication patterns.

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Architecture Overview](#architecture-overview)
3. [The Two Implementations](#the-two-implementations)
   - [Escrow Implementation (Original)](#escrow-implementation-original)
   - [Contract Implementation (New)](#contract-implementation-new)
4. [Version Abstraction Strategy](#version-abstraction-strategy)
5. [Dependency Analysis](#dependency-analysis)
6. [Component Duplication Explained](#component-duplication-explained)
7. [Key Data Structures](#key-data-structures)
8. [File Reference Guide](#file-reference-guide)
9. [Recommendations](#recommendations)

---

## Executive Summary

BitTasker has **two parallel implementations** for handling blockchain escrow payments:

| Aspect                | Escrow Implementation                 | Contract Implementation                                 |
| --------------------- | ------------------------------------- | ------------------------------------------------------- |
| **Location**          | `src/lib/utils/escrow/`               | `src/lib/utils/contract/`                               |
| **Data Model**        | `ContractWithEvents` from stores      | `PaymentContractRune` (Svelte 5 runes)                  |
| **Nostr Events**      | Legacy JSON content in Kind 30006     | NDK classes (`NDKPaymentContract`, `NDKContractStatus`) |
| **Version Strategy**  | `EscrowManager` with registry pattern | `PaymentContractLifecycle` interface                    |
| **Component Pattern** | Original components + stores          | NDK-suffixed components + runes                         |

**Key Finding:** The contract implementation **IS** dependent on the escrow implementation. The contract implementation adds a **new abstraction layer** (lifecycle interface + NDK classes) on top of the escrow implementation, but does NOT replace it entirely.

---

## Architecture Overview

### High-Level Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           USER INTERFACE LAYER                               │
├─────────────────────────────────────────────────────────────────────────────┤
│  Original Components           │  NDK Components (New)                       │
│  ─────────────────────────     │  ──────────────────────                     │
│  ContractCard.svelte           │  ContractCardNDK.svelte                     │
│  ContractDrawer.svelte         │  ContractDrawerNDK.svelte                   │
│  ContractActions.svelte        │  ContractActionsNDK.svelte                  │
│  DashboardContractsPanel       │  DashboardContractsPanelNDK                 │
│  BidAcceptanceForm.svelte      │  BidAcceptanceFormV2.svelte                 │
│         ↓                      │         ↓                                   │
│  Uses: contractStore           │  Uses: PaymentContractRune                  │
│  Data: ContractWithEvents      │  Data: NDKPaymentContract + blockchainData  │
└─────────────────────────────────────────────────────────────────────────────┘
                                      ↓
┌─────────────────────────────────────────────────────────────────────────────┐
│                         STATE MANAGEMENT LAYER                               │
├─────────────────────────────────────────────────────────────────────────────┤
│  contractStore (Svelte Store)  │  PaymentContractRune (Svelte 5 Rune)        │
│  ─────────────────────────     │  ──────────────────────────────────         │
│  - Writable<ContractStoreState>│  - $state(), $derived() reactivity          │
│  - loadContracts()             │  - start(), setupSubscription()             │
│  - loadMoreContracts()         │  - lifecycle.markTaskComplete()             │
│  - Uses escrow.contractOps     │  - Uses getPaymentContractLifecycle()       │
└─────────────────────────────────────────────────────────────────────────────┘
                                      ↓
┌─────────────────────────────────────────────────────────────────────────────┐
│                      ABSTRACTION / LIFECYCLE LAYER                           │
├─────────────────────────────────────────────────────────────────────────────┤
│  EscrowManager                 │  PaymentContractLifecycle                   │
│  (escrow/index.ts)             │  (contract/lifecycle/index.ts)              │
│  ─────────────────────────     │  ──────────────────────────────────         │
│  - VERSION_HANDLERS registry   │  - getPaymentContractLifecycle(version)     │
│  - getHandler(version)         │  - v1Lifecycle / v2Lifecycle                │
│  - escrowOps, bidOps,          │  - 15 methods per lifecycle                 │
│    contractOps, eventOps       │  - Version-specific implementations         │
└─────────────────────────────────────────────────────────────────────────────┘
                                      ↓
┌─────────────────────────────────────────────────────────────────────────────┐
│                    VERSION-SPECIFIC IMPLEMENTATION LAYER                     │
├─────────────────────────────────────────────────────────────────────────────┤
│  escrow/v1/                    │  contract/v1/         │  contract/v2/       │
│  ──────────                    │  ────────────         │  ────────────       │
│  - escrow.ts                   │  - blockchainWrites   │  - blockchainWrites │
│  - escrowEvents.ts             │  - permittedActions   │  - permittedActions │
│  - escrowBid.ts                │  - effectiveState     │  - creation.ts      │
│  - nostrContract.ts            │  - calculateBaseAmt   │  - loadDetails      │
│  - abi.json                    │  - abi.json           │  - abi.json         │
└─────────────────────────────────────────────────────────────────────────────┘
                                      ↓
┌─────────────────────────────────────────────────────────────────────────────┐
│                         BLOCKCHAIN LAYER (RGB)                               │
├─────────────────────────────────────────────────────────────────────────────┤
│  V1 Smart Contract             │  V2 Smart Contract (SecurePayment)          │
│  (EscrowContract)              │  ────────────────────────────────           │
│  ─────────────────             │  - New states: NoShow, WorkInProgress, etc  │
│  - States: 0-7                 │  - States: 0-11                             │
│  - createEscrow()              │  - createPaymentContract()                  │
│  - completeTask()              │  - markNoShow(), markWorkInProgress()       │
│  - acceptTask()                │  - claimNoShowRefund()                      │
│  - disputeTask()               │  - Gas reimbursement built-in               │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## The Two Implementations

### Escrow Implementation (Original)

**Location:** `src/lib/utils/escrow/`

**Purpose:** Original implementation tightly coupled to v1 smart contract. Uses traditional Svelte stores and aims to be version-agnostic through `EscrowManager`.

**Structure:**

```
src/lib/utils/escrow/
├── index.ts              # EscrowManager singleton (700 lines)
├── types.ts              # IVersionHandler, IEscrowHandler interfaces
└── v1/
    ├── index.ts          # Re-exports v1 handlers
    ├── escrow.ts         # Core escrow operations (createEscrow, completeTask, etc.)
    ├── escrow.enum.ts    # EscrowStatus enum (0-7 states)
    ├── escrowBid.ts      # Bid acceptance and fee calculations
    ├── escrowEvents.ts   # Pending contract tracking, event handling
    ├── nostrContract.ts  # Nostr event publishing (Kind 30006, 31006)
    └── abi.json          # V1 EscrowContract ABI
```

**Key Characteristics:**

1. **EscrowManager Pattern**: Central singleton that routes operations to version-specific handlers
2. **Registry-Based Routing**: `VERSION_HANDLERS` map routes by version string
3. **Operations Grouped by Concern**: `escrowOps`, `bidOps`, `contractOps`, `eventOps`
4. **ContractWithEvents Data Model**: Used by contractStore and original components

**EscrowManager API:**

```typescript
// Create new escrow (always uses LATEST version)
escrow.escrowOps.createEscrow(...)

// Version-aware operations (extracts version from contract tags)
escrow.escrowOps.completeTask(contract)
escrow.escrowOps.acceptTask(contract)
escrow.escrowOps.disputeTask(contract)
```

**Limitations Identified:**

- V2 handler not yet implemented in registry
- Service-specific logic embedded in escrow v1 (tight coupling)
- Direct v1 imports throughout codebase (12+ production files)

---

### Contract Implementation (New)

**Location:** `src/lib/utils/contract/`

**Purpose:** New abstraction layer designed for true version-agnosticism using the `PaymentContractLifecycle` interface. Works with NDK classes and Svelte 5 runes.

**Structure:**

```
src/lib/utils/contract/
├── index.ts                    # getWallet, getProvider, initContract
├── types.ts                    # ContractStatus enum (0-11), SecurePaymentLegacy
├── lifecycle/
│   ├── index.ts                # getPaymentContractLifecycle(version)
│   ├── types.ts                # PaymentContractLifecycle interface (15 methods)
│   ├── v1.ts                   # v1Lifecycle implementation (687 lines)
│   ├── v2.ts                   # v2Lifecycle implementation (947 lines)
│   ├── v1Preflight.ts          # V1-specific preflight checks
│   ├── v2Preflight.ts          # V2-specific preflight checks
│   ├── writeHelpers.ts         # Shared: broadcastThenParallelEffects
│   ├── time.ts                 # Time utilities for permissions
│   └── displayFundedInProgress.ts  # Display status computation
├── v1/
│   ├── index.ts                # V1 exports
│   ├── blockchainWrites.ts     # V1 chain write operations
│   ├── permittedActions.ts     # V1 permission computation
│   ├── effectiveContractState.ts # V1 state derivation
│   ├── calculateBaseAmount.ts  # V1 fee calculation
│   ├── legacyEscrowStatusToContractStatus.ts
│   ├── types.ts
│   └── abi.json                # V1 ABI
└── v2/
    ├── index.ts                # V2 exports
    ├── blockchainWrites.ts     # V2 chain write operations (with gas relay)
    ├── permittedActions.ts     # V2 permission computation (more states)
    ├── creation.ts             # V2 contract creation helpers
    ├── contractAddress.ts      # V2 contract address getter
    ├── loadPaymentContractDetailsV2.ts
    ├── createPaymentContractParams.ts
    ├── disputeProjectionFromStatus.ts
    ├── types.ts
    └── abi.json                # V2 SecurePayment ABI
```

**Key Characteristics:**

1. **Lifecycle Interface Pattern:**

```typescript
type PaymentContractLifecycle = {
	loadPaymentContractDetails(rune, chain?): Promise<SecurePaymentLegacy>;
	computeDisplayStatus(rune): ContractDisplayStatus;
	isTerminalRuneState(rune): boolean;
	computePermittedActions(rune): PermittedActions;
	markTaskComplete(rune, attachments?): Promise<ContractLifecycleResult>;
	acceptTask(rune): Promise<ContractLifecycleResult>;
	refundTasker(rune): Promise<ContractLifecycleResult>;
	cancelPaymentContract(rune): Promise<ContractLifecycleResult>;
	markNoShow(rune): Promise<ContractLifecycleResult>; // V2 only
	markWorkInProgress(rune): Promise<ContractLifecycleResult>; // V2 only
	claimNoShowRefund(rune): Promise<ContractLifecycleResult>; // V2 only
	disputeTask(rune): Promise<ContractLifecycleResult>;
	proposeResolution(rune, taskeeAmountWei): Promise<ContractLifecycleResult>;
	acceptProposal(rune): Promise<ContractLifecycleResult>;
	resolveAfterTimelock(rune): Promise<ContractLifecycleResult>;
};
```

2. **Version Selection:**

```typescript
// contract/lifecycle/index.ts
export function getPaymentContractLifecycle(version: string): PaymentContractLifecycle {
	if (version === 'v2') return v2Lifecycle;
	return v1Lifecycle;
}
```

3. **PaymentContractRune (Svelte 5):**

```typescript
// runes/contractRune.svelte.ts
export class PaymentContractRune implements PaymentContractRuneLike {
  contract!: NDKPaymentContract;
  version: string;
  lifecycle: PaymentContractLifecycle;
  isPending = $state(false);
  blockchainData = $state<SecurePaymentLegacy | null>(null);
  blockchainStatus = $derived<ContractStatus>(...);
  displayStatus = $derived.by(() => this.lifecycle.computeDisplayStatus(this));
  permittedActions = $derived.by(() => this.lifecycle.computePermittedActions(this));
  // ... methods delegate to lifecycle
}
```

4. **NDK Classes for Nostr:**

```typescript
// nostr/events/contract.ts
export class NDKPaymentContract extends NDKEvent {
	static kind = 30006;
	// Tag-based getters/setters (paymentId, taskId, amount, etc.)
	// Encrypts non-public tags before publish
}

// nostr/events/contractStatus.ts
export class NDKContractStatus extends NDKEvent {
	static kind = 31006;
	// Status update event class
}
```

---

## Version Abstraction Strategy

### How Version Detection Works

1. **From Nostr Event Tags:**

   - The version is stored in the `v` tag: `['v', 'v1']` or `['v', 'v2']`
   - Legacy events with `['v', '0.0.1']` are treated as v1

2. **For New Contracts:**

   - Always use `LATEST_ESCROW_VERSION` (currently `'v1'`)
   - The version is set when the Kind 30006 event is published

3. **For Existing Contracts:**
   - Version is extracted from the contract's Nostr event tags
   - Used to select the appropriate lifecycle implementation

### V1 vs V2 Smart Contract Differences

| Feature               | V1 (EscrowContract)       | V2 (SecurePayment)                                            |
| --------------------- | ------------------------- | ------------------------------------------------------------- |
| **States**            | 0-7                       | 0-11                                                          |
| **No-Show Handling**  | Not supported             | `markNoShow()`, `markWorkInProgress()`, `claimNoShowRefund()` |
| **Work In Progress**  | Not a distinct state      | State 10                                                      |
| **Dispute from WIP**  | N/A                       | State 11 (InDisputeWorkInProgress)                            |
| **Gas Reimbursement** | Manual                    | Built-in (`GAS_REIMBURSEMENT_PER_OP`)                         |
| **Proposal Numbers**  | Not tracked on-chain      | Tracked (max 4 proposals)                                     |
| **Fee Structure**     | Client + Freelancer tiers | Similar with gas reserve                                      |

### ContractStatus Enum (Unified)

```typescript
// contract/types.ts
export enum ContractStatus {
	// Blockchain states (0-11)
	Funded = 0,
	InDispute = 1,
	DisputeResolved = 2,
	DisputeUnresolved = 3,
	Completed = 4,
	Cancelled = 5,
	Refunded = 6,
	FundsReleased = 7,
	FundsClaimed = 8,
	NoShow = 9, // V2 only
	WorkInProgress = 10, // V2 only
	InDisputeWorkInProgress = 11 // V2 only
}

export enum DisplayOnlyStatus {
	InProgress = 13, // Nostr-only (work started, not chain state)
	DisputeResolutionProposed = 12 // Proposal exists (Nostr-only)
}
```

---

## Dependency Analysis

### Is Contract Implementation Dependent on Escrow Implementation?

**YES, partially.** Here's the dependency breakdown:

#### Direct Dependencies from Contract to Escrow

1. **EscrowStatus Enum:**

   ```typescript
   // contract.d.ts imports from escrow
   import type { EscrowStatus } from '$lib/utils/escrow';
   ```

2. **contractStore uses EscrowManager:**

   ```typescript
   // stores/contract.store.ts
   import { escrow } from '$lib/utils/escrow';

   // Uses escrow.contractOps for:
   await escrow.contractOps.getContracts({ limit: CONTRACTS_LIMIT });
   await escrow.contractOps.handleStatusEvent(event);
   escrow.contractOps.handleContractEvent;
   ```

3. **Shared ABI Structure:**
   - Both `escrow/v1/abi.json` and `contract/v1/abi.json` exist
   - Contract v1 uses `initContract()` from `contract/index.ts`

#### What Contract Implementation Adds (Not in Escrow)

1. **PaymentContractLifecycle Interface** - 15 standardized methods
2. **PaymentContractRune** - Svelte 5 reactive state management
3. **NDK Classes** - `NDKPaymentContract`, `NDKContractStatus`
4. **V2 Blockchain Operations** - Full v2 smart contract support
5. **Preflight Checks** - `v1Preflight.ts`, `v2Preflight.ts`
6. **Write Helpers** - `broadcastThenParallelEffects()`
7. **Display Status Logic** - `applyFundedStartedInProgressDisplay()`

#### What Still Lives in Escrow Only

1. **EscrowManager Singleton** - Central routing for legacy code
2. **Bid Operations** - `escrowBid.ts` (acceptBidAndCreateEscrow)
3. **Event Pipeline** - `escrowEvents.ts` (pending contract tracking)
4. **V1 Escrow Creation** - `createEscrow()` function
5. **Fee Calculations** - `calculateBidEscrowDetails()`

---

## Component Duplication Explained

### Why Do We Have Duplicate Components?

The component duplication follows a clear pattern: **Original components use the store-based model (`ContractWithEvents`), while NDK/V2 components use the rune-based model (`PaymentContractRune`).**

### Component Mapping

| Original                         | NDK/V2 Version                      | Why Duplicated                                 |
| -------------------------------- | ----------------------------------- | ---------------------------------------------- |
| `ContractCard.svelte`            | `ContractCardNDK.svelte`            | Different data model: store vs rune            |
| `ContractDrawer.svelte`          | `ContractDrawerNDK.svelte`          | Drawer orchestration with rune lifecycle       |
| `ContractActions.svelte`         | `ContractActionsNDK.svelte`         | Actions call lifecycle methods on rune         |
| `DashboardContractsPanel.svelte` | `DashboardContractsPanelNDK.svelte` | Panel uses different contract loading strategy |
| `ContractTimeline.svelte`        | `ContractTimelineNDK.svelte`        | Timeline derives from rune status              |
| `TaskCompletionModal.svelte`     | `TaskCompletionModalNDK.svelte`     | Modal calls rune.markTaskComplete()            |
| `BidAcceptanceForm.svelte`       | `BidAcceptanceFormV2.svelte`        | V2 uses different contract creation flow       |

### Detailed Comparison: BidAcceptanceForm vs BidAcceptanceFormV2

**BidAcceptanceForm.svelte (Original):**

- Uses `escrow.escrowOps.createEscrow()`
- Creates V1 escrow contract
- Stores pending contract via `escrow.eventOps.registerPendingContractByTxHash()`
- Data model: `BidEscrowDetails` → `ContractWithEvents`

**BidAcceptanceFormV2.svelte (New):**

- Uses `createPaymentContract()` from `contract/v2/blockchainWrites.ts`
- Creates V2 SecurePayment contract
- Creates `NDKPaymentContract` event
- Uses `createPaymentContractParams()` for parameter preparation
- Data model: Bid → `NDKPaymentContract` → `PaymentContractRune`

### Why Not Just Modify Original Components?

1. **Breaking Changes Risk** - Original components work with existing V1 contracts
2. **Different Reactivity Model** - Svelte stores vs Svelte 5 runes
3. **Parallel Development** - Both systems need to work simultaneously
4. **Gradual Migration** - Can switch users to NDK components incrementally
5. **Testing Isolation** - Can test new flow without affecting production

---

## Key Data Structures

### ContractWithEvents (Original Model)

```typescript
// types/contract.d.ts
interface ContractWithEvents {
	contractEvent: ContractEvent; // Kind 30006 with statusEvents attached
	statusEvents: ContractStatusEvent[]; // Kind 31006 events
	isClient: boolean; // Is viewer the tasker?

	// Blockchain state (source of truth)
	blockchainStatus: EscrowStatus | null;
	escrowData: EscrowData;
	status: EscrowStatus; // Unified status
	isPending: boolean;

	// Permissions
	permissions: ContractPermissions;

	// Computed data
	disputeProposal: DisputeProposal | null;
	completionAttachments: Attachment[] | null;
}
```

### PaymentContractRuneLike (New Model)

```typescript
// contract/lifecycle/types.ts
type PaymentContractRuneLike = {
	contract: NDKPaymentContract;
	paymentId: string | undefined;
	version: string;
	isPending: boolean;
	blockchainData: SecurePaymentLegacy | null;
	readonly isTasker: boolean;
	contractAddress: string;
	parentEventId: string;
	taskerPubkey: string | undefined;
	taskTitle: string;
	task: NDKTask | null;
	readonly statusEventsByNewest: NDKContractStatus[];
	readonly completionAttachments: Attachment[];
};
```

### SecurePaymentLegacy (Unified Blockchain Data)

```typescript
// contract/types.ts
type SecurePaymentLegacy = {
	tasker: string;
	taskee: string;
	amount: string;
	estimatedStartTime: number;
	estimatedCompletionTime: number;
	timelockEnd: number;
	createdAt: number;
	taskerFeeTier: number;
	taskeeFeeTier: number;
	state: number; // ContractStatus enum value
	noShowMarked: boolean; // V2 only
};
```

---

## File Reference Guide

### Core Files by Function

#### Version-Agnostic Entry Points

| File                          | Purpose                                          |
| ----------------------------- | ------------------------------------------------ |
| `contract/lifecycle/index.ts` | `getPaymentContractLifecycle(version)`           |
| `escrow/index.ts`             | `EscrowManager` singleton                        |
| `contract/index.ts`           | `getWallet()`, `getProvider()`, `initContract()` |

#### Lifecycle Implementations

| File                          | Lines | Purpose               |
| ----------------------------- | ----- | --------------------- |
| `contract/lifecycle/v1.ts`    | 687   | V1 lifecycle methods  |
| `contract/lifecycle/v2.ts`    | 947   | V2 lifecycle methods  |
| `contract/lifecycle/types.ts` | 78    | Interface definitions |

#### Blockchain Operations

| File                              | Purpose                   |
| --------------------------------- | ------------------------- |
| `contract/v1/blockchainWrites.ts` | V1 chain write operations |
| `contract/v2/blockchainWrites.ts` | V2 chain write operations |
| `escrow/v1/escrow.ts`             | V1 escrow creation        |

#### Permissions & State

| File                                    | Purpose                               |
| --------------------------------------- | ------------------------------------- |
| `contract/v1/permittedActions.ts`       | V1 permission computation             |
| `contract/v2/permittedActions.ts`       | V2 permission computation (11 states) |
| `contract/v1/effectiveContractState.ts` | V1 state derivation                   |

#### Nostr Integration

| File                             | Purpose                    |
| -------------------------------- | -------------------------- |
| `nostr/events/contract.ts`       | `NDKPaymentContract` class |
| `nostr/events/contractStatus.ts` | `NDKContractStatus` class  |
| `escrow/v1/nostrContract.ts`     | Legacy Nostr publishing    |

#### Stores & Runes

| File                           | Purpose                           |
| ------------------------------ | --------------------------------- |
| `stores/contract.store.ts`     | Svelte store for contracts        |
| `runes/contractRune.svelte.ts` | Svelte 5 rune for single contract |

---

## Recommendations

### Short-Term Actions

1. **Document Component Usage Guidelines**

   - Clarify when to use original vs NDK components
   - Create a migration guide for component consumers

2. **Consolidate EscrowStatus**

   - Move `EscrowStatus` enum from `escrow/v1/escrow.enum.ts` to `contract/types.ts`
   - Update all imports to use the contract module's enum

3. **Update Documentation References**
   - Ensure all inline docs reference the correct version

### Medium-Term Migration

1. **Complete V2 Registration in EscrowManager**

   - Add V2 handler to `VERSION_HANDLERS` registry
   - Update `LATEST_ESCROW_VERSION` when V2 is production-ready

2. **Migrate Store-Based Components**

   - Gradually migrate original components to use `PaymentContractRune`
   - Deprecate store-based approach for new features

3. **Unify Data Models**
   - Create adapter functions to convert between `ContractWithEvents` and `PaymentContractRuneLike`
   - Allow interoperability during transition

### Long-Term Architecture

1. **Remove Escrow Module Coupling**

   - Follow the migration plan in `service-escrow-version-abstraction.md`
   - Move all service-specific logic out of escrow module

2. **Consolidate to Single Component Set**

   - Once migration is complete, remove original components
   - Rename NDK components to standard names

3. **Unify Version Routing**
   - Consider merging `EscrowManager` and `PaymentContractLifecycle` patterns
   - Single source of truth for version routing

---

## Appendix: Quick Reference

### How to Determine Which System to Use

| Scenario                                | Use This                                                               |
| --------------------------------------- | ---------------------------------------------------------------------- |
| Creating new V1 contract                | `escrow.escrowOps.createEscrow()`                                      |
| Creating new V2 contract                | `createPaymentContract()` from `contract/v2/blockchainWrites.ts`       |
| Loading existing contract (store-based) | `contractStore.loadContracts()`                                        |
| Loading existing contract (rune-based)  | `PaymentContractRune.start()`                                          |
| Checking permissions                    | `rune.permittedActions` or `escrow.getVersionFromContract()` + handler |
| Performing action (V1/V2 aware)         | `rune.lifecycle.methodName()`                                          |

### Version Tag in Nostr Events

```json
// Kind 30006 tags example
[
	["d", "escrow-id-123"], // Escrow/Payment ID
	["t", "task-id-456"], // Task ID
	["p", "tasker-pubkey"], // Tasker
	["p", "taskee-pubkey"], // Taskee
	["n", "rgb-testnet"], // Network
	["v", "v2"], // VERSION TAG - determines which lifecycle to use
	["s", "0"], // Status (ContractStatus enum)
	["m", "contract"] // Message type
]
```

### Key Imports Cheat Sheet

```typescript
// Version-agnostic lifecycle
import { getPaymentContractLifecycle } from '$lib/utils/contract/lifecycle';

// Rune for single contract
import { PaymentContractRune } from '$lib/runes/contractRune.svelte';

// NDK event classes
import { NDKPaymentContract } from '$lib/nostr/events/contract';
import { NDKContractStatus } from '$lib/nostr/events/contractStatus';

// Status enums
import { ContractStatus, DisplayOnlyStatus } from '$lib/utils/contract/types';

// Legacy escrow manager (for store-based code)
import { escrow, EscrowStatus } from '$lib/utils/escrow';

// Contract store
import { contractStore } from '$lib/stores/contract.store';
```
