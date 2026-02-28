# Dashboard Contracts Tab — Loading Flow Map

**Purpose:** Map how contracts are loaded on the dashboard contracts tab, and how reconciliation runs. Use this with `btasker:contracts` and `btasker:reconcile` debug namespaces to trace the flow.

**Related:** [debug-visibility-plan.md](./debug-visibility-plan.md), [task-status-resilience.md](../docs/task-status-resilience.md)

---

## 1. Flow Overview

```
DashboardContractsPanel (onMount)
    │
    ├── 1. walletManager.initialize()  [if needed]
    │
    ├── 2. contractStore.loadContracts()
    │       │
    │       └── escrow.contractOps.getContracts({ limit: 5 })
    │               │
    │               └── nostrContract.getContracts()
    │                       │
    │                       ├── queryNostrEvents(KINDS.CONTRACT, ...)  [Nostr DMs]
    │                       │   → contract events + attached CONTRACT_STATUS events
    │                       │
    │                       └── For each contract event:
    │                               ├── escrow.loadEscrowDetails(escrowId)  [blockchain]
    │                               │   → EscrowData (source of truth for status)
    │                               ├── determineContractState() → status, permissions
    │                               └── Build ContractWithEvents
    │
    └── 3. runTaskStatusReconciliation()
            │
            └── reconcileTaskStatusWithContracts(contracts, getTaskStatusFromStores)
                    │
                    ├── getTaskStatusSyncItems()  [which contracts need task status update]
                    │   └── For each contract: taskId from contractEvent.content.taskId
                    │
                    └── For each sync item:
                            updateTask(taskId, { status })  [Nostr task update]
```

---

## 2. Key Files

| Step           | File                             | Entry point / function                            |
| -------------- | -------------------------------- | ------------------------------------------------- |
| Entry          | `DashboardContractsPanel.svelte` | `onMount`                                         |
| Load           | `contract.store.ts`              | `loadContracts()`, `loadMoreContracts()`          |
| Fetch          | `escrow/v1/nostrContract.ts`     | `getContracts(filter)`                            |
| Query          | `utils/nostr.ts`                 | `queryNostrEvents()` (CONTRACT + CONTRACT_STATUS) |
| Blockchain     | `escrow/v1/escrow.ts`            | `loadEscrowDetails(escrowId)`                     |
| Reconciliation | `task-status-reconciliation.ts`  | `reconcileTaskStatusWithContracts()`              |
| Update         | `nostr/task.ts`                  | `updateTask(taskId, updates)`                     |

---

## 3. Data Flow

### 3.1 Contract event content (Nostr)

Contract events (encrypted DM, kind CONTRACT) contain:

- `escrowId` — blockchain escrow ID
- `taskId` — **task identifier** (d-tag or event ID; set when contract is created in `handleEscrowCreated` via `params.taskId` from `pendingContract.taskId`)
- `taskTitle`, `taskDescription`, `clientPubkey`, `freelancerPubkey`, etc.

### 3.2 Where `taskId` comes from

When the contract is created (escrow funded):

1. `escrowEvents.handleEscrowCreated` receives `pendingContract`
2. `publishContractEvent({ taskId: pendingContract.taskId, ... })`
3. `pendingContract.taskId` was set in `registerPendingContractByTxHash` from `escrowBid.acceptBidAndCreateEscrow`
4. `taskId = getTaskStableId(task)` → d-tag if present, else `event.id`

So **ideally** the contract stores the d-tag. Older flows or edge cases may store event ID.

### 3.3 Reconciliation logic

1. `getTaskStatusSyncItems(contracts, getTaskStatus)`:

   - For each contract with status `FundsReleased` or `DisputeResolved` → expected `COMPLETED`
   - For each contract with active status → expected `IN_PROGRESS`
   - If `getTaskStatus(taskId)` !== expected → add to sync list

2. `getTaskStatusFromStores(taskId)`:

   - Looks up `tasksStore.items` and `myTasksStore.items` by `t.id === taskId`
   - Returns `task?.status`

3. **Gotcha:** Tasks in store have `id` = d-tag (from `findTasks`). If contract has `taskId` = event ID, lookup fails → `getTaskStatus` returns `undefined` → reconciliation treats task as needing update → calls `updateTask(eventId, { status: COMPLETED })` → API may return 404 for old event ID.

---

## 4. Debug Namespaces

| Namespace           | Scope                                                       |
| ------------------- | ----------------------------------------------------------- |
| `btasker:contracts` | Contract store load, loadMore; getContracts; reconciliation |
| `btasker:reconcile` | Task status reconciliation: sync items, updateTask calls    |
| `btasker:findTasks` | Task list API, cache, merge (existing)                      |

Enable:

```js
localStorage.debug = 'btasker:contracts,btasker:reconcile';
```

---

## 5. Log Points (when enabled)

1. **contracts load start** — `loadContracts()` called
2. **contracts load result** — count, sample escrowIds, taskIds
3. **getContracts start** — filter (limit, until)
4. **getContracts nostr query** — contract events count
5. **getContracts per contract** — escrowId, taskId (format: d-tag vs event id), status
6. **reconcile start** — contract count
7. **reconcile sync items** — taskIds needing update, expected status
8. **reconcile updateTask** — taskId, status, success/failure
9. **updateTask** — taskId format, API/relay result

---

## 6. Refresh flow

When user clicks Refresh:

```
refreshContracts()
    ├── contractStore.loadContracts()
    └── runTaskStatusReconciliation()
```

Same path as initial load.
