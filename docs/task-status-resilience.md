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

## 5. Recommended order of work (when implementing)

1. ~~**P0-1**~~ — Done. Cache merge prefers newer by `createdAt` in findTasks.
2. **P1-1** — Surface updateTask failure in acceptTask (toast + optional retry/refresh).
3. **P1-3** — Verify backend: same response for same filter for auth vs no-auth (diagnostic).
4. **P2-1** — Audit task ID usage and add test for d-tag consistency.
5. **P2-2** — Optional needsRefresh + one bypass refetch on /tasks.
6. Then P1-2, P2-3, P3 items as capacity allows.

---

## 6. Reviewer / developer checklist

When changing task status flow or updateTask call sites, verify:

- [ ] **BidAcceptanceForm:** `props.task.id` passed to `updateTask` resolves (eventId or d-tag); task moves to IN_PROGRESS only from this path.
- [ ] **ContractActions:** `contractStore.getContractKey(contract, 'taskId')` is the stable task id (d-tag); COMPLETED is set only in **acceptTask**, not in completeTaskWithAttachments.
- [ ] **Tags:** `generateTaskTags` in task.ts includes `['S', taskData.status]` so Nostr event and content stay in sync.
- [ ] **Stores:** updateTask updates both `tasksStore` and `myTasksStore` when the task is in the list; matching uses d-tag / eventId / uniqueId consistently.
- [ ] **Error handling:** acceptTask path surfaces updateTask failure to the user (see P1-1); BidAcceptanceForm already shows toast on updateTask error.
- [ ] **Tests:** Consider integration test that mocks escrow + contract and asserts updateTask(COMPLETED) is called only from acceptTask.

---

## 7. References

- **Ownership and flow:** [task-status-flow.md](task-status-flow.md)
- **Deep dive (call chains, updateTask):** [plans/task-status-flow-logic-deep-dive.md](../plans/task-status-flow-logic-deep-dive.md)
- **Stale display bug (H1 merge fix, H2 backend, diagnostics):** [plans/task-status-stale-display-bug.md](../plans/task-status-stale-display-bug.md)
- **Code:** `src/lib/nostr/findTasks.ts`, `src/lib/nostr/task.ts` (updateTask), `src/lib/components/contracts/ContractActions.svelte`
