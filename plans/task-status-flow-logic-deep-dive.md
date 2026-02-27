# Task Status Flow — Logic Deep Dive

**Purpose:** Trace the task status flow through the codebase for Phase 2 of the feat/task-status review.

**Related:** [feat-task-status-review-and-testing-plan.md](./feat-task-status-review-and-testing-plan.md) §5 Phase 2

---

## 1. Task Status Lifecycle Overview

```
OPEN → BID_ACCEPTED → ESCROW_FUNDED → IN_PROGRESS → COMPLETED
  │         │               │               │            │
  │         │               │               │            └── Tasker accepts task / releases funds (ContractActions → acceptTask)
  │         │               │               └── Bid accepted, escrow created (BidAcceptanceForm)
  │         │               └── Client funds escrow (blockchain)
  │         └── Client accepts bid (triggers escrow creation)
  └── Initial state when task is created
```

**Task event ownership:** The task Nostr event is owned by the Tasker; only the Tasker should publish task status updates. See **docs/task-status-flow.md**.

**This branch touches these transitions:**

- **OPEN → IN_PROGRESS:** When Tasker accepts a bid (BidAcceptanceForm)
- **IN_PROGRESS → COMPLETED:** When Tasker accepts task and releases funds (ContractActions → acceptTask). **Not** when Taskee marks complete (completeTask).

---

## 2. Flow A: OPEN → IN_PROGRESS (Bid Acceptance)

**Nostr-after-confirmation:** Task status is updated only **after** the escrow tx confirms on chain. See [docs/task-status-resilience.md](../docs/task-status-resilience.md) §5.6.

### 2.1 Call Chain

```
User clicks "Accept" in BidAcceptanceForm
    │
    ├── handleSubmit()
    │       │
    │       ├── escrow.bidOps.acceptBidAndCreateEscrow(bid, task, btcPrice, 'RSK')
    │       │       │
    │       │       ├── [escrowBid.ts] Validates bid, calculates details
    │       │       ├── [escrow.ts] createEscrow() → broadcasts tx to blockchain
    │       │       ├── registerPendingContractByTxHash({ taskId, bidEventId, ... })
    │       │       └── Returns { success: true, transactionResult: { hash } }
    │       │
    │       └── if (result.success && result.transactionResult)
    │               │
    │               ├── currentScreen = 'success'
    │               └── sendLocationsToTaskee(...)  // if in-person; skipped for remote
    │
    │  (async, when escrow tx confirms)
    │
    └── Blockchain emits EscrowCreated event
            │
            └── handleEscrowCreated(event)  [escrowEvents.ts]
                    │
                    ├── publishContractEvent(...)
                    ├── sendBidStatusUpdate(...)
                    └── updateTask(pendingContract.taskId, { status: IN_PROGRESS })  ◄── TASK STATUS UPDATE
                            └── [task.ts] updateTask() → Nostr addressable event (same kind/pubkey/d-tag)
```

### 2.2 Key Files and Lines

| Step               | File                        | Description                                                             |
| ------------------ | --------------------------- | ----------------------------------------------------------------------- |
| Entry point        | `BidAcceptanceForm.svelte`  | `handleSubmit()` — triggers escrow creation                             |
| Escrow creation    | `escrowBid.ts`              | `acceptBidAndCreateEscrow()`                                            |
| Escrow tx confirm  | Blockchain → event listener | EscrowCreated event emitted                                             |
| Task status update | `escrowEvents.ts`           | `handleEscrowCreated()` → `updateTask(taskId, { status: IN_PROGRESS })` |
| updateTask impl    | `task.ts`                   | Fetches original task, merges updates, publishes Nostr event            |

### 2.3 Task ID Handling

- **`pendingContract.taskId`** — From `registerPendingContractByTxHash`; same as `props.task.id` from the Nostr task event. Can be:
  - **Event ID** (64 hex): `isEventId = /^[0-9a-fA-F]{64}$/.test(taskId)` → fetch via `nostrEventsService.findEventById(taskId)`
  - **d-tag**: fetch via `nostrEventsService.requestEvents({ filters: [{ kinds: [KINDS.TASK_CREATION], '#d': [taskId], limit: 1 }] })`
- **`updateTask`** resolves the original task, gets d-tag from `tags.find(t => t[0] === 'd')?.[1]`, then publishes a **replaceable addressable event** (same kind, pubkey, d-tag).

### 2.4 Order of Operations

1. **Escrow tx broadcast** — Blockchain transaction is sent.
2. **Pending contract registered** — `registerPendingContractByTxHash` stores taskId, bidEventId, etc.
3. **Success screen shown** — `currentScreen = 'success'`.
4. **Location message sent** — `sendLocationsToTaskee` (only for in-person; `isRemote` skips location data).
5. **Escrow tx confirms** — Blockchain emits EscrowCreated event.
6. **handleEscrowCreated** — Publishes contract event, bid status, then `updateTask(IN_PROGRESS)`.

**Important:** Task status is updated **after** the escrow tx confirms. Nostr task event stays in sync with chain state. See [task-status-resilience.md](../docs/task-status-resilience.md) §5.6.

### 2.5 Error Handling

- If `updateTask` in handleEscrowCreated throws → error logged; contract event and bid status already published. Self-healing (`reconcileTaskStatusWithContracts`) will fix when user views contracts.

---

## 3. Flow B: IN_PROGRESS → COMPLETED (Tasker accepts task / releases funds)

**Ownership:** The task event is owned by the Tasker. COMPLETED is set by the **Tasker** when they accept the task (release funds), not by the Taskee when they mark complete. See **docs/task-status-flow.md**.

### 3.1 Taskee marks complete (no task event update)

```
Taskee clicks "Complete" in ContractActions
    │
    ├── completeTaskWithAttachments(attachments)
    │       │
    │       ├── escrow.escrowOps.completeTask(contract, attachments)
    │       │       └── [escrow.ts] completeTask() → tx, PendingCompletion, then Completed on confirm
    │       │
    │       ├── (no updateTask — task event is owned by Tasker)
    │       ├── pushNotificationService.sendNotificationToNpubs(...)
    │       └── sendTaskCompletionMessageToTasker(...)
```

### 3.2 Tasker accepts task → COMPLETED (task status update)

**Nostr-after-confirmation:** Task status is updated only **after** the accept tx confirms on chain. See [docs/task-status-resilience.md](../docs/task-status-resilience.md) §5.6.

```
Tasker clicks "Accept" (release funds) in ContractActions
    │
    ├── acceptTask()
    │       │
    │       ├── escrow.escrowOps.acceptTask(contract)
    │       │       │  [escrow/index.ts wraps v1 acceptTask with onConfirmed]
    │       │       └── [escrow.ts] acceptTask() → tx, then tx.wait().then(onConfirmed)
    │       │               │
    │       │               └── onConfirmed() → updateTask(taskId, { status: COMPLETED })  ◄── TASK STATUS UPDATE
    │       │                       └── [task.ts] updateTask() → Nostr addressable event
    │       │
    │       ├── pushNotificationService.sendNotificationToNpubs(...)
    │       └── sendPaymentReleasedMessageToTaskee(...)
```

### 3.3 Key Files and Lines

| Step                | File                     | Description                                                                      |
| ------------------- | ------------------------ | -------------------------------------------------------------------------------- |
| Taskee complete     | `ContractActions.svelte` | `completeTaskWithAttachments()` — no task event update.                          |
| Tasker accept       | `ContractActions.svelte` | `acceptTask()` — triggers escrow acceptTask; no direct updateTask call.          |
| Escrow acceptTask   | `escrow/index.ts`        | Wraps handler; passes `onConfirmed` callback that calls `updateTask(COMPLETED)`. |
| Task status update  | `escrow/v1/escrow.ts`    | `tx.wait().then(() => options?.onConfirmed?.())` — after chain confirmation.     |
| Escrow completeTask | `escrow.ts`              | 507–574 — completeTask()                                                         |

### 3.4 Order of Operations

1. **Taskee:** completeTask on contract → PendingCompletion → (async) Completed on confirm. Task event stays IN_PROGRESS.
2. **Tasker:** acceptTask on contract → tx broadcast → tx confirms → `onConfirmed()` → `updateTask(COMPLETED)`.

### 3.5 Error Handling

- If `onConfirmed` (updateTask) throws → error logged in escrow layer; user not notified. Self-healing (`reconcileTaskStatusWithContracts`) will fix when user views contracts.
- Escrow errors are caught and shown via `appStore.showErrorToast`.

---

## 4. updateTask() — Central Implementation

### 4.1 Location

`src/lib/nostr/task.ts` lines 388–521.

### 4.2 Algorithm

1. **Resolve original task:**
   - If `taskId` is 64-char hex → `findEventById` or `getTaskById` (relay fallback).
   - Else → filter `#d`: [taskId] on `KINDS.TASK_CREATION`.
2. **Get d-tag** — From `originalTask.tags` or `uniqueId` in content.
3. **Merge updates** — `{ ...originalTaskData, ...updates, updatedAt }`.
4. **Re-translate** — Only if `title` or `description` changed.
5. **Generate tags** — Including `['S', taskData.status]` (status tag).
6. **Publish** — `getSignedEvent(event)` → `nostrEventsService.publishEvent(signedEvent)`.
7. **Update stores** — `tasksStore.update()` and `myTasksStore.update()` to replace matching task in-memory.
8. **Clear caches** — `cleanupTasksCache()`, `cleanupMyTasks()`.

### 4.3 Status in Tags

`generateTaskTags()` includes:

```ts
['S', taskData.status ?? TaskStatusEnum.OPEN];
```

So the Nostr event has both:

- **Content JSON:** `{ ..., status: "IN_PROGRESS", ... }`
- **Tag:** `['S', 'IN_PROGRESS']`

### 4.4 Store Update Logic

```ts
const isMatchingTask = (t) =>
  t.uniqueId === dTagValue || t.id === dTagValue || t.eventId === originalTask.id;

tasksStore.update((state) => {
  const index = state.items.findIndex((task) => isMatchingTask(task));
  if (index === -1) return state;
  // Replace item at index with merged updatedTask
  ...
});
```

Same pattern for `myTasksStore`.

---

## 5. Escrow Events vs Task Status

| Concern                                      | Handled By                         | When                                               |
| -------------------------------------------- | ---------------------------------- | -------------------------------------------------- |
| Task status (OPEN → IN_PROGRESS)             | escrowEvents.handleEscrowCreated   | When escrow tx confirms (Nostr after confirmation) |
| Task status (IN_PROGRESS → COMPLETED)        | escrow onConfirmed callback        | When accept tx confirms (Nostr after confirmation) |
| Contract creation (Nostr)                    | escrowEvents.handleEscrowCreated   | When escrow tx confirms                            |
| Bid status (ACCEPTED)                        | escrowEvents → sendBidStatusUpdate | When escrow tx confirms                            |
| Escrow status (PendingCompletion, Completed) | escrow.ts → publishEscrowStatus    | Before/after completeTask tx                       |
| Self-healing (sync stale task status)        | reconcileTaskStatusWithContracts   | When loading contracts (DashboardContractsPanel)   |

**Design note:** Task status updates happen **after** chain confirmation. See [task-status-resilience.md](../docs/task-status-resilience.md) §5.6.

---

## 6. Edge Cases and Considerations

### 6.1 Task ID Format

- `props.task.id` in BidAcceptanceForm comes from the Nostr task event. The event's `id` property is the 64-char hex event ID. Some code paths may use d-tag as "task id" for display/routing.
- **Risk:** If `task.id` is sometimes d-tag and sometimes eventId, `updateTask` handles both — but callers must pass a resolvable ID.

### 6.2 Nostr After Confirmation

- Both task status updates happen **after** blockchain confirmation (Nostr-after-confirmation strategy).
- **OPEN → IN_PROGRESS:** `handleEscrowCreated` runs only when escrow tx confirms; if tx fails, no task status update.
- **IN_PROGRESS → COMPLETED:** `onConfirmed` runs only when accept tx confirms; if tx fails, no task status update.
- **Self-healing:** If updateTask fails at confirmation time, `reconcileTaskStatusWithContracts` fixes when user views contracts (DashboardContractsPanel).

### 6.3 Concurrent Updates

- Nostr replaceable events: last write wins (kind:pubkey:d-tag).
- In-memory stores are updated immediately; caches cleared. Next fetch will get the published event.

### 6.4 Failure Isolation

- Task update failure in handleEscrowCreated: logged; contract event and bid status already published. Self-healing fixes when user views contracts.
- Task update failure in onConfirmed: logged in escrow layer; user not notified. Self-healing fixes when user views contracts.

---

## 7. Trace Checklist for Reviewer

- [ ] Confirm `pendingContract.taskId` in handleEscrowCreated comes from registerPendingContractByTxHash and resolves (eventId or d-tag).
- [ ] Verify `contractStore.getContractKey(contract, 'taskId')` returns a valid task ID for escrow index onConfirmed.
- [ ] Trace `generateTaskTags` to ensure status tag `['S', status]` is correct.
- [ ] Confirm store update logic matches tasks in both `tasksStore` and `myTasksStore`.
- [ ] Review error handling: self-healing mitigates silent failure; consider toast on onConfirmed failure.
- [ ] Consider adding integration test: mock escrow + task flow, assert updateTask called with correct status after confirmation.

---

## 8. References

| Document                                    | Section                                           |
| ------------------------------------------- | ------------------------------------------------- |
| feat-task-status-review-and-testing-plan.md | §5 Phase 2, §6 Testing Plan                       |
| task.enum.ts                                | TaskStatusEnum                                    |
| escrow.enum.ts                              | EscrowStatus (PendingCompletion, Completed, etc.) |
| docs/testing/README.md                      | Test commands                                     |
