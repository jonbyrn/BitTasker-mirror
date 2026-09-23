# BitTasker Review System - Flow Documentation

**Last Updated:** Today  
**Status:** Core System 100% Complete, Integration 75% Complete

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Zero Knowledge Proof (ZKP) Architecture](#zero-knowledge-proof-zkp-architecture)
3. [Complete End-to-End Flow](#complete-end-to-end-flow)
4. [Component Architecture](#component-architecture)
5. [Data Flow Diagrams](#data-flow-diagrams)
6. [Component Details](#component-details)

---

## System Overview

The BitTasker Verified Review System provides a **privacy-preserving, blockchain-verified review mechanism** that links reviews to completed escrow contracts through cryptographic commitments and Merkle proofs. This ensures reviews are:

- ✅ **Authentic**: Only users who completed escrows can review
- ✅ **Verifiable**: Anyone can verify reviews cryptographically
- ✅ **Privacy-Preserving**: Escrow details remain private
- ✅ **Resistant to Gaming**: Cannot create fake reviews without completed escrows
- ✅ **Bidirectional**: Both Tasker (client) and Taskee (freelancer) can review each other independently

### Key Technologies

- **Merkle Trees**: Cryptographic data structure for efficient proof generation
- **Cryptographic Commitments**: Hash-based commitments that hide escrow details
- **Nostr Protocol**: Decentralized social network for review storage
- **Blockchain Integration**: RGB (RGB) for escrow verification

### Bidirectional Review System

When a task is marked as complete, **both parties can review each other independently**:

```
┌─────────────────────────────────────────────────────────────┐
│              TASK COMPLETION SCENARIO                        │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  Task Completed (Escrow Status: Completed)                   │
│                                                               │
│  ┌──────────────────────┐      ┌──────────────────────┐    │
│  │   Tasker (Client)    │      │   Taskee (Freelancer)│    │
│  │   Pubkey: npub1...    │      │   Pubkey: npub2...   │    │
│  └──────────┬───────────┘      └──────────┬───────────┘    │
│             │                              │                 │
│             │  Can Review Taskee           │                 │
│             │  (Reviewee: npub2...)        │                 │
│             │                              │                 │
│             │                              │  Can Review Tasker│
│             │                              │  (Reviewee: npub1...)│
│             │                              │                 │
│             ▼                              ▼                 │
│  ┌──────────────────────┐      ┌──────────────────────┐    │
│  │  Review Button       │      │  Review Button       │    │
│  │  Shows in UI         │      │  Shows in UI         │    │
│  └──────────────────────┘      └──────────────────────┘    │
│                                                               │
│  Each party can:                                              │
│  • Review the other party independently                       │
│  • Submit their review at any time                            │
│  • See their own "Given Reviews" (reviews they wrote)         │
│  • See their own "Received Reviews" (reviews about them)      │
│  • See "Pending Reviews" (contracts they need to review)      │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

**Key Points:**
- ✅ **Independent Reviews**: Tasker and Taskee can review each other separately
- ✅ **No Dependency**: One party's review doesn't block the other's review
- ✅ **Separate Lists**: Each user sees different review lists based on their role
- ✅ **Same Escrow, Different Perspectives**: Both reviews reference the same escrow but are independent events

### Review Lists - Different for Each User

Each user sees **three different review lists**:

#### 1. Received Reviews (Reviews About Me)
- **Filter**: Reviews where current user is the **reviewee** (being reviewed)
- **Query**: `getReviewsForUser(userPubkey)` - Filters by `#p` tag
- **Shows**: Reviews written by others about the current user
- **Use Case**: See what others think about your work

#### 2. Given Reviews (Reviews I Wrote)
- **Filter**: Reviews where current user is the **reviewer** (writing the review)
- **Query**: `getReviewsByReviewer(userPubkey)` - Filters by `authors` field
- **Shows**: Reviews the current user wrote about others
- **Use Case**: Track reviews you've submitted

#### 3. Pending Reviews (Contracts I Need to Review)
- **Filter**: Completed contracts where current user hasn't reviewed yet
- **Query**: `findPendingReviews()` - Checks if user reviewed each escrow
- **Shows**: Contracts that need reviews from the current user
- **Use Case**: Reminder to review completed work

**Example Scenario:**

```
Task Completed: Escrow #123
├─ Tasker (Client): npub1...
│  ├─ Received Reviews: [Review from Taskee about Tasker]
│  ├─ Given Reviews: [Review from Tasker about Taskee]
│  └─ Pending Reviews: [Escrow #123] (if not reviewed yet)
│
└─ Taskee (Freelancer): npub2...
   ├─ Received Reviews: [Review from Tasker about Taskee]
   ├─ Given Reviews: [Review from Taskee about Tasker]
   └─ Pending Reviews: [Escrow #123] (if not reviewed yet)
```

**Important Notes:**
- Each user's "Received Reviews" and "Given Reviews" are **completely different lists**
- Tasker's "Given Reviews" = Taskee's "Received Reviews" (same review, different perspective)
- Taskee's "Given Reviews" = Tasker's "Received Reviews" (same review, different perspective)
- Both users see the same "Pending Reviews" for the same escrow (until they review)

### Code Implementation: Bidirectional Reviews

**Finding Pending Reviews (Who to Review):**
```typescript
// Location: src/lib/utils/review-helpers.ts

export async function findPendingReviews(): Promise<PendingReview[]> {
  const currentUserPubkey = await getNpub();
  const contracts = await getUserContracts();
  
  // Filter to completed contracts
  const completedContracts = contracts.filter(contract => {
    return contract.contract.status === 'completed' || 
           contract.contract.status === 'resolved';
  });

  const pending: PendingReview[] = [];
  
  for (const contract of completedContracts) {
    // Check if user has already reviewed this escrow
    const escrowReviews = await getReviewsForEscrow(contract.contract.escrowId);
    const userReviewed = escrowReviews.some(r => r.reviewerPubkey === currentUserPubkey);
    
    if (!userReviewed) {
      // Determine who the reviewee is (the other party)
      const isClient = contract.contract.clientPubkey === currentUserPubkey;
      const revieweePubkey = isClient 
        ? contract.contract.freelancerPubkey  // Client reviews Taskee
        : contract.contract.clientPubkey;     // Taskee reviews Client
      
      pending.push({
        contract,
        escrowId: contract.contract.escrowId,
        revieweePubkey,  // The other party to review
        completedAt: /* ... */,
        canReview: true
      });
    }
  }
  
  return pending;
}
```

**Getting Received Reviews (Reviews About Me):**
```typescript
// Location: src/lib/utils/nostr-review.ts

export async function getReviewsForUser(
  revieweePubkey: string,  // User being reviewed
  limit: number = 50
): Promise<NostrVerifiedReview[]> {
  const filter: Filter = {
    kinds: [KINDS.REVIEW_VERIFIED],
    '#p': [revieweePubkey],  // Filter by reviewee pubkey
    limit
  };
  
  // Query Nostr for reviews where user is the reviewee
  // Returns reviews written ABOUT the user
}
```

**Getting Given Reviews (Reviews I Wrote):**
```typescript
// Location: src/lib/utils/nostr-review.ts

export async function getReviewsByReviewer(
  reviewerPubkey: string,  // User who wrote the review
  limit: number = 50
): Promise<NostrVerifiedReview[]> {
  const filter: Filter = {
    kinds: [KINDS.REVIEW_VERIFIED],
    authors: [reviewerPubkey],  // Filter by reviewer pubkey
    limit
  };
  
  // Query Nostr for reviews where user is the reviewer
  // Returns reviews written BY the user
}
```

**Publishing a Review:**
```typescript
// Location: src/lib/utils/nostr-review.ts

export async function publishVerifiedReview(
  escrowId: string,
  revieweePubkey: string,  // Who is being reviewed
  content: ReviewContentWithRatings,
  escrowTxHash?: string
): Promise<string> {
  // Get reviewer pubkey (current user)
  const reviewerPubkey = await getNpub();
  
  // Create verified review
  const verifiedReview: VerifiedReview = {
    commitment,
    merkleProof,
    reviewerPubkey,  // Who wrote the review
    revieweePubkey,  // Who is being reviewed
    content: { /* ratings, comment */ },
    createdAt: Date.now()
  };
  
  // Publish to Nostr
  // This review will appear in:
  // - reviewerPubkey's "Given Reviews" list
  // - revieweePubkey's "Received Reviews" list
}
```

**Example: Tasker Reviews Taskee**
```typescript
// Tasker (npub1) reviews Taskee (npub2) for Escrow #123

await publishVerifiedReview(
  'escrow-123',
  'npub2...',  // Taskee is being reviewed
  {
    overallRating: 5,
    categoryRatings: { quality: 5, professionalism: 4, timeliness: 5 },
    comment: 'Great work!'
  }
);

// Result:
// - This review appears in Tasker's (npub1) "Given Reviews"
// - This review appears in Taskee's (npub2) "Received Reviews"
// - Both users can see this review, but in different lists
```

---

## Zero Knowledge Proof (ZKP) Architecture

### What is ZKP in This Context?

The review system uses a **Merkle tree-based zero-knowledge proof** mechanism that allows users to prove they completed an escrow contract **without revealing the specific escrow details** to the public.

### How ZKP Works in the Review System

#### 1. Commitment Creation (Privacy Layer)

When an escrow is completed, a **cryptographic commitment** is created:

```
┌─────────────────────────────────────────────────────────────┐
│              COMMITMENT CREATION PROCESS                     │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  Input Parameters:                                           │
│  • escrowId: "escrow-123"                                    │
│  • escrowTxHash: "0xabc..."                                  │
│  • taskerAddress: "0x111..."                                  │
│  • taskeeAddress: "0x222..."                                  │
│                                                               │
│  Process:                                                     │
│  1. Concatenate parameters:                                  │
│     "escrow-123|0xabc...|0x111...|0x222..."                  │
│                                                               │
│  2. Hash with SHA-256:                                       │
│     commitment = SHA256(concatenated_string)                  │
│                                                               │
│  Output:                                                      │
│  • commitment: "a1b2c3d4e5f6..." (64 hex chars)              │
│                                                               │
│  Properties:                                                  │
│  ✓ Deterministic: Same escrow = same commitment              │
│  ✓ Unique: Different escrows = different commitments          │
│  ✓ One-way: Cannot reverse to get escrow details             │
│  ✓ Privacy-preserving: Doesn't reveal escrow information     │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

**Code Implementation:**
```typescript
// Location: packages/merkle-review-sdk/src/core/commitment.ts

create(params: CommitmentParams): string {
  // Create deterministic string representation
  const data = [
    params.escrowId,
    params.escrowTxHash.toLowerCase(),
    params.taskerAddress.toLowerCase(),
    params.taskeeAddress.toLowerCase()
  ].join('|');

  // Hash the data (SHA-256 or Keccak-256)
  const hash = this.hash(data);
  
  // Return as hex string (64 characters = 32 bytes)
  return Buffer.from(hash).toString('hex');
}
```

#### 2. Merkle Tree Building (Proof Infrastructure)

All completed escrow commitments are organized into a **Merkle tree**:

```
┌─────────────────────────────────────────────────────────────┐
│              MERKLE TREE STRUCTURE                           │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│                    Root Hash (Public)                         │
│                         │                                     │
│            ┌────────────┴────────────┐                       │
│            │                         │                       │
│      Node Hash 1                Node Hash 2                    │
│            │                         │                       │
│    ┌───────┴───────┐         ┌───────┴───────┐             │
│    │               │         │               │             │
│  Leaf 1          Leaf 2    Leaf 3          Leaf 4           │
│ (Commit 1)    (Commit 2)  (Commit 3)    (Commit 4)         │
│                                                               │
│  Properties:                                                  │
│  • Root hash represents entire tree                           │
│  • Changing any leaf changes root                             │
│  • Can prove leaf exists without revealing others              │
│  • Efficient: O(log n) proof size                             │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

**Tree Building Process:**
1. Query blockchain for all completed escrows
2. Create commitment for each escrow
3. Build Merkle tree from commitments
4. Store tree root hash (public)
5. Store tree version and metadata

#### 3. Merkle Proof Generation (Zero-Knowledge Proof)

When a user wants to review, they request a **Merkle proof** for their commitment:

```
┌─────────────────────────────────────────────────────────────┐
│              MERKLE PROOF GENERATION                        │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  Input:                                                       │
│  • commitment: "a1b2c3d4..." (user's escrow commitment)     │
│  • merkleTree: Current tree with all commitments              │
│                                                               │
│  Process:                                                     │
│  1. Find commitment in tree (leaf node)                       │
│  2. Collect sibling hashes up to root                         │
│  3. Collect proof flags (left/right indicators)              │
│                                                               │
│  Output - Merkle Proof:                                       │
│  {                                                            │
│    leaf: "a1b2c3d4...",        // User's commitment          │
│    path: [                     // Sibling hashes            │
│      "sibling1_hash",                                        │
│      "sibling2_hash",                                        │
│      "sibling3_hash"                                         │
│    ],                                                         │
│    proofFlags: [true, false, true]  // Left/right indicators  │
│  }                                                            │
│                                                               │
│  What This Proves:                                            │
│  ✓ Commitment exists in the tree                              │
│  ✓ Without revealing other commitments                         │
│  ✓ Without revealing tree structure                            │
│  ✓ Can be verified against public root                         │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

**Proof Properties:**
- **Zero-Knowledge**: Doesn't reveal other commitments in the tree
- **Compact**: Only O(log n) size, not the entire tree
- **Verifiable**: Anyone can verify against the public root
- **Tamper-Proof**: Cannot fake a proof without the actual commitment

#### 4. Review Verification (Public Verification)

Anyone can verify a review by checking the Merkle proof:

```
┌─────────────────────────────────────────────────────────────┐
│              REVIEW VERIFICATION PROCESS                      │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  Input:                                                       │
│  • review.commitment: "a1b2c3d4..."                          │
│  • review.merkleProof: { leaf, path, proofFlags }            │
│  • publishedRoot: "root_hash_from_tree"                      │
│                                                               │
│  Verification Steps:                                          │
│                                                               │
│  1. Validate commitment format                                │
│     ✓ Must be 64 hex characters                               │
│     ✓ Must match proof.leaf                                   │
│                                                               │
│  2. Reconstruct root from proof                                │
│     • Start with commitment (leaf)                             │
│     • Hash with siblings using proofFlags                      │
│     • Work up to root                                          │
│                                                               │
│  3. Compare computed root with published root                 │
│     ✓ Match = Valid proof                                      │
│     ✗ Mismatch = Invalid proof                                │
│                                                               │
│  4. Check escrow completion status                             │
│     ✓ Escrow must be completed on blockchain                   │
│                                                               │
│  Output:                                                      │
│  {                                                            │
│    valid: true/false,                                         │
│    details: {                                                 │
│      commitmentExists: true,                                  │
│      proofValid: true,                                        │
│      rootMatches: true                                        │
│    }                                                          │
│  }                                                            │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

**Verification Code:**
```typescript
// Location: packages/merkle-review-sdk/src/verifiers/review-verifier.ts

verify(review: VerifiedReview, expectedRoot: string): VerificationResult {
  // 1. Validate commitment format
  if (!this.isValidHex(review.commitment, 64)) {
    return { valid: false, error: 'Invalid commitment format' };
  }

  // 2. Check leaf matches commitment
  if (review.merkleProof.leaf !== review.commitment) {
    return { valid: false, error: 'Proof leaf does not match commitment' };
  }

  // 3. Reconstruct root from proof
  const computedRoot = this.verifyProof(review.merkleProof);

  // 4. Compare with expected root
  const rootMatches = computedRoot === expectedRoot;
  
  return {
    valid: rootMatches,
    details: {
      commitmentExists: true,
      proofValid: rootMatches,
      rootMatches
    }
  };
}
```

### Privacy Guarantees

#### What's Public (Visible to Everyone)
- ✅ Review content (ratings, comments)
- ✅ Reviewer and reviewee pubkeys
- ✅ Merkle proof
- ✅ Tree root hash
- ✅ Tree version

#### What's Private (Hidden from Public)
- 🔒 Individual escrow IDs
- 🔒 Escrow transaction hashes
- 🔒 Tasker/Taskee blockchain addresses
- 🔒 Other commitments in the tree
- 🔒 Internal tree structure
- 🔒 Escrow amounts and details

### Security Features

1. **Anti-Gaming Mechanisms**
   - Only completed escrows can be reviewed
   - Commitment is deterministic (can't fake it)
   - Proof must match published tree root
   - Blockchain verification required

2. **Privacy Protection**
   - Commitments are one-way hashes
   - Cannot reverse to get escrow details
   - Proofs don't reveal other commitments
   - Selective disclosure (only your commitment)

3. **Tamper Resistance**
   - Changing any commitment changes root
   - Root is publicly published
   - Invalid proofs are easily detected
   - Blockchain provides immutable record

---

## Complete End-to-End Flow

### Flow 0: Bidirectional Review Scenario

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    TASK COMPLETED (Escrow #123)                          │
│  Status: Completed                                                       │
│  Tasker: npub1... (Client)                                               │
│  Taskee: npub2... (Freelancer)                                           │
└────────────────────────────┬────────────────────────────────────────────┘
                              │
                    ┌─────────┴─────────┐
                    │                   │
                    ▼                   ▼
         ┌──────────────────┐  ┌──────────────────┐
         │   TASKER VIEW    │  │   TASKEE VIEW    │
         └────────┬──────────┘  └────────┬──────────┘
                  │                      │
                  ▼                      ▼
┌─────────────────────────────────────────────────────────────────────────┐
│              REVIEW PROMPT APPEARS FOR BOTH                             │
│  • Both see "Review Now" button                                          │
│  • Each can review independently                                        │
│  • No dependency between reviews                                        │
└────────────────────────────┬────────────────────────────────────────────┘
                              │
                    ┌─────────┴─────────┐
                    │                   │
                    ▼                   ▼
         ┌──────────────────┐  ┌──────────────────┐
         │  TASKER REVIEWS │  │  TASKEE REVIEWS  │
         │  Taskee (npub2)  │  │  Tasker (npub1)  │
         └────────┬──────────┘  └────────┬──────────┘
                  │                      │
                  ▼                      ▼
┌─────────────────────────────────────────────────────────────────────────┐
│              BOTH REVIEWS PUBLISHED TO NOSTR                            │
│                                                                          │
│  Review 1:                                                              │
│  • Reviewer: npub1... (Tasker)                                         │
│  • Reviewee: npub2... (Taskee)                                         │
│  • Escrow: #123                                                         │
│  • Commitment: "a1b2c3..."                                              │
│                                                                          │
│  Review 2:                                                              │
│  • Reviewer: npub2... (Taskee)                                        │
│  • Reviewee: npub1... (Tasker)                                         │
│  • Escrow: #123                                                         │
│  • Commitment: "a1b2c3..." (SAME - same escrow)                        │
│                                                                          │
└────────────────────────────┬────────────────────────────────────────────┘
                              │
                    ┌─────────┴─────────┐
                    │                   │
                    ▼                   ▼
         ┌──────────────────┐  ┌──────────────────┐
         │   TASKER VIEWS   │  │   TASKEE VIEWS   │
         └────────┬──────────┘  └────────┬──────────┘
                  │                      │
                  ▼                      ▼
┌─────────────────────────────────────────────────────────────────────────┐
│              DIFFERENT REVIEW LISTS FOR EACH USER                      │
│                                                                          │
│  Tasker's Lists:                                                        │
│  • Received Reviews: [Review from Taskee] ← Taskee's Given Review      │
│  • Given Reviews: [Review about Taskee] ← Tasker's Review             │
│  • Pending Reviews: [] (empty - already reviewed)                      │
│                                                                          │
│  Taskee's Lists:                                                        │
│  • Received Reviews: [Review from Tasker] ← Tasker's Given Review      │
│  • Given Reviews: [Review about Tasker] ← Taskee's Review             │
│  • Pending Reviews: [] (empty - already reviewed)                      │
│                                                                          │
│  Key Insight:                                                           │
│  • Same review appears in different lists for each user                │
│  • Tasker's "Given Review" = Taskee's "Received Review"                │
│  • Taskee's "Given Review" = Tasker's "Received Review"                │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### Flow 1: Review Submission (Complete Journey)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    ESCROW COMPLETION EVENT                              │
│  Triggers: TaskCompleted, TaskAccepted, ProposalAccepted, Timelock      │
│  Location: src/lib/utils/wallet/escrowEvents.ts                         │
└────────────────────────────┬────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│              AUTOMATIC MERKLE TREE UPDATE (Background)                  │
│  • Non-blocking operation                                               │
│  • Queued for processing                                                │
│  • Retry logic with exponential backoff                                │
│  • Location: src/lib/utils/wallet/treeUpdateHelper.ts                   │
│                                                                          │
│  Process:                                                               │
│  1. Query blockchain for all completed escrows                          │
│  2. Create commitments for each escrow                                  │
│  3. Build Merkle tree from commitments                                 │
│  4. Store tree data (version, root, commitments)                        │
│  5. Update status in ReviewStatusStore                                 │
└────────────────────────────┬────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    REVIEW PROMPT MODAL                                  │
│  Component: ReviewPromptModal.svelte                                    │
│  Location: src/lib/components/reviews/ReviewPromptModal.svelte          │
│                                                                          │
│  Features:                                                               │
│  • Drawer-style modal (slides from right)                               │
│  • Shows reviewee information (name, avatar)                           │
│  • "Review Now" or "Maybe Later" options                                │
│  • Auto-fetches reviewee name from Nostr profile                        │
│  • Validates escrow completion status                                   │
└────────────────────────────┬────────────────────────────────────────────┘
                              │
                    ┌─────────┴─────────┐
                    │                   │
                    ▼                   ▼
         ┌──────────────────┐  ┌──────────────────┐
         │   Review Now      │  │  Maybe Later     │
         │   (User clicks)   │  │  (Modal closes)   │
         └────────┬──────────┘  └──────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                  VERIFIED REVIEW FORM                                   │
│  Component: VerifiedReviewForm.svelte                                   │
│  Location: src/lib/components/reviews/VerifiedReviewForm.svelte         │
│                                                                          │
│  Form Fields:                                                           │
│  • Overall Rating: 1-5 stars (required)                                │
│  • Quality Rating: 1-5 stars (required)                                │
│  • Professionalism Rating: 1-5 stars (required)                       │
│  • Timeliness Rating: 1-5 stars (required)                             │
│  • Comment: Optional text (max 1000 chars)                             │
│  • Photos: Future feature (not yet implemented)                        │
│                                                                          │
│  Validation:                                                            │
│  • All ratings required                                                 │
│  • Comment max 1000 characters                                          │
│  • Check if already reviewed                                            │
└────────────────────────────┬────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│              CREATE CRYPTOGRAPHIC COMMITMENT                            │
│  Service: review-verification.service.ts                               │
│  SDK: MerkleReviewSDK.createCommitment()                                │
│                                                                          │
│  Input:                                                                 │
│  • escrowId: "escrow-123"                                               │
│  • escrowTxHash: "0xabc..."                                             │
│  • taskerAddress: "0x111..." (client address)                          │
│  • taskeeAddress: "0x222..." (freelancer address)                      │
│                                                                          │
│  Process:                                                               │
│  1. Concatenate parameters: "escrow-123|0xabc...|0x111...|0x222..."     │
│  2. Hash with SHA-256: commitment = SHA256(data)                        │
│  3. Return 64-character hex string                                      │
│                                                                          │
│  Output:                                                                │
│  • commitment: "a1b2c3d4e5f6..." (64 hex chars)                        │
└────────────────────────────┬────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│              GET MERKLE PROOF                                           │
│  Service: review-verification.service.ts                                │
│  SDK: MerkleReviewSDK.getProof()                                        │
│                                                                          │
│  Process:                                                               │
│  1. Retrieve latest Merkle tree from storage                            │
│  2. Find commitment in tree (leaf node)                                 │
│  3. Generate proof path (sibling hashes + flags)                        │
│  4. Return Merkle proof object                                         │
│                                                                          │
│  Output:                                                                │
│  {                                                                      │
│    leaf: "a1b2c3d4...",        // User's commitment                     │
│    path: ["sibling1", ...],   // Sibling hashes                        │
│    proofFlags: [true, false]   // Left/right indicators                 │
│  }                                                                      │
└────────────────────────────┬────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│              PUBLISH TO NOSTR                                           │
│  Utility: nostr-review.ts                                                │
│  Function: publishVerifiedReview()                                      │
│                                                                          │
│  Nostr Event (KIND 31004):                                              │
│  {                                                                      │
│    kind: 31004,                                                         │
│    pubkey: reviewerPubkey,                                             │
│    content: JSON.stringify({                                            │
│      commitment: "a1b2c3d4...",                                         │
│      merkleProof: { leaf, path, proofFlags },                          │
│      escrowId: "escrow-123",                                            │
│      revieweePubkey: "npub1...",                                        │
│      content: {                                                         │
│        overallRating: 5,                                               │
│        categoryRatings: { quality: 5, professionalism: 4, ... },       │
│        comment: "Great work!"                                           │
│      },                                                                 │
│      createdAt: 1234567890                                             │
│    }),                                                                  │
│    tags: [                                                               │
│      ["p", revieweePubkey],  // Reviewee pubkey                        │
│      ["e", escrowId]         // Escrow ID                              │
│    ],                                                                   │
│    created_at: timestamp,                                               │
│    sig: signature                                                       │
│  }                                                                      │
│                                                                          │
│  Process:                                                               │
│  1. Create Nostr event with review data                                │
│  2. Sign event with reviewer's private key                              │
│  3. Publish to Nostr relays                                           │
│  4. Return event ID                                                     │
└────────────────────────────┬────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    SUCCESS FEEDBACK                                     │
│  • Show success message                                                  │
│  • Update review lists                                                  │
│  • Close modal                                                           │
│  • Refresh pending reviews count                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Flow 2: Review Display & Verification

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    USER VIEWS PROFILE/TASK                               │
│  Locations:                                                               │
│  • /dashboard/reviews (Review Management Page)                          │
│  • /profile/[pubkey] (User Profile)                                    │
│  • /dashboard/task/[taskId] (Task Details - Future)                     │
└────────────────────────────┬────────────────────────────────────────────┘
                              │
                    ┌─────────┴─────────┐
                    │                   │
                    ▼                   ▼
         ┌──────────────────┐  ┌──────────────────┐
         │  RECEIVED REVIEWS│  │   GIVEN REVIEWS  │
         │  (About Me)      │  │   (I Wrote)      │
         └────────┬──────────┘  └────────┬──────────┘
                  │                      │
                  ▼                      ▼
┌─────────────────────────────────────────────────────────────────────────┐
│              RETRIEVE REVIEWS FROM NOSTR                                 │
│                                                                          │
│  For Received Reviews:                                                   │
│  • Utility: nostr-review.ts                                             │
│  • Function: getReviewsForUser(userPubkey)                              │
│  • Filter: '#p' tag = userPubkey (user is reviewee)                     │
│  • Shows: Reviews written ABOUT the current user                        │
│                                                                          │
│  For Given Reviews:                                                     │
│  • Utility: nostr-review.ts                                             │
│  • Function: getReviewsByReviewer(userPubkey)                           │
│  • Filter: 'authors' = userPubkey (user is reviewer)                    │
│  • Shows: Reviews written BY the current user                           │
│                                                                          │
│  Process:                                                               │
│  1. Query Nostr relays for KIND 31004 events                           │
│  2. Apply appropriate filter (reviewee or reviewer)                    │
│  3. Parse event content                                                │
│  4. Sort by date (newest first)                                         │
│                                                                          │
│  Output:                                                                │
│  • Array of NostrVerifiedReview objects                                 │
│  • Different arrays for received vs given reviews                       │
└────────────────────────────┬────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│              VERIFY EACH REVIEW                                          │
│  Utility: nostr-review.ts                                               │
│  Function: verifyNostrReview()                                          │
│  SDK: ReviewVerifier.verify()                                            │
│                                                                          │
│  Verification Steps:                                                    │
│  1. Validate commitment format (64 hex chars)                          │
│  2. Validate proof structure                                            │
│  3. Check leaf matches commitment                                        │
│  4. Reconstruct root from proof                                         │
│  5. Compare with published tree root                                     │
│  6. Check escrow completion status                                      │
│                                                                          │
│  Output:                                                                │
│  • isVerified: true/false                                               │
│  • verificationDetails: { commitmentExists, proofValid, rootMatches }   │
└────────────────────────────┬────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│              DISPLAY REVIEWS                                            │
│  Component: VerifiedReviewCard.svelte                                    │
│  Component: ReviewList.svelte                                            │
│                                                                          │
│  Display Features:                                                      │
│  • Verified badge (green checkmark) or Unverified badge (red)           │
│  • Overall rating (stars + number)                                      │
│  • Category ratings (Quality, Professionalism, Timeliness)             │
│  • Comment (with auto-translation support)                               │
│  • Timestamp (relative time, e.g., "2 days ago")                        │
│  • Reply button (if onReply prop provided)                             │
│  • Photos gallery (if photos included)                                  │
│                                                                          │
│  Aggregation:                                                            │
│  • Average rating calculation                                            │
│  • Total review count                                                    │
│  • Rating distribution (1-5 stars)                                      │
│  • Category averages                                                     │
└─────────────────────────────────────────────────────────────────────────┘
```

### Flow 3: Merkle Tree Update Process

```
┌─────────────────────────────────────────────────────────────────────────┐
│              ESCROW COMPLETION EVENT                                     │
│  Events: TaskCompleted, TaskAccepted, ProposalAccepted, Timelock         │
│  Location: src/lib/utils/wallet/escrowEvents.ts                         │
└────────────────────────────┬────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│              QUEUE TREE UPDATE                                          │
│  Helper: treeUpdateHelper.ts                                             │
│  Function: queueTreeUpdate()                                            │
│                                                                          │
│  Process:                                                               │
│  1. Add update to queue (non-blocking)                                 │
│  2. Increment pending count in ReviewStatusStore                        │
│  3. Log context (which event triggered)                                 │
│  4. Trigger background update if not already running                    │
└────────────────────────────┬────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│              CHECK IF ALREADY UPDATING                                  │
│  • Prevent concurrent updates                                           │
│  • Wait if update in progress                                           │
│  • Use lock mechanism                                                   │
└────────────────────────────┬────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│              BUILD MERKLE TREE                                           │
│  Service: review-verification.service.ts                                │
│  SDK: MerkleReviewSDK.buildTree()                                       │
│                                                                          │
│  Process:                                                               │
│  1. Query blockchain for all completed escrows                        │
│     • From block 0 to latest                                            │
│     • Filter by Completed or DisputeResolved status                     │
│                                                                          │
│  2. Create commitments for each escrow                                  │
│     • For each escrow: createCommitment({ escrowId, txHash, ... })      │
│                                                                          │
│  3. Build Merkle tree from commitments                                  │
│     • Organize commitments into binary tree                             │
│     • Calculate parent hashes (hash(left + right))                      │
│     • Continue up to root                                               │
│                                                                          │
│  4. Store tree data                                                     │
│     • Version: increment from previous                                  │
│     • Root: root hash of tree                                           │
│     • Commitments: array of all commitments                             │
│     • Timestamp: current time                                           │
│                                                                          │
│  5. Store in IndexedDB (local storage)                                  │
│     • Key: "merkle-tree-latest"                                         │
│     • Value: { version, root, commitments, timestamp }                  │
└────────────────────────────┬────────────────────────────────────────────┘
                              │
                    ┌─────────┴─────────┐
                    │                   │
                    ▼                   ▼
         ┌──────────────────┐  ┌──────────────────┐
         │     SUCCESS      │  │      ERROR        │
         └────────┬─────────┘  └────────┬─────────┘
                  │                     │
                  │                     ▼
                  │         ┌──────────────────────────┐
                  │         │   RETRY WITH BACKOFF      │
                  │         │  • Max 3 attempts         │
                  │         │  • Exponential backoff   │
                  │         │  • 1s → 2s → 4s → 30s    │
                  │         └────────┬────────────────────┘
                  │                │
                  │         ┌──────┴──────┐
                  │         │             │
                  │         ▼             ▼
                  │  ┌──────────┐    ┌──────────────┐
                  │  │ SUCCESS │    │ MAX RETRIES  │
                  │  └────┬────┘    └──────┬───────┘
                  │       │                │
                  │       │                ▼
                  │       │         ┌──────────────────┐
                  │       │         │  QUEUE FOR RETRY  │
                  │       │         │  (Background      │
                  │       │         │   monitor)        │
                  │       │         └──────────────────┘
                  │       │
                  ▼       ▼
┌─────────────────────────────────────────────────────────────────────────┐
│              UPDATE STATUS                                              │
│  Store: review.store.ts                                                 │
│                                                                          │
│  Updates:                                                               │
│  • Mark update complete                                                 │
│  • Store version and root                                               │
│  • Dequeue update                                                       │
│  • Decrement pending count                                              │
│  • Log success                                                          │
│  • Clear error state                                                     │
└─────────────────────────────────────────────────────────────────────────┘
```

### Flow 4: Review Management Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│              USER NAVIGATES TO REVIEWS                                   │
│  Route: /dashboard/reviews                                              │
│  Component: src/routes/(protected)/dashboard/reviews/+page.svelte       │
└────────────────────────────┬────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│              LOAD REVIEW DATA                                            │
│                                                                          │
│  Data Sources:                                                          │
│  1. Get current user's pubkey (from Nostr keys)                        │
│  2. Query Nostr for received reviews (filter by reviewee = user)      │
│  3. Query Nostr for given reviews (filter by reviewer = user)          │
│  4. Find pending reviews (completed contracts without reviews)          │
│     • Get user contracts                                                │
│     • Filter to completed/resolved contracts                            │
│     • Check if user has reviewed each escrow                           │
│     • Return contracts without reviews                                  │
└────────────────────────────┬────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│              DISPLAY TABS                                                │
│  Component: ReviewManagementTabs.svelte                                  │
│                                                                          │
│  Tabs:                                                                  │
│  • Received Reviews (with count badge)                                  │
│  • Given Reviews (with count badge) - only if current user              │
│  • Pending Reviews (with count badge) - only if current user            │
└────────────────────────────┬────────────────────────────────────────────┘
                              │
                    ┌─────────┴─────────┐
                    │                   │
                    ▼                   ▼
         ┌──────────────────┐  ┌──────────────────┐
         │  Received/Given  │  │     Pending      │
         └────────┬─────────┘  └────────┬─────────┘
                  │                     │
                  ▼                     ▼
         ┌──────────────────┐  ┌──────────────────┐
         │  Review List     │  │ Pending List     │
         │  Component:       │  │ Component:        │
         │  ReviewList.svelte│  │ PendingReviewsList│
         │                   │  │ .svelte           │
         │  Features:        │  │                   │
         │  • Verified       │  │ Features:         │
         │  • Unverified     │  │ • Contract cards  │
         │  • Statistics     │  │ • "Review Now"    │
         │  • Filtering     │  │ • Completed date  │
         │  • Sorting        │  │ • Reviewee info   │
         └──────────────────┘  └────────┬──────────┘
                                         │
                                         ▼
                              ┌──────────────────┐
                              │  Review Prompt   │
                              │  Modal Opens     │
                              │  (ReviewPromptModal)│
                              └──────────────────┘
```

---

## Component Architecture

### Component Hierarchy

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    REVIEW SYSTEM COMPONENTS                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  Pages:                                                                    │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ /dashboard/reviews/+page.svelte                                 │   │
│  │ • Main review management page                                    │   │
│  │ • Uses: ReviewManagementTabs, ReviewList, PendingReviewsList    │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                           │
│  Core Components:                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ ReviewPromptModal.svelte                                        │   │
│  │ • Drawer-style modal for review prompt                          │   │
│  │ • Wraps: VerifiedReviewForm                                      │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                           │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ VerifiedReviewForm.svelte                                       │   │
│  │ • Review submission form                                        │   │
│  │ • Rating inputs (overall, quality, professionalism, timeliness) │   │
│  │ • Comment field                                                 │   │
│  │ • Submit/Cancel buttons                                         │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                           │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ VerifiedReviewCard.svelte                                       │   │
│  │ • Individual review display                                     │   │
│  │ • Ratings, comment, timestamp                                    │   │
│  │ • Verification badge                                            │   │
│  │ • Reply button (optional)                                       │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                           │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ ReviewList.svelte                                               │   │
│  │ • List of reviews                                               │   │
│  │ • Uses: VerifiedReviewCard (multiple)                           │   │
│  │ • Filtering, sorting, pagination                                │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                           │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ PendingReviewsList.svelte                                       │   │
│  │ • List of contracts needing reviews                             │   │
│  │ • "Review Now" buttons                                          │   │
│  │ • Opens: ReviewPromptModal                                       │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                           │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ ReviewManagementTabs.svelte                                    │   │
│  │ • Tab navigation (Received, Given, Pending)                     │   │
│  │ • Count badges                                                  │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                           │
│  Supporting Components:                                                  │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ UserRatingDisplay.svelte                                       │   │
│  │ • Compact rating display (stars + average)                     │   │
│  │ • Used in profiles, cards, etc.                                │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                           │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ ReviewSummaryCard.svelte                                        │   │
│  │ • Review statistics (average, distribution, etc.)                 │   │
│  │ • Used in profiles                                              │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                           │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ ProfileReviewsSection.svelte                                     │   │
│  │ • Reviews tab in user profile                                   │   │
│  │ • Uses: ReviewSummaryCard, ReviewList                           │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                           │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Component Details

### 1. ReviewPromptModal.svelte

**Location:** `src/lib/components/reviews/ReviewPromptModal.svelte`

**Purpose:** Drawer-style modal that prompts user to review after escrow completion

**Props:**
```typescript
{
  isOpen: boolean;              // Modal visibility
  escrowId?: string;            // Escrow ID (required for review)
  revieweePubkey?: string;      // Reviewee's Nostr pubkey
  revieweeName?: string;        // Reviewee's display name
  escrowTxHash?: string;        // Escrow transaction hash
  onClose: () => void;          // Close handler
  onSubmit?: (eventId: string) => void;  // Submit handler
}
```

**Features:**
- ✅ Drawer-style UI (slides from right)
- ✅ Auto-fetches reviewee name from Nostr profile
- ✅ Validates escrow completion status
- ✅ Shows loading state while fetching data
- ✅ Error handling with user-friendly messages
- ✅ Wraps VerifiedReviewForm component

**Content Box:**
```
┌─────────────────────────────────────────────────────────┐
│  ReviewPromptModal                                      │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  [Drawer Header]                                         │
│  ┌──────────────────────────────────────────────────┐ │
│  │  [X] Close                                        │ │
│  └──────────────────────────────────────────────────┘ │
│                                                          │
│  [Reviewee Info Section]                                │
│  ┌──────────────────────────────────────────────────┐ │
│  │  [Avatar]  Reviewing                              │ │
│  │            John Doe                                │ │
│  └──────────────────────────────────────────────────┘ │
│                                                          │
│  [VerifiedReviewForm Component]                         │
│  ┌──────────────────────────────────────────────────┐ │
│  │  Overall Rating: [★★★★★]                         │ │
│  │  Quality: [★★★★★]                                │ │
│  │  Professionalism: [★★★★★]                        │ │
│  │  Timeliness: [★★★★★]                             │ │
│  │  Comment: [Text area, 1000 chars max]             │ │
│  │                                                    │ │
│  │  [Cancel]  [Submit Review]                        │ │
│  └──────────────────────────────────────────────────┘ │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

### 2. VerifiedReviewForm.svelte

**Location:** `src/lib/components/reviews/VerifiedReviewForm.svelte`

**Purpose:** Form for submitting verified reviews with ratings and comments

**Props:**
```typescript
{
  escrowId: string;            // Required: Escrow ID
  revieweePubkey: string;      // Required: Reviewee's pubkey
  escrowTxHash?: string;      // Optional: Escrow transaction hash
  onSubmit?: (eventId: string) => void;  // Submit callback
  onCancel?: () => void;        // Cancel callback
}
```

**State:**
```typescript
{
  overallRating: number;        // 0-5
  qualityRating: number;        // 0-5
  professionalismRating: number; // 0-5
  timelinessRating: number;     // 0-5
  comment: string;              // Max 1000 chars
  photos: string[];             // Future: photo URLs
  isSubmitting: boolean;        // Loading state
  errors: Record<string, string>; // Validation errors
  alreadyReviewed: boolean;     // Check if already reviewed
}
```

**Features:**
- ✅ 5-star rating system (4 categories)
- ✅ Comment field with character counter
- ✅ Form validation
- ✅ Already reviewed check
- ✅ Loading states
- ✅ Error handling
- ✅ Creates commitment and Merkle proof
- ✅ Publishes to Nostr

**Content Box:**
```
┌─────────────────────────────────────────────────────────┐
│  VerifiedReviewForm                                     │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  Overall Rating *                                       │
│  ┌──────────────────────────────────────────────────┐ │
│  │  [★] [★] [★] [★] [★]  (Click to rate)            │ │
│  └──────────────────────────────────────────────────┘ │
│                                                          │
│  Quality *                                              │
│  ┌──────────────────────────────────────────────────┐ │
│  │  [★] [★] [★] [★] [★]  (Click to rate)            │ │
│  └──────────────────────────────────────────────────┘ │
│                                                          │
│  Professionalism *                                      │
│  ┌──────────────────────────────────────────────────┐ │
│  │  [★] [★] [★] [★] [★]  (Click to rate)            │ │
│  └──────────────────────────────────────────────────┘ │
│                                                          │
│  Timeliness *                                           │
│  ┌──────────────────────────────────────────────────┐ │
│  │  [★] [★] [★] [★] [★]  (Click to rate)            │ │
│  └──────────────────────────────────────────────────┘ │
│                                                          │
│  Comment (Optional)                                     │
│  ┌──────────────────────────────────────────────────┐ │
│  │  [Text area - 1000 chars max]                     │ │
│  │  Characters: 0/1000                               │ │
│  └──────────────────────────────────────────────────┘ │
│                                                          │
│  [Cancel]  [Submit Review]                             │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

### 3. VerifiedReviewCard.svelte

**Location:** `src/lib/components/reviews/VerifiedReviewCard.svelte`

**Purpose:** Display individual verified review with ratings and comment

**Props:**
```typescript
{
  review: NostrVerifiedReview;  // Review data
  showVerificationBadge?: boolean;  // Show verified badge (default: true)
  onReply?: (reviewId: string) => void;  // Reply callback (optional)
}
```

**Features:**
- ✅ Verification badge (verified/unverified)
- ✅ Overall rating display (stars + number)
- ✅ Category ratings (Quality, Professionalism, Timeliness)
- ✅ Comment display (with auto-translation)
- ✅ Timestamp (relative time)
- ✅ Reply button (if onReply provided)
- ✅ Photo gallery (if photos included)
- ✅ Auto-verification on mount

**Content Box:**
```
┌─────────────────────────────────────────────────────────┐
│  VerifiedReviewCard                                     │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  [Header]                                                │
│  ┌──────────────────────────────────────────────────┐ │
│  │  [✓ Verified]  2 days ago         4.5 ★★★★★      │ │
│  └──────────────────────────────────────────────────┘ │
│                                                          │
│  [Category Ratings]                                     │
│  ┌──────────────────────────────────────────────────┐ │
│  │  Quality: 5/5  |  Professionalism: 4/5  |         │ │
│  │  Timeliness: 5/5                                  │ │
│  └──────────────────────────────────────────────────┘ │
│                                                          │
│  [Comment]                                              │
│  ┌──────────────────────────────────────────────────┐ │
│  │  Great work! Very professional and completed on   │ │
│  │  time. Highly recommend!                          │ │
│  └──────────────────────────────────────────────────┘ │
│                                                          │
│  [Photos - if any]                                      │
│  ┌──────────────────────────────────────────────────┐ │
│  │  [Photo 1]  [Photo 2]  [Photo 3]                 │ │
│  └──────────────────────────────────────────────────┘ │
│                                                          │
│  [Actions]                                              │
│  ┌──────────────────────────────────────────────────┐ │
│  │                                    [Reply]         │ │
│  └──────────────────────────────────────────────────┘ │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

### 4. ReviewList.svelte

**Location:** `src/lib/components/reviews/ReviewList.svelte`

**Purpose:** Display list of reviews with filtering and sorting

**Props:**
```typescript
{
  reviews: NostrVerifiedReview[];  // Array of reviews
  showVerificationBadge?: boolean;  // Show verification badges
  onReviewClick?: (review: NostrVerifiedReview) => void;  // Click handler
  onReply?: (reviewId: string) => void;  // Reply handler
  filter?: ReviewFilter;  // Filter options
  sort?: ReviewSort;  // Sort option
}
```

**Features:**
- ✅ List of VerifiedReviewCard components
- ✅ Filtering (by rating, date, etc.)
- ✅ Sorting (newest, oldest, highest rating, etc.)
- ✅ Pagination
- ✅ Loading states
- ✅ Empty states
- ✅ Click handlers

**Content Box:**
```
┌─────────────────────────────────────────────────────────┐
│  ReviewList                                              │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  [Filters & Sort]                                       │
│  ┌──────────────────────────────────────────────────┐ │
│  │  [Filter: All]  [Sort: Newest ▼]                │ │
│  └──────────────────────────────────────────────────┘ │
│                                                          │
│  [Review Cards]                                         │
│  ┌──────────────────────────────────────────────────┐ │
│  │  [VerifiedReviewCard 1]                           │ │
│  └──────────────────────────────────────────────────┘ │
│  ┌──────────────────────────────────────────────────┐ │
│  │  [VerifiedReviewCard 2]                           │ │
│  └──────────────────────────────────────────────────┘ │
│  ┌──────────────────────────────────────────────────┐ │
│  │  [VerifiedReviewCard 3]                           │ │
│  └──────────────────────────────────────────────────┘ │
│                                                          │
│  [Pagination]                                           │
│  ┌──────────────────────────────────────────────────┐ │
│  │  [< Previous]  Page 1 of 5  [Next >]            │ │
│  └──────────────────────────────────────────────────┘ │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

### 5. PendingReviewsList.svelte

**Location:** `src/lib/components/reviews/PendingReviewsList.svelte`

**Purpose:** Display list of contracts that need reviews

**Features:**
- ✅ Contract cards with completion info
- ✅ "Review Now" buttons
- ✅ Reviewee information
- ✅ Completion date
- ✅ Empty state
- ✅ Opens ReviewPromptModal on click

**Content Box:**
```
┌─────────────────────────────────────────────────────────┐
│  PendingReviewsList                                      │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  [Pending Review Card 1]                                │
│  ┌──────────────────────────────────────────────────┐ │
│  │  Contract: Task #123                               │ │
│  │  Completed: 2 days ago                             │ │
│  │  Review: John Doe                                  │ │
│  │                                                    │ │
│  │  [Review Now →]                                    │ │
│  └──────────────────────────────────────────────────┘ │
│                                                          │
│  [Pending Review Card 2]                                │
│  ┌──────────────────────────────────────────────────┐ │
│  │  Contract: Task #456                               │ │
│  │  Completed: 5 days ago                             │ │
│  │  Review: Jane Smith                                │ │
│  │                                                    │ │
│  │  [Review Now →]                                    │ │
│  └──────────────────────────────────────────────────┘ │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

### 6. ReviewManagementTabs.svelte

**Location:** `src/lib/components/reviews/ReviewManagementTabs.svelte`

**Purpose:** Tab navigation for review management

**Props:**
```typescript
{
  activeTab: 'received' | 'given' | 'pending';
  receivedCount: number;
  givenCount: number;
  pendingCount: number;
  isCurrentUser: boolean;
  onTabChange: (tab: 'received' | 'given' | 'pending') => void;
}
```

**Content Box:**
```
┌─────────────────────────────────────────────────────────┐
│  ReviewManagementTabs                                    │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  [Received (12)]  [Given (5)]  [Pending (3)]           │
│     └─ Active                                            │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

### 7. UserRatingDisplay.svelte

**Location:** `src/lib/components/reviews/UserRatingDisplay.svelte`

**Purpose:** Compact rating display (used in profiles, cards, etc.)

**Props:**
```typescript
{
  userPubkey: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  showCount?: boolean;
  showStars?: boolean;
}
```

**Content Box:**
```
┌─────────────────────────────────────────────────────────┐
│  UserRatingDisplay                                       │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ★★★★★  4.5 (12)                                      │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

---

## Data Flow Diagrams

### Data Flow: Review Submission

```
User Action
    │
    ▼
ReviewPromptModal
    │
    ├─► Fetch reviewee info (Nostr)
    │
    ▼
VerifiedReviewForm
    │
    ├─► User fills form (ratings, comment)
    │
    ▼
Submit Handler
    │
    ├─► Create Commitment
    │   │
    │   └─► review-verification.service.ts
    │       └─► MerkleReviewSDK.createCommitment()
    │           └─► SHA-256 hash of escrow params
    │
    ├─► Get Merkle Proof
    │   │
    │   └─► review-verification.service.ts
    │       └─► MerkleReviewSDK.getProof()
    │           └─► Retrieve tree from IndexedDB
    │           └─► Generate proof path
    │
    ├─► Publish to Nostr
    │   │
    │   └─► nostr-review.ts
    │       └─► publishVerifiedReview()
    │           └─► Create KIND 31004 event
    │           └─► Sign with private key
    │           └─► Publish to relays
    │
    ▼
Success Feedback
    │
    └─► Update UI, close modal
```

### Data Flow: Review Retrieval

```
User Views Profile/Reviews
    │
    ▼
Query Nostr Relays
    │
    └─► nostr-review.ts
        └─► getReviewsForUser()
            └─► Query KIND 31004 events
            └─► Filter by pubkey
            └─► Parse event content
    │
    ▼
Verify Each Review
    │
    └─► nostr-review.ts
        └─► verifyNostrReview()
            └─► ReviewVerifier.verify()
                ├─► Validate commitment format
                ├─► Validate proof structure
                ├─► Reconstruct root from proof
                └─► Compare with published root
    │
    ▼
Display Reviews
    │
    └─► ReviewList / VerifiedReviewCard
        └─► Show verified/unverified badges
        └─► Display ratings, comments
        └─► Auto-translate comments
```

### Data Flow: Merkle Tree Update

```
Escrow Completion Event
    │
    ▼
Queue Tree Update
    │
    └─► treeUpdateHelper.ts
        └─► queueTreeUpdate()
            └─► Add to queue
            └─► Update ReviewStatusStore
    │
    ▼
Background Update Process
    │
    └─► review-verification.service.ts
        └─► buildMerkleTree()
            ├─► Query blockchain (all completed escrows)
            ├─► Create commitments for each escrow
            ├─► Build Merkle tree
            └─► Store in IndexedDB
    │
    ▼
Update Status
    │
    └─► ReviewStatusStore
        └─► Mark update complete
        └─► Store version and root
        └─► Dequeue update
```

---

## Summary

### Key Features

1. **Privacy-Preserving Reviews**
   - Cryptographic commitments hide escrow details
   - Merkle proofs prove completion without revealing specifics
   - Zero-knowledge verification

2. **Blockchain Verification**
   - Only completed escrows can be reviewed
   - Immutable proof of completion
   - Tamper-resistant system

3. **Decentralized Storage**
   - Reviews stored on Nostr protocol
   - No central server required
   - Censorship-resistant

4. **User-Friendly Interface**
   - Simple rating system (1-5 stars)
   - Category-specific ratings
   - Comment support with auto-translation
   - Verification badges for trust

### Current Status

- ✅ **Core Infrastructure**: 100% Complete
- ✅ **UI Components**: 90% Complete
- ✅ **User Flows**: 80% Complete
- ⚠️ **Integration**: 70% Complete
- ❌ **Advanced Features**: 20% Complete

### Next Steps

1. **P0 - Critical**: Task Details Review Integration
2. **P0 - Critical**: Contract Card Review Status Indicators
3. **P1 - High**: Review Reply System
4. **P1 - High**: Photo Upload for Reviews
5. **P1 - High**: Review Notifications

---

**Last Updated:** Today  
**Maintained By:** Development Team  
**Related Documentation:**
- [Review System Flow & Status](./review-system-flow-and-status.md)
- [Review System Buttons List](./review-system-buttons-list.md)
- [Review System Architecture](./reviews-system.md)
- [Merkle Review SDK README](../packages/merkle-review-sdk/README.md)

