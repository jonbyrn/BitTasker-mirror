# V2 payment contract — UI lifecycle plan

Plan for wiring **participant actions** (tasker / taskee), **NDK contract status events**, **push notifications**, and **`PaymentContractRune`** so the UI can call a small set of orchestrators (e.g. “mark task complete”) without touching raw `blockchainWrites` or Nostr details.

**Non-goals for this document:** changing v1 `ContractActions.svelte` or `nostrContract.ts` / `publishContractStatus` escrow pipeline.

---

## 1. What already exists

| Piece                                                                   | Location                                                                      | Role                                                                                                                                                                                                                                                         |
| ----------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Raw chain calls (estimate → staticCall → broadcast, **no `tx.wait()`**) | `src/lib/utils/contract/v2/blockchainWrites.ts`                               | `completeTask`, `acceptTask`, `disputeTask`, `proposeResolution`, `acceptProposal`, `resolveAfterTimelock`, `cancelPaymentContract`, `refundTasker`, `markNoShow`, `markWorkInProgress`, `claimNoShowRefund`, `claimUpfrontDeposit`, `createPaymentContract` |
| Creation orchestrator + parallel side effects                           | `src/lib/utils/contract/v2/creation.ts` — `createContract()`                  | Pattern: broadcast → `transactionHash` → parallel Nostr / DMs / task update / push → optional `afterConfirmed(receipt)` for republish with `paymentId`                                                                                                       |
| Participant `can*` rules (chain-only)                                   | `src/lib/utils/contract/v2/SECURE-PAYMENT-PARTICIPANT-ACTIONS.md`             | Source of truth for **who** may call **what** from `state`, role, times, `timelockEnd`                                                                                                                                                                       |
| Chain read shape                                                        | `SecurePaymentLegacy` + `ContractStatus` in `src/lib/utils/contract/types.ts` | `loadPaymentContractDetailsV2`                                                                                                                                                                                                                               |
| NDK contract + status parsing/publish                                   | `NDKPaymentContract`, `NDKContractStatus`                                     | Kind 30006 / 31006                                                                                                                                                                                                                                           |
| Rune (partial)                                                          | `src/lib/runes/contractRune.svelte.ts`                                        | Loads v2 chain data, subscribes `#r` + kind 31006, appends events (not yet parsed with `NDKContractStatus.from`, no permission derivation, no post-tx refresh loop)                                                                                          |

---

## 2. Target architecture (layers)

```
┌─────────────────────────────────────────────────────────────────┐
│  ContractActionsNDK.svelte                                       │
│  • Buttons call participant orchestrators only                   │
│  • $derived: permitted flags + disabled when awaiting tx       │
└────────────────────────────┬────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────┐
│  permittedActions (+ dispute projection)                         │
│  • Chain predicates from SECURE-PAYMENT-PARTICIPANT-ACTIONS.md   │
│  • Dispute / proposal turn: derived from status events + times   │
│  • awaitingTx → treat all can* as false for enabling buttons     │
└────────────────────────────┬────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────┐
│  PaymentContractRune (e.g. markTaskComplete) + blockchainWrites   │
│  • Direct EOA `executeWrite` only (iteration 1); gasless later   │
│  • After broadcast: NDKContractStatus (`s`, `action`, tx hash)   │
│  • pushNotificationService → dashboard / contracts tab deep link │
└────────────────────────────┬────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────┐
│  blockchainWrites.ts                                              │
└─────────────────────────────────────────────────────────────────┘

        Nostr subscription (rune) ◄── status events
        Compare chain.state vs latest event `s`; on mismatch → receipt + reload
        Both parties: waitForTransaction(hash) → loadPaymentContractDetailsV2
```

---

## 3. Resolved product decisions

| Topic                 | Decision                                                                                                                                                                                                                                                                                                                                                   |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Tag `s`**           | **Target on-chain `ContractStatus` (enum name / value) expected after the transaction succeeds.** Enables a quick check: if `blockchainData.state` already matches `s`, the update is reflected; if not, still worth `waitForTransaction` + reload.                                                                                                        |
| **Tag `action`**      | **Verb identifying the write**, e.g. `completeTask`, `acceptTask`, `disputeTask`, `proposeResolution`, `acceptProposal`, … Stable string contract between publisher and consumers (filtering, logging, analytics).                                                                                                                                         |
| **Tag `e`**           | **Always** the Kind **30006** payment contract event `id`. No UI path before that event exists.                                                                                                                                                                                                                                                            |
| **Dispute gating**    | **Do not** rely on `totalProposalCount` from chain for v2 UI. Derive from **31006 history**: events whose `s` / flow indicates dispute + **created_at** ordering; infer **proposal count**, **last proposer** (pubkey), and **proposed amounts** from encrypted tag payload where applicable.                                                              |
| **Push**              | Reuse **`pushNotificationService`**. **Deep link** should open **dashboard** with the **contracts** tab in focus (exact URL fragment or query param to align with whatever the wallet/dashboard UI uses when implemented—e.g. `/dashboard` + `?tab=contracts` or hash; keep consistent with `clickAction` in push payloads).                               |
| **Meta-transactions** | **First iteration: direct blockchain calls only.** Each rune lifecycle method should carry a short **TODO / note**: future default path = gasless (`executeMetaTransaction` or equivalent), **fallback** to direct `executeWrite` if gasless fails.                                                                                                        |
| **Reverted tx**       | After `waitForTransaction`: if receipt **failed** (`status === 0`), **reload payment details from the contract** (source of truth), **clear “awaiting”** state, **do not** treat the published status event as authoritative—effectively **ignore** that update for permission/sync (no extra “failed” Nostr event required). Optionally local toast only. |

---

## 4. Status event fields (v2 lifecycle)

After each successful **broadcast** (before requiring confirmation in the orchestrator):

1. **`transactionHash`** — required for both parties to wait and refresh.
2. **`s`** — **expected `ContractStatus`** after this tx mines successfully (e.g. `completeTask` → `Completed`). Use the same string/number convention as `NDKContractStatus` already uses for chain alignment.
3. **`action`** — **method name** aligned with `blockchainWrites` / orchestrator, e.g. `completeTask`, `proposeResolution`.
4. **`e`**, **`r`**, **`p`**, **`v`**, `messageType` — per existing NDK contract-status rules.

**Example mapping (illustrative; verify against actual state transitions):**

| `action`             | Typical expected `s` after success           |
| -------------------- | -------------------------------------------- |
| `completeTask`       | `Completed`                                  |
| `acceptTask`         | `FundsReleased`                              |
| `disputeTask`        | `InDispute` (or doc-specific variant)        |
| `markWorkInProgress` | `WorkInProgress`                             |
| `proposeResolution`  | `InDispute` (chain may stay same; see below) |
| `acceptProposal`     | `DisputeResolved`                            |
| …                    | …                                            |

If an action does **not** change `state` on chain (rare), `s` should still reflect the **post-tx canonical state** (often unchanged); `action` disambiguates what happened.

---

## 5. Sync model: single event per action + reconciliation

- **One** status event per user action, **after broadcast**, with **tx hash**, **`s`**, **`action`**.
- **No** v1-style pending + confirmed pair.

### 5.1 Rune / client reconciliation loop

1. **Ingest** events via `NDKContractStatus.from`; dedupe by `id`.
2. **Latest relevant event** (per `paymentId` / `r`): optionally compare **`s`** to current **`SecurePaymentLegacy.state`**.
   - **Match:** optional fast path—UI may skip `waitForTransaction` if already synced (still safe to no-op refresh).
   - **Mismatch:** expect tx still pending or reverted path—**`waitForTransaction(hash)`** then **`loadPaymentContractDetailsV2`**.
3. While a **tracked hash** is not yet resolved (or explicitly awaiting), set **`awaitingConfirmation`** → **disable all action buttons** (user rule).
4. **Self-published** events: same pipeline so the publisher’s UI also refreshes.
5. **Revert:** on receipt failure → **reload contract details**, drop reliance on that event for gating, clear awaiting, **no** follow-up failure Nostr event.

### 5.2 Duplicate / replay

Dedupe by **event `id`**. If the same `transactionHash` appears twice, ignore duplicates.

---

## 6. `permittedActions` + dispute projection

### 6.1 Chain-backed permissions

**Inputs:**

- **`SecurePaymentLegacy`** (`state`, times, `timelockEnd`, `noShowMarked`, addresses, fees).
- **Side:** **`isTasker`** boolean — **UI:** `PaymentContractRune.isTasker` (Nostr pubkey === `taskerPubkey`); otherwise permissions use the **taskee** branch. **Tests / wallet-only:** map `inferParticipantRole` → `isTasker: role === 'tasker'` when you only have chain addresses.
- **`now`:** **Unix seconds** for SECURE-PAYMENT predicates — product choice here is **device time + ~30s** (RSK block cadence) via `PaymentContractRune` / `permissionsNowSeconds()`, not `getBlock('latest')`.
- **`awaitingTx`:** if true, UI **disables** all actions regardless of chain `can*`.

**Output:** `{ canCompleteTask, canAcceptTask, … }` plus optional **reason** strings.

**Implementation:** pure module e.g. `permittedActions.ts` + **`$derived`** in rune or parent.

### 6.2 Dispute / proposal (Nostr-augmented)

For **`canProposeResolution`**, **`canAcceptProposal`**, and related UI:

- Build a **projection** from **ordered** `NDKContractStatus` list for this `r`:
  - Count events that indicate **dispute opened** / **proposal submitted** / **proposal accepted** (via **`action`** + optional encrypted amount tags).
  - Use **`created_at`** to determine **turn** (alternation model as in product rules—mirror SECURE-PAYMENT intent).
- Combine with **chain `state`** (e.g. must be `InDispute` or doc-defined variants) so chain remains **source of truth** for whether a dispute is active; Nostr fills **proposal sequence** the view does not return.

Document the **exact rules** in code comments or a short `dispute-projection.md` when implemented to avoid drift from SECURE-PAYMENT.

---

## 7. UI orchestrators (`PaymentContractRune` methods)

For each user-facing operation: call **`blockchainWrites.*`**, then in parallel (e.g. `runParallelNamed`):

- Publish **`NDKContractStatus`** with **`transactionHash`**, **`s`**, **`action`**.
- **`pushNotificationService.sendNotificationToNpubs`** with a **typed** payload and **dashboard / contracts tab** `clickAction`.

**Per-function file-level note (iteration 1):**

```text
// TODO(gasless): Prefer meta-tx path when available; fallback to executeWrite on failure.
```

**Out of scope inside orchestrators:** long `tx.wait()` loops (rune owns wait + reload).

---

## 8. UI component: `ContractActionsNDK.svelte`

- Consumes rune (or narrow props).
- Shows buttons only when **`can* && !awaitingTx`** (or show disabled with tooltip when `awaitingTx`).
- Calls **only** rune orchestration APIs (e.g. **`contractRune.markTaskComplete()`**), not `blockchainWrites` directly.
- DaisyUI + `svelte-i18n` for labels.

---

## 9. Implementation phases (detailed + checklists)

Phases **A** and **B** can be reordered if you want subscription refresh before permission tests.

---

### Phase A — Pure permissions (chain + time) — **done**

**Goal:** Deterministic **tasker/taskee** action flags from chain + block time, testable without Nostr.

**Deliverables**

- [x] `src/lib/utils/contract/v2/permittedActions.ts` (or split `permittedActions.chain.ts` if large).
- [x] Export **`computePermittedActions(args)`** with `SecurePaymentLegacy`, **`isTasker`**, `now`, `awaitingTx`, optional `disputeProjection` / `upfrontDeposit`.
- [x] Export **`inferParticipantRole`**, time constants (`GRACE_PERIOD`, `CANCELLATION_WINDOW`, `COMPLETION_TIMELOCK`, `DISPUTE_WINDOW`, plus doc-reference-only `DISPUTE_TIMELOCK`, `PROPOSAL_RESPONSE_PERIOD`, `NO_SHOW_RESPONSE_PERIOD`).
- [x] Re-export from `src/lib/utils/contract/v2/index.ts`.
- [x] Vitest: `src/lib/tests/unit/utils/contract/v2/permittedActions.test.ts` (mock `SecurePaymentLegacy` + explicit `now`).

**Checklist**

- [x] Map each doc section to code (file header **Doc → code map** in `permittedActions.ts`).
- [x] **No** `Date.now()` inside pure functions—only passed-in `now`.
- [x] When `awaitingTx === true` or `role === 'none'`, all returned `can*` are **false** (single pattern; no separate `buttonsEnabled` export).
- [x] Export TypeScript types: `PermittedActions`, `ComputePermittedActionsArgs`, `ParticipantRole`, `DisputeProjection`, `UpfrontDepositContext`.

**Cross-check vs [SECURE-PAYMENT-PARTICIPANT-ACTIONS.md](../../src/lib/utils/contract/v2/SECURE-PAYMENT-PARTICIPANT-ACTIONS.md)** (verified)

| Doc action              | Implemented | Notes                                                                                                                                                                                                                                                        |
| ----------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `completeTask`          | Yes         | Taskee; states 0, 9, 10; `now >= estimatedStartTime`                                                                                                                                                                                                         |
| `acceptTask`            | Yes         | Tasker; state 4                                                                                                                                                                                                                                              |
| `disputeTask`           | Yes         | Tasker; states 0 / 4 / 10; predicates match § (WIP free; Completed uses `timelockEnd` + window = `timelockEnd` with 7d+7d; Funded pre-start window + grace)                                                                                                  |
| `resolveAfterTimelock`  | Yes         | States 4, 1, 11; `timelockEnd !== 0`, `now > timelockEnd`; tasker-only for 1 / 11                                                                                                                                                                            |
| `proposeResolution`     | Partial     | Turn / count / `disputeAccepted` when **`disputeProjection`** passed; omit → false in dispute states (Phase E supplies projection). **`taskeeAmount` / `baseAmount` / state 1 vs 11 amount rules** → submit-time validation (Phase D/E), not `can*` booleans |
| `acceptProposal`        | Partial     | Same `disputeProjection` requirement                                                                                                                                                                                                                         |
| `cancelPaymentContract` | Yes         | States 0, 10; taskee always; tasker = three ORs from doc                                                                                                                                                                                                     |
| `refundTasker`          | Yes         | Taskee; states 0, 1, 11, 4, 9, 10                                                                                                                                                                                                                            |
| `markNoShow`            | Yes         | Tasker; state 0; `!noShowMarked`; `now >= estimatedStartTime + GRACE_PERIOD`                                                                                                                                                                                 |
| `markWorkInProgress`    | Yes         | Taskee; state 9; `now <= timelockEnd` (inclusive at end)                                                                                                                                                                                                     |
| `claimNoShowRefund`     | Yes         | Tasker; state 9; `now > timelockEnd` (strict)                                                                                                                                                                                                                |
| `claimUpfrontDeposit`   | Yes         | When **`upfrontDeposit`** context passed; strict `now > createdAt + GRACE_PERIOD`; amount vs wei via `ethers.parseEther`                                                                                                                                     |
| Terminal 2,3,5,6,7,8    | Yes         | All `can*` false                                                                                                                                                                                                                                             |
| `amount == 0`           | No          | Doc: “typically” no actions — **not** gated in Phase A; add in rune/UI if product requires                                                                                                                                                                   |

**Exit criteria:** Tests green (`permittedActions.test.ts`); importable from `$lib/utils/contract/v2` without circular deps. **Met.**

---

### Phase B — Rune: parse status events, await tx, reload, revert handling — **done**

**Goal:** **`PaymentContractRune`** holds **typed** status history, **`isPending`** while a tx is confirming, and **refreshed** `SecurePaymentLegacy` after txs.

**Deliverables**

- [x] Subscription **`wrap: true`** → **`NDKContractStatus`** (no `NDKContractStatus.from` in the rune). Events appended to **`statusEvents`**.
- [x] **No** app-side dedupe (NDK handles it). **`statusEventsByNewest`** `$derived` in rune (sort by `created_at` only).
- [x] **`start()`** loads **blockchain** before **`setupSubscription()`** so EOSE compares against fresh chain.
- [x] **`statusHistoryReady`** set on **first EOSE**; until then **`onEvent`** only appends; **no** reconcile. After that, **`onEvent`** runs reconcile.
- [x] After **first EOSE** (`statusHistoryReady`): reconcile **newest** historical row via same path as live (**v2**, **`!chainIsTerminal`**, **tx hash** → **`awaitStatusTxThenReload`**). Each **subsequent** live event uses the same guards.
- [x] **`isPending`** during **`waitForTransaction`** + reload; single **`reconcileLatestStatusIfNeeded()`** (no lock/queue). **`getProvider('rsk')`** from **`$lib/utils/contract`** for waits.
- [x] On receipt **revert** (`status === 0`): warn + reload chain anyway; **`processedStatusTxHashes`** still records hash.
- [x] **`isPending`** also used for **`resolvePaymentIdFromTxHash`** (creation path).

**Checklist**

- [x] Provider via **`walletManager` / `getProvider('rsk')`** (same pattern as `resolvePaymentIdFromTxHash`).
- [ ] Unsubscribe on destroy / payment change (caller still calls **`stopSubscription`** when wiring UI).
- [x] Errors during wait: **`error`** state + reload attempt + **`isPending`** cleared in **`finally`**.
- [x] **Reactive:** **`statusEvents`**, **`statusEventsByNewest`**, **`chainIsTerminal`**, **`statusHistoryReady`**, **`blockchainData`**, **`isPending`**.

**Exit criteria:** Opening a payment runs initial reconcile after EOSE when v2 + rules say so; live events re-reconcile. **Manual QA** cross-client still recommended.

---

### Phase C — First vertical slice: `markTaskComplete` + `ContractActionsNDK`

**Goal:** One action **end-to-end**: chain + Nostr + push + UI button for **taskee**.

**Deliverables**

- [x] **`PaymentContractRune.markTaskComplete()`** (chain + Nostr + push); **`contractRune.permittedActions`** from **`isTasker`** + chain snapshot.
- [x] Re-export from **`v2/index.ts`**.
- [x] After broadcast: **`NDKContractStatus`** with **`e`** = Kind 30006 id, **`r`** = `paymentId`, **`p`** = tasker (recipient), **`v`** = `v2`, **`m`** = `contract-status`, **`s`** = **`ContractStatus.Completed`**, **`transactionHash`**, encrypted tag **`writeMethod`** = `completeTask`.
- [x] Push to **tasker** npub via **`pushNotificationService`**; **`clickAction`** = dashboard contracts tab (same pattern as **`createContract`**).
- [x] **`ContractActionsNDK.svelte`**: props **`contract`**, **`contractRune`**; uses **`contractRune.permittedActions`** (derived on the rune: chain + Nostr role + **`isPending`** + app **`now` + offset**).
- [x] Wire **`ContractCardNDK.svelte`** (v2 only, when chain data present).
- [x] **en + es** in **`static/locales/*/dashboard/contracts/actions.json`** for any **new** error keys (button label may reuse **`complete_task`**).

**Implementation checklist**

- [x] **Preflight:** `loadPaymentContractDetailsV2` → fresh **`computePermittedActions`** (**`isTasker`**, app **`now` + ~30s**, **`awaitingTx: false`**); abort if **`!canCompleteTask`** with i18n **`errorKey`**.
- [x] **Chain:** **`completeTask(paymentId, { contractAddress, chain: 'rsk' })`**; capture **`tx.hash`**.
- [x] **NDK:** **`ndk` singleton** from **`$lib/nostr/ndk`**; **`status.author = ndk.activeUser`**; **`status.publish()`**.
- [x] **TODO(gasless)** on **`PaymentContractRune.markTaskComplete`**.
- [x] **`runParallelNamed`**: Nostr publish + push; log **`failures`** but do **not** fail the overall result if chain tx already broadcast.
- [x] **UI:** hide button when **`!canCompleteTask`**; **disable** when **`contractRune.isPending`** or local **busy**; toast on **`errorKey`** / success.
- [ ] **Manual:** testnet happy path + tasker receives event (subscription) and optional push.

**Exit criteria:** Happy path works on testnet; counterparty sees Nostr + push (if env configured).

---

### Phase D — Remaining orchestrators + push matrix + i18n

**Goal:** All product-required writes have UI entry points and consistent tags.

**Deliverables**

- [ ] One **`PaymentContractRune`** method (or small helper) per required **`blockchainWrites`** method (accept, dispute, cancel, refund, no-show, WIP, claims, resolution, timelock, etc.—trim to what v2 UI actually exposes).
- [ ] Central **table** (in code or doc): `action` string → `blockchainWrites` → expected **`s`** → push **type** key.
- [ ] i18n for all new strings.
- [ ] Extend **`ContractActionsNDK`** with buttons grouped by role (tasker vs taskee).

**Checklist**

- [ ] Each publish uses **`e`** = Kind 30006 id from rune / contract context.
- [ ] Push `clickAction` consistent (dashboard + contracts tab).
- [ ] No duplicate status publishes per single user click.

**Exit criteria:** Matrix reviewed against `blockchainWrites.ts` list; no orphan writes needed by SECURE-PAYMENT without a button path.

---

### Phase E — Dispute projection + proposal UI

**Goal:** **`canProposeResolution`** / **`canAcceptProposal`** (and related) from **chain + Nostr projection**.

**Deliverables**

- [ ] `disputeProjection.ts` (name negotiable): input **sorted** `NDKContractStatus[]` + chain `state` → `{ proposalCount, lastProposerPubkey, lastProposalAt, … }`.
- [ ] Merge with **`computePermittedActions`** (either composed or single exported **`computeUiPermissions`**).
- [ ] Tests with **fixture** event lists (synthetic `NDKContractStatus` or minimal JSON).
- [ ] UI fields for proposed amounts if shown (read from encrypted tags on relevant events).

**Checklist**

- [ ] Align alternation rules with **SECURE-PAYMENT-PARTICIPANT-ACTIONS.md** (update doc if Nostr is now the source for “last proposer”).
- [ ] Edge case: missing events (only chain)—conservative **deny** proposal buttons or show “syncing”.
- [ ] `awaitingTx` still disables everything.

**Exit criteria:** Two-party dispute proposal flow testable manually with two profiles.

---

### Phase F (later) — Gasless primary, direct fallback

**Not part of first ship**; tracked from TODOs on each orchestrator.

**Checklist (when scheduled)**

- [ ] Shared helper: try meta-tx → on failure → existing `executeWrite`.
- [ ] Telemetry or logging for fallback rate.
- [ ] Update this plan’s §3 table when default path switches.

---

## 10. Related docs / code

- [SECURE-PAYMENT-PARTICIPANT-ACTIONS.md](../../src/lib/utils/contract/v2/SECURE-PAYMENT-PARTICIPANT-ACTIONS.md)
- [contract-status-nostr-events.md](./contract-status-nostr-events.md)
- [ndk-contract-status-adaptation-plan.md](./ndk-contract-status-adaptation-plan.md)
- `src/lib/utils/contract/v2/blockchainWrites.ts`
- `src/lib/utils/contract/v2/creation.ts` — `createContract`
- `src/lib/runes/contractRune.svelte.ts`

---

## 11. Summary

Use **`s`** = **expected post-tx `ContractStatus`** and **`action`** = **write name** so clients can **reconcile** chain vs Nostr quickly, then **wait + reload** when needed. **Dispute turn** comes from **31006 history** + timestamps, not from missing chain counters. **Push** reuses **`pushNotificationService`** toward **dashboard / contracts tab**. **Iteration 1** is **direct** calls only, with **gasless TODOs** on each orchestrator. **`e`** is always the **30006** id. On **revert**, **reload contract** and **ignore** the optimistic status for truth. Implement in **phases A–E** with the checklists above; **F** for gasless later.
