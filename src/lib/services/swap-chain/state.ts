/**
 * Swap Chain — State Machine
 *
 * Types, phase transitions, state persistence, and pure helpers for the
 * swap chain state machine. This is the base module — all other swap-chain
 * modules import from here.
 *
 * @see requirements/usdt-integration-plan.md §Swap chain
 */

import { Preferences } from '@capacitor/preferences';
import * as Sentry from '@sentry/sveltekit';
import { ethers } from 'ethers';
import { tryCatch } from '$lib/utils/tryCatch';
import { createDebug } from '$lib/utils/debug';
import type { Route, SourceWallet, Destination } from '$lib/services/route-resolver';

const d = createDebug('swap-chain');

// ---------------------------------------------------------------------------
// Shared address helpers
// ---------------------------------------------------------------------------

/**
 * Validate and checksum an Ethereum address. Returns the EIP-55 checksummed
 * address if valid, empty string otherwise. Use for all ethers v6 calls
 * (sendTransaction, encodeFunctionData) and Symbiosis/LI.FI API calls.
 */
export function safeAddress(addr: string | undefined | null): string {
	if (!addr || typeof addr !== 'string') return '';
	try {
		// ethers v6 rejects addresses with incorrect EIP-55 checksum.
		// Wallet store addresses may have mixed case that doesn't match.
		// Lowercase first ensures getAddress() always succeeds for valid hex.
		return ethers.getAddress(addr.trim().toLowerCase());
	} catch {
		return '';
	}
}

/** Address for Boltz API calls (lowercase, no checksum). */
export function boltzAddress(addr: string): string {
	return safeAddress(addr).toLowerCase();
}

/** Promise-based sleep helper. */
export function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Capacitor Preferences storage key. */
const STORAGE_KEY = 'bittasker_swap_chain';

// ---------------------------------------------------------------------------
// State machine types
// ---------------------------------------------------------------------------

export type SwapChainPhase =
	| 'IDLE'
	| 'SWAP_1_PENDING'
	| 'SWAP_1_CONFIRMED'
	| 'SWAP_2_PENDING'
	| 'SWAP_2_CONFIRMED'
	| 'COMPLETE'
	| 'FAILED'
	| 'PARTIAL';

/**
 * Terminal phases — once reached the chain will not advance further without
 * explicit user action.
 */
export type TerminalSwapChainPhase = 'IDLE' | 'COMPLETE' | 'FAILED' | 'PARTIAL';

/**
 * Persisted swap chain state.
 * Stored in Capacitor Preferences for app-kill resilience.
 */
export interface SwapChainState {
	/** Current phase of the state machine. */
	phase: SwapChainPhase;

	/** The route being executed. */
	route: Route | null;

	/** Source wallet identifier. */
	sourceWallet: SourceWallet | null;

	/** Destination the funds are being sent to. */
	destination: Destination | null;

	/** Connected wallet ID when source is external (null = built-in BitTasker wallet). */
	sourceConnectedWalletId: string | null;

	/** Amount being swapped/sent (decimal string). */
	amount: string | null;

	/**
	 * Actual amount being swapped after balance capping (decimal string).
	 * When the swap amount is capped by `capBalanceToWalletMax` (to reserve
	 * relay fee buffer and bridge gas), this field stores the capped amount.
	 * The UI should display this value instead of `amount` to show the user
	 * what will actually be swapped. Null if no capping was applied.
	 */
	adjustedAmount: string | null;

	/**
	 * Relay fee buffer (in wei) that will be deducted from the hop 2 input
	 * token balance by the gasless relay. Set by the orchestrator before
	 * executing hop 2 so that executors can cap the swap amount to
	 * `balance - relayFeeBuffer`, preventing "transfer amount exceeds balance"
	 * errors when the swap input token is also used for gasless fee payment.
	 */
	relayFeeBuffer: string | null;

	/** Transaction hash or service swap ID for hop 1. */
	swap1Id: string | null;

	/** Transaction hash or service swap ID for hop 2 (multi-hop only). */
	swap2Id: string | null;

	/** Details payload for hop 1 (service-specific). */
	swap1Details: Record<string, unknown> | null;

	/** Details payload for hop 2 (service-specific). */
	swap2Details: Record<string, unknown> | null;

	/** Error message when phase is FAILED or PARTIAL. */
	error: string | null;

	/** Last update timestamp (epoch ms). */
	updatedAt: number;
}

// ---------------------------------------------------------------------------
// Observable swap progress
// ---------------------------------------------------------------------------

export type SwapProgressStep =
	| 'locking-rbtc'
	| 'locking-tbtc'
	| 'waiting-for-boltz'
	| 'claiming-tbtc'
	| 'claiming-rbtc'
	| 'swapping-tbtc'
	| 'complete'
	| 'failed';

let swapProgressCallback: ((step: SwapProgressStep, message: string) => void) | null = null;
let currentSwapProgressStep: SwapProgressStep = 'locking-rbtc';

/** Register a callback to receive swap progress updates. Returns unsubscribe. */
export function onSwapProgress(cb: (step: SwapProgressStep, message: string) => void): () => void {
	swapProgressCallback = cb;
	return () => {
		swapProgressCallback = null;
	};
}

/** Get current progress step (for initial state). */
export function getSwapProgressStep(): SwapProgressStep {
	return currentSwapProgressStep;
}

export function setSwapProgress(step: SwapProgressStep, message: string) {
	currentSwapProgressStep = step;
	d.log('SWAP_PROGRESS: %s — %s', step, message);
	swapProgressCallback?.(step, message);
}

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

export const INITIAL_SWAP_CHAIN_STATE: SwapChainState = {
	phase: 'IDLE',
	route: null,
	sourceWallet: null,
	destination: null,
	sourceConnectedWalletId: null,
	amount: null,
	adjustedAmount: null,
	relayFeeBuffer: null,
	swap1Id: null,
	swap2Id: null,
	swap1Details: null,
	swap2Details: null,
	error: null,
	updatedAt: 0
};

// ---------------------------------------------------------------------------
// Phase transition validation
// ---------------------------------------------------------------------------

const VALID_TRANSITIONS: Record<SwapChainPhase, SwapChainPhase[]> = {
	IDLE: ['SWAP_1_PENDING'],
	SWAP_1_PENDING: ['SWAP_1_CONFIRMED', 'FAILED', 'PARTIAL'],
	SWAP_1_CONFIRMED: ['SWAP_2_PENDING', 'COMPLETE', 'FAILED', 'PARTIAL'],
	SWAP_2_PENDING: ['SWAP_2_CONFIRMED', 'FAILED', 'PARTIAL'],
	SWAP_2_CONFIRMED: ['COMPLETE', 'FAILED', 'PARTIAL'],
	COMPLETE: ['PARTIAL'], // Allow reverting to PARTIAL when auto-validation detects incomplete swap
	FAILED: [],
	PARTIAL: ['COMPLETE']
};

/**
 * Validate that a transition from one swap chain phase to another is legal.
 * Pure function — deterministic.
 *
 * Transition to `FAILED` is valid from any non-terminal, non-FAILED phase.
 * Transition to `PARTIAL` is valid only from SWAP_2_PENDING.
 */
export function isValidSwapChainTransition(current: SwapChainPhase, next: SwapChainPhase): boolean {
	if (next === 'FAILED') {
		return current !== 'FAILED' && current !== 'COMPLETE' && current !== 'PARTIAL';
	}

	const allowed = VALID_TRANSITIONS[current];
	if (allowed === undefined) {
		return false;
	}
	return allowed.includes(next);
}

/**
 * Determine whether a phase is terminal and should not be resumed.
 */
export function isTerminalPhase(phase: SwapChainPhase): boolean {
	return phase === 'IDLE' || phase === 'COMPLETE' || phase === 'FAILED' || phase === 'PARTIAL';
}

/**
 * Determine whether the chain needs a resume (interrupted mid-execution).
 */
export function needsResume(phase: SwapChainPhase): boolean {
	const resumable: SwapChainPhase[] = [
		'SWAP_1_PENDING',
		'SWAP_1_CONFIRMED',
		'SWAP_2_PENDING',
		'SWAP_2_CONFIRMED'
	];
	return resumable.includes(phase);
}

// ---------------------------------------------------------------------------
// State persistence
// ---------------------------------------------------------------------------

/**
 * Load persisted swap chain state from Capacitor Preferences.
 *
 * @returns The stored state, or `INITIAL_SWAP_CHAIN_STATE` if none exists or
 *          the stored data is corrupt.
 */
export async function loadSwapChainState(): Promise<SwapChainState> {
	const { error: getError, data: getResult } = await tryCatch(
		Preferences.get({ key: STORAGE_KEY })
	);

	if (getError !== null || getResult === null) {
		return { ...INITIAL_SWAP_CHAIN_STATE };
	}

	const json = getResult.value;

	if (json === null || json === undefined) {
		return { ...INITIAL_SWAP_CHAIN_STATE };
	}

	try {
		const parsed: unknown = JSON.parse(json);

		if (parsed === null || typeof parsed !== 'object') {
			return { ...INITIAL_SWAP_CHAIN_STATE };
		}

		const raw = parsed as Record<string, unknown>;

		if (typeof raw.phase !== 'string') {
			return { ...INITIAL_SWAP_CHAIN_STATE };
		}

		const VALID_PHASES: SwapChainPhase[] = [
			'IDLE',
			'SWAP_1_PENDING',
			'SWAP_1_CONFIRMED',
			'SWAP_2_PENDING',
			'SWAP_2_CONFIRMED',
			'COMPLETE',
			'FAILED',
			'PARTIAL'
		];
		if (!VALID_PHASES.includes(raw.phase as SwapChainPhase)) {
			d.warn('Invalid swap chain phase "%s" in persisted state — resetting', raw.phase);
			return { ...INITIAL_SWAP_CHAIN_STATE };
		}

		return {
			phase: raw.phase as SwapChainPhase,
			route: raw.route as Route | null,
			sourceWallet: raw.sourceWallet as SourceWallet | null,
			destination: raw.destination as Destination | null,
			sourceConnectedWalletId:
				typeof raw.sourceConnectedWalletId === 'string' ? raw.sourceConnectedWalletId : null,
			amount: typeof raw.amount === 'string' ? raw.amount : null,
			adjustedAmount: typeof raw.adjustedAmount === 'string' ? raw.adjustedAmount : null,
			relayFeeBuffer: typeof raw.relayFeeBuffer === 'string' ? raw.relayFeeBuffer : null,
			swap1Id: typeof raw.swap1Id === 'string' ? raw.swap1Id : null,
			swap2Id: typeof raw.swap2Id === 'string' ? raw.swap2Id : null,
			swap1Details: raw.swap1Details as Record<string, unknown> | null,
			swap2Details: raw.swap2Details as Record<string, unknown> | null,
			error: typeof raw.error === 'string' ? raw.error : null,
			updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : 0
		};
	} catch (e) {
		d.warn(
			'Failed to parse persisted swap chain state: %s',
			e instanceof Error ? e.message : String(e)
		);
		return { ...INITIAL_SWAP_CHAIN_STATE };
	}
}

/**
 * Persist swap chain state to Capacitor Preferences.
 * Automatically stamps `updatedAt`.
 */
export async function saveSwapChainState(state: SwapChainState): Promise<{ error: Error | null }> {
	// Capacitor Preferences not available in browser — skip persistence
	try {
		const serialised = JSON.stringify({
			...state,
			updatedAt: Date.now()
		});
		const { error } = await tryCatch(Preferences.set({ key: STORAGE_KEY, value: serialised }));
		if (error !== null) {
			return { error: error instanceof Error ? error : new Error(String(error)) };
		}
	} catch (e) {
		// Preferences may be unavailable in certain environments (SSR, tests)
		const err = e instanceof Error ? e : new Error(String(e));
		d.warn('Capacitor Preferences unavailable: %s', err.message);
		Sentry.addBreadcrumb({
			category: 'persistence',
			message: 'Capacitor Preferences unavailable — swap chain state not persisted',
			level: 'warning',
			data: { error: err.message }
		});
		return { error: err };
	}
	return { error: null };
}

/**
 * Reset swap chain state to initial (IDLE).
 * Call after the chain completes or when the user cancels.
 */
export async function resetSwapChainState(): Promise<{ error: Error | null }> {
	const { error } = await tryCatch(Preferences.remove({ key: STORAGE_KEY }));

	if (error !== null) {
		return { error: error instanceof Error ? error : new Error(String(error)) };
	}

	return { error: null };
}

// ---------------------------------------------------------------------------
// Internal transition helper
// ---------------------------------------------------------------------------

export async function transitionTo(
	current: SwapChainState,
	nextPhase: SwapChainPhase,
	updates: Partial<SwapChainState> = {}
): Promise<{ data: SwapChainState | null; error: Error | null }> {
	if (!isValidSwapChainTransition(current.phase, nextPhase)) {
		return {
			data: null,
			error: new Error(`Invalid swap chain transition: ${current.phase} -> ${nextPhase}`)
		};
	}

	const newState: SwapChainState = {
		...current,
		...updates,
		phase: nextPhase,
		error:
			nextPhase === 'FAILED'
				? (updates.error ?? 'Swap chain failed')
				: nextPhase === 'PARTIAL'
					? (updates.error ?? 'Partial completion — hop 2 failed')
					: null,
		updatedAt: Date.now()
	};

	if (nextPhase === 'FAILED' || nextPhase === 'PARTIAL') {
		Sentry.captureException(new Error(`Swap ${nextPhase}: ${newState.error ?? 'unknown'}`), {
			tags: { component: 'swap-chain', phase: nextPhase },
			extra: {
				currentPhase: current.phase,
				routeId: current.route?.id,
				swap1Id: current.swap1Id
			}
		});
	}

	const { error: saveError } = await saveSwapChainState(newState);
	if (saveError !== null) {
		return { data: null, error: saveError };
	}

	return { data: newState, error: null };
}

// ---------------------------------------------------------------------------
// Status helper (for UI display)
// ---------------------------------------------------------------------------

/**
 * Get whether the swap chain is currently in a state that needs user attention.
 * Returns contextual status for UI display.
 */
export function getSwapChainStatus(state: SwapChainState): {
	isActive: boolean;
	isComplete: boolean;
	isFailed: boolean;
	isPartial: boolean;
	message: string;
} {
	switch (state.phase) {
		case 'IDLE':
			return { isActive: false, isComplete: false, isFailed: false, isPartial: false, message: '' };
		case 'SWAP_1_PENDING':
			return {
				isActive: true,
				isComplete: false,
				isFailed: false,
				isPartial: false,
				message: 'wallet.swap_chain.swap_1_pending'
			};
		case 'SWAP_1_CONFIRMED':
			return {
				isActive: true,
				isComplete: false,
				isFailed: false,
				isPartial: false,
				message: 'wallet.swap_chain.swap_1_confirmed'
			};
		case 'SWAP_2_PENDING':
			return {
				isActive: true,
				isComplete: false,
				isFailed: false,
				isPartial: false,
				message: 'wallet.swap_chain.swap_2_pending'
			};
		case 'SWAP_2_CONFIRMED':
			return {
				isActive: true,
				isComplete: false,
				isFailed: false,
				isPartial: false,
				message: 'wallet.swap_chain.swap_2_confirmed'
			};
		case 'COMPLETE':
			return {
				isActive: false,
				isComplete: true,
				isFailed: false,
				isPartial: false,
				message: 'wallet.swap_chain.complete'
			};
		case 'FAILED':
			return {
				isActive: false,
				isComplete: false,
				isFailed: true,
				isPartial: false,
				message: state.error ?? 'wallet.swap_chain.failed'
			};
		case 'PARTIAL':
			return {
				isActive: false,
				isComplete: false,
				isFailed: false,
				isPartial: true,
				message: state.error ?? 'wallet.swap_chain.partial'
			};
		default:
			return {
				isActive: false,
				isComplete: false,
				isFailed: false,
				isPartial: false,
				message: ''
			};
	}
}
