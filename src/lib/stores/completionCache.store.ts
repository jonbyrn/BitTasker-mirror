import { writable } from 'svelte/store';
import { browser } from '$app/environment';
import { EscrowStatus } from '$lib/utils/enums/wallet.enum';

interface CompletionAttempt {
	escrowId: string;
	timestamp: number;
	transactionHash?: string;
	status: 'pending' | 'confirmed' | 'failed';
}

// In-memory cache for fast lookups
const completionCache = new Map<string, CompletionAttempt>();

// Store for reactive updates
const completionStore = writable<Map<string, CompletionAttempt>>(new Map());

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
function cleanupOldEntries(cache: Map<string, CompletionAttempt>): Map<string, CompletionAttempt> {
	const now = Date.now();
	const cleaned = new Map<string, CompletionAttempt>();
	
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
function enforceSizeLimit(cache: Map<string, CompletionAttempt>): Map<string, CompletionAttempt> {
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
function saveToLocalStorage(cache: Map<string, CompletionAttempt>): void {
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
			const parsed = JSON.parse(saved) as Array<[string, CompletionAttempt]>;
			const cache = new Map<string, CompletionAttempt>(parsed);
			
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
				const parsed = JSON.parse(e.newValue) as Array<[string, CompletionAttempt]>;
				const cache = new Map<string, CompletionAttempt>(parsed);
				
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
 * Atomic check-and-set: Register completion attempt if not already exists
 * Returns true if successfully registered, false if already exists
 */
export function registerCompletionAttemptAtomic(escrowId: string, transactionHash?: string): boolean {
	// Atomic check-and-set
	if (completionCache.has(escrowId)) {
		return false; // Already exists
	}
	
	// Set immediately (atomic operation)
	const attempt: CompletionAttempt = {
		escrowId,
		timestamp: Date.now(),
		transactionHash,
		status: 'pending'
	};
	
	completionCache.set(escrowId, attempt);
	completionStore.set(new Map(completionCache));
	
	return true; // Successfully registered
}

/**
 * Register a completion attempt (non-atomic, use registerCompletionAttemptAtomic for safety)
 */
export function registerCompletionAttempt(escrowId: string, transactionHash?: string): void {
	const attempt: CompletionAttempt = {
		escrowId,
		timestamp: Date.now(),
		transactionHash,
		status: 'pending'
	};
	
	completionCache.set(escrowId, attempt);
	completionStore.set(new Map(completionCache));
}

/**
 * Update completion attempt status
 */
export function updateCompletionStatus(
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
 * Get completion attempt
 */
export function getCompletionAttempt(escrowId: string): CompletionAttempt | null {
	return completionCache.get(escrowId) || null;
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

