import { createDebug } from '$lib/utils/debug';

const debug = createDebug('kill-switch');

/**
 * Known feature flag identifiers for the application.
 * Maps to VITE_ environment variables for build-time configuration.
 */
export const FEATURE_FLAGS = {
	CHANGELLY_SWAPS: 'changelly-swaps',
	CHANGELLY_FIAT: 'changelly-fiat',
	LIFI_SWAPS: 'lifi-swaps',
	SYMBIOSIS_SWAPS: 'symbiosis-swaps',
	CONNECTED_WALLETS: 'connected-wallets',
	CONNECTED_METAMASK: 'connected-metamask',
	CONNECTED_WALLETCONNECT: 'connected-walletconnect',
	CONNECTED_TREZOR: 'connected-trezor',
	CONNECTED_LEDGER: 'connected-ledger',
	LOAN_FLOW: 'loan-flow',
	USDT0_BRIDGE: 'usdt0-bridge',
	OPENOCEAN_SWAPS: 'openocean-swaps'
} as const;

/**
 * Returns whether Changelly cryptocurrency swaps are enabled.
 * Controlled by the VITE_CHANGELLY_ENABLED environment variable set at build time.
 *
 * @returns true when VITE_CHANGELLY_ENABLED is set to 'true', false otherwise.
 */
export function isChangeallySwapsEnabled(): boolean {
	return import.meta.env.VITE_CHANGELLY_ENABLED === 'true';
}

/**
 * Returns whether Changelly fiat on/off ramp is enabled.
 * Controlled by the VITE_CHANGELLY_FIAT_ENABLED environment variable set at build time.
 *
 * @returns true when VITE_CHANGELLY_FIAT_ENABLED is set to 'true', false otherwise.
 */
export function isChangeallyFiatEnabled(): boolean {
	return import.meta.env.VITE_CHANGELLY_FIAT_ENABLED === 'true';
}

export function isLifiEnabled(): boolean {
	return import.meta.env.VITE_LIFI_ENABLED === 'true';
}

export function isSymbiosisEnabled(): boolean {
	return import.meta.env.VITE_SYMBIOSIS_ENABLED === 'true';
}

export function isConnectedWalletsEnabled(): boolean {
	return import.meta.env.VITE_CONNECTED_WALLETS_ENABLED === 'true';
}

export function isConnectedMetaMaskEnabled(): boolean {
	return import.meta.env.VITE_CONNECTED_METAMASK_ENABLED === 'true';
}

export function isConnectedWalletConnectEnabled(): boolean {
	return import.meta.env.VITE_CONNECTED_WALLETCONNECT_ENABLED === 'true';
}

export function isConnectedTrezorEnabled(): boolean {
	return import.meta.env.VITE_CONNECTED_TREZOR_ENABLED === 'true';
}

export function isConnectedLedgerEnabled(): boolean {
	return import.meta.env.VITE_CONNECTED_LEDGER_ENABLED === 'true';
}

export function isLoanFlowEnabled(): boolean {
	return import.meta.env.VITE_LOAN_FLOW_ENABLED === 'true';
}

export function isUsdt0BridgeEnabled(): boolean {
	return import.meta.env.VITE_USDT0_BRIDGE_ENABLED === 'true';
}

/**
 * Returns whether OpenOcean DEX aggregator swaps are enabled.
 * Controlled by the VITE_OPENOCEAN_ENABLED environment variable set at build time.
 *
 * @returns true when VITE_OPENOCEAN_ENABLED is set to 'true', false otherwise.
 */
export function isOpenOceanEnabled(): boolean {
	return import.meta.env.VITE_OPENOCEAN_ENABLED === 'true';
}

/**
 * Runtime feature flag service for gating functionality by feature name.
 * All checks are pure functions backed by build-time environment variables.
 */
export const FeatureFlagService = {
	/**
	 * Check whether a named feature is enabled.
	 * Returns false for unknown or invalid feature identifiers.
	 *
	 * @param feature - The feature flag key to check (e.g. 'changelly-swaps')
	 * @returns true if the feature is enabled, false otherwise
	 */
	isEnabled(feature: string): boolean {
		if (!feature || typeof feature !== 'string') {
			debug.warn('isEnabled called with invalid feature key: %s', feature);
			return false;
		}

		switch (feature) {
			case FEATURE_FLAGS.CHANGELLY_SWAPS:
				return isChangeallySwapsEnabled();
			case FEATURE_FLAGS.CHANGELLY_FIAT:
				return isChangeallyFiatEnabled();
			case FEATURE_FLAGS.LIFI_SWAPS:
				return isLifiEnabled();
			case FEATURE_FLAGS.SYMBIOSIS_SWAPS:
				return isSymbiosisEnabled();
			case FEATURE_FLAGS.CONNECTED_WALLETS:
				return isConnectedWalletsEnabled();
			case FEATURE_FLAGS.CONNECTED_METAMASK:
				return isConnectedMetaMaskEnabled();
			case FEATURE_FLAGS.CONNECTED_WALLETCONNECT:
				return isConnectedWalletConnectEnabled();
			case FEATURE_FLAGS.CONNECTED_TREZOR:
				return isConnectedTrezorEnabled();
			case FEATURE_FLAGS.CONNECTED_LEDGER:
				return isConnectedLedgerEnabled();
			case FEATURE_FLAGS.LOAN_FLOW:
				return isLoanFlowEnabled();
			case FEATURE_FLAGS.USDT0_BRIDGE:
				return isUsdt0BridgeEnabled();
			case FEATURE_FLAGS.OPENOCEAN_SWAPS:
				return isOpenOceanEnabled();
			default:
				debug.warn('Unknown feature flag queried: %s', feature);
				return false;
		}
	}
};
