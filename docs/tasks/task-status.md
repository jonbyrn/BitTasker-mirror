# Task Status — Comprehensive Reference

**Purpose:** Canonical documentation for the task status flow on the feat/task-status branch. Consolidates ownership, call chains, bug resolution, resilience, contracts loading, and debug visibility.

**Supersedes:** `docs/task-status-flow.md`, `docs/task-status-resilience.md`, and plans in `plans/` (task-status-stale-display-bug, task-status-flow-logic-deep-dive, feat-task-status-\*, debug-visibility-plan, contracts-loading-flow).

---

## 1. Task Event Ownership

- The **task event** (Nostr kind 31000, replaceable by d-tag) is **owned by the Tasker** (client who created the task).
- Only the **Tasker** should publish task status updates. The Taskee must not update the task event.
- Rationale: The task reflects the Tasker’s view of the workflow (e.g. “work done and I’ve released payment” = COMPLETED).

---

## 2. Status Lifecycle and Who Updates

| Status      | Set by | When                                                                                                                                      |
| ----------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| OPEN        | Tasker | Task creation.                                                                                                                            |
| IN_PROGRESS | Tasker | When escrow tx confirms (`handleEscrowCreated`), after Tasker accepts a bid.                                                              |
| COMPLETED   | Tasker | When accept tx confirms (escrow `onConfirmed`), after Tasker accepts the task and releases funds. **Not** when the Taskee marks complete. |

---

## 3. Completion Workflow

1. **Taskee** marks the task complete in the **smart contract** (completeTask with evidence).  
   → Escrow moves to PendingAcceptance; Taskee notifies Tasker.
2. **Tasker** reviews and **accepts** in the contract (acceptTask), releasing payment.  
   → Escrow moves to FundsReleased (final).

The task shows as **COMPLETED** only after step 2. Therefore:

- **Tasker** triggers `updateTask(taskId, { status: COMPLETED })` via the escrow **onConfirmed** callback after the accept tx confirms.
- **Taskee** must **not** call `updateTask(..., COMPLETED)` in `completeTaskWithAttachments`.

---

## 4. Implementation Reference

| Action           | Component / flow                              | Task event update                                                                    |
| ---------------- | --------------------------------------------- | ------------------------------------------------------------------------------------ |
| Create task      | Create task page                              | OPEN (Tasker).                                                                       |
| Accept bid       | BidAcceptanceForm → escrow creation           | IN_PROGRESS (Tasker) when escrow tx confirms — `handleEscrowCreated` in escrowEvents |
| Taskee completes | ContractActions → completeTaskWithAttachments | **None.** Taskee only does contract completeTask + notifications.                    |
| Tasker accepts   | ContractActions → acceptTask                  | **COMPLETED** (Tasker) when accept tx confirms — escrow `onConfirmed` callback       |

- **Task event updates:** `src/lib/nostr/task.ts` → `updateTask()`.
- **Call sites:** `escrowEvents.ts` handleEscrowCreated (IN_PROGRESS), `escrow/index.ts` onConfirmed (COMPLETED).
- **Self-healing:** `reconcileTaskStatusWithContracts` syncs stale status when viewing contracts.

---

## 5. Call Chains

### Flow A: OPEN → IN_PROGRESS (Bid Acceptance)

```
User clicks "Accept" in BidAcceptanceForm
    └── escrow.bidOps.acceptBidAndCreateEscrow(...)
            └── [escrowBid.ts] createEscrow() → tx broadcast
    (async, when escrow tx confirms)
    └── handleEscrowCreated(event) [escrowEvents.ts]
            └── updateTask(pendingContract.taskId, { status: IN_PROGRESS })
```

### Flow B: IN_PROGRESS → COMPLETED (Tasker Accepts)

```
Taskee: completeTaskWithAttachments → escrow.escrowOps.completeTask()
        (no updateTask — task event is owned by Tasker)

Tasker: acceptTask() → escrow.escrowOps.acceptTask(contract)
        └── tx.wait().then(onConfirmed) [escrow/index.ts]
                └── updateTask(taskId, { status: COMPLETED })
```

**Nostr-after-confirmation:** Task status is updated only **after** blockchain confirmation. Both IN_PROGRESS and COMPLETED happen after the relevant tx confirms.

---

## 6. updateTask Implementation

**Location:** `src/lib/nostr/task.ts`

1. Resolve original task (by event ID or d-tag).
2. Get d-tag from `originalTask.tags`.
3. Merge updates, generate tags including `['S', status]`.
4. Publish replaceable addressable event.
5. Update `tasksStore` and `myTasksStore` in-memory if task is found.
6. Clear caches: `cleanupTasksCache()`, `cleanupMyTasks()`.

---

## 7. Stale Display Bug — Root Cause and Resolution

**Bug:** Taskee saw "In progress" on /tasks while incognito and others saw "Completed."

**Root cause:**

1. **Ownership:** Taskee had been publishing COMPLETED; task event is owned by Tasker. Taskee’s event was filtered out (`task.npub !== npub` in findTasks).
2. **Cache merge (H1):** When merging fresh API results with existing cache, we kept the old replaceable event instead of the newer one.

**Resolutions implemented:**

| Fix                     | Description                                                                                 | Location                                               |
| ----------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| **Ownership**           | Taskee no longer calls updateTask(COMPLETED). Only Tasker publishes via escrow onConfirmed. | ContractActions, escrow/index.ts                       |
| **Nostr after confirm** | updateTask(COMPLETED) runs in onConfirmed when accept tx confirms.                          | escrow/v1/escrow.ts, escrow/index.ts                   |
| **H1 Cache merge**      | When merging with existing cache, prefer task with higher `createdAt` per id.               | findTasks.ts                                           |
| **Self-healing**        | reconcileTaskStatusWithContracts syncs stale task status when viewing contracts.            | task-status-reconciliation.ts, DashboardContractsPanel |

---

## 8. Resilience Checklist

### P0 — Critical

| ID   | Issue                         | Status | Notes                                            |
| ---- | ----------------------------- | ------ | ------------------------------------------------ |
| P0-1 | Cache merge keeps old version | Done   | Merge prefers newer by `createdAt` in findTasks. |

### P1 — High

| ID   | Issue                                   | Status    | Notes                                                       |
| ---- | --------------------------------------- | --------- | ----------------------------------------------------------- |
| P1-1 | updateTask fails silently in acceptTask | Partial   | Self-healing mitigates; consider toast on failure.          |
| P1-2 | Optimistic task status vs tx failure    | Addressed | Nostr-after-confirmation; no longer optimistic.             |
| P1-3 | Backend returns different data (auth)   | Pending   | Run diagnostic: compare /events for logged-in vs incognito. |

### P2 — Medium

| ID   | Issue              | Status   | Notes                                                      |
| ---- | ------------------ | -------- | ---------------------------------------------------------- |
| P2-1 | Task ID format     | Pending  | Ensure d-tag used consistently; audit call sites.          |
| P2-2 | No forced refresh  | Pending  | Optional needsRefresh + bypass cache on next /tasks visit. |
| P2-3 | Concurrent updates | Document | Last-write-wins; no code change.                           |

### P3 — Low

| ID   | Issue                                | Status   |
| ---- | ------------------------------------ | -------- |
| P3-1 | No automated test for COMPLETED flow | Partial  |
| P3-2 | Trace checklist in doc               | Done     |
| P3-3 | Store update when task not in list   | Document |

---

## 9. Contracts Loading and Reconciliation

### Flow

```
DashboardContractsPanel (onMount)
    ├── walletManager.initialize()
    ├── contractStore.loadContracts()
    │       └── nostrContract.getContracts() → Nostr DMs + loadEscrowDetails
    └── runTaskStatusReconciliation()
            └── reconcileTaskStatusWithContracts(taskerContracts, getTaskStatusFromStores)
                    └── For each contract needing sync: updateTask(taskId, { status })
```

### Key files

| Step           | File                           | Function                             |
| -------------- | ------------------------------ | ------------------------------------ |
| Entry          | DashboardContractsPanel.svelte | onMount                              |
| Load           | contract.store.ts              | loadContracts(), loadMoreContracts() |
| Fetch          | escrow/v1/nostrContract.ts     | getContracts()                       |
| Reconciliation | task-status-reconciliation.ts  | reconcileTaskStatusWithContracts()   |
| Update         | nostr/task.ts                  | updateTask()                         |

### taskId format

- Contract event stores `taskId` from `pendingContract.taskId` (ideally d-tag).
- `getTaskStatusFromStores` matches by `t.id === taskId`.
- Mismatch (d-tag vs event ID) can cause lookup failure; reconciliation may still call updateTask with event ID.

---

## 10. Debug Visibility

Enable before load:

```js
localStorage.debug = 'btasker:findTasks,btasker:contracts,btasker:reconcile,btasker:task';
// Or: localStorage.debug = 'btasker:*';
```

### Namespaces

| Namespace                 | Scope                                                        |
| ------------------------- | ------------------------------------------------------------ |
| btasker:findTasks         | Task list: API, cache, dedup, merge, store                   |
| btasker:contracts         | Contract loading: load, getContracts, Nostr query            |
| btasker:reconcile         | Reconciliation: sync items, updateTask calls                 |
| btasker:task              | updateTask: taskId format, API/relay lookup                  |
| btasker:escrow:events     | Contract lifecycle: handleEscrowCreated, publishEscrowStatus |
| btasker:escrow:bid        | Accept-bid flow: acceptBidAndCreateEscrow, tx, cleanup       |
| btasker:mediaUploader     | Task completion: file selection, validation, upload          |
| btasker:completion:upload | TaskCompletionModal: handleFileUpload, handleCompleteTask    |

### Key log points

- **findTasks merge** — Check if completed task is excluded; merge should prefer higher `createdAt`.
- **reconcile sync items** — taskIds needing update, expected vs current status.
- **updateTask** — taskId format, success/failure.

---

## 11. Reviewer / Developer Checklist

When changing task status flow or updateTask call sites:

- [ ] **BidAcceptanceForm:** Task moves to IN_PROGRESS only from `handleEscrowCreated`, not directly.
- [ ] **ContractActions:** `contractStore.getContractKey(contract, 'taskId')` is the stable task id; COMPLETED only in **acceptTask** (via onConfirmed), not in completeTaskWithAttachments.
- [ ] **Tags:** `generateTaskTags` includes `['S', taskData.status]`.
- [ ] **Stores:** updateTask updates both `tasksStore` and `myTasksStore` when task is in list.
- [ ] **Error handling:** Consider toast on updateTask failure in onConfirmed (P1-1).
- [ ] **Tests:** Consider integration test for updateTask(COMPLETED) only from acceptTask path.

---

## 12. References

| Area             | Path                                                  |
| ---------------- | ----------------------------------------------------- |
| updateTask       | `src/lib/nostr/task.ts`                               |
| findTasks        | `src/lib/nostr/findTasks.ts`                          |
| Escrow events    | `src/lib/utils/escrow/v1/escrowEvents.ts`             |
| Escrow index     | `src/lib/utils/escrow/index.ts`                       |
| Reconciliation   | `src/lib/utils/helpers/task-status-reconciliation.ts` |
| Contract store   | `src/lib/stores/contract.store.ts`                    |
| Contract actions | `src/lib/components/contracts/ContractActions.svelte` |
| Task enum        | `src/lib/utils/enums/task.enum.ts`                    |
