# Debug visibility plan

Use namespaced debug logs to trace contract lifecycle and task event processing. This helps diagnose issues like "API returns completed but UI shows In progress" (stale cache/merge) and contract creation flow for both parties.

## Enabling debug logs

1. **Before loading the app**, set in the browser console (or in Application → Local Storage):

   ```js
   localStorage.debug = 'btasker:findTasks';
   ```

   Then refresh. To see **all** BitTasker debug logs:

   ```js
   localStorage.debug = 'btasker:*';
   ```

2. **Namespaces** (set any combination, comma-separated):

   | Namespace               | Scope                                                                              |
   | ----------------------- | ---------------------------------------------------------------------------------- |
   | `btasker:findTasks`     | Task list: API, cache, dedup, merge, store                                         |
   | `btasker:escrow:events` | Contract lifecycle: pending registration, handleEscrowCreated, publishEscrowStatus |
   | `btasker:escrow:bid`    | Accept-bid flow: acceptBidAndCreateEscrow, validation, tx, cleanup                 |
   | `btasker:contracts`     | Contract loading: store load/loadMore, getContracts (Nostr query, per-contract)    |
   | `btasker:reconcile`     | Task status reconciliation: sync items, updateTask calls, getTaskStatus lookup     |
   | `btasker:task`          | Task updateTask: taskId format, API/relay lookup, success/failure                  |

   Examples:

   ```js
   localStorage.debug = 'btasker:findTasks,btasker:escrow:events';
   localStorage.debug = 'btasker:*';
   ```

3. **Init**: `initDebug()` runs in `+layout.ts` on load and calls `debug.enable(localStorage.debug)`. No logs appear until the corresponding namespace is enabled.

---

## findTasks: tracing "completed" vs "In progress"

When the API returns an event with status/S tag "completed" but the UI still shows "In progress", use findTasks logs to see where the newer event is dropped or overwritten.

### Log points

1. **`findTasks cache hit`**

   - We served from cache (no API call).
   - Check `cachedCount`, `sampleStatuses` (id, status, createdAt).
   - If a task has old status here, the next step is either cache was never updated with the new event, or we merged and kept the old version.

2. **`findTasks cache hit → store`**

   - What we write to the store from cache.
   - Compare `statuses` with API: if they differ, the bug is cache content or merge.

3. **`findTasks fetch start`**

   - API request is made (cache miss or expired).

4. **`findTasks api response`**

   - Raw API data: `eventsCount`, and for each event in `sample`: `eventId`, `dTag`, `contentStatus`, `sTag`, `created_at`.
   - Confirm the "completed" event is present and has the expected `contentStatus` / `sTag`.

5. **`findTasks after npub filter`**

   - Tasks after converting events and filtering out own tasks.
   - Check `sampleStatuses`: if "completed" is missing here, it was dropped by npub filter or `convertEventToTask`.

6. **`findTasks after dedup`**

   - After dedup by task id (keep higher `createdAt`).
   - Check `keptStatuses`: we should keep the "completed" version if it has the latest `created_at`.

7. **`findTasks merge with existing cache`** (only when there is existing cache)

   - **Critical for the bug**: we merge fresh API results with `existingCached`. For any task id already in cache we **do not** add the fresh version; we keep the existing one.
   - Logs: `excludedIds`, `excludedStatusInFresh` (status/createdAt from API), `statusInExistingForExcluded` (status/createdAt in cache).
   - If the completed task id is in `excludedIds` and `excludedStatusInFresh` is "completed" while `statusInExistingForExcluded` is "in_progress", the merge is keeping the old version. **Fix**: when merging, for the same id keep the task with higher `createdAt` (see `task-status-stale-display-bug.md`).

8. **`findTasks no existing cache`**

   - First load or cache expired; no merge.

9. **`findTasks fetch → store`**
   - What we write to the store after this fetch: `statusesWrittenToStore`, and what we put in cache: `cacheSampleStatuses`.
   - If "completed" appears in API and dedup but not in `statusesWrittenToStore`, the bug is in merge (see step 7) or in how we build `cleanTasks`/`limitedTasks` from `filteredTasks`.

### How to use this for the "completed" bug

1. Enable `btasker:findTasks`, go to `/tasks` as the account that still sees "In progress".
2. Force a fresh fetch (e.g. pull-to-refresh or wait for cache TTL and reload).
3. In the console:
   - Confirm **api response** shows the event with "completed" (contentStatus / sTag).
   - Confirm **after dedup** keeps that task with status "completed".
   - If **merge with existing cache** appears: check if that task id is in `excludedIds` and if `excludedStatusInFresh` is "completed" and `statusInExistingForExcluded` is "in_progress" → merge is the cause.
   - Check **fetch → store** and **cache hit → store**: the task should show "completed"; if it shows "in_progress", the source is either merge or cache from a previous request.

---

## Contract lifecycle (escrow:events, escrow:bid)

- **escrow:bid**: `acceptBidAndCreateEscrow start` → `escrowDetails` → `createEscrow` → `tx submitted` → `registerPendingContractByTxHash` (via escrowEvents) → `success`; on failure `acceptBidAndCreateEscrow failed` and optionally `cleanup`.
- **escrow:events**: `registerPendingContractByTxHash` (by txHash) or `registerPendingContract` (by escrowId); when escrow created: `handleEscrowCreated: publishing contract event` → … → `handleEscrowCreated: completed`; status updates: `publishEscrowStatus`; errors: `handleEscrowCreated: no pending contract`, `publishEscrowStatus failed`, etc.

Use these to verify both Tasker and Taskee flows (who registers pending, who receives escrow created, who publishes status).

---

## Contracts loading (btasker:contracts, btasker:reconcile)

See [contracts-loading-flow.md](./contracts-loading-flow.md) for the full flow map.

### Log points

1. **`contracts load start`** — `loadContracts()` called; wallet initialized.
2. **`contracts load result`** — Count, sample escrowIds, taskIds (d-tag vs event id).
3. **`getContracts start`** — Filter (limit, until, escrowIds, taskIds).
4. **`getContracts nostr query`** — Contract events count from Nostr.
5. **`getContracts per contract`** — escrowId, taskId format (d-tag vs 64-char hex), status from blockchain.
6. **`reconcile start`** — Contract count, contracts needing sync.
7. **`reconcile sync items`** — taskIds, expected status, current status from store.
8. **`reconcile updateTask`** — taskId, status, success/failure.
9. **`updateTask`** (btasker:task or extend) — taskId format, API/relay lookup result.

### How to use

1. Enable `btasker:contracts,btasker:reconcile`.
2. Open dashboard → Contracts tab, or click Refresh.
3. Trace: loadContracts → getContracts (Nostr + blockchain) → reconcile → updateTask.
4. For "Task not found" issues: check `taskId` format (d-tag vs event id) in getContracts per-contract and reconcile sync items.

---

## References

- `src/lib/utils/debug.ts`: `createDebug`, `initDebug`
- `src/routes/+layout.ts`: `initDebug()` on load
- `plans/task-status-stale-display-bug.md`: merge fix (prefer higher `createdAt` for same id)
- `plans/contracts-loading-flow.md`: contract loading flow map
- `src/lib/nostr/findTasks.ts`: cache key, cache hit/miss, API → dedup → merge → store
- `src/lib/stores/contract.store.ts`: loadContracts, loadMoreContracts
- `src/lib/utils/escrow/v1/nostrContract.ts`: getContracts
- `src/lib/utils/helpers/task-status-reconciliation.ts`: reconcileTaskStatusWithContracts
