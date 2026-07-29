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
	resetSwapChainState,
	transitionTo,
	isTerminalPhase,
	setSwapProgress
} from './state';
import { executeHop } from './executors';
import { pollBoltzChainSwapCompletion } from './boltz';
import { BOLTZ_MAX_WAIT_MS } from './utils';
import { resolveBoltzDirection, pollAndHandleBoltzSwap } from './orchestrator-helpers';

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

		const hopServices = route.hops.map((h) => h.service).join(' → ');
		d.log(
			'[startSwapChain] ═══ START ═══ route=%s hops=%d services=%s amount=%s source=%s dest=%s wallet=%s',
			route.id,
			route.hops.length,
			hopServices,
			amount,
			sourceWallet,
			destination.type,
			sourceConnectedWalletId || 'builtin'
		);
		d.log(
			'startSwapChain: route=%s source=%s dest=%s amount=%s wallet=%s hops=%d services=%s',
			route.id,
			sourceWallet,
			destination.type,
			amount,
			sourceConnectedWalletId || 'builtin',
			route.hops.length,
			hopServices
		);

		// Network guard
		if (typeof navigator !== 'undefined' && !navigator.onLine) {
			d.log('[startSwapChain] ABORT: device is offline');
			return { data: null, error: new Error('Device is offline — cannot start swap') };
		}

		// Sentry breadcrumb
		Sentry.addBreadcrumb({
			category: 'swap-chain',
			message: 'Swap chain started',
			data: {
				routeId: route.id,
				source: sourceWallet,
				hops: route.hops.length,
				amount,
				services: hopServices
			}
		});

		// Ensure wallet is initialized before executing any hops.
		// On fresh page load, rsk.address may be empty until initWallet() completes.
		d.log('[startSwapChain] Step 0: ensuring wallet initialized...');
		const { getRSKAddress } = await import('$lib/stores/wallet.store');
		const resolvedAddr = await getRSKAddress();
		d.log('[startSwapChain] getRSKAddress returned=%s', resolvedAddr || 'EMPTY');
		if (!resolvedAddr) {
			d.log('[startSwapChain] ABORT: wallet not initialized');
			return { data: null, error: new Error('Wallet not initialized — cannot start swap') };
		}

		// 1. Save initial state
		d.log('[startSwapChain] Step 1: saving initial swap chain state...');
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
			'[startSwapChain] Step 2: executing hop 0 — service=%s from=%s/%s to=%s/%s',
			hop1.service,
			hop1.fromAsset,
			hop1.fromChain,
			hop1.toAsset,
			hop1.toChain
		);
		Sentry.addBreadcrumb({
			category: 'swap-chain',
			message: `Executing hop 0: ${hop1.service} (${hop1.fromAsset}→${hop1.toAsset})`,
			data: {
				service: hop1.service,
				from: `${hop1.fromAsset}/${hop1.fromChain}`,
				to: `${hop1.toAsset}/${hop1.toChain}`
			}
		});
		d.log(
			'hop 1: service=%s from=%s/%s to=%s/%s',
			hop1.service,
			hop1.fromAsset,
			hop1.fromChain,
			hop1.toAsset,
			hop1.toChain
		);

		// Reserve relay fee buffer for single-hop Arbitrum routes.
		// The gasless relay batches the swap and a fee transfer in the same
		// executeBatch — the swap amount must leave enough tokens for the fee
		// transfer. Without this, the swap consumes the full balance and the
		// fee transfer reverts (ExecuteError at last call index).
		//
		// We use FEE_BUFFER_MAX as a guaranteed-safe reserve. The exact fee
		// depends on the gas usage of the actual swap calls, which isn't known
		// until the quote is fetched. FEE_BUFFER_MAX is the upper bound for
		// the token, so it's always sufficient. The executor will get the real
		// fee estimate from the backend after fetching the quote, and the
		// actual feeBuffer used in the executeBatch will be the real estimate.
		//
		// For cross-chain bridges (e.g., GasZip, Stargate V2), we also add
		// BRIDGE_GAS_RESERVE to cover the bridge's internal gas/protocol fees
		// that are pulled via transferFrom on top of the quoted fromAmount.
		//
		// For multi-hop routes, this is set before hop 2 (see Step 5b).
		let relayFeeBufferWei: string | null = null;
		if (
			route.hops.length === 1 &&
			hop1.fromChain === 'Arbitrum' &&
			hop1.fromAsset !== 'RBTC'
		) {
			try {
				const { FEE_BUFFER_MAX, BRIDGE_GAS_RESERVE, getTokenBySymbol } = await import('$lib/wallet/gasless.config');
				const tokenInfo = getTokenBySymbol(hop1.fromAsset);
				if (tokenInfo) {
					const addrLower = tokenInfo.address.toLowerCase();
					const maxBuffer = FEE_BUFFER_MAX[addrLower];
					if (maxBuffer) {
						let totalReserve = maxBuffer;

						// For cross-chain swaps, add bridge gas reserve
						const isCrossChain = hop1.fromChain !== hop1.toChain;
						if (isCrossChain) {
							const bridgeReserve = BRIDGE_GAS_RESERVE[addrLower];
							if (bridgeReserve) {
								totalReserve = maxBuffer + bridgeReserve;
								d.log(
									'[startSwapChain] bridge gas reserve added: %s wei (cross-chain %s→%s)',
									bridgeReserve.toString(),
									hop1.fromChain,
									hop1.toChain
								);
							}
						}

						relayFeeBufferWei = totalReserve.toString();
						d.log(
							'[startSwapChain] relay fee reserved: %s wei (%s) %s',
							relayFeeBufferWei,
							hop1.fromAsset,
							isCrossChain ? '(cross-chain with bridge gas)' : '(same-chain)'
						);
					}
				}
			} catch (feeErr) {
				d.warn('[startSwapChain] relay fee reservation failed (non-blocking): %s', (feeErr as Error).message);
			}
		}

		const pendingState1: SwapChainState = {
			...initialState,
			phase: 'SWAP_1_PENDING',
			relayFeeBuffer: relayFeeBufferWei,
			updatedAt: Date.now()
		};

		const { error: savePendingError } = await saveSwapChainState(pendingState1);
		if (savePendingError !== null) {
			return { data: null, error: savePendingError };
		}

		const { data: hop1Id, error: hop1Error } = await executeHop(hop1, pendingState1, 0);
		d.log(
			'[startSwapChain] hop1 result: id=%s error=%s',
			hop1Id ?? 'null',
			hop1Error?.message ?? 'none'
		);
		d.log('hop 1 result: id=%s error=%s', hop1Id ?? 'null', hop1Error?.message ?? 'none');

		if (hop1Error !== null) {
			d.log('[startSwapChain] ═══ FAILED ═══ hop 0 error: %s', hop1Error.message);
			Sentry.addBreadcrumb({
				category: 'swap-chain',
				message: `Hop 0 failed: ${hop1Error.message}`,
				level: 'error'
			});
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
			d.log('[startSwapChain] Step 4: single-hop route — service=%s', hop1.service);

			// For Boltz chain swaps, the hop only sends the lockup transaction.
			// Boltz then needs to release funds on the destination chain, and the
			// user must claim them. We MUST poll for completion before marking
			// COMPLETE — otherwise the swap is stuck with funds locked on both chains.
			if (hop1.service === 'boltz' && hop1Id) {
				d.log(
					'[startSwapChain] Step 4a: single-hop Boltz (id=%s) — polling for claim completion',
					hop1Id
				);
				const direction = resolveBoltzDirection(hop1.fromAsset);
				const pollResult = await pollAndHandleBoltzSwap({
					swapId: hop1Id,
					sourceConnectedWalletId,
					direction,
					stateForPartial: { ...confirmedState1, swap1Id: hop1Id },
					progressStep: 'waiting-for-boltz',
					progressMessage:
						direction === 'tbtc-to-rbtc'
							? 'Waiting for Boltz to confirm lockup on RSK...'
							: 'Waiting for Boltz to confirm lockup on Arbitrum...',
					logContext: 'startSwapChain'
				});
				if (pollResult.error !== null || pollResult.data !== null) return pollResult;
				d.log('[startSwapChain] Single-hop Boltz swap completed — marking COMPLETE');
			}

			Sentry.addBreadcrumb({
				category: 'swap-chain',
				message: 'Single-hop route complete',
				data: { routeId: route.id, swap1Id: hop1Id }
			});
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
			d.log(
				'[startSwapChain] Step 5a: hop 0 is boltz (id=%s) — polling for completion before hop 1',
				hop1Id
			);
			d.log('hop 1 is Boltz (id=%s) — polling for completion before hop 2', hop1Id);
			const pollResult = await pollAndHandleBoltzSwap({
				swapId: hop1Id,
				sourceConnectedWalletId,
				direction: 'rbtc-to-tbtc',
				stateForPartial: { ...confirmedState1, swap1Id: hop1Id },
				progressStep: 'waiting-for-boltz',
				progressMessage: 'Waiting for Boltz to confirm lockup on RSK...',
				logContext: 'startSwapChain'
			});
			if (pollResult.error !== null || pollResult.data !== null) return pollResult;
			d.log('[startSwapChain] Boltz hop 0 completed — proceeding to hop 1');
			d.log('Boltz swap completed — proceeding to hop 2');
			setSwapProgress('swapping-tbtc', 'tBTC claimed — swapping via LI.FI...');

			// Log the expected tBTC balance for debugging hop 2 failures
			d.log(
				'[startSwapChain] hop 2 will execute: service=%s from=%s→%s, state.amount=%s',
				hop2.service,
				hop2.fromAsset,
				hop2.toAsset,
				confirmedState1.amount
			);
		}

		d.log(
			'[startSwapChain] Step 5b: executing hop 1 — service=%s from=%s/%s to=%s/%s',
			hop2.service,
			hop2.fromAsset,
			hop2.fromChain,
			hop2.toAsset,
			hop2.toChain
		);

		// Reserve relay fee for hop 2 so executors can cap swap amount to
		// `balance - relayFeeBuffer`, preventing "transfer amount exceeds balance"
		// when the swap input token is also used for gasless fee payment.
		// Uses FEE_BUFFER_MAX as a guaranteed-safe reserve (same as single-hop).
		// For cross-chain hops, also adds BRIDGE_GAS_RESERVE.
		relayFeeBufferWei = null;
		try {
			const { FEE_BUFFER_MAX, BRIDGE_GAS_RESERVE, getTokenBySymbol } = await import('$lib/wallet/gasless.config');
			const tokenInfo = getTokenBySymbol(hop2.fromAsset);
			if (tokenInfo) {
				const addrLower = tokenInfo.address.toLowerCase();
				const maxBuffer = FEE_BUFFER_MAX[addrLower];
				if (maxBuffer) {
					let totalReserve = maxBuffer;

					const isCrossChain = hop2.fromChain !== hop2.toChain;
					if (isCrossChain) {
						const bridgeReserve = BRIDGE_GAS_RESERVE[addrLower];
						if (bridgeReserve) {
							totalReserve = maxBuffer + bridgeReserve;
						}
					}

					relayFeeBufferWei = totalReserve.toString();
					d.log(
						'[startSwapChain] relay fee reserved for hop 2: %s wei (%s) %s',
						relayFeeBufferWei,
						hop2.fromAsset,
						isCrossChain ? '(cross-chain with bridge gas)' : '(same-chain)'
					);
				}
			}
		} catch (feeErr) {
			d.warn('[startSwapChain] relay fee reservation failed (non-blocking): %s', (feeErr as Error).message);
		}

		Sentry.addBreadcrumb({
			category: 'swap-chain',
			message: `Executing hop 1: ${hop2.service} (${hop2.fromAsset}→${hop2.toAsset})`,
			data: {
				service: hop2.service,
				from: `${hop2.fromAsset}/${hop2.fromChain}`,
				to: `${hop2.toAsset}/${hop2.toChain}`
			}
		});
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
			relayFeeBuffer: relayFeeBufferWei,
			updatedAt: Date.now()
		};

		const { error: savePending2Error } = await saveSwapChainState(pendingState2);
		if (savePending2Error !== null) {
			return { data: null, error: savePending2Error };
		}

		d.log(
			'[startSwapChain] hop2 starting: service=%s from=%s/%s to=%s/%s',
			hop2.service,
			hop2.fromAsset,
			hop2.fromChain,
			hop2.toAsset,
			hop2.toChain
		);
		const { data: hop2Id, error: hop2Error } = await executeHop(hop2, pendingState2, 1);
		d.log(
			'[startSwapChain] hop2 result: id=%s error=%s',
			hop2Id ?? 'null',
			hop2Error?.message ?? 'none'
		);

		if (hop2Error !== null) {
			d.log('[startSwapChain] ═══ PARTIAL ═══ hop 1 error: %s', hop2Error.message);
			Sentry.addBreadcrumb({
				category: 'swap-chain',
				message: `Hop 1 failed: ${hop2Error.message}`,
				level: 'error'
			});
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

		// Save swap2Id immediately so PendingSwaps can show the Boltz swap
		// even while the poll is running.
		if (hop2Id) {
			const stateWithSwap2: SwapChainState = {
				...pendingState2,
				swap1Id: hop1Id,
				swap2Id: hop2Id,
				updatedAt: Date.now()
			};
			await saveSwapChainState(stateWithSwap2);
			d.log('[startSwapChain] saved swap2Id=%s to state', hop2Id);
		}

		// 6. If hop 2 is Boltz: poll for chain swap completion before marking complete.
		// Boltz chain swaps are asynchronous — the user locks source token, Boltz locks
		// destination token, then the user claims. This can take several minutes.
		if (hop2.service === 'boltz' && hop2Id) {
			const direction = resolveBoltzDirection(hop2.fromAsset);
			d.log(
				'[startSwapChain] Step 6: hop 1 is boltz (id=%s) — polling for completion, direction=%s',
				hop2Id,
				direction
			);
			d.log('hop 2 is Boltz (id=%s) — polling for completion, direction=%s', hop2Id, direction);
			Sentry.addBreadcrumb({
				category: 'swap-chain',
				message: `Polling Boltz hop 1: ${hop2Id}`,
				data: { swapId: hop2Id, direction }
			});

			const pollResult = await pollAndHandleBoltzSwap({
				swapId: hop2Id,
				sourceConnectedWalletId,
				maxWaitMs: BOLTZ_MAX_WAIT_MS,
				direction,
				stateForPartial: { ...pendingState2, swap1Id: hop1Id, swap2Id: hop2Id },
				progressStep: 'waiting-for-boltz',
				progressMessage: 'Waiting for Boltz to complete chain swap...',
				logContext: 'startSwapChain'
			});
			if (pollResult.error !== null || pollResult.data !== null) return pollResult;
			d.log('[startSwapChain] Boltz hop 1 completed successfully');
			d.log('Boltz hop 2 completed successfully');
		}

		// 7. Mark complete — must transition through SWAP_2_CONFIRMED first
		// (state machine requires: SWAP_2_PENDING → SWAP_2_CONFIRMED → COMPLETE)
		d.log(
			'[startSwapChain] Step 7: marking swap chain COMPLETE (swap1Id=%s swap2Id=%s)',
			hop1Id ?? 'null',
			hop2Id ?? 'null'
		);
		Sentry.addBreadcrumb({
			category: 'swap-chain',
			message: 'Swap chain COMPLETE',
			data: { routeId: route.id, swap1Id: hop1Id, swap2Id: hop2Id }
		});
		const confirmedState2: SwapChainState = {
			...pendingState2,
			swap1Id: hop1Id,
			swap2Id: hop2Id,
			phase: 'SWAP_2_CONFIRMED',
			updatedAt: Date.now()
		};
		const { data: finalState, error: finalError } = await transitionTo(confirmedState2, 'COMPLETE');

		if (finalError !== null) {
			d.log('[startSwapChain] ═══ ERROR ═══ final transition failed: %s', finalError.message);
			// Both hops succeeded on-chain but the state machine transition failed.
			// Force-reset to COMPLETE so the swap doesn't stay stuck in pending.
			if (hop1Id && hop2Id) {
				d.log('[startSwapChain] Both hops succeeded — force-resetting to COMPLETE');
				await resetSwapChainState();
				return { data: { ...confirmedState2, phase: 'COMPLETE' }, error: null };
			}
			return { data: null, error: finalError };
		}

		d.log('[startSwapChain] ═══ COMPLETE ═══ finalState=%s', finalState?.phase);
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
		d.log(
			'[resumeSwapChain] ═══ RESUME ═══ phase=%s route=%s swap1Id=%s swap2Id=%s',
			state.phase,
			state.route?.id ?? 'none',
			state.swap1Id ?? 'none',
			state.swap2Id ?? 'none'
		);
		Sentry.addBreadcrumb({
			category: 'swap-chain',
			message: `Resuming swap chain: phase=${state.phase}`,
			data: {
				phase: state.phase,
				routeId: state.route?.id,
				swap1Id: state.swap1Id,
				swap2Id: state.swap2Id
			}
		});

		if (isTerminalPhase(state.phase)) {
			// PARTIAL swaps can be resumed — they have a valid swap1Id but
			// the Boltz claim hasn't completed yet. Poll for completion.
			if (state.phase === 'PARTIAL' && state.swap1Id && state.route) {
				d.log(
					'[resumeSwapChain] PARTIAL swap with swap1Id=%s — polling Boltz for completion',
					state.swap1Id
				);
				const hop1 = state.route.hops[0];
				if (hop1?.service === 'boltz') {
					const direction = resolveBoltzDirection(hop1.fromAsset);
					setSwapProgress(
						'claiming-rbtc',
						direction === 'tbtc-to-rbtc'
							? 'Claiming rBTC on RSK...'
							: 'Claiming tBTC on Arbitrum...'
					);

					const pollResult = await pollBoltzChainSwapCompletion(
						state.swap1Id,
						state.sourceConnectedWalletId,
						undefined,
						direction
					);

					if (pollResult.error !== null) {
						d.log('[resumeSwapChain] Boltz poll failed: %s', pollResult.error.message);
						// Already PARTIAL — can't transition PARTIAL→PARTIAL. Save directly.
						const updatedState: SwapChainState = {
							...state,
							error: `Boltz claim still pending: ${pollResult.error.message}`,
							updatedAt: Date.now()
						};
						await saveSwapChainState(updatedState);
						return { data: updatedState, error: null };
					}

					d.log('[resumeSwapChain] Boltz swap claimed — marking COMPLETE');
					// PARTIAL → COMPLETE is a valid transition in the state machine.
					// Use transitionTo to persist and validate properly.
					const { data: completed, error: completeError } = await transitionTo(state, 'COMPLETE');
					if (completeError !== null) {
						return { data: null, error: completeError };
					}
					return { data: completed ?? state, error: null };
				}
			}
			d.log('[resumeSwapChain] Phase is terminal (%s) — returning as-is', state.phase);
			return { data: state, error: null };
		}

		// SWAP_2_CONFIRMED -> COMPLETE
		if (state.phase === 'SWAP_2_CONFIRMED') {
			d.log('[resumeSwapChain] SWAP_2_CONFIRMED — marking COMPLETE');
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
				d.log('[resumeSwapChain] hop 0 is boltz (id=%s) — polling for completion', state.swap1Id);
				d.log('resume: hop 1 is Boltz (id=%s) — polling for completion', state.swap1Id);
				const pollResult = await pollAndHandleBoltzSwap({
					swapId: state.swap1Id,
					sourceConnectedWalletId: state.sourceConnectedWalletId,
					direction: 'rbtc-to-tbtc',
					stateForPartial: { ...state },
					logContext: 'resumeSwapChain'
				});
				if (pollResult.error !== null || pollResult.data !== null) return pollResult;
				d.log('[resumeSwapChain] Boltz hop 0 completed — proceeding to hop 1');
				d.log('resume: Boltz swap completed — proceeding to hop 2');
			}

			d.log(
				'[resumeSwapChain] executing hop 1: service=%s from=%s/%s to=%s/%s',
				hop2.service,
				hop2.fromAsset,
				hop2.fromChain,
				hop2.toAsset,
				hop2.toChain
			);
			Sentry.addBreadcrumb({
				category: 'swap-chain',
				message: `Resume: executing hop 1: ${hop2.service}`,
				data: {
					service: hop2.service,
					from: `${hop2.fromAsset}/${hop2.fromChain}`,
					to: `${hop2.toAsset}/${hop2.toChain}`
				}
			});

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
			d.log(
				'[resumeSwapChain] hop 1 result: id=%s error=%s',
				hop2Id ?? 'null',
				hop2Error?.message ?? 'none'
			);
			d.log('resume: hop 2 result: id=%s error=%s', hop2Id ?? 'null', hop2Error?.message ?? 'none');

			if (hop2Error !== null) {
				d.log('[resumeSwapChain] ═══ PARTIAL ═══ hop 1 error: %s', hop2Error.message);
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
				const direction = resolveBoltzDirection(hop2.fromAsset);
				const pollResult = await pollAndHandleBoltzSwap({
					swapId: hop2Id,
					sourceConnectedWalletId: state.sourceConnectedWalletId,
					maxWaitMs: BOLTZ_MAX_WAIT_MS,
					direction,
					stateForPartial: { ...pendingState2, swap2Id: hop2Id },
					logContext: 'resumeSwapChain'
				});
				if (pollResult.error !== null || pollResult.data !== null) return pollResult;
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
