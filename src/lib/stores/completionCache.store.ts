import { writable } from 'svelte/store';
import { browser } from '$app/environment';
import { EscrowStatus } from '$lib/utils/enums/wallet.enum';

interface CompleteCancelAttempt {
	escrowId: string;
	timestamp: number;
	transactionHash?: string;
	status: 'pending' | 'confirmed' | 'failed';
	type: 'complete' | 'cancel';
}

// In-memory cache for fast lookups
const completionCache = new Map<string, CompleteCancelAttempt>();

// Store for reactive updates
const completionStore = writable<Map<string, CompleteCancelAttempt>>(new Map());

// localStorage key
const STORAGE_KEY = 'bittasker_completion_cache';

// Cache size limits
const MAX_CACHE_SIZE = 100;
const PENDING_CLEANUP_AGE = 60 * 60 * 1000; // 1 hour
const CONFIRMED_CLEANUP_AGE = 24 * 60 * 60 * 1000; // 24 hours

// Debounced save timeout
let saveTimeout: NodeJS.Timeout | null = null;

/**
 * Clean up old entries from cache
 */
function cleanupOldEntries(cache: Map<string, CompleteCancelAttempt>): Map<string, CompleteCancelAttempt> {
	const now = Date.now();
	const cleaned = new Map<string, CompleteCancelAttempt>();
	
	for (const [escrowId, attempt] of cache.entries()) {
		const age = now - attempt.timestamp;
		
		// Keep pending entries less than 1 hour old
		if (attempt.status === 'pending' && age < PENDING_CLEANUP_AGE) {
			cleaned.set(escrowId, attempt);
		}
		// Keep confirmed entries less than 24 hours old
		else if (attempt.status === 'confirmed' && age < CONFIRMED_CLEANUP_AGE) {
			cleaned.set(escrowId, attempt);
		}
		// Keep failed entries (allow retry)
		else if (attempt.status === 'failed') {
			// Failed entries expire after 1 hour
			if (age < PENDING_CLEANUP_AGE) {
				cleaned.set(escrowId, attempt);
			}
		}
	}
	
	return cleaned;
}

/**
 * Enforce cache size limit by removing oldest entries
 */
function enforceSizeLimit(cache: Map<string, CompleteCancelAttempt>): Map<string, CompleteCancelAttempt> {
	if (cache.size <= MAX_CACHE_SIZE) {
		return cache;
	}
	
	// Sort by timestamp (oldest first) and remove excess
	const entries = Array.from(cache.entries()).sort((a, b) => a[1].timestamp - b[1].timestamp);
	const trimmed = new Map(entries.slice(-MAX_CACHE_SIZE));
	
	return trimmed;
}

/**
 * Save cache to localStorage with quota handling
 */
function saveToLocalStorage(cache: Map<string, CompleteCancelAttempt>): void {
	if (!browser) return;
	
	try {
		const entries = Array.from(cache.entries());
		const data = JSON.stringify(entries);
		localStorage.setItem(STORAGE_KEY, data);
	} catch (error) {
		if (error instanceof Error && error.name === 'QuotaExceededError') {
			console.warn('localStorage quota exceeded, cleaning up old entries');
			
			// Clean up old entries and retry
			const cleaned = cleanupOldEntries(cache);
			const trimmed = enforceSizeLimit(cleaned);
			
			try {
				const entries = Array.from(trimmed.entries());
				const data = JSON.stringify(entries);
				localStorage.setItem(STORAGE_KEY, data);
				
				// Update in-memory cache
				completionCache.clear();
				trimmed.forEach((value, key) => completionCache.set(key, value));
				completionStore.set(new Map(completionCache));
			} catch (retryError) {
				console.error('Failed to save completion cache after cleanup:', retryError);
				// Fall back to in-memory only - cache will be lost on refresh
			}
		} else {
			console.error('Failed to save completion cache:', error);
		}
	}
}

/**
 * Load cache from localStorage
 */
function loadFromLocalStorage(): void {
	if (!browser) return;
	
		try {
			const saved = localStorage.getItem(STORAGE_KEY);
			if (saved) {
				const parsed = JSON.parse(saved) as Array<[string, CompleteCancelAttempt | CompletionAttempt]>;
				// Migrate old format (without type) to new format (with type)
				const cache = new Map<string, CompleteCancelAttempt>();
				parsed.forEach(([escrowId, attempt]) => {
					// If old format (no type field), default to 'complete'
					if ('type' in attempt) {
						cache.set(escrowId, attempt as CompleteCancelAttempt);
					} else {
						// Migrate old CompletionAttempt to new CompleteCancelAttempt
						cache.set(escrowId, {
							...attempt,
							type: 'complete' // Default old attempts to 'complete'
						});
					}
				});
			
			// Clean up old entries
			const cleaned = cleanupOldEntries(cache);
			const trimmed = enforceSizeLimit(cleaned);
			
			// Update in-memory cache
			completionCache.clear();
			trimmed.forEach((value, key) => completionCache.set(key, value));
			completionStore.set(new Map(completionCache));
			
			// Save cleaned cache back
			saveToLocalStorage(trimmed);
		}
	} catch (error) {
		console.error('Failed to load completion cache:', error);
		// Clear corrupted cache
		try {
			localStorage.removeItem(STORAGE_KEY);
		} catch {
			// Ignore cleanup errors
		}
	}
}

// Load from localStorage on init
if (browser) {
	loadFromLocalStorage();
	
	// Listen for storage events (multi-tab synchronization)
	window.addEventListener('storage', (e) => {
		if (e.key === STORAGE_KEY && e.newValue) {
			try {
				const parsed = JSON.parse(e.newValue) as Array<[string, CompleteCancelAttempt | CompletionAttempt]>;
				// Migrate old format (without type) to new format (with type)
				const cache = new Map<string, CompleteCancelAttempt>();
				parsed.forEach(([escrowId, attempt]) => {
					// If old format (no type field), default to 'complete'
					if ('type' in attempt) {
						cache.set(escrowId, attempt as CompleteCancelAttempt);
					} else {
						// Migrate old CompletionAttempt to new CompleteCancelAttempt
						cache.set(escrowId, {
							...attempt,
							type: 'complete' // Default old attempts to 'complete'
						});
					}
				});
				
				// Update in-memory cache
				completionCache.clear();
				cache.forEach((value, key) => completionCache.set(key, value));
				completionStore.set(new Map(completionCache));
			} catch (error) {
				console.error('Failed to sync completion cache from storage event:', error);
			}
		}
	});
}

// Save to localStorage when cache changes (debounced)
completionStore.subscribe((cache) => {
	if (!browser) return;
	
	// Debounce saves (500ms)
	if (saveTimeout) clearTimeout(saveTimeout);
	saveTimeout = setTimeout(() => {
		saveToLocalStorage(cache);
	}, 500);
});

/**
 * Atomic check-and-set: Register complete/cancel attempt if not already exists
 * Returns true if successfully registered, false if already exists
 * This prevents race conditions - only one action (complete OR cancel) can be registered at a time
 */
export function registerCompleteCancelAttemptAtomic(
	escrowId: string,
	type: 'complete' | 'cancel',
	transactionHash?: string
): boolean {
	// Atomic check-and-set - checks if ANY attempt exists (complete OR cancel)
	if (completionCache.has(escrowId)) {
		return false; // Already exists (either complete or cancel)
	}
	
	// Set immediately (atomic operation)
	const attempt: CompleteCancelAttempt = {
		escrowId,
		timestamp: Date.now(),
		transactionHash,
		status: 'pending',
		type
	};
	
	completionCache.set(escrowId, attempt);
	completionStore.set(new Map(completionCache));
	
	return true; // Successfully registered
}

/**
 * @deprecated Use registerCompleteCancelAttemptAtomic instead
 * Kept for backward compatibility
 */
export function registerCompletionAttemptAtomic(escrowId: string, transactionHash?: string): boolean {
	return registerCompleteCancelAttemptAtomic(escrowId, 'complete', transactionHash);
}

/**
 * Register a complete/cancel attempt (non-atomic, use registerCompleteCancelAttemptAtomic for safety)
 */
export function registerCompleteCancelAttempt(
	escrowId: string,
	type: 'complete' | 'cancel',
	transactionHash?: string
): void {
	const attempt: CompleteCancelAttempt = {
		escrowId,
		timestamp: Date.now(),
		transactionHash,
		status: 'pending',
		type
	};
	
	completionCache.set(escrowId, attempt);
	completionStore.set(new Map(completionCache));
}

/**
 * @deprecated Use registerCompleteCancelAttempt instead
 * Kept for backward compatibility
 */
export function registerCompletionAttempt(escrowId: string, transactionHash?: string): void {
	registerCompleteCancelAttempt(escrowId, 'complete', transactionHash);
}

/**
 * Update complete/cancel attempt status
 */
export function updateCompleteCancelStatus(
	escrowId: string,
	status: 'confirmed' | 'failed',
	transactionHash?: string
): void {
	const attempt = completionCache.get(escrowId);
	if (attempt) {
		attempt.status = status;
		if (transactionHash) {
			attempt.transactionHash = transactionHash;
		}
		attempt.timestamp = Date.now(); // Update timestamp
		completionCache.set(escrowId, attempt);
		completionStore.set(new Map(completionCache));
	}
}

/**
 * Check if completion was already attempted
 */
export function hasCompletionAttempt(escrowId: string): boolean {
	return completionCache.has(escrowId);
}

/**
 * Get complete/cancel attempt (any type)
 */
export function getCompleteCancelAttempt(escrowId: string): CompleteCancelAttempt | null {
	return completionCache.get(escrowId) || null;
}

/**
 * Get complete attempt (if exists)
 */
export function getCompleteAttempt(escrowId: string): CompleteCancelAttempt | null {
	const attempt = completionCache.get(escrowId);
	return attempt && attempt.type === 'complete' ? attempt : null;
}

/**
 * Get cancel attempt (if exists)
 */
export function getCancelAttempt(escrowId: string): CompleteCancelAttempt | null {
	const attempt = completionCache.get(escrowId);
	return attempt && attempt.type === 'cancel' ? attempt : null;
}

/**
 * @deprecated Use getCompleteAttempt instead
 * Kept for backward compatibility
 */
export function getCompletionAttempt(escrowId: string): CompleteCancelAttempt | null {
	return getCompleteAttempt(escrowId);
}

/**
 * Clear completion attempt (on failure, allow retry)
 */
export function clearCompletionAttempt(escrowId: string): void {
	completionCache.delete(escrowId);
	completionStore.set(new Map(completionCache));
}

/**
 * Clear all completion attempts (cleanup)
 */
export function clearAllCompletionAttempts(): void {
	completionCache.clear();
	completionStore.set(new Map());
	if (browser) {
		try {
			localStorage.removeItem(STORAGE_KEY);
		} catch {
			// Ignore errors
		}
	}
}

// Export store for reactive subscriptions
export { completionStore };

