/**
 * SDK configuration types
 */

import type { BlockchainProvider } from './blockchain.js';
import type { StorageProvider } from './storage.js';

/**
 * Hash function options
 */
export type HashFunction = 'sha256' | 'keccak256';

/**
 * SDK configuration
 */
export interface SDKConfig {
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


