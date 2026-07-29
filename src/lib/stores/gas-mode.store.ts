/**
 * Gas Mode Store
 *
 * Manages the gas payment mode for EIP-7702 USDT gas abstraction,
 * paymaster health status, and USDT depeg detection.
 *
 * Single-writer principle: this store is the ONLY source of truth for
 * gas mode, paymaster health, and depeg state. All mutations go through
 * the exported functions below.
 *
 * Pure state transitions: every update returns a new state object
 * (no side effects, no async in reducers).
 *
 * @see requirements/usdt-integration-plan.md §1.8
 */

import { writable } from 'svelte/store';
import type { GasMode } from '$lib/types/wallet';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PaymasterHealth {
	/** Paymaster contract has sufficient BNB deposit to cover gas */
	funded: boolean;
	/** Seconds since the USDT/BNB oracle was last updated */
	oracleStaleness: number;
	/** Paymaster is paused (e.g., emergency stop via kill switch) */
	paused: boolean;
	/** Estimated number of remaining transactions the paymaster can sponsor */
	estimatedRemainingTx: number;
}

interface GasModeState {
	/** Active gas payment mode. Defaults to USDT_GAS. */
	gasMode: GasMode;
	/** Cached paymaster health from the most recent healthCheck() call */
	paymasterHealth: PaymasterHealth;
	/** True when an on-chain oracle indicates USDT has depegged from USD */
	depegDetected: boolean;
}

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

const initialState: GasModeState = {
	gasMode: 'USDT_GAS',
	paymasterHealth: {
		funded: false,
		oracleStaleness: 0,
		paused: false,
		estimatedRemainingTx: 0
	},
	depegDetected: false
};

// ---------------------------------------------------------------------------
// Store implementation
// ---------------------------------------------------------------------------

function createGasModeStore() {
	const { subscribe, update, set } = writable<GasModeState>(initialState);

	/**
	 * Set the active gas payment mode.
	 * Transitions: 'USDT_GAS' (default) or 'BNB_FALLBACK' (hidden emergency path).
	 * Pure -- no side effects, no validation (trusted internal caller).
	 */
	function setGasMode(mode: GasMode): void {
		update((state) => ({ ...state, gasMode: mode }));
	}

	/**
	 * Update paymaster health from a GasAbstractionProvider healthCheck() result.
	 * Accepts a partial PaymasterHealth to allow targeted field updates.
	 * Pure -- merges into existing state without side effects.
	 */
	function updatePaymasterHealth(health: Partial<PaymasterHealth>): void {
		update((state) => ({
			...state,
			paymasterHealth: { ...state.paymasterHealth, ...health }
		}));
	}

	/**
	 * Set or clear the USDT depeg detection flag.
	 * When true, the UI should warn users before proceeding with USDT transactions.
	 * Pure -- no side effects.
	 */
	function setDepegDetected(detected: boolean): void {
		update((state) => ({ ...state, depegDetected: detected }));
	}

	/**
	 * Reset the entire store to initial values.
	 * Call on logout, hard disconnect, or kill-switch activation.
	 */
	function reset(): void {
		set(initialState);
	}

	return {
		subscribe,
		setGasMode,
		updatePaymasterHealth,
		setDepegDetected,
		reset
	};
}

// ---------------------------------------------------------------------------
// Singleton export
// ---------------------------------------------------------------------------

export const gasModeStore = createGasModeStore();
