# Escrow v2 Nostr Event Architecture

## Purpose

This document defines the proposed Nostr event architecture for Escrow v2.

Goals:

- Keep **tasks** updateable via stable `d` tags
- Keep **contracts** anchored to the stable on-chain identifier (`paymentId`)
- Preserve **contract status history** as append-only events
- Move **task status updates to tx submission time** (as soon as we get a `txHash`)
- Add a recovery path so app disconnects do not leave Nostr and blockchain out of sync

---

## 1. Current v1 Model

### Task events

- Kind: `31000` (`KINDS.TASK_CREATION`)
- Identity: `d` tag
- Update model: publish a new event with the same `d`

This is already the correct pattern for mutable task state.

### Contract root events

- Kind: `30006` (`KINDS.CONTRACT`)
- Identity: `d = escrowId`
- Current usage: created once after escrow funding confirms on-chain

### Contract status events

- Kind: `31006` (`KINDS.CONTRACT_STATUS`)
- Current linkage:
  - `e = contractEventId`
  - `r = escrowId`
- Current usage: append-only lifecycle history (`PendingCompletion`, `Completed`, etc.)

### Main v1 weakness

Task updates that depend on contract actions are often published in `onConfirmed` callbacks.
If the user closes the app after the tx is submitted but before confirmation handling runs, the chain may be correct while the task event is never updated.

---

## 2. Core Design Principles for v2

### P1. `paymentId` is the canonical contract identity

For v2, the stable identity is the on-chain `paymentId` (the codebase may still call this `escrowId` in some places during migration).

The system should treat:

- `paymentId` as the primary contract identifier
- `contractEventId` as a secondary reference

### P2. Tasks remain `d`-tag addressable

Task events continue to use a stable `d` tag and are updated by republishing the task with the same `d`.

### P3. Contract root event is a root snapshot

The root contract event exists to anchor:

- task relationship
- participants
- amount
- contract version
- contract address

It is not the main carrier of lifecycle transitions.

### P4. Contract status remains append-only

Contract lifecycle changes should continue to be modeled as append-only status events.
This preserves history and avoids replacing earlier lifecycle information.

### P5. Task status updates happen on tx submission

If the frontend receives a `txHash`, it should immediately publish the corresponding task update.

This applies to both:

- direct transactions
- gasless relay transactions

Rationale:

- once we have a `txHash`, the transaction has been accepted for submission
- this removes the v1 failure window where the user disconnects before `onConfirmed` runs
- confirmation can still be handled later by reconciliation

---

## 3. Proposed Event Model

## 3.1 Task Event

### Kind

- `KINDS.TASK_CREATION = 31000`

### Identity

- `d = taskStableId`

### Update rule

- Always update task state by republishing the task with the same `d`
- Never depend on old task event ids for long-lived updates

### Query rule

- Query latest task state by `#d`

---

## 3.2 Contract Root Event

### Kind

- `KINDS.CONTRACT = 30006`

### Identity

- `d = paymentId`

### Required tags

- `d = paymentId`
- `t = taskId`
- `p = taskerPubkey`
- `p = taskeePubkey`
- `n = network`
- `v = v2`
- `m = contract`

### Required content

- `paymentId` / `escrowId`
- `taskId`
- `taskTitle`
- `taskDescription`
- `taskerPubkey` / `clientPubkey`
- `taskeePubkey` / `freelancerPubkey`
- `amount`
- `estimatedStartTime`
- `estimatedCompletionTime`
- `contractAddress`
- `transactionHash`

### Publishing rule

- Publish the contract root event only when `paymentId` is known
- For `createPaymentContract`, this means **after chain confirmation**, because the UI does not know the on-chain id at tx submission time

### Important note

For creation we cannot rely only on tx submission, because `paymentId` is not available until the receipt / event is parsed.
So the creation flow is special:

1. tx submitted -> task update can happen immediately
2. tx confirmed -> root contract event can be published

---

## 3.3 Contract Status Event

### Kind

- `KINDS.CONTRACT_STATUS = 31006`

### Role

- Append-only contract lifecycle history

### Required tags

- `r = paymentId`
- `e = contractEventId` (secondary link to root event)
- `p = recipientPubkey`
- `s = action`
- `v = v2`
- `m = contract-status`

### Required content

- `paymentId` / `escrowId`
- `contractEventId`
- `action`
- `message`
- `transactionHash`
- `timestamp`
- optional action-specific fields:
  - `completionAttachments`
  - `proposedClientAmount`
  - `proposedFreelancerAmount`

### Query rule

- Query status history primarily by `paymentId` (`#r`)
- Keep `e = contractEventId` as a secondary integrity/reference tag

This is the key improvement over the mental model in v1: the history should be anchored first to the stable on-chain id, not only to the root Nostr event id.

---

## 4. Submission-Time Task Update Rules

Task status updates should happen as soon as a tx is submitted and the frontend has `txHash`.

This means the task update moves out of `onConfirmed` and into the post-submit path.

## 4.1 Mapping table

| Blockchain action                                   | Submit-time task update                                                            | Confirm-time contract status                                                       |
| --------------------------------------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `createPaymentContract`                             | `IN_PROGRESS` (minimum viable behavior; see note below)                            | root contract event published after `PaymentContractCreated`                       |
| `completeTask`                                      | no task change                                                                     | `Completed` contract status                                                        |
| `acceptTask`                                        | `COMPLETED`                                                                        | `FundsReleased` contract status                                                    |
| `disputeTask`                                       | `DISPUTED`                                                                         | `InDispute` contract status                                                        |
| `proposeResolution`                                 | `DISPUTE_PROPOSAL`                                                                 | `DisputeResolutionProposed` contract status                                        |
| `acceptProposal` (tasker accepts)                   | `COMPLETED`                                                                        | `DisputeResolved` contract status                                                  |
| `resolveAfterTimelock` when it finishes payout path | `COMPLETED`                                                                        | `FundsClaimed` or `DisputeUnresolved` contract status depending on on-chain result |
| `cancelPaymentContract`                             | optional `CANCELLED` if product wants task-level cancellation mirrored immediately | `Cancelled` contract status                                                        |
| `claimNoShowRefund`                                 | optional `REFUNDED` if product wants task-level refund mirrored immediately        | `Refunded` contract status                                                         |

### Note on `createPaymentContract`

The current v1 behavior updates task to `IN_PROGRESS` after confirmation.
For v2, the minimum viable improvement is:

- keep the same target task status (`IN_PROGRESS`)
- move it to tx submission time

If product wants finer semantics later, this could be changed to:

- submit-time: `ESCROW_FUNDED`
- later action: `IN_PROGRESS`

But that is a product/UI decision, not a structural requirement for the Nostr architecture.

---

## 5. Lifecycle Flows

## 5.1 Create Payment Contract

### Submit-time

1. Tasker submits `createPaymentContract`
2. Frontend receives `txHash`
3. Frontend immediately updates task event by `d`:
   - task status -> `IN_PROGRESS`
4. Frontend stores a local pending sync record keyed by `txHash`

### Confirm-time

1. Receipt is parsed
2. `PaymentContractCreated` yields `paymentId`
3. Root contract event is published with `d = paymentId`
4. Optional initial contract status event may be published if needed
5. Pending sync record is marked complete

## 5.2 Complete Task

### Submit-time

1. Taskee submits `completeTask`
2. Frontend receives `txHash`
3. Publish `PendingCompletion` contract status event
4. Persist tx sync record

### Confirm-time

1. Receipt confirms
2. Publish `Completed` contract status event
3. Mark sync record complete

## 5.3 Accept Task

### Submit-time

1. Tasker submits `acceptTask`
2. Frontend receives `txHash`
3. Publish `PendingAcceptance` contract status event
4. Immediately update task event by `d`:
   - task status -> `COMPLETED`
5. Persist tx sync record

### Confirm-time

1. Receipt confirms
2. Publish `FundsReleased` contract status event
3. Mark sync record complete

## 5.4 Dispute / Resolution

### Submit-time

- `disputeTask` -> publish `PendingDispute`, update task to `DISPUTED`
- `proposeResolution` -> publish `PendingResolutionProposal`, update task to `DISPUTE_PROPOSAL`
- `acceptProposal` by tasker -> publish `PendingProposalAcceptance`, update task to `COMPLETED`
- `resolveAfterTimelock` payout path -> publish `PendingTimelockResolution`, update task to `COMPLETED` when the business outcome is final completion

### Confirm-time

- publish the matching confirmed contract status event based on the receipt / final on-chain state

---

## 6. Reliability Model

## 6.1 Local tx sync queue

Introduce a small persistent queue keyed by:

- `txHash`
- `paymentId` when available
- `taskId`
- `action`
- `submittedAt`

Each entry tracks whether the following have completed:

- task event updated
- pending contract status published
- confirmed contract status published
- root contract event published (creation only)

This queue should be persisted in local storage or IndexedDB so app close/reload does not lose the sync job.

## 6.2 Recovery on startup / screen load

On app startup, wallet init, or contracts/tasks screen load:

1. load pending tx sync jobs
2. for each txHash, fetch receipt
3. if not yet confirmed:
   - ensure submit-time task update and pending status have been published
4. if confirmed:
   - publish any missing confirmed contract status
   - publish root contract event if creation and `paymentId` can now be resolved
5. remove completed jobs

## 6.3 Reconciliation

Even with submit-time task updates, reconciliation is still needed.

Cases:

- user closed app before task update was published
- relay submitted tx but frontend crashed before Nostr publish
- tx was dropped/replaced
- status event published but task event failed

Reconciliation sources:

- blockchain receipt / current contract state
- root contract event by `paymentId`
- contract status history by `paymentId`
- current task event by task `d`

Rule:

- blockchain remains source of truth for contract state
- task event is user-facing synchronized state and may be corrected by reconciliation if it diverges

---

## 7. Integration Path

## 7.1 Data model changes

1. Keep `taskId` as stable task `d`
2. Keep `paymentId` / `escrowId` as stable contract id
3. Treat `contractEventId` as secondary, not primary
4. Extend local pending tx sync state to include task sync status

## 7.2 Escrow event publishing changes

1. Move task updates out of `onConfirmed`
2. After `txHash`:
   - publish pending contract status immediately
   - publish task update immediately when the action implies a task state transition
3. After receipt:
   - publish confirmed contract status
   - publish root contract event for creation once `paymentId` is known

## 7.3 Query / loading changes

1. Query root contract by `#d = paymentId`
2. Query contract status history by `#r = paymentId`
3. Keep `#e = contractEventId` as a cross-check / follow-up convenience

## 7.4 Store and recovery changes

1. Add tx sync queue manager
2. Resume sync queue on app startup
3. Add reconciliation pass for stale submitted txs
4. Reconcile task state from blockchain + contract history when needed

---

## 8. What Changes vs v1

### Kept

- Task events stay addressable by `d`
- Contract root event stays keyed by `d`
- Contract status stays append-only
- Blockchain stays source of truth for contract state

### Changed

- Task status updates move from confirm-time to submit-time
- `paymentId` becomes the canonical contract identity in docs and queries
- Recovery is explicit, persistent, and tx-hash based
- Contract status querying is conceptually keyed by `paymentId`, not only by root event id

---

## 9. Minimum Viable v2 Rollout

If we want the smallest safe change set, implement this first:

1. Keep current root/status event split
2. Move task updates to tx submission time
3. Add persistent tx sync queue
4. Reconcile any missing confirm-time status events on app startup
5. Query statuses by `paymentId` and keep `contractEventId` as secondary reference

This preserves the current model while removing the biggest reliability gap in v1.
