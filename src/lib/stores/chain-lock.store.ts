/**
 * Chain Lock Store — Phase 2.4
 *
 * Prevents chain switching during active transactions.
 *
 * When a gas-abstraction transaction is in progress on a specific chain,
 * the UI must prevent the user from switching to a different chain until
 * the transaction completes. This store provides the locking mechanism.
 *
 * **Single-writer principle:** This store is the ONLY source of truth for
 * chain lock state. All mutations go through the exported functions below.
 *
 * @see USDT Integration Plan §2.4
 * @see requirements/usdt-integration-plan.md Section 9.4
 */

import { writable, derived } from 'svelte/store';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Chain lock state.
 */
export interface ChainLockState {
	/** Whether the chain is currently locked */
	isLocked: boolean;
	/** The chain ID that is locked, or null if not locked */
	lockedChainId: number | null;
}

// ---------------------------------------------------------------------------
// Store implementation
// ---------------------------------------------------------------------------

/**
 * Internal writable store for chain lock state.
 * Initialised to unlocked state.
 */
const { subscribe, update, set } = writable<ChainLockState>({
	isLocked: false,
	lockedChainId: null
});

/**
 * A derived store that is `true` when the chain is locked.
 */
export const isLocked = derived({ subscribe }, ($state) => $state.isLocked);

/**
 * A derived store containing the locked chain ID, or `null`.
 */
export const lockedChainId = derived({ subscribe }, ($state) => $state.lockedChainId);

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

/**
 * Acquire the chain lock for a specific chain.
 *
 * Prevents the UI from switching chains until the lock is released.
 * Throws if the lock is already held for a different chain.
 *
 * @param chainId - The EVM chain ID to lock
 * @throws {Error} If the lock is already held for a different chain
 */
function acquireLock(chainId: number): void {
	update((state) => {
		if (state.isLocked && state.lockedChainId !== chainId) {
			throw new Error(
				`Cannot acquire lock for chain ${chainId}: ` +
					`lock is already held for chain ${state.lockedChainId}. ` +
					'Release the current lock before switching chains.'
			);
		}

		return {
			isLocked: true,
			lockedChainId: chainId
		};
	});
}

/**
 * Release the chain lock.
 *
 * Allows the UI to switch chains again.
 */
function releaseLock(): void {
	set({ isLocked: false, lockedChainId: null });
}

/**
 * Check whether the chain is currently locked.
 *
 * @returns `true` if any chain is locked
 */
function isChainLocked(): boolean {
	let locked = false;
	subscribe((state) => {
		locked = state.isLocked;
	})();
	return locked;
}

/**
 * Require that the given chain ID matches the locked chain.
 *
 * Throws if the lock is active and the chain ID does not match.
 * This is a safety guard to prevent operations on the wrong chain.
 *
 * @param chainId - The chain ID to verify
 * @throws {Error} If the lock is active and chainId does not match
 */
function requireChain(chainId: number): void {
	let state: ChainLockState = { isLocked: false, lockedChainId: null };
	subscribe((s) => {
		state = s;
	})();

	if (state.isLocked && state.lockedChainId !== chainId) {
		throw new Error(
			`Chain mismatch: transaction in progress on chain ${state.lockedChainId}, ` +
				`but operation requested for chain ${chainId}. ` +
				'Complete the current transaction before switching chains.'
		);
	}
}

// ---------------------------------------------------------------------------
// Singleton export
// ---------------------------------------------------------------------------

export const chainLock = {
	subscribe,
	acquireLock,
	releaseLock,
	isChainLocked,
	requireChain
};
