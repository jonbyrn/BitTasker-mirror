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
import { bidStore } from '$lib/stores/bid.store';
import { tasksStore, myTasksStore } from '$lib/stores/task.store';
import { profileStore } from '$lib/stores/profile.store';

// Import cache utilities
import { nostrEventCache, user } from '$lib/stores/user.store';
import { profileCache } from '$lib/utils/profile-cache';
import { ContractRune } from '$lib/runes/contract.svelte';

// Import nostr cleanup functions
import { cleanup as cleanupFindTasks } from '$lib/nostr/findTasks';
import { cleanupMyTasks } from '$lib/nostr/findMyTasks';

// Import wallet manager for cleanup
import { walletManager } from '$lib/stores/wallet.store';
import { clearWalletAccountCache, walletOwnerId } from '$lib/stores/wallet/wallet-account';
import { muteStore } from '$lib/stores/mute.store';
import { notificationCenterStore } from '$lib/stores/notificationCenter.store';
import { reviewStore } from '$lib/stores/review.store';
import { Preferences } from '@capacitor/preferences';
import { StorageKeys } from './constants/storage';

/**
 * Keys that belong to the DEVICE, not the user, and should survive logout.
 * Theme, language, onboarding, device ID, app version, and warning acknowledgement
 * are device-level preferences that a new user on the same device would expect to keep.
 */
const DEVICE_LEVEL_KEYS: Set<string> = new Set([
	StorageKeys.ONBOARDING_COMPLETED,
	StorageKeys.LANGUAGE_PREFERENCE_KEY,
	StorageKeys.THEME,
	StorageKeys.DEVICE_UNIQUE_ID,
	StorageKeys.APP_VERSION,
	StorageKeys.LAST_SYNC,
	StorageKeys.WARNING_ACKNOWLEDGED
]);

/**
 * Clear all user-specific Capacitor Preferences while preserving device-level settings.
 * Uses Preferences.keys() to discover ALL stored keys — including those defined
 * outside StorageKeys (e.g. service quote ledgers, balance history caches).
 */
async function clearUserPreferences(): Promise<void> {
	const { keys } = await Preferences.keys();
	const keysToRemove = keys.filter((key) => !DEVICE_LEVEL_KEYS.has(key));

	await Promise.all(keysToRemove.map((key) => Preferences.remove({ key })));

	if (import.meta.env.DEV) {
		console.debug(`[Session] Cleared ${keysToRemove.length} user Preferences keys`);
	}
}

/**
 * Clear all module-level caches
 * These are Map/Set instances that persist across component lifecycles
 */
function clearAllCaches(): void {
	// User store event cache
	nostrEventCache.clear();

	// Profile cache (24-hour TTL cache)
	profileCache.clear();

	// Native ContractRune registry
	ContractRune.clearRegistry();

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

	// NDK subscriptions auto-cleanup on signout

	// Reset bid store (includes closing Nostr subscriptions)
	bidStore.reset();

	// Reset task stores
	tasksStore.reset();
	myTasksStore.reset();

	// Reset profile store (includes closing Nostr subscriptions)
	profileStore.reset();

	// Reset wallet store (disconnect wallet, clear swap storages)
	walletManager.cleanup();

	// Reset user store
	user.reset();

	// Reset mute store
	muteStore.reset();

	// Reset notification center store (clears badge on native)
	notificationCenterStore.reset();

	// Reset review store (clears in-flight requests and cached review state)
	reviewStore.reset();

	if (import.meta.env.DEV) {
		console.debug('[Session] All stores reset');
	}
}

/**
 * Full local session destruction.
 *
 * Clears all user-specific Preferences (preserving device-level settings like
 * theme, language, and onboarding), resets every store, and wipes every
 * in-memory cache. Does NOT call any backend endpoint — callers that need
 * server-side revocation should do so before calling this.
 *
 * Used by:
 *  - auth.store `logout()` (after the server-side /logout call)
 *  - axios interceptor `clearTokensAndRedirect()` (tokens already invalid)
 */
export async function destroySession(): Promise<void> {
	try {
		const owner = walletOwnerId();
		clearWalletAccountCache(owner);
		const [{ clearCancelledReceives }, { clearWalletSnapshots }, { clearEscrowHistory }, { clearPaidProofs }] =
			await Promise.all([
				import('$lib/stores/wallet/wallet-balances'),
				import('$lib/stores/wallet/wallet-snapshot'),
				import('$lib/stores/wallet/escrow-history'),
				import('$lib/runes/contract.svelte')
			]);
		clearCancelledReceives(owner);
		clearEscrowHistory();
		clearPaidProofs();
		await clearWalletSnapshots(owner);
		// Clear all user-specific Preferences (auth tokens, drafts, filters, etc.)
		// while preserving device-level settings (theme, language, onboarding, device ID)
		await clearUserPreferences();
		// Reset stores + caches (reuse existing helpers)
		resetAllStores();
		clearAllCaches();
	} catch {
		// best-effort
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
