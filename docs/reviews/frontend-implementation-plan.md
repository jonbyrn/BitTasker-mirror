# Reviews Frontend — Implementation Plan

**Date:** 2026-05-05
**Branch:** `feat/reviews-v2`
**Status:** Analysis Complete — Implementation Pending

---

## 1. Executive Summary

The BitTasker frontend has an existing review system built on **escrow v1** using **Merkle tree proofs** (event kind 31007). A new **attestation-based review system** has been built in `nostr-reviews-verifier/` using a **Hono API** + **Cloudflare Workers** backend with event kinds 6430–6433. The existing Merkle tree system will be **removed entirely** — reviews are not in production, so there is no migration burden.

**This plan covers:**

- Removal of the old Merkle tree review system
- Implementation of version-agnostic reviews starting from contracts v2+
- Attestation-based flow using the Hono backend API
- NDK-based review queries (replacing raw `nostr-tools` subscriptions)
- Integration with NDK contract components (ContractCardNDK etc.)
- Implementation phases with specific file-level instructions

---

## 2. Current State Assessment

### 2.1 Files to Remove (Merkle Tree / v1 System)

Reviews are not in production. The entire Merkle tree system is replaced by the attestation flow. These files will be **deleted**:

| File                                              | Reason                                                     |
| ------------------------------------------------- | ---------------------------------------------------------- |
| `src/lib/services/review-verification.service.ts` | Merkle SDK wrapper — replaced by attestation API client    |
| `src/lib/services/tree-update-monitor.service.ts` | Merkle tree update monitor — not needed                    |
| `src/lib/utils/wallet/treeUpdateHelper.ts`        | Merkle tree trigger/retry — not needed                     |
| `src/lib/stores/review.store.ts`                  | Merkle tree update state — replaced by `reviews.svelte.ts` |

**Dependency to remove:**
| Package | Reason |
|---------|--------|
| `@bittasker/merkle-review-sdk` | Merkle tree SDK — replaced by `@bittasker/reviews-contracts` |

### 2.2 Files to Refactor (Keep but Rewire)

These files contain valuable UI/display logic but are currently wired to the old Merkle/kind-31007 system. They will be refactored to use the new attestation flow:

| Component             | File                                                      | Current State                          | Target                                                  |
| --------------------- | --------------------------------------------------------- | -------------------------------------- | ------------------------------------------------------- |
| Review types          | `src/lib/types/review.ts`                                 | Works with Merkle types                | Add attestation types, remove Merkle-specific fields    |
| Nostr review ops      | `src/lib/utils/nostr-review.ts`                           | Uses kind 31007, Merkle proofs         | Rewrite for kind 6430/6431 attestation flow             |
| Review helpers        | `src/lib/utils/review-helpers.ts`                         | Uses escrow v1 types                   | Rewrite with version-agnostic `IContractForReview`      |
| Review aggregation    | `src/lib/utils/review-aggregation.ts`                     | Works on abstract review data          | Minor updates for new review shape                      |
| Review status utils   | `src/lib/utils/review-status.ts`                          | Imports EscrowStatus from v1           | Rewrite with version-agnostic status mapper             |
| VerifiedReviewForm    | `src/lib/components/reviews/VerifiedReviewForm.svelte`    | Calls Merkle `publishVerifiedReview()` | Rewire for attestation flow (challenge → sign → attest) |
| VerifiedReviewCard    | `src/lib/components/reviews/VerifiedReviewCard.svelte`    | Shows Merkle verification badge        | Show attestation verification badge                     |
| ReviewList            | `src/lib/components/reviews/ReviewList.svelte`            | Queries kind 31007                     | Query kind 6431 (attestations)                          |
| PendingReviewsList    | `src/lib/components/reviews/PendingReviewsList.svelte`    | Uses v1 contract checks                | Use version-agnostic adapter                            |
| ReviewPromptModal     | `src/lib/components/reviews/ReviewPromptModal.svelte`     | Uses `escrow.getEscrow()` (v1)         | Accept `IContractForReview`                             |
| ReviewManagementTabs  | `src/lib/components/reviews/ReviewManagementTabs.svelte`  | Svelte 5, works with data              | Minimal changes                                         |
| UserRatingDisplay     | `src/lib/components/reviews/UserRatingDisplay.svelte`     | Works with review data                 | Update query source                                     |
| ProfileReviewsSection | `src/lib/components/profile/ProfileReviewsSection.svelte` | Works with review data                 | Update query source                                     |
| ReviewSummaryCard     | `src/lib/components/profile/ReviewSummaryCard.svelte`     | Works with review data                 | Minimal changes                                         |
| Dashboard page        | `src/routes/(protected)/dashboard/reviews/+page.svelte`   | Works with review data                 | Update query source                                     |

### 2.3 What Uses NDK vs nostr-tools

The review system currently uses **nostr-tools** (`type Event as NostrEvent`, `type Filter`, `nip19`). It does NOT use NDK. The project has NDK installed (`@nostr-dev-kit/ndk` v3) for contract events (PaymentContractRune, NDKPaymentContract, NDKContractStatus). All new review queries will use NDK.

### 2.4 What Is NOT Implemented

| Feature                                       | Status                                                                                                   |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Review integration in NDK contract components | ❌ Missing — `ContractCardNDK`, `ContractActionsNDK`, `ContractDrawerNDK` have zero review functionality |
| Attestation-based review flow                 | ❌ Missing — frontend uses Merkle proofs, not attestation API                                            |
| Version-agnostic contract interface           | ❌ Missing — all review logic is hardcoded to escrow v1 types                                            |
| `@bittasker/reviews-contracts` in frontend    | ❌ Missing — frontend does not import the shared contracts package                                       |
| Review attestation API client                 | ❌ Missing — no client for the Hono API endpoints                                                        |
| NDK-based review queries                      | ❌ Missing — all queries use nostr-tools `subscribeToEvents`                                             |
| Reply attestation flow                        | ❌ Missing — no UI for review replies                                                                    |

### 2.5 Nostr Event Kinds

Only the attestation kinds are used. The old Merkle kinds (31007-31012) are removed.

| Feature           | Kind | Author           | Published By      |
| ----------------- | ---- | ---------------- | ----------------- |
| Review            | 6430 | Reviewer (user)  | Client (frontend) |
| Attestation       | 6431 | BitTasker Issuer | Backend           |
| Reply             | 6432 | Reviewee (user)  | Client (frontend) |
| Reply Attestation | 6433 | BitTasker Issuer | Backend           |

---

## 3. Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                        BITTASKER FRONTEND                             │
├──────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ┌──────────────────────────────────────────────────────────────────┐│
│  │              CONTRACTS v2+ (NDK)                                  ││
│  │  ContractCardNDK.svelte    ContractActionsNDK.svelte              ││
│  │  ContractDrawerNDK.svelte  DashboardContractsPanelNDK.svelte      ││
│  │  TaskCompletionModalNDK    TaskCompletionDrawerNDK                ││
│  │  ProposeResolutionModalNDK                                        ││
│  │  • Uses NDK + PaymentContractRune                                 ││
│  │  • Kinds 30006/31006                                              ││
│  │  • REVIEWS INTEGRATION COMING (Phase 4)                           ││
│  └──────────────────────────────────────────────────────────────────┘│
│                                                                       │
│  ┌──────────────────────────────────────────────────────────────────┐│
│  │              REVIEWS SYSTEM (version-agnostic)                    ││
│  ├──────────────────────────────────────────────────────────────────┤│
│  │  Write path:                                                      ││
│  │  IContractForReview → AttestationClient → Hono API               ││
│  │  → Kind 6430 (review) + Kind 6431 (attestation)                  ││
│  │                                                                   ││
│  │  Read path:                                                       ││
│  │  NDK subscription → Kind 6431 (attestations)                     ││
│  │  → referenced Kind 6430 (review content)                         ││
│  │                                                                   ││
│  │  Adapters:                                                        ││
│  │  NDKPaymentContract → IContractForReview (v2)                    ││
│  │  FutureContractV3    → IContractForReview (v3)                   ││
│  │  FutureContractV4    → IContractForReview (v4)                   ││
│  └──────────────────────────────────────────────────────────────────┘│
│                                                                       │
│  ┌──────────────────────────────────────────────────────────────────┐│
│  │              BACKEND (nostr-reviews-verifier)                     ││
│  ├──────────────────────────────────────────────────────────────────┤│
│  │  Hono API on Cloudflare Workers                                   ││
│  │  POST /review-attestations/challenge                              ││
│  │  POST /review-attestations                                        ││
│  │  POST /review-reply-attestations/challenge                        ││
│  │  POST /review-reply-attestations                                  ││
│  │  GET  /review-attestation-issuers                                 ││
│  │  GET  /health                                                     ││
│  └──────────────────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────────────────┘
```

---

## 4. Two-Event Architecture

The attestation flow produces two Nostr events with different authors and purposes:

```
Event 1: Kind 6430 (Review)
  Author:  Reviewer (the user)
  Content: Ratings, category scores, comment, attachments
  Proves:  "Alice says Bob delivered 5-star work"
  Published by: Client (frontend) to Nostr relays

Event 2: Kind 6431 (Attestation)
  Author:  BitTasker Issuer (the backend)
  Content: reviewDraftHash, settlement proof, issuer signature
  Proves:  "BitTasker certifies this review is about a real
            completed on-chain settlement"
  Published by: Backend to Nostr relays AFTER verification
```

**Why two events?** Anyone can publish a kind 6430 event claiming "I reviewed contract X." The attestation (kind 6431) is cryptographic proof that the reviewer was a participant in a real on-chain settlement. This separates content authorship (reviewer) from verification authority (issuer).

**What the client queries:** Kind 6431 (attestations) is the primary query target — filtered by `#p` (reviewee pubkey). The attestation contains enough metadata for review listings. For full review content (comments), follow the `e` tag in the attestation to fetch the referenced kind 6430 event.

---

## 5. Version-Agnostic Contract Interface

### 5.1 Why Version-Agnostic

Reviews operate on completed contracts. Contract versions (v2, v3, v4...) will have different data structures, status enums, and participant fields. The review system must work with all versions through a unified interface — not by creating versioned code paths.

### 5.2 The Interface

```typescript
// src/lib/utils/reviews/contract-interface.ts

export interface IContractForReview {
	readonly contractId: string;
	readonly txHash?: string;
	readonly status: string;
	readonly clientPubkey: string;
	readonly freelancerPubkey: string;
	readonly settlementType: 'escrow' | 'service_quote_contract' | 'instant_buy_contract';
	readonly chain: 'rgb' | 'bsc';
	readonly contractAddress: string;
	readonly contractVersion: string;

	isReviewable(): boolean;
	getReviewableParty(currentUserPubkey: string): 'client' | 'freelancer' | null;
}
```

### 5.3 Adapters (one per contract version)

```typescript
// src/lib/utils/reviews/adapters/v2-contract-adapter.ts
// Adapts NDKPaymentContract (v2) to IContractForReview

// Each future contract version gets its own adapter:
// src/lib/utils/reviews/adapters/v3-contract-adapter.ts
// src/lib/utils/reviews/adapters/v4-contract-adapter.ts
```

---

## 6. Implementation Phases

### Phase 1: Remove Merkle Tree System

**Priority: CRITICAL**

**Files to delete:**

- `src/lib/services/review-verification.service.ts`
- `src/lib/services/tree-update-monitor.service.ts`
- `src/lib/utils/wallet/treeUpdateHelper.ts`
- `src/lib/stores/review.store.ts`

**Dependencies to remove:**

- `@bittasker/merkle-review-sdk` (from `package.json`)

**Nostr kinds to remove from `src/lib/utils/constants/kinds.ts`:**

- `MERKLE_TREE_METADATA: 31008`
- `MERKLE_TREE_CHUNK: 31009`
- `MERKLE_TREE_UPDATE: 31010`
- `REVIEW_REPORTED: 31011`

### Phase 2: Foundation (shared types & API client)

**Priority: CRITICAL**

**Files to create:**

| File                                                    | Purpose                                     |
| ------------------------------------------------------- | ------------------------------------------- |
| `src/lib/utils/reviews/contract-interface.ts`           | `IContractForReview` interface              |
| `src/lib/utils/reviews/status-mapper.ts`                | Maps contract statuses to reviewable states |
| `src/lib/utils/reviews/adapters/v2-contract-adapter.ts` | NDKPaymentContract → IContractForReview     |
| `src/lib/utils/reviews/attestation-flow.ts`             | Challenge → sign → attest orchestration     |
| `src/lib/utils/reviews/query-helper.ts`                 | NDK-based review queries (kind 6430/6431)   |
| `src/lib/api/services/reviews/attestation-client.ts`    | HTTP client for Hono API                    |
| `src/lib/api/services/reviews/types.ts`                 | API request/response types                  |
| `src/lib/stores/reviews.svelte.ts`                      | Svelte 5 runes-based review state           |
| `src/lib/utils/reviews/index.ts`                        | Barrel export                               |

**Files to modify:**

| File                               | Change                                                                                                |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `src/lib/utils/constants/kinds.ts` | Add `REVIEW: 6430`, `ATTESTATION: 6431`, `REPLY: 6432`, `REPLY_ATTESTATION: 6433`; remove 31008-31011 |
| `src/lib/types/review.ts`          | Add attestation review types; remove Merkle-specific fields                                           |

**Dependencies to add:**

```json
{
	"@bittasker/reviews-contracts": "file:./nostr-reviews-verifier/packages/reviews-contracts/bittasker-reviews-contracts-0.0.1.tgz"
}
```

> The main attestation routes are registered via `@hono/zod-openapi` and appear in the OpenAPI spec. The reply attestation routes use bare `app.post()` and are NOT in the OpenAPI spec — reference the endpoint table above.

### Phase 3: Attestation Flow Integration

**Priority: HIGH**

**Files to modify:**

| File                                                   | Change                                                               |
| ------------------------------------------------------ | -------------------------------------------------------------------- |
| `src/lib/utils/nostr-review.ts`                        | Replace Merkle `publishVerifiedReview()` with attestation flow       |
| `src/lib/utils/review-helpers.ts`                      | Replace v1-specific `findPendingReviews()` with version-agnostic     |
| `src/lib/utils/review-status.ts`                       | Replace `EscrowStatus` v1 import with version-agnostic status mapper |
| `src/lib/components/reviews/VerifiedReviewForm.svelte` | Wire to attestation flow (challenge → sign → attest)                 |
| `src/lib/components/reviews/ReviewPromptModal.svelte`  | Accept `IContractForReview` instead of escrow v1 data                |

**Flow:**

```
1. User fills review form → creates Nostr event (kind 6430)
2. Client publishes kind 6430 to Nostr relays
3. POST /review-attestations/challenge → receive challengeToken + challengeMessage
4. Sign challengeMessage with Nostr key (Schnorr) + EVM wallet (EIP-191)
5. POST /review-attestations with kind 6430 event + both signatures + challengeToken
6. Backend verifies on-chain settlement, verifies signatures, issues attestation (kind 6431)
7. Backend publishes attestation (kind 6431) to Nostr relays, returns attestationEventId
8. NDK subscription confirms attestation appears on relays
9. UI updates with "verified" status
```

### Phase 4: NDK Contract Component Integration

**Priority: HIGH**

Add review badges, buttons, and modals to all NDK contract components.

**Files to modify:**

| File                                                             | Change                                      |
| ---------------------------------------------------------------- | ------------------------------------------- |
| `src/lib/components/contracts/ContractCardNDK.svelte`            | Add review status badges + "Review" button  |
| `src/lib/components/contracts/ContractActionsNDK.svelte`         | Add "Write Review" action                   |
| `src/lib/components/contracts/ContractActionsCardNDK.svelte`     | Add review action in card context           |
| `src/lib/components/contracts/ContractActionsDrawerNDK.svelte`   | Add review action in drawer context         |
| `src/lib/components/contracts/ContractDrawerNDK.svelte`          | Add review section showing existing reviews |
| `src/lib/components/contracts/DashboardContractsPanelNDK.svelte` | Show pending review counts/badges           |
| `src/lib/components/contracts/TaskCompletionModalNDK.svelte`     | Prompt for review after completion          |
| `src/lib/components/contracts/TaskCompletionDrawerNDK.svelte`    | Prompt for review after completion (drawer) |
| `src/lib/components/contracts/ProposeResolutionModalNDK.svelte`  | Prompt review after dispute resolution      |

**Integration pattern:**

```svelte
<!-- ContractCardNDK.svelte -->
<script lang="ts">
	import type { NDKPaymentContract } from '$lib/nostr/events/contract';
	import { adaptV2Contract } from '$lib/utils/reviews/adapters/v2-contract-adapter';
	import { createReviewState } from '$lib/stores/reviews.svelte';

	let { paymentContract }: { paymentContract: NDKPaymentContract } = $props();

	const reviewContract = $derived(adaptV2Contract(paymentContract));
	const reviewState = createReviewState(reviewContract);
	const reviewStatus = $derived(reviewState.status);
</script>

{#if reviewStatus === 'pending'}
	<button onclick={() => reviewState.openModal()}>★ Write Review</button>
{:else if reviewStatus === 'reviewed'}
	<span class="badge">✓ Reviewed</span>
{/if}
```

### Phase 5: Review Queries (NDK)

**Priority: HIGH**

Replace all `nostr-tools` relay subscriptions with NDK-based queries.

**Files to create:**

| File                                             | Purpose                                             |
| ------------------------------------------------ | --------------------------------------------------- |
| `src/lib/utils/reviews/ndk-review-queries.ts`    | NDK-based queries: getByUser, getByContract, verify |
| `src/lib/utils/reviews/ndk-pending-detection.ts` | NDK-based pending review discovery                  |

**Files to modify:**

| File                                                      | Change                                             |
| --------------------------------------------------------- | -------------------------------------------------- |
| `src/lib/utils/nostr-review.ts`                           | Replace `subscribeToEvents` with NDK subscriptions |
| `src/lib/components/reviews/ReviewList.svelte`            | Use NDK queries                                    |
| `src/lib/components/reviews/PendingReviewsList.svelte`    | Use NDK pending detection                          |
| `src/lib/components/reviews/UserRatingDisplay.svelte`     | Use NDK queries                                    |
| `src/routes/(protected)/dashboard/reviews/+page.svelte`   | Use NDK queries                                    |
| `src/lib/components/profile/ProfileReviewsSection.svelte` | Use NDK queries                                    |

**Query strategy:**

- **Primary**: Query kind 6431 (attestations) filtered by `#p` (reviewee pubkey) — these are the authoritative verified review records
- **Secondary**: Follow `e` tags in attestations to fetch kind 6430 events for full review content (comments)

### Phase 6: UI for Replies

**Priority: LOW**

Add reply UI using the reply attestation flow.

**Files to create/modify:**

- New: `src/lib/components/reviews/ReviewReplyForm.svelte`
- Modify: `VerifiedReviewCard.svelte` — add "Reply" button
- Modify: `src/lib/api/services/reviews/attestation-client.ts` — add reply endpoints

### Phase 7: v1 Contract Component Cleanup

**Priority: LOW**

Once the NDK contract components are fully integrated with reviews:

- Mark `ContractCard.svelte` as deprecated (already has deprecation notice)
- Mark `ContractActions.svelte` as deprecated
- Mark `ContractDrawer.svelte` as deprecated
- Remove review-specific code from the deprecated v1 components

---

## 7. File-by-File Implementation Details

### 7.1 New Files to Create

```
src/lib/utils/reviews/
├── contract-interface.ts         # IContractForReview interface
├── status-mapper.ts              # Maps contract statuses to reviewable states
├── attestation-flow.ts           # Challenge → sign → attest (write path)
├── query-helper.ts               # NDK-based review queries (read path)
├── ndk-review-queries.ts         # NDK subscription wrappers
├── ndk-pending-detection.ts      # NDK pending review discovery
├── adapters/
│   └── v2-contract-adapter.ts    # NDKPaymentContract → IContractForReview
└── index.ts                      # Barrel export

src/lib/api/services/reviews/
├── attestation-client.ts         # HTTP client for Hono API
└── types.ts                      # API request/response types

src/lib/stores/
└── reviews.svelte.ts             # Svelte 5 runes-based review state
```

### 7.2 Existing Files to Modify

| File                                                             | Phase | What to change                                                                  |
| ---------------------------------------------------------------- | ----- | ------------------------------------------------------------------------------- |
| `src/lib/utils/constants/kinds.ts`                               | 2     | Add 6430-6433, remove 31008-31011                                               |
| `src/lib/types/review.ts`                                        | 2     | Add attestation types, remove Merkle fields                                     |
| `src/lib/utils/review-status.ts`                                 | 3     | Replace v1 EscrowStatus with version-agnostic mapper                            |
| `src/lib/utils/nostr-review.ts`                                  | 3,5   | Replace Merkle flow with attestation flow; replace nostr-tools queries with NDK |
| `src/lib/utils/review-helpers.ts`                                | 3     | Replace v1-specific contract checks with IContractForReview                     |
| `src/lib/components/reviews/VerifiedReviewForm.svelte`           | 3     | Re-wire for attestation flow                                                    |
| `src/lib/components/reviews/ReviewPromptModal.svelte`            | 3     | Accept IContractForReview                                                       |
| `src/lib/components/reviews/VerifiedReviewCard.svelte`           | 3     | Show attestation badge instead of Merkle badge                                  |
| `src/lib/components/reviews/ReviewList.svelte`                   | 5     | Use NDK queries for kind 6431                                                   |
| `src/lib/components/reviews/PendingReviewsList.svelte`           | 4,5   | Version-agnostic detection + NDK queries                                        |
| `src/lib/components/reviews/UserRatingDisplay.svelte`            | 5     | Use NDK queries                                                                 |
| `src/routes/(protected)/dashboard/reviews/+page.svelte`          | 5     | Use NDK queries                                                                 |
| `src/lib/components/profile/ProfileReviewsSection.svelte`        | 5     | Use NDK queries                                                                 |
| `src/lib/components/contracts/ContractCardNDK.svelte`            | 4     | Add review badges + button                                                      |
| `src/lib/components/contracts/ContractActionsNDK.svelte`         | 4     | Add review action                                                               |
| `src/lib/components/contracts/ContractActionsCardNDK.svelte`     | 4     | Add review action                                                               |
| `src/lib/components/contracts/ContractActionsDrawerNDK.svelte`   | 4     | Add review action                                                               |
| `src/lib/components/contracts/ContractDrawerNDK.svelte`          | 4     | Add review section                                                              |
| `src/lib/components/contracts/DashboardContractsPanelNDK.svelte` | 4     | Add review badges                                                               |
| `src/lib/components/contracts/TaskCompletionModalNDK.svelte`     | 4     | Prompt review                                                                   |
| `src/lib/components/contracts/TaskCompletionDrawerNDK.svelte`    | 4     | Prompt review                                                                   |
| `src/lib/components/contracts/ProposeResolutionModalNDK.svelte`  | 4     | Prompt review                                                                   |

### 7.3 Files to Delete

| File                                              | Phase |
| ------------------------------------------------- | ----- |
| `src/lib/services/review-verification.service.ts` | 1     |
| `src/lib/services/tree-update-monitor.service.ts` | 1     |
| `src/lib/utils/wallet/treeUpdateHelper.ts`        | 1     |
| `src/lib/stores/review.store.ts`                  | 1     |

---

## 8. NDK Integration Strategy

### 8.1 Why NDK

The project uses NDK (`@nostr-dev-kit/ndk` v3) for contract events (NDKPaymentContract, NDKContractStatus). Using NDK for review queries provides:

- Consistent subscription management across the app
- Built-in relay selection and fallback
- Caching and deduplication
- Type safety

### 8.2 What Stays on nostr-tools

- NIP-19 encoding/decoding (`nip19.npubEncode`, `nip19.decode`) — lightweight, no reason to switch
- Event signing utilities — used in the attestation flow (Schnorr via `@noble/curves/secp256k1`)

### 8.3 What Moves to NDK

- Relay subscriptions for review/attestation events
- Event publishing for kind 6430 review events
- Query filtering by tags and authors

---

## 9. API Client Design

```typescript
// src/lib/api/services/reviews/attestation-client.ts

class ReviewsAttestationClient {
	constructor(private baseUrl: string = '') {}

	async getIssuers(): Promise<IssuerRegistryResponse>;
	async requestChallenge(input: ChallengeRequest): Promise<ChallengeResponse>;
	async submitAttestation(input: AttestationRequest): Promise<AttestationResponse>;
	async requestReplyChallenge(input: ReplyChallengeRequest): Promise<ChallengeResponse>;
	async submitReplyAttestation(input: ReplyAttestationRequest): Promise<AttestationResponse>;
}
```

The `baseUrl` is empty in production (same-origin behind Cloudflare Workers) and `http://localhost:8787` or Vite-proxied in local dev.

### Vite Proxy (local dev)

```typescript
// vite.config.ts
server: {
  proxy: {
    '/review-attestations': 'http://localhost:8787',
    '/review-reply-attestations': 'http://localhost:8787',
    '/review-attestation-issuers': 'http://localhost:8787',
  }
}
```

---

## 10. Testing Strategy

| What                          | How                                                              |
| ----------------------------- | ---------------------------------------------------------------- |
| `IContractForReview` adapters | Test v2 adapter produces correct interface values                |
| Status mapper                 | Test all v2 contract statuses map to correct reviewable booleans |
| Attestation flow              | Mock Hono API, test challenge → sign → attest pipeline           |
| NDK queries                   | Mock NDK subscriptions, test kind 6431 retrieval and filtering   |
| Review store (runes)          | Test state transitions and derived values                        |
| `VerifiedReviewForm`          | Mock API client, test attestation flow end-to-end                |
| `ContractCardNDK` badges      | Mock adapted contract, test badge visibility                     |

---

## 11. Risk Assessment

| Risk                               | Impact | Mitigation                                                                          |
| ---------------------------------- | ------ | ----------------------------------------------------------------------------------- |
| Attestation backend downtime       | High   | Reviews can be created as draft kind 6430 events; attestation can be retried        |
| NDK version conflicts              | Low    | NDK v3 is already installed and stable                                              |
| Wallet signing failures (EIP-191)  | Medium | Clear error messages; fallback instructions for different wallets                   |
| Contract version drift (v3, v4...) | Low    | Adapter pattern — each version gets its own adapter implementing IContractForReview |

---

## 12. Success Criteria

- [ ] Merkle tree system fully removed (4 files deleted, 1 dependency removed)
- [ ] Reviews are published via attestation flow (kinds 6430/6431)
- [ ] `ContractCardNDK.svelte` shows review status badges
- [ ] Users can review from all NDK contract components
- [ ] Dashboard reviews page shows attestation-based reviews
- [ ] Profile review section shows attestation-based reviews
- [ ] Review components accept `IContractForReview` (version-agnostic)
- [ ] All review queries use NDK (not `nostr-tools` SimplePool)
- [ ] All tests pass for the new attestation flow

---

## 13. References

- Backend API guide: `nostr-reviews-verifier/docs/local-development.md`
- Backend architecture: `nostr-reviews-verifier/docs/implementation-plan.md`
- Shared contracts: `nostr-reviews-verifier/packages/reviews-contracts/src/`
- NDK contract events: `src/lib/nostr/events/contract.ts`
- NDK setup: `src/lib/nostr/ndk.ts`
- Hono API OpenAPI spec: `GET /openapi.json` on the running backend
