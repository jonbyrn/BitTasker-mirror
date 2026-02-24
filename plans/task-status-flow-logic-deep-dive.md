# Task Status Flow — Logic Deep Dive

**Purpose:** Trace the task status flow through the codebase for Phase 2 of the feat/task-status review.

**Related:** [feat-task-status-review-and-testing-plan.md](./feat-task-status-review-and-testing-plan.md) §5 Phase 2

---

## 1. Task Status Lifecycle Overview

```
OPEN → BID_ACCEPTED → ESCROW_FUNDED → IN_PROGRESS → COMPLETED
  │         │               │               │            │
  │         │               │               │            └── Freelancer completes task (ContractActions)
  │         │               │               └── Bid accepted, escrow created (BidAcceptanceForm)
  │         │               └── Client funds escrow (blockchain)
  │         └── Client accepts bid (triggers escrow creation)
  └── Initial state when task is created
```

**This branch touches these transitions:**

- **OPEN → IN_PROGRESS:** When Tasker accepts a bid (BidAcceptanceForm)
- **IN_PROGRESS → COMPLETED:** When Freelancer marks task complete (ContractActions)

---

## 2. Flow A: OPEN → IN_PROGRESS (Bid Acceptance)

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
    │               │
    │               ├── updateTask(props.task.id, { status: TaskStatusEnum.IN_PROGRESS })  ◄── TASK STATUS UPDATE
    │               │       │
    │               │       └── [task.ts] updateTask() → Nostr addressable event (same kind/pubkey/d-tag)
    │               │
    │               └── sendLocationsToTaskee(...)  // if in-person; skipped for remote
```

### 2.2 Key Files and Lines

| Step               | File                       | Lines   | Description                                                  |
| ------------------ | -------------------------- | ------- | ------------------------------------------------------------ |
| Entry point        | `BidAcceptanceForm.svelte` | 241–332 | `handleSubmit()`                                             |
| Escrow creation    | `escrowBid.ts`             | 202+    | `acceptBidAndCreateEscrow()`                                 |
| Task status update | `BidAcceptanceForm.svelte` | 284–290 | `updateTask(props.task.id, { status: IN_PROGRESS })`         |
| updateTask impl    | `task.ts`                  | 388–521 | Fetches original task, merges updates, publishes Nostr event |

### 2.3 Task ID Handling

- **`props.task.id`** — From Nostr `task` event. Can be:
  - **Event ID** (64 hex): `isEventId = /^[0-9a-fA-F]{64}$/.test(taskId)` → fetch via `nostrEventsService.findEventById(taskId)`
  - **d-tag**: fetch via `nostrEventsService.requestEvents({ filters: [{ kinds: [KINDS.TASK_CREATION], '#d': [taskId], limit: 1 }] })`
- **`updateTask`** resolves the original task, gets d-tag from `tags.find(t => t[0] === 'd')?.[1]`, then publishes a **replaceable addressable event** (same kind, pubkey, d-tag).

### 2.4 Order of Operations

1. **Escrow tx broadcast** — Blockchain transaction is sent.
2. **Pending contract registered** — `registerPendingContractByTxHash` stores taskId, bidEventId, etc.
3. **Success screen shown** — `currentScreen = 'success'`.
4. **Task status updated** — `updateTask` publishes Nostr event; updates `tasksStore` and `myTasksStore` in-memory.
5. **Location message sent** — `sendLocationsToTaskee` (only for in-person; `isRemote` skips location data).
6. **Async: Escrow confirmed** — `tx.wait()` in escrow.ts fires; `handleEscrowCreated` runs; `publishContractEvent`, `sendBidStatusUpdate`, etc.

**Important:** Task status is updated **before** the escrow tx is confirmed. The UI shows success immediately; the Nostr task event is updated right away. Escrow creation and contract event publish happen asynchronously when the tx confirms.

### 2.5 Error Handling

- If `updateTask` throws → error logged, toast shown (`task_status_update_error`), but bid acceptance is already considered successful (escrow tx was sent).
- Bid acceptance does **not** roll back if task update fails.

---

## 3. Flow B: IN_PROGRESS → COMPLETED (Contract Completion)

### 3.1 Call Chain

```
Freelancer clicks "Complete" in ContractActions
    │
    ├── completeTaskWithAttachments(attachments)
    │       │
    │       ├── Guards: canComplete, !isPending, !alreadyCompleted (blockchain check)
    │       │
    │       ├── escrow.escrowOps.completeTask(contract, attachments)
    │       │       │
    │       │       └── [escrow.ts] completeTask(escrowId, contractEventId, attachments)
    │       │               │
    │       │               ├── contract.completeTask(escrowId) → broadcasts tx
    │       │               ├── publishEscrowStatus(PendingCompletion) — BEFORE confirmation
    │       │               ├── tx.wait().then(...) — async:
    │       │               │       └── publishEscrowStatus(Completed) — AFTER confirmation
    │       │               └── Returns { hash, status: 'pending' } immediately
    │       │
    │       ├── updateTask(taskId, { status: TaskStatusEnum.COMPLETED })  ◄── TASK STATUS UPDATE
    │       │       └── [task.ts] updateTask() — same as Flow A
    │       │
    │       ├── pushNotificationService.sendNotificationToNpubs(...)
    │       └── sendTaskCompletionMessageToTasker(...)
```

### 3.2 Key Files and Lines

| Step            | File                     | Lines   | Description                                                                   |
| --------------- | ------------------------ | ------- | ----------------------------------------------------------------------------- |
| Entry point     | `ContractActions.svelte` | 177–236 | `completeTaskWithAttachments()`                                               |
| updateTask call | `ContractActions.svelte` | 199–205 | After `escrow.escrowOps.completeTask` returns                                 |
| Escrow complete | `escrow.ts`              | 507–574 | `completeTask()` — tx broadcast, PendingCompletion, then Completed on confirm |

### 3.3 Order of Operations

1. **Blockchain check** — `checkBlockchainCompletionStatus()` to avoid double-complete.
2. **Escrow tx broadcast** — `contract.completeTask(escrowId)`.
3. **PendingCompletion published** — Nostr contract status event (prevents double-submit).
4. **completeTask returns** — Does **not** await `tx.wait()`; returns immediately with `status: 'pending'`.
5. **updateTask called** — Task status → COMPLETED (optimistic: before blockchain confirmation).
6. **Notifications/messages** — Push + DM to Tasker.
7. **Async: tx confirms** — `publishEscrowStatus(Completed)` runs in tx.wait() callback.

**Important:** Task status is updated **optimistically** — right after tx broadcast, not after confirmation. The escrow Nostr status goes PendingCompletion → Completed when the tx confirms.

### 3.4 Error Handling

- `updateTask` is called with `.catch(err => console.error(...))` — failure does not surface to user; task may show IN_PROGRESS in Nostr while contract shows Completed locally.
- Escrow completion errors are caught and shown via `appStore.showErrorToast`.

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

| Concern                                      | Handled By                         | When                                                 |
| -------------------------------------------- | ---------------------------------- | ---------------------------------------------------- |
| Task status (OPEN → IN_PROGRESS)             | BidAcceptanceForm → updateTask     | After escrow tx broadcast, before confirmation       |
| Task status (IN_PROGRESS → COMPLETED)        | ContractActions → updateTask       | After completeTask tx broadcast, before confirmation |
| Contract creation (Nostr)                    | escrowEvents.handleEscrowCreated   | When escrow tx confirms                              |
| Bid status (ACCEPTED)                        | escrowEvents → sendBidStatusUpdate | When escrow tx confirms                              |
| Escrow status (PendingCompletion, Completed) | escrow.ts → publishEscrowStatus    | Before/after completeTask tx                         |

**Design note (from escrowEvents.ts:203):** "Task status update to IN_PROGRESS is done in BidAcceptanceForm.svelte to keep task logic out of escrow events."

---

## 6. Edge Cases and Considerations

### 6.1 Task ID Format

- `props.task.id` in BidAcceptanceForm comes from the Nostr task event. The event's `id` property is the 64-char hex event ID. Some code paths may use d-tag as "task id" for display/routing.
- **Risk:** If `task.id` is sometimes d-tag and sometimes eventId, `updateTask` handles both — but callers must pass a resolvable ID.

### 6.2 Optimistic vs Confirmed

- Both task status updates happen **before** blockchain confirmation.
- **OPEN → IN_PROGRESS:** If escrow tx fails, task could already show IN_PROGRESS. The escrow flow would clean up (`cleanupPendingContractByTxHash`) but would **not** revert the task status.
- **IN_PROGRESS → COMPLETED:** If completeTask tx fails, task could show COMPLETED. User would see error toast; Nostr task would be out of sync until manual correction or re-fetch.

### 6.3 Concurrent Updates

- Nostr replaceable events: last write wins (kind:pubkey:d-tag).
- In-memory stores are updated immediately; caches cleared. Next fetch will get the published event.

### 6.4 Failure Isolation

- Task update failure in BidAcceptanceForm: logged + toast; escrow/contract flow continues.
- Task update failure in ContractActions: only `console.error`; user not notified; contract/escrow may show completed but task may still show IN_PROGRESS elsewhere.

---

## 7. Trace Checklist for Reviewer

- [ ] Confirm `props.task.id` in BidAcceptanceForm is the value passed to `updateTask` and that it resolves (eventId or d-tag).
- [ ] Verify `contractStore.getContractKey(contract, 'taskId')` returns a valid task ID for ContractActions.
- [ ] Trace `generateTaskTags` to ensure status tag `['S', status]` is correct.
- [ ] Confirm store update logic matches tasks in both `tasksStore` and `myTasksStore`.
- [ ] Review error handling: is silent failure in ContractActions acceptable?
- [ ] Consider adding integration test: mock escrow + task flow, assert updateTask called with correct status at each transition.

---

## 8. References

| Document                                    | Section                                           |
| ------------------------------------------- | ------------------------------------------------- |
| feat-task-status-review-and-testing-plan.md | §5 Phase 2, §6 Testing Plan                       |
| task.enum.ts                                | TaskStatusEnum                                    |
| escrow.enum.ts                              | EscrowStatus (PendingCompletion, Completed, etc.) |
| docs/testing/README.md                      | Test commands                                     |
