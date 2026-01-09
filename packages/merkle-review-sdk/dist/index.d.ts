import { Contract } from 'ethers';
import { JsonRpcProvider } from 'ethers';
import { MerkleTree } from 'merkletreejs';

/**
 * Batch verification result
 */
export declare interface BatchVerificationResult {
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

/**
 * Abstract blockchain provider interface
 */
export declare interface BlockchainProvider {
    /**
     * Get escrow details by ID
     */
    getEscrow(escrowId: string): Promise<EscrowDetails | null>;
    /**
     * Query escrow creation events
     */
    queryEscrowCreatedEvents(params: {
        fromBlock?: number;
        toBlock?: number;
        client?: string;
        freelancer?: string;
    }): Promise<EscrowCreatedEvent[]>;
    /**
     * Query escrow resolution events
     */
    queryEscrowResolvedEvents(params: {
        fromBlock?: number;
        toBlock?: number;
        escrowId?: string;
    }): Promise<EscrowResolvedEvent[]>;
    /**
     * Get transaction receipt
     */
    getTransactionReceipt(txHash: string): Promise<TransactionReceipt | null>;
}

/**
 * Parameters for building a tree
 */
export declare interface BuildTreeParams {
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
 * Commitment generator class
 */
export declare class CommitmentGenerator {
    private hashFunction;
    constructor(hashFunction?: HashFunction);
    /**
     * Create a deterministic commitment hash from escrow parameters
     */
    create(params: CommitmentParams): string;
    /**
     * Validate commitment format
     */
    validate(commitment: string): boolean;
    /**
     * Hash data using configured hash function
     */
    private hash;
    /**
     * Set hash function
     */
    setHashFunction(hashFunction: HashFunction): void;
}

/**
 * Core types for Merkle Review SDK
 */
/**
 * Parameters for creating a commitment
 */
export declare interface CommitmentParams {
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
 * Escrow creation event
 */
export declare interface EscrowCreatedEvent extends EscrowEvent {
    type: 'EscrowCreated';
}

/**
 * Escrow details from contract
 */
export declare interface EscrowDetails {
    /** Escrow ID */
    id: string;
    /** Client address */
    client: string;
    /** Freelancer address */
    freelancer: string;
    /** Current status */
    status: EscrowStatus;
    /** Amount */
    amount: string;
    /** Created timestamp */
    createdAt: number;
}

/**
 * Escrow event data from blockchain
 */
export declare interface EscrowEvent {
    /** Escrow ID */
    escrowId: string;
    /** Transaction hash */
    transactionHash: string;
    /** Block number */
    blockNumber: number;
    /** Block timestamp */
    timestamp: number;
    /** Client address */
    client: string;
    /** Freelancer address */
    freelancer: string;
    /** Amount (in wei or smallest unit) */
    amount: string;
}

/**
 * Escrow resolution event (completed or dispute resolved)
 */
export declare interface EscrowResolvedEvent extends EscrowEvent {
    type: 'EscrowResolved';
    /** Freelancer amount */
    freelancerAmount: string;
    /** Platform fee */
    platformFee: string;
}

/**
 * Blockchain provider interface
 */
/**
 * Escrow status from blockchain contract
 */
export declare enum EscrowStatus {
    Funded = "Funded",
    InDispute = "InDispute",
    DisputeResolved = "DisputeResolved",
    DisputeUnresolved = "DisputeUnresolved",
    Completed = "Completed",
    Cancelled = "Cancelled"
}

/**
 * Ethers.js implementation of BlockchainProvider
 */
export declare class EthersBlockchainProvider implements BlockchainProvider {
    private contract;
    private provider;
    constructor(config: EthersProviderConfig);
    /**
     * Get escrow details by ID
     */
    getEscrow(escrowId: string): Promise<EscrowDetails | null>;
    /**
     * Query escrow creation events
     */
    queryEscrowCreatedEvents(params: {
        fromBlock?: number;
        toBlock?: number;
        client?: string;
        freelancer?: string;
    }): Promise<EscrowCreatedEvent[]>;
    /**
     * Query escrow resolution events
     */
    queryEscrowResolvedEvents(params: {
        fromBlock?: number;
        toBlock?: number;
        escrowId?: string;
    }): Promise<EscrowResolvedEvent[]>;
    /**
     * Get transaction receipt
     */
    getTransactionReceipt(txHash: string): Promise<TransactionReceipt | null>;
}

/**
 * Configuration for Ethers blockchain provider
 */
export declare interface EthersProviderConfig {
    /** Ethers contract instance */
    contract: Contract;
    /** Ethers provider instance */
    provider: JsonRpcProvider;
}

/**
 * Hash function options
 */
export declare type HashFunction = 'sha256' | 'keccak256';

/**
 * Local storage provider using IndexedDB
 */
export declare class LocalStorageProvider implements StorageProvider {
    private dbName;
    private storeName;
    private db;
    constructor(dbName?: string, storeName?: string);
    /**
     * Initialize IndexedDB database
     */
    private initDB;
    /**
     * Store Merkle tree data
     */
    storeTree(data: MerkleTreeData): Promise<StorageResult>;
    /**
     * Retrieve Merkle tree data by root or version
     */
    retrieveTree(rootOrVersion: string): Promise<MerkleTreeData | null>;
    /**
     * Get latest tree version
     */
    getLatestVersion(): Promise<string | null>;
    /**
     * Check if storage is available
     */
    isAvailable(): Promise<boolean>;
    /**
     * Clear all stored trees
     */
    clear(): Promise<void>;
}

/**
 * Merkle proof structure
 */
export declare interface MerkleProof {
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
 * Main SDK class
 */
export declare class MerkleReviewSDK {
    private config;
    private commitmentGenerator;
    private treeBuilder;
    private reviewVerifier;
    constructor(config: SDKConfig);
    /**
     * Create a commitment from escrow parameters
     */
    createCommitment(params: CommitmentParams): string;
    /**
     * Validate commitment format
     */
    validateCommitment(commitment: string): boolean;
    /**
     * Build Merkle tree from blockchain events
     */
    buildTree(params?: BuildTreeParams): Promise<TreeBuildResult>;
    /**
     * Build tree incrementally from existing tree + new events
     */
    buildTreeIncremental(existingRoot: string, existingCommitmentCount: number, params?: BuildTreeParams): Promise<TreeBuildResult>;
    /**
     * Get Merkle proof for a commitment
     * Note: This requires the tree to be built first
     */
    getProof(commitment: string, treeData?: MerkleTreeData): Promise<MerkleProof | null>;
    /**
     * Verify a single review
     */
    verifyReview(review: VerifiedReview, expectedRoot: string): VerificationResult;
    /**
     * Verify multiple reviews in batch
     */
    verifyBatch(reviews: VerifiedReview[], expectedRoot: string): BatchVerificationResult;
    /**
     * Store Merkle tree data using configured storage providers
     */
    storeTree(data: MerkleTreeData): Promise<StorageResult>;
    /**
     * Retrieve Merkle tree data
     */
    retrieveTree(rootOrVersion: string): Promise<MerkleTreeData | null>;
    /**
     * Get latest tree version
     */
    getLatestVersion(): Promise<string | null>;
    /**
     * Build and store tree in one operation
     */
    buildAndStoreTree(params?: BuildTreeParams): Promise<{
        treeResult: TreeBuildResult;
        storageResult: StorageResult;
    }>;
    /**
     * Verify review with automatic root retrieval
     */
    verifyReviewWithRoot(review: VerifiedReview, rootOrVersion?: string): Promise<VerificationResult>;
    /**
     * Get blockchain provider (for direct access if needed)
     */
    getBlockchainProvider(): BlockchainProvider;
    /**
     * Get storage providers (for direct access if needed)
     */
    getStorageProviders(): StorageProvider[];
    /**
     * Update hash function for all components
     */
    setHashFunction(hashFunction: HashFunction): void;
}

/**
 * Merkle tree builder class
 */
export declare class MerkleTreeBuilder {
    private blockchainProvider;
    private commitmentGenerator;
    private hashFunction;
    constructor(blockchainProvider: BlockchainProvider, hashFunction?: HashFunction);
    /**
     * Build Merkle tree from blockchain events
     */
    build(params?: BuildTreeParams): Promise<TreeBuildResult>;
    /**
     * Build tree incrementally from existing tree + new events
     */
    buildIncremental(existingRoot: string, existingCommitmentCount: number, params?: BuildTreeParams): Promise<TreeBuildResult>;
    /**
     * Get Merkle proof for a commitment
     */
    getProof(tree: MerkleTree, commitment: string): MerkleProof;
    /**
     * Create commitments from escrow events
     */
    private createCommitmentsFromEvents;
    /**
     * Build Merkle tree from commitments
     */
    private buildTree;
    /**
     * Hash data using configured hash function
     */
    private hash;
    /**
     * Generate version identifier for tree
     */
    private generateVersion;
}

/**
 * Storage provider interface
 */
/**
 * Merkle tree data structure for storage
 */
export declare interface MerkleTreeData {
    /** Merkle root */
    root: string;
    /** Array of commitments (leaves) */
    commitments: string[];
    /** Tree metadata */
    metadata: {
        version: string;
        builtAt: number;
        commitmentCount: number;
        blockRange?: {
            from: number;
            to: number;
        };
    };
}

/**
 * Review content with ratings
 */
export declare interface ReviewContent {
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
 * Review verifier class
 */
export declare class ReviewVerifier {
    private hashFunction;
    constructor(hashFunction?: HashFunction);
    /**
     * Verify a single review's Merkle proof
     */
    verify(review: VerifiedReview, expectedRoot: string): VerificationResult;
    /**
     * Verify multiple reviews in batch
     */
    verifyBatch(reviews: VerifiedReview[], expectedRoot: string): BatchVerificationResult;
    /**
     * Verify Merkle proof and compute root
     */
    private verifyProof;
    /**
     * Validate proof structure
     */
    private validateProofStructure;
    /**
     * Check if string is valid hex of specified length
     */
    private isValidHex;
    /**
     * Hash data using configured hash function
     */
    private hash;
    /**
     * Set hash function
     */
    setHashFunction(hashFunction: HashFunction): void;
}

/**
 * SDK configuration
 */
export declare interface SDKConfig {
    /** Blockchain provider instance */
    blockchainProvider: BlockchainProvider;
    /** Array of storage providers (ordered by priority) */
    storageProviders: StorageProvider[];
    /** Hash function to use */
    hashFunction?: HashFunction;
    /** Tree building options */
    treeBuilding?: {
        /** Maximum block range per query */
        maxBlockRange?: number;
        /** Batch size for event queries */
        batchSize?: number;
        /** Enable incremental building */
        enableIncremental?: boolean;
    };
    /** Caching configuration */
    caching?: {
        /** Enable caching */
        enabled: boolean;
        /** Cache TTL in milliseconds */
        ttl?: number;
        /** Maximum cache size */
        maxSize?: number;
    };
    /** Network options */
    network?: {
        /** Request timeout in milliseconds */
        timeout?: number;
        /** Maximum retry attempts */
        maxRetries?: number;
        /** Retry delay in milliseconds */
        retryDelay?: number;
    };
    /** Platform capabilities */
    platform?: {
        /** Is mobile platform (Capacitor) */
        isMobile?: boolean;
        /** Is web platform */
        isWeb?: boolean;
        /** Supports background processing */
        supportsBackground?: boolean;
    };
}

/**
 * Abstract storage provider interface
 */
export declare interface StorageProvider {
    /**
     * Store Merkle tree data
     */
    storeTree(data: MerkleTreeData): Promise<StorageResult>;
    /**
     * Retrieve Merkle tree data by root or version
     */
    retrieveTree(rootOrVersion: string): Promise<MerkleTreeData | null>;
    /**
     * Get latest tree version
     */
    getLatestVersion(): Promise<string | null>;
    /**
     * Check if storage is available
     */
    isAvailable(): Promise<boolean>;
}

/**
 * Storage operation result
 */
export declare interface StorageResult {
    /** Whether operation succeeded */
    success: boolean;
    /** Error message if failed */
    error?: string;
    /** Storage location identifier (e.g., IPFS hash, Nostr event ID) */
    location?: string;
}

/**
 * Transaction receipt
 */
export declare interface TransactionReceipt {
    /** Transaction hash */
    hash: string;
    /** Block number */
    blockNumber: number;
    /** Block timestamp */
    timestamp: number;
    /** Status (true = success) */
    status: boolean;
    /** Events emitted */
    events: any[];
}

/**
 * Result of building a Merkle tree
 */
export declare interface TreeBuildResult {
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
 * Verification result for a single review
 */
export declare interface VerificationResult {
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
 * Verified review with Merkle proof
 */
export declare interface VerifiedReview {
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

export { }
