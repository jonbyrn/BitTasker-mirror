# Escrow Contract Creation Report

A detailed analysis of how the escrow contract gets created in BitTasker, the current coupling issues, and recommendations for a cleaner v2 implementation.

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Highest-priority fixes (tracking)](#highest-priority-fixes-tracking)
3. [Current Flow: Step-by-Step Execution Order](#current-flow-step-by-step-execution-order)
4. [Architecture Overview](#architecture-overview)
5. [Coupling & Responsibilities Analysis](#coupling--responsibilities-analysis)
6. [v1 vs v2 Contract Differences](#v1-vs-v2-contract-differences)
7. [Recommendations for v2 Clean Implementation](#recommendations-for-v2-clean-implementation)
8. [Implementation Roadmap](#implementation-roadmap)
9. [BidAcceptanceForm UI Integration Analysis](#bidacceptanceform-ui-integration-analysis)

---

## Executive Summary

The current escrow creation flow spans **6+ modules** with tight coupling between:

- UI (BidAcceptanceForm)
- Bid/escrow calculation (escrowBid)
- Blockchain contract calls (escrow)
- Pending contract registration (escrowEvents)
- Nostr event publishing (nostrContract)
- Task/Bid status updates
- Push notifications

**Key finding**: Contract creation and Nostr publishing are intertwined via `registerPendingContractByTxHash` → `handleEscrowCreated` callback chain. The blockchain `createEscrow` function triggers Nostr operations inside its `tx.wait()` callback, creating a hard dependency from contract → Nostr → UI stores.

---

## Highest-priority fixes (tracking)

| Priority | Item                                          | Status  | Notes                                                                                                                                                                                                                                                                                                        |
| -------- | --------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| P0       | **Publish Kind 30006** (`NDKPaymentContract`) | Done    | `publishV2ContractEvent` calls `await contract.publish()` so the payment contract event actually hits relays.                                                                                                                                                                                                |
| P0       | **Task `acceptedBid` + `IN_PROGRESS`**        | Done    | Orchestrator calls `publishTaskAcceptedBid(task, bid.id)` in `escrow/v2/creation.ts`: `task.acceptedBid`, `task.status = IN_PROGRESS`, `task.publishReplaceable()`. **Do not** use `updateTask()` from `nostr/task.ts` for this path — keeps the live task event’s tags/body intact except for those fields. |
| P0       | **Nostr prerequisites before RGB broadcast**  | Done    | Resolve taskee pubkey and NDK signer **before** `createPaymentContract` so we never broadcast on-chain without being able to run side effects.                                                                                                                                                               |
| P1       | **Simulation / fake broadcast**               | Removed | Orchestrator always broadcasts `createPaymentContract`. `paymentId` comes only from the mined receipt (`PaymentContractCreated`), not `staticCall`.                                                                                                                                                          |
| P1       | **Push notification copy**                    | Todo    | Replace hardcoded English title/body with i18n keys and backend-accepted `type` values.                                                                                                                                                                                                                      |
| P2       | **Task list / cache coherence**               | Todo    | `updateTask()` previously patched `tasksStore` / `myTasksStore`. After `publishReplaceable()` only, consider invalidating or merging the updated task into local stores so dashboard lists refresh without a full reload.                                                                                    |

---

For v2, we can simplify significantly since:

- No v1 contract creation support needed (clean slate)
- v2 uses `createPaymentContract` with different parameters
- v2 emits `PaymentContractCreated(paymentId)` instead of `EscrowCreated(escrowId, client, freelancer, amount)`

---

## Current Flow: Step-by-Step Execution Order

### Phase 1: User Interaction (BidAcceptanceForm.svelte)

| Step | Location                                                             | What Happens                             |
| ---- | -------------------------------------------------------------------- | ---------------------------------------- |
| 1    | `handleFundClick()`                                                  | User clicks "Fund" in confirmation modal |
| 2    | `escrow.bidOps.validateSufficientBalance()`                          | Re-validates balance                     |
| 3    | `handleSubmit()`                                                     | Form submission handler                  |
| 4    | `bidStore.addProcessingBid(bid.id)`                                  | Prevents duplicate submissions           |
| 5    | `escrow.bidOps.acceptBidAndCreateEscrow(bid, task, btcPrice, 'RGB')` | **Main entry point**                     |

### Phase 2: Bid Acceptance & Escrow Creation (v1/escrowBid.ts)

| Step | Location                                                       | What Happens                                |
| ---- | -------------------------------------------------------------- | ------------------------------------------- |
| 6    | `calculateBidEscrowDetails(bidContent, taskContent, btcPrice)` | Converts USD→BTC, computes fees, times     |
| 7    | `validateEscrowDetails(escrowDetails)`                         | Validates address, amount, timing           |
| 8    | `get(walletStore)`                                             | Checks RGB wallet connected                 |
| 9    | `escrow.ensureEscrowReady()`                                   | Connects to v1 contract (from v1/escrow.ts) |
| 10   | Time adjustment                                                | If start time in past → adjust to now+1h    |
| 11   | `escrow.createEscrow(...)`                                     | **Blockchain transaction** (v1/escrow.ts)   |
| 12   | `registerPendingContractByTxHash({ bidEventId, taskId, ... })` | Registers pending contract keyed by tx hash |

### Phase 3: Blockchain Transaction (v1/escrow.ts)

| Step | Location                                              | What Happens                             |
| ---- | ----------------------------------------------------- | ---------------------------------------- |
| 13   | `ensureEscrowReady()`                                 | Wallet, provider, contract instance      |
| 14   | `ethers.parseEther(baseAmount)`                       | Convert amounts                          |
| 15   | `calculateTotalPayment(baseAmountWei, clientFeeTier)` | Base + client fee                        |
| 16   | `contract.createEscrow.estimateGas(...)`              | Gas estimation                           |
| 17   | `contract.createEscrow(...)`                          | **Tx broadcast** (returns immediately)   |
| 18   | Return `{ hash, status: 'pending' }`                  | **UI gets result here**                  |
| 19   | `Promise.race([tx.wait(), 5min timeout])`             | **Async confirmation** (fire-and-forget) |

### Phase 4: Transaction Confirmation Callback (v1/escrow.ts)

| Step | Location                                                                                 | What Happens            |
| ---- | ---------------------------------------------------------------------------------------- | ----------------------- |
| 20   | `tx.wait()` resolves                                                                     | Receipt received        |
| 21   | `result.status = 'confirmed'`                                                            | Update result object    |
| 22   | Parse `EscrowCreated` event from receipt                                                 | Extract `escrowId`      |
| 23   | `EscrowNostrEvent.handleEscrowCreated({ escrowId, txHash, client, freelancer, amount })` | **Triggers Nostr flow** |

### Phase 5: Nostr & Side Effects (v1/escrowEvents.ts `handleEscrowCreated`)

| Step | Location                                                               | What Happens                                      |
| ---- | ---------------------------------------------------------------------- | ------------------------------------------------- |
| 24   | Lookup `pendingContractsByTxHash.get(txHash)`                          | Get bid/task metadata                             |
| 25   | Move to `pendingContracts.set(escrowId, ...)`                          | Re-key by escrowId                                |
| 26   | `publishContractEvent(contractParams)`                                 | **Nostr Kind 30006** (encrypted DM to freelancer) |
| 27   | `pushNotificationService.sendNotificationToNpubs(...)`                 | Push to Taskee                                    |
| 28   | `contractCreationStore.set({ escrowId, contractEventId })`             | **UI subscribes to this**                         |
| 29   | `sendBidStatusUpdate(bidEventId, taskId, ..., BidStatusEnum.ACCEPTED)` | **Nostr Kind 30008**                              |
| 30   | `updateTask(taskId, { status: IN_PROGRESS })`                          | Task status on Nostr                              |
| 31   | `contractStore.loadContractByEscrowId(escrowId)`                       | Reload contracts                                  |
| 32   | `pendingContracts.delete(escrowId)`                                    | Cleanup                                           |

### Phase 6: UI Success Screen (BidAcceptanceForm.svelte)

| Step | Location                                               | What Happens                                                     |
| ---- | ------------------------------------------------------ | ---------------------------------------------------------------- |
| 33   | `escrowDetails = { transactionResult, escrowDetails }` | Set in handleSubmit                                              |
| 34   | `currentScreen = 'success'`                            | Switch to success view                                           |
| 35   | `sendLocationsToTaskee(...)`                           | Background: send locations (in-person tasks)                     |
| 36   | Success screen renders                                 | Shows `$contractCreationStore?.contractEventId` for Nostr status |

### Diagram: Data Flow

```
BidAcceptanceForm
       │
       ▼
escrow.bidOps.acceptBidAndCreateEscrow()  ← index.ts routes to v1
       │
       ├── escrowBid.calculateBidEscrowDetails()
       ├── escrowBid.validateEscrowDetails()
       ├── escrow.ensureEscrowReady()     ← v1/escrow (direct import in escrowBid!)
       ├── escrow.createEscrow()          ← v1/escrow
       │        │
       │        ├── Tx broadcast → return { hash, status: 'pending' }
       │        │
       │        └── tx.wait().then() ──────────────────────────┐
       │                                                       │
       └── registerPendingContractByTxHash()  (sync, before return)  │
                                                                    │
                                                                    ▼
                                                    handleEscrowCreated()
                                                           │
                                                           ├── publishContractEvent()
                                                           ├── sendBidStatusUpdate()
                                                           ├── updateTask()
                                                           ├── contractCreationStore.set()
                                                           └── contractStore.loadContractByEscrowId()
```

---

## Architecture Overview

### Version Handler Pattern (index.ts)

```
EscrowManager (singleton)
├── VERSION_HANDLERS: { v1: v1Module }
├── LATEST_ESCROW_VERSION: 'v1'
├── escrowOps      → handler.escrow.*
├── bidOps         → handler.escrowBid.*
├── contractOps    → handler.nostrContract.*
└── eventOps       → handler.escrowEvents.*
```

### v1 Module Structure

| File                  | Responsibility                                              | Coupling                                                                        |
| --------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `v1/escrowBid.ts`     | Bid→escrow mapping, validation, acceptBidAndCreateEscrow    | Imports v1/escrow directly (bypasses index)                                     |
| `v1/escrow.ts`        | Contract calls, createEscrow, loadEscrowDetails, etc.       | Imports escrowEvents for handleEscrowCreated                                    |
| `v1/escrowEvents.ts`  | Pending contracts, handleEscrowCreated, publishEscrowStatus | Imports nostrContract, sendBidStatusUpdate, updateTask, pushNotificationService |
| `v1/nostrContract.ts` | publishContractEvent, getContracts, handleStatusEvent       | Imports escrow (blockchain), contractStore                                      |

**Circular-like dependencies**: escrow → escrowEvents → nostrContract → escrow (for loadEscrowDetails in getContracts).

### Index.ts Cross-Cutting Concern

The global `escrow` object re-exports v1 functions but:

- `validateEscrowDetails`, `validateSufficientBalance`, `getFeePercentageDisplay`, `formatBTCAmount` are **directly imported from v1/escrowBid** in index.ts (TODO comment: "Refactor implementation to avoid imports from v1 folder")
- bidOps always uses LATEST_ESCROW_VERSION for creation; version routing only matters for **post-creation** operations (loadEscrowDetails, completeTask, etc.)

---

## Coupling & Responsibilities Analysis

### 1. UI ↔ Escrow Logic

- **BidAcceptanceForm** imports `escrow` and calls:

  - `escrow.bidOps.calculateBidEscrowDetails`
  - `escrow.bidOps.validateEscrowDetails`
  - `escrow.bidOps.validateSufficientBalance`
  - `escrow.bidOps.acceptBidAndCreateEscrow`
  - `escrow.bidOps.getFeePercentageDisplay`
  - `escrow.bidOps.formatBTCAmount`
  - `escrow.eventOps.getContractCreationStore()`

- **Problem**: UI needs to know about contract creation store to show "Creating Nostr contract..." / "Nostr contract success" on success screen. This ties UI to internal event plumbing.

### 2. Blockchain ↔ Nostr (Tight Coupling)

- `createEscrow` in v1/escrow.ts **calls** `handleEscrowCreated` inside `tx.wait()` callback
- `handleEscrowCreated` does: Nostr publish, bid status, task update, push notification, store update
- **Problem**: Contract layer should not orchestrate Nostr. A blockchain tx confirmation is a low-level event; what to do next should be decided by a higher-level orchestrator.

### 3. escrowBid → v1/escrow Direct Import

- `escrowBid.acceptBidAndCreateEscrow` imports `escrow` from `./escrow` (v1)
- **Problem**: Bypasses version router. When v2 is added, escrowBid would need to call the right version, but currently it's hardwired to v1.

### 4. Mixed Concerns in handleEscrowCreated

One function does:

- Pending contract lookup
- Nostr contract publish
- Push notification
- Contract creation store update
- Bid status update (Nostr)
- Task status update (Nostr)
- Contract store reload
- Cleanup

**Problem**: Single function with 8+ side effects. Hard to test, hard to change, hard to add v2.

### 5. Pending Contract State

- `pendingContractsByTxHash` maps txHash → PendingContractCreation
- `registerPendingContractByTxHash` called **before** we have escrowId
- **Rationale**: Tx is broadcast; we don't get escrowId until receipt is mined
- **Problem**: This pattern is correct, but the callback that consumes it is buried inside escrow.ts, making it opaque to the rest of the system.

---

## v1 vs v2 Contract Differences

### v1 (createEscrow)

```solidity
// Returns uint256 escrowId
createEscrow(
  address freelancer,
  uint256 estimatedStartTime,
  uint256 estimatedCompletionTime,
  uint8 clientFeeTier,
  uint8 freelancerFeeTier
) payable
```

- **Event**: `EscrowCreated(escrowId, client, freelancer, amount)`
- **ID type**: `uint256`

### v2 (createPaymentContract)

```solidity
// Returns uint32 paymentId
createPaymentContract(
  address taskee,
  uint32 estimatedStartTime,
  uint32 estimatedCompletionTime,
  uint8 taskerFeeTier,
  uint8 taskeeFeeTier,
  uint72 cancellationFee,
  uint72 upfrontDeposit
) payable
```

- **Event**: `PaymentContractCreated(paymentContractId)` — no client/freelancer/amount in event
- **ID type**: `uint32`
- **New params**: `cancellationFee`, `upfrontDeposit` (both 0 for MVP)
- **msg.value (total payable)**: base + taskerFee + taskeeFee + upfrontDeposit + (2 × GAS_REIMBURSEMENT_PER_OP)
- **GAS_REIMBURSEMENT_PER_OP**: `2_523_514_500_000` wei (~252 sats) — constant in contract

### Implications for v2 Implementation

1. **Different event parsing**: v2 receipt has `PaymentContractCreated(paymentId)` not `EscrowCreated(...)`
2. **Different ID type**: `uint32` vs `uint256` — affects Nostr tags, types, storage
3. **Parameter mapping**: Need to map `BidEscrowDetails` to v2 params (cancellationFee, upfrontDeposit from where?)
4. **No client/freelancer/amount in event**: Must use pending contract data for Nostr payload; event only gives paymentId

---

## Recommendations for v2 Clean Implementation

### 1. Separate Layers Clearly

```
┌─────────────────────────────────────────────────────────────────────┐
│  UI Layer (BidAcceptanceForm)                                        │
│  - Validation display, form state                                    │
│  - Calls: createEscrowFromBidOrchestrator()                          │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Orchestration Layer (escrowCreationOrchestrator)                    │
│  - validate → gas → staticCall → broadcast (or simulate)             │
│  - On tx hash: publish contract, update task (acceptedBid), push     │
│  - simulate=true: fake hash + artificial delay; optionally mock      │
└─────────────────────────────────────────────────────────────────────┘
                    │                    │                    │
                    ▼                    ▼                    ▼
┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│ Chain Adapter    │  │ Nostr Adapter    │  │ Task Adapter      │
│ (v2 only)        │  │                  │  │                  │
│ - createPayment  │  │ - publishEvent   │  │ - updateTask      │
│ - no tx.wait     │  │   (Kind 30006)   │  │   (acceptedBid)   │
│                  │  │ - no sendBidStat │  │ - no bid store    │
└──────────────────┘  └──────────────────┘  └──────────────────┘
```

### 2. Immediate Side Effects on Tx Hash (No Confirmation Wait)

**Current**: escrow.createEscrow does tx.wait() and calls handleEscrowCreated inside.

**Proposed**:

- We always run validation → estimateGas → staticCall **before** broadcast. If staticCall succeeds, we assume broadcast will succeed.
- As soon as we get the tx hash back:
  1. **Publish contract event** (Nostr Kind 30006, encrypted DM to Taskee)
  2. **Update task event** with `acceptedBid` tag (NDKTask.acceptedBid setter) — this implicitly communicates bid acceptance; no separate bid status update
  3. **Push notification** to Taskee
- **No** `registerPendingContractByTxHash`, **no** contract store, **no** bid store
- **No** `sendBidStatusUpdate` — the task's `acceptedBid` tag is the source of truth for bid acceptance
- Success screen shows immediately (we assume contract is IN_PROGRESS); optionally show "pending confirmation" state while tx confirms in background

### 3. v2-Only Creation Module

Create `src/lib/utils/escrow/v2/` with:

- `creation.ts` — `createPaymentContractFromBid(bid, task, btcPrice)`:
  - Calculate v2 params (baseAmount, cancellationFee, upfrontDeposit, etc.)
  - Call contract
  - Return tx result
- `receiptParser.ts` — `parsePaymentContractCreated(receipt)` → `{ paymentId }`
- `abi.json` — already exists

**No** escrowBid, escrowEvents, nostrContract inside v2. Those stay shared/version-agnostic where possible.

### 4. Shared vs Version-Specific

| Concern                | v1                                  | v2                                            | Shared?                                |
| ---------------------- | ----------------------------------- | --------------------------------------------- | -------------------------------------- |
| Bid→Escrow calculation | escrowBid.calculateBidEscrowDetails | v2 creation.ts (different output shape)       | No — v2 has different params           |
| Contract creation      | escrow.createEscrow                 | v2.createPaymentContract                      | No                                     |
| Receipt parsing        | EscrowCreated                       | PaymentContractCreated                        | No                                     |
| Nostr contract event   | publishContractEvent                | Same kind/tags, different content shape       | Partial — content can have version tag |
| Pending registration   | registerPendingContractByTxHash     | **None** — v2 does not use pending by tx hash | N/A                                    |
| Bid status update      | sendBidStatusUpdate (Kind 30008)    | **None** — task.acceptedBid tag is sufficient | N/A                                    |
| handleEscrowCreated    | N/A for new design                  | Orchestrator runs side effects on tx hash     | Rethink                                |

### 5. No Stores — Remove All Creation-Time State

**Decision**: No `contractCreationStore`, no `bidStore` (addProcessingBid/removeProcessingBid), no `registerPendingContractByTxHash`.

- Orchestrator returns a Promise that resolves when side effects are done (publish contract, update task, push notification)
- UI awaits the orchestrator Promise; success screen shows when we have tx hash and side effects are triggered
- Contract is assumed IN_PROGRESS as soon as we have tx hash; optionally show "pending confirmation" UX while tx confirms in background
- Simpler mental model: one async operation, one result; no cross-module state

### 6. Type Definitions & Constants for v2

```typescript
// v2 contract constant (from Solidity, do not fetch from contract)
const GAS_REIMBURSEMENT_PER_OP = 2_523_514_500_000n; // ~252 sats wei

// Total payable = base + taskerFee + taskeeFee + upfrontDeposit + (2 * GAS_REIMBURSEMENT_PER_OP)
// MVP: cancellationFee = 0, upfrontDeposit = 0

interface CreatePaymentContractParams {
	taskee: string;
	estimatedStartTime: number;
	estimatedCompletionTime: number;
	taskerFeeTier: number; // maps directly from v1 clientFeeTier
	taskeeFeeTier: number; // maps directly from v1 freelancerFeeTier
	cancellationFee: bigint; // 0 for MVP
	upfrontDeposit: bigint; // 0 for MVP
}

interface PaymentContractCreatedEvent {
	paymentId: number; // uint32
}
```

**Contract address**: `VITE_RGB_CONTRACT_ADDRESS_V2_TESTNET` (mainnet: `VITE_RGB_CONTRACT_ADDRESS_V2_MAINNET` when available)

### 7. Migration Path

1. Implement v2 creation module (chain only)
2. Implement orchestrator that uses v2 creation + shared Nostr/task adapters
3. Wire BidAcceptanceForm to orchestrator for v2
4. Deprecate v1 creation path (keep v1 for existing contracts: load, complete, etc.)
5. Remove v1 creation from escrowBid when v2 is default

---

## Implementation Roadmap

This roadmap breaks the work into phases. **Phase 1** (implemented) delivers validation → gas estimation → staticCall. **Phase 2** introduces the orchestrator with both **simulation mode** (full flow with fake tx hash + artificial delay) and **real mode** (broadcast + immediate side effects on tx hash).

**Core assumption**: If `staticCall` succeeds, broadcast will succeed. We always run validation → estimateGas → staticCall before broadcast in both modes.

---

### Phase 1: Chain Validation & Simulation ✅ (Implemented)

**Goal**: Implement validation, gas estimation, and staticCall. No broadcast. No stores. Used for display and pre-submit validation.

**Deliverables** (done):

| Step | Description                                                                                       |
| ---- | ------------------------------------------------------------------------------------------------- |
| 1.1  | Input validation, parameter derivation, contract readiness                                        |
| 1.2  | Gas estimation via `estimateGasForCreatePaymentContract` (callable on form open)                  |
| 1.3  | Simulated call via `staticCall` — returns simulated paymentId                                     |
| 1.4  | `deriveV2CreationParams` for display; `createEscrowFromBid(..., { dryRun: true })` for validation |

---

### Phase 2: Orchestrator (Simulation + Real)

**Goal**: Introduce orchestrator that runs the full flow. **Simulation mode** simulates broadcast (fake tx hash + artificial delay for `tx.wait`); **real mode** broadcasts and triggers side effects immediately on tx hash.

**Orchestrator flow** (both modes):

1. **Validate** → **estimateGas** → **staticCall** (same as Phase 1). If staticCall fails, return error.
2. **Simulation mode** (`simulate: true`):
   - Generate fake tx hash (e.g. `0x` + random hex)
   - Artificial delay (e.g. 2–3 seconds) to simulate `tx.wait` confirmation
   - Run **same side effects** as real mode (publish Nostr events, update task) with simulated tx hash
   - Return `{ transactionHash, paymentId, status: 'simulated' }`
3. **Real mode** (`simulate: false`):
   - Broadcast `contract.createPaymentContract(...)` → get real tx hash
   - **Immediately** on tx hash (no `tx.wait`):
     - Publish contract event (Nostr Kind 30006) — DM to Taskee with task/contract details
     - Send locations or task info DM (sendLocationsToTaskee) — in-person: locations; remote: congratulations + task info
     - Update task event: orchestrator `publishTaskAcceptedBid(task, bid.id)` — NDKTask setters + `publishReplaceable()` (not `updateTask()`)
     - Push notification to Taskee
   - Optionally: fire-and-forget `tx.wait()` for "pending confirmation" UX; contract is assumed IN_PROGRESS as soon as we have hash

**Side effects (real mode)**:

- `publishContractEvent(params)` — Nostr Kind 30006, encrypted DM to Taskee with contract/task info (task title, description, amount, escrowId, times, transactionHash)
- `sendLocationsToTaskee(...)` — DM to Taskee with locations (in-person) or congratulations + task info (remote)
- `publishTaskAcceptedBid(task, bid.id)` in v2 creation — `acceptedBid` tag + `status` IN_PROGRESS in tag + JSON, then `publishReplaceable()`
- `pushNotificationService.sendNotificationToNpubs(...)` — notify Taskee

**Side effects (simulation mode)**:

- **Publish Nostr events** (same as real mode): contract event, sendLocationsToTaskee, update task
- Push notification: optional (can skip or mock)

**Deliverables**:

| Step | Description                                                                                                                             |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------- |
| 2.1  | **Chain adapter** (v2 creation): Add broadcast when `dryRun: false`. Return `{ hash, status: 'pending' }`. No `tx.wait` in chain layer. |
| 2.2  | **Orchestrator**: `createEscrowFromBidOrchestrator(bid, task, btcPrice, { simulate?: boolean })`                                        |
|      | - Calls chain: validate → gas → staticCall → broadcast (or fake hash + delay if simulate)                                               |
|      | - On tx hash: publish contract, update task (acceptedBid), push notification                                                            |
|      | - No contract store, no bid store, no pending registration                                                                              |
| 2.3  | **Simulation mode**: Fake tx hash + artificial delay (e.g. 2–3s); run same Nostr side effects as real mode                              |
| 2.4  | **BidAcceptanceForm**: Call orchestrator; success screen on resolve. Optionally show "pending confirmation" while tx confirms.          |

---

### Phase 3: UI Integration & Store Cleanup

**Goal**: Wire BidAcceptanceForm to orchestrator. Remove v1 creation dependencies and all store usage for creation.

**Deliverables**:

| Step | Description                                                                                                  |
| ---- | ------------------------------------------------------------------------------------------------------------ |
| 3.1  | Replace escrow imports with orchestrator: `createEscrowFromBidOrchestrator`, `deriveV2CreationParams`        |
| 3.2  | handleSubmit calls orchestrator with `{ simulate: true }` (for testing) or `{ simulate: false }` (real)      |
| 3.3  | Success screen: show tx hash; optionally "pending confirmation" state. No contractCreationStore.             |
| 3.4  | Remove `bidStore.addProcessingBid` / `removeProcessingBid` — rely on `isSubmitting` to prevent double submit |
| 3.5  | Remove `getContractCreationStore` from escrow.eventOps and v1/escrowEvents                                   |

---

### Phase 4: Deprecate v1 Creation Path

**Goal**: v1 creation is no longer used. v1 remains for existing contracts (load, complete, cancel, etc.).

**Deliverables**:

| Step | Description                                                             |
| ---- | ----------------------------------------------------------------------- |
| 4.1  | Remove or gate `acceptBidAndCreateEscrow` in v1/escrowBid for new flows |
| 4.2  | Ensure version router never routes _creation_ to v1                     |
| 4.3  | Document that v1 creation is deprecated; v2 is the only creation path   |

---

### Phase 2 Design Decisions (New)

| Item                                 | Decision                                                                                                 |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| **cancellationFee / upfrontDeposit** | 0 for MVP                                                                                                |
| **Fee tier mapping**                 | v1 tiers map directly: taskerFeeTier = clientFeeTier, taskeeFeeTier = freelancerFeeTier                  |
| **Total payable value**              | base + taskerFee + taskeeFee + upfrontDeposit + (2 × GAS_REIMBURSEMENT_PER_OP)                           |
| **GAS_REIMBURSEMENT_PER_OP**         | `2_523_514_500_000` (~252 sats wei). Use as constant; do not fetch from contract.                        |
| **Contract address**                 | `VITE_RGB_CONTRACT_ADDRESS_V2_TESTNET` (mainnet: `VITE_RGB_CONTRACT_ADDRESS_V2_MAINNET` when available)  |
| **Simulation assumption**            | If staticCall succeeds, broadcast will succeed. Always run validate → gas → staticCall before broadcast. |
| **Side effects on tx hash**          | Publish contract, update task (acceptedBid), push notification — immediately on tx hash, no tx.wait.     |
| **No bid status update**             | Task's `acceptedBid` tag is sufficient; do not call `sendBidStatusUpdate`.                               |
| **No stores**                        | No contractCreationStore, bidStore, or registerPendingContractByTxHash.                                  |
| **Simulation mode**                  | Fake tx hash + artificial delay (2–3s) to simulate tx.wait; optionally mock Nostr/push.                  |

---

### Suggested Order of Work

1. **Phase 1** ✅ — Done. Chain validation, gas, staticCall.
2. **Phase 2** — Orchestrator with simulation + real modes; chain broadcast; immediate side effects on tx hash.
3. **Phase 3** — UI integration; remove stores.
4. **Phase 4** — Deprecate v1 creation.

---

## BidAcceptanceForm UI Integration Analysis

This section documents what it would take for `BidAcceptanceForm.svelte` to call the new v2 creation path, the current tangles, and the recommended validation strategy.

### Current UI Dependencies (Tangles)

| Dependency                                    | Usage                                             | Notes                                                         |
| --------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------- |
| `escrow` (index)                              | `bidOps.calculateBidEscrowDetails`, etc.          | All v1; v2 uses orchestrator                                  |
| `escrow.eventOps.getContractCreationStore()`  | Success screen                                    | **Remove** — no store in v2                                   |
| `walletStore`, `walletManager`, `getProvider` | Wallet connection, balance                        | Keep; orchestrator uses internally                            |
| `bidStore`                                    | `addProcessingBid`, `removeProcessingBid`         | **Remove** — rely on `isSubmitting` to prevent double submit  |
| `BidEscrowDetails`                            | Display: baseAmount, totalAmount, fees, times     | v1 shape; v2 has different total (includes gas reimbursement) |
| `validationErrors`, `validationWarnings`      | From `validateEscrowDetails` in `$effect`         | **Delegate to creation function**                             |
| `balanceErrors`                               | From `validateSufficientBalance` in `$effect`     | **Delegate to creation function**                             |
| `adjustedTimes`                               | Derived from `bidEscrowDetails`; past start → +1h | v2 creation does same; need display source                    |
| `getEstimatedGasFee()`                        | Fixed `0.5` ($0.50)                               | **Replace** with real estimate from dryRun                    |
| `getTotalWithGasFee()`                        | `bidEscrowDetails.totalAmount * btcPrice`         | v2 total differs; use creation result                         |
| Props: `bid` (NDKBid), `task` (NDKTask)       | Passed to creation                                | Must stay compatible                                          |

### Validation Strategy: Delegate to Creation Function

**Recommendation: Do not duplicate validation in the UI. Rely on the creation function.**

| Aspect                   | Current (v1)                                                                                                                       | Recommended (v2)                                                                                              |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| **Who validates**        | UI runs `validateEscrowDetails` and `validateSufficientBalance` in `$effect`; creation also validates                              | Creation function is single source of truth                                                                   |
| **Why**                  | v2 params differ (total includes gas reimbursement, different fee shape). Duplicating v2 validation in UI would create drift risk. | One place to update when contract or rules change                                                             |
| **UI responsibility**    | Show errors, disable submit                                                                                                        | Call creation (with dryRun); display returned errors. Keep minimal checks: wallet connected, bid/task present |
| **When validation runs** | Reactive: `$effect` on bidEscrowDetails, wallet                                                                                    | On user action: "Accept" → open Fund modal; "Fund" → call creation (dryRun for Phase 1, real for Phase 2+)    |

**Flow**:

- **Display (before submit)**: Use a pure `deriveV2CreationParams(bid, task, btcPrice)` — no wallet/contract. Returns `{ baseAmount, totalAmount, estimatedStartTime, estimatedCompletionTime, ... }` for UI rendering.
- **Validation + submit**: Call `createEscrowFromBid(bid, task, btcPrice, { dryRun })`. It validates, runs gas + staticCall, returns success or `{ error, validationErrors? }`. UI shows errors from the result.
- **No `$effect` validation**: Remove the effects that call `validateEscrowDetails` and `validateSufficientBalance`. Validation happens when user clicks "Fund".

### Display Data: Separate Derivation Function

The UI needs amounts and times for display **before** any submit. Two options:

1. **Inline in creation**: Creation function exports `deriveV2CreationParams(bid, task, btcPrice)` — pure, sync. UI calls it for display. Creation uses same derivation internally.
2. **Creation returns on dryRun**: `createEscrowFromBid(..., { dryRun: true })` returns `{ params, estimatedGas, estimatedCostWei, ... }`. For display before submit, we'd need an extra call (e.g. on form open) or a separate derive function.

**Recommendation**: Export `deriveV2CreationParams(bid, task, btcPrice)` from the v2 module. Pure function, no async. UI uses it for:

- Base amount, fees, total (v2 formula), times
- `adjustedTimes` logic (start in past → +1h) lives here too

Creation function calls it internally. No duplication.

### Input Compatibility: NDKBid / NDKTask

Parent page passes `NDKBid` and `NDKTask`. Creation function needs:

- `bid.id`, `bid.content` (as `NostrBidContent` — NDKBid parses content in `from()`)
- `task.id`, `task.content` (string — NDKTask stores raw content)
- `getTaskStableId(task)` equivalent (d-tag or event id)

**Action**: Creation function should accept `{ id: string; content: NostrBidContent }` and `{ id: string; content: string }` (or a minimal interface). NDKBid/NDKTask satisfy this. No adapter needed if we use structural typing.

### Changes Required in BidAcceptanceForm

| Change                           | Details                                                                                                                                                                                                                                          |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Imports**                      | Replace `escrow` with v2 creation module. Add `deriveV2CreationParams`. Remove `getContractCreationStore`.                                                                                                                                       |
| **Display derivation**           | `bidEscrowDetails` → `$derived(deriveV2CreationParams(bidContent, taskContent, btcPrice.price))`. Use v2 display type (or extend `BidEscrowDetails` for v2).                                                                                     |
| **Remove validation effects**    | Delete `$effect` that calls `validateEscrowDetails` and `validateSufficientBalance`.                                                                                                                                                             |
| **handleSubmit**                 | Call orchestrator with `{ simulate: true }` (testing) or `{ simulate: false }` (real). On error: set `validationErrors` from result. On success: set `successDetails`, `currentScreen = 'success'`.                                              |
| **handleFundClick**              | Same as handleSubmit (or keep as wrapper that re-checks and calls handleSubmit).                                                                                                                                                                 |
| **Remove contractCreationStore** | Delete `contractCreationStore` usage. Success screen no longer shows "Creating Nostr contract..." / "Nostr contract success" — with orchestrator, we show success when Promise resolves.                                                         |
| **Success screen**               | Remove "Contract Creation Status" block (error / contractEventId / loading). Success = Promise resolved. For Phase 1 dryRun, show simulated result (estimated gas, simulated paymentId) instead of tx hash.                                      |
| **getEstimatedGasFee**           | Replace fixed `0.5` with value from creation result (dryRun returns `estimatedCostWei` or formatted cost). For display before dryRun, use `deriveV2CreationParams` if it includes gas estimate, or show placeholder until user opens Fund modal. |
| **getTotalWithGasFee**           | Use total from `deriveV2CreationParams` (which includes base + fees + 2×GAS_REIMBURSEMENT).                                                                                                                                                      |
| **onMount tx verification**      | Phase 1: N/A (no tx). Phase 2+: Keep only if we support "user navigates away and returns" — orchestrator resolves when done, so we may not need this.                                                                                            |
| **Balance check**                | Creation function validates balance (or returns insufficient balance error). UI can optionally call a lightweight `checkSufficientBalance(params)` for pre-submit UX — but that would duplicate logic. Simpler: rely on creation function error. |

### Phase 1 vs Phase 2 UI Wiring

**Phase 1 (simulation mode)**:

1. Use `deriveV2CreationParams` for display.
2. On "Fund" click, call orchestrator with `{ simulate: true }`.
3. Orchestrator runs validate → gas → staticCall, then fake tx hash + artificial delay.
4. On success: show "success" screen with simulated tx hash and paymentId.

**Phase 2 (real mode)**:

1. Same display and validation.
2. On "Fund" click, call orchestrator with `{ simulate: false }`.
3. Orchestrator broadcasts; on tx hash, runs publish contract, update task (acceptedBid), push notification.
4. On success: show "success" screen with real tx hash; optionally "pending confirmation" state.

### Summary: Validation Decision

| Question                                 | Answer                                                                          |
| ---------------------------------------- | ------------------------------------------------------------------------------- |
| Keep validations in UI?                  | **No.** Delegate to creation function.                                          |
| Where do UI validation errors come from? | Creation function return value (`error`, `validationErrors`).                   |
| Display data (amounts, times)?           | Pure `deriveV2CreationParams(bid, task, btcPrice)` — shared by UI and creation. |
| When does validation run?                | When user clicks "Fund" (creation is called). No reactive `$effect` validation. |

---

## Summary

| Aspect         | Current (v1)                           | Recommended (v2)                                                             |
| -------------- | -------------------------------------- | ---------------------------------------------------------------------------- |
| Entry point    | escrow.bidOps.acceptBidAndCreateEscrow | createEscrowFromBidOrchestrator                                              |
| Chain callback | Inside escrow.createEscrow (tx.wait)   | **None** — side effects run immediately on tx hash                           |
| Nostr          | handleEscrowCreated on tx confirm      | Orchestrator: publish contract, update task (acceptedBid), push — on tx hash |
| Bid status     | sendBidStatusUpdate (Kind 30008)       | **None** — task.acceptedBid tag is sufficient                                |
| Pending state  | registerPendingContractByTxHash        | **None**                                                                     |
| Stores         | contractCreationStore, bidStore        | **None** — no creation-time stores                                           |
| Simulation     | N/A                                    | Full flow with fake tx hash + artificial delay                               |

The key insight: **run side effects immediately on tx hash** — no `tx.wait()`, no pending registration. If staticCall succeeds, we assume broadcast succeeds. Simulation mode runs the full flow with fake hash + artificial delay to simulate confirmation timing.

**Implementation roadmap**: See [Implementation Roadmap](#implementation-roadmap). Phase 1 ✅ done. Phase 2 adds orchestrator with simulation + real modes.
