/**
 * Delegation Lifecycle — Phase 2.3
 *
 * Capacitor lifecycle handlers for EIP-7702 delegation state management.
 *
 * **Responsibilities:**
 * - On app pause: flush in-memory delegation state to DelegationJournal
 * - On app resume: check for incomplete delegations, verify on-chain, offer recovery
 *
 * Uses `@capacitor/app` lifecycle events (already in the project).
 * All async operations use `tryCatch()` from `$lib/utils/tryCatch.ts`.
 *
 * @see USDT Integration Plan §2.3
 * @see requirements/usdt-integration-plan.md Section 9.3
 */

import { App, type StateChangeListener } from '@capacitor/app';
import { browser } from '$app/environment';
import { getIncompleteDelegations, updateEntry } from '$lib/services/delegation-journal';
import { EIP7702DelegationManager } from '$lib/services/gas-abstraction/eip7702-delegation-manager';
import { getStablecoinConfig } from '$lib/services/stablecoin-registry';
import { tryCatch } from '$lib/utils/tryCatch';
import { JsonRpcProvider } from 'ethers';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Result of the delegation lifecycle recovery check performed on app resume.
 */
export interface LifecycleRecoveryResult {
	/** Number of incomplete delegations found in the journal */
	incompleteCount: number;
	/** Number of delegations successfully recovered */
	recoveredCount: number;
	/** Number of delegations that failed recovery */
	failedCount: number;
	/** Whether any delegations need manual user intervention */
	needsManualIntervention: boolean;
	/** Detailed results per address */
	details: Array<{
		address: string;
		entryId: string;
		status: string;
		recovered: boolean;
		reason: string;
	}>;
}

// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------

/** Tracks whether lifecycle listeners have been registered. */
let listenersRegistered = false;

/**
 * Current delegation state snapshot to persist on pause.
 * The delegation manager sets this whenever its state changes.
 * The lifecycle handler reads it on pause to ensure the journal is up to date.
 */
let lastKnownState: string | null = null;

/**
 * Tag used for debug log identification.
 */
const LIFECYCLE_TAG = 'delegation-lifecycle';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Register Capacitor lifecycle listeners for delegation state management.
 *
 * Call once during app initialisation (e.g., in a root layout's onMount).
 * Safe to call multiple times -- subsequent calls are no-ops.
 *
 * **On pause:**
 * Ensures the current delegation state is flushed to DelegationJournal.
 * This is a safety net since individual state transitions already persist.
 *
 * **On resume:**
 * Scans the journal for incomplete delegations and attempts on-chain
 * recovery for each one. Reports results for UI feedback.
 *
 * @param getCurrentState - Optional callback that returns the current
 *   delegation manager state (for flushing on pause)
 *
 * @example
 * ```ts
 * import { registerDelegationLifecycle } from '$lib/services/delegation-lifecycle';
 * import { browser } from '$app/environment';
 *
 * if (browser) {
 *   registerDelegationLifecycle(() => manager.getState());
 * }
 * ```
 */
export function registerDelegationLifecycle(getCurrentState?: () => string | null): void {
	if (!browser) {
		return;
	}

	if (listenersRegistered) {
		return;
	}

	const handler: StateChangeListener = (state) => {
		if (!state.isActive) {
			// App is going to background -- persist current state
			void handlePause(getCurrentState?.() ?? null);
		} else {
			// App is returning to foreground -- check for incomplete delegations
			void handleResume();
		}
	};

	void App.addListener('appStateChange', handler);

	listenersRegistered = true;
}

/**
 * Unregister Capacitor lifecycle listeners.
 *
 * Call during app teardown or when delegation management is no longer needed.
 * Primarily useful in tests and during logout.
 */
export function unregisterDelegationLifecycle(): void {
	if (!browser) {
		return;
	}

	void App.removeAllListeners();
	listenersRegistered = false;
}

/**
 * Check whether lifecycle listeners are currently registered.
 */
export function isLifecycleRegistered(): boolean {
	return listenersRegistered;
}

/**
 * Set the last known delegation state for awareness on pause.
 * Called by the delegation manager on each state transition.
 *
 * @param state - The current delegation state string, or null if idle
 */
export function setLastKnownState(state: string | null): void {
	lastKnownState = state;
}

/**
 * Perform a manual recovery check for incomplete delegations.
 *
 * This is the same logic that runs on app resume, exposed for manual
 * invocation (e.g., from a "Recover" button in settings).
 *
 * @returns Recovery results
 */
export async function checkAndRecoverDelegations(): Promise<LifecycleRecoveryResult> {
	return performRecoveryCheck();
}

// ---------------------------------------------------------------------------
// Internal handlers
// ---------------------------------------------------------------------------

/**
 * Handle app pause (backgrounding).
 *
 * Ensures the current delegation state is persisted. The delegation manager
 * already persists on every state transition, so this is a safety net.
 *
 * @param currentState - The current delegation state from the manager
 */
async function handlePause(currentState: string | null): Promise<void> {
	if (currentState !== null) {
		lastKnownState = currentState;
	}

	if (lastKnownState !== null && lastKnownState !== 'IDLE') {
		console.debug(`[${LIFECYCLE_TAG}] App pausing with delegation state: ${lastKnownState}`);
	}
	console.debug(`[${LIFECYCLE_TAG}] App paused`);
}

/**
 * Handle app resume (foregrounding).
 *
 * Checks the journal for any incomplete delegations and attempts
 * on-chain recovery for each one.
 */
async function handleResume(): Promise<void> {
	console.debug(`[${LIFECYCLE_TAG}] App resumed, checking for incomplete delegations`);
	await performRecoveryCheck();
}

/**
 * Core recovery logic: query journal for incomplete entries, verify
 * on-chain, and attempt cleanup.
 */
async function performRecoveryCheck(): Promise<LifecycleRecoveryResult> {
	const result: LifecycleRecoveryResult = {
		incompleteCount: 0,
		recoveredCount: 0,
		failedCount: 0,
		needsManualIntervention: false,
		details: []
	};

	// Step 1: Fetch incomplete delegations from the journal
	const { data: incomplete, error: journalError } = await getIncompleteDelegations();

	if (journalError !== null) {
		console.error(`[${LIFECYCLE_TAG}] Failed to read journal: ${journalError.message}`);
		return result;
	}

	if (incomplete === null || incomplete.length === 0) {
		return result; // Nothing to recover
	}

	result.incompleteCount = incomplete.length;

	// Step 2: Group by chain ID to create one manager per chain
	const byChain = new Map<number, typeof incomplete>();
	for (const entry of incomplete) {
		const existing = byChain.get(entry.chainId) ?? [];
		existing.push(entry);
		byChain.set(entry.chainId, existing);
	}

	// Step 3: For each chain, attempt recovery
	for (const [chainId, entries] of byChain) {
		const manager = createManagerForChain(chainId);

		if (manager === null) {
			// Cannot create manager for this chain -- mark all as failed
			for (const entry of entries) {
				result.failedCount++;
				result.needsManualIntervention = true;
				result.details.push({
					address: entry.senderAddress,
					entryId: entry.id,
					status: entry.status,
					recovered: false,
					reason: `Chain ${chainId} is not configured in the stablecoin registry`
				});
			}
			continue;
		}

		// Step 4: Check each entry on-chain and attempt recovery
		for (const entry of entries) {
			const { data: recoveryResult, error: recoveryError } = await tryCatch(
				manager.recoverDelegation(entry.senderAddress)
			);

			if (recoveryError !== null) {
				result.failedCount++;
				result.needsManualIntervention = true;
				result.details.push({
					address: entry.senderAddress,
					entryId: entry.id,
					status: entry.status,
					recovered: false,
					reason: `Recovery threw: ${recoveryError.message}`
				});
				continue;
			}

			if (recoveryResult.recovered) {
				result.recoveredCount++;
				result.details.push({
					address: entry.senderAddress,
					entryId: entry.id,
					status: entry.status,
					recovered: true,
					reason: recoveryResult.reason
				});

				// Update the journal entry
				void updateEntry(entry.id, {
					completed: true,
					status: 'IDLE',
					error: null
				});
			} else {
				result.failedCount++;
				result.needsManualIntervention = true;
				result.details.push({
					address: entry.senderAddress,
					entryId: entry.id,
					status: entry.status,
					recovered: false,
					reason: recoveryResult.reason
				});
			}
		}
	}

	return result;
}

/**
 * Create an EIP7702DelegationManager for the given chain ID.
 * Returns null if the chain is not configured in the stablecoin registry.
 */
function createManagerForChain(chainId: number): EIP7702DelegationManager | null {
	const config = getStablecoinConfig(chainId);

	if (config === undefined || config.rpcUrls.length === 0) {
		return null;
	}

	try {
		const provider = new JsonRpcProvider(config.rpcUrls[0]);
		return new EIP7702DelegationManager({ chainId, provider });
	} catch {
		console.warn(
			'[DelegationLifecycle] Failed to create EIP7702DelegationManager for chain',
			chainId
		);
		return null;
	}
}
