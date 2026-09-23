# NDK Contract Status Adaptation Plan

This document is a **design and migration plan** (not an implementation spec) for introducing an `NDKContractStatus` class—parallel to `NDKBid` and `NDKPaymentContract`—for Kind **31006** contract status events. It builds on [contract-status-nostr-events.md](./contract-status-nostr-events.md), [contract-nostr-events-v1.md](./contract-nostr-events-v1.md), and the patterns in `src/lib/nostr/events/bid.ts` and `src/lib/nostr/events/contract.ts`.

---

## 1. Goals

| Goal                       | Detail                                                                                                                                                                                                                                                                            |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **NDK-first API**          | Subclass `NDKEvent`, `static async from(event)`, decrypt via NDK, ergonomic getters/setters.                                                                                                                                                                                      |
| **Terminology**            | Align with payments v2 naming: **paymentId** (not escrowId in the public API), **tasker** / **taskee** where it matches `NDKPaymentContract`—with an important caveat for **symmetric authorship** (see §5).                                                                      |
| **Single source per fact** | Avoid repeating the same value in tags and JSON (e.g. parent contract id in **`e`** should not be duplicated as `contractEventId` in the body).                                                                                                                                   |
| **Backward compatibility** | Parse **legacy** events: encrypted body = single JSON object (`NostrContractStatus` shape). Parse **new** events: same split as `NDKPaymentContract`—**public index tags on the wire**, **non-index / sensitive fields** in an encrypted JSON **array of tag rows** in `content`. |
| **Publish path**           | In memory, treat everything as **tags**; only in `toNostrEvent()` split **public** vs **encrypted** tag rows and build the wire `content`.                                                                                                                                        |
| **Out of scope (v1)**      | **No** changes to `publishContractStatus` / `nostrContract.ts` escrow pipeline. New consumers use `NDKContractStatus` directly; legacy publish path stays separate.                                                                                                               |

---

## 2. How existing NDK types behave (reference)

### 2.1 `NDKBid` (`src/lib/nostr/events/bid.ts`)

- **Kind:** 30007.
- **`from()`:** Decrypt using **sender** (`bid.decrypt(sender)`); leaves **content as JSON**; consumer uses `bidContent` getter (`JSON.parse`).
- **`toNostrEvent()`:** Encrypt content for the signer’s user (NIP-44).
- **Implication:** Bid remains **document-in-body**; no tag normalization inside the class.

### 2.2 `NDKPaymentContract` (`src/lib/nostr/events/contract.ts`)

- **Kind:** 30006.
- **Wire contract (target shape):**
  - **Public** tags (unencrypted, filterable): `d`, `t`, `p`, `n`, `v`, `s`, `m` (see `PUBLIC_CONTRACT_TAG_NAMES`).
  - **Encrypted `content`:** `JSON.stringify([...])` of **all other** tag rows (named tags like `taskTitle`, `amount`, `transactionHash`, …).
- **`from()`:**
  1. Resolve **counterparty** pubkey (author vs `p` tags vs `ndk.activeUser`).
  2. `decrypt(otherUser)`.
  3. `JSON.parse(content)` → either **legacy** flat `NostrContract`-like object **or** **new** raw `string[][]` tag array.
  4. Legacy path: `legacyContentToAdditionalTags()` merges into `this.tags`; **tags win** over duplicated JSON fields for public keys.
  5. Clear `content` after merge; getters/setters **only** touch `this.tags`.
- **`toNostrEvent()`:** Partition tags → public stay on event, private go into encrypted JSON array; then `encrypt(this.taskee, …)` (contract is **always authored by Tasker**).
- **Naming:** Getters use **paymentId**, **tasker** / **taskee**; legacy `escrowId` is mapped into tags (including encrypted-side `paymentId` where applicable).

This is the **template** for the new contract status type, with adjustments below.

---

## 3. Current contract status on the wire (legacy baseline)

Documented in [contract-status-nostr-events.md](./contract-status-nostr-events.md).

- **Kind:** 31006 (`KINDS.CONTRACT_STATUS`).
- **Typical tags:** `e` (parent contract event id), `r` (escrow / payment id), `p` (recipient), `s` (action as **numeric string**), `v` (flow version, e.g. `v1`), `m` (`contract-status`), plus app `v` from signing.
- **Typical encrypted body:** One JSON object, `NostrContractStatus`: `type`, `contractEventId`, `escrowId`, `action`, `message`, `timestamp`, optional `transactionHash`, dispute amounts, `completionAttachments`.

**Pain points we are fixing:**

1. **Redundancy:** `e` + `contractEventId`, `r` + `escrowId` express the same facts twice.
2. **Mixed model:** Tags are already used for routing, but the “real” payload is a second copy in JSON.
3. **Naming:** `client` / `freelancer` in older types vs **tasker** / **taskee** in NDK payment types.
4. **`timestamp` in JSON:** Largely duplicates `created_at` on the event envelope (optional to drop from encrypted payload for new format when not needed for legacy).

---

## 4. Proposed wire model (new format)

### 4.1 Public tags (plaintext, relay-indexable)

Keep **stable, filter-relevant** fields visible (so existing subscriptions and `queryNostrEvents` follow-ups by `#e` keep working):

| Tag | Role                                       | Notes                                                                                           |
| --- | ------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| `e` | Parent **Kind 30006** event id             | Required for linking to contract; **do not** duplicate in encrypted blob.                       |
| `r` | **Payment id** (today: escrow id on chain) | Same meaning as contract `#d`; **canonical wire key** for “which payment.”                      |
| `p` | Recipient pubkey                           | Counterparty for NIP-44; required for routing.                                                  |
| `s` | `EscrowStatus` as **numeric string**       | Unchanged semantics; see enum in `escrow.enum.ts`.                                              |
| `v` | Flow version (`v1`, `v2`, …)               | Distinguish app flows; separate from optional app build tag.                                    |
| `m` | Message type                               | **`contract-status`** only; format / flow evolution uses tag **`v`**, not different `m` values. |

**Optional later:** `t` (task id) as a public tag if we want task-scoped filters without opening the blob—**not** present on legacy status events; add only if product needs it and we accept a second public field.

### 4.2 Encrypted payload (new format)

Same structural rule as `NDKPaymentContract`:

- `content` (after encryption) decrypts to **`JSON.stringify(NDKTag[])`** where each row is a non-public tag.
- **Exclude** from the encrypted array anything already fully represented by public tags:  
  **no** `contractEventId` if `e` exists; **no** `escrowId` / `paymentId` duplicate if `r` is set (use getters only).

**Likely encrypted-side tags (illustrative):**

| Tag name                | Content                       | Notes                                                                                                                      |
| ----------------------- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `message`               | User-facing status text       | Today often i18n-filled.                                                                                                   |
| `transactionHash`       | RGB tx                        | Needed for recovery / correlation.                                                                                         |
| `proposedTaskerAmount`  | string                        | Dispute flow (NDK naming; legacy JSON used `proposedClientAmount`).                                                        |
| `proposedTaskeeAmount`  | string                        | Dispute flow (NDK naming; legacy JSON used `proposedFreelancerAmount`).                                                    |
| `completionAttachments` | JSON string of `Attachment[]` | Large; single tag value is simplest.                                                                                       |
| `action`                | number or string              | **Only if** we ever stop putting action in public `s`; prefer **keep `s` public** so relays can filter without decrypting. |

**Recommendation:** Keep **`action` only in tag `s`** for new events so behavior matches legacy indexing and `handleStatusEvent` logic. Do not also store `action` inside the encrypted blob.

---

## 5. Tasker / taskee vs author / recipient

**Difference from `NDKPaymentContract`:** Kind 30006 is **always** published by the Tasker. Kind 31006 can be published by **either** party (`pubkey` = sender, `p` = recipient).

Therefore:

- **Do not** assume `author === tasker` on status events.
- **Recommended API surface:**
  - **`recipientPubkey`:** from tag `p` (and setter maintains `p`).
  - **`sender` / `author`:** inherited `NDKEvent` author.
  - **`taskerPubkey` / `taskeePubkey`:** resolve **only when** the parent `NDKPaymentContract` (or equivalent) is available—compare author and recipient to contract’s tasker/taskee pubkeys.
  - Alternatively, expose **`isOutgoingFor(activeUser)`** helpers using `ndk.activeUser` and `p` / `pubkey`.

This avoids incorrect symmetry with `NDKPaymentContract` while still using **paymentId** and shared vocabulary everywhere else.

---

## 6. Normalized getters/setters (conceptual)

All **in-memory state** is tag-backed after `from()` (like `NDKPaymentContract`).

| Concept                             | Wire / storage          | Getter behavior                                                                                                                                                                                                                                                      |
| ----------------------------------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Payment id                          | **`r`** (canonical)     | `paymentId`: `tagValue('paymentId') ?? tagValue('r') ?? ''` when reading legacy imports that only had JSON `escrowId`; **publish** should prefer **only `r`** on the wire to avoid duplication (encrypted `paymentId` optional **only** during migration if needed). |
| Parent contract event id            | **`e`**                 | `paymentContractEventId` or `parentContractEventId`: read **`e` only**; never require duplicate in body.                                                                                                                                                             |
| Action                              | **`s`**                 | `action` as number: `parseInt(tagValue('s') ?? '', 10)` with validation against `EscrowStatus`.                                                                                                                                                                      |
| Flow version                        | **`v`** (contract flow) | `flowVersion` or reuse `version` naming consistent with contract class.                                                                                                                                                                                              |
| Message, tx, proposals, attachments | Encrypted tags only     | Same names as today’s JSON fields for minimal migration of app code.                                                                                                                                                                                                 |

**Legacy JSON field mapping → tags after decrypt (read path):**

- `escrowId` → ensure `r` (if missing) for store routing compatibility with `handleStatusEvent`.
- `contractEventId` → ensure `e` (if missing).
- `action` → ensure `s` if missing (stringify enum).
- Remaining fields → encrypted-side named tags.

Tags **already on the wire** before decrypt should **win** over JSON duplicates (same rule as `legacyContentToAdditionalTags` for contracts).

---

## 7. `NDKContractStatus.from()` (planned flow)

1. **Guard:** `kind === 31006`; `m` absent or `contract-status`.
2. **Counterparty:** Same pattern as contract status today: if `ndk.activeUser.pubkey === author.pubkey`, other party is in `p`; else other party is `author`.
3. **Decrypt** with NDK NIP-44 to counterpart (align with `decryptStatusEvent` semantics in `nostrContract.ts`).
4. **Parse `content`:**
   - If **`string[][]`** (array of string tags) → append to tag list (new format).
   - Else if **object** with `type === 'contract-status'` or recognizable legacy shape (`escrowId` + `action`) → **legacy merge** into tags (§6).
   - Else → return `undefined` (unrecognized).
5. **Deduplicate:** Drop encrypted-side tags whose values duplicate public `e` / `r` / `s` after merge.
6. **Clear `content`** to `''` so the rest of the app only mutates tags.
7. Return the instance.

---

## 8. `toNostrEvent()` (planned flow)

1. **Partition** `this.tags`:
   - **Public:** `e`, `r`, `p`, `s`, `v`, `m` (exact set to be frozen in code as `PUBLIC_STATUS_TAG_NAMES`, mirroring contract).
   - **Private:** everything else (message, transactionHash, attachments, …).
2. Set **`content = JSON.stringify(privateTags)`** (no wrapper object—**array only**, matching `NDKPaymentContract`).
3. **Encrypt** to **recipient** (`NDKUser` from `p`), not “taskee” blindly—sender may be taskee.
4. **Assign** `this.tags = publicTags` only for the serialized event (same pattern as contract’s `toNostrEvent`).
5. Preserve any **additional** relay-visible tags we still require (e.g. app version `v` duplicate) per existing `getSignedEvent` behavior when signing through the non-NDK path; NDK path should document whether `__APP_VERSION__` is added by the signer wrapper.

---

## 9. Migration and coexistence

| Phase | Read                                                                  | Write                                                                                                |
| ----- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| **1** | `from()` accepts **legacy JSON** and **new tag-array** payloads.      | Optionally still publish **legacy** JSON until all consumers updated.                                |
| **2** | Same.                                                                 | Publish **new** format only; public tags unchanged so old **subscribers** still see `e`/`r`/`p`/`s`. |
| **3** | Drop legacy JSON parsing only when analytics show no relevant events. | —                                                                                                    |

**Compatibility notes:**

- `handleStatusEvent` today keys off tag **`r`** for `escrowId`. Keeping **`r`** as the canonical payment id on the wire avoids breaking the contract store without changes—or the store can later use `paymentId` internally while still reading `r`.
- Follow-up queries use **`#e`**; keeping parent id on **`e`** only is enough.

---

## 10. Differences from `NDKPaymentContract` (checklist)

| Topic                            | Contract (30006)                     | Status (31006)                   |
| -------------------------------- | ------------------------------------ | -------------------------------- |
| Author                           | Always Tasker                        | Tasker **or** Taskee             |
| Encrypt target in `toNostrEvent` | `this.taskee`                        | **Recipient** from `p` (dynamic) |
| Public id tag                    | `d` (and `paymentId` in merged tags) | **`r`** (payment id); no `d`     |
| Parent link                      | N/A                                  | **`e`** required                 |
| `NDKBid`-style body              | No                                   | Legacy path only                 |

---

## 11. Resolved decisions (implementation guidance)

| Topic                           | Decision                                                                                                                                                                                                                                    |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Public tags**                 | Freeze exactly **`{ e, r, p, s, v, m }`** on the wire (no extra `t` for v1).                                                                                                                                                                |
| **`m` tag**                     | Keep **`contract-status`**. Do **not** introduce a separate `m` value for format variants; use the **`v`** tag for flow / format versioning (same idea as the payment contract).                                                            |
| **`completionAttachments`**     | Same handling as today: **`Attachment[]`** serialized into the encrypted payload the way the current implementation already does (e.g. JSON string in a named tag or equivalent—no new attachment protocol, no NIP-94 change in this work). |
| **NDK registration**            | Register **`NDKContractStatus`** in **`src/lib/nostr/ndk.ts`** via `registerEventClass` alongside `NDKBid` and `NDKPaymentContract`.                                                                                                        |
| **Escrow / `nostrContract.ts`** | **Do not** refactor or adapt **`publishContractStatus`** (or other v1 escrow publish paths) to use `NDKContractStatus`. The new class is for **NDK-first code paths only**; the legacy pipeline stays as-is until separately replaced.      |

### What “type exports” referred to (clarification)

That bullet was asking whether, **besides** the `NDKContractStatus` class, we should also add a **separate exported TypeScript interface**—for example a plain object type like `{ paymentId: string; parentContractEventId: string; action: EscrowStatus; … }`—for APIs that do not want to depend on `NDKEvent`.

**Conclusion:** Not an open product decision. The class’s **getters** (and optional `toJSON` / helpers later if needed) are enough for v1. Add a shared interface **only** if some other module needs a stable non-NDK shape; that can be decided when that module appears.

---

## 12. Related files (current)

| Area                                  | Path                                                                                                         |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| NDK bid                               | `src/lib/nostr/events/bid.ts`                                                                                |
| NDK payment contract                  | `src/lib/nostr/events/contract.ts`                                                                           |
| NDK registry                          | `src/lib/nostr/ndk.ts`                                                                                       |
| **NDK contract status (implemented)** | `src/lib/nostr/events/contractStatus.ts` (`NDKContractStatus`)                                               |
| Status wire + legacy types            | `src/lib/utils/constants/tags.ts`, `src/lib/types/contract.d.ts`, `src/lib/utils/escrow/v1/nostrContract.ts` |
| Contract status doc                   | [contract-status-nostr-events.md](./contract-status-nostr-events.md)                                         |

---

## 13. Summary

Introduce **`NDKContractStatus`** mirroring **`NDKPaymentContract`’s** internal model (tags everywhere, encrypted **tag array** in `content` on publish) while **preserving legacy JSON-body parsing** in `from()` for events already on relays. Use **`r`** + **`e`** + **`s`** as the non-duplicated sources of truth for payment id, parent contract event id, and action; move message, transaction hash, dispute fields, and attachments into **encrypted named tags** (attachments unchanged from current behavior). Treat **tasker/taskee** as contextual (parent contract + active user), not as fixed author roles on the status event itself. Register the class in **`ndk.ts`**; **do not** wire it into **`nostrContract.ts`**. See **§11** for locked decisions.
