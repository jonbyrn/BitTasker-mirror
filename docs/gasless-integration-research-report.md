# BitTasker Escrow: Current Smart Contract Interaction Research Report

**Purpose:** Document how users currently interact with the SecurePaymentContract on Rootstock and how each step is reflected on Nostr. This report covers the full lifecycle of transaction submission, the Nostr events that accompany each contract action (when and how they are published), and integration points for the relay worker.

**Date:** March 4, 2026

---

## Executive Summary

All escrow contract interactions today are **direct transactions**: the user's wallet signs and broadcasts each transaction, and the user pays gas from their own rBTC balance. There is no meta-transaction or relay path. The integration architecture is centralized in `src/lib/utils/escrow/v1/escrow.ts`, which uses ethers.js `Contract` instances connected to the user's wallet. Every write operation follows the same pattern: `ensureEscrowReady()` → `contract.methodName(args, { gasLimit, gasPrice })` → `tx.wait()` for confirmation. Each contract action is mirrored on **Nostr**: after tx submit we publish a **pending** status (encrypted DM to the other party), and after tx confirm we publish the **confirmed** status; createEscrow additionally creates the initial contract event and updates bid/task status (see §4).

---

## 1. Transaction Flow Architecture

### 1.1 Signing & Broadcasting

```
User Action (UI)
       │
       ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  escrow.escrowOps.* or escrow.bidOps.acceptBidAndCreateEscrow                 │
│  (src/lib/utils/escrow/index.ts)                                              │
└──────────────────────────────────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  v1/escrow.ts or v1/escrowBid.ts                                              │
│  • ensureEscrowReady(contractAddress?, requireBalance?)                        │
│  • Returns: { contract, wallet, provider }                                     │
│  • contract = new ethers.Contract(address, abi, wallet)  ← wallet is signer   │
└──────────────────────────────────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  Direct Transaction                                                           │
│  • contract.methodName(args, { value?, gasLimit, gasPrice })                   │
│  • ethers internally: wallet.signTransaction() + provider.broadcast()          │
│  • msg.sender = wallet.address → user pays gas                                 │
└──────────────────────────────────────────────────────────────────────────────┘
       │
       ▼
  RPC (Rootstock) → Transaction mined → Receipt
```

### 1.2 Wallet & Contract Initialization

- **Wallet source:** `getWallet('rsk')` from `wallet.store.ts` (derived from mnemonic via `@bittasker/wallet-core`)
- **Provider:** `getProvider('rsk')` — Rootstock RPC (testnet or mainnet via `VITE_RSK_*` env vars)
- **Contract address:** From `VITE_RSK_CONTRACT_ADDRESS_TESTNET` / `VITE_RSK_CONTRACT_ADDRESS_MAINNET`
- **Balance check:** `ensureEscrowReady()` calls `provider.getBalance(wallet.address)` before write operations; throws if balance is 0

---

## 2. Escrow Lifecycle & Contract Interactions

### 2.1 Who Triggers Each Transaction

| #   | Contract Function      | Triggered By            | UI Entry Point                                | Gas Payer |
| --- | ---------------------- | ----------------------- | --------------------------------------------- | --------- |
| 1   | `createEscrow`         | **Tasker (Client)**     | BidAcceptanceForm → handleSubmit              | Tasker    |
| 2   | `completeTask`         | **Taskee (Freelancer)** | ContractActions → completeTaskWithAttachments | Taskee    |
| 3   | `acceptTask`           | **Tasker (Client)**     | ContractActions → acceptTask                  | Tasker    |
| 4   | `cancelEscrow`         | **Tasker (Client)**     | ContractActions → cancelEscrow                | Tasker    |
| 5   | `refundClient`         | **Taskee (Freelancer)** | Not exposed in app (see §4)                   | Taskee    |
| 6   | `disputeTask`          | **Tasker (Client)**     | ContractActions → disputeTask                 | Tasker    |
| 7   | `proposeResolution`    | **Either party**        | ContractActions → proposeResolution           | Caller    |
| 8   | `acceptProposal`       | **Either party**        | ContractActions → acceptProposal              | Caller    |
| 9   | `resolveAfterTimelock` | **Either party**        | ContractActions → resolveAfterTimelock        | Caller    |

**V2-only (not in v1):** `markWorkInProgress`, `markNoShow`, `claimNoShowRefund`, `claimUpfrontDeposit` — same direct pattern where applicable.

---

## 3. Step-by-Step Implementation Details

### 3.1 Create Escrow (Tasker)

**Flow:**

1. `BidAcceptanceForm.handleSubmit()` → `escrow.bidOps.acceptBidAndCreateEscrow(bid, task, btcPrice, 'RSK')`
2. `escrowBid.acceptBidAndCreateEscrow()` validates, calculates escrow details, calls `escrow.createEscrow(...)`
3. `escrow.createEscrow()` in `v1/escrow.ts`:
   - `ensureEscrowReady()` — wallet, provider, contract, balance check
   - `contract.createEscrow.estimateGas(...)` with `{ value: totalPayment, gasPrice }`
   - `contract.createEscrow(..., { value: totalPayment, gasLimit, gasPrice })`
   - `tx.wait()` → on confirm: parse `EscrowCreated` event, call `handleEscrowCreated()`

**Key details:**

- **Payable:** `value: totalPayment` (base + client fee)
- **Gas:** User pays from wallet; `gasLimit = estimate + 10%`, `gasPrice` from `provider.getFeeData()`

**Files:** `BidAcceptanceForm.svelte`, `escrowBid.ts`, `escrow.ts` (createEscrow)

---

### 3.2 Complete Task (Taskee)

**Flow:**

1. `ContractActions.completeTaskWithAttachments(attachments)` → `escrow.escrowOps.completeTask(contract, attachments)`
2. `escrow.completeTask(escrowId, contractEventId, completionAttachments)` in `v1/escrow.ts`:
   - `ensureEscrowReady()` — balance check
   - `contract.completeTask.estimateGas(escrowId, { gasPrice })`
   - `contract.completeTask(escrowId, { gasLimit, gasPrice })`
   - Before `tx.wait()`: `publishEscrowStatus(PendingCompletion)` to Nostr
   - After confirm: `publishEscrowStatus(Completed)`

**Key details:**

- **Non-payable**
- **Gas:** Taskee pays — **this is a critical pain point** for gasless: Taskees often have no rBTC

**Files:** `ContractActions.svelte`, `escrow/index.ts`, `escrow/v1/escrow.ts` (completeTask)

---

### 3.3 Accept Task (Tasker)

**Flow:**

1. `ContractActions.acceptTask()` → `escrow.escrowOps.acceptTask(contract)`
2. `escrow.acceptTask(escrowId, contractEventId, { onConfirmed })` in `v1/escrow.ts`:
   - `ensureEscrowReady()`
   - `contract.acceptTask.estimateGas(escrowId, { gasPrice })`
   - `contract.acceptTask(escrowId, { gasLimit, gasPrice })`
   - Before confirm: `publishEscrowStatus(PendingAcceptance)`
   - After confirm: `publishEscrowStatus(FundsReleased)` + `onConfirmed()` → `updateTask(COMPLETED)`

**Key details:**

- **Non-payable**
- **Gas:** Tasker pays

**Files:** `ContractActions.svelte`, `escrow/index.ts`, `escrow/v1/escrow.ts` (acceptTask)

---

### 3.4 Cancel Escrow (Tasker)

**Flow:**

1. `ContractActions.cancelEscrow()` → `escrow.escrowOps.cancelEscrow(contract)`
2. `escrow.cancelEscrow(escrowId, contractEventId)` in `v1/escrow.ts`:
   - Same pattern: estimate, send, publish pending/confirmed status

**Key details:**

- **Contract:** `cancelEscrow` is client-only
- **Gas:** Tasker pays

---

### 3.5 Dispute Task (Tasker)

**Flow:**

1. `ContractActions.disputeTask()` → `escrow.escrowOps.disputeTask(contract)`
2. `escrow.disputeTask(escrowId, contractEventId)` — same pattern

**Key details:**

- **Contract:** Client-only
- **Gas:** Tasker pays

---

### 3.6 Propose Resolution (Either party)

**Flow:**

1. `ContractActions.proposeResolution()` → `escrow.escrowOps.proposeResolution(contract, freelancerAmountRBTC, ...)`
2. `escrow.proposeResolution(escrowId, freelancerAmountWei, ...)` — same pattern with `proposedClientAmount`, `proposedFreelancerAmount` for Nostr

**Key details:**

- **Gas:** Caller (client or freelancer) pays

---

### 3.7 Accept Proposal (Either party)

**Flow:**

1. `ContractActions.acceptProposal()` → `escrow.escrowOps.acceptProposal(contract)`
2. Same pattern; `onConfirmed` updates task to COMPLETED only when Tasker accepts

**Key details:**

- **Gas:** Caller pays

---

### 3.8 Resolve After Timelock (Either party)

**Flow:**

1. `ContractActions.resolveAfterTimelock()` → `escrow.escrowOps.resolveAfterTimelock(contract)`
2. Same pattern; final status (FundsReleased vs DisputeUnresolved) depends on prior escrow state

**Key details:**

- **Gas:** Caller pays

---

## 4. Nostr Interaction With Each Contract Step

Every contract-related blockchain action is accompanied by Nostr events so both parties see the same contract and status history. Nostr is **always after** the relevant blockchain step (either after tx **submission** for pending states, or after tx **confirmation** for final states). No Nostr event is published instead of a chain tx; Nostr is the sync layer.

### 4.1 Nostr Event Types and Mechanics

| Kind           | Constant                | Purpose                                           | Encryption          | Recipient                          |
| -------------- | ----------------------- | ------------------------------------------------- | ------------------- | ---------------------------------- |
| **30006**      | `KINDS.CONTRACT`        | Contract creation (escrow terms, parties, amount) | NIP-44 encrypted DM | Freelancer (other party)           |
| **31006**      | `KINDS.CONTRACT_STATUS` | Status update (pending/confirmed action, tx hash) | NIP-44 encrypted DM | Other party (client ↔ freelancer) |
| **Bid status** | `KINDS.BID_STATUS`      | Bid accepted/rejected (used after escrow created) | NIP-44 encrypted DM | Bidder (freelancer)                |

- **Publishing:** `publishNostrEvent(kind, JSON.stringify(content), recipientPubkey, tags)` in `src/lib/utils/nostr.ts`. For these kinds, content is encrypted with NIP-44 to the recipient.
- **Tags:** Contract events use `TAG_PATTERNS.contract(escrowId, taskId, freelancerPubkey, clientPubkey, network, version)`; status events use `TAG_PATTERNS.contractStatus(contractEventId, escrowId, recipientPubkey, action, version)`.
- **Contract loading:** Contracts are loaded via `getContracts()` in `nostrContract.ts`, which queries `KINDS.CONTRACT` (with `#d` = escrowId, participant tags, network) and attaches `KINDS.CONTRACT_STATUS` events as `statusEvents` for the timeline.

### 4.2 High-Level Flow: When Nostr Runs

- **Before tx broadcast:** None. We do **not** publish Nostr before sending the transaction.
- **After tx broadcast, before confirmation:** We publish a **pending** status (e.g. `PendingCompletion`, `PendingAcceptance`) so the UI and the other party see “in progress” and we avoid double-submits.
- **After tx confirmation:** We publish the **confirmed** status (e.g. `Completed`, `FundsReleased`) and run any extra Nostr/task logic (e.g. `updateTask(COMPLETED)`).

The only exception is **createEscrow**: the first Nostr contract event is created only **after** the createEscrow tx confirms, inside `handleEscrowCreated`.

### 4.3 Pending Contract Registration (Create Escrow Only)

- **When:** Right after `createEscrow()` is called and we have a transaction hash, **before** confirmation.
- **Where:** `escrowBid.acceptBidAndCreateEscrow()` → `registerPendingContractByTxHash({ bidEventId, taskId, taskTitle, taskDescription, freelancerPubkey, amount, estimatedStartTime, estimatedCompletionTime, transactionHash })`.
- **Why:** The escrow ID is only known when we parse the `EscrowCreated` log from the receipt. So we key pending state by `transactionHash`; when the tx confirms, `handleEscrowCreated` finds this pending record and creates the Nostr contract event.
- **Cleanup:** If the tx fails or times out, `cleanupPendingContractByTxHash(transactionHash)` is called (in escrow.ts catch/finally and in escrowBid catch).

### 4.4 Create Escrow — Nostr Side (After Confirm)

**When:** Only after `createEscrow` tx confirms (inside `tx.wait()` callback in `v1/escrow.ts`).

**Steps (all in `handleEscrowCreated`, `escrowEvents.ts`):**

1. **Resolve pending contract**  
   Look up by `event.escrowId` or `event.transactionHash` in `pendingContractsByTxHash`; move to `pendingContracts` by escrowId.

2. **Publish contract event (Nostr)**  
   `publishContractEvent(contractParams)`:

   - Kind: `KINDS.CONTRACT` (30006)
   - Content: `NostrContract` (escrowId, taskId, taskTitle, taskDescription, freelancerPubkey, clientPubkey, amount, currency: 'RBTC', status: Funded, times, transactionHash, contractAddress)
   - Recipient: **freelancer** (encrypted DM)
   - Tags: `TAG_PATTERNS.contract(escrowId, taskId, freelancerPubkey, clientPubkey, network, 'v1')`

3. **Push notification**  
   `pushNotificationService.sendNotificationToNpubs([freelancerPubkey], ...)` — “Your bid has been accepted”.

4. **Bid status update (Nostr)**  
   `sendBidStatusUpdate(bidEventId, taskId, freelancerPubkey, BidStatusEnum.ACCEPTED, message, escrowId, transactionHash)`:

   - Kind: `KINDS.BID_STATUS`
   - Recipient: **freelancer** (bidder)
   - Content: `NostrBidStatus` (type: 'bid-status', taskId, status: ACCEPTED, message, escrowId, transactionHash)
   - Also clears bid caches and removes bid from processing.

5. **Task status update (Nostr)**  
   `updateTask(pendingContract.taskId, { status: TaskStatusEnum.IN_PROGRESS })` — task event (kind 31000) updated by Tasker so task shows “In progress”.

6. **Contract store**  
   `contractStore.loadContractByEscrowId(event.escrowId)` so the new contract appears in the UI.

7. **Cleanup**  
   Remove from `pendingContracts` and `processingContracts`.

**Files:** `escrowEvents.ts` (handleEscrowCreated), `nostrContract.ts` (publishContractEvent), `nostr-bid.ts` (sendBidStatusUpdate), `task.ts` (updateTask).

### 4.5 Status Updates for All Other Contract Actions

For **completeTask**, **acceptTask**, **cancelEscrow**, **disputeTask**, **proposeResolution**, **acceptProposal**, **resolveAfterTimelock** the pattern is the same:

1. **Right after tx is broadcast (before confirm):**  
   `publishEscrowStatus({ escrowId, contractEventId, transactionHash: tx.hash, status: <PendingXXX> })`  
   → calls `publishContractStatus(...)` in `nostrContract.ts`:

   - Kind: `KINDS.CONTRACT_STATUS` (31006)
   - Content: `NostrContractStatus` (contractEventId, escrowId, action: pending status, message, timestamp, transactionHash, optional proposal amounts or completion attachments)
   - Recipient: **other party** (if sender is client → freelancer; if sender is freelancer → client). Recipient is derived by loading the contract by escrowId and comparing sender to `clientPubkey`/`freelancerPubkey`.
   - Tags: `TAG_PATTERNS.contractStatus(contractEventId, escrowId, recipientPubkey, action, 'v1')`
   - Toast: info toast from `getStatusMessages(status).pendingMessage` (e.g. “Completing task…”).

2. **After tx confirms (`tx.wait()`):**  
   `publishEscrowStatus({ ..., transactionHash: receipt.hash, status: <ConfirmedXXX> })`

   - Same kind and recipient logic; action is the confirmed status (e.g. `Completed`, `FundsReleased`, `Cancelled`).
   - Toast: success from `getStatusMessages(status).successToast`.

3. **Optional onConfirmed (task event):**  
   For **acceptTask**, **acceptProposal** (when Tasker accepts), **resolveAfterTimelock** (when outcome is FundsReleased), the escrow layer calls `onConfirmed()` which runs `updateTask(taskId, { status: TaskStatusEnum.COMPLETED })` so the task shows “Completed”.

**Summary table:**

| Contract action      | Nostr pending (after tx submit) | Nostr confirmed (after tx confirm)              | Other Nostr / side effects                      |
| -------------------- | ------------------------------- | ----------------------------------------------- | ----------------------------------------------- |
| createEscrow         | —                               | CONTRACT + BID_STATUS + updateTask(IN_PROGRESS) | handleEscrowCreated (see §4.4)                  |
| completeTask         | PendingCompletion               | Completed                                       | —                                               |
| acceptTask           | PendingAcceptance               | FundsReleased                                   | onConfirmed → updateTask(COMPLETED)             |
| cancelEscrow         | PendingCancellation             | Cancelled                                       | —                                               |
| disputeTask          | PendingDispute                  | InDispute                                       | —                                               |
| proposeResolution    | PendingResolutionProposal       | DisputeResolutionProposed                       | proposedClientAmount, proposedFreelancerAmount  |
| acceptProposal       | PendingProposalAcceptance       | DisputeResolved                                 | onConfirmed → updateTask(COMPLETED) if client   |
| resolveAfterTimelock | PendingTimelockResolution       | FundsReleased or DisputeUnresolved              | onConfirmed → updateTask(COMPLETED) if released |

### 4.6 How Status Messages and Toasts Are Chosen

- **contractStatusFormatter.ts:** `getStatusMessages(status)` returns translation keys for:
  - `pendingMessage` — info toast when publishing pending status
  - `confirmedMessage` — text stored in the status event
  - `successToast` — toast after confirmation
  - `errorToast` — toast if the chain tx fails
- **publishEscrowStatus** (escrowEvents.ts) uses these to set the status event message and to show the correct toasts.

### 4.7 Nostr and Gasless Integration

- **Pending status:** Should still be published **as soon as** we have a relay response (e.g. `txHash` from `POST /relay`), so the UX stays “in progress” and we avoid duplicate submissions. So the trigger stays “after we know the tx was submitted,” whether that’s from direct send or from relay.
- **Confirmed status and onConfirmed:** Should run when we know the tx is confirmed. With the relay we can either poll `eth_getTransactionReceipt(txHash)` or keep the same pattern if the app later receives confirmation by another path. No change to Nostr content or recipients; only the source of `txHash` and confirmation changes.
- **handleEscrowCreated:** Unchanged for gasless; it still runs only after the createEscrow tx confirms (createEscrow remains direct).

---

## 5. Exact Execution Flows and Resilience (completeTask & acceptTask)

This section traces the **happy path** for the Taskee completing a task and the Tasker accepting it: every dependency, what is awaited vs fire-and-forget, and where **no retry** exists so contract and Nostr can get out of sync.

### 5.1 Conventions

- **Awaited (synchronous from caller’s perspective):** Caller uses `await`; failure propagates and can be handled.
- **Fire-and-forget:** Caller does not `await` (e.g. `.then(...)` without returning the promise, or `.catch()` only). Failure is not visible to the caller; there is no automatic retry from the flow.
- **Retry:** Explicit retry logic (e.g. loop, re-call on next load). If not stated, there is **no retry**.

---

### 5.2 Flow A: Taskee — completeTask (happy path)

#### Call chain (top to bottom)

```
1. User clicks "Complete task" → TaskCompletionModal confirms → onComplete(attachments)
2. ContractActions.completeTaskWithAttachments(attachments)
3. → escrow.escrowOps.completeTask(contract, attachments)
4.   → escrow/index.ts: getVersionFromContract, getHandler(version)
5.   → v1/escrow.completeTask(escrowId, contractEventId, completionAttachments)
```

#### Step-by-step with sync vs async and retry

| Step   | Location               | What runs                                                                                                                                          | Awaited by caller?       | Retry?                                                                                          |
| ------ | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ | ----------------------------------------------------------------------------------------------- |
| **1**  | ContractActions.svelte | `contract.permissions.canComplete` guard                                                                                                           | —                        | —                                                                                               |
| **2**  | ContractActions.svelte | `contract.isPending` guard (Nostr pending state)                                                                                                   | —                        | —                                                                                               |
| **3**  | ContractActions.svelte | `checkBlockchainCompletionStatus()` — loadEscrowDetails or cache (5s timeout)                                                                      | **Yes**                  | No (cache 30s TTL)                                                                              |
| **4**  | ContractActions.svelte | `setLoading('complete', true)`                                                                                                                     | —                        | —                                                                                               |
| **5**  | ContractActions.svelte | `await escrow.escrowOps.completeTask(contract, attachments)`                                                                                       | **Yes**                  | No                                                                                              |
| **6**  | escrow/index.ts        | `handler.escrow.completeTask(escrowId, contractEventId, completionAttachments)`                                                                    | **Yes**                  | No                                                                                              |
| **7**  | v1/escrow.ts           | `await ensureEscrowReady()` (wallet, provider, contract, balance)                                                                                  | **Yes**                  | No                                                                                              |
| **8**  | v1/escrow.ts           | `await provider.getFeeData()`                                                                                                                      | **Yes**                  | No                                                                                              |
| **9**  | v1/escrow.ts           | `await contract.completeTask.estimateGas(escrowId, { gasPrice })`                                                                                  | **Yes**                  | No                                                                                              |
| **10** | v1/escrow.ts           | `await contract.completeTask(escrowId, { gasLimit, gasPrice })` → tx broadcast                                                                     | **Yes**                  | No                                                                                              |
| **11** | v1/escrow.ts           | Build `result = { hash: tx.hash, escrowId, status: 'pending' }`                                                                                    | —                        | —                                                                                               |
| **12** | v1/escrow.ts           | `if (contractEventId) await EscrowNostrEvent.publishEscrowStatus({ ..., status: PendingCompletion })`                                              | **Yes**                  | **No** — if this throws, full flow throws; ContractActions catch runs, user sees error.         |
| **13** | escrowEvents.ts        | `publishEscrowStatus` → `await publishContractStatus(...)`                                                                                         | **Yes**                  | No                                                                                              |
| **14** | nostrContract.ts       | `publishContractStatus`: getNpub, queryNostrEvents(CONTRACT by escrowId), build status, `await publishNostrEvent(CONTRACT_STATUS, ..., recipient)` | **Yes**                  | No; on catch: `console.warn` only, **no rethrow** — so escrow layer does not see Nostr failure. |
| **15** | v1/escrow.ts           | `tx.wait().then(async (receipt) => { ... })` — **not awaited**                                                                                     | **No**                   | —                                                                                               |
| **16** | v1/escrow.ts           | `return result` — caller receives immediately with `status: 'pending'`                                                                             | —                        | —                                                                                               |
| **17** | ContractActions.svelte | After step 5 resolves: `pushNotificationService.sendNotificationToNpubs(...)`                                                                      | **No** (not awaited)     | No                                                                                              |
| **18** | ContractActions.svelte | `sendTaskCompletionMessageToTasker(...).catch(...)`                                                                                                | **No** (fire-and-forget) | No                                                                                              |
| **19** | ContractActions.svelte | **Never** `setLoading('complete', false)` on success path                                                                                          | —                        | —                                                                                               |

**Inside the fire-and-forget `tx.wait().then(...)` (steps 20–23):**

| Step   | Location        | What runs                                                                                                                                | Awaited by caller?                                                                  | Retry?                                                                                                                                                                             |
| ------ | --------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **20** | v1/escrow.ts    | On receipt: `result.status = 'confirmed'`; `if (contractEventId) await EscrowNostrEvent.publishEscrowStatus({ ..., status: Completed })` | Awaited only **inside** the .then(); **caller of completeTask() never awaits this** | **No** — if publishEscrowStatus fails here, only escrowEvents catch runs (toast + log); **no retry**. Contract is already Completed on-chain; Nostr can stay at PendingCompletion. |
| **21** | escrowEvents.ts | `publishEscrowStatus` → `publishContractStatus` → `publishNostrEvent(CONTRACT_STATUS, Completed, ...)`                                   | Same as step 20                                                                     | No                                                                                                                                                                                 |
| **22** | v1/escrow.ts    | `.catch((error) => { result.status = 'failed'; appStore.showErrorToast(...) })` if tx fails                                              | —                                                                                   | No                                                                                                                                                                                 |
| **23** | —               | If tx fails: no Nostr rollback of PendingCompletion (we don’t delete or overwrite); UI may show pending until next load.                 | —                                                                                   | No                                                                                                                                                                                 |

**Resilience gaps (completeTask):**

- **Pending status (step 12):** If `publishContractStatus` fails, `publishEscrowStatus` throws (escrowEvents rethrows after toast). So the **pending** Nostr publish is “all or nothing” with the flow — user sees error and can retry the whole action. **Gap:** `publishContractStatus` itself catches and only `console.warn`s (nostrContract.ts), so in theory the outer publishEscrowStatus could not see that failure if the inner logic threw after the publish attempt — but currently it does rethrow from publishEscrowStatus on catch.
- **Confirmed status (step 20):** Runs inside **fire-and-forget** `tx.wait().then()`. If `publishEscrowStatus(Completed)` fails, contract is already Completed on-chain; Nostr may never get the Completed event. **No retry** in this flow. Other party could see stale PendingCompletion until they reload; reconciliation (e.g. re-fetching contract + blockchain and fixing Nostr) is not implemented for Completed.
- **Loading state:** Success path never sets `setLoading('complete', false)`; only the catch block does. So on success the button can stay in loading state until the component unmounts or state is reset elsewhere.

---

### 5.3 Flow B: Tasker — acceptTask (happy path)

#### Call chain (top to bottom)

```
1. User clicks "Accept work" → ConfirmModal confirms → handleModalConfirm() → acceptTask()
2. ContractActions.acceptTask()
3. → escrow.escrowOps.acceptTask(contract)
4.   → escrow/index.ts: build onConfirmed = async () => updateTask(taskId, { status: COMPLETED })
5.   → v1/escrow.acceptTask(escrowId, contractEventId, { onConfirmed })
```

#### Step-by-step with sync vs async and retry

| Step   | Location               | What runs                                                                                                             | Awaited by caller?       | Retry?                                                                                      |
| ------ | ---------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------- |
| **1**  | ContractActions.svelte | `contract.permissions.canAccept` guard                                                                                | —                        | —                                                                                           |
| **2**  | ContractActions.svelte | `contract.isPending` guard                                                                                            | —                        | —                                                                                           |
| **3**  | ContractActions.svelte | `setLoading('accept', true)`                                                                                          | —                        | —                                                                                           |
| **4**  | ContractActions.svelte | `await escrow.escrowOps.acceptTask(contract)`                                                                         | **Yes**                  | No                                                                                          |
| **5**  | escrow/index.ts        | `updateTask` imported; `onConfirmed = taskId ? async () => await updateTask(taskId, COMPLETED) : undefined`           | —                        | —                                                                                           |
| **6**  | escrow/index.ts        | `handler.escrow.acceptTask(escrowId, contractEventId, { onConfirmed })`                                               | **Yes**                  | No                                                                                          |
| **7**  | v1/escrow.ts           | `await ensureEscrowReady()`                                                                                           | **Yes**                  | No                                                                                          |
| **8**  | v1/escrow.ts           | `await provider.getFeeData()`, `await contract.acceptTask.estimateGas(...)`                                           | **Yes**                  | No                                                                                          |
| **9**  | v1/escrow.ts           | `await contract.acceptTask(escrowId, { gasLimit, gasPrice })` → tx broadcast                                          | **Yes**                  | No                                                                                          |
| **10** | v1/escrow.ts           | Build `result`; `if (contractEventId) await EscrowNostrEvent.publishEscrowStatus({ ..., status: PendingAcceptance })` | **Yes**                  | No (same as completeTask: pending is in the synchronous path; Nostr failure can throw out). |
| **11** | escrowEvents.ts        | `publishEscrowStatus` → `publishContractStatus` (CONTRACT_STATUS to other party)                                      | **Yes**                  | No                                                                                          |
| **12** | v1/escrow.ts           | `tx.wait().then(async (receipt) => { ... })` — **not awaited**                                                        | **No**                   | —                                                                                           |
| **13** | v1/escrow.ts           | `return result`                                                                                                       | —                        | —                                                                                           |
| **14** | ContractActions.svelte | After step 4 resolves: `pushNotificationService.sendNotificationToNpubs(...)`                                         | **No**                   | No                                                                                          |
| **15** | ContractActions.svelte | `sendPaymentReleasedMessageToTaskee(...).catch(...)`                                                                  | **No** (fire-and-forget) | No                                                                                          |
| **16** | ContractActions.svelte | **Never** `setLoading('accept', false)` on success                                                                    | —                        | —                                                                                           |

**Inside the fire-and-forget `tx.wait().then(...)` (steps 17–22):**

| Step   | Location      | What runs                                                                                                                                                                                                                                                                                                                                                                                      | Awaited by caller?                                   | Retry?                                                                                        |
| ------ | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| **17** | v1/escrow.ts  | On receipt: `result.status = 'confirmed'`; `if (contractEventId) try { await publishEscrowStatus({ ..., status: FundsReleased }) } catch { /* silent */ }`                                                                                                                                                                                                                                     | Awaited only inside .then(); **caller never awaits** | **No** — catch is empty comment (“contract may show PendingAcceptance”); **no retry**.        |
| **18** | v1/escrow.ts  | `try { await options?.onConfirmed?.() } catch (err) { console.error('acceptTask onConfirmed failed', err) }` — i.e. `updateTask(taskId, COMPLETED)`                                                                                                                                                                                                                                            | Same                                                 | **No** — if updateTask fails, task event stays e.g. IN_PROGRESS; **no retry** from this flow. |
| **19** | nostr/task.ts | `updateTask`: find task (API or relay), merge, sign, publish, update stores/caches                                                                                                                                                                                                                                                                                                             | —                                                    | updateTask has **no internal retry**; throws on failure.                                      |
| **20** | v1/escrow.ts  | `.catch(...)` if tx fails → toast                                                                                                                                                                                                                                                                                                                                                              | —                                                    | No                                                                                            |
| **21** | —             | **Recovery (only on next load):** When `getContracts()` runs (e.g. user opens contracts tab), if a contract has PendingAcceptance (with txHash) > 5 min old and no FundsReleased, `recoverMissingFundsReleasedEvent(escrowId, contractEventId, transactionHash)` is called (fire-and-forget `.catch(() => {})`). It fetches receipt; if confirmed, calls `publishEscrowStatus(FundsReleased)`. | Triggered by **getContracts** in nostrContract.ts    | **One-time** when loading contracts; no scheduled retry.                                      |

**Resilience gaps (acceptTask):**

- **FundsReleased (step 17):** Same as completeTask confirmed status: if `publishEscrowStatus(FundsReleased)` fails, chain is already updated; Nostr can stay at PendingAcceptance. Only recovery is **recoverMissingFundsReleasedEvent** when the user later loads contracts (and sees stale PendingAcceptance > 5 min).
- **updateTask(COMPLETED) (step 18):** If it throws (e.g. task not found, auth, relay error), we only `console.error`. Task Nostr event never gets COMPLETED; **no retry** in this flow. Self-healing (e.g. reconcileTaskStatusWithContracts) can fix task status when viewing dashboard, but that’s a different entry point.
- **Loading state:** Same as completeTask — success path never clears loading.

---

### 5.4 Summary: What is awaited vs fire-and-forget

| Phase                | completeTask                                                                                                     | acceptTask                                                                                                           |
| -------------------- | ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| **Before tx**        | ensureEscrowReady, estimateGas, tx send, **await publishEscrowStatus(PendingCompletion)**                        | Same; **await publishEscrowStatus(PendingAcceptance)**                                                               |
| **Return to UI**     | Returns `result` with `status: 'pending'` immediately after pending Nostr; **does not wait for tx confirmation** | Same                                                                                                                 |
| **After tx confirm** | **Fire-and-forget:** `tx.wait().then()` → publishEscrowStatus(Completed)                                         | **Fire-and-forget:** `tx.wait().then()` → publishEscrowStatus(FundsReleased) → onConfirmed() → updateTask(COMPLETED) |

So: **pending** Nostr is in the synchronous path (and can fail the whole operation). **Confirmed** Nostr and **task update** run in a callback that nothing awaits, so failures there are invisible to the caller and have no automatic retry in this flow.

---

### 5.5 Retry and recovery today

| What                              | Retry / recovery?                                                                                                                                                                     | Where                                                           |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| **Pending status (Nostr)**        | No retry; if it fails, the outer flow can throw and user can retry the whole action.                                                                                                  | escrow.ts (awaited before return)                               |
| **Confirmed status (Nostr)**      | **No retry** in completeTask or acceptTask. For **acceptTask** only: **recoverMissingFundsReleasedEvent** when loading contracts (stale PendingAcceptance > 5 min, no FundsReleased). | v1/escrow.ts (fire-and-forget); nostrContract.ts getContracts() |
| **updateTask(COMPLETED)**         | No retry. Reconciliation (reconcileTaskStatusWithContracts) can update task status when viewing dashboard, but not triggered by acceptTask.                                           | task.ts; dashboard reconciliation                               |
| **publishContractStatus** (inner) | On error: `console.warn` only; does not rethrow. So Nostr publish failure may not propagate to publishEscrowStatus.                                                                   | nostrContract.ts                                                |
| **Loading state**                 | Not cleared on success in ContractActions for complete/accept.                                                                                                                        | ContractActions.svelte                                          |

---

### 5.6 Recommendations for resilience (and gasless)

1. **Confirmed Nostr in same “transaction” as confirm:** Either await the full chain (tx.wait + publishEscrowStatus + onConfirmed) before resolving to the UI, or introduce a small “completion” workflow that polls receipt and then runs Nostr + onConfirmed with at least one retry and clear error reporting.
2. **Retry for confirmed status:** If publishEscrowStatus(Confirmed) fails inside tx.wait().then(), store (escrowId, contractEventId, txHash, status) in a local “pending Nostr sync” queue and retry on next app open or on a timer; or re-use the same recovery as FundsReleased (e.g. “stale PendingX without Confirmed” for all actions).
3. **onConfirmed (updateTask):** Same idea: on failure, enqueue “taskId → COMPLETED” and retry when loading dashboard or contracts, or surface “Task accepted on chain but status update failed; retry?” and call updateTask again.
4. **Loading state:** Set `setLoading('complete'/'accept', false)` after the **synchronous** part (e.g. after successful pending publish and tx broadcast), and optionally keep a separate “confirming…” state until tx + Nostr are done if you move to an awaited confirmation path.
5. **Gasless:** When the relay returns txHash, treat it like tx broadcast: publish **pending** status immediately (same as today). For **confirmed** status and onConfirmed, poll for receipt (or use relay webhook if you add one) then run the same Nostr + updateTask logic, with the same retry/recovery strategy as above.

---

## 6. Code Locations Reference

| Concern                              | Location                                              |
| ------------------------------------ | ----------------------------------------------------- |
| Escrow manager (routing)             | `src/lib/utils/escrow/index.ts`                       |
| V1 escrow logic                      | `src/lib/utils/escrow/v1/escrow.ts`                   |
| V1 bid/accept flow                   | `src/lib/utils/escrow/v1/escrowBid.ts`                |
| Nostr status publishing              | `src/lib/utils/escrow/v1/escrowEvents.ts`             |
| Nostr contract/status (publish, get) | `src/lib/utils/escrow/v1/nostrContract.ts`            |
| Contract actions UI                  | `src/lib/components/contracts/ContractActions.svelte` |
| Bid acceptance UI                    | `src/lib/components/bidding/BidAcceptanceForm.svelte` |
| Permissions                          | `src/lib/utils/helpers/contractPermissions.ts`        |
| Wallet / provider                    | `src/lib/stores/wallet.store.ts`                      |
| Nostr publish/encrypt                | `src/lib/utils/nostr.ts`                              |
| Task status (updateTask)             | `src/lib/nostr/task.ts`                               |
| Bid status update                    | `src/lib/utils/nostr-bid.ts` (sendBidStatusUpdate)    |
| Status messages/toasts               | `src/lib/utils/helpers/contractStatusFormatter.ts`    |
| V1 ABI                               | `src/lib/utils/escrow/v1/abi.json`                    |

---

## 7. Shared Transaction Pattern (All Write Operations)

Every write in `v1/escrow.ts` follows this pattern:

```typescript
// 1. Ensure wallet + contract + balance
const { contract, provider } = await ensureEscrowReady(contractAddress, true);

// 2. Get gas price
const feeData = await provider.getFeeData();
const gasPrice = feeData.gasPrice || BigInt(0);

// 3. Estimate gas
const gasEstimate = await contract.methodName.estimateGas(args, { gasPrice });

// 4. Send transaction (user signs and pays gas)
const tx = await contract.methodName(args, {
	gasLimit: gasEstimate + gasEstimate / 10n,
	gasPrice: gasPrice
	// + value for createEscrow
});

// 5. Optional: publish Nostr pending status
// 6. tx.wait() → on confirm: publish Nostr confirmed status, call onConfirmed if any
```

This is the single place where the gasless path must be injected: between step 4 and the RPC. Instead of `contract.methodName(...)`, the app would either:

- Build meta-tx payload (sender, data, signature), POST to relay, and track by relay response; or
- Try relay first, fall back to direct if relay fails or user opts in.

---

## 8. Observations for Gasless Integration

### 8.1 Ideal Candidates for Gasless (Post-Creation)

| Function               | Caller | Why Gasless Helps             |
| ---------------------- | ------ | ----------------------------- |
| `completeTask`         | Taskee | Taskees often have zero rBTC  |
| `acceptTask`           | Tasker | Tasker may have depleted rBTC |
| `cancelEscrow`         | Tasker | Same                          |
| `disputeTask`          | Tasker | Same                          |
| `proposeResolution`    | Either | Either may lack rBTC          |
| `acceptProposal`       | Either | Same                          |
| `resolveAfterTimelock` | Either | Same                          |

### 8.2 Keep Direct for Create Escrow

- `createEscrow` must remain direct (or otherwise funded by Tasker) because:
  - It is `payable` — Tasker sends `value: totalPayment`
  - The relay reimburses from the payment; there is no payment until escrow exists
- This aligns with the goal: "only the tasker that creates an escrow needs rBTC to start"

### 8.3 Abstraction Point for Gasless

The cleanest integration point is in `v1/escrow.ts` (and any v2 equivalent). Options:

1. **Strategy pattern:** Add `submitTransaction(strategy, methodName, args)` that:

   - `strategy === 'gasless'`: build meta-tx, call relay, poll for receipt
   - `strategy === 'direct'`: current `contract.methodName(...)`
   - Default: try gasless, fall back to direct on relay failure

2. **Per-method wrapper:** Each `completeTask`, `acceptTask`, etc. calls a shared `submitEscrowTx(methodName, args, options)` that encapsulates strategy selection.

3. **Relay client module:** New `src/lib/utils/escrow/relayClient.ts`:
   - `buildMetaTx(sender, contractAddress, methodName, args, chainId)`
   - `submitToRelay(sender, data, signature)` → `POST /relay`
   - Used by escrow layer when gasless is chosen

### 8.4 Signature Format (Relay Contract)

The relay README specifies:

- `sender` — signer address
- `data` — ABI-encoded calldata for the target function (e.g. `completeTask(escrowId)`)
- `signature` — EIP-191 over `hash(sender, contract, keccak256(data), chainId)`

The contract executes `executeMetaTransaction(sender, data, signature)`. The client must:

1. Encode `data` for the desired function
2. Compute the hash per relay spec
3. Sign with the user's wallet (no gas, just `signMessage`-style)

---

## 9. refundClient Gap

- **Contract:** `refundClient(escrowId)` — Freelancer-only, refunds client.
- **App:** Not exposed in `ContractActions` or `escrow/index.ts`. Permissions give freelancer `canCancel: true`, but `cancelEscrow` is client-only; the app does not call `refundClient`.
- **Impact:** If freelancer "Cancel" is ever wired, it would need `refundClient` and would follow the same transaction pattern (and benefit from gasless).

---

## 10. Summary Table: Transaction Entry Points

| Action             | Call Chain                                                              | File:Function           |
| ------------------ | ----------------------------------------------------------------------- | ----------------------- |
| Create escrow      | BidAcceptanceForm → acceptBidAndCreateEscrow → createEscrow             | escrowBid.ts, escrow.ts |
| Complete task      | ContractActions → escrowOps.completeTask → completeTask                 | escrow.ts               |
| Accept task        | ContractActions → escrowOps.acceptTask → acceptTask                     | escrow.ts               |
| Cancel escrow      | ContractActions → escrowOps.cancelEscrow → cancelEscrow                 | escrow.ts               |
| Dispute task       | ContractActions → escrowOps.disputeTask → disputeTask                   | escrow.ts               |
| Propose resolution | ContractActions → escrowOps.proposeResolution → proposeResolution       | escrow.ts               |
| Accept proposal    | ContractActions → escrowOps.acceptProposal → acceptProposal             | escrow.ts               |
| Resolve timelock   | ContractActions → escrowOps.resolveAfterTimelock → resolveAfterTimelock | escrow.ts               |

All of these (except createEscrow for the value reason) are candidates for gasless relay with direct fallback.

---

## 11. Gasless Plug-In Points, Fallback, and Retries

This section specifies **where** to plug the relay (minimal code change), **when** to fall back to direct, and **how** to add retries for relay and Nostr.

### 11.1 Where to Plug the Gasless / Relay Call

**Single insertion point (per write):** In `v1/escrow.ts`, the only place that must change is the **send** step. Today every non–createEscrow write does:

```
const tx = await contract.methodName(args, { gasLimit, gasPrice });
// then: result.hash = tx.hash, and later tx.wait().then(...)
```

Replace that with a single abstraction that returns a **transaction-like object** so the rest of the flow (pending Nostr, `tx.wait().then(...)`) stays unchanged.

**Concrete change:**

1. **New module** (e.g. `src/lib/utils/escrow/escrowSubmit.ts` or `relayClient.ts`):

   - `submitEscrowWrite(params): Promise<{ hash: string; wait: () => Promise<TransactionReceipt | null> }>`
   - Parameters: `{ method, args, value?, contract, wallet, provider, relayBaseUrl?, useGasless?: boolean }`
   - If gasless: build meta-tx (encode `data`, sign EIP-191), `POST /relay`, return `{ hash: body.txHash, wait: () => pollReceipt(provider, body.txHash) }`.
   - If direct: call `contract[method](...args, opts)`, return `{ hash: tx.hash, wait: () => tx.wait() }`.
   - The **only** place the app decides relay vs direct is inside `submitEscrowWrite`.

2. **In `v1/escrow.ts`** — for each write function (completeTask, acceptTask, cancelEscrow, disputeTask, proposeResolution, acceptProposal, resolveAfterTimelock):

   - Replace: `const tx = await contract.methodName(args, { gasLimit, gasPrice });`
   - With: `const { hash, wait } = await submitEscrowWrite({ method: 'completeTask', args: [escrowId], contract, wallet, provider, ... });`
   - Set `result.hash = hash`; then use `wait().then(async (receipt) => { ... })` instead of `tx.wait().then(...)` (same callback body).
   - Keep everything else unchanged.

3. **Do not change:** `escrow/index.ts`, `ContractActions.svelte`, or the signatures of `completeTask`, `acceptTask`, etc. Return type stays `Promise<ContractTransactionResult>` with `hash` and `status: 'pending'`.

**Summary:** The relay is plugged **only** inside the new `submitEscrowWrite` and at the single line per write in `v1/escrow.ts` where we currently call `contract.methodName(...)`. Confirmation stays "something that has `.wait()`" so existing `tx.wait().then(...)` becomes `wait().then(...)`.

### 11.2 When to Fall Back to Direct (Safely)

Fallback happens **inside** `submitEscrowWrite` so callers do not need to care. Use direct when:

| Check                        | When to fall back                                                                                          |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------- |
| **User preference**          | Explicit "use direct" or "relay disabled" (settings / feature flag) — skip relay entirely.                 |
| **createEscrow**             | Always direct (not in submitEscrowWrite; keep current createEscrow path).                                  |
| **Relay health (optional)**  | `GET /health` or `GET /info` fails — optional; can rely on "try relay, on error fall back" instead.        |
| **Relay POST error**         | `POST /relay` returns 4xx or 5xx, or network/timeout — fall back to direct. Treat 202 + txHash as success. |
| **Relay simulation failure** | Body indicates `SIMULATION_FAILED` (e.g. OnlyTaskee, revert) — do not retry relay; fall back to direct.    |
| **Relay submission failure** | `SUBMISSION_FAILED` or 502 — retry relay once (see §11.4) then fall back to direct.                        |

**Recommended minimal set:** (1) createEscrow always direct. (2) Other writes: try relay first; on any relay error → fall back to direct. (3) Optional: user setting "use direct only" skips relay.

### 11.3 Flow With Fallback (No Change to Callers)

```
submitEscrowWrite({ method, args, contract, wallet, provider, useGasless })
  if !useGasless or method === 'createEscrow' → direct path
  else: build meta-tx → POST /relay (with retries for 5xx/timeout)
    if 202 + txHash → return { hash: txHash, wait: () => pollReceipt(provider, txHash) }
    else → fall back to direct
  direct: tx = contract[method](...args, opts); return { hash: tx.hash, wait: () => tx.wait() }
```

Callers still: get `{ hash, wait }`, set `result.hash = hash`, call `wait().then(...)`. No changes to ContractActions or Nostr/task flow.

### 11.4 Retries: Relay and Nostr (Comprehensive)

**A. Relay (inside submitEscrowWrite / relay client):** POST /relay returns 5xx or timeout → retry up to **2** times (3 attempts total), backoff 1s, 2s, then fall back to direct. 4xx or SIMULATION_FAILED → no retry; fall back to direct. 202 + txHash → success.

**B. Nostr pending (before return to UI):** In `publishEscrowStatus` (escrowEvents.ts), on catch: retry same call up to **2** more times (1s, 2s delay). If all fail, rethrow so user can retry the action.

**C. Nostr confirmed + onConfirmed (inside wait().then(...)):** Option 1 — In v1/escrow.ts confirmation callback, wrap publishEscrowStatus(confirmed) and onConfirmed in a retry helper: **3** attempts, 1s delay. On final failure: log; optional push to sync queue. Option 2 — On failure, push job to a small queue; consumer (interval or on visibility) retries publishEscrowStatus + updateTask. **Recommendation:** Start with Option 1; add Option 2 later.

**D. Recovery on load:** Keep `recoverMissingFundsReleasedEvent` in getContracts (stale PendingAcceptance > 5 min). Extend to stale PendingCompletion without Completed (and other pending→confirmed pairs): when receipt confirmed, call publishEscrowStatus(confirmed).

### 11.5 File-Level Checklist (Minimal Changes)

| File                                               | Change                                                                                                                                                                                                                                            |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **New: relayClient.ts or escrowSubmit.ts**         | Build meta-tx; sign; POST /relay with retries; pollReceipt; return `{ hash, wait }`. Fallback: contract method → `{ hash: tx.hash, wait: () => tx.wait() }`.                                                                                      |
| **v1/escrow.ts**                                   | Per write (except createEscrow): replace `const tx = await contract.methodName(...)` with `const { hash, wait } = await submitEscrowWrite(...)`; use `wait()` for confirmation. In confirmation callback: retry Nostr + onConfirmed (3 attempts). |
| **v1/escrowEvents.ts**                             | In publishEscrowStatus: on catch, retry up to 2 times with delay, then rethrow.                                                                                                                                                                   |
| **v1/nostrContract.ts**                            | Optional: extend getContracts recovery to stale PendingCompletion etc. → publishEscrowStatus(confirmed) when receipt confirmed.                                                                                                                   |
| **ContractActions, escrow/index.ts, createEscrow** | No changes.                                                                                                                                                                                                                                       |

### 11.6 Env / Config

- Relay base URL: e.g. `VITE_RELAY_URL` (testnet/mainnet). Optional: `VITE_USE_GASLESS_DEFAULT=true|false` or user setting. Optional: `GET /health` before first use; cache 60s.

---

## 12. Next Steps (Pre-Implementation)

1. **Add relay client / submitEscrowWrite** — Build/sign meta-tx, POST /relay with retries, poll receipt, return `{ hash, wait }`; on relay failure fall back to direct (§11.1, §11.2).
2. **Wire submitEscrowWrite into v1/escrow.ts** — Replace the single send line per write; use `wait()` for confirmation. Keep createEscrow direct (§11.1, §11.5).
3. **Fallback checks** — As in §11.2; no change to callers.
4. **Nostr retries** — publishEscrowStatus: 2 retries for pending (§11.4 B); in confirmation callback: 3 retries for confirmed Nostr and onConfirmed (§11.4 C).
5. **Extend getContracts recovery** — Stale PendingCompletion (and other pending states) without confirmed → try publishEscrowStatus(confirmed) when receipt confirmed (§11.4 D).
6. **Optional: pending sync queue** — On confirmed-Nostr or onConfirmed failure, enqueue and process with retries on interval or next load (§11.4 C).
