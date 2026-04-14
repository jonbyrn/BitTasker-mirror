# Contract timeline — NDK + `contractRune` (implementation plan)

This document plans a first-class **`ContractTimelineNDK.svelte`** that reads **`PaymentContractRune`** (and thus **`NDKPaymentContract`** + **`NDKContractStatus[]`**) without the legacy **`EscrowStatus`** bridge in **`ndkContractStatusToTimeline.ts`**. It aligns UI copy with **Tasker / Taskee** terminology and uses **DaisyUI’s vertical timeline** primitives for a cleaner, consistent layout.

Related code today:

- Legacy timeline: **`src/lib/components/contracts/ContractTimeline.svelte`** (filters and labels in **`EscrowStatus`**, role badges use **`dashboard.client` / `dashboard.freelancer`**).
- Bridge: **`src/lib/utils/contract/ndkContractStatusToTimeline.ts`** maps **`NDKContractStatus` → `ContractStatusEvent`** with synthetic **`EscrowStatus`** in **`content.action`** for that component.
- NDK drawer: **`src/lib/components/contracts/ContractDrawerNDK.svelte`** builds **`timelineStatusEvents`** via the bridge and passes many props into **`ContractTimeline`**.
- Rune: **`src/lib/runes/contractRune.svelte.ts`** exposes **`contract`**, **`statusEvents`**, **`taskerPubkey`**, **`isTasker`**, etc.

---

## 1. Goals

| Goal                                  | Notes                                                                                                                                                                                                                                           |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Single prop surface                   | Prefer **`contractRune: PaymentContractRune`** (optional small extras below).                                                                                                                                                                   |
| **ContractStatus** as source of truth | Timeline rows derive from **`NDKContractStatus.status`** (and legacy fallbacks only when needed for old wire data).                                                                                                                             |
| Remove duplication                    | Stop pre-mapping **`NDKContractStatus[]`** to **`ContractStatusEvent[]`** in the drawer for NDK flows.                                                                                                                                          |
| Tasker / Taskee lexicon               | Replace “client / freelancer” in timeline UI and **`getActionDescription` actor roles** with **tasker / taskee** (i18n keys may need new entries or aliases).                                                                                   |
| DaisyUI vertical timeline             | Use **`timeline timeline-vertical`** with **`timeline-start` / `timeline-middle` / `timeline-end`**, **`timeline-box`** where appropriate, and **`hr`** connectors per DaisyUI patterns.                                                        |
| Participant sides                     | **One side per participant**: e.g. Tasker-authored events on **start** (left in LTR), Taskee on **end** (right), or the inverse—pick one rule and document it. Avoid **index % 2** as the primary rule (that alternates by order, not by role). |
| Parity with current behavior          | Preserve initiation row (contract creation + funding tx when present), relative/absolute time formatting, tx link, resolution split lines, and **deduplicated** status rows (see §4.1).                                                         |

Non-goals for this pass:

- Rewriting the legacy **`ContractDrawer.svelte`** (store-based) unless we explicitly migrate it; it can keep **`ContractTimeline`** until a separate migration.
- Deleting **`ndkContractStatusToTimeline.ts`** immediately; deprecate after **`ContractDrawerNDK`** and any other callers switch.

---

## 2. Data the rune already provides

From **`PaymentContractRune`** (see **`contractRune.svelte.ts`**):

- **`contract: NDKPaymentContract`** — Kind 30006 payload; **`taskerPubkey`**, **`taskeePubkey`**, **`created_at`**, **`transactionHash`**, titles, amounts, etc.
- **`statusEvents: NDKContractStatus[]`** — Kind 31006 history (newest-first in raw array; timeline should **sort ascending by time** for display).
- **`statusHistoryReady`** — optional: show skeleton or “loading history” until true, matching drawer UX expectations.
- **`isTasker`** — viewer role (for copy or emphasis; row side should use **event author** vs **tasker/taskee pubkeys**, not only viewer).

From **`NDKContractStatus`** (see **`src/lib/nostr/events/contractStatus.ts`**):

- **`status: ContractStatus`** (normalized from legacy `s` tag / content).
- **`pubkey`**, **`created_at`**, **`transactionHash`**, **`proposedTaskerAmount` / `proposedTaskeeAmount`**, **`completionAttachments`**, **`legacyContent`**, etc.

Timestamp for ordering: prefer **legacy JSON `timestamp` in ms** when present; else **`created_at * 1000`** (same idea as **`statusTimestampMs`** in the bridge).

---

## 3. Proposed API for `ContractTimelineNDK.svelte`

Minimal:

```ts
// Conceptual — final types in the component file
let { contractRune }: { contractRune: PaymentContractRune } = $props();
```

Everything else is **derived inside** the component from **`contractRune.contract`** and **`contractRune.statusEvents`**.

**Header badge count (e.g. drawer “N” next to “Status timeline”):** do **not** use a callback like **`onDisplayCountChange`**. The parent can derive the same number as the timeline—e.g. **`$derived(timelineRowCount)`** where the row builder returns the final displayed list, or **`rows.length`** if the parent imports a shared **`buildContractTimelineRows`**—so one source of truth.

Optional props (only if a real need appears):

- **`compact?: boolean`** — maps to DaisyUI **`timeline-compact`** on small breakpoints (current code uses **`max-md:timeline-compact`**).
- **`showInitiation?: boolean`** — default true; matches current “contract initiated” row.

---

## 4. Building timeline rows (logic)

### 4.1 Unified item model

Define an internal **`TimelineRow`** (pure TS):

- **`kind: 'initiation' | 'status'`**
- **`timestampMs: number`**
- **`authorPubkey: string`**
- **`participant: 'tasker' | 'taskee' | 'unknown'`** — from comparing **`authorPubkey`** to **`contract.taskerPubkey`** / **`contract.taskeePubkey`** (normalize case).
- For **`status`**: **`contractStatus: ContractStatus`**, optional **`ndk: NDKContractStatus`** for extras (tx hash, proposal amounts, attachments).

### 4.2 Why we do not copy legacy `shouldShowInTimeline` (EscrowStatus)

Legacy **`ContractTimeline.svelte`** hid many **pending** **`EscrowStatus`** values so the UI was not noisy. In NDK + v2 parsing, Kind 31006 events already carry **normalized `ContractStatus`** on **`NDKContractStatus.status`**. Legacy wire values are mapped through **`normalizeLegacyEscrowStatusTagToContractStatus`** in **`src/lib/utils/contract/v1/legacyEscrowStatusToContractStatus.ts`** (e.g. pending complete → **`ContractStatus.Completed`**, pending acceptance → **`FundsReleased`**, etc.), so the “pending” and “confirmed” publications from the old app can **both** surface as the **same** **`ContractStatus`** and often the **same** **`transactionHash`** once the tx exists.

So the fix is **not** a large allow/deny enum list in the timeline component—it is **deduplication** of status events after normalization.

### 4.3 Deduplicating status events (first wins)

**Goal:** one visible row per logical transition; collapse duplicate Nostr events that represent the same chain step (previously “pending” vs “confirmed” in v1).

**Algorithm (recommended):**

1. Sort **`NDKContractStatus`** by display time **ascending** (use the same timestamp rule as today: legacy JSON **`timestamp`** ms if present, else **`created_at * 1000`**).
2. Build a **dedupe key** per event from **`ev.status`** (always **`ContractStatus`** after parsing) and **`ev.transactionHash`** (trimmed string, or empty if missing).
3. **Keep the first event** seen for each key; skip later events with the same key.

**Key shape:** `(ContractStatus, transactionHashOrEmpty)`.

- If two events share **same status + same tx hash** (typical pending + confirmation duplicate), only the **first in chronological order** is shown.
- If two events share **same status** but **different** tx hashes, **both** appear (distinct chain steps).
- **Edge case — no tx hash:** two different Kind 31006 rows could share status and empty hash. To avoid incorrectly merging unrelated rows, extend the key with **`ev.id`** (event id) when **`transactionHash`** is absent: e.g. **`(status, txHash || ev.id)`** so only true duplicates (same idempotency) collapse, or document that “empty hash” duplicates still use **first wins per (status, '')** if product accepts that tradeoff.

**Relation to `contractStatus.ts`:** that module defines **`NDKContractStatus`**, tag **`dedupeContractStatusTags`** for wire tags, and getters like **`transactionHash`**. It does **not** today dedupe _multiple events_ in a subscription history; **timeline row dedupe** is a separate pass over **`statusEvents[]`** using the rules above. Implement the dedupe either in **`buildContractTimelineRowsFromRune`** or next to other contract history helpers so **`ContractDrawerNDK`** can reuse the same **`rows.length`** for the badge.

### 4.4 Sorting (final list)

- Merge initiation (if enabled) with **deduplicated** status rows; sort by **`timestampMs` ascending** (initiation row ordered by contract **`created_at`**).

### 4.5 Labels and colors

- Prefer **`contractStatusFormatterV2`**-style helpers that take **`ContractStatus`** (extend or add **`getTimelineLabelKey` / `getTimelineSemanticClass`** if missing).
- Stop routing through **`getActionDescription(EscrowStatus, { actorRole: 'client' | 'freelancer' })`** for NDK; add **tasker / taskee** actor roles or parallel keys under **`dashboard.contracts.timeline.*`** for v2.

### 4.6 Resolution splits

- Display **`proposedTaskerAmount` / `proposedTaskeeAmount`** from **`NDKContractStatus`** (already on the wire). Labels must use **Tasker / Taskee** i18n, not client/freelancer.

---

## 5. UI: DaisyUI timeline layout

Target structure (align with [DaisyUI Timeline](https://daisyui.com/components/timeline/)):

- Root: **`ul.timeline.timeline-vertical`** (and **`timeline-snap-icon`** if we keep icon alignment like today).
- Each **`li`**:
  - Optional **`hr`** between items (**`bg-base-300`** or **`bg-primary`** for emphasis segments—match app theme).
  - **`timeline-middle`**: marker (dot or small icon), optionally **`text-primary`** for milestones.
  - Content: **`timeline-start`** or **`timeline-end`** with **`timeline-box`** + **`card`-like density** consistent with **`ContractCardNDK`** / **`ContractDrawerNDK`** (**`bg-base-100`**, borders via theme).

**Side assignment rule (recommended):**

- **`participant === 'tasker'` → `timeline-start`** (left column in vertical layout).
- **`participant === 'taskee'` → `timeline-end`** (right column).
- **`unknown`** → single side (e.g. always **`timeline-end`**) or center-only compact row; keep rare.

This matches “different sides per participant” better than alternating by index.

**Responsive:** keep **`max-md:timeline-compact`** if full two-column is tight on mobile, or stack with a small **badge** showing Tasker/Taskee at the top of each card.

---

## 6. Internationalization

- Add or reuse keys under **`dashboard.contracts.timeline.*`** for any new strings.
- Replace **`dashboard.client` / `dashboard.freelancer`** in this component with **`dashboard.tasker` / `dashboard.taskee`** (or dedicated **`dashboard.contracts.roles.*`**) for role badges.
- Spanish parity in **`static/locales/es/...`** (same structure as English).

---

## 7. Integration steps

1. **Add** **`src/lib/components/contracts/ContractTimelineNDK.svelte`** implementing the above.
2. **Add** a small pure module if the row-builder grows heavy, e.g. **`src/lib/utils/contract/buildContractTimelineRowsFromRune.ts`** (keeps the Svelte file thin).
3. **Update** **`ContractDrawerNDK.svelte`**: replace **`ContractTimeline`** + **`ndkContractStatusesToContractStatusEvents`** with **`ContractTimelineNDK`** + **`contractRune`** only; replace **`timelineDisplayCount`** + **`onDisplayCountChange`** with a **derived** count from the same row list the timeline uses (or a small exported **`countTimelineRows(contractRune)`** helper).
4. **Search** for other NDK usages of the bridge (**grep** **`ndkContractStatusesToContractStatusEvents`**) and switch them to the new component or leave documented.
5. **Deprecate** **`ndkContractStatusToTimeline.ts`** with a **`@deprecated`** JSDoc pointing to the new pipeline; remove when no imports remain.
6. **Leave** legacy **`ContractTimeline.svelte`** for **`ContractDrawer.svelte`** / **`ContractModal.svelte`** until those flows migrate to **`NDKPaymentContract` + rune**.

---

## 8. Testing and QA

- Manual: open **NDK contract drawer**, verify order, sides (tasker vs taskee), initiation row, tx links, dispute proposal amounts, empty state.
- **`npm run check`** / lint on touched files.
- Optional unit tests for **`buildContractTimelineRowsFromRune`** (dedupe key + sort + participant classification).

---

## 9. Acceptance checklist

- [ ] **`ContractDrawerNDK`** uses **`ContractTimelineNDK`** with **`contractRune` only** (no bridge in the drawer).
- [ ] Timeline rows keyed off **`ContractStatus`**, not **`EscrowStatus`**, for NDK.
- [ ] UI uses DaisyUI **`timeline`** vertical pattern with **`timeline-start` / `timeline-end`** driven by **participant**, not only row index.
- [ ] Copy uses **Tasker / Taskee** consistently in this surface.
- [ ] Drawer timeline **badge count** matches **deduplicated row count** (derived, no callback prop).
- [ ] Bridge file either unused by NDK paths or marked deprecated.

---

## 10. File touch list (expected)

| File                                                                             | Action                                                  |
| -------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `src/lib/components/contracts/ContractTimelineNDK.svelte`                        | **Create**                                              |
| `src/lib/utils/contract/buildContractTimelineRowsFromRune.ts` (optional)         | **Create** if logic is non-trivial                      |
| `src/lib/components/contracts/ContractDrawerNDK.svelte`                          | **Update** imports and props                            |
| `src/lib/utils/contract/ndkContractStatusToTimeline.ts`                          | **Deprecate** or remove after migration                 |
| `src/lib/utils/helpers/contractStatusFormatterV2.ts` or timeline-specific helper | **Extend** as needed for labels/colors                  |
| `static/locales/en/...` and `static/locales/es/...`                              | **Add** keys for tasker/taskee timeline copy if missing |

This plan is intentionally implementation-ready. The only open product choice is **§4.3 edge case** when **`transactionHash`** is missing—whether to include **`event.id`** in the dedupe key to avoid over-collapsing.
