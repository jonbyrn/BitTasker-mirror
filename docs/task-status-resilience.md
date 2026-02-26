# Task status flow — resilience checklist

**Purpose:** Document risks, priorities, and recommended actions to make the task status flow more resilient. This is a **planning and checklist** doc; implementation is not started here.

**Related:** [task-status-flow.md](task-status-flow.md) (ownership and who updates), [plans/task-status-flow-logic-deep-dive.md](../plans/task-status-flow-logic-deep-dive.md), [plans/task-status-stale-display-bug.md](../plans/task-status-stale-display-bug.md).

---

## 1. Current implementation state (as of last update)

- **Task event ownership:** Tasker only. Taskee does not update the task event.
- **COMPLETED:** Set by Tasker in `ContractActions → acceptTask` (after funds released), not by Taskee in `completeTaskWithAttachments`.
- **findTasks:** Dedup by task id (newest `createdAt` wins); “exclude own tasks” uses **task.npub** (event publisher). Since only Tasker publishes task events, the kept task’s npub is the task creator, so excluding where `task.npub === currentUser.npub` is correct.
- **Cache merge (P0-1 done):** When merging a new fetch with existing cache, we **prefer the version with higher `createdAt`** per task id (newer replaceable event wins). Verbose debug logs were removed; minimal `btasker:findTasks` logging remains for diagnostics.

---

## 2. Priority and risk scale

- **Priority:** P0 = critical, P1 = high, P2 = medium, P3 = low.
- **Risk vector:** Data consistency | UX | Correctness | Performance | Security (pick the main one).

---

## 3. Resilience checklist

### P0 — Critical (data correctness / wrong status shown)

| ID       | Risk vector      | Issue                                        | Recommendation                                                                                              | How to deal with it                                                                                                  |
| -------- | ---------------- | -------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| **P0-1** | Data consistency | ~~Cache merge keeps old replaceable event.~~ | **Done.** When merging with existing cache, for each task id we prefer the version with higher `createdAt`. | Implemented in `findTasks.ts`: merge builds a map by id and keeps the task with greater `createdAt` when both exist. |

---

### P1 — High (reliability / user-visible failures)

| ID       | Risk vector      | Issue                                                                                                                                                                                                                                                    | Recommendation                                                                                                                                                                | How to deal with it                                                                                                                                                                      |
| -------- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **P1-1** | UX / Correctness | **updateTask(COMPLETED) fails silently in acceptTask.** Only `console.error`; user is not notified. Contract shows funds released but task can stay IN_PROGRESS elsewhere.                                                                               | Surface failure to the user (toast) and/or retry; optionally set a “task update failed” flag so we can force refetch on next /tasks visit.                                    | In `ContractActions.svelte` acceptTask, replace `.catch(err => console.error(...))` with user-visible feedback and optional retry or “refresh tasks” hint.                               |
| **P1-2** | Correctness      | **Optimistic task status vs blockchain failure.** OPEN→IN_PROGRESS is applied before escrow tx confirms; IN_PROGRESS→COMPLETED is applied after acceptTask returns but before tx confirm. If the tx fails or is reverted, task status in Nostr is wrong. | Document as accepted trade-off; optionally add “revert task status” or manual refresh path when escrow/contract flow reports failure after we already called updateTask.      | Design: either keep optimistic behavior and document, or add a failure callback from escrow layer to revert/refresh task status when tx fails.                                           |
| **P1-3** | Data consistency | **Backend may return different events for authenticated vs anonymous** (e.g. user-specific index with older version). Taskee could still get stale status even with correct client merge.                                                                | Verify API: compare `/events` response for same filter for logged-in Taskee vs incognito. If backend returns different event sets/versions, fix or document backend behavior. | Run diagnostic (see plans/task-status-stale-display-bug.md §5); if backend is the cause, backend change or client-side workaround (e.g. force refetch, or merge by createdAt on client). |

---

### P2 — Medium (maintainability / edge cases)

| ID       | Risk vector | Issue                                                                                                                                                                                                                    | Recommendation                                                                                                                                        | How to deal with it                                                                                                                                                                                                                       |
| -------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **P2-1** | Correctness | **Task ID format mismatch.** Callers may pass event id vs d-tag; `updateTask` resolves both, but store match uses `isMatchingTask` (d-tag, eventId, uniqueId). Mismatch → task not found in store → no in-memory update. | Ensure contract and all call sites use **stable task id** (d-tag) consistently; document that `getTaskStableId(task)` is the canonical source.        | Audit: BidAcceptanceForm uses `props.task.id`; ContractActions uses `contractStore.getContractKey(contract, 'taskId')`. Ensure both resolve to d-tag where possible; add a test that updateTask finds the task in store when id is d-tag. |
| **P2-2** | UX          | **No forced refresh after updateTask.** User may have stale list until TTL or manual refresh.                                                                                                                            | Optional: after successful updateTask, set a “tasks list stale” flag; on next /tasks (or dashboard tasks) load, bypass cache once and refetch.        | Add a small store flag (e.g. `tasksStore.needsRefresh`) set in updateTask; consume in the page that shows the task list and trigger one refetch with cache bypass.                                                                        |
| **P2-3** | Correctness | **Concurrent updates.** Replaceable event is last-write-wins. Two tabs or delayed publish could reorder updates.                                                                                                         | Rely on Nostr semantics; ensure we always publish with latest known content (updateTask fetches original then merges). Document that last write wins. | No code change required; document in task-status-flow or deep-dive. Optional: add `updatedAt` (or event `created_at`) in task content so clients can prefer newer when merging.                                                           |

---

### P3 — Low (nice to have / hardening)

| ID       | Risk vector      | Issue                                                                                                                                                                                                                        | Recommendation                                                                                                                                                                   | How to deal with it                                                                                                                                                                  |
| -------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **P3-1** | Maintainability  | **No automated test for “COMPLETED only after Tasker accept”.** Regression could reintroduce Taskee updating task to COMPLETED.                                                                                              | Add an integration or unit test: mock ContractActions flow; assert updateTask(COMPLETED) is called only from acceptTask path, not from completeTaskWithAttachments.              | Test: mock escrow + contract store; trigger completeTaskWithAttachments and acceptTask separately; assert updateTask call count and arguments (status COMPLETED only on acceptTask). |
| **P3-2** | Maintainability  | **Trace checklist lives in plan only.** New contributors may miss ID format, store update, or error-handling checks.                                                                                                         | Move or duplicate the “Trace checklist for reviewer” into this doc or task-status-flow.md so it’s part of the canonical checklist.                                               | Copy the reviewer checklist from plans/task-status-flow-logic-deep-dive.md §7 into this doc under a “Reviewer / developer checklist” subsection.                                     |
| **P3-3** | Data consistency | **Store update in updateTask only if task is in list.** If the task isn’t in `tasksStore`/`myTasksStore` (e.g. different tab, different filter), in-memory state isn’t updated; next fetch will get the new status from API. | Accept current behavior; cache clear ensures next fetch is fresh. Optional: broad “invalidate tasks cache” or “mark list stale” when updateTask succeeds so next load refetches. | Document; optionally combine with P2-2 (needsRefresh).                                                                                                                               |

---

## 4. Summary table (priority × risk)

| Priority | Count    | Main risk                                                                              |
| -------- | -------- | -------------------------------------------------------------------------------------- |
| P0       | 1 (done) | ~~Stale status due to cache merge~~ → fixed: merge prefers newer by `createdAt`.       |
| P1       | 3        | Silent updateTask failure; optimistic vs tx failure; backend returning different data. |
| P2       | 3        | Task ID consistency; no forced refresh; concurrent updates.                            |
| P3       | 3        | Tests; reviewer checklist; store update when task not in list.                         |

---

## 5. Reliability: what’s wrong and what we can do

This section summarises the **reliability** issues (P1) and suggests options for discussion. No implementation yet.

### 5.1 What’s wrong

| Item     | What happens today                                                                                                                                                                                                                                                                      | Why it matters                                                                                                  |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| **P1-1** | In `acceptTask`, we call `updateTask(taskId, { status: COMPLETED }).catch(err => console.error(...))`. If the Nostr publish fails (network, relay, auth), the user sees success (funds released, notifications sent) but the task can still show IN_PROGRESS on /tasks or for others.   | User has no way to know the task status didn’t update; support/debugging is harder.                             |
| **P1-2** | We call `updateTask` right after `escrow.escrowOps.acceptTask(contract)` returns. The escrow layer returns as soon as the tx is _broadcast_; confirmation runs in the background (`tx.wait().then(...)`). If the tx later reverts or fails, we’ve already published COMPLETED to Nostr. | Rare but possible: Nostr says COMPLETED, chain says not released. Hard to revert automatically.                 |
| **P1-3** | Backend `/events` might return different event sets for authenticated vs anonymous (e.g. user-specific index). We haven’t verified.                                                                                                                                                     | If backend serves an older event to the Taskee, they could still see stale status despite correct client merge. |

### 5.2 P1-1: updateTask failure in acceptTask (silent)

**Options:**

| Option                              | Description                                                                                                                                    | Pros                                                       | Cons                                                                                      |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| **A. Toast on failure**             | In acceptTask, on updateTask reject: show an error/warning toast (e.g. “Task completed, but status update failed. Pull to refresh on Tasks.”). | Simple, user is informed, no new concepts.                 | User must remember to refresh; task list may stay wrong until then.                       |
| **B. Toast + retry once**           | Same as A, but retry updateTask once after a short delay; if retry fails, then show toast.                                                     | Often fixes transient failures.                            | Slightly more code; still need toast if retry fails.                                      |
| **C. Toast + “refresh tasks” flag** | On failure: show toast and set a flag (e.g. `tasksStore.needsRefresh`). On next /tasks or dashboard load, bypass cache once.                   | User gets fresh list on next visit without manual pull.    | Requires wiring the flag into the page that loads the list (P2-2).                        |
| **D. Await updateTask**             | Make acceptTask `await updateTask(...)` and on throw show toast and optionally keep loading state so user can retry.                           | Consistent with “everything succeeded or user sees error”. | Slower UX (wait for Nostr publish); if we still do notifications after, order is clearer. |

**Suggestion:** Start with **A** (toast on failure). Add **B** (retry once) if we see transient relay errors. Consider **C** when we implement P2-2 (needsRefresh) so one flag serves both “updateTask failed” and “list may be stale”.

### 5.3 P1-2: Task status vs tx confirmation (optimistic)

**Current behaviour:** We publish COMPLETED to Nostr as soon as the accept tx is _sent_, not when it’s _confirmed_. Escrow layer already publishes Nostr “PendingAcceptance” before confirm and “FundsReleased” after confirm; task status is updated optimistically.

**Options:**

| Option                                          | Description                                                                                                                                                                            | Pros                                               | Cons                                                                                                                                         |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| **A. Document and leave as is**                 | Treat as accepted trade-off: task status is optimistic; contract/escrow status reflects chain. If tx fails, user sees escrow error; we don’t revert task status.                       | No code change; matches current product behaviour. | If tx reverts, task can show COMPLETED while funds aren’t released (rare).                                                                   |
| **B. Update task status only after tx confirm** | Move updateTask to the escrow layer’s `tx.wait().then(...)` callback (e.g. after publishing FundsReleased). acceptTask would need a way to run “on confirm” logic (callback or event). | Task status and chain are in sync.                 | More coupling (escrow knows about task); acceptTask returns before confirm so UI would need to show “pending” until confirm for task status. |
| **C. Revert on tx failure**                     | If escrow layer ever calls back “tx failed” or “tx reverted”, call updateTask again to set status back to IN_PROGRESS (or leave and show a banner “Task status may be outdated”).      | Reduces divergence.                                | Escrow doesn’t currently expose a “tx failed” callback; would need design.                                                                   |

**Suggestion:** **A** for now: document in task-status-flow or resilience that task status is updated optimistically and that contract/escrow status is the source of truth for chain state. Revisit **B** or **C** only if we see real issues (e.g. tx reverts) or product wants “task COMPLETED only after confirm”.

### 5.4 P1-3: Backend returning different data (auth vs no-auth)

**Options:**

| Option                   | Description                                                                                                                                                                  | Pros                                        | Cons                                                                          |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- | ----------------------------------------------------------------------------- |
| **A. Diagnostic first**  | Compare `/events` response (same filter) for logged-in Taskee vs incognito (or same filter, no auth). Document whether backend returns different events.                     | Data-driven; we only change code if needed. | No immediate fix.                                                             |
| **B. Backend fix**       | If diagnostic shows backend returns user-specific or older events, fix backend so same filter → same event set.                                                              | Single source of truth.                     | Requires backend change and deploy.                                           |
| **C. Client workaround** | If we can’t change backend: e.g. force refetch without auth for task list, or merge by `createdAt` on client (we already do; so if backend sends both versions, we’re fine). | Works without backend.                      | Refetch without auth might change semantics; only needed if backend is wrong. |

**Suggestion:** **A** first (run diagnostic, document result). If backend is wrong, **B**. Use **C** only if **B** isn’t possible.

### 5.5 What to tackle next (reliability)

1. **P1-1** — Implement Option A (toast on updateTask failure in acceptTask). Optional: add one retry (Option B) or hook into a future needsRefresh (Option C).
2. **P1-3** — Run diagnostic (Option A); document and fix backend (B) or add workaround (C) only if needed.
3. **P1-2** — Document optimistic behaviour (Option A); no code change unless product asks for “COMPLETED only after confirm”.

### 5.6 Strategy: Nostr after confirmation + self-healing (implemented)

**Adopted strategy:** Publish task status to Nostr only **after** blockchain confirmation, plus self-healing when viewing contracts.

**Implementation outline:** (1) Move updateTask(IN_PROGRESS) from BidAcceptanceForm to handleEscrowCreated. (2) Add onConfirmed callback to escrow acceptTask; call updateTask(COMPLETED) there. (3) New `reconcileTaskStatusWithContracts` returns taskIds needing update. (4) Wire reconciliation when loading contracts with FundsReleased.

---

## 6. Recommended order of work (when implementing)

1. ~~**P0-1**~~ — Done. Cache merge prefers newer by `createdAt` in findTasks.
2. **P1-1** — Surface updateTask failure in acceptTask (§5.2: toast, optional retry or needsRefresh).
3. **P1-3** — Diagnostic then fix or workaround (§5.4).
4. **P2-1** — Audit task ID usage and add test for d-tag consistency.
5. **P2-2** — Optional needsRefresh + one bypass refetch on /tasks.
6. **P1-2** — Document optimistic task status (§5.3); no code change unless required.
7. Then P2-3, P3 items as capacity allows.

---

## 7. Reviewer / developer checklist

When changing task status flow or updateTask call sites, verify:

- [ ] **BidAcceptanceForm:** `props.task.id` passed to `updateTask` resolves (eventId or d-tag); task moves to IN_PROGRESS only from this path.
- [ ] **ContractActions:** `contractStore.getContractKey(contract, 'taskId')` is the stable task id (d-tag); COMPLETED is set only in **acceptTask**, not in completeTaskWithAttachments.
- [ ] **Tags:** `generateTaskTags` in task.ts includes `['S', taskData.status]` so Nostr event and content stay in sync.
- [ ] **Stores:** updateTask updates both `tasksStore` and `myTasksStore` when the task is in the list; matching uses d-tag / eventId / uniqueId consistently.
- [ ] **Error handling:** acceptTask path surfaces updateTask failure to the user (see P1-1); BidAcceptanceForm already shows toast on updateTask error.
- [ ] **Tests:** Consider integration test that mocks escrow + contract and asserts updateTask(COMPLETED) is called only from acceptTask.

---

## 8. References

- **Ownership and flow:** [task-status-flow.md](task-status-flow.md)
- **Deep dive (call chains, updateTask):** [plans/task-status-flow-logic-deep-dive.md](../plans/task-status-flow-logic-deep-dive.md)
- **Stale display bug (H1 merge fix, H2 backend, diagnostics):** [plans/task-status-stale-display-bug.md](../plans/task-status-stale-display-bug.md)
- **Code:** `src/lib/nostr/findTasks.ts`, `src/lib/nostr/task.ts` (updateTask), `src/lib/components/contracts/ContractActions.svelte`
