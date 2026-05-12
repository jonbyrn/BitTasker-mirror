/**
 * Core types for Merkle Review SDK
 */

/**
 * Parameters for creating a commitment
 */
export interface CommitmentParams {
	/** Escrow ID from the blockchain contract */
	escrowId: string;
	/** Transaction hash of the escrow creation */
	escrowTxHash: string;
	/** Tasker (client) address */
	taskerAddress: string;
	/** Taskee (freelancer) address */
	taskeeAddress: string;
}

/**
 * Review content with ratings
 */
export interface ReviewContent {
	/** Overall rating (1-5) */
	overallRating: number;
	/** Category ratings (all required, 1-5 scale) */
	categoryRatings: {
		quality: number;
		professionalism: number;
		timeliness: number;
	};
	/** Review comment text */
	comment: string;
	/** Optional photo URLs */
	photos?: string[];
}

/**
 * Verified review with Merkle proof
 */
export interface VerifiedReview {
	/** Commitment hash */
	commitment: string;
	/** Merkle proof for verification */
	merkleProof: MerkleProof;
	/** Reviewer's public key (Nostr pubkey) */
	reviewerPubkey: string;
	/** Reviewee's public key (Nostr pubkey) */
	revieweePubkey: string;
	/** Review content */
	content: ReviewContent;
	/** Timestamp when review was created */
	createdAt: number;
	/** Event ID for translation lookup */
	eventId?: string;
}

/**
 * Merkle proof structure
 */
export interface MerkleProof {
	/** Merkle root */
	root: string;
	/** Leaf node (commitment) */
	leaf: string;
	/** Proof path (array of sibling hashes) */
	proof: string[];
	/** Proof flags (indicates left/right for each proof step) */
	proofFlags: boolean[];
}

/**
 * Result of building a Merkle tree
 */
export interface TreeBuildResult {
	/** Merkle root hash */
	root: string;
	/** Number of commitments in the tree */
	commitmentCount: number;
	/** Timestamp when tree was built */
	builtAt: number;
	/** Version identifier for the tree */
	version: string;
}

/**
 * Parameters for building a tree
 */
export interface BuildTreeParams {
	/** Start block number (optional) */
	fromBlock?: number;
	/** End block number (optional) */
	toBlock?: number;
	/** Use incremental building from existing tree */
	incremental?: boolean;
	/** Existing tree root (for incremental building) */
	existingRoot?: string;
}

/**
 * Verification result for a single review
 */
export interface VerificationResult {
	/** Whether verification succeeded */
	valid: boolean;
	/** Error message if verification failed */
	error?: string;
	/** Details about the verification */
	details?: {
		commitmentExists: boolean;
		proofValid: boolean;
		rootMatches: boolean;
	};
}

/**
 * Batch verification result
 */
export interface BatchVerificationResult {
	/** Total number of reviews verified */
	total: number;
	/** Number of valid reviews */
	valid: number;
	/** Number of invalid reviews */
	invalid: number;
	/** Individual verification results */
	results: Array<{
		reviewId: string;
		result: VerificationResult;
	}>;
	/** Verification time in milliseconds */
	verificationTime: number;
}


