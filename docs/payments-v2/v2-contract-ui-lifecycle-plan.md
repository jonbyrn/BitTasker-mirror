# V2 payment contract — UI lifecycle plan

Plan for wiring **participant actions** (tasker / taskee), **NDK contract status events**, **push notifications**, and **`PaymentContractRune`** so the UI calls **stable methods** (`markTaskComplete`, `acceptTask`, …) without version checks in components or raw `blockchainWrites` / Nostr wiring in the rune.

**Non-goals for this document:** changing legacy v1 `ContractActions.svelte` or `nostrContract.ts` / `publishContractStatus` escrow pipeline.

---

## 1. Review — implemented (current)

| Piece                       | Location                                                                                                       | Role                                                                                                                                                                                                                                                                                                                                                        |
| --------------------------- | -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Version lifecycle API**   | `src/lib/utils/contract/lifecycle/` — `types.ts`, `v1.ts`, `v2.ts`, `v2WriteHelpers.ts`, `index.ts`, `time.ts` | **`getPaymentContractLifecycle(version)`** returns **`PaymentContractLifecycle`**: **`loadPaymentContractDetails`**, **`computePermittedActions`**, **`markTaskComplete`**, **`acceptTask`**, **`refundTasker`**, **`cancelPaymentContract`**, **`shouldAwaitStatusTransaction`**.                                                                          |
| **v2 chain + Nostr + push** | `lifecycle/v2.ts`                                                                                              | **`markTaskComplete`**, **`acceptTask`**, **`refundTasker`** (as before). **`cancelPaymentContract`**: `cancelPaymentContract` → 31006 `s=Cancelled`, `writeMethod=cancelPaymentContract`, push **`contract_payment_cancelled`** to **counterparty** (taskee if tasker cancelled, else tasker).                                                             |
| **v1**                      | `lifecycle/v1.ts`                                                                                              | **`loadPaymentContractDetails`** → v1 `getEscrow`; **`computePermittedActions`** → all false; **`markTaskComplete` / `acceptTask`** → not allowed i18n keys; **no** status-tx wait path.                                                                                                                                                                    |
| **Rune**                    | `src/lib/runes/contractRune.svelte.ts`                                                                         | Owns **subscriptions**, **`blockchainData`**, **`isPending`**, **`isTasker`**, **`permittedActions`** `$derived` → **`lifecycle.computePermittedActions(this)`**. **Delegates** **`reloadBlockchainData`** → **`lifecycle.loadPaymentContractDetails`**, **`markTaskComplete` / `acceptTask`** → lifecycle. **No `version === 'v2'`** in reload or actions. |
| **UI**                      | `ContractActionsNDK.svelte`, `ContractCardNDK.svelte`                                                          | Buttons from **`permittedActions.canCompleteTask` / `canAcceptTask`** only; mounted when chain data exists **and** at least one flag is true.                                                                                                                                                                                                               |
| **Permissions math (v2)**   | `src/lib/utils/contract/v2/permittedActions.ts`                                                                | Pure **`computePermittedActions({ payment, isTasker, now, awaitingTx, … })`**; **`now`** = device + **~30s** via **`permissionsNowSeconds()`** in lifecycle.                                                                                                                                                                                                |
| **Raw writes**              | `src/lib/utils/contract/v2/blockchainWrites.ts`                                                                | `completeTask`, `acceptTask`, … (no `tx.wait()` in writes; rune waits on 31006 hash when **`shouldAwaitStatusTransaction`**).                                                                                                                                                                                                                               |

---

## 2. Target architecture (layers)

```
┌─────────────────────────────────────────────────────────────────┐
│  ContractActionsNDK.svelte                                       │
│  • Buttons: contractRune.markTaskComplete() / acceptTask()        │
│  • Visibility: permittedActions.can* ; disabled if isPending/busy   │
└────────────────────────────┬────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────┐
│  PaymentContractRune                                             │
│  • $derived permittedActions → lifecycle.computePermittedActions │
│  • reloadBlockchainData → lifecycle.loadPaymentContractDetails   │
│  • Nostr sub #r + 31006; if lifecycle.shouldAwaitStatusTransaction│
│    → waitForTransaction(hash) → reload                           │
└────────────────────────────┬────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────┐
│  lifecycle/v1.ts  |  lifecycle/v2.ts                             │
│  • load / computePermittedActions / markTaskComplete / acceptTask │
│  • v2: runParallelNamed(Nostr status + push) after broadcast      │
└────────────────────────────┬────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────┐
│  blockchainWrites.ts (v2)  +  v1/index load                      │
└─────────────────────────────────────────────────────────────────┘
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

| `action`                | Typical expected `s` after success           |
| ----------------------- | -------------------------------------------- |
| `completeTask`          | `Completed`                                  |
| `acceptTask`            | `FundsReleased`                              |
| `refundTasker`          | `Refunded`                                   |
| `cancelPaymentContract` | `Cancelled`                                  |
| `disputeTask`           | `InDispute` (or doc-specific variant)        |
| `markWorkInProgress`    | `WorkInProgress`                             |
| `proposeResolution`     | `InDispute` (chain may stay same; see below) |
| `acceptProposal`        | `DisputeResolved`                            |
| …                       | …                                            |

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
- **`now`:** **Unix seconds** for SECURE-PAYMENT predicates — product choice here is **device time + ~30s** (RGB block cadence) via `PaymentContractRune` / `permissionsNowSeconds()`, not `getBlock('latest')`.
- **`awaitingTx`:** if true, UI **disables** all actions regardless of chain `can*`.

**Output:** `{ canCompleteTask, canAcceptTask, … }` plus optional **reason** strings.

**Implementation:** v2 rules in **`permittedActions.ts`**; **invocation** is **version-specific** via **`lifecycle.computePermittedActions(rune)`** (v1 returns empty until v1 rules exist). Rune **`$derived`** calls the lifecycle and touches **`statusEventsByNewest`** for future dispute projection.

### 6.2 Dispute / proposal (Nostr-augmented)

For **`canProposeResolution`**, **`canAcceptProposal`**, and related UI:

- Build a **projection** from **ordered** `NDKContractStatus` list for this `r`:
  - Count events that indicate **dispute opened** / **proposal submitted** / **proposal accepted** (via **`action`** + optional encrypted amount tags).
  - Use **`created_at`** to determine **turn** (alternation model as in product rules—mirror SECURE-PAYMENT intent).
- Combine with **chain `state`** (e.g. must be `InDispute` or doc-defined variants) so chain remains **source of truth** for whether a dispute is active; Nostr fills **proposal sequence** the view does not return.

Document the **exact rules** in code comments or a short `dispute-projection.md` when implemented to avoid drift from SECURE-PAYMENT.

---

## 7. UI orchestrators (lifecycle modules)

For each user-facing operation, the **version’s `lifecycle/v*.ts`** function:

- Calls **`blockchainWrites.*`** (or v1 loader), then in parallel (**`runParallelNamed`**) where needed:
  - Publish **`NDKContractStatus`** with **`transactionHash`**, **`s`**, encrypted **`writeMethod`** matching the write name.
  - **`pushNotificationService.sendNotificationToNpubs`** with a **typed** payload and **dashboard `?tab=contracts`** `clickAction`.

**Per-orchestrator note (iteration 1):**

```text
// TODO(gasless): Prefer meta-tx path when available; fallback to executeWrite on failure.
```

**Out of scope inside lifecycle write helpers:** long `tx.wait()` loops (rune owns wait + reload when **`shouldAwaitStatusTransaction`**).

---

## 8. UI component: `ContractActionsNDK.svelte`

- Props: **`contractRune`**.
- **Complete task** when **`permittedActions.canCompleteTask`**; **Accept work** when **`canAcceptTask`**; **Refund tasker** when **`canRefundTasker`**; **Cancel contract** when **`canCancelPaymentContract`**.
- **`disabled`** when **`contractRune.isPending`** or local **`busy`** (shared between actions).
- Calls **`contractRune.markTaskComplete()`** / **`acceptTask()`** / **`refundTasker()`** / **`cancelPaymentContract()`** only.
- DaisyUI + `svelte-i18n` (`dashboard.contracts.actions.*`).
- **Confirm / completion modals** (planned): see **[v2-contract-modals-plan.md](./v2-contract-modals-plan.md)** — reuse **`ConfirmModal`**, add NDK-native task completion modal; today buttons fire lifecycle **immediately**.

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
- [x] **`isPending`** during **`waitForTransaction`** + reload; single **`reconcileLatestStatusIfNeeded()`** (no lock/queue). **`getProvider('rgb')`** from **`$lib/utils/contract`** for waits.
- [x] On receipt **revert** (`status === 0`): warn + reload chain anyway; **`processedStatusTxHashes`** still records hash.
- [x] **`isPending`** also used for **`resolvePaymentIdFromTxHash`** (creation path).

**Checklist**

- [x] Provider via **`walletManager` / `getProvider('rgb')`** (same pattern as `resolvePaymentIdFromTxHash`).
- [ ] Unsubscribe on destroy / payment change (caller still calls **`stopSubscription`** when wiring UI).
- [x] Errors during wait: **`error`** state + reload attempt + **`isPending`** cleared in **`finally`**.
- [x] **Reactive:** **`statusEvents`**, **`statusEventsByNewest`**, **`chainIsTerminal`**, **`statusHistoryReady`**, **`blockchainData`**, **`isPending`**.

**Exit criteria:** Opening a payment runs initial reconcile after EOSE when v2 + rules say so; live events re-reconcile. **Manual QA** cross-client still recommended.

---

### Phase C — Vertical slice: `markTaskComplete` + lifecycle extraction — **done**

**Goal:** Taskee **mark complete** end-to-end, then **centralize** version branching in **`utils/contract/lifecycle`**.

**Done**

- [x] **`lifecycle/v2.ts`**: **`markTaskCompleteV2(rune)`** — preflight, **`completeTask`**, 31006 + push to tasker.
- [x] **`lifecycle/v1.ts`**: load via v1 **`getEscrow`**; empty permissions; **`markTaskComplete`** not allowed.
- [x] **`PaymentContractRune`**: **`lifecycle`** from **`getPaymentContractLifecycle(version)`**; **`reloadBlockchainData`** → **`lifecycle.loadPaymentContractDetails`**; **`permittedActions`** → **`lifecycle.computePermittedActions`**; **`markTaskComplete()`** delegates to lifecycle.
- [x] **`ContractLifecycleResult`**: **`{ ok: true, transactionHash } | { ok: false, errorKey }`** (shared shape for all actions).
- [x] **UI** + i18n for mark-complete path.

---

### Phase C′ — `acceptTask` (tasker accepts completed work) — **done (code); manual QA open**

**Goal:** Second vertical slice — **tasker** releases funds after **`Completed`** state.

**Deliverables**

- [x] **`lifecycle/v2.ts`**: **`acceptTaskV2(rune)`** — requires **`rune.isTasker`**, preflight **`canAcceptTask`**, **`acceptTask`** write, 31006 with **`s` = `FundsReleased`**, **`writeMethod` = `acceptTask`**, **`p`** = taskee; push **`contract_payment_released`** to taskee.
- [x] **`lifecycle/v1.ts`**: **`acceptTaskV1`** → not allowed.
- [x] **`PaymentContractRune.acceptTask()`** → **`lifecycle.acceptTask(this)`**.
- [x] **`ContractActionsNDK`**: **Accept work** button when **`canAcceptTask`** (`btn-success`).
- [x] **en + es**: **`accept_task_*`**, **`accept_work_success`** under **`dashboard.contracts.actions`**.

**Checklist**

- [x] Reuse **`payment_released_error`** for chain failure on accept write.
- [ ] **Manual:** testnet tasker accepts after taskee complete; taskee sees 31006 + optional push.

**Exit criteria:** Same as Phase C for the accept path.

---

### Phase D — Remaining orchestrators + push matrix + i18n

**Goal:** All product-required writes have UI entry points and consistent tags.

**Suggested implementation order:** **§11.2 / §11.3** (next: **`markWorkInProgress`**).

**Deliverables**

- [ ] One **`lifecycle/v2.ts` function + rune wrapper** per remaining **`blockchainWrites`** method (dispute, cancel, refund, no-show, WIP, claims, resolution, timelock, etc.—trim to what v2 UI exposes).
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

- **[v2-contract-modals-plan.md](./v2-contract-modals-plan.md)** — confirmation + **`TaskCompletionModalNDK`** (planned) before further lifecycle buttons.
- **[v2-dispute-integration-path.md](./v2-dispute-integration-path.md)** — dispute flow, 31006 projection, rune, UI checklist (in progress).
- [SECURE-PAYMENT-PARTICIPANT-ACTIONS.md](../../src/lib/utils/contract/v2/SECURE-PAYMENT-PARTICIPANT-ACTIONS.md)
- [contract-status-nostr-events.md](./contract-status-nostr-events.md)
- [ndk-contract-status-adaptation-plan.md](./ndk-contract-status-adaptation-plan.md)
- **`src/lib/utils/contract/lifecycle/`** — version **`PaymentContractLifecycle`** (load, permissions, **`markTaskComplete`**, **`acceptTask`**, **`refundTasker`**, …); **pending writes:** §**11**
- `src/lib/utils/contract/v2/blockchainWrites.ts`
- `src/lib/utils/contract/v2/creation.ts` — `createContract`
- `src/lib/runes/contractRune.svelte.ts`

---

## 11. Lifecycle wiring scorecard

Track **end-to-end** wiring: **`lifecycle/v2.ts` orchestrator** (preflight → `blockchainWrites.*` → `runParallelNamed`: 31006 + push) → **`PaymentContractRune` delegate** → **`ContractActionsNDK`** (or follow-on component) → **i18n** under `dashboard.contracts.actions.*`. Cross-check expected **`s`** / **`writeMethod`** with §4 and `contract-status-nostr-events.md`.

### 11.1 Done

- [x] **Escrow creation** — `src/lib/utils/contract/v2/creation.ts` → `createContract` (parallel Nostr/push; not on `PaymentContractLifecycle`).
- [x] **`completeTask`** — `markTaskCompleteV2`, rune `markTaskComplete()`, `canCompleteTask`, UI button.
- [x] **`acceptTask`** — `acceptTaskV2`, rune `acceptTask()`, `canAcceptTask`, UI button; kind **31000** `COMPLETED` + rune reconciliation (extra vs original Phase C′).
- [x] **`refundTasker`** — `refundTaskerV2`, rune `refundTasker()`, `canRefundTasker`, UI button; 31006 `s=Refunded`, push **`contract_refund_to_tasker`** to tasker.
- [x] **`cancelPaymentContract`** — `cancelPaymentContractV2`, rune `cancelPaymentContract()`, `canCancelPaymentContract`, UI button; 31006 `s=Cancelled`, push **`contract_payment_cancelled`** to counterparty.

### 11.2 Backlog — suggested order

Rough principle: **taskee-only escapes** and **cancel** **done**; then **progress / no-show**, **dispute entry**, **timelock resolution**, **dispute settlement** (needs **Phase E** projection for full `can*` parity), **upfront** last (extra rune/load context).

| Priority  | `blockchainWrites`          | Main actor                        | Why this order                                                                                                       |
| --------- | --------------------------- | --------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| ~~**1**~~ | ~~`refundTasker`~~          | Taskee                            | **Done** — see §11.1.                                                                                                |
| ~~**2**~~ | ~~`cancelPaymentContract`~~ | Tasker + taskee                   | **Done** — see §11.1.                                                                                                |
| **3**     | `markWorkInProgress`        | Taskee                            | Small state step (`NoShow` path).                                                                                    |
| **4**     | `markNoShow`                | Tasker                            | Pairs with WIP / no-show timeline.                                                                                   |
| **5**     | `claimNoShowRefund`         | Tasker                            | After no-show + timelock.                                                                                            |
| **6**     | `disputeTask`               | Tasker                            | Opens dispute; 31006 + push pattern.                                                                                 |
| **7**     | `resolveAfterTimelock`      | Tasker / taskee (state-dependent) | Mechanical follow-up to completed / dispute timelocks.                                                               |
| **8**     | `proposeResolution`         | Alternating                       | **`canProposeResolution`** needs **Phase E** projection for real UX; can still wire chain + 31006 + conservative UI. |
| **9**     | `acceptProposal`            | Alternating                       | Same as **8**.                                                                                                       |
| **10**    | `claimUpfrontDeposit`       | Taskee                            | **`computePermittedActions`** needs **`upfrontDeposit`** context from load/rune — wire load path first.              |

### 11.3 Per-action checklist (unchecked = pending)

Use this list to **keep score**. Check the line when the action is shippable end-to-end (including push + i18n unless product says otherwise).

- [x] **1. `refundTasker`** — taskee refund paths (`canRefundTasker`).
- [x] **2. `cancelPaymentContract`** — tasker + taskee cancel (`canCancelPaymentContract`).
- [ ] **3. `markWorkInProgress`** — taskee (`canMarkWorkInProgress`).
- [ ] **4. `markNoShow`** — tasker (`canMarkNoShow`).
- [ ] **5. `claimNoShowRefund`** — tasker (`canClaimNoShowRefund`).
- [ ] **6. `disputeTask`** — tasker (`canDisputeTask`).
- [ ] **7. `resolveAfterTimelock`** — (`canResolveAfterTimelock`).
- [ ] **8. `proposeResolution`** — (`canProposeResolution` + Phase E when ready).
- [ ] **9. `acceptProposal`** — (`canAcceptProposal` + Phase E when ready).
- [ ] **10. `claimUpfrontDeposit`** — (`canClaimUpfrontDeposit` + upfront context on rune/loader).

**Optional sub-tasks per item** (repeat mentally or as PR checklist): `refundTaskerV2`-style function → extend **`PaymentContractLifecycle`** + **`PaymentContractRuneLike`** if needed → rune public method → UI + **`permittedActions.can*`** → document **`s`** / **`writeMethod`** / push **type** in the Phase D matrix (§9 Phase D).

---

## 12. Summary

**Version-specific behavior** lives in **`lifecycle/v1.ts`** and **`lifecycle/v2.ts`** as functions **`(rune) => …`**. The **rune** holds reactive state and subscriptions; **UI** only checks **`permittedActions.can*`** and calls **`markTaskComplete` / `acceptTask` / `refundTasker` / `cancelPaymentContract`** (and further actions as wired). Use **`s`** = **expected post-tx `ContractStatus`** and **`writeMethod`** = **write name** for reconciliation; **push** targets the **counterparty** with **typed** payloads and **dashboard `?tab=contracts`**. **Iteration 1**: direct writes + **gasless TODOs** on each orchestrator. **`e`** = Kind **30006** id. On **revert**, **reload** via **`lifecycle.loadPaymentContractDetails`**. **Pending orchestrators:** see **§11 Lifecycle wiring scorecard**. Next large chunks: **Phase D** (remaining writes — follow §11 order) and **Phase E** (dispute projection from 31006 history for proposal actions).
