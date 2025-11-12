import { writable } from 'svelte/store';
import { browser } from '$app/environment';

interface AcceptDisputeAttempt {
	escrowId: string;
	timestamp: number;
	transactionHash?: string;
	status: 'pending' | 'confirmed' | 'failed';
	type: 'accept' | 'dispute';
}

// In-memory cache for fast lookups
const acceptDisputeCache = new Map<string, AcceptDisputeAttempt>();

// Store for reactive updates
const acceptDisputeStore = writable<Map<string, AcceptDisputeAttempt>>(new Map());

// localStorage key
const STORAGE_KEY = 'bittasker_accept_dispute_cache';

// Cache size limits
const MAX_CACHE_SIZE = 100;
const PENDING_CLEANUP_AGE = 60 * 60 * 1000; // 1 hour
const CONFIRMED_CLEANUP_AGE = 24 * 60 * 60 * 1000; // 24 hours

// Debounced save timeout
let saveTimeout: NodeJS.Timeout | null = null;

/**
 * Clean up old entries from cache
 */
function cleanupOldEntries(cache: Map<string, AcceptDisputeAttempt>): Map<string, AcceptDisputeAttempt> {
	const now = Date.now();
	const cleaned = new Map<string, AcceptDisputeAttempt>();
	
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
function enforceSizeLimit(cache: Map<string, AcceptDisputeAttempt>): Map<string, AcceptDisputeAttempt> {
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
function saveToLocalStorage(cache: Map<string, AcceptDisputeAttempt>): void {
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
				acceptDisputeCache.clear();
				trimmed.forEach((value, key) => acceptDisputeCache.set(key, value));
				acceptDisputeStore.set(new Map(acceptDisputeCache));
			} catch (retryError) {
				console.error('Failed to save accept/dispute cache after cleanup:', retryError);
				// Fall back to in-memory only - cache will be lost on refresh
			}
		} else {
			console.error('Failed to save accept/dispute cache:', error);
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
			const parsed = JSON.parse(saved) as Array<[string, AcceptDisputeAttempt]>;
			const cache = new Map<string, AcceptDisputeAttempt>(parsed);
			
			// Clean up old entries
			const cleaned = cleanupOldEntries(cache);
			const trimmed = enforceSizeLimit(cleaned);
			
			// Update in-memory cache
			acceptDisputeCache.clear();
			trimmed.forEach((value, key) => acceptDisputeCache.set(key, value));
			acceptDisputeStore.set(new Map(acceptDisputeCache));
			
			// Save cleaned cache back
			saveToLocalStorage(trimmed);
		}
	} catch (error) {
		console.error('Failed to load accept/dispute cache:', error);
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
				const parsed = JSON.parse(e.newValue) as Array<[string, AcceptDisputeAttempt]>;
				const cache = new Map<string, AcceptDisputeAttempt>(parsed);
				
				// Update in-memory cache
				acceptDisputeCache.clear();
				cache.forEach((value, key) => acceptDisputeCache.set(key, value));
				acceptDisputeStore.set(new Map(acceptDisputeCache));
			} catch (error) {
				console.error('Failed to sync accept/dispute cache from storage event:', error);
			}
		}
	});
}

// Save to localStorage when cache changes (debounced)
acceptDisputeStore.subscribe((cache) => {
	if (!browser) return;
	
	// Debounce saves (500ms)
	if (saveTimeout) clearTimeout(saveTimeout);
	saveTimeout = setTimeout(() => {
		saveToLocalStorage(cache);
	}, 500);
});

/**
 * Atomic check-and-set: Register accept/dispute attempt if not already exists
 * Returns true if successfully registered, false if already exists
 */
export function registerAcceptDisputeAttemptAtomic(
	escrowId: string, 
	type: 'accept' | 'dispute',
	transactionHash?: string
): boolean {
	// Atomic check-and-set
	if (acceptDisputeCache.has(escrowId)) {
		return false; // Already exists
	}
	
	// Set immediately (atomic operation)
	const attempt: AcceptDisputeAttempt = {
		escrowId,
		timestamp: Date.now(),
		transactionHash,
		status: 'pending',
		type
	};
	
	acceptDisputeCache.set(escrowId, attempt);
	acceptDisputeStore.set(new Map(acceptDisputeCache));
	
	return true; // Successfully registered
}

/**
 * Register an accept/dispute attempt (non-atomic, use registerAcceptDisputeAttemptAtomic for safety)
 */
export function registerAcceptDisputeAttempt(
	escrowId: string,
	type: 'accept' | 'dispute',
	transactionHash?: string
): void {
	const attempt: AcceptDisputeAttempt = {
		escrowId,
		timestamp: Date.now(),
		transactionHash,
		status: 'pending',
		type
	};
	
	acceptDisputeCache.set(escrowId, attempt);
	acceptDisputeStore.set(new Map(acceptDisputeCache));
}

/**
 * Update accept/dispute attempt status
 */
export function updateAcceptDisputeStatus(
	escrowId: string, 
	status: 'confirmed' | 'failed',
	transactionHash?: string
): void {
	const attempt = acceptDisputeCache.get(escrowId);
	if (attempt) {
		attempt.status = status;
		if (transactionHash) {
			attempt.transactionHash = transactionHash;
		}
		attempt.timestamp = Date.now(); // Update timestamp
		acceptDisputeCache.set(escrowId, attempt);
		acceptDisputeStore.set(new Map(acceptDisputeCache));
	}
}

/**
 * Check if accept/dispute was already attempted
 */
export function hasAcceptDisputeAttempt(escrowId: string): boolean {
	return acceptDisputeCache.has(escrowId);
}

/**
 * Get accept/dispute attempt
 */
export function getAcceptDisputeAttempt(escrowId: string): AcceptDisputeAttempt | null {
	return acceptDisputeCache.get(escrowId) || null;
}

/**
 * Get accept attempt (if exists)
 */
export function getAcceptAttempt(escrowId: string): AcceptDisputeAttempt | null {
	const attempt = acceptDisputeCache.get(escrowId);
	return attempt && attempt.type === 'accept' ? attempt : null;
}

/**
 * Get dispute attempt (if exists)
 */
export function getDisputeAttempt(escrowId: string): AcceptDisputeAttempt | null {
	const attempt = acceptDisputeCache.get(escrowId);
	return attempt && attempt.type === 'dispute' ? attempt : null;
}

/**
 * Clear accept/dispute attempt (on failure, allow retry)
 */
export function clearAcceptDisputeAttempt(escrowId: string): void {
	acceptDisputeCache.delete(escrowId);
	acceptDisputeStore.set(new Map(acceptDisputeCache));
}

/**
 * Clear all accept/dispute attempts (cleanup)
 */
export function clearAllAcceptDisputeAttempts(): void {
	acceptDisputeCache.clear();
	acceptDisputeStore.set(new Map());
	if (browser) {
		try {
			localStorage.removeItem(STORAGE_KEY);
		} catch {
			// Ignore errors
		}
	}
}

// Export store for reactive subscriptions
export { acceptDisputeStore };

