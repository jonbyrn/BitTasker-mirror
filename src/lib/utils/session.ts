/**
 * Session Management Module
 *
 * Provides centralized session cleanup functionality to ensure all user-specific
 * data is properly cleared when a user logs out. This prevents stale data from
 * persisting when a new user logs in.
 *
 * Usage:
 * - Called automatically by auth.store.ts on logout
 * - Can also be called manually if needed for testing or edge cases
 */

// Import stores
import { appStore } from '$lib/stores/app.store';
import { contractStore } from '$lib/stores/contract.store';
import { bidStore } from '$lib/stores/bid.store';
import { tasksStore, myTasksStore } from '$lib/stores/task.store';
import { profileStore } from '$lib/stores/profile.store';

// Import cache utilities
import { nostrEventCache } from '$lib/stores/user.store';
import { profileCache } from '$lib/utils/profile-cache';
import { smartCache, currencyCache } from '$lib/utils/cache/bid-cache';

// Import nostr cleanup functions
import { cleanup as cleanupFindTasks } from '$lib/nostr/findTasks';
import { cleanupMyTasks } from '$lib/nostr/findMyTasks';

// Import wallet manager for cleanup
import { walletManager } from '$lib/stores/wallet.store';

/**
 * Clear all module-level caches
 * These are Map/Set instances that persist across component lifecycles
 */
function clearAllCaches(): void {
	// User store event cache
	nostrEventCache.clear();

	// Profile cache (24-hour TTL cache)
	profileCache.clear();

	// Bid and contract caches
	smartCache.clearAll();
	currencyCache.clear();

	// Task search caches
	cleanupFindTasks();
	cleanupMyTasks();

	if (import.meta.env.DEV) {
		console.debug('[Session] All caches cleared');
	}
}

/**
 * Reset all user-specific stores to their initial state
 * This ensures no stale data persists between user sessions
 */
function resetAllStores(): void {
	// Reset app store user-specific state (nostrKeys, biometricData)
	appStore.resetUserState();

	// Reset contract store (includes closing Nostr subscriptions)
	contractStore.reset();

	// Reset bid store (includes closing Nostr subscriptions)
	bidStore.reset();

	// Reset task stores
	tasksStore.reset();
	myTasksStore.reset();

	// Reset profile store (includes closing Nostr subscriptions)
	profileStore.reset();

	// Reset wallet store (disconnect wallet, clear swap storages)
	walletManager.cleanup();

	if (import.meta.env.DEV) {
		console.debug('[Session] All stores reset');
	}
}

/**
 * Complete session cleanup
 *
 * Call this function when a user logs out to ensure:
 * 1. All Nostr subscriptions are closed
 * 2. All caches are cleared
 * 3. All stores are reset to initial state
 * 4. Wallet is disconnected
 *
 * This prevents stale data from the previous user from appearing
 * when a new user logs in.
 */
export async function clearSession(): Promise<void> {
	if (import.meta.env.DEV) {
		console.debug('[Session] Starting session cleanup...');
	}

	try {
		// Reset all stores first (this also closes Nostr subscriptions)
		resetAllStores();

		// Clear all caches
		clearAllCaches();

		if (import.meta.env.DEV) {
			console.debug('[Session] Session cleanup complete');
		}
	} catch (error) {
		console.error('[Session] Error during session cleanup:', error);
		// Don't throw - we want logout to succeed even if cleanup has issues
	}
}

/**
 * Partial cleanup for specific scenarios
 * Use these when you need to clear specific parts of the session
 */
export const sessionUtils = {
	clearCaches: clearAllCaches,
	resetStores: resetAllStores
};
