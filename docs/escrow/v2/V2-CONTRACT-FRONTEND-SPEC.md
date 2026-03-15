# V2 Escrow Contract — Frontend Integration Spec

**Source:** SecurePaymentContract (V2) codebase.  
**Audience:** BitTasker frontend team implementing the V2 escrow layer (mirror of `src/lib/utils/escrow/v1/`).  
**Rules:** Gasless (relay) first, direct tx fallback; **no “pending” Nostr events** — publish CONTRACT_STATUS only after a tx hash is available (relay 202 or direct receipt).

---

## §1 Contract identity and creation

### 1.1 Payment identifier

- **V1:** string `escrowId` (from `EscrowCreated`).
- **V2:** `uint32 paymentId` (from `PaymentContractCreated(paymentContractId)`).

**Recommended stable string identifier for Nostr and `ContractWithEvents`:**

- Use **`paymentId.toString()`** as the primary string id (e.g. `"1"`, `"42"`).
- For **global uniqueness across chains/contracts**, use a composite: **`{chainId}-{contractAddress}-{paymentId}`** (e.g. `"31-0x…-42"`). This allows the same Nostr feed to mix multiple chains or deployments.
- **Recommendation:** Use **`paymentId.toString()`** for in-app and Nostr content; add **`contractAddress`** and **`chainId`** in tags or metadata when you need global uniqueness or filtering.

### 1.2 Creation flow

**Function:** `createPaymentContract(...)` — **payable**, returns `uint32` (the new `paymentId`).

**Parameters (exact order and types):**

| #   | Parameter name            | Type    |
| --- | ------------------------- | ------- |
| 1   | `taskee`                  | address |
| 2   | `estimatedStartTime`      | uint32  |
| 3   | `estimatedCompletionTime` | uint32  |
| 4   | `taskerFeeTier`           | uint8   |
| 5   | `taskeeFeeTier`           | uint8   |
| 6   | `cancellationFee`         | uint72  |
| 7   | `upfrontDeposit`          | uint72  |

- **Event:** The contract emits **`PaymentContractCreated(uint32 indexed paymentContractId)`** with the new id as the only (indexed) argument.
- **Creation and relay:** `createPaymentContract` is **payable** and uses `msg.value`. It **cannot** be executed via the meta-tx relay (`executeMetaTransaction`), because the relay does not forward ETH — creation is **direct tx only**. The frontend always creates by sending a direct payable transaction; after receipt, parse `PaymentContractCreated` to get `paymentId`, then publish the CONTRACT Nostr event with `escrowId` = `paymentId.toString()` and `transactionHash`.

### 1.3 Contract address and relay

- **Read calls** (e.g. get payment state): use the **same contract address** as returned by the relay’s `GET /info` (`securePaymentAddress`). There is no separate “factory” for reads.
- **Write calls:** Use the **same contract** and **same function signatures** for both relay (meta-tx) and direct tx. Relay path: build calldata for the lifecycle function, sign meta-tx, POST to relay; relay calls `executeMetaTransaction(sender, data, signature)` on the same contract. Direct path: call the lifecycle function on the same contract from the user’s wallet.

---

## §2 Reading state (getters and mapping to EscrowStatus)

### 2.1 Getter for a single payment

**Primary getter (full struct, parties only):**  
**`getPaymentContract(uint32 paymentId)`**

- **Restriction:** `validPaymentContract(paymentId)` (reverts `InvalidPaymentContractId` if `paymentId == 0` or `paymentId >= nextPaymentContractId`) and `onlyParties(paymentId)` — reverts if id invalid or caller is not tasker or taskee.
- **Returns:** `SecurePaymentLegacy` (tuple).

**Return struct: `SecurePaymentLegacy`**

| Field name                | Type    | Meaning                                                                                  |
| ------------------------- | ------- | ---------------------------------------------------------------------------------------- |
| `tasker`                  | address | Payer (client)                                                                           |
| `amount`                  | uint72  | Current balance in contract (wei); decreases after gas reimbursement and upfront release |
| `state`                   | uint8   | On-chain state 0–11 (see §2.2)                                                           |
| `taskerFeeTier`           | uint8   | 1–3; **only set for tasker**, 0 for taskee (privacy)                                     |
| `taskeeFeeTier`           | uint8   | 1–3; **only set for taskee**, 0 for tasker (privacy)                                     |
| `taskee`                  | address | Payee (freelancer)                                                                       |
| `createdAt`               | uint32  | Creation timestamp                                                                       |
| `estimatedStartTime`      | uint32  | Absolute Unix time                                                                       |
| `estimatedCompletionTime` | uint32  | Absolute Unix time                                                                       |
| `timelockEnd`             | uint32  | End of timelock (completion dispute, dispute resolution, or no-show response); 0 if N/A  |
| `noShowMarked`            | bool    | True if tasker has marked no-show                                                        |

**Public getter (no party check):**  
**`getPaymentContractState(uint32 paymentId)`**

- Returns: `(uint8 state, bool exists, address tasker, address taskee, bool noShowMarked)`.
- Use this when the caller might not be a party (e.g. to check existence and state before showing UI). For non-existent id, `exists == false` and `state == 0`, `tasker`/`taskee` zero.

**Auxiliary view functions (parties only):**

- `getEstimatedStartTime(uint32 paymentId)` → uint32
- `getEstimatedCompletionTime(uint32 paymentId)` → uint32
- `getTimelockEnd(uint32 paymentId)` → uint32

**Note:** Deposit data (`cancellationFee`, `upfrontDeposit`, `upfrontDepositReleased`) is **not** exposed by any public getter. The frontend should store creation params (cancellationFee, upfrontDeposit) at creation time if needed for UI.

### 2.2 State enum (on-chain)

The contract’s **native state** is a **uint8** with the following values (same semantics as your `mapBlockchainStateToEnum`; V2 adds **11**):

| Value  | Name (contract constant) | Meaning                                          |
| ------ | ------------------------ | ------------------------------------------------ |
| 0      | Funded                   | Created and funded                               |
| 1      | InDispute                | Dispute opened (from Funded or Completed)        |
| 2      | DisputeResolved          | Dispute resolved by acceptance or timelock       |
| 3      | DisputeUnresolved        | Dispute resolved by 14d timelock (tasker refund) |
| 4      | Completed                | Taskee marked complete; 7d timelock              |
| 5      | Cancelled                | Contract cancelled                               |
| 6      | Refunded                 | Taskee refunded tasker                           |
| 7      | FundsReleased            | Tasker accepted; funds released to taskee        |
| 8      | FundsClaimed             | Taskee claimed after completion timelock         |
| 9      | NoShow                   | Tasker marked no-show; 24h taskee response       |
| 10     | WorkInProgress           | Taskee responded to no-show (WIP)                |
| **11** | **InDisputeWIP**         | Dispute opened from WorkInProgress               |

**Frontend enum:** Extend `mapBlockchainStateToEnum` to include **11 → InDisputeWIP** (treat like InDispute for display; only tasker can call `resolveAfterTimelock` in this state). States 0–11 are the only on-chain states; there is no state 12+.

### 2.3 Dispute proposal

V2 **does not** have a separate `getDisputeProposal(paymentId)` view. Dispute proposal data is stored in packed storage (bits in `stateAndFlagsAndDispute`):

- **Proposer:** encoded as “tasker proposed last” (bit).
- **Taskee amount:** encoded as **disputeValue** (0–1000, i.e. 0–100% of base amount in 0.1% steps).
- **Accepted:** one bit (set when `acceptProposal` has been called).

The production contract does not expose these fields. Options for the frontend:

1. **Track from events:** On each `StateTransition` to/from InDispute/InDisputeWIP and on each `proposeResolution` (no event, but you know from your own tx), maintain local state (last proposer, last taskeeAmount / disputeValue, accepted).
2. **Request a view:** The repo has a test helper contract (e.g. `EscrowContractTestHelper` in `PaymentContractTestHelper.sol`) with `getDisputeIsTasker()`, `getDisputeAccepted()`, `getDisputeValue()`; the main contract could be extended with a similar view returning (proposerIsTasker, accepted, disputeValue) for a given `paymentId` if the product needs it.

For CONTRACT_STATUS when a proposal exists but is not yet accepted, use your extended Nostr state (e.g. 112 DisputeResolutionProposed) and derive “proposal exists” from your own submission with txHash.

---

## §3 Lifecycle functions (action → function, parameters, who can call)

All lifecycle functions below (except creation) are **meta-callable** via `executeMetaTransaction(sender, data, signature)` with calldata = ABI-encoded call to the function (paymentId first where applicable). Creation is **not** meta-callable (payable, direct only).

**Parameter order** is as in the ABI; **who can call** is from the contract logic.

| Action                      | Function                | Parameters (order)                                                                                                   | Who can call                           | Notes                                                                                            |
| --------------------------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Create payment              | `createPaymentContract` | (taskee, estimatedStartTime, estimatedCompletionTime, taskerFeeTier, taskeeFeeTier, cancellationFee, upfrontDeposit) | Tasker only (caller = tasker, payable) | Direct tx only; not relay.                                                                       |
| Complete task               | `completeTask`          | (paymentId)                                                                                                          | Taskee                                 | From Funded, NoShow, or WorkInProgress; after estimated start time.                              |
| Accept task (release funds) | `acceptTask`            | (paymentId)                                                                                                          | Tasker                                 | Only in Completed.                                                                               |
| Dispute task                | `disputeTask`           | (paymentId)                                                                                                          | Tasker                                 | From Funded (time window), Completed (7d after completion), or WorkInProgress.                   |
| Propose resolution          | `proposeResolution`     | (paymentId, taskeeAmount)                                                                                            | Either (alternating)                   | Only in InDispute or InDisputeWIP; max 4 proposals; taskeeAmount ≤ base amount (see below).      |
| Accept proposal             | `acceptProposal`        | (paymentId)                                                                                                          | Either (non-proposer)                  | Only in InDispute/InDisputeWIP with at least one proposal; caller must not be the last proposer. |
| Resolve after timelock      | `resolveAfterTimelock`  | (paymentId)                                                                                                          | Tasker or Taskee (see below)           | InDispute/InDisputeWIP: only **tasker**; Completed: **either** party. Timelock must have passed. |
| Cancel payment contract     | `cancelPaymentContract` | (paymentId)                                                                                                          | Either                                 | Only Funded or WorkInProgress; tasker has time restrictions.                                     |
| Refund tasker               | `refundTasker`          | (paymentId)                                                                                                          | Taskee                                 | From Funded, InDispute, InDisputeWIP, Completed, NoShow, or WorkInProgress.                      |
| Mark no-show                | `markNoShow`            | (paymentId)                                                                                                          | Tasker                                 | Only Funded; after estimated start + 1h grace.                                                   |
| Mark work in progress       | `markWorkInProgress`    | (paymentId)                                                                                                          | Taskee                                 | Only NoShow; within 24h no-show response period.                                                 |
| Claim no-show refund        | `claimNoShowRefund`     | (paymentId)                                                                                                          | Tasker                                 | Only NoShow; after 24h no-show response period.                                                  |
| Claim upfront deposit       | `claimUpfrontDeposit`   | (paymentId)                                                                                                          | Taskee                                 | Only Funded or WorkInProgress; after grace period; upfrontDeposit set and not yet released.      |

**Special cases**

- **proposeResolution(paymentId, taskeeAmount):** The second parameter is **taskeeAmount** (uint72) — the amount to the taskee (before taskee fee); the tasker gets the rest. Internally the contract converts this to a **disputeValue** 0–1000 (permil of base amount). In **InDisputeWIP**, `taskeeAmount` may be 0; in **InDispute** it must be &gt; 0.
- **createPaymentContract:** **Not** invokable via relay; only as a direct **payable** tx by the tasker. Minimum `msg.value` is **2 × GAS_REIMBURSEMENT_PER_OP** (the contract reverts with `InsufficientGasReserve` otherwise). `GAS_REIMBURSEMENT_PER_OP` is public on the contract; frontend can read it and require value ≥ 2 × that for creation.

---

## §4 Events (for timeline and status sync)

### 4.1 Events that represent state change or important actions

| Event name               | Indexed args                                 | Non-indexed args                                       |
| ------------------------ | -------------------------------------------- | ------------------------------------------------------ |
| `PaymentContractCreated` | paymentContractId (uint32)                   | —                                                      |
| `StateTransition`        | paymentContractId (uint32)                   | fromState (uint8), toState (uint8), timestamp (uint32) |
| `UpfrontDepositClaimed`  | paymentContractId (uint32), taskee (address) | —                                                      |

**Other events** (from inherited/OpenZeppelin): `OwnershipTransferred`, `Paused`, `Unpaused` — not needed for payment timeline.

### 4.2 StateTransition semantics

**Every** lifecycle transition that changes the payment state is emitted as **StateTransition(paymentContractId, fromState, toState, timestamp)**:

- Complete task → (Funded|NoShow|WorkInProgress) → Completed
- Accept task → Completed → FundsReleased
- Dispute task → (Funded|Completed|WorkInProgress) → InDispute or InDisputeWIP
- Accept proposal → InDispute/InDisputeWIP → DisputeResolved
- Resolve after timelock (dispute) → InDispute/InDisputeWIP → DisputeResolved or DisputeUnresolved
- Resolve after timelock (completion) → Completed → FundsClaimed
- Cancel → Funded/WorkInProgress → Cancelled
- Refund tasker → (any allowed state) → Refunded
- Mark no-show → Funded → NoShow
- Mark work in progress → NoShow → WorkInProgress
- Claim no-show refund → NoShow → Refunded

**proposeResolution** does **not** emit StateTransition (state stays InDispute/InDisputeWIP; only packed proposal data changes). Use your own tx + txHash to publish a CONTRACT_STATUS for “proposal submitted” (e.g. action 112) if desired.

---

## §5 Nostr (contract and status events)

### 5.1 Kinds and content shape

- Use the **same Nostr kinds** as V1 for contract creation and status updates: **CONTRACT** for creation, **CONTRACT_STATUS** for updates.
- For **CONTRACT (creation)** content, keep the same shape as V1, with:
  - **Identifier:** use `escrowId` = your stable string for the payment (e.g. `paymentId.toString()` or `{chainId}-{contractAddress}-{paymentId}`).
  - **Version:** tag **`v`: `v2`** so subscribers can distinguish V2.
  - **transactionHash:** set after you have the creation tx hash (never “pending”).
  - **contractAddress:** the SecurePaymentContract address.
  - Other fields as in V1: taskId, taskTitle, taskDescription, clientPubkey, freelancerPubkey → map to tasker/taskee; amount, currency, status (use mapped EscrowStatus), estimatedStartTime, estimatedCompletionTime, type: 'contract'. No required new/renamed fields beyond identifier and `v2`.

### 5.2 CONTRACT_STATUS content

- Publish **one CONTRACT_STATUS per confirmed action** after you have **txHash** (from relay 202 or direct receipt). No “pending” status events.
- **Content shape:** Same as V1: contractEventId, escrowId (string id for paymentId), action, message?, timestamp, type: 'contract-status', transactionHash?, proposedClientAmount? / proposedFreelancerAmount? (if applicable), completionAttachments? (if applicable).
- **Action value rule:** Use the **blockchain state number** (0–11) as the primary **action** for consistency. When the user has submitted an action that is not yet reflected on-chain (e.g. proposal submitted), you can use your **extended enum** value (e.g. 112 for DisputeResolutionProposed) in CONTRACT_STATUS only when you already have **txHash** for that submission — so “action 112” means “we have a tx that proposed a resolution; on-chain state is still 1 or 11”. **Recommendation:** Prefer **action = toState** (0–11) from the chain; use 112 (or similar) only when you need to represent “proposal submitted, waiting for other party” in the timeline and you have the proposal tx hash. This keeps one clear rule: **action is either the new blockchain state (0–11) or the extended Nostr-only state (e.g. 112) when you have a txHash for that action.**

### 5.3 Tags

- **Version:** `v` = `v2` for all V2 contract/status events.
- **Escrow reference:** Include a tag that carries the payment identifier (e.g. `r` or `d` with value = `paymentId.toString()` or composite id) for filtering.
- **V2-specific:** Recommend tag **`payment_id`** (or similar) with value = `paymentId.toString()` for easy filtering by payment id. Keep task `t`, participants `p`, and other existing tags as in V1.

---

## §6 Permissions / state machine and revert reasons

### 6.1 Allowed transitions (state × action)

**Legend:** Tasker = T, Taskee = E, Either = T|E.

| Current state       | Allowed actions (function → who)                                              |
| ------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| 0 Funded            | completeTask (E), disputeTask (T)\*, markNoShow (T), cancelPaymentContract (T | E), refundTasker (E), claimUpfrontDeposit (E)                     |
| 1 InDispute         | acceptProposal (T                                                             | E, non-proposer), resolveAfterTimelock (T only), refundTasker (E) |
| 2 DisputeResolved   | — (final)                                                                     |
| 3 DisputeUnresolved | — (final)                                                                     |
| 4 Completed         | acceptTask (T), disputeTask (T)\*, resolveAfterTimelock (T                    | E), refundTasker (E)                                              |
| 5 Cancelled         | — (final)                                                                     |
| 6 Refunded          | — (final)                                                                     |
| 7 FundsReleased     | — (final)                                                                     |
| 8 FundsClaimed      | — (final)                                                                     |
| 9 NoShow            | completeTask (E), markWorkInProgress (E), claimNoShowRefund (T)               |
| 10 WorkInProgress   | completeTask (E), disputeTask (T), cancelPaymentContract (T                   | E), refundTasker (E), claimUpfrontDeposit (E)                     |
| 11 InDisputeWIP     | acceptProposal (T                                                             | E, non-proposer), resolveAfterTimelock (T only), refundTasker (E) |

\* disputeTask from Funded: only in time window (after grace, within 24h of start). From Completed: within 7d after completion.

**proposeResolution(paymentId, taskeeAmount):** Allowed only in states **1** (InDispute) or **11** (InDisputeWIP); alternation tasker/taskee; max 4 proposals; taskeeAmount &gt; 0 in InDispute, can be 0 in InDisputeWIP.

### 6.2 Revert reasons (custom errors)

Map these to user-friendly messages. The contract uses custom errors (no string messages); the ABI exposes the error name.

| Error name                                  | Typical user message                            |
| ------------------------------------------- | ----------------------------------------------- |
| InvalidPaymentContractId                    | Invalid payment id.                             |
| OnlyParties                                 | Only tasker or taskee can perform this action.  |
| InvalidTaskee                               | Invalid taskee address.                         |
| AmountMustBeGreaterThanZero                 | Amount must be greater than zero.               |
| InvalidPaymentContractAmount                | Invalid payment amount.                         |
| InvalidEstimatedTimes                       | Invalid start or completion time.               |
| InvalidFeeTier                              | Fee tier must be 1, 2, or 3.                    |
| NotInDispute                                | Contract is not in dispute.                     |
| TaskeeAmountExceedsPaymentContract          | Taskee amount exceeds allowed maximum.          |
| ProposalLimitReached                        | Maximum number of proposals (4) reached.        |
| MustWaitForOtherParty                       | Other party must propose next.                  |
| CannotAcceptOwnProposal                     | You cannot accept your own proposal.            |
| AlreadyAccepted                             | A proposal has already been accepted.           |
| InvalidState                                | Invalid state for this action.                  |
| OnlyTasker                                  | Only the tasker can do this.                    |
| OnlyTaskee                                  | Only the taskee can do this.                    |
| OnlyTaskerCanAccept                         | Only the tasker can accept the task.            |
| TaskNotCompleted                            | Task is not in completed state.                 |
| CannotCancelAtThisTime                      | Cancellation not allowed at this time.          |
| MustBeAfterEstStartTime                     | Must be after estimated start time.             |
| CannotDisputeAtThisTime                     | Dispute not allowed at this time.               |
| TimelockNotPassed                           | Timelock has not passed yet.                    |
| OnlyTaskerCanResolveDisputes                | Only the tasker can resolve this dispute.       |
| TaskerRefundTransferFailed                  | Refund transfer failed.                         |
| TaskeeTransferFailed                        | Taskee transfer failed.                         |
| PlatformFeeTransferFailed                   | Platform fee transfer failed.                   |
| DisputeWindowExpired                        | Dispute window has expired.                     |
| NoShowNotMarked                             | No-show was not marked.                         |
| NoShowAlreadyMarked                         | No-show already marked.                         |
| CannotMarkNoShowBeforeStart                 | Cannot mark no-show before start + grace.       |
| NoShowGracePeriodNotExpired                 | No-show response period has not expired.        |
| NoShowResponsePeriodExpired                 | No-show response period has expired.            |
| InvalidDeposits                             | Invalid cancellation or upfront deposit.        |
| CancellationFeeExceedsPaymentContractAmount | Cancellation fee exceeds amount.                |
| UpfrontDepositAlreadyReleased               | Upfront deposit already released.               |
| NoUpfrontDeposit                            | No upfront deposit set.                         |
| UpfrontDepositGracePeriodNotExpired         | Upfront deposit grace period not expired.       |
| InsufficientPaymentContractForUpfrontAndFee | Insufficient balance for upfront and fee.       |
| InvalidSignature                            | Invalid meta-tx signature.                      |
| InsufficientGasReserve                      | Insufficient gas reserve (creation or meta-tx). |
| RelayTransferFailed                         | Relay reimbursement transfer failed.            |
| TimeBeforeBase                              | Time before base.                               |
| StartTimeTooFarInFuture                     | Start time too far in future.                   |
| TimeBeforeStart                             | Time before start.                              |
| CompletionTimeTooFarInFuture                | Completion time too far in future.              |

Inherited (Ownable, Pausable, ReentrancyGuard): **OwnableInvalidOwner**, **OwnableUnauthorizedAccount**, **OwnershipTransferDisabled**, **OwnershipRenunciationDisabled**, **EnforcedPause**, **ExpectedPause**, **ReentrancyGuardReentrantCall**.

---

## §7 Gasless vs direct — no “pending” Nostr

### 7.1 Rule

- **Do not** publish CONTRACT_STATUS with a “pending” state before you have a tx hash.
- After you get **txHash** (from relay 202 or from direct tx receipt), publish **one** CONTRACT_STATUS with the **new blockchain state** (0–11) or the appropriate Nostr-only state (e.g. 112 for “proposal submitted”) when that applies and you have the proposal tx hash.
- **Confirmed:** This approach is correct for V2: no “PendingCompletion”, “PendingAcceptance”, etc. in Nostr; only publish after you have txHash (and optionally treat as “submitted, will confirm” or wait for receipt and then publish confirmed state). If you prefer to publish “submitted” with txHash and later update to “confirmed” when receipt is seen, that is also valid — the important part is **no status event without a tx hash**.

### 7.2 Creation

- **createPaymentContract** is **direct only** (payable). Flow: send direct payable tx → wait for receipt → parse **PaymentContractCreated(paymentContractId)** to get `paymentId` → publish **CONTRACT** Nostr event with `escrowId` = your string for that payment (e.g. `paymentId.toString()`), `transactionHash`, and tag `v` = `v2`.
- Creation is **not** gasless; there is no relay path for creation. If a future design supports gasless creation (e.g. relay sponsoring value or wrapping), `paymentId` would still come from the same **PaymentContractCreated** event emitted by the relay-submitted tx.

---

## Summary

- **§1** Use `paymentId.toString()` or `{chainId}-{contractAddress}-{paymentId}` as stable id; creation via `createPaymentContract` (direct, payable only); same contract address for read and write, relay and direct.
- **§2** Full getter: `getPaymentContract(paymentId)` (parties only); public state: `getPaymentContractState(paymentId)`; state enum 0–11 (add 11 InDisputeWIP); no `getDisputeProposal` — track from events or request a view.
- **§3** Lifecycle table: 13 actions with function names, parameter order, and caller role; proposeResolution uses taskeeAmount; createPaymentContract not via relay.
- **§4** Three main events: PaymentContractCreated, StateTransition, UpfrontDepositClaimed; every state change emits StateTransition; proposeResolution does not.
- **§5** Same Nostr kinds as V1; CONTRACT/CONTRACT_STATUS content with `v2` and payment id; action = blockchain state 0–11 or extended (e.g. 112) when you have txHash for that action.
- **§6** State × action matrix and full list of custom errors for UI and error mapping.
- **§7** No pending Nostr; publish CONTRACT_STATUS only with txHash; creation direct only, get paymentId from PaymentContractCreated.

This gives the frontend everything needed to implement the V2 escrow layer aligned with the contract and relay.
