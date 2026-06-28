/**
 * Swap Chain — Orchestrator
 *
 * Top-level orchestration for starting and resuming multi-hop swap chains.
 * Calls into executors, boltz, and state modules to drive the state machine.
 */

import * as Sentry from '@sentry/sveltekit';
import { createDebug } from '$lib/utils/debug';

import type { Route, SourceWallet, Destination } from '$lib/services/route-resolver';
import {
	type SwapChainState,
	INITIAL_SWAP_CHAIN_STATE,
	saveSwapChainState,
	loadSwapChainState,
	transitionTo,
	isTerminalPhase,
	setSwapProgress
} from './state';
import { executeHop } from './executors';
import { pollBoltzChainSwapCompletion } from './boltz';
import { BOLTZ_MAX_WAIT_MS } from './utils';

const d = createDebug('swap-chain');

/** Prevents concurrent swap executions (double-tap protection). */
let swapExecutionLock = false;

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

/**
 * Start executing a swap chain for the given route.
 *
 * Persists the initial state to Capacitor Preferences before executing the
 * first hop, so the chain can be resumed after interruption.
 *
 * @param route - The route to execute
 * @param sourceWallet - Source wallet identifier
 * @param destination - Destination for the funds
 * @param amount - Amount to swap/send (decimal string)
 * @returns The final swap chain state, or an error
 */
export async function startSwapChain(
	route: Route,
	sourceWallet: SourceWallet,
	destination: Destination,
	amount: string,
	sourceConnectedWalletId: string | null = null
): Promise<{ data: SwapChainState | null; error: Error | null }> {
	// Double-tap protection — prevent concurrent swap executions
	if (swapExecutionLock) {
		return { data: null, error: new Error('A swap is already in progress') };
	}
	swapExecutionLock = true;

	try {
		// 0. Parameter validation
		if (!route || !route.hops || !Array.isArray(route.hops)) {
			return { data: null, error: new Error('Invalid route: missing hops') };
		}
		if (!destination || !destination.type) {
			return { data: null, error: new Error('Invalid destination: missing type') };
		}

		// Validate amount is a valid positive number.
		// Individual hop executors handle precision conversion (parseDecimalToSmallestUnit).
		// This check only validates format, not unit conversion.
		const amountNum = Number(amount);
		if (Number.isNaN(amountNum) || !Number.isFinite(amountNum)) {
			return { data: null, error: new Error('Invalid amount: must be a finite number') };
		}
		if (amountNum <= 0) {
			return { data: null, error: new Error('Invalid amount: must be greater than zero') };
		}
		if (amountNum > 1_000_000_000) {
			return {
				data: null,
				error: new Error('Invalid amount: exceeds maximum allowed (1,000,000,000)')
			};
		}

		d.log(
			'startSwapChain: route=%s source=%s dest=%s amount=%s wallet=%s hops=%d',
			route.id,
			sourceWallet,
			destination.type,
			amount,
			sourceConnectedWalletId || 'builtin',
			route.hops.length
		);

		// Network guard
		if (typeof navigator !== 'undefined' && !navigator.onLine) {
			return { data: null, error: new Error('Device is offline — cannot start swap') };
		}

		// Sentry breadcrumb
		Sentry.addBreadcrumb({
			category: 'swap-chain',
			message: 'Swap chain started',
			data: { routeId: route.id, source: sourceWallet, hops: route.hops.length, amount }
		});

		// 1. Save initial state
		const initialState: SwapChainState = {
			...INITIAL_SWAP_CHAIN_STATE,
			route,
			sourceWallet,
			destination,
			amount,
			sourceConnectedWalletId,
			updatedAt: Date.now()
		};

		const { error: saveError } = await saveSwapChainState(initialState);
		if (saveError !== null) {
			return { data: null, error: saveError };
		}

		// 2. Execute hop 1
		const hop1 = route.hops[0];
		if (!hop1) {
			return { data: null, error: new Error('Route has no hops') };
		}

		d.log(
			'hop 1: service=%s from=%s/%s to=%s/%s',
			hop1.service,
			hop1.fromAsset,
			hop1.fromChain,
			hop1.toAsset,
			hop1.toChain
		);

		const pendingState1: SwapChainState = {
			...initialState,
			phase: 'SWAP_1_PENDING',
			updatedAt: Date.now()
		};

		const { error: savePendingError } = await saveSwapChainState(pendingState1);
		if (savePendingError !== null) {
			return { data: null, error: savePendingError };
		}

		const { data: hop1Id, error: hop1Error } = await executeHop(hop1, pendingState1, 0);
		d.log('hop 1 result: id=%s error=%s', hop1Id ?? 'null', hop1Error?.message ?? 'none');

		if (hop1Error !== null) {
			const { data: failedState, error: transitionError } = await transitionTo(
				{ ...pendingState1, route, sourceWallet, destination, amount },
				'FAILED',
				{ error: hop1Error.message }
			);
			if (transitionError !== null) {
				return { data: null, error: transitionError };
			}
			return { data: failedState, error: null };
		}

		// 3. Confirm hop 1
		const confirmedState1: SwapChainState = {
			...pendingState1,
			phase: 'SWAP_1_CONFIRMED',
			swap1Id: hop1Id,
			updatedAt: Date.now()
		};

		const { error: saveConfirmedError } = await saveSwapChainState(confirmedState1);
		if (saveConfirmedError !== null) {
			return { data: null, error: saveConfirmedError };
		}

		// 4. If single-hop route, mark complete
		if (route.hops.length === 1) {
			const { data: completeState, error: completeError } = await transitionTo(
				confirmedState1,
				'COMPLETE'
			);
			if (completeError !== null) {
				return { data: null, error: completeError };
			}
			return { data: completeState, error: null };
		}

		// 5. Execute hop 2 (multi-hop route)
		const hop2 = route.hops[1];
		if (!hop2) {
			return { data: null, error: new Error('Route has 2 hops defined but hop 2 is missing') };
		}

		// For 2-hop routes where hop 1 is Boltz: wait for the Boltz chain swap to
		// complete before executing hop 2. Boltz chain swaps are asynchronous —
		// the user sends rBTC to a lockup, then Boltz detects it, and sends tBTC
		// to the claim address on Arbitrum. This can take several minutes.
		// Without this wait, hop 2 (e.g. LI.FI tBTC→USDT0) would execute against
		// a zero tBTC balance and fail on-chain.
		if (hop1.service === 'boltz' && hop1Id) {
			d.log('hop 1 is Boltz (id=%s) — polling for completion before hop 2', hop1Id);
			setSwapProgress('waiting-for-boltz', 'Waiting for Boltz to confirm lockup on RSK...');
			const pollResult = await pollBoltzChainSwapCompletion(hop1Id, sourceConnectedWalletId);
			if (pollResult.error !== null) {
				d.error('Boltz completion poll failed: %s', pollResult.error.message);
				const { data: partialState, error: ptError } = await transitionTo(
					{ ...confirmedState1, swap1Id: hop1Id },
					'PARTIAL',
					{ error: `Boltz swap did not complete: ${pollResult.error.message}` }
				);
				if (ptError !== null) {
					return { data: null, error: ptError };
				}
				return { data: partialState, error: null };
			}
			d.log('Boltz swap completed — proceeding to hop 2');
			setSwapProgress('swapping-tbtc', 'tBTC claimed — swapping via LI.FI...');
		}

		d.log(
			'hop 2: service=%s from=%s/%s to=%s/%s',
			hop2.service,
			hop2.fromAsset,
			hop2.fromChain,
			hop2.toAsset,
			hop2.toChain
		);

		const pendingState2: SwapChainState = {
			...confirmedState1,
			phase: 'SWAP_2_PENDING',
			updatedAt: Date.now()
		};

		const { error: savePending2Error } = await saveSwapChainState(pendingState2);
		if (savePending2Error !== null) {
			return { data: null, error: savePending2Error };
		}

		const { data: hop2Id, error: hop2Error } = await executeHop(hop2, pendingState2, 1);

		if (hop2Error !== null) {
			const { data: partialState, error: partialTransitionError } = await transitionTo(
				{ ...pendingState2, swap1Id: hop1Id },
				'PARTIAL',
				{ error: hop2Error.message }
			);
			if (partialTransitionError !== null) {
				return { data: null, error: partialTransitionError };
			}
			return { data: partialState, error: null };
		}

		// 6. If hop 2 is Boltz: poll for chain swap completion before marking complete.
		// Boltz chain swaps are asynchronous — the user locks source token, Boltz locks
		// destination token, then the user claims. This can take several minutes.
		if (hop2.service === 'boltz' && hop2Id) {
			d.log('hop 2 is Boltz (id=%s) — polling for completion', hop2Id);
			setSwapProgress('waiting-for-boltz', 'Waiting for Boltz to complete chain swap...');

			const direction = hop2.fromAsset === 'TBTC' ? 'tbtc-to-rbtc' : 'rbtc-to-tbtc';
			const pollResult = await pollBoltzChainSwapCompletion(
				hop2Id,
				sourceConnectedWalletId,
				BOLTZ_MAX_WAIT_MS,
				direction
			);

			if (pollResult.error !== null) {
				d.error('Boltz hop 2 poll failed: %s', pollResult.error.message);
				const { data: partialState, error: ptError } = await transitionTo(
					{ ...pendingState2, swap1Id: hop1Id, swap2Id: hop2Id },
					'PARTIAL',
					{ error: `Boltz swap did not complete: ${pollResult.error.message}` }
				);
				if (ptError !== null) {
					return { data: null, error: ptError };
				}
				return { data: partialState, error: null };
			}

			d.log('Boltz hop 2 completed successfully');
		}

		// 7. Mark complete
		const { data: finalState, error: finalError } = await transitionTo(
			{
				...pendingState2,
				swap1Id: hop1Id,
				swap2Id: hop2Id
			},
			'COMPLETE'
		);

		if (finalError !== null) {
			return { data: null, error: finalError };
		}

		return { data: finalState, error: null };
	} finally {
		swapExecutionLock = false;
	}
}

// ---------------------------------------------------------------------------
// Resume
// ---------------------------------------------------------------------------

/**
 * Resume an interrupted swap chain from persisted state.
 *
 * Checks the current phase and attempts to advance if possible:
 * - SWAP_1_CONFIRMED with 2-hop route: executes hop 2
 * - SWAP_2_CONFIRMED: marks complete
 * - Terminal phases: returns as-is
 * - Pending phases: returns as-is (caller should verify externally)
 */
export async function resumeSwapChain(): Promise<{
	data: SwapChainState | null;
	error: Error | null;
}> {
	// Double-tap protection — prevent concurrent swap executions
	if (swapExecutionLock) {
		return { data: null, error: new Error('A swap is already in progress') };
	}
	swapExecutionLock = true;

	// Network guard
	if (typeof navigator !== 'undefined' && !navigator.onLine) {
		swapExecutionLock = false;
		return { data: null, error: new Error('Device is offline — cannot resume swap') };
	}

	try {
		const state = await loadSwapChainState();

		if (isTerminalPhase(state.phase)) {
			return { data: state, error: null };
		}

		// SWAP_2_CONFIRMED -> COMPLETE
		if (state.phase === 'SWAP_2_CONFIRMED') {
			const { data: completed, error: completeError } = await transitionTo(state, 'COMPLETE');
			if (completeError !== null) {
				return { data: null, error: completeError };
			}
			return { data: completed, error: null };
		}

		// SWAP_1_CONFIRMED with 2-hop route — execute hop 2
		if (state.phase === 'SWAP_1_CONFIRMED' && state.route && state.route.hops.length === 2) {
			const hop1 = state.route.hops[0];
			const hop2 = state.route.hops[1];
			if (!hop2) {
				return { data: null, error: new Error('Route has 2 hops defined but hop 2 is missing') };
			}

			// Poll Boltz completion before hop 2 (same logic as startSwapChain)
			if (hop1?.service === 'boltz' && state.swap1Id) {
				d.log('resume: hop 1 is Boltz (id=%s) — polling for completion', state.swap1Id);
				const pollResult = await pollBoltzChainSwapCompletion(
					state.swap1Id,
					state.sourceConnectedWalletId
				);
				if (pollResult.error !== null) {
					d.error('resume: Boltz poll failed: %s', pollResult.error.message);
					const { data: partialState, error: ptError } = await transitionTo(
						{ ...state },
						'PARTIAL',
						{
							error: `Boltz swap did not complete: ${pollResult.error.message}`
						}
					);
					if (ptError !== null) {
						return { data: null, error: ptError };
					}
					return { data: partialState, error: null };
				}
				d.log('resume: Boltz swap completed — proceeding to hop 2');
			}

			const pendingState2: SwapChainState = {
				...state,
				phase: 'SWAP_2_PENDING',
				updatedAt: Date.now()
			};

			const { error: saveError } = await saveSwapChainState(pendingState2);
			if (saveError !== null) {
				return { data: null, error: saveError };
			}

			const { data: hop2Id, error: hop2Error } = await executeHop(hop2, pendingState2, 1);
			d.log('resume: hop 2 result: id=%s error=%s', hop2Id ?? 'null', hop2Error?.message ?? 'none');

			if (hop2Error !== null) {
				const { data: partialState, error: ptError } = await transitionTo(
					{ ...pendingState2 },
					'PARTIAL',
					{ error: hop2Error.message }
				);
				if (ptError !== null) {
					return { data: null, error: ptError };
				}
				return { data: partialState, error: null };
			}

			// If hop 2 is Boltz: poll for chain swap completion before marking complete
			if (hop2.service === 'boltz' && hop2Id) {
				d.log('resume: hop 2 is Boltz (id=%s) — polling for completion', hop2Id);
				const direction = hop2.fromAsset === 'TBTC' ? 'tbtc-to-rbtc' : 'rbtc-to-tbtc';
				const pollResult = await pollBoltzChainSwapCompletion(
					hop2Id,
					state.sourceConnectedWalletId,
					BOLTZ_MAX_WAIT_MS,
					direction
				);
				if (pollResult.error !== null) {
					d.error('resume: Boltz hop 2 poll failed: %s', pollResult.error.message);
					const { data: partialState, error: ptError } = await transitionTo(
						{ ...pendingState2, swap2Id: hop2Id },
						'PARTIAL',
						{ error: `Boltz swap did not complete: ${pollResult.error.message}` }
					);
					if (ptError !== null) {
						return { data: null, error: ptError };
					}
					return { data: partialState, error: null };
				}
				d.log('resume: Boltz hop 2 completed');
			}

			const { data: completedState, error: completeError } = await transitionTo(
				{ ...pendingState2, swap2Id: hop2Id },
				'COMPLETE'
			);

			if (completeError !== null) {
				return { data: null, error: completeError };
			}

			return { data: completedState, error: null };
		}

		// SWAP_1_CONFIRMED with single-hop route — hop 1 is done, mark complete
		if (state.phase === 'SWAP_1_CONFIRMED' && state.route && state.route.hops.length === 1) {
			d.log('resume: single-hop SWAP_1_CONFIRMED — marking complete');
			const { data: completed, error: completeError } = await transitionTo(state, 'COMPLETE');
			if (completeError !== null) {
				return { data: null, error: completeError };
			}
			return { data: completed, error: null };
		}

		// SWAP_1_PENDING or SWAP_2_PENDING — return as-is for caller to verify
		return { data: state, error: null };
	} finally {
		swapExecutionLock = false;
	}
}

// ---------------------------------------------------------------------------
// State query
// ---------------------------------------------------------------------------

/**
 * Get the current swap chain state without performing any operations.
 */
export async function getSwapChainState(): Promise<SwapChainState> {
	return loadSwapChainState();
}
