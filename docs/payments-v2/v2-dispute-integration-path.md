# V2 dispute path — integration plan & progress

This document tracks **how we integrate dispute flows** (`disputeTask`, `proposeResolution`, `acceptProposal`, `resolveAfterTimelock`) with **`PaymentContractRune`**, **Kind 31006 (`NDKContractStatus`)** history, and **NDK contract UI** (`ContractActionsNDK` and follow-on components). It complements:

- **[v2-contract-ui-lifecycle-plan.md](./v2-contract-ui-lifecycle-plan.md)** — overall lifecycle phases and scorecard.
- **[SECURE-PAYMENT-PARTICIPANT-ACTIONS.md](../../src/lib/utils/contract/v2/SECURE-PAYMENT-PARTICIPANT-ACTIONS.md)** — eligibility predicates (chain + time).
- On-chain reference: **`SecurePaymentContract.sol`** (behaviour summarised below from repo review).

**Status:** planning / in progress — update checklists as features ship.

---

## 1. On-chain behaviour (source of truth)

### 1.1 Who opens a dispute

- Only the **tasker** may call **`disputeTask`** (`OnlyTasker`).
- Sets state to **`InDispute`** (`1`) or **`InDisputeWIP`** (`11`), sets **`timelockStart`**, and does **not** by itself store a proposal amount.

### 1.2 First proposal — tasker **or** taskee

- When **`totalProposalCount == 0`**, **either** party may call **`proposeResolution(taskeeAmount)`** first (the alternating check is skipped until there is at least one proposal).
- After the first proposal, **`MustWaitForOtherParty`** enforces alternation: the next call must be from the **other** side (tracked via packed dispute flags, e.g. “last proposer is tasker”).

### 1.3 `proposeResolution(taskeeAmount)`

- Single argument: **`taskeeAmount`** (`uint72`) — taskee’s share of the work pot in the contract’s base-amount space; **`taskeeAmount <= baseAmount`** (`baseAmount = calculateBaseAmount(...)`).
- **`STATE_IN_DISPUTE` (1):** **`taskeeAmount > 0`** required.
- **`STATE_IN_DISPUTE_WIP` (11):** **`taskeeAmount` may be `0`** (full refund–style outcomes allowed).
- No message/URI calldata — amount only.

### 1.4 `acceptProposal(paymentId)`

- **Non-proposer** only (`CannotAcceptOwnProposal`); pays out from **current** stored dispute value → **`DisputeResolved` (`2`)**.

### 1.5 Timelocks during dispute (urgency)

- After proposals, **`timelockEnd`** semantics use **`PROPOSAL_RESPONSE_PERIOD` (24h)** vs **`DISPUTE_TIMELOCK` (14d)** depending on state, who proposed last, and proposal count **&lt; 4** (see contract `_getTimelockEnd` / `proposeResolution` branches).
- When the **tasker** proposes, **`timelockStart` is refreshed** (24h response window for taskee). When the **taskee** proposes, **`timelockStart` is not** updated in that path (per contract implementation).

### 1.6 `resolveAfterTimelock` (dispute branch)

- Only **tasker** in dispute (`OnlyTaskerCanResolveDisputes` / equivalent).
- After timelock: either **execute tasker’s last proposal** or move to **`DisputeUnresolved` (`3`)** depending on who proposed last and rules (incl. cancellation fee paths for `STATE_IN_DISPUTE`).

### 1.7 Proposal cap

- **Maximum 4 proposals** total (`ProposalLimitReached` on further `proposeResolution`).

---

## 2. What we already have in code

| Piece                   | Location                 | Notes                                                                                                                                                                              |
| ----------------------- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Chain predicates        | `permittedActions.ts`    | `canDisputeTask`, `canResolveAfterTimelock`, plus **`canProposeResolution` / `canAcceptProposal`** when **`disputeProjection`** is supplied                                        |
| **`DisputeProjection`** | `permittedActions.ts`    | `{ totalProposalCount, lastProposerIsTasker, disputeAccepted }` — **optional**; if omitted in dispute states, propose/accept **`can*`** stay **false** (Phase E in lifecycle plan) |
| **31006 model**         | `NDKContractStatus`      | `status` (`s`), `writeMethod`, `proposedTaskeeAmount` / `proposedTaskerAmount` tags, encryption to counterparty                                                                    |
| **Writes**              | `blockchainWrites.ts`    | `disputeTask`, `proposeResolution`, `acceptProposal`, `resolveAfterTimelock`                                                                                                       |
| **Legacy UI reference** | `ContractActions.svelte` | Proposal / resolution UX patterns (amounts, last proposal display) — **not** to copy Nostr v1 pipeline; use for UX ideas only                                                      |

**Not wired end-to-end yet:** lifecycle orchestrators in **`lifecycle/v2.ts`**, **`PaymentContractRune`** delegates, **`computePermittedActions(this)`** feeding **real** `disputeProjection`, and **NDK UI** for dispute + proposals.

---

## 3. Proposed approach — dispute projection from 31006

**Goal:** Derive a **`DisputeProjection`** (and optional **last proposed amount** for display) by scanning **`statusEvents`** for this **`paymentId`** (`#r`), **after** decrypt/parse, **sorted by time** (same ordering rules as **`statusEventsByNewest`** — see rune).

### 3.1 Events to interpret

Filter **Kind 31006** rows for this contract where:

- **`writeMethod`** (or equivalent action tag) is one of: **`disputeTask`**, **`proposeResolution`**, **`acceptProposal`**, and optionally **`resolveAfterTimelock`** for analytics.

Use **`created_at`** ascending to process a **timeline**; for “current” projection, the **ordered history** after initial EOSE + live updates must match what the chain would infer for **count** and **last proposer**.

### 3.2 Mapping to `DisputeProjection`

- **`totalProposalCount`:** number of **`proposeResolution`** events (successful publishes), capped at **4** for UI; must stay consistent with on-chain packed count once we validate against **`reloadBlockchainData`** when possible.
- **`lastProposerIsTasker`:** from the **latest** **`proposeResolution`** event: compare **`event.author.pubkey`** to **`contract.taskerPubkey`** (tasker) vs **taskee** (`NDKPaymentContract`).
- **`disputeAccepted`:** true if there is an **`acceptProposal`** event **after** the last relevant dispute activity, or if **`blockchainData.state === DisputeResolved`** (chain wins for terminal state).

If **no** `proposeResolution` in history but chain is already **`InDispute` / `InDisputeWIP`**, count **0** and alternation allows **either** party for first proposal — matches contract.

### 3.3 Deriving “whose turn” / accept vs propose

| Viewer          | Condition (high level)                                                                                                                                                                                                                |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **May propose** | Chain in **`InDispute` or `InDisputeWIP`**, `totalProposalCount < 4`, **`!disputeAccepted`**, and **`computePermittedActions`** with projection says **`canProposeResolution`** (includes alternation + amount rules at submit time). |
| **May accept**  | **`canAcceptProposal`**: there is a **pending** proposal from the **other** party (last event is **`proposeResolution`** from counterparty, not yet followed by **`acceptProposal`** or a newer proposal).                            |

Exact booleans remain in **`canProposeWithProjection` / `canAcceptWithProjection`** in **`permittedActions.ts`** — **do not duplicate** business rules in the rune; the rune supplies **`disputeProjection`** only.

### 3.4 Display

- Surface **last `proposedTaskeeAmount`** (and tasker-side tag if present) from the **latest** `proposeResolution` **31006** for copy/confirmation widgets.
- Prefer **chain `timelockEnd` / `timelockStart`** from **`getPaymentContract`** / **`SecurePaymentLegacy`** for countdowns, not recomputing 24h vs 14d in the client except for **copy**.

---

## 4. `PaymentContractRune` responsibilities

1. **`$derived` (or explicit recompute)** **`disputeProjection`** from **`statusEvents`** (and optionally **`blockchainData.state`** to short-circuit when terminal).
2. Pass **`disputeProjection`** into **`lifecycle.computePermittedActions`** — extend **`computePermittedActions` / `PaymentContractRuneLike`** so v2 **`computePermittedActionsV2`** receives projection the same way we will wire **`upfrontDeposit`** later (see lifecycle plan §6).
3. Keep **single subscription** path: on each new 31006, recompute projection + permissions.
4. **Optional:** cache **last dispute-related 31006** id for debugging; **dedupe** by event id if replays appear.

---

## 5. Lifecycle & UI (target)

For each action, mirror **`markTaskCompleteV2`** pattern:

1. **`runV2Preflight`** with the right **`can*`**.
2. **`blockchainWrites.*`**
3. **`publishV2ContractStatus`** with **`s`** = post-success **`ContractStatus`**, **`writeMethod`** = method name; for **`proposeResolution`**, set **encrypted tags** **`proposedTaskeeAmount`** (and tasker tag if product requires symmetry) on **`NDKContractStatus`** before publish.
4. **Push** to counterparty with stable **`type`** string.
5. **Rune** methods: **`disputeTask()`**, **`proposeResolution(amount)`**, **`acceptProposal()`**, **`resolveAfterTimelock()`** (signatures TBD — amount only for propose).

**UI:** New or extended component (e.g. dispute section in **`ContractDrawerNDK`** or **`ContractActionsNDK`**) for:

- Open dispute (tasker).
- Show **last proposal** + **whose turn** + **remaining proposals** (4 − count).
- Form for **`taskeeAmount`** (validation: **&gt; 0** unless **`InDisputeWIP`**).
- **Accept** button when **`canAcceptProposal`**.

Reuse **i18n** under **`dashboard.contracts.actions.*`**; add **en + es**.

---

## 6. Progress checklist

### 6.1 Projection module

- [ ] **`disputeProjectionFromStatusEvents(contract, statusEvents, blockchainState)`** (pure function, file TBD under `utils/contract/v2/` or `nostr/`) — returns **`DisputeProjection`** + optional **lastProposalTaskeeAmount** for UI.
- [ ] Unit tests with **synthetic** `NDKContractStatus[]` / minimal fixtures.

### 6.2 Rune

- [ ] **`PaymentContractRune`**: derived **`disputeProjection`**; thread into **`computePermittedActions`**.
- [ ] Verify **`permittedActions`** updates when a new 31006 arrives after **propose** / **accept**.

### 6.3 Lifecycle (`lifecycle/v2.ts`)

- [ ] **`disputeTaskV2`**, **`proposeResolutionV2`**, **`acceptProposalV2`**, **`resolveAfterTimelockV2`** — preflight, write, 31006 + push.
- [ ] **`PaymentContractLifecycle` + v1 stubs**; **`PaymentContractRune`** delegates.

### 6.4 UI

- [ ] Tasker: **Dispute** action + confirm modal (pattern from **`ConfirmModal`** / **`CONTRACT_MODAL_CONFIGS`**).
- [ ] Dispute phase: **proposal** form + **accept** + optional **resolve after timelock** when **`canResolveAfterTimelock`**.
- [ ] Loading / “syncing history” when projection uncertain (empty history but chain says disputed).

### 6.5 Docs / matrix

- [ ] Extend **action → `s` → `writeMethod` → push `type`** table in **v2-contract-ui-lifecycle-plan.md** §4 / §11.
- [ ] Mark **Phase E** items done when projection + proposal UI ship.

---

## 7. Open questions

1. **Indexer / chain-only:** If **`totalProposalCount`** is ever exposed on a view, we could cross-check projection vs chain after each reload; until then, **31006 history** is the source for **turn** and **count**, **chain** for **state** and **timelockEnd**.
2. **Encrypted tags:** Ensure **`proposeResolution`** publishes amounts in tags **`NDKContractStatus`** already supports (`proposedTaskeeAmount`, etc.) so the **other** client can decrypt and display.
3. **Legacy `ContractActions.svelte`:** Mine for **UX** only; **no** v1 Nostr publish path in new code.

---

## 8. Summary

Disputes are **tasker-initiated** on-chain, then **alternating proposals** (max **4**) with **`taskeeAmount`** semantics that differ for **`InDispute`** vs **`InDisputeWIP`**. **`acceptProposal`** is **counterparty-only**. **`PaymentContractRune`** should derive **`DisputeProjection`** from **31006** history and pass it into existing **`computePermittedActions`** so **`canProposeResolution`** / **`canAcceptProposal`** become accurate; lifecycle orchestrators and NDK UI follow the same pattern as **refund / cancel / no-show** paths.
