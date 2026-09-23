# V2 NDK contract drawer — `ContractDrawerNDK`

This document plans replacing the legacy **`ContractDrawer.svelte`** integration with an **NDK + `PaymentContractRune`**-aware drawer that works with **`DashboardContractsPanelNDK.svelte`** and **`ContractCardNDK.svelte`**. It follows the same doc style as:

- **[v2-contract-modals-plan.md](./v2-contract-modals-plan.md)** — NDK modals and confirm flows.

**Status:** planning only — implementation can proceed in phases below once agreed.

---

## 1. Goals

1. **Stop using `contractStore` for drawer open/close and selected contract** — UI state belongs in the dashboard panel (or a tiny dedicated module), not a global contract store.
2. **Reuse the existing drawer layout and copy** — same **`Drawer`**, sections, **`UsdSatsDisplay`**, accordions, **`Gallery`**, and **the same `dashboard.contracts.*` / `dashboard.task_details_by_task.*` / `bids.sats`** i18n keys as **`ContractDrawer.svelte`** unless a key is truly obsolete.
3. **Bind data from `NDKPaymentContract` + `PaymentContractRune`** (`src/lib/nostr/events/contract.ts`, `src/lib/runes/contractRune.svelte.ts`) instead of **`ContractWithEvents`** and **`contractStore.getContractKey`**.
4. **Integrate NDK actions in the drawer** — use **`ContractActionsNDK.svelte`** with the same **`contractRune`** instance the card uses for lifecycle actions (parity with card; confirm/completion modal work from **v2-contract-modals-plan** applies here too).
5. **Keep status UX aligned with the NDK card** — use **`contractStatusFormatterV2`** helpers (as on **`ContractCardNDK.svelte`**), not the legacy **`contractStatusFormatter`** cancellation variant, unless we explicitly add a V2 cancellation helper later.

---

## 2. Current state (problems)

### 2.1 Legacy drawer (`ContractDrawer.svelte`)

| Aspect            | Behavior                                                                        |
| ----------------- | ------------------------------------------------------------------------------- |
| Open state        | `isOpen={$contractStore.isDrawerOpen}`                                          |
| Selected contract | `$contractStore.contract` (`ContractWithEvents \| null`)                        |
| Close             | Clears `contract` and sets `isDrawerOpen = false`                               |
| Actions           | **`ContractActions.svelte`** (legacy permissions / modals)                      |
| Timeline          | **`ContractTimeline.svelte`** with `statusEvents` from **`ContractWithEvents`** |
| Status badge      | **`getCancellationStatusVariant`** + legacy **`getStatusTranslationKey`**       |

Coupling UI visibility to a global store makes testing and NDK migration harder and mixes “selected for drawer” with unrelated store responsibilities.

### 2.2 Legacy card (`ContractCard.svelte`)

`openDrawer` sets `$contractStore.contract` and `$contractStore.isDrawerOpen = true` — correct for the old pipeline.

### 2.3 NDK panel + card (today)

| Location                                | Issue                                                                                                                     |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| **`DashboardContractsPanelNDK.svelte`** | Still renders legacy **`ContractDrawer`** and passes **`btcPrice`** only. No code sets **`contractStore`** for NDK cards. |
| **`ContractCardNDK.svelte`**            | Title button has **no `onclick`**; “View details” button has **no handler**. Drawer cannot open from NDK UI.              |

So the NDK dashboard shows a drawer that never receives a contract from the new cards.

---

## 3. Proposed architecture

### 3.1 Where state lives

**Recommendation:** **Local state on `DashboardContractsPanelNDK.svelte`** (Svelte 5 `$state`):

- `contractDrawerOpen = $state(false)`
- `contractDrawerRune = $state<PaymentContractRune | null>(null)`

**Open:** `function openContractDrawer(rune: PaymentContractRune): void` — set both; assign **`contractDrawerRune = rune`**.

**Close:** `function closeContractDrawer(): void` — set **`contractDrawerOpen = false`**, then **`contractDrawerRune = null`** (after animation if needed; same pattern as legacy “do not unmount drawer for animation” comment).

**Why pass `PaymentContractRune` instead of only `NDKPaymentContract`?**

- The card **already** constructs a rune and runs **`start()`** / subscriptions for actions. Reusing that **same instance** for the drawer avoids a second **`PaymentContractRune`** + duplicate Nostr/chain subscriptions for the same contract while the card is mounted.
- If the product later needs “open details from a route/deep link with only event id”, a fallback path can construct a rune **inside** the drawer — not required for the first iteration.

### 3.2 New component: `ContractDrawerNDK.svelte`

**Role:** Drop-in replacement for **`ContractDrawer.svelte`** in the NDK panel: same **visual structure** and **i18n**, different inputs.

**Suggested props**

```text
isOpen: boolean
onClose: () => void
contractRune: PaymentContractRune | null
btcPrice: number
```

**Rendering rules**

- When **`!contractRune`**: optional loading/empty (reuse **`dashboard.contracts.loading`** only if we ever open the drawer before a rune is set; ideally the panel only opens when a rune exists).
- **Title** (drawer header): `contractRune.contract.taskTitle` (same as card).
- **Role badge:** align with **`ContractCardNDK`**: **`contractRune.isTasker`** → Tasker uses **`dashboard.client`**, Taskee uses **`dashboard.freelancer`** (same mapping as the card today).
- **Status badge:** **`contractRune.displayStatus`** (and pending spinner) + **`getStatusColorClass` / `getStatusTranslationKey`** from **`contractStatusFormatterV2`**.
- **Amount:** **`UsdSatsDisplay`** with **`contract.amount`**, **`contract.currency`**, **`btcPrice`** — mirror **`ContractCardNDK`** / legacy BTC fallback when **`btcPrice <= 0`** using the same formatting approach as the legacy drawer ( **`formatBTC`** on string amount if needed).
- **Deadlines:** **`TaskDeadlineDisplay`** — NDK contract exposes **`estimatedStartTime`** / **`estimatedCompletionTime`**; use the same “both present” guard as legacy when wiring date range props.
- **Counterparty:** **`UserInfoDisplay`** (legacy drawer) with **`npub` / `profileLink`** from **`contract.otherPartyNpub`** (or **`UserNostrBadge`** if we ever want full parity with the card — product can choose; **layout** should stay as legacy drawer).
- **Actions:** **`ContractActionsNDK`** with **`contractRune`**, **`btcPrice`**, same container classes as legacy **`ContractActions`** block.
- **Completion evidence:** **`contractRune.completionAttachments`** (already populated by the rune from status events) instead of **`contract.completionAttachments`** on **`ContractWithEvents`**.
- **Timeline:** **`ContractTimeline`** expects **`ContractStatusEvent[]`** (`content: NostrContractStatus`). **`contractRune.statusEvents`** is **`NDKContractStatus[]`**. **Implementation choice (pick one when coding):**

  - **A.** Add a small mapper **`ndkContractStatusesToTimelineEvents(statuses: NDKContractStatus[]): ContractStatusEvent[]`** that preserves **`content.action`**, **`content.timestamp`**, and fields **`ContractTimeline`** reads; or
  - **B.** Generalize **`ContractTimeline.svelte`** to accept a minimal unified type / both shapes.

  Contract creation row: use **`contractRune.contract.created_at`**, **`contractRune.contract.pubkey`**, and transaction hash from **`contractRune.contract`** (tag/content fields consistent with **`NDKPaymentContract`** — verify **`transactionHash`** accessor on the class).

- **Technical details:** **`taskId`**, **`taskerPubkey` / `taskeePubkey`** (or legacy-named labels: map “client” = tasker / “freelancer” = taskee per product terminology — **same keys** **`dashboard.contracts.client_pubkey`** / **`freelancer_pubkey`** as legacy drawer, with values from NDK getters), **`contract.id`**, **`currency`**.

- **Original bid accordion:** Legacy shows placeholder **`dashboard.contracts.bid_info_not_available`**. Keep the **same** until bid data exists on **`PaymentContractRune`** or NDK events.

### 3.3 Wiring `ContractCardNDK`

Add a callback prop, for example:

```text
onOpenContractDrawer: (rune: PaymentContractRune) => void
```

Wire:

- Title **`button`** → **`onclick`** → if **`contractRune`** → **`onOpenContractDrawer(contractRune)`**
- **View details** → same

Guard: do not call until **`contractRune`** is non-null (after **`start()`** the rune exists; optional disable while null).

### 3.4 Wiring `DashboardContractsPanelNDK`

1. Replace **`ContractDrawer`** with **`ContractDrawerNDK`**.
2. Declare **`openContractDrawer` / `closeContractDrawer`** and pass **`openContractDrawer`** into each **`ContractCardNDK`**.
3. Render **`ContractDrawerNDK`** with **`isOpen={contractDrawerOpen}`**, **`onClose={closeContractDrawer}`**, **`contractRune={contractDrawerRune}`**, **`btcPrice={btcPrice.price}`** (or existing **`btcPrice`** rune).
4. Keep the **portal for modals** (and any **`ContractActionsNDK`** confirm modals) **outside** the drawer context — same as today’s comment on the legacy panel.

### 3.5 Optional: shared “drawer context”

If multiple parents need the same behavior later, a **`setContext`** / **`getContext`** pair for **`openContractDrawer`** is possible; **not required** for the first version — **explicit props** keep data flow clear.

---

## 4. Relationship to other v2 docs

| Doc                                                            | Relationship                                                                                                                                       |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| **[v2-contract-modals-plan.md](./v2-contract-modals-plan.md)** | **`ContractActionsNDK`** inside the drawer benefits from the same **`ConfirmModal`** / completion modal work; no change to drawer state ownership. |
| **Lifecycle / UI lifecycle plan**                              | Drawer is **read-heavy** + **action relay**; permissions remain on **`PaymentContractRune`**.                                                      |

---

## 5. Phases

### Phase A — Drawer + panel + card wiring

1. Add **`ContractDrawerNDK.svelte`** (layout parity + i18n parity + **`ContractActionsNDK`** + timeline mapping).
2. Update **`DashboardContractsPanelNDK.svelte`** — local drawer state; swap drawer component; pass **`onOpenContractDrawer`**.
3. Update **`ContractCardNDK.svelte`** — implement **`onOpenContractDrawer`** on title + view details.

### Phase B — Polish & edge cases

1. **Unmounting card while drawer open:** If the list re-filters and the card unmounts, the **rune may be destroyed** (card’s **`$effect`** cleanup). Mitigations: **(i)** close drawer on list contract id removal, **(ii)** or switch drawer to hold **`NDKPaymentContract`** and own a rune (heavier). Document chosen behavior.
2. **Accessibility:** Ensure drawer close and focus behavior matches **`Drawer.svelte`** expectations.
3. **Remove `contractStore` usage** from any NDK-only path once legacy dashboard no longer needs the old drawer coupling.

---

## 6. Testing & QA

- Open drawer from **title** and from **View details**; close via backdrop / close control; **`contractDrawerRune`** cleared.
- With **`btcPrice > 0`** and **`=== 0`**, verify amount blocks match expectations.
- Timeline shows expected entries for a funded + status history contract (after mapper or timeline update).
- Actions in drawer match card (same rune instance — completing a task from drawer should update card state and vice versa).
- **en / es:** no new keys if all strings reuse existing **`dashboard.contracts.*`** paths.

---

## 7. Implementation checklist

- [ ] **`ContractDrawerNDK.svelte`** — props **`isOpen`**, **`onClose`**, **`contractRune`**, **`btcPrice`**; layout + i18n parity with **`ContractDrawer.svelte`**.
- [ ] **Timeline adapter** or **`ContractTimeline`** generalization for **`NDKContractStatus[]`**.
- [ ] **`DashboardContractsPanelNDK.svelte`** — local state; **`ContractDrawerNDK`**; **`onOpenContractDrawer`**.
- [ ] **`ContractCardNDK.svelte`** — **`onOpenContractDrawer`** on title + view details.
- [ ] Edge case: card unmount vs open drawer (Phase B).
- [ ] Remove or avoid **`contractStore`** for NDK dashboard drawer path.

---

## 8. Related files

| File                                                             | Role                                           |
| ---------------------------------------------------------------- | ---------------------------------------------- |
| `src/lib/components/contracts/ContractDrawer.svelte`             | Legacy reference for layout and i18n keys      |
| `src/lib/components/contracts/ContractDrawerNDK.svelte`          | **New** NDK drawer (to be added)               |
| `src/lib/components/contracts/DashboardContractsPanelNDK.svelte` | Owns drawer open state + passes callback       |
| `src/lib/components/contracts/ContractCardNDK.svelte`            | Calls **`onOpenContractDrawer(contractRune)`** |
| `src/lib/components/contracts/ContractActionsNDK.svelte`         | Actions inside drawer                          |
| `src/lib/components/contracts/ContractTimeline.svelte`           | Timeline (may need adapter or prop widening)   |
| `src/lib/runes/contractRune.svelte.ts`                           | **`PaymentContractRune`**                      |
| `src/lib/nostr/events/contract.ts`                               | **`NDKPaymentContract`**                       |
| `src/lib/stores/contract.store.ts`                               | Legacy store — **not** for NDK drawer state    |

---

## 9. Summary

The legacy drawer tied **visibility and selection** to **`contractStore`**, while **`ContractCardNDK`** never set that store, so the NDK dashboard cannot open the drawer. Move **open/close + selected rune** to **`DashboardContractsPanelNDK`**, add **`ContractDrawerNDK`** fed by **`PaymentContractRune`** (reusing the card’s rune to avoid duplicate subscriptions), swap in **`ContractActionsNDK`** and **V2** status helpers, and adapt **`ContractTimeline`** inputs from **`NDKContractStatus`**. Preserve **layout and i18n** from **`ContractDrawer.svelte`** for a consistent user experience.
