# V2 NDK contract UI — confirmation & completion modals

This document plans **user confirmation** and **task-completion evidence** for the **NDK + `PaymentContractRune`** contract card flow (`ContractCardNDK.svelte` / `ContractActionsNDK.svelte`). It complements the main lifecycle doc:

- **[v2-contract-ui-lifecycle-plan.md](./v2-contract-ui-lifecycle-plan.md)** — orchestrators, rune, permissions, scorecard.

**Status:** planning only — no implementation requirements in this file until the team picks phases below.

---

## 1. Goals

1. **No immediate destructive or irreversible actions** from a single tap; users confirm intent first (aligned with legacy UX).
2. **Reuse** existing **`ConfirmModal.svelte`** for generic confirm/cancel flows — avoid parallel “NDK-only” confirm primitives unless we hit a hard limitation.
3. **Specialized completion flow** — task marked complete may include **media evidence** (upload, preview, submit). Legacy **`TaskCompletionModal.svelte`** already does this but is tied to **`ContractWithEvents`** and **`contractStore.getContractKey`**. We need an **NDK-native** equivalent (name TBD, e.g. **`TaskCompletionModalNDK.svelte`**).
4. Keep **i18n** consistent (`dashboard.contracts.actions.*`, `dashboard.contracts.timeline.completion.*` where reused).

---

## 2. Current state (NDK)

| Location                                 | Behavior                                                                                                                                                                                                                                                      |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ContractActionsNDK.svelte`              | Buttons call `contractRune.markTaskComplete()`, `acceptTask()`, `refundTasker()`, `cancelPaymentContract()` **immediately** (plus loading + generic error toast).                                                                                             |
| `lifecycle/v2.ts` — `markTaskCompleteV2` | Publishes Kind **31006** without **`completionAttachments`**; no file upload path today.                                                                                                                                                                      |
| Legacy `ContractActions.svelte`          | Uses **`ContractModalAction`** + **`CONTRACT_MODAL_CONFIGS`** (`src/lib/utils/constants/contract-modals.ts`) for **Accept / Dispute / Cancel / Refund / Delete**; **`TaskCompletionModal`** for **Complete** with attachments → legacy escrow/store pipeline. |

---

## 3. Reference: legacy patterns (keep in mind, do not copy blindly)

### 3.1 Generic confirm

- **`ConfirmModal.svelte`** — props: `isOpen`, `title`, `message`, `confirmText`, `cancelText`, `confirmButtonClass`, `onConfirm`, `onCancel`.
- **`CONTRACT_MODAL_CONFIGS`** maps an action enum to **translation keys** and **button class** (e.g. `btn-success` for accept, `btn-error` for cancel/refund).
- **`ContractActions.svelte`** (excerpt pattern): `activeModal` state → `openModal(action)` → render `ConfirmModal` with `config` from map → `onConfirm` dispatches to the real handler (`acceptTask`, `cancelEscrow`, …).
- Cancel flow also runs **time checks** before opening the modal (`canCancelBasedOnTime()`); v2 **`canCancelPaymentContract`** already encodes eligibility — product may still want **extra UX copy** in the modal only.

### 3.2 Task completion (attachments)

- **`TaskCompletionModal.svelte`** — `contract: ContractWithEvents`, `onComplete(attachments: Attachment[])`, **`MediaUploader`**, BTC price for display, **`contractStore.getContractKey`** for title/amount strings.
- Submit button disabled until **`completionAttachments.length > 0`** (legacy product rule — confirm whether v2 should **require** at least one file or allow optional evidence).

---

## 4. Proposed architecture

### 4.1 Where modal state lives

**Recommendation:** keep modal state in **`ContractActionsNDK.svelte`** (or a thin wrapper component used only by the NDK card), not inside **`PaymentContractRune`**. The rune stays focused on chain/Nostr/sync; UI owns “which dialog is open”.

### 4.2 Action → modal type

| User action (v2 today) | Modal                                                                                               |
| ---------------------- | --------------------------------------------------------------------------------------------------- |
| Complete task          | **Specialized** — new `TaskCompletionModalNDK` (or equivalent)                                      |
| Accept work            | **ConfirmModal** — reuse keys like `accept_work_confirm_*`                                          |
| Refund tasker          | **ConfirmModal** — reuse `refund_tasker_confirm_*` (already in `CONTRACT_MODAL_CONFIGS` for legacy) |
| Cancel contract        | **ConfirmModal** — reuse `cancel_contract_confirm_*`                                                |

Future actions (dispute, timelock, …) extend the same table.

### 4.3 Config map for NDK

**Option A (preferred for speed):** Reuse **`ContractModalAction`** + **`CONTRACT_MODAL_CONFIGS`** for the subset **Accept / Cancel / Refund** only (same i18n keys as legacy).

**Option B:** Introduce **`ndkContractModalConfigs.ts`** with a smaller enum (`NdkConfirmAction`) to avoid importing legacy **`ContractModalAction.Complete`** / **Delete** into NDK code paths.

Document the choice when implementing; either is fine if imports stay clear.

### 4.4 Portal / stacking

Legacy wraps **`ConfirmModal`** in **`use:portal={'modals'}`** for z-index. NDK stack should do the **same** if the card sits inside scroll/layout that clips `modal-open`.

---

## 5. Phase A — Wire `ConfirmModal` into `ContractActionsNDK`

**Deliverables**

1. Replace direct handler calls with **`openConfirm(NdkConfirmAction)`** (or `ContractModalAction` subset).
2. Render **`ConfirmModal`** when a confirm action is active; **`onConfirm`** calls the existing rune method, then closes modal; **`onCancel`** closes only.
3. Preserve **`busy`** / **`isPending`** so double-submit and background pending state still disable buttons.
4. Optional: **`onConfirm`** async — show spinner on confirm button or keep global `busy` (match legacy feel).

**i18n:** Prefer existing **`dashboard.contracts.actions.*_confirm_*`** keys; add only if a string is truly NDK-specific.

**Out of scope for Phase A:** Changing lifecycle return types or attachment support.

---

## 6. Phase B — `TaskCompletionModalNDK` (specialized)

**Purpose:** Same UX as **`TaskCompletionModal`** (instructions, **MediaUploader**, attachment list, submit) but **data from NDK + rune**, not **`ContractWithEvents`** / **`contractStore`**.

**Recommended props (sketch)**

```text
contractRune: PaymentContractRune   // preferred single input
isOpen: boolean
onClose: () => void
onComplete: (attachments: Attachment[]) => Promise<void>   // caller runs markTaskComplete + future Nostr enrichment
btcPrice?: number   // or read from existing btcPrice rune in parent
```

**Display mapping (replace `contractStore.getContractKey`)**

| Legacy source     | NDK source                                                                                   |
| ----------------- | -------------------------------------------------------------------------------------------- |
| Task title        | `contractRune.taskTitle` or `contractRune.contract.taskTitle`                                |
| Amount / currency | `contractRune.contract.amount`, `currency`, etc. (verify fields on **`NDKPaymentContract`**) |

**Behavior**

- Reuse **`MediaUploader`**, upload service, attachment state, and **DaisyUI** patterns from **`TaskCompletionModal.svelte`**.
- **`onComplete`** is invoked with attachments; **parent** calls **`contractRune.markTaskComplete()`** after uploads succeed (or passes attachments into an extended lifecycle API — see §7).

**Open product question**

- Keep **“at least one attachment required”** or allow **zero attachments** for v2? Decision affects primary button `disabled` logic and copy.

---

## 7. Phase C — Attachments on the v2 lifecycle (if product requires parity)

Legacy likely attaches evidence to **Nostr** and/or internal state. Today **`markTaskCompleteV2`** does **not** set **`completionAttachments`** on **`NDKContractStatus`** (the class supports **`completionAttachments`** tags).

**If** evidence must appear on **31006**:

1. Extend **`publishV2ContractStatus`** (or a dedicated helper) to accept optional **`Attachment[]`** and serialize to the existing tag format.
2. Extend **`markTaskCompleteV2`** signature or add **`markTaskCompleteWithAttachmentsV2(rune, attachments)`** to avoid breaking call sites.
3. Ensure encrypted tag size / relay limits are acceptable for JSON attachment metadata.

**If** evidence is **off-chain only** for v1 of NDK UI:

- Document “attachments stored/displayed elsewhere” or skip Phase C until product defines storage.

This plan treats Phase C as **conditional** on product requirements.

---

## 8. Testing & QA

- Manual: each action opens the correct modal; cancel closes without side effects; confirm runs exactly one lifecycle call.
- Complete path: upload → remove file → submit; verify error toast + debug logs on failure.
- Mobile: modal scroll, backdrop tap, keyboard focus (basic a11y parity with **`ConfirmModal`**).

---

## 9. Implementation checklist (for when work starts)

- [ ] Phase A: `ConfirmModal` + action state in `ContractActionsNDK.svelte` (+ portal if needed).
- [ ] Phase B: new `TaskCompletionModalNDK.svelte` (or chosen name) + wire “Complete task” button to open it.
- [ ] Phase B: parent passes `onComplete` that triggers `markTaskComplete` (and optional attachment handoff).
- [ ] Phase C (if needed): lifecycle + `NDKContractStatus` support for `completionAttachments`.
- [ ] i18n: any new keys; **en** + **es**.
- [ ] Update **[v2-contract-ui-lifecycle-plan.md](./v2-contract-ui-lifecycle-plan.md)** §8 (UI component section) to mention confirm + completion modals once shipped.

---

## 10. Related files

| File                                                      | Role                                    |
| --------------------------------------------------------- | --------------------------------------- |
| `src/lib/components/contracts/ContractActionsNDK.svelte`  | Primary integration point               |
| `src/lib/components/ConfirmModal.svelte`                  | Generic confirm                         |
| `src/lib/components/contracts/TaskCompletionModal.svelte` | Legacy reference for completion UX      |
| `src/lib/utils/constants/contract-modals.ts`              | Modal config / i18n keys map            |
| `src/lib/components/contracts/ContractActions.svelte`     | Legacy orchestration reference          |
| `src/lib/runes/contractRune.svelte.ts`                    | Rune passed into specialized modal      |
| `src/lib/nostr/events/contract.ts`                        | `NDKPaymentContract` fields for display |

---

## 11. Summary

Reuse **`ConfirmModal`** and existing confirm **i18n** for **accept / refund / cancel** on the NDK card. Add **`TaskCompletionModalNDK`** (or equivalent) fed by **`PaymentContractRune`** / **`NDKPaymentContract`** instead of **`ContractWithEvents`**, reusing upload UX from **`TaskCompletionModal`**. Decide whether **31006** must carry **completion attachments**; if yes, extend **v2 lifecycle** publishing in a follow-up phase.
