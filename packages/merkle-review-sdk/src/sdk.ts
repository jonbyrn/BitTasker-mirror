/**
 * Main SDK class for Merkle Review System
 */

import { CommitmentGenerator } from './core/commitment.js';
import { MerkleTreeBuilder } from './builders/tree-builder.js';
import { ReviewVerifier } from './verifiers/review-verifier.js';
import type { BlockchainProvider } from './types/blockchain.js';
import type { StorageProvider, MerkleTreeData, StorageResult } from './types/storage.js';
import type {
	CommitmentParams,
	VerifiedReview,
	MerkleProof,
	VerificationResult,
	BatchVerificationResult,
	BuildTreeParams,
	TreeBuildResult
} from './types/index.js';
import type { SDKConfig, HashFunction } from './types/config.js';

/**
 * Main SDK class
 */
export class MerkleReviewSDK {
	private config: SDKConfig;
	private commitmentGenerator: CommitmentGenerator;
	private treeBuilder: MerkleTreeBuilder;
	private reviewVerifier: ReviewVerifier;

	constructor(config: SDKConfig) {
		this.config = config;
		const hashFunction = config.hashFunction || 'sha256';

		this.commitmentGenerator = new CommitmentGenerator(hashFunction);
		this.treeBuilder = new MerkleTreeBuilder(config.blockchainProvider, hashFunction);
		this.reviewVerifier = new ReviewVerifier(hashFunction);
	}

	/**
	 * Create a commitment from escrow parameters
	 */
	createCommitment(params: CommitmentParams): string {
		return this.commitmentGenerator.create(params);
	}

	/**
	 * Validate commitment format
	 */
	validateCommitment(commitment: string): boolean {
		return this.commitmentGenerator.validate(commitment);
	}

	/**
	 * Build Merkle tree from blockchain events
	 */
	async buildTree(params: BuildTreeParams = {}): Promise<TreeBuildResult> {
		return this.treeBuilder.build(params);
	}

	/**
	 * Build tree incrementally from existing tree + new events
	 */
	async buildTreeIncremental(
		existingRoot: string,
		existingCommitmentCount: number,
		params: BuildTreeParams = {}
	): Promise<TreeBuildResult> {
		return this.treeBuilder.buildIncremental(existingRoot, existingCommitmentCount, params);
	}

	/**
	 * Get Merkle proof for a commitment
	 * Note: This requires the tree to be built first
	 */
	async getProof(commitment: string, treeData?: MerkleTreeData): Promise<MerkleProof | null> {
		// If tree data is provided, use it
		if (treeData) {
			// Rebuild tree from commitments to get proof
			const { MerkleTree } = await import('merkletreejs');
			const { sha256 } = await import('@noble/hashes/sha256');
			const { keccak_256 } = await import('@noble/hashes/sha3');

			const hashFn = this.config.hashFunction === 'keccak256' ? keccak_256 : sha256;
			const leaves = treeData.commitments.map(c => Buffer.from(c, 'hex'));
			const tree = new MerkleTree(
				leaves,
				(data: Buffer) => Buffer.from(hashFn(new Uint8Array(data))),
				{
					sortPairs: true,
					hashLeaves: false
				}
			);

			return this.treeBuilder.getProof(tree, commitment);
		}

		// Otherwise, try to retrieve from storage
		if (this.config.storageProviders && this.config.storageProviders.length > 0) {
			// Try to get latest tree
			const latestVersion = await this.config.storageProviders[0].getLatestVersion();
			if (latestVersion) {
				const treeData = await this.config.storageProviders[0].retrieveTree(latestVersion);
				if (treeData) {
					return this.getProof(commitment, treeData);
				}
			}
		}

		return null;
	}

	/**
	 * Verify a single review
	 */
	verifyReview(review: VerifiedReview, expectedRoot: string): VerificationResult {
		return this.reviewVerifier.verify(review, expectedRoot);
	}

	/**
	 * Verify multiple reviews in batch
	 */
	verifyBatch(reviews: VerifiedReview[], expectedRoot: string): BatchVerificationResult {
		return this.reviewVerifier.verifyBatch(reviews, expectedRoot);
	}

	/**
	 * Store Merkle tree data using configured storage providers
	 */
	async storeTree(data: MerkleTreeData): Promise<StorageResult> {
		if (!this.config.storageProviders || this.config.storageProviders.length === 0) {
			return {
				success: false,
				error: 'No storage providers configured'
			};
		}

		// Try each storage provider in order
		for (const provider of this.config.storageProviders) {
			const isAvailable = await provider.isAvailable();
			if (isAvailable) {
				const result = await provider.storeTree(data);
				if (result.success) {
					return result;
				}
			}
		}

		return {
			success: false,
			error: 'All storage providers failed or are unavailable'
		};
	}

	/**
	 * Retrieve Merkle tree data
	 */
	async retrieveTree(rootOrVersion: string): Promise<MerkleTreeData | null> {
		if (!this.config.storageProviders || this.config.storageProviders.length === 0) {
			return null;
		}

		// Try each storage provider in order
		for (const provider of this.config.storageProviders) {
			const isAvailable = await provider.isAvailable();
			if (isAvailable) {
				const result = await provider.retrieveTree(rootOrVersion);
				if (result) {
					return result;
				}
			}
		}

		return null;
	}

	/**
	 * Get latest tree version
	 */
	async getLatestVersion(): Promise<string | null> {
		if (!this.config.storageProviders || this.config.storageProviders.length === 0) {
			return null;
		}

		// Try each storage provider in order
		for (const provider of this.config.storageProviders) {
			const isAvailable = await provider.isAvailable();
			if (isAvailable) {
				const version = await provider.getLatestVersion();
				if (version) {
					return version;
				}
			}
		}

		return null;
	}

	/**
	 * Build and store tree in one operation
	 */
	async buildAndStoreTree(params: BuildTreeParams = {}): Promise<{
		treeResult: TreeBuildResult;
		storageResult: StorageResult;
	}> {
		// Build tree
		const treeResult = await this.buildTree(params);

		// Get commitments from builder (we need to reconstruct them)
		// For now, we'll create a minimal tree data structure
		// In a real implementation, we'd want to cache commitments
		const treeData: MerkleTreeData = {
			root: treeResult.root,
			commitments: [], // Would be populated from builder's internal state
			metadata: {
				version: treeResult.version,
				builtAt: treeResult.builtAt,
				commitmentCount: treeResult.commitmentCount
			}
		};

		// Store tree
		const storageResult = await this.storeTree(treeData);

		return {
			treeResult,
			storageResult
		};
	}

	/**
	 * Verify review with automatic root retrieval
	 */
	async verifyReviewWithRoot(review: VerifiedReview, rootOrVersion?: string): Promise<VerificationResult> {
		let expectedRoot: string;

		if (rootOrVersion) {
			// Try to retrieve tree to get root
			const treeData = await this.retrieveTree(rootOrVersion);
			if (treeData) {
				expectedRoot = treeData.root;
			} else {
				// Assume rootOrVersion is actually a root
				expectedRoot = rootOrVersion;
			}
		} else {
			// Use root from proof
			expectedRoot = review.merkleProof.root;
		}

		return this.verifyReview(review, expectedRoot);
	}

	/**
	 * Get blockchain provider (for direct access if needed)
	 */
	getBlockchainProvider(): BlockchainProvider {
		return this.config.blockchainProvider;
	}

	/**
	 * Get storage providers (for direct access if needed)
	 */
	getStorageProviders(): StorageProvider[] {
		return this.config.storageProviders || [];
	}

	/**
	 * Update hash function for all components
	 */
	setHashFunction(hashFunction: HashFunction): void {
		this.commitmentGenerator.setHashFunction(hashFunction);
		this.reviewVerifier.setHashFunction(hashFunction);
		// Note: treeBuilder needs to be recreated with new hash function
		this.treeBuilder = new MerkleTreeBuilder(
			this.config.blockchainProvider,
			hashFunction
		);
	}
}

