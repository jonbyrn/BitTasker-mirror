# V1 escrow — integration with `PaymentContractRune` and lifecycle router

This document tracks **research, scope, and an implementation roadmap** for running **legacy v1** payment contracts through the same **`PaymentContractRune`** + **`PaymentContractLifecycle`** surface area as **v2**, without copying the legacy implementation wholesale. **§8** is the **checklist roadmap**; use it to sequence PRs and QA.

**Context:** New contracts are created as **v2** only. After release, **v1** escrows may still be mid-flow, and **finished v1** contracts must remain viewable with consistent UI. The rune already loads **Kind 30006** contracts and **Kind 31006** status subscriptions for both versions; **v1 lifecycle** today is mostly **stubs** (`computePermittedActionsV1` → empty; writes → `{ ok: false }`).

---

## 1. Goals

| Goal                     | Notes                                                                                                                                                                                                                                 |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Single UI path**       | `ContractCardNDK` / `ContractDrawerNDK` / `ContractActionsNDK` keep using **`contractRune.permittedActions`** and **`contractRune.*()`** lifecycle methods.                                                                           |
| **Version routing**      | Existing **`getPaymentContractLifecycle(version)`** stays the switch; **v1** gains real **`loadPaymentContractDetails`**, **`computePermittedActions`**, and orchestrators parallel to v2 where the **v1 chain supports the action**. |
| **Do not port “as-is”**  | Prefer **thin chain writes** + **clear permission module** + **one Nostr/push pipeline** (mirroring v2 structure), instead of inheriting all patterns from **`escrow.ts`**.                                                           |
| **Historical behaviour** | **Read:** parse legacy **`v1`** 31006 (§4–§5). **Write:** new 31006 always **`v="v2"`** + **`s` = `ContractStatus`**, even for **v1 chain** contracts (§4.1).                                                                         |

---

## 2. What v1 does today (source review)

### 2.1 Chain I/O — `src/lib/utils/escrow/v1/escrow.ts`

- **Connection:** **`ensureEscrowReady(contractAddress?)`** — default factory contract vs **legacy** instance per address (cached `ethers.Contract`).
- **Reads:** e.g. **`loadEscrowDetails(escrowId)`** (used across app), **`getDisputeProposal`**, **`checkEscrowFundingStatus`**, etc.
- **Writes** (non-exhaustive): **`createEscrow`**, **`completeTask`**, **`acceptTask`**, **`cancelEscrow`**, **`refundClient`** (name differs from v2 **`refundTasker`**), **`disputeTask`**, **`proposeResolution`**, **`acceptProposal`**, **`resolveAfterTimelock`**.
- **Not in v1 escrow API:** **`markNoShow`**, **`markWorkInProgress`**, **`claimNoShowRefund`** — v2-only lifecycle methods should remain **no-ops or explicit “not supported on v1”** for v1 contracts.

Each write typically:

1. Estimates gas, submits tx.
2. Optionally publishes a **“pending”** Nostr status (`EscrowStatus.PendingCompletion`, `PendingAcceptance`, `PendingCancellation`, `PendingDispute`, etc.) **with `transactionHash`** via **`EscrowNostrEvent.publishEscrowStatus`**.
3. **`tx.wait()`** in a **fire-and-forget** `.then()` that publishes the **confirmed** chain-aligned status (`Completed`, `FundsReleased`, `Cancelled`, …).

So v1 couples **wallet + gas + Nostr** inside one large module; the goal is to **separate** “broadcast write” from “side effects” like v2’s **`blockchainWrites`** + **`lifecycle/v2.ts`** **`broadcastThenParallelV2Effects`**.

### 2.2 Permissions — `src/lib/utils/helpers/contractPermissions.ts`

- **Entry:** **`determineContractState(blockchainStatus, statusEvents, contract, escrowData, disputeProposal, isPending, isClient, isFreelancer)`**.
- **Output:** **`EscrowStatus`** (v1 enum mixing **chain 0–5** and **Nostr 6+**) + **`ContractPermissions`** (`canComplete`, `canAccept`, `canDispute`, `canPropose`, `canAcceptProposal`, `canCancel`, `canRefund`, `canResolveTimelock`, `canDelete`).
- **Logic:**
  - **`mapBlockchainStatusToPermissions`** switches on **chain** `EscrowStatus` (Funded, Completed, InDispute, …).
  - **Priority overrides:** scans **`statusEvents`** for **pending** actions (`PendingCompletion` + `transactionHash`, etc.) and returns a **synthetic UI status** with **all permissions false** — this is the “in-flight tx” gate.
  - **Dispute:** combines **`disputeProposal`** (from chain) with **Nostr** counts of **`DisputeResolutionProposed`** by pubkey (per-party proposal limits, last proposer) — **not** identical to v2’s **`disputeProjectionFromStatus`** (different tags/events).
  - **Time helpers:** **`canClientCancel`**, **`canClientDispute`** — simplified predicates; **not** the same as **`permittedActions.ts`** (v2) SECURE-PAYMENT doc (but v1 **chain** rules must still match **v1** Solidity).
- **Never-funded path:** **`canDelete`** only when no chain state — relevant to **legacy contract list**, less to **funded** rune flows.

### 2.3 Loader already shared — `src/lib/utils/contract/v1/index.ts`

- **`loadPaymentContractDetails(paymentId, contractAddress, chain)`** calls **`getEscrow`** on the **v1 ABI** and maps to **`SecurePaymentLegacy`** (`tasker`/`taskee` fields filled from **client/freelancer** struct).
- **`noShowMarked`** is forced **`false`** — correct for v1.

### 2.4 Current v1 lifecycle stub — `src/lib/utils/contract/lifecycle/v1.ts`

- **Load:** implemented (delegates to v1 loader).
- **Permissions:** **`emptyPermittedActions()`** — UI never shows v1 actions on NDK path.
- **Writes:** all return **`{ ok: false }`**.
- **`shouldAwaitStatusTransaction`** — **planned removal** (see §5.4, §6): rune **always** awaits tx + reload for v1 and v2.

---

## 3. Target shape (aligned with v2)

### 3.1 `contract/v1/` — “blockchainWrites v1”

Introduce a **small module** (name TBD, e.g. `writes.ts`) that:

- Takes **`contractAddress`**, **`escrowId` / `paymentId`**, and **`chain`**.
- Uses **`initContract`** + **v1 `abi.json`** (already used by v1 loader) or shares **`ensureEscrowReady`-style** connection without pulling in **all** of **`escrow.ts`**.
- Exposes **one function per supported write**, mirroring **`blockchainWrites.ts`**:

  - **`estimateGas` → `staticCall`/`estimateGas` → `fn(...)`** pattern optional; minimum is **return `ContractTransactionResponse`** without **`tx.wait()`** inside the thin layer.

**Mapping v1 → `PermittedActions` / UI:**

| V1 `escrow` method     | Typical chain transition               | Maps to lifecycle / UI  |
| ---------------------- | -------------------------------------- | ----------------------- |
| `completeTask`         | → `Completed`                          | `markTaskComplete`      |
| `acceptTask`           | → release / `FundsReleased` Nostr      | `acceptTask`            |
| `refundClient`         | → `Refunded`                           | `refundTasker`          |
| `cancelEscrow`         | → `Cancelled`                          | `cancelPaymentContract` |
| `disputeTask`          | → `InDispute`                          | `disputeTask`           |
| `proposeResolution`    | stays `InDispute` on chain             | `proposeResolution`     |
| `acceptProposal`       | → `DisputeResolved`                    | `acceptProposal`        |
| `resolveAfterTimelock` | → `DisputeUnresolved` / completed path | `resolveAfterTimelock`  |

**Out of scope for v1:** **`markNoShow`**, **`markWorkInProgress`**, **`claimNoShowRefund`** — keep stubs or return structured “unsupported” so the UI does not show those buttons (already gated if **`PermittedActions`** stays false).

### 3.2 Permissions — new `computePermittedActionsV1` (recommended direction)

**Avoid** calling **`determineContractState`** and then blindly mapping to **`PermittedActions`** long-term — different enums (`EscrowStatus` vs `ContractStatus`) and extra fields (`canDelete`) invite bugs.

**Preferred approach:**

1. **Extract** the **v1 chain rules** (what v1 Solidity allows) into a **dedicated module** — either:

   - **Option A:** A new **`src/lib/utils/contract/v1/permittedActions.ts`** that outputs **`PermittedActions`** using **`SecurePaymentLegacy` + `now` + role**, validated against **v1** contract docs / ABI; **or**
   - **Option B:** Incrementally refactor **`contractPermissions.ts`** to export **pure predicates** + a **`toPermittedActions(...)`** adapter for the rune only.

2. **Pending / in-flight:** Replace “scan every pending enum in a giant switch” with:

   - **`awaitingTx`** = **`rune.isPending`** **OR** “open tx inferred from 31006 / historical events” (see §4).
   - When **`awaitingTx`**, force **all `can*` false** (same as v2 **`computePermittedActions`**).

3. **Dispute proposals:** v1 today uses **`getDisputeProposal`** (chain) + **Nostr** proposal counts. For the rune:

   - **Fetch dispute proposal only when `SecurePaymentLegacy.state === InDispute`** (see §5.5).
   - Derive **proposal turn / count** from **`statusEventsByNewest`** with rules **documented in one place** (similar spirit to **`disputeProjectionFromStatus.ts`**, but **v1-specific** tag/action semantics).

4. **Terminal states:** **`isTerminalPaymentState`** in **`permittedActions.ts` (v2)** reflects **v2** `ContractStatus`. For v1, add **`isTerminalV1ChainState(state: number): boolean`** (or branch inside **`computePermittedActionsV1`**) so **`Funded` vs `Refunded` vs Nostr-only `FundsReleased`** behaviour matches **v1** product expectations and subscription **`closeOnEose`**.

### 3.3 Lifecycle orchestrators — `lifecycle/v1.ts`

Mirror **`lifecycle/v2.ts`** for each **supported** action:

1. Validate signer / role / **`computePermittedActions`** (or dedicated preflight).
2. Call **v1 thin write** (paymentId = escrowId).
3. **`runParallelNamed`**: **Kind 31006** publish (same schema as v2 **`publishV2ContractStatus`**) + **push** to counterparty.
4. Return **`{ ok: true, transactionHash }`** — **no** long **`tx.wait()`** inside lifecycle; **rune** **always** **`waitForTransaction`** + reload (see §5.4).

**Nostr — read vs write:** The **read path** must **parse** **legacy** `v1` 31006 rows (§5) **and** **`v2`-format** rows where **`s`** is **`ContractStatus`**. **Writes** from **`lifecycle/v1.ts`** use the **same** publisher and **`v="v2"`** as v2 (§4.1) — **one** event per action, **`transactionHash`**, no new **Pending\*** + confirmation pairs.

---

## 4. Status events: legacy (pending + confirmation) vs forward (single event per action)

| Aspect      | Legacy (existing v1 contracts in the wild)                                                                                          | Forward (new v1 orchestrations after switch)                                                |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| **Pattern** | Often **two** events per user action: **Pending\*** then **confirmed** chain-aligned status (historical **`escrow.ts`** behaviour). | **One** 31006 per action after **broadcast**, with **`transactionHash`** — same idea as v2. |
| **Loading** | History may end with **either** the pending or the confirmation event for the **same** tx; **both carry a hash**.                   | Only the single post-broadcast event needs to be ingested for new actions.                  |

**Decisions (product):**

1. **Read path** must support **legacy** event shapes and ordering so mid-flight v1 contracts still reconcile correctly.
2. **Write path** after the switch: **only** emit **one** status event per action for v1 (parallel to v2); do not add new **Pending\*** + confirmation pairs.
3. **Rune / `last event`:** When reconciling from history, **do not** require that the newest 31006 be “pending” vs “confirmed”. If **both** have the **same** `transactionHash`, treat that hash as the **thing to wait on**; **`contractRune`** already uses the **latest** relevant event’s **`transactionHash`** and **`waitForTransaction`** / reload — extend or verify this for v1 so it behaves whether the **last** ingested event is the pending or the confirmation row (chain reload remains source of truth after confirmation).

**Permissions:** `computePermittedActionsV1` should still treat **“tx in flight”** as **all `can*` false** (same as v2 **`awaitingTx`**). That can be **`rune.isPending`** and/or inferring from **pending**-style action tags in **legacy** history until the chain catches up.

### 4.1 Nostr \*\*`version` tag (`v`): event format — not “which chain contract”

The **`v`** tag on Kind **31006** describes **how to interpret `s` and the rest of the payload**, not whether the **underlying escrow** is v1 or v2 Solidity.

| Situation                                                                                                                      | **`v` on 31006**                                               | **`s` tag meaning**                                                                                                                                                             |
| ------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Legacy** status history (old app / old **`escrow.ts`** path)                                                                 | **`v1`** (or legacy **`0.0.1`** → treated as v1 in code today) | **`EscrowStatus`** numbers (including Nostr-only values like **`FundsReleased` = 10**) — **requires** normalization to **`ContractStatus`** on **read** (§5).                   |
| **New** publishes from **this** implementation — including **writes to an existing v1 chain contract** after the user upgrades | **`v2`**                                                       | **`ContractStatus`** from **`src/lib/utils/contract/types.ts`**, **identical** to what we use for true v2 chain interactions (e.g. **`FundsReleased` = 7**, not legacy **10**). |

**Writes (v1 lifecycle orchestrators):** Use the **same** **`publishV2ContractStatus`** (or equivalent) pipeline as **`lifecycle/v2.ts`**: **one** event per action, **`transactionHash`**, **`s` = `ContractStatus`**, **`v` = `"v2"`**. The **chain** still calls **v1** `completeTask` / `acceptTask` / …; the **Nostr** layer is **format v2**.

**Reads:** **Only** the **legacy** branch needs **`EscrowStatus` → `ContractStatus`** mapping. Example: an open **v1** contract has **two** historical 31006 rows with **`v1`**; after the user acts with the new app, the **third** event has **`v2`** — **`s`** already matches **`ContractStatus`** and needs **no** legacy normalizer.

**Summary:** **Legacy = read path.** **Going forward = always publish as `v="v2"`** canonical statuses, even when the **payment contract** (Kind 30006) is still **`version: 'v1'`** on-chain.

---

## 5. Legacy `EscrowStatus` → `ContractStatus` (NDK `NDKContractStatus`)

### 5.1 Why this exists

- **v2-formatted 31006 (`v` = `v2`):** **`s`** is already **`ContractStatus`**; use it directly (same as today for v2 chain contracts).
- **Legacy 31006 (`v` = `v1` / `0.0.1`):** **`s`** carried **`EscrowStatus`** (mix of chain + Nostr-only values). **Normalization** turns those into **`ContractStatus`** for one UI model.
- **v1 chain** still only exposes a **small** set of states on **`getEscrow`**; combined with **legacy** 31006 is how old UIs inferred “in progress”, pending rows, etc.

**Implementation location (decided):** **`src/lib/nostr/events/contractStatus.ts`** — in the **`status` getter** (or a **helper** it calls), when **`version` indicates legacy wire format** (`v1` / `0.0.1`), apply **`normalizeV1EscrowStatusToContractStatus(...)`**. When **`version` is `v2`**, **`s`** is already **`ContractStatus`** (no legacy map).

**Numeric mismatch:** Legacy **`EscrowStatus.FundsReleased = 10`** but **`ContractStatus.FundsReleased = 7`**. The normalizer **must** map by **semantic** path, not raw equality of numbers, wherever legacy enums collide with **`ContractStatus`**.

### 5.2 Mapping table (from `escrow.ts` publish paths)

| Flow                       | Legacy `EscrowStatus` values in events                                                                                                                                                                                       | Normalized **`ContractStatus`**                                     |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| **`completeTask`**         | `PendingCompletion` (8), `Completed` (4)                                                                                                                                                                                     | **`Completed`** (4)                                                 |
| **`acceptTask`**           | `PendingAcceptance` (11), `FundsReleased` (10)                                                                                                                                                                               | **`FundsReleased`** (7) — _not_ raw `10`                            |
| **`cancelEscrow`**         | `PendingCancellation` (9), `Cancelled` (5)                                                                                                                                                                                   | **`Cancelled`** (5)                                                 |
| **`refundClient`**         | Same **pending + cancelled** pattern as cancel (`PendingCancellation`, `Cancelled`); legacy also used **`statusMessagingVariant: 'refund'`** for messaging — **do not** special-case; normalize to **`Cancelled`** (5) only. |
| **`disputeTask`**          | `PendingDispute` (13), `InDispute` (1)                                                                                                                                                                                       | **`InDispute`** (1)                                                 |
| **`proposeResolution`**    | `PendingResolutionProposal` (14), …                                                                                                                                                                                          | **`InDispute`** (1) — chain stays in dispute for all proposal steps |
| **`acceptProposal`**       | `PendingProposalAcceptance` (15), `DisputeResolved` (2)                                                                                                                                                                      | **`DisputeResolved`** (2)                                           |
| **`resolveAfterTimelock`** | See §5.3                                                                                                                                                                                                                     |

### 5.3 `resolveAfterTimelock` (more than one outcome)

Source: **`escrow.ts`** — before broadcast, caller passes **`escrowStatus`** (`Completed` vs `InDispute`). Nostr publishes **`PendingTimelockResolution` (16)** then, after **`tx.wait()`**, **`FundsReleased` (10)** if the prior chain state was **`Completed`**, or **`DisputeUnresolved` (3)** if prior was **`InDispute`**.

| Legacy `EscrowStatus` in event                                   | Normalized **`ContractStatus`**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`PendingTimelockResolution` (16)**                             | **Ambiguous** without chain context: the event only means “timelock resolution tx submitted”. **Map using current chain `SecurePaymentLegacy.state`:** if **`Completed` (4)** → treat as progress toward release → **`Completed`** (4) _or_ derive “awaiting timelock resolution” UX from **`rune.isPending`**; if **`InDispute` (1)** → **`InDispute`** (1). **Exact getter API** (pure `s` vs `s` + injected chain snapshot) is an implementation detail — **do not** map `16` to **`FundsReleased`** / **`DisputeUnresolved`** until the **confirmation** event arrives. |
| **`FundsReleased` (10)** (post–timelock from **Completed** path) | **`FundsReleased`** (7)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| **`DisputeUnresolved` (3)**                                      | **`DisputeUnresolved`** (3)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |

**Practical approach:** Export **`normalizeV1EscrowStatusToContractStatus(legacyS: number, ctx?: { chainState: number })`**. The **`status` getter** uses **`ctx`** when the rune has loaded **chain** (e.g. pass **`chainState`** into a **method** on **`NDKContractStatus`** set after hydration, or compute normalized status **on the rune** when **`s === 16`**). If **`s === 16`** and **no** `ctx`, return **`undefined`** from normalization and let **`displayStatus`** fall back to **`blockchainData.state`** mapped to **`ContractStatus`**.

### 5.4 Transaction await (v1 and v2)

- **Remove `shouldAwaitStatusTransaction`** from **`PaymentContractLifecycle`** and rune branching: **default rule** — **always** **`await`** the transaction referenced by the latest 31006 **`transactionHash`** when reconciling (same for v1 and v2 ports).
- **Duplicate hashes:** After the switch, **ongoing** v1 contracts only publish **one** event per action; history replay only **needs** the **latest** event for a flow. **No** special dedupe of **`waitForTransaction`** required (negligible duplicate risk).

### 5.5 Dispute data loading

- **`getDisputeProposal` (chain)** — **only** when **`SecurePaymentLegacy.state === InDispute`**. No fetch when not in dispute.

### 5.6 Push notifications

- Reuse **exact** v2 **push `type`** keys for v1 orchestrators (parity with **`lifecycle/v2.ts`**).

### 5.7 Sunset `escrow.ts`

- **Out of scope** for this effort — **no** mandate to remove or redirect legacy **`escrow.ts`** calls yet.

---

## 6. Rune behaviour differences to revisit

| Topic                                            | Issue                                                                                                                            |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| **`shouldAwaitStatusTransaction`**               | **Remove** — always await tx + reload for both versions (see §5.4).                                                              |
| **`chainIsTerminal` / `isTerminalPaymentState`** | v2 terminal set may not match **v1** (e.g. **`FundsReleased`** handling). Version-specific terminal check may be required.       |
| **`displayStatus` / badges**                     | After **`NDKContractStatus`** normalization (§5), **`contractStatusFormatterV2`** can consume **`ContractStatus`** consistently. |
| **Subscriptions**                                | **`closeOnEose: chainIsTerminal`** — wrong terminal detection can close subscriptions early for v1.                              |

---

## 7. Key dependencies / inputs to wire

1. **`paymentId` / escrow id** — same string as today on **`NDKPaymentContract`**.
2. **`contractAddress`** — required for **non-default** v1 deployments (**`ensureEscrowReady`** already supports this).
3. **`SecurePaymentLegacy`** from **`loadPaymentContractDetails`** — sufficient for **basic** time/state gates; **dispute proposal** — **extra chain read only when `state === InDispute`** (§5.5).
4. **`statusEventsByNewest`** — **`NDKContractStatus[]`**; must define **how v1 `EscrowStatus` pending values appear** in **`action` / `writeMethod`** tags (inspect **`publishV2ContractStatus`** vs **`publishEscrowStatus`**).
5. **Role:** **`isTasker`** on rune (tasker pubkey vs active user) — maps to **client** = tasker / **freelancer** = taskee for v1 **if** product naming stays consistent with **`loadPaymentContractDetails`** mapping.

---

## 8. Implementation roadmap (detailed checklist)

Use this as the **order of work**. Each stage lists **what to ship**, **checklist**, and **what you should see** when it is done.

---

### Stage 0 — Rune / lifecycle plumbing (v2 + shared)

**Goal:** One rule everywhere: **after a 31006 with `transactionHash`, await the tx and reload chain** — no feature-flag per version.

| #   | Task                                                                                                                                                                                                              | Done |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| 0.1 | Remove **`shouldAwaitStatusTransaction`** from **`PaymentContractLifecycle`** (`lifecycle/types.ts`) and from **`v1.ts` / `v2.ts`** exports.                                                                      | [ ]  |
| 0.2 | In **`contractRune.svelte.ts`**, **always** run the “wait for tx + `reloadBlockchainData`” path when a status event carries **`transactionHash`** (drop the `if (lifecycle.shouldAwaitStatusTransaction)` guard). | [ ]  |
| 0.3 | Grep for **`shouldAwaitStatusTransaction`** and fix call sites / tests.                                                                                                                                           | [ ]  |
| 0.4 | **`npm run check`**, **`npm run test:unit`** — fix any regressions.                                                                                                                                               | [ ]  |

**Expect:** v2 behaviour unchanged for users except any edge case that previously skipped waiting now consistently waits + reloads. **Risk:** low if tests cover rune + lifecycle.

---

### Stage 1 — Legacy 31006 read path: `ContractStatus` normalization

**Goal:** **`NDKContractStatus`** exposes a consistent **`ContractStatus`** for **legacy `v` tags**; **`v2`-tagged** events keep **`s`** as today.

| #   | Task                                                                                                                                                                                                   | Done |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---- |
| 1.1 | Add **`normalizeV1EscrowStatusToContractStatus(legacyS, ctx?)`** (and helpers) — implement **§5.2–§5.3** (incl. **10 → 7** for funds released, **`16`** + chain fallback).                             | [ ]  |
| 1.2 | Wire into **`contractStatus.ts`**: when **`version`** is legacy (`v1` / `0.0.1`), normalized **`status`** / accessor; when **`v2`**, raw **`s` → `ContractStatus`**.                                   | [ ]  |
| 1.3 | **`contractRune` / drawer:** **`displayStatus`** (or equivalent) uses **chain `blockchainData.state`** as primary where needed, **normalized event** for legacy-only nuance (document choice per §11). | [ ]  |
| 1.4 | Unit tests: matrix from **§5.2**, plus **`PendingTimelockResolution`** with/without **`ctx.chainState`**.                                                                                              | [ ]  |

**Expect:** Opening a **v1** contract with **only old `v1` 31006** history shows **correct badges** (no wrong “Funded” everywhere). **No new writes yet.**

---

### Stage 2 — `computePermittedActionsV1` (read-only, no chain writes)

**Goal:** **`ContractActionsNDK`** shows the **right buttons** for v1 chain rules **before** any new orchestrator ships.

| #   | Task                                                                                                                                                                                                                                                        | Done |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| 2.1 | New **`src/lib/utils/contract/v1/permittedActions.ts`** (or split file): **`computePermittedActionsV1(args)`** → **`PermittedActions`**, using **`SecurePaymentLegacy`**, **`isTasker`**, **`permissionsNowSeconds()`**, **`awaitingTx`**, **`isPending`**. | [ ]  |
| 2.2 | **`awaitingTx`:** `true` when **`rune.isPending`** **or** legacy 31006 indicates in-flight (pending-style **`s`** + **`transactionHash`** per product rules).                                                                                               | [ ]  |
| 2.3 | **`isTerminalV1ChainState`** (or branch): correct **`closeOnEose`**, no early subscription kill.                                                                                                                                                            | [ ]  |
| 2.4 | **Stub** v2-only flags (**`canMarkNoShow`**, …) **`false`** for v1.                                                                                                                                                                                         | [ ]  |
| 2.5 | **`lifecycle/v1.ts`**: replace **`emptyPermittedActions()`** with real **`computePermittedActionsV1`** wiring.                                                                                                                                              | [ ]  |
| 2.6 | Unit tests with mocked **`SecurePaymentLegacy`** + **`now`** (pattern: **`v2/permittedActions.test.ts`**).                                                                                                                                                  | [ ]  |

**Expect:** For a **loaded v1** escrow, **buttons match** what the old store would allow (sanity-check against **`contractPermissions`** for a few fixtures). **Clicks still no-op** until Stage 4+ (or show toast if not wired).

---

### Stage 3 — Thin v1 chain writes

**Goal:** **`contract/v1/writes.ts`** (name flexible): one function per **`escrow.ts`** write, **`executeWrite`-style** — **return tx**, **no `tx.wait()`** inside, **no Nostr**.

| #   | Task                                                                                                                                                                                                                                       | Done |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---- |
| 3.1 | **`completeTask`**, **`acceptTask`**, **`cancelEscrow`**, **`refundClient`**, **`disputeTask`**, **`proposeResolution`**, **`acceptProposal`**, **`resolveAfterTimelock`** — match ABI + **`ensureEscrowReady(contractAddress)`** pattern. | [ ]  |
| 3.2 | Optional: **`estimateGas`** helpers for preflight modals.                                                                                                                                                                                  | [ ]  |
| 3.3 | Unit or integration smoke (mock contract) — at least **one** write returns a **hash**.                                                                                                                                                     | [ ]  |

**Expect:** Can invoke writes from **tests** or a **throwaway script** without importing monolithic **`publishEscrowStatus`**.

---

### Stage 4 — First vertical slice: `markTaskComplete` (v1 lifecycle + Nostr)

**Goal:** Taskee can **complete task** on a **v1** escrow via **rune**; **31006** uses **`v="v2"`**, **`s=ContractStatus.Completed`**, **`writeMethod`** aligned with v2.

| #   | Task                                                                                                                                                                         | Done |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| 4.1 | **`markTaskCompleteV1`** in **`lifecycle/v1.ts`**: preflight, **`writes.completeTask`**, **`publishV2ContractStatus`** (same as **`markTaskCompleteV2`**), **v2 push type**. | [ ]  |
| 4.2 | **`completionAttachments`** if parity needed.                                                                                                                                | [ ]  |
| 4.3 | Manual test: **testnet**, v1 contract, **two parties** — one completion.                                                                                                     | [ ]  |

**Expect:** **Third** 31006 row (after legacy history) has **`v2`** tag; **`s`** is **`ContractStatus`**. Chain **`getEscrow`** shows **Completed**.

---

### Stage 5 — Remaining v1 orchestrators

**Goal:** Full parity with **§3.1** table (except v2-only actions).

| #   | Task                                                                                                                                                                                    | Done |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| 5.1 | **`acceptTask`**, **`refundTasker`** (→ **`refundClient`**), **`cancelPaymentContract`**, **`disputeTask`**, **`proposeResolution`**, **`acceptProposal`**, **`resolveAfterTimelock`**. | [ ]  |
| 5.2 | Each: **`publishV2ContractStatus`**, **`v="v2"`**, **`s` = post-success **`ContractStatus`**, **reuse v2 push types\*\* (§5.6).                                                         | [ ]  |
| 5.3 | **`resolveAfterTimelock`**: map **Nostr `s`** to **`FundsReleased` vs `DisputeUnresolved`** per chain outcome (§5.3).                                                                   | [ ]  |
| 5.4 | i18n: reuse **`dashboard.contracts.actions.*`** keys where possible; add only if missing.                                                                                               | [ ]  |

**Expect:** Full **v1** happy paths work through **ContractActionsNDK** without **`escrow.ts`** in that flow.

---

### Stage 6 — Dispute data + proposal UX (v1)

**Goal:** **`canProposeResolution` / `canAcceptProposal`** accurate for v1.

| #   | Task                                                                                                                       | Done |
| --- | -------------------------------------------------------------------------------------------------------------------------- | ---- |
| 6.1 | **`getDisputeProposal`** only when **`state === InDispute`** — pass into **`computePermittedActionsV1`** (extend args).    | [ ]  |
| 6.2 | **v1-specific** projection from **`statusEventsByNewest`** (alternation / counts per **§2.2** intent), documented in code. | [ ]  |
| 6.3 | Wire **`ProposeResolutionModalNDK`** / **`ContractActionsNDK`** for v1 if amounts differ from v2.                          | [ ]  |
| 6.4 | Tests: fixture event lists.                                                                                                | [ ]  |

**Expect:** Dispute flows match **v1** contract rules; no extra RPC when **not** in dispute.

---

### Stage 7 — QA hardening

| #   | Task                                                                                                   | Done |
| --- | ------------------------------------------------------------------------------------------------------ | ---- |
| 7.1 | **Matrix:** legacy **only `v1` 31006** → mixed **v1 + v2** rows → **only `v2`** after upgrade.         | [ ]  |
| 7.2 | **Reverted tx:** receipt `status === 0` → reload, no stuck **`isPending`**.                            | [ ]  |
| 7.3 | **Terminal** subscriptions: v1 **FundsReleased / Refunded / Cancelled** — card + drawer still correct. | [ ]  |

**Expect:** Confidence for **production** rollout next to existing v2.

---

### Stage 8 — Optional / later

| #   | Task                                                                                           | Done |
| --- | ---------------------------------------------------------------------------------------------- | ---- |
| 8.1 | Performance: avoid redundant **`getDisputeProposal`**.                                         | [ ]  |
| 8.2 | **`canDelete`** / never-funded — only if product asks (out of scope today).                    | [ ]  |
| 8.3 | Reduce duplication between **`contractPermissions`** and **`v1/permittedActions`** if painful. | [ ]  |

---

### Summary timeline (rough)

| Stage | Focus                  | Typical outcome                               |
| ----- | ---------------------- | --------------------------------------------- |
| **0** | Remove await flag      | Simpler rune; small v2 touch                  |
| **1** | Normalize legacy reads | Correct badges / status display               |
| **2** | v1 permissions         | Buttons reflect rules (still may not execute) |
| **3** | Thin writes            | Testable chain layer                          |
| **4** | One full write path    | First end-to-end v1 + Nostr v2-format         |
| **5** | All writes             | Feature-complete v1 rune                      |
| **6** | Dispute                | Parity in disputes                            |
| **7** | QA                     | Release-ready                                 |
| **8** | Polish                 | Optional                                      |

---

## 9. Related files (quick index)

| Area                              | Path                                                                                         |
| --------------------------------- | -------------------------------------------------------------------------------------------- |
| V1 chain writes (monolithic)      | `src/lib/utils/escrow/v1/escrow.ts`                                                          |
| V1 permissions                    | `src/lib/utils/helpers/contractPermissions.ts`                                               |
| V1 loader → `SecurePaymentLegacy` | `src/lib/utils/contract/v1/index.ts`                                                         |
| Lifecycle stub                    | `src/lib/utils/contract/lifecycle/v1.ts`                                                     |
| V2 reference                      | `src/lib/utils/contract/v2/blockchainWrites.ts`, `lifecycle/v2.ts`, `v2/permittedActions.ts` |
| Rune                              | `src/lib/runes/contractRune.svelte.ts`                                                       |
| NDK status + normalization        | `src/lib/nostr/events/contractStatus.ts`                                                     |
| Canonical chain enums             | `src/lib/utils/contract/types.ts`                                                            |

---

## 10. Decisions (resolved)

| Topic                                       | Decision                                                                                                                                                                                                                                                              |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **31006 / status history**                  | **Parse** legacy v1 status events indefinitely (or until product drops support). **Going forward**, v1 orchestrations use **one** 31006 per action (post-broadcast), same policy as v2.                                                                               |
| **Pending vs confirmation last event**      | For **legacy** history, the **last** event may be pending **or** confirmation; **both** carry **`transactionHash`**. **Rune** uses that hash for **`waitForTransaction`** / reload — no requirement that the newest row be a specific phase.                          |
| **Gas / wallet**                            | **v1 and v2 share the same gas wallet stack** for orchestrators.                                                                                                                                                                                                      |
| **Chain**                                   | **v1 integration is RGB-centric**, same as v2 (no separate BSC scope for this effort).                                                                                                                                                                                |
| **`canDelete`**                             | **Out of scope for now** — legacy deletion / never-funded flows stay as-is elsewhere; rune does **not** need to expose this yet.                                                                                                                                      |
| **Nostr `v` tag vs chain contract**         | **`v="v2"`** on 31006 = **canonical `ContractStatus` in `s`** (publisher format). **Applies to new writes even for v1 Solidity escrows.** **`v="v1"`** = legacy **read** path only. See **§4.1**.                                                                     |
| **Legacy → `ContractStatus` normalization** | **Reads only** when **`v`** is legacy. Implement in **`contractStatus.ts`**: map legacy **`EscrowStatus`** to **`ContractStatus`** per **§5.2–§5.3**; mind **numeric** differences (e.g. legacy Nostr **`FundsReleased` 10** → **`ContractStatus.FundsReleased` 7**). |
| **`refundClient` vs cancel**                | Both publish **`PendingCancellation` / `Cancelled`**; **do not** distinguish via **`statusMessagingVariant`** in normalization — treat as **`Cancelled`**.                                                                                                            |
| **`resolveAfterTimelock`**                  | **§5.3** — **`PendingTimelockResolution`** needs **chain context** or fallback to **`blockchainData.state`**; confirmed outcomes map to **`FundsReleased`** (7) or **`DisputeUnresolved`** (3).                                                                       |
| **Duplicate `waitForTransaction`**          | **No** dedicated dedupe — single-event-forward + **latest** event replay makes duplicates negligible.                                                                                                                                                                 |
| **`shouldAwaitStatusTransaction`**          | **Remove** — **always** await tx + reload for v1 and v2 (§5.4).                                                                                                                                                                                                       |
| **Dispute proposal load**                   | **Only** when **`state === InDispute`**.                                                                                                                                                                                                                              |
| **Push types**                              | **Reuse** exact v2 push **type** strings.                                                                                                                                                                                                                             |
| **`escrow.ts` cleanup**                     | **Out of scope** — no forced sunset.                                                                                                                                                                                                                                  |

---

## 11. Open points (minor, implementation time)

1. **API for `s === 16`:** Confirm whether **`NDKContractStatus`** gets a **`chainState`** hint after rune load, **`getNormalizedStatus(chainState)`**, or normalization stays **only** on **`contractRune`** when **`legacyS === PendingTimelockResolution`**.
2. **`computePermittedActionsV1`:** Confirm whether it consumes **normalized** event-derived status, **raw** chain state only, or **both** (recommended: **chain** as source of truth + **events** for pending / dispute projection).

---

_Last updated: §8 implementation roadmap (stages 0–8 + summary table)._
