# EscrowContract (v1) — Participant actions (`can*` conditions)

Reference for implementing **who may call what** from **`state`**, **role**, **times**, and **`timelockEnd`**. Derive each `canX` in the frontend from these predicates; handle reverts if another transaction changes state first.

**Scope:** Lifecycle entrypoints for **Tasker** (on-chain `client`) and **Taskee** (on-chain `freelancer`) on an existing `escrowId`. **`createEscrow`** (new escrow) is listed briefly at the end.

**Pause:** Most entrypoints use `whenNotPaused` and revert if the contract is paused. **`resolveAfterTimelock` does not use `whenNotPaused`** — it remains callable while paused (same bytecode as in `EscrowContract.sol`).

---

## Time constants

| Constant              | Value    |
| --------------------- | -------- |
| Grace period (cancel) | 1 hour   |
| Pre-start cancel gap  | 24 hours |
| `COMPLETION_TIMELOCK` | 7 days   |
| `DISPUTE_TIMELOCK`    | 14 days  |

Use **`now` = latest block timestamp** (not the device clock).

---

## State IDs (v1)

| ID  | Name              |
| --- | ----------------- |
| 0   | Funded            |
| 1   | InDispute         |
| 2   | DisputeResolved   |
| 3   | DisputeUnresolved |
| 4   | Completed         |
| 5   | Cancelled         |

No further participant lifecycle actions in terminal states **2, 3, 5** (funds have been distributed or escrow is closed).

---

## Roles and identifiers

- **`isTasker`** — `caller === client` (Tasker / client).
- **`isTaskee`** — `caller === freelancer` (Taskee / freelancer).
- **Escrow id:** `0 < escrowId < nextEscrowId` (enforced by `validEscrow`).

---

## Data the UI needs

**From chain:**

- **`escrows(escrowId)`** or **`getEscrow(escrowId)`** — `state`, `amount`, `createdAt`, `estimatedStartTime`, `estimatedCompletionTime`, **`timelockEnd`**, `clientFeeTier`, `freelancerFeeTier`, `client`, `freelancer`.

**Optional:**

- **`getCompletionTimestamp(escrowId)`** — set when Taskee calls **`completeTask`**.
- **`getDisputeTimestamp(escrowId)`** — set when Tasker calls **`disputeTask`**.
- **`getDisputeProposal(escrowId)`** — `onlyParties`; returns proposer, `freelancerAmount`, timestamp, `accepted`.

**Base amount (for caps and fee logic):**

- `baseAmount = calculateBaseAmount(amount, clientFeeTier)` — matches contract: `(amount * 10000) / (10000 + clientFeeBps)` with tier fees 2.5% / 2.0% / 1.5% for tiers 1–3.

**`timelockEnd` meaning (when non-zero):**

| `state`         | Set by         | Meaning of `timelockEnd`                                                                                     |
| --------------- | -------------- | ------------------------------------------------------------------------------------------------------------ |
| **4 Completed** | `completeTask` | `now + 7d` at completion — acceptance / **`resolveAfterTimelock`** (auto-pay) uses **`now >= timelockEnd`**. |
| **1 InDispute** | `disputeTask`  | `now + 14d` at dispute — **`resolveAfterTimelock`** (Tasker refund) uses **`now >= timelockEnd`**.           |

The contract uses **`require(block.timestamp >= uint256(escrow.timelockEnd))`** — at **`now === timelockEnd`**, **`resolveAfterTimelock`** **succeeds**.

---

## `can*` by action

### `createEscrow`

|                       |                                                                                                                                                                                                                                                                                                                                                       |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Caller**            | Anyone; **`msg.sender` becomes `client`** (Tasker)                                                                                                                                                                                                                                                                                                    |
| **`canCreateEscrow`** | Contract not paused; **`msg.sender != freelancer`**; **`freelancer`** not `address(0)` or **`address(this)`**; **`msg.value > 0`**; **`estimatedStartTime > now`**; **`estimatedCompletionTime > estimatedStartTime`**; **`clientFeeTier`, `freelancerFeeTier` ∈ [1, 3]**; **`estimatedStartTime` / `estimatedCompletionTime` ≤ `type(uint32).max`**. |

Creates escrow in state **0 Funded**.

---

### `completeTask`

|                       |                                                                                                    |
| --------------------- | -------------------------------------------------------------------------------------------------- |
| **Caller**            | Taskee                                                                                             |
| **`canCompleteTask`** | **`isTaskee && state === 0`** **and** **`now >= estimatedStartTime`** **and** contract not paused. |

Sets **`state = 4` Completed**, stores **`completionTimestamps[escrowId]`**, sets **`timelockEnd = now + COMPLETION_TIMELOCK`** (7 days).

---

### `acceptTask`

|                     |                                                            |
| ------------------- | ---------------------------------------------------------- |
| **Caller**          | Tasker                                                     |
| **`canAcceptTask`** | **`isTasker && state === 4`** **and** contract not paused. |

Pays Taskee (net of freelancer fee) and platform; emits **`TaskAccepted`**, **`EscrowResolved`**. **`escrow.state` is not updated** — it **remains `4` (Completed)** after payout (same for **`resolveAfterTimelock`** on **`state === 4`**). A second call would attempt the same transfers and typically **reverts** once the contract’s balance for that flow is drained.

---

### `disputeTask`

|                      |                                                                |
| -------------------- | -------------------------------------------------------------- |
| **Caller**           | Tasker only                                                    |
| **`canDisputeTask`** | **`isTasker`** **and** contract not paused **and** **either**: |

**A) Completed work — `state === 4`**

- No additional time checks in code.

**B) Still funded — `state === 0`**

- **`now >= estimatedStartTime - 24 hours`** (window opens 24h before estimated start), **and**
- **`now > createdAt + 1 hour`** (after grace period).

There is **no** upper time bound in the contract for **`state === 0`** once (B) holds: Tasker may dispute any time after those two conditions until someone changes state (e.g. cancel, complete, refund).

Sets **`state = 1` InDispute**, **`disputeTimestamps[escrowId]`**, **`timelockEnd = now + DISPUTE_TIMELOCK`** (14 days).

---

### `cancelEscrow`

|                       |                                                                   |
| --------------------- | ----------------------------------------------------------------- |
| **Caller**            | Tasker **or** Taskee (`onlyParties`)                              |
| **`canCancelEscrow`** | **`state === 0`** **and** contract not paused **and** **either**: |

- **`now <= createdAt + 1 hour`** (1h grace from creation), **or**
- **`now < estimatedStartTime - 24 hours`** (more than 24h before estimated start).

Full refund to Tasker; **`state = 5` Cancelled**.

---

### `refundClient`

|                       |                                                                  |
| --------------------- | ---------------------------------------------------------------- |
| **Caller**            | Taskee                                                           |
| **`canRefundTasker`** | **`isTaskee && state ∈ {0, 1, 4}`** **and** contract not paused. |

Voluntary full refund to Tasker; **`state = 5` Cancelled**. (Naming mirrors v2: “refund tasker” = refund **client** in v1.)

---

### `proposeResolution(freelancerAmount)`

|                            |                                                                                                                                                                                                                              |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Caller**                 | Tasker or Taskee (`onlyParties`)                                                                                                                                                                                             |
| **`canProposeResolution`** | **`state === 1`** **and** contract not paused **and** **`freelancerAmount > 0`** **and** **`freelancerAmount <= baseAmount`** **and** **`proposalCounts[escrowId][caller] < 2`** (max **2** proposals per party per escrow). |

Overwrites the single **`disputeProposals[escrowId]`** slot for this escrow (latest proposal from caller).

---

### `acceptProposal`

|                         |                                                                                                                                                                                                      |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Caller**              | The party who **did not** propose the current proposal (`onlyParties`)                                                                                                                               |
| **`canAcceptProposal`** | **`state === 1`** **and** contract not paused **and** **`proposal.proposer != caller`** **and** **`!proposal.accepted`** **and** stored **`freelancerAmount <= baseAmount`** (re-checked at accept). |

Distributes per proposal; **`proposal.accepted = true`**, **`state = 2` DisputeResolved**.

---

### `resolveAfterTimelock`

|                     |                                                                                                             |
| ------------------- | ----------------------------------------------------------------------------------------------------------- |
| **Caller**          | Depends on branch (`onlyParties`)                                                                           |
| **Allowed `state`** | **`1` InDispute** or **`4` Completed** only                                                                 |
| **Common**          | **`now >= timelockEnd`** (must be set; implied by flow) **and** **`nonReentrant`** — **no `whenNotPaused`** |

**`canResolveAfterTimelock`:**

- **`state === 4` (Completed):** **`(isTasker || isTaskee)`** — auto-pay Taskee net of freelancer fee; platform fees sent; emits **`EscrowResolved`**. **`escrow.state` stays `4`** (not written in this branch).
- **`state === 1` (InDispute):** **`isTasker` only** — full **`amount`** refund to Tasker; **`state = 3` DisputeUnresolved**.

---

## Summary matrix (participant-facing)

| Action                 | Tasker | Taskee | Primary states | Extra conditions (short)                                                               |
| ---------------------- | :----: | :----: | -------------- | -------------------------------------------------------------------------------------- |
| `createEscrow`         |   ✓    |   —    | (new → 0)      | Times, tiers, `msg.value`, not paused                                                  |
| `cancelEscrow`         |   ✓    |   ✓    | 0              | Grace **or** &gt;24h before start; not paused                                          |
| `completeTask`         |   —    |   ✓    | 0              | `now >= estimatedStartTime`; not paused                                                |
| `acceptTask`           |   ✓    |   —    | 4              | not paused                                                                             |
| `disputeTask`          |   ✓    |   —    | 0 or 4         | See § `disputeTask`; not paused                                                        |
| `refundClient`         |   —    |   ✓    | 0, 1, 4        | not paused                                                                             |
| `proposeResolution`    |   ✓    |   ✓    | 1              | Amount cap, &lt;2 proposals each; not paused                                           |
| `acceptProposal`       |   ✓    |   ✓    | 1              | Non-proposer, not accepted; not paused                                                 |
| `resolveAfterTimelock` |  ✓\*   | ✓\*\*  | 1 or 4         | `now >= timelockEnd`; \*Tasker only if **1**; **either if **4**; **works if paused\*\* |

---

## Boundary notes

| Situation                        | Detail                                                                                                                                                      |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Timelock**                     | **`resolveAfterTimelock`** uses **`>=`** on **`timelockEnd`**. At **`now === timelockEnd`**, the call succeeds.                                             |
| **Pause**                        | Only **`resolveAfterTimelock`** omits **`whenNotPaused`** in v1.                                                                                            |
| **Completed payouts vs `state`** | After **`acceptTask`** or **`resolveAfterTimelock`** (completed path), storage **`state` remains `4`**; use **events** / **balance** for “already paid” UX. |

---

## Owner-only (not participant actions)

- **`pause` / `unpause`** — `onlyOwner`.

---

## Disclaimer

Reconcile with `EscrowContract.sol` if the contract changes. Payout math (tier fees, `calculateBaseAmount`) is in the contract; this document gates **eligibility** to call and **role**/**state**/**time** predicates.
