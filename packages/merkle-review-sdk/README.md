# @bittasker/merkle-review-sdk

A TypeScript SDK for building and verifying Merkle tree-based review systems with blockchain integration. This SDK enables privacy-preserving, verifiable reviews by linking them to on-chain escrow contracts through cryptographic commitments and Merkle proofs.

## Features

- 🔐 **Privacy-Preserving**: Reviews use cryptographic commitments that don't reveal sensitive escrow details
- ✅ **Verifiable**: Merkle proofs enable client-side verification without trusting a central authority
- 🔗 **Blockchain-Integrated**: Supports Ethereum-compatible chains (e.g., Rootstock) for escrow verification
- 📦 **Storage-Agnostic**: Pluggable storage providers (IndexedDB, IPFS, etc.)
- 🚀 **Incremental Building**: Efficient incremental Merkle tree updates
- ⚡ **Type-Safe**: Full TypeScript support with comprehensive type definitions

## Installation

```bash
npm install @bittasker/merkle-review-sdk
```

## Quick Start

```typescript
import { MerkleReviewSDK, EthersBlockchainProvider, LocalStorageProvider } from '@bittasker/merkle-review-sdk';
import { ethers } from 'ethers';

// Initialize blockchain provider
const provider = new ethers.JsonRpcProvider('https://public-node.rsk.co');
const contract = new ethers.Contract(contractAddress, abi, provider);

const blockchainProvider = new EthersBlockchainProvider({
  contract,
  provider
});

// Initialize storage provider
const storageProvider = new LocalStorageProvider('reviews-db', 'merkle-trees');

// Initialize SDK
const sdk = new MerkleReviewSDK({
  blockchainProvider,
  storageProviders: [storageProvider],
  hashFunction: 'sha256'
});

// Build Merkle tree from blockchain events
const treeResult = await sdk.buildTree();
console.log('Merkle root:', treeResult.root);
console.log('Commitments:', treeResult.commitmentCount);

// Create a commitment for a completed escrow
const commitment = sdk.createCommitment({
  escrowId: '123',
  escrowTxHash: '0xabc...',
  taskerAddress: '0x111...',
  taskeeAddress: '0x222...'
});

// Get Merkle proof
const proof = await sdk.getProof(commitment);
if (proof) {
  console.log('Proof generated:', proof);
}

// Verify a review
const review = {
  commitment,
  merkleProof: proof!,
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

const verification = sdk.verifyReview(review, treeResult.root);
console.log('Review valid:', verification.valid);
```

## Architecture

### Core Components

1. **CommitmentGenerator**: Creates deterministic cryptographic commitments from escrow parameters
2. **MerkleTreeBuilder**: Builds Merkle trees from blockchain events and generates proofs
3. **ReviewVerifier**: Verifies Merkle proofs for reviews
4. **BlockchainProvider**: Interface for blockchain interactions (Ethers.js implementation included)
5. **StorageProvider**: Interface for storing Merkle tree data (IndexedDB implementation included)

### How It Works

1. **Commitment Creation**: When an escrow is completed, a commitment hash is created from:
   - Escrow ID
   - Escrow transaction hash
   - Tasker (client) address
   - Taskee (freelancer) address

2. **Merkle Tree Building**: The SDK queries blockchain events for completed escrows and builds a Merkle tree of all commitments.

3. **Proof Generation**: When a user wants to publish a review, they request a Merkle proof for their commitment, proving it's in the tree without revealing other commitments.

4. **Review Publishing**: The review is published with:
   - The commitment
   - The Merkle proof
   - Review content (ratings, comment, etc.)

5. **Verification**: Anyone can verify a review by checking the Merkle proof against the published tree root.

## API Reference

### MerkleReviewSDK

Main SDK class that coordinates all operations.

#### Constructor

```typescript
new MerkleReviewSDK(config: SDKConfig)
```

#### Methods

##### `createCommitment(params: CommitmentParams): string`

Creates a commitment hash from escrow parameters.

```typescript
const commitment = sdk.createCommitment({
  escrowId: '123',
  escrowTxHash: '0xabc...',
  taskerAddress: '0x111...',
  taskeeAddress: '0x222...'
});
```

##### `buildTree(params?: BuildTreeParams): Promise<TreeBuildResult>`

Builds a Merkle tree from blockchain events.

```typescript
const result = await sdk.buildTree({
  fromBlock: 0,
  toBlock: 'latest'
});
```

##### `buildIncrementalTree(existingRoot: string, existingCount: number, params?: BuildTreeParams): Promise<TreeBuildResult>`

Builds an incremental update to an existing tree.

```typescript
const result = await sdk.buildIncrementalTree(
  '0xexistingRoot...',
  100,
  { fromBlock: 1000, toBlock: 'latest' }
);
```

##### `getProof(commitment: string, treeData?: MerkleTreeData): Promise<MerkleProof | null>`

Gets a Merkle proof for a commitment.

```typescript
const proof = await sdk.getProof(commitment);
```

##### `verifyReview(review: VerifiedReview, expectedRoot: string): VerificationResult`

Verifies a review's Merkle proof.

```typescript
const result = sdk.verifyReview(review, treeRoot);
if (result.valid) {
  console.log('Review is valid!');
}
```

##### `verifyBatch(reviews: VerifiedReview[], expectedRoot: string): BatchVerificationResult`

Verifies multiple reviews in batch.

```typescript
const result = sdk.verifyBatch(reviews, treeRoot);
console.log(`Valid: ${result.valid}/${result.total}`);
```

### BlockchainProvider

Interface for blockchain interactions. Implement `EthersBlockchainProvider` for Ethereum-compatible chains.

#### Required Methods

- `getEscrow(escrowId: string): Promise<EscrowDetails | null>`
- `queryEscrowCreatedEvents(params): Promise<EscrowCreatedEvent[]>`
- `queryEscrowResolvedEvents(params): Promise<EscrowResolvedEvent[]>`
- `getTransactionReceipt(txHash: string): Promise<TransactionReceipt | null>`

### StorageProvider

Interface for storing Merkle tree data. Implement `LocalStorageProvider` for browser-based storage.

#### Required Methods

- `storeTree(data: MerkleTreeData): Promise<StorageResult>`
- `retrieveTree(rootOrVersion: string): Promise<MerkleTreeData | null>`
- `getLatestVersion(): Promise<string | null>`
- `isAvailable(): Promise<boolean>`

## Configuration

### SDKConfig

```typescript
interface SDKConfig {
  blockchainProvider: BlockchainProvider;
  storageProviders: StorageProvider[];
  hashFunction?: 'sha256' | 'keccak256';
  treeBuilding?: {
    maxBlockRange?: number;
    batchSize?: number;
    enableIncremental?: boolean;
  };
  caching?: {
    enabled: boolean;
    ttl?: number;
    maxSize?: number;
  };
  platform?: {
    isMobile?: boolean;
    isWeb?: boolean;
    supportsBackground?: boolean;
  };
}
```

## Types

### CommitmentParams

```typescript
interface CommitmentParams {
  escrowId: string;
  escrowTxHash: string;
  taskerAddress: string;
  taskeeAddress: string;
}
```

### VerifiedReview

```typescript
interface VerifiedReview {
  commitment: string;
  merkleProof: MerkleProof;
  reviewerPubkey: string;
  revieweePubkey: string;
  content: ReviewContent;
  createdAt: number;
}
```

### ReviewContent

```typescript
interface ReviewContent {
  overallRating: number; // 1-5
  categoryRatings: {
    quality: number;
    professionalism: number;
    timeliness: number;
  };
  comment: string;
  photos?: string[];
}
```

### MerkleProof

```typescript
interface MerkleProof {
  root: string;
  leaf: string;
  proof: string[];
  proofFlags: boolean[];
}
```

## Testing

```bash
npm test
```

Run tests with coverage:

```bash
npm run test:coverage
```

## Contributing

Contributions are welcome! Please ensure:

1. All tests pass
2. Code follows TypeScript best practices
3. New features include tests
4. Documentation is updated

## License

MIT

## Support

For issues and questions, please open an issue on GitHub.

