/**
 * Swap Chain — Orchestrator Helpers
 *
 * Shared helpers for Boltz polling and state management used by both
 * startSwapChain and resumeSwapChain. Encapsulates the repeated pattern
 * of polling Boltz for chain swap completion and transitioning to PARTIAL on error.
 */

import { createDebug } from '$lib/utils/debug';

import type { SwapChainState } from './state';
import { transitionTo, setSwapProgress, type SwapProgressStep } from './state';
import { pollBoltzChainSwapCompletion } from './boltz';

const d = createDebug('swap-chain');

/**
 * Resolve the Boltz swap direction from the source asset symbol.
 *
 * TBTC→RBTC means tBTC is locked on Arbitrum and rBTC is claimed on RSK.
 * All other Boltz swaps in this codebase are RBTC→TBTC (or RBTC→tBTC).
 */
export function resolveBoltzDirection(fromAsset: string): 'rbtc-to-tbtc' | 'tbtc-to-rbtc' {
	return fromAsset.toUpperCase() === 'TBTC' ? 'tbtc-to-rbtc' : 'rbtc-to-tbtc';
}

// ---------------------------------------------------------------------------
// Poll and handle Boltz swap completion
// ---------------------------------------------------------------------------

/** Parameters for {@link pollAndHandleBoltzSwap}. */
export interface PollAndHandleBoltzSwapParams {
	/** The Boltz swap ID to poll. */
	swapId: string;

	/** Connected wallet ID for the swap (null = built-in BitTasker wallet). */
	sourceConnectedWalletId: string | null;

	/** Maximum time to wait for the swap to complete (defaults to BOLTZ_MAX_WAIT_MS). */
	maxWaitMs?: number;

	/** Swap direction for claim routing. */
	direction: 'rbtc-to-tbtc' | 'tbtc-to-rbtc';

	/**
	 * State to use as base for the PARTIAL transition on poll error.
	 * Should include the swap ID(s) that were being polled.
	 */
	stateForPartial: SwapChainState;

	/**
	 * Optional progress step/message to display while polling.
	 * If omitted, no progress update is emitted (caller manages progress).
	 */
	progressStep?: SwapProgressStep;

	/** Progress message to show while polling (required if progressStep is set). */
	progressMessage?: string;

	/** Debug log context label (e.g. 'startSwapChain', 'resumeSwapChain'). */
	logContext: string;
}

/**
 * Poll a Boltz chain swap for completion. On failure, transitions the swap
 * chain to PARTIAL state and returns it for the caller to propagate.
 *
 * **Return semantics** (follows project `{ data, error }` convention):
 * - `{ data: null, error: null }` — swap completed successfully; caller should continue
 * - `{ data: partialState, error: null }` — swap failed; transitioned to PARTIAL; caller should return this
 * - `{ data: null, error: Error }` — `transitionTo` itself failed; caller should return this error
 *
 * @example
 * ```ts
 * const result = await pollAndHandleBoltzSwap({
 *   swapId: hop1Id,
 *   sourceConnectedWalletId,
 *   direction: 'rbtc-to-tbtc',
 *   stateForPartial: { ...confirmedState, swap1Id: hop1Id },
 *   progressStep: 'waiting-for-boltz',
 *   progressMessage: 'Waiting for Boltz to confirm lockup...',
 *   logContext: 'startSwapChain',
 * });
 * if (result.error !== null || result.data !== null) return result;
 * // Poll succeeded — continue execution
 * ```
 */
export async function pollAndHandleBoltzSwap(
	params: PollAndHandleBoltzSwapParams
): Promise<{ data: SwapChainState | null; error: Error | null }> {
	d.log(
		'[%s] Polling Boltz swap %s (direction=%s, maxWait=%s)',
		params.logContext,
		params.swapId,
		params.direction,
		params.maxWaitMs ?? 'default'
	);

	if (params.progressStep && params.progressMessage) {
		setSwapProgress(params.progressStep, params.progressMessage);
	}

	const pollResult = await pollBoltzChainSwapCompletion(
		params.swapId,
		params.sourceConnectedWalletId,
		params.maxWaitMs,
		params.direction
	);

	if (pollResult.error !== null) {
		d.log(
			'[%s] ═══ PARTIAL ═══ Boltz poll failed for %s: %s',
			params.logContext,
			params.swapId,
			pollResult.error.message
		);

		const { data: partialState, error: ptError } = await transitionTo(
			params.stateForPartial,
			'PARTIAL',
			{ error: `Boltz swap did not complete: ${pollResult.error.message}` }
		);

		if (ptError !== null) {
			return { data: null, error: ptError };
		}
		return { data: partialState, error: null };
	}

	d.log('[%s] Boltz swap %s completed successfully', params.logContext, params.swapId);
	return { data: null, error: null };
}
