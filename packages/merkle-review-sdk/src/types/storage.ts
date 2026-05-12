/**
 * Storage provider interface
 */

/**
 * Merkle tree data structure for storage
 */
export interface MerkleTreeData {
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
 * Storage operation result
 */
export interface StorageResult {
	/** Whether operation succeeded */
	success: boolean;
	/** Error message if failed */
	error?: string;
	/** Storage location identifier (e.g., IPFS hash, Nostr event ID) */
	location?: string;
}

/**
 * Abstract storage provider interface
 */
export interface StorageProvider {
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


