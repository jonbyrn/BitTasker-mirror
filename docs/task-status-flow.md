# Task status flow and event ownership

**Purpose:** Define who owns the task Nostr event, who may update it, and when each status is set. This ensures the task event stays consistent with the contract lifecycle and avoids wrong actors publishing updates.

---

## 1. Task event ownership

- The **task event** (Nostr kind 31000, replaceable by d-tag) is **owned by the Tasker** (client who created the task).
- Only the **Tasker** should publish task event updates (status and content). The Taskee must not update the task event.
- Rationale: The task is the Tasker’s request; status reflects the Tasker’s view of the workflow (e.g. “work done and I’ve released payment” = COMPLETED).

---

## 2. Status lifecycle and who updates

| Status      | Set by | When                                                                                                                                    |
| ----------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| OPEN        | Tasker | Task creation.                                                                                                                          |
| IN_PROGRESS | Tasker | When escrow tx confirms (handleEscrowCreated), after Tasker accepts a bid.                                                              |
| COMPLETED   | Tasker | When accept tx confirms (escrow onConfirmed), after Tasker accepts the task and releases funds. **Not** when the Taskee marks complete. |

Other statuses (BID_ACCEPTED, ESCROW_FUNDED, CANCELLED, DISPUTED, etc.) follow the same rule: only the Tasker publishes task event updates.

---

## 3. Completion workflow (why COMPLETED is set by Tasker)

The full completion flow is:

1. **Taskee** marks the task complete in the **smart contract** (completeTask with evidence).  
   → Escrow moves to PendingAcceptance; Taskee notifies Tasker.
2. **Tasker** reviews and **accepts** in the contract (acceptTask), releasing payment.  
   → Escrow moves to FundsReleased (final).

The task should show as **COMPLETED** only after step 2, i.e. when the Tasker has accepted and released funds. Therefore:

- **Tasker** triggers `updateTask(taskId, { status: COMPLETED })` via the escrow **onConfirmed** callback, which runs after the accept tx confirms on chain.
- **Taskee** must **not** call `updateTask(..., COMPLETED)` in completeTaskWithAttachments. The Taskee only updates the contract (completeTask); the task event is updated by the Tasker when they accept.

If the Taskee updated the task event to COMPLETED as soon as they marked complete, the UI would show “Completed” before the Tasker has accepted and released funds, which is incorrect.

---

## 4. Implementation reference

| Action           | Component / flow                              | Task event update                                                                    |
| ---------------- | --------------------------------------------- | ------------------------------------------------------------------------------------ |
| Create task      | Create task page                              | OPEN (Tasker).                                                                       |
| Accept bid       | BidAcceptanceForm.svelte → escrow creation    | IN_PROGRESS (Tasker) when escrow tx confirms — `handleEscrowCreated` in escrowEvents |
| Taskee completes | ContractActions → completeTaskWithAttachments | **None.** Taskee only does contract completeTask + notifications.                    |
| Tasker accepts   | ContractActions → acceptTask                  | **COMPLETED** (Tasker) when accept tx confirms — escrow `onConfirmed` callback       |

- **Task event updates:** `src/lib/nostr/task.ts` → `updateTask()`.
- **Call sites:** `escrowEvents.ts` handleEscrowCreated (IN_PROGRESS), `escrow/index.ts` onConfirmed (COMPLETED).
- **Self-healing:** `reconcileTaskStatusWithContracts` in DashboardContractsPanel syncs stale status when viewing contracts.

---

## 5. Resilience and hardening

Risks, priorities, and recommended actions (without implementing them) are in **[task-status-resilience.md](task-status-resilience.md)**. Use it as a checklist for cache merge, silent updateTask failure, backend verification, task ID consistency, and tests.

---

## 6. See also

- **Resilience checklist:** [task-status-resilience.md](task-status-resilience.md) — P0–P3 items, risk vectors, how to deal with them.
- **Plans:** `plans/task-status-flow-logic-deep-dive.md` — detailed call chains and order of operations.
- **Enums:** `src/lib/utils/enums/task.enum.ts` — `TaskStatusEnum.COMPLETED` comment.
