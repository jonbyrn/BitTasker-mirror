/**
 * Swap Store — Phase 2.5
 *
 * Writable Svelte store for managing Changelly swap transaction state.
 *
 * Tracks the lifecycle of a swap from estimation through creation, status
 * polling, and completion. Maintains a history of completed swaps for
 * reference in the UI.
 *
 * **Single-writer principle:** This store is the ONLY source of truth for
 * swap transaction state. All mutations go through the exported functions
 * below.
 *
 * @see requirements/usdt-integration-plan.md §2.5
 */

import { writable, derived, get } from 'svelte/store';
import { changellyService } from '$lib/services/changelly.service';
import { createDebug } from '$lib/utils/debug';
import { tryCatch } from '$lib/utils/tryCatch';
import { FEATURE_FLAGS, FeatureFlagService } from '$lib/services/kill-switch';

const debug = createDebug('swap-store');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Lifecycle status of the current swap operation.
 */
export type CurrentSwapStatus =
	| 'idle'
	| 'estimating'
	| 'confirming'
	| 'creating'
	| 'polling'
	| 'completed'
	| 'failed';

/**
 * The currently active swap being created or tracked.
 * Null when no swap is in progress.
 */
export interface CurrentSwap {
	/** Current lifecycle status */
	status: CurrentSwapStatus;
	/** Source currency ticker */
	fromToken: string;
	/** Destination currency ticker */
	toToken: string;
	/** Amount to send in source currency */
	fromAmount: string;
	/** Expected amount to receive in destination currency */
	toAmount: string;
	/** Transaction hash on the destination chain, if available */
	txHash?: string;
	/** Changelly swap ID, once created */
	swapId?: string;
	/** Human-readable error message if the swap failed */
	error?: string;
}

/**
 * A completed swap recorded in the history.
 */
export interface CompletedSwap {
	/** Changelly swap ID */
	id: string;
	/** Source currency ticker */
	fromToken: string;
	/** Destination currency ticker */
	toToken: string;
	/** Amount sent in source currency */
	fromAmount: string;
	/** Amount received in destination currency */
	toAmount: string;
	/** Final status from Changelly */
	status: string;
	/** ISO 8601 creation timestamp */
	createdAt: string;
	/** ISO 8601 completion timestamp, if known */
	completedAt?: string;
}

/**
 * Full swap store state.
 */
export interface SwapStoreState {
	/** The currently active swap, or null if idle */
	currentSwap: CurrentSwap | null;
	/** Historical completed swaps */
	swapHistory: CompletedSwap[];
}

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

const initialState: SwapStoreState = {
	currentSwap: null,
	swapHistory: []
};

// ---------------------------------------------------------------------------
// Store implementation
// ---------------------------------------------------------------------------

const swapStoreWritable = writable<SwapStoreState>(initialState);
const { subscribe, update, set } = swapStoreWritable;

// ---------------------------------------------------------------------------
// Derived stores
// ---------------------------------------------------------------------------

/**
 * Derived store that is `true` when a swap operation is in progress.
 */
export const isSwapActive = derived(
	swapStoreWritable,
	($state) => $state.currentSwap !== null && $state.currentSwap.status !== 'idle'
);

/**
 * Derived store containing the current swap, or `null`.
 */
export const currentSwap = derived(swapStoreWritable, ($state) => $state.currentSwap);

/**
 * Derived store containing the swap history array.
 */
export const swapHistory = derived(swapStoreWritable, ($state) => $state.swapHistory);

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

/**
 * Initialise a new swap by estimating conversion and persisting intent to the store.
 *
 * 1. Checks the feature flag is enabled.
 * 2. Calls `changellyService.estimateSwap()` to get the expected output amount.
 * 3. Stores the swap intent as `currentSwap` in `'confirming'` state.
 *
 * @param params - Swap parameters (currencies and amount)
 * @returns The estimated result for UI confirmation
 * @throws {Error} If the feature flag is disabled
 */
async function initiateSwap(params: EstimateThenSwapParams): Promise<EstimateThenSwapResult> {
	debug.log('initiateSwap: %s %s -> %s', params.fromAmount, params.fromToken, params.toToken);

	if (!FeatureFlagService.isEnabled(FEATURE_FLAGS.CHANGELLY_SWAPS)) {
		const error = 'Changelly swaps are not enabled';
		debug.warn(error);
		throw new Error(error);
	}

	// Set estimating state
	update((state) => ({
		...state,
		currentSwap: {
			status: 'estimating',
			fromToken: params.fromToken,
			toToken: params.toToken,
			fromAmount: params.fromAmount,
			toAmount: ''
		}
	}));

	const { data: estimate, error: estimateError } = await tryCatch(
		changellyService.estimateSwap({
			from: params.fromToken,
			to: params.toToken,
			amount: params.fromAmount
		})
	);

	if (estimateError || !estimate) {
		const message = estimateError?.message || 'Failed to estimate swap';
		debug.error('Estimate failed: %s', message);

		update((state) => ({
			...state,
			currentSwap: {
				status: 'failed',
				fromToken: params.fromToken,
				toToken: params.toToken,
				fromAmount: params.fromAmount,
				toAmount: '',
				error: message
			}
		}));

		return { success: false, error: message };
	}

	// Store estimate and move to confirming state
	update((state) => ({
		...state,
		currentSwap: {
			status: 'confirming',
			fromToken: params.fromToken,
			toToken: params.toToken,
			fromAmount: params.fromAmount,
			toAmount: estimate.estimatedAmount
		}
	}));

	debug.log('Estimate received: %s -> %s', estimate.estimatedAmount, estimate.rate);

	return {
		success: true,
		estimatedAmount: estimate.estimatedAmount,
		rate: estimate.rate,
		fee: estimate.fee,
		minerFee: estimate.minerFee
	};
}

/**
 * Confirm the current swap and submit it to Changelly.
 *
 * 1. Validates that `currentSwap` is in `'confirming'` state.
 * 2. Calls `changellyService.createSwap()` with the stored parameters.
 * 3. Transitions to `'polling'` state after creation.
 *
 * @param destinationAddress - The wallet address to receive swapped funds
 * @param refundAddress - Optional refund address if the swap fails
 * @returns The created swap details
 */
async function confirmAndCreateSwap(
	destinationAddress: string,
	refundAddress?: string
): Promise<ConfirmSwapResult> {
	debug.log('confirmAndCreateSwap');

	const state = get({ subscribe });
	const swap = state.currentSwap;

	if (!swap || swap.status !== 'confirming') {
		const error = 'No swap pending confirmation';
		debug.warn(error);
		return { success: false, error };
	}

	// Transition to creating state
	update((s) => ({
		...s,
		currentSwap: { ...swap, status: 'creating' }
	}));

	const { data: created, error: createError } = await tryCatch(
		changellyService.createSwap({
			from: swap.fromToken,
			to: swap.toToken,
			amount: swap.fromAmount,
			address: destinationAddress,
			...(refundAddress ? { refundAddress } : {})
		})
	);

	if (createError || !created) {
		const message = createError?.message || 'Failed to create swap';
		debug.error('Create swap failed: %s', message);

		update((s) => ({
			...s,
			currentSwap: {
				...swap,
				status: 'failed',
				error: message
			}
		}));

		return { success: false, error: message };
	}

	// Move to polling state
	update((s) => ({
		...s,
		currentSwap: {
			status: 'polling',
			fromToken: swap.fromToken,
			toToken: swap.toToken,
			fromAmount: swap.fromAmount,
			toAmount: swap.toAmount,
			swapId: created.id
		}
	}));

	debug.log('Swap created: %s', created.id);

	return {
		success: true,
		swapId: created.id,
		payinAddress: created.payinAddress
	};
}

/**
 * Poll the current swap's status from Changelly.
 *
 * Transitions the store:
 * - `'finished'` -> `'completed'` and records to history
 * - `'failed'` / `'refunded'` -> `'failed'` with error
 * - Other statuses remain in `'polling'`
 *
 * @returns The current status of the swap
 */
async function pollSwapStatus(): Promise<PollStatusResult> {
	const state = get({ subscribe });
	const swap = state.currentSwap;

	if (!swap || !swap.swapId) {
		return { status: 'idle', swapId: null };
	}

	if (swap.status !== 'polling') {
		debug.warn('pollSwapStatus called when not in polling state (current: %s)', swap.status);
		return { status: swap.status as PollStatusResult['status'], swapId: swap.swapId };
	}

	debug.log('Polling swap: %s', swap.swapId);

	const { data: statusData, error: pollError } = await tryCatch(
		changellyService.getSwapStatus(swap.swapId)
	);

	if (pollError) {
		debug.error('Poll failed: %s', pollError.message);
		return { status: 'polling', swapId: swap.swapId, error: pollError.message };
	}

	switch (statusData.status) {
		case 'finished': {
			debug.log('Swap completed: %s', swap.swapId);

			const completed: CompletedSwap = {
				id: swap.swapId,
				fromToken: swap.fromToken,
				toToken: swap.toToken,
				fromAmount: swap.fromAmount,
				toAmount: swap.toAmount,
				status: statusData.status,
				createdAt: statusData.createdAt,
				completedAt: statusData.updatedAt
			};

			update((s) => ({
				currentSwap: {
					...swap,
					status: 'completed'
				},
				swapHistory: [completed, ...s.swapHistory]
			}));

			return { status: 'completed', swapId: swap.swapId };
		}

		case 'failed':
		case 'refunded': {
			const message = `Swap ${statusData.status}`;
			debug.warn('Swap ended: %s', message);

			update((s) => ({
				...s,
				currentSwap: {
					...swap,
					status: 'failed',
					error: message
				}
			}));

			return { status: 'failed', swapId: swap.swapId, error: message };
		}

		default: {
			// Still in progress (confirming, exchanging, sending, waiting)
			debug.log('Swap status: %s', statusData.status);
			return { status: 'polling', swapId: swap.swapId };
		}
	}
}

/**
 * Clear the current swap from the store, resetting to idle state.
 * Does NOT clear swap history.
 */
function clearCurrentSwap(): void {
	debug.log('clearCurrentSwap');
	update((state) => ({
		...state,
		currentSwap: null
	}));
}

/**
 * Reset the store to initial state (clears both current swap and history).
 */
function reset(): void {
	debug.log('reset');
	set(initialState);
}

// ---------------------------------------------------------------------------
// Supporting types for mutation return values
// ---------------------------------------------------------------------------

/**
 * Parameters for initiating a swap estimation.
 */
export interface EstimateThenSwapParams {
	fromToken: string;
	toToken: string;
	fromAmount: string;
}

/**
 * Result of the initiateSwap operation.
 */
export interface EstimateThenSwapResult {
	success: boolean;
	estimatedAmount?: string;
	rate?: string;
	fee?: string;
	minerFee?: string;
	error?: string;
}

/**
 * Result of confirming and creating a swap.
 */
export interface ConfirmSwapResult {
	success: boolean;
	swapId?: string;
	payinAddress?: string;
	error?: string;
}

/**
 * Result of polling swap status.
 */
export interface PollStatusResult {
	status: 'idle' | 'polling' | 'completed' | 'failed';
	swapId: string | null;
	error?: string;
}

// ---------------------------------------------------------------------------
// Singleton export
// ---------------------------------------------------------------------------

export const swapStore = {
	subscribe,
	initiateSwap,
	confirmAndCreateSwap,
	pollSwapStatus,
	clearCurrentSwap,
	reset
};
