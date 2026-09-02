# SecurePaymentContract — Participant actions (`can*` conditions)

Reference for implementing **who may call what** from **`state`**, **role**, **times**, and **`timelockEnd`**. Derive each `canX` in the frontend from these predicates; handle reverts if another transaction changes state first.

**Scope:** Lifecycle entrypoints for **tasker** and **taskee** on an existing `paymentId`. **`createPaymentContract`** (new escrow) is listed briefly at the end. **Pause** is ignored here; if the contract is paused, calls revert and the UI can surface that from the wallet.

---

## Time constants

| Constant                   | Value    |
| -------------------------- | -------- |
| `GRACE_PERIOD`             | 1 hour   |
| `CANCELLATION_WINDOW`      | 24 hours |
| `COMPLETION_TIMELOCK`      | 7 days   |
| `DISPUTE_WINDOW`           | 7 days   |
| `DISPUTE_TIMELOCK`         | 14 days  |
| `PROPOSAL_RESPONSE_PERIOD` | 24 hours |
| `NO_SHOW_RESPONSE_PERIOD`  | 24 hours |

Use **`now` = latest block timestamp** (not the device clock).

---

## State IDs

| ID  | Name              |
| --- | ----------------- |
| 0   | Funded            |
| 1   | InDispute         |
| 2   | DisputeResolved   |
| 3   | DisputeUnresolved |
| 4   | Completed         |
| 5   | Cancelled         |
| 6   | Refunded          |
| 7   | FundsReleased     |
| 8   | FundsClaimed      |
| 9   | NoShow            |
| 10  | WorkInProgress    |
| 11  | InDisputeWIP      |

No further participant lifecycle actions in terminal states **2, 3, 5, 6, 7, 8** (and typically when `amount == 0`).

---

## Data the UI needs

**From chain (party views):**

- **`getPaymentContract(paymentId)`** (`onlyParties`): `state`, `amount`, `createdAt`, `estimatedStartTime`, `estimatedCompletionTime`, **`timelockEnd`**, `noShowMarked`, fee tier for caller.

You **do not need** **`getTimelockEnd`** if you already use **`getPaymentContract`**: both call the same internal `_getTimelockEnd` with the same storage, so **`timelockEnd` is identical**. Use **`getTimelockEnd` only** when you want **only** the deadline (e.g. a tiny read) and already have `paymentId`—not required for the usual “load payment + compute `can*`” flow.

**`timelockEnd` meaning (only when non-zero):**

| `state`                             | Meaning of `timelockEnd`                                                                                                                                                                                                                         |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **4 Completed**                     | `timelockStart + 7d` — end of acceptance/dispute window; **`resolveAfterTimelock`** needs `now > timelockEnd`.                                                                                                                                   |
| **9 NoShow**                        | Taskee response deadline — **`markWorkInProgress`**: `now <= timelockEnd`; **`claimNoShowRefund`**: `now > timelockEnd`.                                                                                                                         |
| **1 / 11 InDispute / InDisputeWIP** | Dispute resolution unlock — **`resolveAfterTimelock`** (tasker only): `now > timelockEnd`. Duration is **24h** or **14d** per contract rules; read **`timelockEnd`** from **`getPaymentContract`** (or **`getTimelockEnd`**) — do not recompute. |
| **0, 10, …**                        | Usually **`0`** — do not use for gating.                                                                                                                                                                                                         |

**Not returned by current views (need creation tx, indexer, or future view):**

- **`depositData`:** `upfrontDeposit`, `cancellationFee`, `upfrontDepositReleased` — needed for **`canClaimUpfrontDeposit`** and for understanding cancel/fee payouts.
- **Dispute packing:** `totalProposalCount`, last proposer (tasker vs taskee), `disputeAccepted` — needed for **`canProposeResolution`**, **`canAcceptProposal`**, and for interpreting dispute **`timelockEnd`** after proposals (re-fetch **`getPaymentContract`** after each relevant tx; **`timelockEnd`** updates there).

**Roles:** `isTasker = (caller === tasker)`, `isTaskee = (caller === taskee)`.

**Payment id:** `0 < paymentId < nextPaymentContractId`.

---

## `can*` by action

### `completeTask`

|                       |                                                               |
| --------------------- | ------------------------------------------------------------- |
| **Caller**            | Taskee                                                        |
| **`canCompleteTask`** | `isTaskee && state ∈ {0, 9, 10} && now >= estimatedStartTime` |

---

### `acceptTask`

|                     |                           |
| ------------------- | ------------------------- |
| **Caller**          | Tasker                    |
| **`canAcceptTask`** | `isTasker && state === 4` |

---

### `disputeTask`

|                     |                     |
| ------------------- | ------------------- |
| **Caller**          | Tasker              |
| **Allowed `state`** | `0`, `4`, `10` only |

**`canDisputeTask`** (all must hold):

- **`state === 10`:** no extra time conditions.
- **`state === 4`:** `timelockEnd !== 0` (from **`getPaymentContract.timelockEnd`**). Let `completionTime = timelockEnd - COMPLETION_TIMELOCK`, `disputeWindowEnd = completionTime + DISPUTE_WINDOW` (with current constants equals `timelockEnd`). Require **`now <= disputeWindowEnd`**.
- **`state === 0`:** **`now < estimatedStartTime`** AND **`now > createdAt + GRACE_PERIOD`** AND **`(estimatedStartTime - now) <= CANCELLATION_WINDOW`**.

---

### `resolveAfterTimelock`

|                     |                                                     |
| ------------------- | --------------------------------------------------- |
| **Allowed `state`** | `4`, `1`, `11` only                                 |
| **Common**          | `timelockEnd !== 0` **and** **`now > timelockEnd`** |

**`canResolveAfterTimelock`:**

- **`state === 4`:** `(isTasker || isTaskee)` and conditions above.
- **`state === 1` or `11`:** **`isTasker` only** and conditions above (taskee always reverts).

---

### `proposeResolution(taskeeAmount)`

|                     |                                  |
| ------------------- | -------------------------------- |
| **Caller**          | Tasker or taskee (`onlyParties`) |
| **Allowed `state`** | `1`, `11`                        |

**`canProposeResolution`:**

- `state ∈ {1, 11}`.
- **Turn:** if `totalProposalCount > 0`, caller must **not** be the same side as last proposer; if `totalProposalCount === 0`, either party may propose.
- **Count:** current `totalProposalCount < 4` (4 proposals max).
- **Amount:** `taskeeAmount <= baseAmount` (contract: `calculateBaseAmount(amount, taskerFeeTier)`).
- If **`state === 11`:** `taskeeAmount === 0` allowed; if **`state === 1`:** require **`taskeeAmount > 0`**.

(`totalProposalCount` / last proposer from indexed events or future view.)

---

### `acceptProposal`

|                     |                              |
| ------------------- | ---------------------------- |
| **Caller**          | Non-proposer (`onlyParties`) |
| **Allowed `state`** | `1`, `11`                    |

**`canAcceptProposal`:**

- `state ∈ {1, 11}`.
- `totalProposalCount >= 1`.
- Last proposer ≠ caller (tasker cannot accept if tasker proposed last, and vice versa).
- Proposal not already accepted (packed `disputeAccepted` bit clear).

---

### `cancelPaymentContract`

|                     |                                  |
| ------------------- | -------------------------------- |
| **Caller**          | Tasker or taskee (`onlyParties`) |
| **Allowed `state`** | `0`, `10` only                   |

**`canCancelPaymentContract`:**

- `state ∈ {0, 10}`.
- **Taskee:** no further time predicates in the contract.
- **Tasker:** **cannot** cancel if **all** of: `now > createdAt + GRACE_PERIOD`, **`now + CANCELLATION_WINDOW >= estimatedStartTime`**, **`now < estimatedCompletionTime + CANCELLATION_WINDOW`**.  
  Equivalently tasker **can** cancel if **`now <= createdAt + GRACE_PERIOD`** OR **`now + CANCELLATION_WINDOW < estimatedStartTime`** OR **`now >= estimatedCompletionTime + CANCELLATION_WINDOW`**.

(Cancellation **fee** changes splits when configured; it does not replace the tasker time gate above.)

---

### `refundTasker`

|                       |                                            |
| --------------------- | ------------------------------------------ |
| **Caller**            | Taskee                                     |
| **`canRefundTasker`** | `isTaskee && state ∈ {0, 1, 11, 4, 9, 10}` |

---

### `markNoShow`

|                     |                                                                                        |
| ------------------- | -------------------------------------------------------------------------------------- |
| **Caller**          | Tasker                                                                                 |
| **`canMarkNoShow`** | `isTasker && state === 0 && !noShowMarked && now >= estimatedStartTime + GRACE_PERIOD` |

---

### `markWorkInProgress`

|                             |                                                                      |
| --------------------------- | -------------------------------------------------------------------- |
| **Caller**                  | Taskee                                                               |
| **`canMarkWorkInProgress`** | `isTaskee && state === 9 && timelockEnd !== 0 && now <= timelockEnd` |

At **`now === timelockEnd`** the call is still valid.

---

### `claimNoShowRefund`

|                            |                                                                     |
| -------------------------- | ------------------------------------------------------------------- |
| **Caller**                 | Tasker                                                              |
| **`canClaimNoShowRefund`** | `isTasker && state === 9 && timelockEnd !== 0 && now > timelockEnd` |

At **`now === timelockEnd`** the call still reverts (strict **`>`**).

---

### `claimUpfrontDeposit`

|                              |                                                                                                                                                                   |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Caller**                   | Taskee                                                                                                                                                            |
| **`canClaimUpfrontDeposit`** | `isTaskee && state ∈ {0, 10} && now > createdAt + GRACE_PERIOD && upfrontDeposit > 0 && !upfrontDepositReleased && amount >= upfrontDeposit + taskerFeeOnUpfront` |

`upfrontDeposit`, `upfrontDepositReleased`, and fee-on-upfront require **off-chain creation data** or a **future view** (not in `getPaymentContract` today).

---

## Boundary notes (same predicates, tricky instants)

| Situation                         | Detail                                                                                                                                                                          |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Completed: dispute vs resolve** | `disputeTask` allows `now <= timelockEnd` (window end). `resolveAfterTimelock` requires `now > timelockEnd`. At exactly `timelockEnd`, dispute can succeed; resolve cannot yet. |
| **NoShow: taskee vs tasker**      | `markWorkInProgress` uses `now <= timelockEnd`; `claimNoShowRefund` uses `now > timelockEnd`.                                                                                   |
| **Upfront**                       | `claimUpfrontDeposit` uses **`now > createdAt + GRACE_PERIOD`** (strict).                                                                                                       |

---

## Other entrypoints (brief)

**`createPaymentContract`** — Caller becomes tasker; new `paymentId`; not derived from an existing payment. Extra checks: `msg.value`, fee tiers, estimated times, deposits vs base amount, gas reserve.

**`executeMetaTransaction`** — Inner call uses the **same `can*`** for the **signed `sender`**. Outer call also requires sufficient **`amount`** for gas reimbursement before the inner call runs.

---

## Disclaimer

Reconcile with `SecurePaymentContract.sol` if the contract changes. Payout math (fees, cancellation fee, dispute floors) is in the contract; this doc only gates **eligibility** to call.
