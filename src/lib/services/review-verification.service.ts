/**
 * Review Verification Service
 * 
 * Integrates the Merkle Review SDK with BitTasker's escrow and Nostr infrastructure
 */

import { MerkleReviewSDK, EthersBlockchainProvider, LocalStorageProvider } from '@bittasker/merkle-review-sdk';
import type { SDKConfig, VerifiedReview, CommitmentParams, MerkleTreeData } from '@bittasker/merkle-review-sdk';
import { ensureEscrowReady } from '$lib/utils/wallet/escrow';
import { getProvider } from '$lib/stores/wallet.store';
import { ethers } from 'ethers';
import escrowABI from '$lib/utils/constants/escrowABI.json';
import type { Contract } from 'ethers';

let sdkInstance: MerkleReviewSDK | null = null;
let sdkInitialized = false;

/**
 * Initialize the review verification SDK
 */
export async function initializeReviewSDK(): Promise<MerkleReviewSDK> {
	if (sdkInstance && sdkInitialized) {
		return sdkInstance;
	}

	try {
		// Get escrow contract and provider
		const { contract, provider } = await ensureEscrowReady();
		
		if (!contract || !provider) {
			throw new Error('Failed to get escrow contract or provider');
		}

		// Get contract address from environment
		const contractAddress = (import.meta.env.VITE_RSK_CONTRACT_ADDRESS || '').toLowerCase();
		if (!contractAddress) {
			throw new Error('RSK contract address not configured');
		}

		// Create blockchain provider adapter
		const blockchainProvider = new EthersBlockchainProvider({
			contract: contract as Contract,
			provider: provider as ethers.JsonRpcProvider
		});

		// Create storage provider
		const storageProvider = new LocalStorageProvider(
			'bittasker-merkle-trees',
			'merkle-trees-store'
		);

		// Configure SDK
		const config: SDKConfig = {
			blockchainProvider,
			storageProviders: [storageProvider],
			hashFunction: 'sha256',
			platform: {
				isMobile: import.meta.env.VITE_CAPACITOR === 'true',
				isWeb: typeof window !== 'undefined',
				supportsBackground: false // Capacitor limitations
			}
		};

		// Create SDK instance
		sdkInstance = new MerkleReviewSDK(config);
		sdkInitialized = true;

		return sdkInstance;
	} catch (error) {
		console.error('Failed to initialize review SDK:', error);
		throw error;
	}
}

/**
 * Get or initialize SDK instance
 */
export async function getReviewSDK(): Promise<MerkleReviewSDK> {
	if (!sdkInstance) {
		return await initializeReviewSDK();
	}
	return sdkInstance;
}

/**
 * Create a commitment for an escrow
 */
export async function createEscrowCommitment(
	escrowId: string,
	escrowTxHash: string,
	taskerAddress: string,
	taskeeAddress: string
): Promise<string> {
	const sdk = await getReviewSDK();
	
	const params: CommitmentParams = {
		escrowId,
		escrowTxHash: escrowTxHash.toLowerCase(),
		taskerAddress: taskerAddress.toLowerCase(),
		taskeeAddress: taskeeAddress.toLowerCase()
	};

	return sdk.createCommitment(params);
}

/**
 * Get Merkle proof for a commitment
 */
export async function getCommitmentProof(
	commitment: string,
	treeData?: MerkleTreeData
): Promise<string | null> {
	const sdk = await getReviewSDK();
	
	const proof = await sdk.getProof(commitment, treeData);
	if (!proof) {
		return null;
	}

	// Return proof as JSON string for storage in Nostr event
	return JSON.stringify(proof);
}

/**
 * Verify a review
 */
export async function verifyReview(
	review: VerifiedReview,
	expectedRoot?: string
): Promise<{ valid: boolean; error?: string }> {
	const sdk = await getReviewSDK();
	
	// If root not provided, try to get from review's proof
	const root = expectedRoot || review.merkleProof?.root;
	if (!root) {
		return { valid: false, error: 'No root provided for verification' };
	}

	const result = await sdk.verifyReviewWithRoot(review, root);
	return {
		valid: result.valid,
		error: result.error
	};
}

/**
 * Verify multiple reviews in batch
 */
export async function verifyReviewsBatch(
	reviews: VerifiedReview[],
	expectedRoot: string
): Promise<{ total: number; valid: number; invalid: number }> {
	const sdk = await getReviewSDK();
	
	const result = sdk.verifyBatch(reviews, expectedRoot);
	return {
		total: result.total,
		valid: result.valid,
		invalid: result.invalid
	};
}

/**
 * Build Merkle tree from blockchain events
 */
export async function buildMerkleTree(fromBlock?: number, toBlock?: number): Promise<{
	root: string;
	version: string;
	commitmentCount: number;
}> {
	const sdk = await getReviewSDK();
	
	const result = await sdk.buildTree({
		fromBlock,
		toBlock
	});

	return {
		root: result.root,
		version: result.version,
		commitmentCount: result.commitmentCount
	};
}

/**
 * Get latest Merkle tree version
 */
export async function getLatestTreeVersion(): Promise<string | null> {
	const sdk = await getReviewSDK();
	return await sdk.getLatestVersion();
}

/**
 * Retrieve Merkle tree data
 */
export async function retrieveMerkleTree(rootOrVersion: string): Promise<MerkleTreeData | null> {
	const sdk = await getReviewSDK();
	return await sdk.retrieveTree(rootOrVersion);
}

/**
 * Store Merkle tree data
 */
export async function storeMerkleTree(treeData: MerkleTreeData): Promise<boolean> {
	const sdk = await getReviewSDK();
	const result = await sdk.storeTree(treeData);
	return result.success;
}


