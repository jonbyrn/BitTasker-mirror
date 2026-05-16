# Reviews v2 Integration Plan

**Date:** 2026-05-02
**Branch:** `feat/reviews-v2`
**Status:** Analysis Complete — Implementation Required

---

## Executive Summary

The `feat/reviews-v2` branch was built during the services feature, both initially targeting **escrow v1**. After rebasing onto `dev` (which now includes the meta-transactions/contracts v2+ system), **reviews are not integrated with the new contract system**.

**Core Problem:** Reviews were integrated into `ContractCard.svelte` (v1) but NOT into `ContractCardNDK.svelte` (v2+). The new NDK components that use `PaymentContractRune` have no review functionality.

**Key Architectural Insight:** Reviews should **NOT be versioned**. They must be version-agnostic from the start — designed to work with ANY contract version (v2, v3, v4...) through a unified interface abstraction.

---

## System Architecture Analysis

### Two Parallel Escrow/Contract Systems

```
┌─────────────────────────────────────────────────────────────────┐
│                     BITTASKER CLIENT APP                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────┐    ┌─────────────────────────────────┐│
│  │   OLD ESCROW v1     │    │      NEW CONTRACTS v2+          ││
│  │   (/escrow/v1/)      │    │      (/contracts/, /contract/) ││
│  ├─────────────────────┤    ├─────────────────────────────────┤│
│  │ • escrow.ts         │    │ • PaymentContractRune          ││
│  │ • escrowBid.ts      │    │ • NDKPaymentContract           ││
│  │ • escrowEvents.ts   │    │ • ContractStatus               ││
│  │ • EscrowStatus enum │    │ • Version-agnostic handlers    ││
│  │                     │    │                                 ││
│  │ Used by:           │    │ Used by:                        ││
│  │ • ContractCard     │    │ • ContractCardNDK               ││
│  │ • ContractActions  │    │ • ContractActionsNDK            ││
│  │ • ContractDrawer   │    │ • ContractDrawerNDK             ││
│  │ • ReviewPromptModal│    │ • (NO REVIEW INTEGRATION)       ││
│  └─────────────────────┘    └─────────────────────────────────┘│
│                                                                 │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │              REVIEWS SYSTEM (VERSION-AGNOSTIC)              ││
│  ├─────────────────────────────────────────────────────────────┤│
│  │ • Stored as Nostr kind 9001 events                         ││
│  │ • Merkle tree verification via @bittasker/merkle-review-sdk ││
│  │ • Linked to contract via contractId (version-agnostic)     ││
│  │ • UI integration via IContractReview interface              ││
│  │ • Works with ANY contract version through abstraction      ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

### Component Duplication Map (NDK Pairs)

| v1 Component (Old)               | NDK Component (New)                 | Review Integration        |
| -------------------------------- | ----------------------------------- | ------------------------- |
| `ContractCard.svelte`            | `ContractCardNDK.svelte`            | v1: YES / NDK: **NO**     |
| `ContractActions.svelte`         | `ContractActionsNDK.svelte`         | v1: YES / NDK: **NO**     |
| `ContractDrawer.svelte`          | `ContractDrawerNDK.svelte`          | v1: partial / NDK: **NO** |
| `ContractTimeline.svelte`        | `ContractTimelineNDK.svelte`        | **NO**                    |
| `DashboardContractsPanel.svelte` | `DashboardContractsPanelNDK.svelte` | **NO**                    |
| `TaskCompletionModal.svelte`     | `TaskCompletionModalNDK.svelte`     | **NO**                    |
| —                                | `TaskCompletionDrawerNDK.svelte`    | **NO**                    |
| —                                | `ProposeResolutionModalNDK.svelte`  | **NO**                    |

---

## Version-Agnostic Architecture

### The Problem with Versioned Reviews

The previous approach (creating `review-helpers-v2.ts`, `review-helpers-v3.ts`, etc.) creates maintenance nightmares. Each new escrow version would require:

- New helper functions
- New verification paths
- Component modifications for each version
- Testing for each permutation

### The Solution: Contract Interface Abstraction

Reviews should define a **contract interface** that any escrow version must satisfy:

```typescript
// src/lib/utils/reviews/contract-interface.ts

/**
 * Version-agnostic contract interface for review operations.
 * Any contract type (v1, v2, v3, v4...) must implement this interface
 * to be compatible with the review system.
 */
export interface IContractForReview {
	/** Unique contract/escrow identifier */
	readonly contractId: string;

	/** Blockchain transaction hash (for verification) */
	readonly txHash?: string;

	/** Current contract status */
	readonly status: ContractStatusType;

	/** Parties involved */
	readonly client: string;
	readonly freelancer: string;

	/** Whether contract is in a reviewable state */
	isReviewable(): boolean;

	/** Get the parties who can submit reviews */
	getReviewableParties(currentUserPubkey: string): ReviewableParty[];
}

export type ReviewableParty = 'client' | 'freelancer' | 'both';

export type ContractStatusType = string; // Union of all status types across versions
```

### Status Mapping Layer

Each contract version provides its status mapping:

```typescript
// src/lib/utils/reviews/status-mapper.ts

import type { IContractForReview } from './contract-interface';

/**
 * Maps contract-specific statuses to review-eligible states.
 * Each contract version provides its own mapper.
 */
export interface IStatusMapper {
	/** Check if a status is reviewable */
	isReviewableStatus(status: ContractStatusType): boolean;

	/** Map contract status to display label */
	getStatusLabel(status: ContractStatusType): string;
}

// Default mapper for v2+ contracts
export const defaultStatusMapper: IStatusMapper = {
	isReviewableStatus: (status) =>
		status === 'completed' || status === 'resolved' || status === 'dispute_resolved',

	getStatusLabel: (status) =>
		({
			completed: 'Completed',
			resolved: 'Resolved',
			dispute_resolved: 'Dispute Resolved'
		})[status] ?? status
};
```

---

## Svelte 5 Implementation

### Step 1: Create Version-Agnostic Review Store

**File to create:** `src/lib/stores/reviews.svelte.ts`

```typescript
// Svelte 5 Runes-based review state management
import { IContractForReview } from '$lib/utils/reviews/contract-interface';
import type { NDKPaymentContract } from '$lib/nostr/events/contract';

interface ReviewState {
	contract: IContractForReview | null;
	isLoading: boolean;
	error: string | null;
}

/**
 * Creates a version-agnostic review state for a contract.
 * Works with ANY contract type through the IContractForReview interface.
 */
export function createReviewState(contract: IContractForReview | null) {
	let state = $state<ReviewState>({
		contract,
		isLoading: false,
		error: null
	});

	return {
		get contract() {
			return state.contract;
		},
		get isLoading() {
			return state.isLoading;
		},
		get error() {
			return state.error;
		},
		get canReview() {
			return state.contract?.isReviewable() ?? false;
		},

		setContract(contract: IContractForReview | null) {
			state.contract = contract;
		},

		async submitReview(rating: number, comment: string) {
			if (!state.contract) return;

			state.isLoading = true;
			state.error = null;

			try {
				// Version-agnostic: works with any contract
				await publishReviewForContract(state.contract, rating, comment);
			} catch (e) {
				state.error = e instanceof Error ? e.message : 'Failed to submit review';
			} finally {
				state.isLoading = false;
			}
		}
	};
}
```

### Step 2: Create NDK Contract Adapter

**File to create:** `src/lib/utils/reviews/ndk-contract-adapter.ts`

```typescript
// Adapter to make NDKPaymentContract satisfy IContractForReview
import type { NDKPaymentContract } from '$lib/nostr/events/contract';
import type { IContractForReview, ReviewableParty } from './contract-interface';
import { defaultStatusMapper } from './status-mapper';

export function adaptNDKContract(
	ndkContract: NDKPaymentContract,
	currentUserPubkey: string
): IContractForReview {
	return {
		get contractId() {
			// NDK contracts use 'id' or 'contractId'
			return ndkContract.id || (ndkContract as any).contractId;
		},

		get txHash() {
			return (ndkContract as any).txHash;
		},

		get status() {
			return (ndkContract as any).status;
		},

		get client() {
			return (ndkContract as any).client;
		},

		get freelancer() {
			return (ndkContract as any).freelancer;
		},

		isReviewable() {
			return defaultStatusMapper.isReviewableStatus(this.status);
		},

		getReviewableParties() {
			const isClient = this.client === currentUserPubkey;
			const isFreelancer = this.freelancer === currentUserPubkey;

			if (isClient) return 'client';
			if (isFreelancer) return 'freelancer';
			return 'both';
		}
	};
}
```

### Step 3: Update ReviewPromptModal for Svelte 5

**File to modify:** `src/lib/components/reviews/ReviewPromptModal.svelte`

```svelte
<script lang="ts">
	import type { IContractForReview } from '$lib/utils/reviews/contract-interface';
	import { createReviewState } from '$lib/stores/reviews.svelte';

	// Svelte 5: Use $props() rune
	interface Props {
		contract: IContractForReview | null;
		open?: boolean;
		onClose?: () => void;
		onSubmit?: (eventId: string) => void;
	}

	let { contract = $bindable(null), open = $bindable(false), onClose, onSubmit }: Props = $props();

	// Local state using $state
	let rating = $state(0);
	let comment = $state('');
	let hoveredStar = $state(0);

	// Derived state
	let canSubmit = $derived(rating > 0 && comment.length >= 10);

	// Review state management
	const reviewState = createReviewState(contract);

	// Update store when contract changes
	$effect(() => {
		reviewState.setContract(contract);
	});

	async function handleSubmit() {
		await reviewState.submitReview(rating, comment);
		if (!reviewState.error && onSubmit) {
			// Get the published event ID from the review system
			onSubmit(''); // TODO: Get actual event ID
		}
	}

	function handleClose() {
		open = false;
		onClose?.();
	}

	// Svelte 5: Use onclick instead of on:click
</script>

<dialog {open} onclose={handleClose}>
	<div class="review-modal">
		<header>
			<h2>Write a Review</h2>
			<button type="button" onclick={handleClose} aria-label="Close">×</button>
		</header>

		{#if reviewState.error}
			<div class="error">{reviewState.error}</div>
		{/if}

		<form
			onsubmit={(e) => {
				e.preventDefault();
				handleSubmit();
			}}
		>
			<!-- Star Rating -->
			<div class="rating-section">
				<label>Rating</label>
				<div class="stars">
					{#each [1, 2, 3, 4, 5] as star}
						<button
							type="button"
							class="star"
							class:filled={star <= (hoveredStar || rating)}
							class:hovered={star <= hoveredStar}
							onclick={() => (rating = star)}
							onmouseenter={() => (hoveredStar = star)}
							onmouseleave={() => (hoveredStar = 0)}
							aria-label={`${star} star${star > 1 ? 's' : ''}`}
						>
							★
						</button>
					{/each}
				</div>
			</div>

			<!-- Comment -->
			<div class="comment-section">
				<label for="review-comment">Comment (min 10 characters)</label>
				<textarea
					id="review-comment"
					bind:value={comment}
					placeholder="Share your experience..."
					rows={4}
				></textarea>
				<span class="char-count" class:valid={comment.length >= 10}>
					{comment.length}/10 min
				</span>
			</div>

			<!-- Actions -->
			<div class="actions">
				<button type="button" onclick={handleClose}>Cancel</button>
				<button type="submit" disabled={!canSubmit || reviewState.isLoading}>
					{#if reviewState.isLoading}
						Submitting...
					{:else}
						Submit Review
					{/if}
				</button>
			</div>
		</form>
	</div>
</dialog>

<style>
	/* Modal styles */
</style>
```

### Step 4: Integrate into ContractCardNDK

**File to modify:** `src/lib/components/contracts/ContractCardNDK.svelte`

```svelte
<script lang="ts">
	import type { NDKPaymentContract } from '$lib/nostr/events/contract';
	import ReviewPromptModal from '$lib/components/reviews/ReviewPromptModal.svelte';
	import { adaptNDKContract } from '$lib/utils/reviews/ndk-contract-adapter';
	import { defaultStatusMapper } from '$lib/utils/reviews/status-mapper';
	import { getCurrentUserPubkey } from '$lib/utils/user';

	// ... existing props and state

	// Svelte 5: Use $props()
	let { paymentContract }: { paymentContract: NDKPaymentContract } = $props();

	// Local state
	let showReviewModal = $state(false);

	// Current user
	const currentUser = $derived(getCurrentUserPubkey());

	// Adapt NDK contract to version-agnostic interface
	const reviewContract = $derived(
		currentUser ? adaptNDKContract(paymentContract, currentUser) : null
	);

	// Review status - derived from contract
	const isReviewable = $derived(reviewContract?.isReviewable() ?? false);

	const hasReviewed = $derived(
		// Check if current user has already reviewed this contract
		// Use the version-agnostic review query
		false // TODO: Implement hasUserReviewed(reviewContract.contractId)
	);

	const reviewStatus = $derived(() => {
		if (!isReviewable) return null;
		if (hasReviewed) return 'reviewed';
		return 'pending';
	});
</script>

<!-- Contract content -->

<!-- Review Badge -->
{#if reviewStatus()}
	<button
		type="button"
		class="review-badge"
		class:reviewed={reviewStatus() === 'reviewed'}
		onclick={() => (showReviewModal = true)}
	>
		{#if reviewStatus() === 'reviewed'}
			✓ Reviewed
		{:else}
			★ Review Pending
		{/if}
	</button>
{/if}

<ReviewPromptModal bind:open={showReviewModal} contract={reviewContract} />
```

### Step 5: Version-Agnostic Review Queries

**File to create:** `src/lib/utils/reviews/queries.ts`

```typescript
// Version-agnostic review queries
import type { IContractForReview } from './contract-interface';
import { getReviewsByContract, hasUserReviewed } from '$lib/utils/nostr-review';

export interface PendingReviewInfo {
	contract: IContractForReview;
	revieweePubkey: string;
	revieweeName: string;
}

/**
 * Find all pending reviews for a list of contracts.
 * Works with ANY contract type through IContractForReview interface.
 */
export async function findPendingReviewsForContracts(
	contracts: IContractForReview[],
	currentUserPubkey: string
): Promise<PendingReviewInfo[]> {
	const pending: PendingReviewInfo[] = [];

	for (const contract of contracts) {
		// Skip non-reviewable contracts
		if (!contract.isReviewable()) continue;

		// Check if user already reviewed this contract
		const userHasReviewed = await hasUserReviewed(currentUserPubkey, contract.contractId);
		if (userHasReviewed) continue;

		// Determine who to review (the other party)
		const isClient = contract.client === currentUserPubkey;
		const isFreelancer = contract.freelancer === currentUserPubkey;

		if (isClient) {
			pending.push({
				contract,
				revieweePubkey: contract.freelancer,
				revieweeName: 'Freelancer' // TODO: Resolve from pubkey
			});
		} else if (isFreelancer) {
			pending.push({
				contract,
				revieweePubkey: contract.client,
				revieweeName: 'Client'
			});
		}
	}

	return pending;
}

/**
 * Check if user has reviewed a specific contract.
 * Works with ANY contract type.
 */
export async function hasUserReviewedContract(
	userPubkey: string,
	contractId: string
): Promise<boolean> {
	return hasUserReviewed(userPubkey, contractId);
}
```

---

## State of Reviews — What Works, What Doesn't

### ✅ Fully Implemented

| Feature                               | Status     | Location                         |
| ------------------------------------- | ---------- | -------------------------------- |
| Review publishing to Nostr            | ✅ Working | `nostr-review.ts`                |
| Review retrieval (by user, by escrow) | ✅ Working | `nostr-review.ts`                |
| Review verification (Merkle proof)    | ✅ Working | `review-verification.service.ts` |
| Review form UI (Svelte 4)             | ✅ Working | `VerifiedReviewForm.svelte`      |
| Review display card                   | ✅ Working | `VerifiedReviewCard.svelte`      |
| Review list                           | ✅ Working | `ReviewList.svelte`              |
| Dashboard page (3 tabs)               | ✅ Working | `dashboard/reviews/+page.svelte` |
| Review badges on ContractCard         | ✅ Working | `ContractCard.svelte`            |

### ❌ NOT Implemented

| Feature                               | Status     | Location                                  |
| ------------------------------------- | ---------- | ----------------------------------------- |
| Review UI on NDK components           | ❌ Missing | Need to integrate with all NDK components |
| Version-agnostic contract interface   | ❌ Missing | Need IContractForReview abstraction       |
| Svelte 5 rewrite of review components | ❌ Missing | Existing components use Svelte 4 syntax   |
| Review queries for NDK contracts      | ❌ Missing | Need ndk-contract-adapter.ts              |

---

## Implementation Roadmap

### Phase 1: Core Interface Abstraction (Priority: HIGH)

1. **Create `src/lib/utils/reviews/contract-interface.ts`**

   - Define `IContractForReview` interface
   - All contract versions implement this interface

2. **Create `src/lib/utils/reviews/status-mapper.ts`**

   - Define `IStatusMapper` interface
   - Implement `defaultStatusMapper` for v2+ contracts

3. **Create `src/lib/utils/reviews/ndk-contract-adapter.ts`**

   - Adapt `NDKPaymentContract` to `IContractForReview`

4. **Create `src/lib/utils/reviews/queries.ts`**
   - Version-agnostic query functions

### Phase 2: Svelte 5 Review Components (Priority: HIGH)

5. **Rewrite `ReviewPromptModal.svelte` in Svelte 5**

   - Use `$props()`, `$state()`, `$derived()`, `$effect()`
   - Accept `IContractForReview` instead of v1-specific types

6. **Create `src/lib/stores/reviews.svelte.ts`**
   - Runes-based review state management

### Phase 3: NDK Component Integration (Priority: HIGH)

7. **Integrate into `ContractCardNDK.svelte`**

   - Add review badge using adapter
   - Connect to `ReviewPromptModal`

8. **Integrate into `ContractActionsNDK.svelte`**

   - Add "Write Review" button

9. **Extend `ContractDrawerNDK.svelte`**

   - Add review section

10. **Extend `DashboardContractsPanelNDK.svelte`**
    - Show pending review badges

### Phase 4: Cleanup (Priority: LOW)

11. **Deprecate v1 components**
    - Mark `ContractCard.svelte`, `ContractActions.svelte` as deprecated
    - Plan migration to NDK versions

---

## Files Requiring Changes

### New Files to Create

| File                                            | Purpose                             |
| ----------------------------------------------- | ----------------------------------- |
| `src/lib/utils/reviews/contract-interface.ts`   | Version-agnostic contract interface |
| `src/lib/utils/reviews/status-mapper.ts`        | Status to reviewable mapping        |
| `src/lib/utils/reviews/ndk-contract-adapter.ts` | NDK to IContractForReview adapter   |
| `src/lib/utils/reviews/queries.ts`              | Version-agnostic review queries     |
| `src/lib/stores/reviews.svelte.ts`              | Svelte 5 runes-based store          |

### Files to Modify

| File                                                             | Change                                |
| ---------------------------------------------------------------- | ------------------------------------- |
| `src/lib/components/reviews/ReviewPromptModal.svelte`            | Svelte 5 rewrite + IContractForReview |
| `src/lib/components/reviews/VerifiedReviewForm.svelte`           | Svelte 5 rewrite                      |
| `src/lib/components/contracts/ContractCardNDK.svelte`            | Add review integration                |
| `src/lib/components/contracts/ContractActionsNDK.svelte`         | Add review button                     |
| `src/lib/components/contracts/ContractDrawerNDK.svelte`          | Add review section                    |
| `src/lib/components/contracts/DashboardContractsPanelNDK.svelte` | Add review badges                     |

---

## Key Design Principles

1. **Version-Agnostic**: Reviews work with ANY contract version through `IContractForReview`
2. **Svelte 5 Runes**: Use `$props()`, `$state()`, `$derived()`, `$effect()` throughout
3. **Adapter Pattern**: Each contract version has an adapter, not versioned code
4. **Interface over Implementation**: Depend on abstractions, not concrete types

---

## References

- Existing docs: `docs/review-system-implementation-status.md`
- Integration guide: `docs/reviews-integration-guide.md`
- NDK architecture: `src/lib/runes/contractRune.svelte.ts`
- v2 contract utils: `src/lib/utils/contract/v2/`
- Svelte 5 docs: Use `list-sections` + `get-documentation` from MCP server
