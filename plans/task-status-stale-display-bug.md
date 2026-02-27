# Bug: Task Status Stale on /tasks for Taskee (Account 2)

**Status:** Resolved  
**Related:** [feat-task-status-review-and-testing-plan.md](./feat-task-status-review-and-testing-plan.md), [task-status-flow-logic-deep-dive.md](./task-status-flow-logic-deep-dive.md)

**Resolution:** See §10 below. Root cause was Taskee publishing COMPLETED; task event is owned by Tasker. Fix: only Tasker publishes; COMPLETED via escrow onConfirmed after chain confirmation. Cache merge fix (H1) also implemented.

**Updated (pre-resolution):** Propagation/cache ruled out — user confirmed: cleared cache, logged out, logged back in as Account 2, still sees "In progress". Same data source as incognito/Account 3. Bug persists on clean login.

---

## 1. Summary

After the full task lifecycle (create → bid → accept → complete → accept funds), the task status displays inconsistently depending on who views it:

| Viewer                  | Route  | Expected              | Actual                                             |
| ----------------------- | ------ | --------------------- | -------------------------------------------------- |
| Account 1 (Tasker)      | /tasks | See task as Completed | Task **not shown** (by design: own tasks excluded) |
| Account 2 (Taskee)      | /tasks | See task as Completed | Task shows **In progress**                         |
| Incognito (no login)    | /tasks | See task as Completed | Task shows **Completed** ✓                         |
| Account 3 (third party) | /tasks | See task as Completed | Task shows **Completed** ✓                         |

**Core issue:** Account 2 (Taskee) sees stale "In progress" status on /tasks while others see correct "Completed".

**Key constraint:** Same backend/data source — incognito and Account 3 get correct data. Only Account 2 gets wrong data, even after full cache clear + fresh login.

---

## 2. Reproduction Steps

1. Account 1: Create task.
2. Account 2: Submit bid.
3. Account 1: Accept bid (task → In progress ✓).
4. Wait for start time.
5. Account 2: Mark task complete.
6. Account 1: Accept task to release funds.
7. Check /tasks:
   - Incognito: Completed ✓
   - Account 3: Completed ✓
   - Account 2: **In progress** ✗

---

## 3. Data Flow (Relevant Paths)

### 3.1 Who Updates the Task to COMPLETED? (Updated post-fix)

**Before fix (buggy):** Taskee called `updateTask(COMPLETED)` in `completeTaskWithAttachments`. Taskee's event was filtered out by findTasks (task.npub !== npub) because the task event is owned by the Tasker.

**After fix:** Only the Tasker publishes COMPLETED. The escrow `onConfirmed` callback runs after the accept tx confirms and calls `updateTask(taskId, { status: COMPLETED })`. Taskee never updates the task event.

### 3.2 Where Does /tasks Get Its Data?

- **Source:** `tasksStore` (from `findTasks`).
- **Cache:** `findTasks` has in-memory cache (TTL 5 min, keyed by filter).
- **Exclusions:** Logged-in users: tasks where `task.npub === user.npub` are **excluded** (own tasks).
- **Account 1:** Their task is excluded → not shown on /tasks (intended).
- **Account 2:** Task is NOT excluded → should appear.

### 3.3 What updateTask Does

1. Publishes new Nostr event (replaceable, same kind/pubkey/d-tag).
2. Calls `cleanupTasksCache()` and `cleanupMyTasks()`.
3. Updates `tasksStore` and `myTasksStore` in-memory if the task is found:
   ```ts
   const index = state.items.findIndex((task) => isMatchingTask(task));
   if (index === -1) return state; // No update if not found
   // ... replace item with updated task
   ```

### 3.4 When /tasks Loads Data

- **onMount:** Calls `loadNostrData()` if `!hasCachedData` (no items or search changed).
- **hasCachedData:** `$tasksStore.items.length > 0 && $tasksStore.searchParamsKey === currentSearchKey`.
- If `hasCachedData` → does **not** call `loadNostrData()`, uses existing store.

---

## 4. Hypotheses (Updated After Propagation Ruled Out)

### H1: Replaceable Event Cache Merge Keeps OLD Version (BUG CONFIRMED)

**Location:** `findTasks.ts` lines 270–278.

When the API returns and we have existing cached data (from a previous fetch in the same session), we merge:

```javascript
const existingIds = new Set(existingCached.data.map((t) => t.id));
const newTasks = filteredTasks.filter((t) => !existingIds.has(t.id));
allCachedTasks = [...existingCached.data, ...newTasks];
```

For **Nostr replaceable addressable events** (same kind, pubkey, d-tag; different event ids), multiple versions of the same task exist. We key by `task.id` (d-tag). When merging:

- **existingCached** has task X (id=abc) with status IN_PROGRESS (old version)
- **filteredTasks** has task X (id=abc) with status COMPLETED (new version)
- `existingIds.has(abc)` → true, so we **exclude** the COMPLETED version from `newTasks`
- We keep the OLD entry from `existingCached` and never add the new one
- `allCachedTasks` contains the STALE version
- `cache.set(cacheKey, { data: allCachedTasks })` — we cache stale
- **Store** is written from `filteredTasks` (fresh) — so the _current_ render is correct
- **Next cache HIT** uses `cached.data` → user sees stale IN_PROGRESS

**Why only Account 2?** Account 2 is the only one who would have had the task in cache from a _previous_ visit (when they bid/viewed it while IN_PROGRESS). Incognito and Account 3 never had a prior cache entry for this task. After cache clear + logout + login, cache should be empty… unless the cache survives in a way we didn’t expect, or there is another path that populates it with stale data.

**Fix:** When merging, prefer the **newer** version (higher `createdAt`), not the old one:

```javascript
const existingMap = new Map(existingCached.data.map((t) => [t.id, t]));
for (const task of filteredTasks) {
	const existing = existingMap.get(task.id);
	if (!existing || (task.createdAt ?? 0) > (existing.createdAt ?? 0)) {
		existingMap.set(task.id, task);
	}
}
allCachedTasks = Array.from(existingMap.values());
```

### H2: Backend Returns Different Data for Authenticated Taskee

**Context:** Logged-in requests include `Authorization: Bearer <token>` and `X-Device-ID` (see `axios.ts`).

The backend might:

- Use auth to personalize results (e.g. “tasks you’re involved in”)
- Merge a user-specific index (populated at bid/assign time) with the global index
- Prefer or include the user-specific version (IN_PROGRESS) over the global latest (COMPLETED)

Incognito and Account 3 have no auth → get only the global index → correct. Account 2 is authenticated and involved → gets merged/stale data.

**Check:** Temporarily call `findEvents` without auth (or from incognito) for Account 2’s session, or compare network responses for Account 2 vs incognito for the same filter.

### H3: Refetch Overwrites Optimistic Update — Ruled Out

User confirmed: full cache clear + fresh login; propagation/cache timing is not the cause.

### H5: Task Not in tasksStore When updateTask Runs

**Scenario:** Task on another page; `updateTask` doesn’t find it; no store update. Doesn’t explain stale data after full cache clear and fresh fetch.

### H6: Task ID Mismatch in isMatchingTask

**Scenario:** The task in `tasksStore` has `id` in a different format (e.g. event id vs d-tag) than `dTagValue` used in `updateTask`, so `findIndex` returns -1.

**Mitigation:** Both `findTasks` and `getTaskStableId` use d-tag when available; contract stores `getTaskStableId(task)`. Format should align.

---

## 5. Diagnostic: Verify Data Source

To determine if the bug is client-side (cache merge) or backend (auth-specific response):

1. **Compare API responses:** Open DevTools → Network. Log in as Account 2, go to /tasks. Find the `GET .../events?...` request. Copy the response. In incognito, load /tasks, capture the same request. Diff the responses — is the task event different (status, `created_at`)?
2. **Bypass auth:** Temporarily clear the access token (or use a private window with Account 2’s session) so the events request is unauthenticated. If the status becomes COMPLETED, the backend is returning different data for authenticated Taskee.
3. **Apply cache merge fix:** Implement the merge fix in §4 H1. If the bug disappears, the cache merge was at fault (e.g. cache not truly empty, or another code path).

---

## 6. Root Cause (Working Theory)

Most plausible:

1. **H2 (backend auth-specific):** The events API returns different task versions for authenticated vs anonymous requests; Account 2 gets the older IN_PROGRESS event from a user-specific index.
2. **H1 (cache merge):** If cache is not fully cleared, or another path repopulates it, the merge logic keeps the old replaceable event version and overwrites the new one on cache hit.

---

## 7. Resolution Plan

### 7.1 Short-Term Fixes

| Option                                                                 | Description                                                                                                                                                                          | Pros                                        | Cons                                                                 |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------- | -------------------------------------------------------------------- |
| **A. Invalidate findTasks cache on /tasks when coming from dashboard** | On /tasks mount, if user just completed a task (e.g. detect via a flag or recent activity), force refetch and/or don't use cached store.                                             | Targets the refetch path                    | Requires tracking "just completed" state                             |
| **B. Don't overwrite store with older data**                           | In `findTasks`, when updating `tasksStore`, merge instead of replace: for each task in the new fetch, compare `createdAt` or `updatedAt` with the existing task; keep the newer one. | Preserves in-memory updates                 | More complex; need a reliable "version" field                        |
| **C. Delay cache clear or add retry**                                  | After `updateTask`, wait briefly before considering the task "done", or retry the Nostr publish until confirmed.                                                                     | Improves consistency                        | Slower UX; may not fix propagation delay                             |
| **D. Force refetch with cache bypass after updateTask**                | After `updateTask` succeeds, set a "refresh tasks" flag. When user navigates to /tasks, bypass cache and refetch.                                                                    | Ensures fresh data on next visit            | Extra API call; still subject to propagation                         |
| **E. Don't clear findTasks cache on updateTask**                       | Remove `cleanupTasksCache()` from `updateTask`. Rely only on in-memory store update.                                                                                                 | Avoids refetch overwriting with stale cache | Next natural refetch could still overwrite; cache stays stale longer |

### 7.2 Recommended Approach

1. **Fix cache merge for replaceable events (H1):** In `findTasks.ts`, when merging with existing cache, prefer the task with higher `createdAt` for the same `id`. Prevents old replaceable event versions from overwriting newer ones in the cache.
2. **Diagnose backend (H2):** Compare `/events` responses for Account 2 vs incognito. If they differ, the backend is returning user-specific data; fix or adjust backend behavior.
3. **Optional:** Force refresh on /tasks after `updateTask` so the next visit bypasses cache and refetches.

### 7.3 Verification Steps

1. Add logging in `updateTask`: log when the task is found/not found in `tasksStore` and `myTasksStore`.
2. Add logging in `findTasks`: log when overwriting the store and whether any task had a newer `updatedAt` in the store.
3. Manually test the full flow; confirm Account 2 sees Completed on /tasks after completion.
4. Add an integration test: mock Nostr/API, simulate completion, assert store has COMPLETED and is not overwritten by a stale refetch.

---

## 8. Implementation Checklist

- [ ] Add `updatedAt` (or equivalent) to Task type if missing.
- [ ] Implement merge-by-version in `findTasks` when updating `tasksStore`.
- [ ] Add `needsRefresh` (or similar) to `tasksStore`; set it in `updateTask` after success.
- [ ] In /tasks `onMount`, if `needsRefresh`, clear it and force `loadNostrData()` (bypass cache).
- [ ] Add diagnostic logging (dev-only) for store updates and refetches.
- [ ] Verify fix with manual test (Account 2 completes → visits /tasks → sees Completed).
- [ ] Add/update tests.

---

## 9. References

- `src/lib/nostr/task.ts` — `updateTask`, `getTaskStableId`
- `src/lib/nostr/findTasks.ts` — cache, `tasksStore` updates (merge prefers newer by createdAt)
- `src/lib/components/contracts/ContractActions.svelte` — `completeTaskWithAttachments` (no updateTask), `acceptTask` (triggers escrow onConfirmed)
- `src/lib/utils/escrow/index.ts` — onConfirmed callback for updateTask(COMPLETED)
- `src/lib/utils/helpers/task-status-reconciliation.ts` — self-healing when viewing contracts
- `src/routes/tasks/+page.svelte` — `onMount`, `loadNostrData`, `hasCachedData`

---

## 10. Resolution (Implemented)

| Fix                          | Description                                                                                 | Location                                               |
| ---------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| **Ownership**                | Taskee no longer calls updateTask(COMPLETED). Only Tasker publishes via escrow onConfirmed. | ContractActions, escrow/index.ts                       |
| **Nostr after confirmation** | updateTask(COMPLETED) runs in onConfirmed when accept tx confirms on chain.                 | escrow/v1/escrow.ts, escrow/index.ts                   |
| **H1 Cache merge**           | When merging with existing cache, prefer task with higher `createdAt` per id.               | findTasks.ts                                           |
| **Self-healing**             | reconcileTaskStatusWithContracts syncs stale task status when viewing contracts.            | task-status-reconciliation.ts, DashboardContractsPanel |
