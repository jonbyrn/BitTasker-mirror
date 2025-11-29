import type { ContractWithEvents } from '$lib/types/contract';
import type { NostrEvent } from 'nostr-tools';

/**
 * Enhanced cache utility for bid data with different cache types
 */
interface CacheEntry<T> {
	data: T;
	timestamp: number;
	ttl: number;
}

/**
 * Legacy BidCache class for backward compatibility
 */
export class BidCache {
	private cache = new Map<string, CacheEntry<any>>();
	private readonly MAX_CACHE_SIZE = 100; // Prevent unbounded growth

	set<T>(key: string, data: T, ttlMinutes: number = 5): void {
		// Auto-cleanup expired entries before adding new ones
		this.cleanup();

		// Prevent cache from growing too large
		if (this.cache.size >= this.MAX_CACHE_SIZE) {
			// Remove oldest entries (simple FIFO approach)
			const firstKey = this.cache.keys().next().value;
			if (firstKey) {
				this.cache.delete(firstKey);
			}
		}

		this.cache.set(key, {
			data,
			timestamp: Date.now(),
			ttl: ttlMinutes * 60 * 1000 // Convert minutes to milliseconds
		});
	}

	get<T>(key: string): T | null {
		const entry = this.cache.get(key);
		if (!entry) return null;

		// Auto-cleanup expired entries on access
		if (Date.now() - entry.timestamp > entry.ttl) {
			this.cache.delete(key);
			return null;
		}

		return entry.data;
	}

	// Cache processed bid data with different processing stages
	setProcessedBidData(key: string, data: NostrEvent, ttlMinutes: number = 5): void {
		this.set(`processed-${key}`, data, ttlMinutes);
	}

	getProcessedBidData(key: string): NostrEvent | null {
		return this.get<NostrEvent>(`processed-${key}`);
	}

	clear(): void {
		this.cache.clear();
	}

	// Clean up expired entries
	cleanup(): void {
		const now = Date.now();
		for (const [key, entry] of this.cache.entries()) {
			if (now - entry.timestamp > entry.ttl) {
				this.cache.delete(key);
			}
		}
	}
}

/**
 * Smart Bid Cache with Namespaced Selective Invalidation
 * 
 * Provides granular cache control with separate namespaces for different data types.
 * Allows selective invalidation without clearing unrelated cached data.
 */
export class SmartBidCache {
	private bidsByTask = new Map<string, CacheEntry<NostrEvent[]>>();
	private bidsByUser = new Map<string, CacheEntry<NostrEvent[]>>();
	private contractsByEscrow = new Map<string, CacheEntry<ContractWithEvents>>();
	private contractsByTask = new Map<string, CacheEntry<ContractWithEvents[]>>();
	private contractsByUser = new Map<string, CacheEntry<ContractWithEvents[]>>();

	private readonly MAX_CACHE_SIZE = 100;
	private readonly DEFAULT_TTL_MINUTES = 5;

	/**
	 * Cache bids for a specific task
	 */
	setBidsForTask(taskId: string, bids: NostrEvent[], ttlMinutes: number = this.DEFAULT_TTL_MINUTES): void {
		this.cleanup(this.bidsByTask);
		this.enforceLimit(this.bidsByTask);
		this.bidsByTask.set(taskId, {
			data: bids,
			timestamp: Date.now(),
			ttl: ttlMinutes * 60 * 1000
		});
	}

	/**
	 * Get cached bids for a specific task
	 */
	getBidsForTask(taskId: string): NostrEvent[] | null {
		return this.get(this.bidsByTask, taskId);
	}

	/**
	 * Invalidate bids for a specific task only
	 */
	invalidateTaskBids(taskId: string): void {
		this.bidsByTask.delete(taskId);
	}

	/**
	 * Cache bids by user (my bids)
	 */
	setBidsByUser(userId: string, bids: NostrEvent[], ttlMinutes: number = this.DEFAULT_TTL_MINUTES): void {
		this.cleanup(this.bidsByUser);
		this.enforceLimit(this.bidsByUser);
		this.bidsByUser.set(userId, {
			data: bids,
			timestamp: Date.now(),
			ttl: ttlMinutes * 60 * 1000
		});
	}

	/**
	 * Get cached bids by user
	 */
	getBidsByUser(userId: string): NostrEvent[] | null {
		return this.get(this.bidsByUser, userId);
	}

	/**
	 * Invalidate user bids
	 */
	invalidateUserBids(userId: string): void {
		this.bidsByUser.delete(userId);
	}

	/**
	 * Cache contract by escrow ID
	 */
	setContractByEscrow(escrowId: string, contract: ContractWithEvents, ttlMinutes: number = this.DEFAULT_TTL_MINUTES): void {
		this.cleanup(this.contractsByEscrow);
		this.enforceLimit(this.contractsByEscrow);
		this.contractsByEscrow.set(escrowId, {
			data: contract,
			timestamp: Date.now(),
			ttl: ttlMinutes * 60 * 1000
		});
	}

	/**
	 * Get cached contract by escrow ID
	 */
	getContractByEscrow(escrowId: string): ContractWithEvents | null {
		return this.get(this.contractsByEscrow, escrowId);
	}

	/**
	 * Invalidate specific contract
	 */
	invalidateContract(escrowId: string): void {
		this.contractsByEscrow.delete(escrowId);
	}

	/**
	 * Cache contracts by task
	 */
	setContractsByTask(taskId: string, contracts: ContractWithEvents[], ttlMinutes: number = this.DEFAULT_TTL_MINUTES): void {
		this.cleanup(this.contractsByTask);
		this.enforceLimit(this.contractsByTask);
		this.contractsByTask.set(taskId, {
			data: contracts,
			timestamp: Date.now(),
			ttl: ttlMinutes * 60 * 1000
		});
	}

	/**
	 * Get cached contracts by task
	 */
	getContractsByTask(taskId: string): ContractWithEvents[] | null {
		return this.get(this.contractsByTask, taskId);
	}

	/**
	 * Invalidate contracts for a task
	 */
	invalidateTaskContracts(taskId: string): void {
		this.contractsByTask.delete(taskId);
	}

	/**
	 * Cache contracts by user
	 */
	setContractsByUser(userId: string, contracts: ContractWithEvents[], ttlMinutes: number = this.DEFAULT_TTL_MINUTES): void {
		this.cleanup(this.contractsByUser);
		this.enforceLimit(this.contractsByUser);
		this.contractsByUser.set(userId, {
			data: contracts,
			timestamp: Date.now(),
			ttl: ttlMinutes * 60 * 1000
		});
	}

	/**
	 * Get cached contracts by user
	 */
	getContractsByUser(userId: string): ContractWithEvents[] | null {
		return this.get(this.contractsByUser, userId);
	}

	/**
	 * Invalidate user contracts
	 */
	invalidateUserContracts(userId: string): void {
		this.contractsByUser.delete(userId);
	}

	/**
	 * Clear all caches
	 */
	clearAll(): void {
		this.bidsByTask.clear();
		this.bidsByUser.clear();
		this.contractsByEscrow.clear();
		this.contractsByTask.clear();
		this.contractsByUser.clear();
	}

	/**
	 * Clear all bid-related caches
	 */
	clearBids(): void {
		this.bidsByTask.clear();
		this.bidsByUser.clear();
	}

	/**
	 * Clear all contract-related caches
	 */
	clearContracts(): void {
		this.contractsByEscrow.clear();
		this.contractsByTask.clear();
		this.contractsByUser.clear();
	}

	/**
	 * Generic get method with expiry check
	 */
	private get<T>(cache: Map<string, CacheEntry<T>>, key: string): T | null {
		const entry = cache.get(key);
		if (!entry) return null;

		// Check if expired
		if (Date.now() - entry.timestamp > entry.ttl) {
			cache.delete(key);
			return null;
		}

		return entry.data;
	}

	/**
	 * Clean up expired entries from a cache
	 */
	private cleanup<T>(cache: Map<string, CacheEntry<T>>): void {
		const now = Date.now();
		for (const [key, entry] of cache.entries()) {
			if (now - entry.timestamp > entry.ttl) {
				cache.delete(key);
			}
		}
	}

	/**
	 * Enforce cache size limit using LRU-like eviction
	 */
	private enforceLimit<T>(cache: Map<string, CacheEntry<T>>): void {
		if (cache.size >= this.MAX_CACHE_SIZE) {
			// Remove oldest entry (first key)
			const firstKey = cache.keys().next().value;
			if (firstKey) {
				cache.delete(firstKey);
			}
		}
	}
}

/**
 * Currency conversion cache for performance optimization
 */
export class CurrencyCache {
	private conversions = new Map<string, { sats: number; timestamp: number; ttl: number }>();

	setConversion(usdAmount: number, btcPrice: number, ttlMinutes: number = 10): number {
		const sats = Math.round((usdAmount / btcPrice) * 100000000); // Convert to sats
		const key = `${usdAmount}-${btcPrice}`;
		const ttl = ttlMinutes * 60 * 1000;

		this.conversions.set(key, {
			sats,
			timestamp: Date.now(),
			ttl
		});

		return sats;
	}

	getConversion(usdAmount: number, btcPrice: number): number | null {
		const key = `${usdAmount}-${btcPrice}`;
		const conversion = this.conversions.get(key);

		if (!conversion) return null;

		if (Date.now() - conversion.timestamp > conversion.ttl) {
			this.conversions.delete(key);
			return null;
		}

		return conversion.sats;
	}

	// Batch convert multiple amounts at once for better performance
	batchConvert(amounts: number[], btcPrice: number): number[] {
		return amounts.map((amount) => {
			const cached = this.getConversion(amount, btcPrice);
			if (cached !== null) {
				return cached;
			}
			return this.setConversion(amount, btcPrice);
		});
	}

	clear(): void {
		this.conversions.clear();
	}
}

// Global cache instances
export const bidCache = new BidCache();
export const smartCache = new SmartBidCache();
export const currencyCache = new CurrencyCache();

