# Review System Integration Guide

This guide explains how to integrate the BitTasker Verified Review System into your application.

## Prerequisites

- Node.js 18+ and npm
- TypeScript knowledge
- Understanding of blockchain basics
- Familiarity with Svelte/SvelteKit

## Installation

The SDK is already included in the project as a workspace package:

```json
{
  "dependencies": {
    "@bittasker/merkle-review-sdk": "file:./packages/merkle-review-sdk"
  }
}
```

## Initialization

### 1. Initialize the SDK

```typescript
import { initializeReviewSDK } from '$lib/services/review-verification.service';

// Initialize on app startup
await initializeReviewSDK();
```

### 2. Configure Services

The SDK is automatically configured with:
- Ethers.js blockchain provider (RGB)
- IndexedDB storage provider
- Background tree updates for mobile

## Basic Usage

### Submitting a Review

```typescript
import { publishVerifiedReview } from '$lib/utils/nostr-review';

const eventId = await publishVerifiedReview(
  escrowId,
  revieweePubkey,
  {
    overallRating: 5,
    categoryRatings: {
      quality: 5,
      professionalism: 4,
      timeliness: 5
    },
    comment: 'Excellent work!'
  },
  escrowTxHash // Optional
);
```

### Retrieving Reviews

```typescript
import { getReviewsForUser } from '$lib/utils/nostr-review';

const reviews = await getReviewsForUser(
  revieweePubkey,
  50 // limit
);
```

### Verifying Reviews

```typescript
import { verifyNostrReview } from '$lib/utils/nostr-review';

const isValid = await verifyNostrReview(review);
```

## UI Components

### Review Form

```svelte
<script>
  import VerifiedReviewForm from '$lib/components/reviews/VerifiedReviewForm.svelte';
  
  let escrowId = '123';
  let revieweePubkey = 'npub1...';
  
  function handleSubmit(eventId: string) {
    console.log('Review published:', eventId);
    // Handle success
  }
  
  function handleCancel() {
    // Handle cancel
  }
</script>

<VerifiedReviewForm
  {escrowId}
  {revieweePubkey}
  onSubmit={handleSubmit}
  onCancel={handleCancel}
/>
```

### Review List

```svelte
<script>
  import ReviewList from '$lib/components/reviews/ReviewList.svelte';
  
  let revieweePubkey = 'npub1...';
  let filter = {
    minRating: 4,
    hasComment: true
  };
  
  function handleReviewClick(review) {
    // Navigate to review details
  }
  
  function handleReply(reviewId: string) {
    // Show reply form
  }
</script>

<ReviewList
  {revieweePubkey}
  {filter}
  sort="newest"
  limit={20}
  onReviewClick={handleReviewClick}
  onReply={handleReply}
/>
```

### Review Card

```svelte
<script>
  import VerifiedReviewCard from '$lib/components/reviews/VerifiedReviewCard.svelte';
  
  let review = {
    // Review data
  };
  
  function handleReply(reviewId: string) {
    // Show reply form
  }
</script>

<VerifiedReviewCard
  {review}
  showVerificationBadge={true}
  onReply={handleReply}
/>
```

## Advanced Usage

### Custom Storage Provider

```typescript
import { StorageProvider } from '@bittasker/merkle-review-sdk';

class CustomStorageProvider implements StorageProvider {
  async storeTree(data: MerkleTreeData): Promise<StorageResult> {
    // Custom storage logic
  }
  
  async retrieveTree(rootOrVersion: string): Promise<MerkleTreeData | null> {
    // Custom retrieval logic
  }
  
  // ... other methods
}
```

### Custom Blockchain Provider

```typescript
import { BlockchainProvider } from '@bittasker/merkle-review-sdk';

class CustomBlockchainProvider implements BlockchainProvider {
  async getEscrow(escrowId: string): Promise<EscrowDetails | null> {
    // Custom blockchain logic
  }
  
  // ... other methods
}
```

### Background Tree Updates

The service automatically handles background updates on mobile:

```typescript
import { 
  buildOrUpdateMerkleTree,
  stopBackgroundTreeUpdate 
} from '$lib/services/review-verification.service';

// Manual update
await buildOrUpdateMerkleTree();

// Stop background updates (e.g., on logout)
stopBackgroundTreeUpdate();
```

## Error Handling

### Common Errors

```typescript
try {
  await publishVerifiedReview(escrowId, revieweePubkey, content);
} catch (error) {
  if (error.message.includes('not in a completed state')) {
    // Escrow not completed
    showError('Cannot review incomplete escrow');
  } else if (error.message.includes('commitment not in tree')) {
    // Tree needs update
    await buildOrUpdateMerkleTree();
    // Retry
    await publishVerifiedReview(escrowId, revieweePubkey, content);
  } else {
    // Other error
    showError('Failed to publish review');
  }
}
```

## Best Practices

### 1. Tree Updates

- Update trees periodically (automatically handled)
- Check for updates before proof generation
- Handle tree update failures gracefully

### 2. Review Verification

- Always verify reviews before displaying
- Cache verification results
- Show verification status to users

### 3. Error Handling

- Provide clear error messages
- Handle network failures
- Retry failed operations

### 4. Performance

- Use pagination for review lists
- Cache tree data
- Batch verify reviews when possible

## Testing

### Unit Tests

```typescript
import { describe, it, expect } from 'vitest';
import { publishVerifiedReview } from '$lib/utils/nostr-review';

describe('publishVerifiedReview', () => {
  it('should publish review for completed escrow', async () => {
    // Test implementation
  });
});
```

### Integration Tests

```typescript
import { initializeReviewSDK } from '$lib/services/review-verification.service';

describe('Review System Integration', () => {
  beforeEach(async () => {
    await initializeReviewSDK();
  });
  
  it('should complete full review workflow', async () => {
    // Test implementation
  });
});
```

## Troubleshooting

### Tree Not Building

**Problem**: Merkle tree fails to build

**Solutions**:
- Check blockchain provider connection
- Verify contract address and ABI
- Check event filters
- Review error logs

### Proof Generation Fails

**Problem**: Cannot generate proof for commitment

**Solutions**:
- Ensure tree is built and up-to-date
- Verify commitment is correct
- Check tree data storage
- Trigger manual tree update

### Verification Fails

**Problem**: Review verification fails

**Solutions**:
- Check tree root matches
- Verify proof structure
- Ensure tree is current
- Check commitment format

## Support

For issues or questions:
1. Check documentation
2. Review error messages
3. Check GitHub issues
4. Contact development team

