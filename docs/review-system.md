# BitTasker Review System — End-to-End

This document describes how the review system works and how it is implemented across the stack: from escrow completion to Nostr events to UI.

---

## 1. Overview

- **Purpose:** Taskers and Taskees can leave verified reviews after a task is completed and (where applicable) funds are released. Reviews are tied to an escrow and stored only on Nostr (no backend review API).
- **Nostr:** Reviews use **kind 1985** (NIP-33 replaceable: one review per author per escrow). Legacy **kind 31007** is supported for reading only.
- **Gating:** A review can be submitted only when the escrow is in a “review-completed” state: `Completed`, `FundsReleased`, or `DisputeResolved` (see `ESCROW_STATUSES_REVIEW_COMPLETED`).

---

## 2. When a Review Can Be Submitted

Reviews are allowed only after the task/escrow path has reached a final completed state:

| Escrow status         | Meaning                         | Can submit review? |
| --------------------- | ------------------------------- | ------------------ |
| `Completed` (4)       | Freelancer marked task complete | Yes                |
| `FundsReleased` (10)  | Client accepted; funds released | Yes                |
| `DisputeResolved` (2) | Dispute resolved via proposal   | Yes                |
| Any other status      | —                               | No                 |

These statuses are defined in `src/lib/utils/escrow/v1/escrow.enum.ts` as `ESCROW_STATUSES_REVIEW_COMPLETED` and are used by:

- `nostr-review.ts` in `publishReview()` (guards submission).
- `review-helpers.ts` in `findPendingReviews()` (which contracts are “pending review”).
- `PendingReviewsList` / `ReviewPromptModal` (when to show the review flow).

---

## 3. Nostr Event Shape (Kind 1985)

- **Kind:** `1985` (see `KINDS.REVIEW_VERIFIED` in `src/lib/utils/constants/kinds.ts`).
- **Replaceable:** Same author + same `d` tag (escrow id) → newer event replaces older (NIP-33).
- **Tags (typical):**
  - `task` — task id
  - `escrow` — escrow id
  - `p` — reviewee pubkey (hex)
  - `reviewee_role` — `tasker` or `taskee`
  - `d` — escrow id (for replaceability)
- **Content (JSON):** `ReviewEventContent`: `overallRating`, `categoryRatings`, optional `comment`, `photos`, `revieweeRole`.

Role-specific categories:

- **Taskee (freelancer):** `workQuality`, `experience`, `deliverySpeed`
- **Tasker (client):** `communication`, `clarity`, `paymentTimeliness`

Overall rating is 1–5; category ratings are 1–5 per key. The UI enforces required categories and optional comment (e.g. 0/1000 chars).

---

## 4. Data Flow (High Level)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  UI: Pending reviews list / Contract card “Leave review”                    │
└─────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  review-helpers: findPendingReviews()                                        │
│  • Loads user’s contracts (escrow.contractOps.getContracts)                 │
│  • Loads reviews given by user (review-source getReviewsByReviewer)         │
│  • Filters to completed escrows not yet reviewed → PendingReview[]          │
└─────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  UI: ReviewPromptModal + VerifiedReviewForm                                 │
│  • Reviewee, task id, escrow id from contract; reviewee role from contract  │
│  • User fills ratings + optional comment → submit                           │
└─────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  nostr-review: publishReview(escrowId, revieweePubkey, content, taskId)      │
│  • Ensures escrow exists and status in ESCROW_STATUSES_REVIEW_COMPLETED     │
│  • Builds kind-1985 event (tags + JSON content), signs, publishes           │
└─────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  Nostr relay(s) — event stored; other clients can subscribe and display    │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Reading reviews:**

- **By reviewee (profile):** `getReviewsForUser(revieweePubkey)` → Nostr filter by `#p` = reviewee, then `getStatsForUser` = `calculateReviewStats(reviews)`.
- **By escrow:** `getReviewsForEscrow(escrowId)` → filter by `#escrow` (or equivalent).
- **By reviewer:** `getReviewsByReviewer(reviewerPubkey)` → filter by `authors: [reviewerHex]`.

All read paths go through `nostr-review` (subscribe + parse kind 1985/31007 into `NostrVerifiedReview`).

---

## 5. Implementation Layers

### 5.1 Types (`src/lib/types/review.ts`)

- **ReviewEventContent** — JSON inside the kind-1985 event.
- **NostrVerifiedReview** — Parsed review for app use (reviewer/reviewee pubkeys, content, timestamps, event id, escrow id).
- **ReviewStats** — Aggregated stats (totals, averages per category, rating distribution).
- **RevieweeRole**, **TaskeeCategoryRatings**, **TaskerCategoryRatings** — Used by form and aggregation.
- **REVIEW_EVENT_KIND** = 1985.

### 5.2 Nostr layer (`src/lib/utils/nostr-review.ts`)

- **Relay:** Uses local `DEFAULT_RELAYS` (from `VITE_NOSTR_RELAY_URL`) for subscribe/publish.
- **publishReview(escrowId, revieweePubkey, content, taskId)**  
  Validates escrow and status, builds kind-1985 event with tags and `ReviewEventContent`, signs via `getSignedEvent`, publishes via `publishEvent`. Returns event id.
- **updateReview** — Same as publishing again (replaceable event).
- **subscribeReviews** — Internal helper: subscribes to Nostr with a filter, deduplicates by `getReviewEventDedupeKey`, parses with `parseReviewEvent` into `NostrVerifiedReview`.
- **getReviewsForUser(revieweePubkey)** — Filter by `#p` = reviewee.
- **getReviewsByReviewer(reviewerPubkey)** — Filter by `authors`.
- **getReviewsForEscrow(escrowId)** — Filter by `#escrow`.
- **getReviewsByTask(taskId)** — Filter by `#task`.
- **hasUserReviewedEscrow(escrowId, reviewerPubkey)** — Fetches reviews for escrow and checks if any have that reviewer.
- **parseReviewEvent** — Handles kind 1985 (current format) and kind 31007 (legacy); returns `NostrVerifiedReview | null`.

### 5.3 Review source facade (`src/lib/utils/review-source.ts`)

Thin public API used by the rest of the app:

- `getReviewsForUser`, `getReviewsByReviewer`, `getReviewsForEscrow` — Forward to nostr-review.
- `getStatsForUser(revieweePubkey)` — Calls `getReviewsForUser(revieweePubkey, 500)` then `calculateReviewStats(reviews)`.
- `hasUserReviewedEscrow` — Forwards to nostr-review.

This keeps a single “review API” entry point; internals can stay in nostr-review.

### 5.4 Review aggregation (`src/lib/utils/review-aggregation.ts`)

- **calculateReviewStats(reviews)** — Computes:
  - Total count, overall average, rating distribution (1–5).
  - Role-specific averages (taskee: workQuality, experience, deliverySpeed; tasker: communication, clarity, paymentTimeliness).
  - Legacy-compat averages (quality, professionalism, timeliness) mapped from role-specific where applicable.

Used by `getStatsForUser` and by profile/dashboard UIs that show “reviews received” and summary stats.

### 5.5 Review helpers (`src/lib/utils/review-helpers.ts`)

- **findPendingReviews()** — Loads contracts and “reviews given” by current user; returns contracts in `ESCROW_STATUSES_REVIEW_COMPLETED` that the user hasn’t reviewed yet; optionally resolves reviewee names from Nostr profile metadata.
- **formatCompletedAt(timestamp)** — Formats completion time for display (uses app dateFormatter).
- **getOtherPartyPubkey(contract, currentUserHex)** — Returns the other participant’s pubkey (client or freelancer).
- **getRevieweeRole(contract)** — Infers whether the reviewee is tasker or taskee from contract content.
- **hasUserReviewedContract** — Wrapper over `hasUserReviewedEscrow`.
- **getPendingReviewsCount()** — Uses `findPendingReviews()` and returns length.

Used by `PendingReviewsList`, `ReviewPromptModal`, `ContractCard`, and any “pending review” badges or counts.

### 5.6 Review display utilities (`src/lib/utils/review-display.ts`)

- **getRatingColor(rating, totalReviews)** — Tailwind class for rating (e.g. neutral vs primary).
- **getStarClassForIndex / getStarClassForIndexMuted** — Star fill style for 1–5 display (e.g. filled vs unfilled).

Used by review cards, profile summary, and the review form star UI.

---

## 6. UI Components and Where They Are Used

| Component                | Role                                                                                                                   |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| **PendingReviewsList**   | Lists contracts needing a review; uses `findPendingReviews()`; opens ReviewPromptModal on item click.                  |
| **ReviewPromptModal**    | Drawer/modal that hosts VerifiedReviewForm; resolves reviewee/taskId/escrow and checks escrow status.                  |
| **VerifiedReviewForm**   | Form: category ratings (role-based), optional comment, submit; calls `publishReview` and disables if already reviewed. |
| **VerifiedReviewCard**   | Displays a single review (ratings, comment, date).                                                                     |
| **ReviewList**           | Lists reviews (e.g. for a user or escrow) with VerifiedReviewCard.                                                     |
| **ReviewsEmptyState**    | “No reviews yet” (and optional hint).                                                                                  |
| **ReviewSummaryCard**    | Profile/dashboard: aggregate stats (average, count, distribution).                                                     |
| **ReviewManagementTabs** | Tabs: “Received” / “Given” / “Pending” (e.g. on profile).                                                              |
| **UserRatingDisplay**    | Compact rating (e.g. stars + number).                                                                                  |
| **StarRating**           | Read-only star display.                                                                                                |

**Typical places they appear:**

- **Dashboard / Profile (current user):** `ProfileReviewsSection` — received reviews, given reviews, pending reviews count and list; uses `getReviewsForUser`, `getReviewsByReviewer`, `getStatsForUser`, `getPendingReviewsCount`, `PendingReviewsList`, `ReviewList`, `VerifiedReviewCard`, `ReviewSummaryCard`, `ReviewManagementTabs`.
- **Contract card / task completion:** “Leave review” opens `ReviewPromptModal` with escrow id, reviewee, task id; after submit, list/counts refresh.
- **Public profile (other user):** Received reviews and summary only (same `getReviewsForUser` / `getStatsForUser` + `ReviewList` / `ReviewSummaryCard`).

---

## 7. End-to-End User Flows

### 7.1 Submitting a review

1. User has a completed contract (escrow in `Completed`, `FundsReleased`, or `DisputeResolved`).
2. User opens “Pending reviews” (or “Leave review” on a contract card).
3. `findPendingReviews()` returns that contract; user clicks it.
4. Optional: escrow status is re-checked; if not in a completed state, a message is shown and the modal is not opened.
5. `ReviewPromptModal` opens with `VerifiedReviewForm`; reviewee and task id come from the contract (and optional reviewee name from Nostr profile).
6. User sets required category ratings and optional comment, then submits.
7. `publishReview(escrowId, revieweePubkey, content, taskId)` runs: escrow and status are validated, kind-1985 event is built and published to Nostr.
8. On success, modal closes and pending list/counts reload (e.g. `loadPendingReviews()`, `getPendingReviewsCount()`).

### 7.2 Viewing reviews on a profile

1. Profile page loads with a user pubkey (current or other).
2. `getReviewsForUser(pubkey)` and `getStatsForUser(pubkey)` are called (e.g. in `ProfileReviewsSection`).
3. Reviews are shown in `ReviewList` with `VerifiedReviewCard`; stats in `ReviewSummaryCard`.
4. If viewing own profile, “Given” and “Pending” tabs and `PendingReviewsList` use `getReviewsByReviewer` and `findPendingReviews()`.

---

## 8. Key Files Reference

| Area               | Path                                                                           |
| ------------------ | ------------------------------------------------------------------------------ |
| Types              | `src/lib/types/review.ts`                                                      |
| Nostr publish/read | `src/lib/utils/nostr-review.ts`                                                |
| Public API         | `src/lib/utils/review-source.ts`                                               |
| Stats              | `src/lib/utils/review-aggregation.ts`                                          |
| Pending + helpers  | `src/lib/utils/review-helpers.ts`                                              |
| Display helpers    | `src/lib/utils/review-display.ts`                                              |
| Escrow gating      | `src/lib/utils/escrow/v1/escrow.enum.ts` (`ESCROW_STATUSES_REVIEW_COMPLETED`)  |
| Kinds              | `src/lib/utils/constants/kinds.ts` (REVIEW_VERIFIED 1985, REVIEW_LEGACY 31007) |
| Form               | `src/lib/components/reviews/VerifiedReviewForm.svelte`                         |
| Modal              | `src/lib/components/reviews/ReviewPromptModal.svelte`                          |
| Pending list       | `src/lib/components/reviews/PendingReviewsList.svelte`                         |
| Profile section    | `src/lib/components/profile/ProfileReviewsSection.svelte`                      |

---

## 9. Testing

- **Utils:** `src/lib/utils/__tests__/nostr-review.test.ts`, `review-source.test.ts`, `review-helpers.test.ts`, `review-aggregation.test.ts`, `review-display.test.ts`.
- **Components:** `src/lib/components/reviews/__tests__/VerifiedReviewForm.test.ts`, `VerifiedReviewCard.test.ts`, `ReviewsEmptyState.test.ts`.

Tests mock Nostr, escrow, and i18n so that publish/read paths and UI behavior can be verified in isolation.
