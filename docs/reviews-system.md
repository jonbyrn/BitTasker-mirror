# BitTasker Verified Review System

## Overview

The BitTasker Verified Review System provides a privacy-preserving, blockchain-verified review mechanism that links reviews to completed escrow contracts through cryptographic commitments and Merkle proofs. This ensures reviews are authentic, verifiable, and resistant to gaming.

## Architecture

### Components

1. **Merkle Review SDK** (`@bittasker/merkle-review-sdk`)
   - Core cryptographic operations
   - Merkle tree building and verification
   - Blockchain event processing

2. **Review Verification Service** (`src/lib/services/review-verification.service.ts`)
   - SDK initialization and configuration
   - Tree building and storage management
   - Background updates for mobile apps

3. **Nostr Review Utilities** (`src/lib/utils/nostr-review.ts`)
   - Publishing reviews to Nostr
   - Retrieving reviews from Nostr
   - Review verification

4. **UI Components** (`src/lib/components/reviews/`)
   - `VerifiedReviewForm.svelte` - Review submission form
   - `VerifiedReviewCard.svelte` - Display individual reviews
   - `ReviewList.svelte` - List and filter reviews

## How It Works

### 1. Escrow Completion

When an escrow contract is completed (status: `Completed` or `DisputeResolved`):

```typescript
// Escrow details retrieved from blockchain
const escrowData = await escrow.getEscrow(escrowId);
// Status must be Completed or DisputeResolved
```

### 2. Commitment Creation

A cryptographic commitment is created from escrow parameters:

```typescript
const commitment = sdk.createCommitment({
  escrowId: '123',
  escrowTxHash: '0xabc...',
  taskerAddress: '0x111...',
  taskeeAddress: '0x222...'
});
```

The commitment is a hash of all escrow parameters, ensuring:
- **Privacy**: Commitment doesn't reveal escrow details
- **Determinism**: Same escrow always produces same commitment
- **Uniqueness**: Different escrows produce different commitments

### 3. Merkle Tree Building

The SDK builds a Merkle tree from all completed escrows:

```typescript
// Query blockchain for completed escrows
const resolvedEvents = await blockchainProvider.queryEscrowResolvedEvents({
  fromBlock: 0,
  toBlock: 'latest'
});

// Create commitments for each completed escrow
const commitments = resolvedEvents.map(event => 
  createCommitmentFromEvent(event)
);

// Build Merkle tree
const tree = buildMerkleTree(commitments);
```

### 4. Proof Generation

When a user wants to review, they request a Merkle proof:

```typescript
const proof = await sdk.getProof(commitment, treeData);
```

The proof demonstrates:
- The commitment exists in the tree
- Without revealing other commitments
- Without requiring the full tree

### 5. Review Publishing

The review is published to Nostr with:

```typescript
const review = {
  commitment,
  merkleProof: proof,
  reviewerPubkey: 'npub1...',
  revieweePubkey: 'npub1...',
  content: {
    overallRating: 5,
    categoryRatings: {
      quality: 5,
      professionalism: 4,
      timeliness: 5
    },
    comment: 'Great work!'
  },
  createdAt: Date.now()
};

await publishVerifiedReview(escrowId, revieweePubkey, content);
```

### 6. Verification

Anyone can verify a review:

```typescript
const isValid = await verifyNostrReview(review);
```

Verification checks:
- Merkle proof is valid
- Proof root matches published tree root
- Commitment format is correct

## Privacy Features

### What's Public

- Review content (ratings, comments)
- Reviewer and reviewee pubkeys
- Merkle proof
- Tree root

### What's Private

- Individual escrow details (ID, addresses, amounts)
- Other commitments in the tree
- Internal tree structure

### Privacy Guarantees

1. **Commitment Privacy**: Commitments are hashes, not reversible
2. **Proof Privacy**: Proofs don't reveal other commitments
3. **Selective Disclosure**: Only the commitment being reviewed is revealed

## Security Features

### Anti-Gaming Mechanisms

1. **Blockchain Verification**: Only completed escrows can be reviewed
2. **Merkle Proof**: Proves escrow completion without revealing details
3. **One Review Per Escrow**: Duplicate prevention by commitment
4. **Client-Side Verification**: No server trust required

### Verification Process

1. Check escrow status on-chain
2. Verify commitment matches escrow
3. Verify Merkle proof validity
4. Verify proof root matches published root

## Usage Examples

### Submitting a Review

```svelte
<script>
  import VerifiedReviewForm from '$lib/components/reviews/VerifiedReviewForm.svelte';
  
  async function handleSubmit(eventId: string) {
    console.log('Review published:', eventId);
    // Refresh reviews list, show success message, etc.
  }
</script>

<VerifiedReviewForm
  escrowId="123"
  revieweePubkey="npub1..."
  escrowTxHash="0xabc..."
  onSubmit={handleSubmit}
/>
```

### Displaying Reviews

```svelte
<script>
  import ReviewList from '$lib/components/reviews/ReviewList.svelte';
  
  const filter = {
    minRating: 4,
    hasComment: true
  };
</script>

<ReviewList
  revieweePubkey="npub1..."
  filter={filter}
  sort="newest"
  limit={20}
/>
```

### Verifying Reviews

```typescript
import { verifyNostrReview } from '$lib/utils/nostr-review';

const isValid = await verifyNostrReview(review);
if (isValid) {
  console.log('Review is verified!');
} else {
  console.log('Review verification failed');
}
```

## Performance Considerations

### Tree Building

- **Incremental Updates**: Only process new events
- **Background Building**: Build trees in background on mobile
- **Caching**: Cache tree data in IndexedDB
- **Batch Processing**: Process events in batches

### Verification

- **Client-Side**: All verification happens on client
- **Batch Verification**: Verify multiple reviews at once
- **Caching**: Cache verification results

### Mobile Optimization

- **Background Tasks**: Update trees when app is backgrounded
- **App Lifecycle**: Handle app state changes
- **Resource Management**: Stop updates when app is inactive

## Error Handling

### Common Errors

1. **Escrow Not Completed**: Review can only be submitted for completed escrows
2. **Commitment Not in Tree**: Tree may need to be updated
3. **Proof Generation Failed**: Tree data may be missing
4. **Verification Failed**: Review may be invalid or tree outdated

### Error Recovery

```typescript
try {
  await publishVerifiedReview(escrowId, revieweePubkey, content);
} catch (error) {
  if (error.message.includes('commitment not in tree')) {
    // Trigger tree update
    await buildOrUpdateMerkleTree();
    // Retry after update
    await publishVerifiedReview(escrowId, revieweePubkey, content);
  }
}
```

## Testing

### Unit Tests

```bash
npm run test:unit
```

### Integration Tests

```bash
npm run test:integration
```

### Component Tests

```bash
npm run test:component
```

## Translation Support

All review UI components support translation through `svelte-i18n`:

- English: `static/locales/en/reviews.json`
- Spanish: `static/locales/es/reviews.json`

Review comments are automatically translated using the `TranslationStore`.

## Future Enhancements

- [ ] Review replies
- [ ] Review editing
- [ ] Review moderation
- [ ] Review search and filtering
- [ ] Review analytics
- [ ] Multi-chain support
- [ ] IPFS storage for Merkle trees

## References

- [Merkle Tree Documentation](https://en.wikipedia.org/wiki/Merkle_tree)
- [Nostr Protocol](https://nostr.com/)
- [RGB Documentation](https://developers.rgb.co/)
- [SDK README](../packages/merkle-review-sdk/README.md)

