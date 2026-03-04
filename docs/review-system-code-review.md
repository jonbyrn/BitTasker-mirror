# Review system – file-by-file code review

Focus: **review-helpers.ts**, **nostr-review.ts**, **nostr.ts**, and related usage across the project. Goals: optimal, non-duplicated, centralized, non-redundant logic.

---

## 1. `src/lib/utils/review-helpers.ts`

| Item | Status | Notes |
|------|--------|--------|
| **npubToHex** | Duplicated | Sync npub→hex. Same logic exists in ContractCard, nostr-review (async pubkeyToHex), nostrContract, contract.store, nostr-message, bid.store, tasks/[taskId], findMyTasks. Should use a **single shared** helper. |
| **toNpub** | Duplicated | Sync hex→npub. Same as “hexToNpub” in ContractCard, “hexToNpub” in ReviewPromptModal, inline in UserRatingDisplay, UserInfoDisplay, deviceIdentity, etc. Should use a **single shared** helper. |
| **getRevieweeRole** | Redundant logic | Defines its own async `normalizePubkey` (npub→hex) instead of reusing npubToHex. Should call the shared npub→hex helper. |
| **formatCompletedAt** | OK | Only here; uses `formatStandardDateTimeShort` from dateFormatter. Centralized. |
| **findPendingReviews** | OK | Single place for “pending reviews” logic. Uses escrow + review-source (nostr-review). |
| **completedStatuses array** | Duplicated constant | `[Completed, FundsReleased, DisputeResolved]` appears in review-helpers, nostr-review, and conceptually in task-status-reconciliation. Should be **one constant** (e.g. in escrow or escrow.enum) and reused. |
| **getOtherPartyPubkey** | OK | Only defined here; used by ContractCard. Not duplicated. |
| **hasUserReviewedContract** | OK | Thin wrapper over hasUserReviewedEscrow (review-source → nostr-review). review-source is a thin facade; could inline or keep. |
| **getPendingReviewsCount** | OK | Calls findPendingReviews(). No duplication. |

---

## 2. `src/lib/utils/nostr-review.ts`

| Item | Status | Notes |
|------|--------|--------|
| **pubkeyToHex** | Duplicated | Async (dynamic import of nip19). Same responsibility as npubToHex in review-helpers and elsewhere. Prefer a **single sync** helper from a shared module (nip19 is already a dependency in most call sites). |
| **DEFAULT_RELAYS** | Duplicated | Same pattern in nostr.ts, nostr-message.ts, nostr-profile.ts, swapAdapter.ts. Should be **one constant** (e.g. in nostr.ts or constants) and imported. |
| **subscribeReviews** | OK | Internal helper; uses subscribeToEvents from nostr. Single place. |
| **Review dedupe key** | Repeated pattern | Key `event.pubkey + d/escrow/e tag` built in subscribeReviews and getReviewsForEscrow. Could be a tiny helper e.g. `getReviewDedupeKey(event)` to avoid drift. |
| **Completed states for publishReview** | Duplicated constant | Same `[Completed, FundsReleased, DisputeResolved]` as in review-helpers. Use shared constant. |
| **parseReviewEvent** | OK | Only here. No duplication. |
| **getReviewsByTask / ByReviewer / ForUser / ForEscrow** | OK | All go through subscribeReviews; review-source re-exports them. Structure is fine. |
| **hasUserReviewedEscrow** | OK | Uses getReviewsForEscrow + pubkeyToHex. Only place for this logic. |

---

## 3. `src/lib/utils/nostr.ts`

| Item | Status | Notes |
|------|--------|--------|
| **subscribeToEvents** | OK | Single implementation; used only by nostr-review. Not duplicated. |
| **getSignedEvent / publishEvent** | OK | Used by nostr-review and others. Central place. |
| **DEFAULT_RELAYS** | Duplicated | Same definition in nostr-review, nostr-message, nostr-profile, swapAdapter. Prefer **export** from here and import elsewhere. |
| **getPool** | OK | Internal; single source. |

---

## 4. `src/lib/utils/review-source.ts`

| Item | Status | Notes |
|------|--------|--------|
| **All exports** | Thin facade | Only re-exports nostr-review (+ calculateReviewStats for getStatsForUser). No extra logic. Optional: have callers use nostr-review + review-aggregation directly to reduce indirection; or keep as single “review API” entry point. |

---

## 5. Similar logic elsewhere (project-wide)

| Pattern | Where it appears | Recommendation |
|---------|-------------------|----------------|
| **npub → hex** | review-helpers (npubToHex), nostr-review (pubkeyToHex), ContractCard (npubToHex), nostrContract (inline), contract.store (inline), nostr-message (inline), bid.store (inline), tasks/[taskId] (npubToHex), findMyTasks (inline) | Add **one** shared helper, e.g. `$lib/utils/helpers/nostrPubkey.ts`: `npubToHex(pubkey: string): string`. Use sync implementation; import nip19 at top level. Use everywhere. |
| **hex → npub** | review-helpers (toNpub), ContractCard (hexToNpub), ReviewPromptModal (hexToNpub), UserRatingDisplay, UserInfoDisplay, deviceIdentity, NpubQrCodeModal, findTaskees, settings | Same file: `hexToNpub(hex: string): string`. Use everywhere. |
| **DEFAULT_RELAYS** | nostr.ts, nostr-review.ts, nostr-message.ts, nostr-profile.ts, swapAdapter.ts | Export from **nostr.ts** (or `constants/relays.ts`) and import in nostr-review, nostr-message, nostr-profile, swapAdapter. |
| **Completed/FundsReleased/DisputeResolved** | review-helpers, nostr-review, task-status-reconciliation (subset), contractPermissions, escrow (many) | Define **one** constant for “review-relevant final states”, e.g. in escrow or escrow.enum: `REVIEW_COMPLETED_STATUSES` or reuse existing if semantics match. Use in review-helpers and nostr-review. |
| **Relay URL for “first relay”** | nostr-review uses `DEFAULT_RELAYS[0] || ''` in several places | If DEFAULT_RELAYS is centralized, keep using `DEFAULT_RELAYS[0] ?? ''` in one place (or a small helper) so logic is not scattered. |

---

## 6. Summary – recommended next steps

1. **Centralize pubkey conversion**  
   - **Done:** Added `npubToHex` and `hexToNpub` to `src/lib/utils/nostrKeys.ts`. Wired into review-helpers, nostr-review; fixed getRevieweeRole to use shared npubToHex.
   - **Done:** ContractCard, ReviewPromptModal, contract.store, and nostrContract now import and use `npubToHex` / `hexToNpub` from nostrKeys (no local nip19 decode/npubEncode).
   - **Optional:** Replace remaining inline npub↔hex in nostr-message, bid.store, tasks/[taskId], findMyTasks, profile.ts, etc. with nostrKeys.

2. **Centralize DEFAULT_RELAYS**  
   - **Done:** Exported from `nostr.ts` as `DEFAULT_RELAYS`. nostr-review, nostr-profile, and nostr-message import it; local definitions removed. Optional: wire into swapAdapter if needed.

3. **Centralize “review completed” statuses**  
   - **Done:** `ESCROW_STATUSES_REVIEW_COMPLETED` in `escrow/v1/escrow.enum.ts`, re-exported from escrow index. Used in review-helpers, nostr-review (publishReview), and ReviewPromptModal.

4. **review-helpers getRevieweeRole**  
   - **Done:** Uses shared `npubToHex` from nostrKeys (no internal normalizePubkey).

5. **nostr-review pubkeyToHex**  
   - **Done:** Replaced with shared `npubToHex` from nostrKeys.

6. **Review dedupe key**  
   - **Done:** `getReviewEventDedupeKey(event)` in nostr-review; used in subscribeReviews and getReviewsForEscrow.
   - **Optional:** Keep review-source as facade or have callers use nostr-review directly.

7. **“Send Review” button / review status**  
   - **Done:** Relay-only; no localStorage cache. List view uses `getReviewStatusBulk` (2 subscriptions total). Single-contract view uses `getReviewStatusForContract` with short timeout. ReviewPromptModal is the single review modal (ContractCard, PendingReviewsList, ContractActions).

8. **Dashboard profile page**  
   - **Done:** Single page (no Overview/Reviews tabs). Rating and tasks completed come from same sources as review section: `getStatsForUser` for rating, contract store for completed count. “Review Summary” title removed from ReviewSummaryCard.

---

## 7. What is already in good shape

- **review-source.ts**: Thin, no duplicated logic.
- **formatCompletedAt**: Single place, uses app dateFormatter.
- **getOtherPartyPubkey**, **findPendingReviews**, **hasUserReviewedContract**, **getPendingReviewsCount**: Single definition, clear responsibility.
- **subscribeToEvents** in nostr.ts: Single implementation, used only by nostr-review.
- **parseReviewEvent**, **subscribeReviews**, and the various getReviews* in nostr-review: Structure is fine; only pubkey/relays/constants need centralization.

No need to change the overall flow of “pending reviews” or “publish review”; the main gains are from **shared pubkey helpers**, **one relay constant**, and **one “review completed” status constant**, plus **getRevieweeRole** and **nostr-review** using those shared pieces.
