/**
 * Feature Flags Service — Phase 1.1 (Add-on)
 *
 * Centralised feature flag gating for retired EVM and third-party flows.
 * Native Bitcoin/RGB/Nostr flows do not require feature flags.
 *
 * This module provides the canonical public API surface for feature flag
 * checks throughout the app. Retired EVM and third-party flows remain
 * disabled; Changelly fiat is controlled by its explicit environment flag.
 *
 * Usage:
 * ```typescript
 * import { isEnabled, FEATURE_FLAGS } from '$lib/services/feature-flags';
 *
 * if (isEnabled(FEATURE_FLAGS.CHANGELLY_SWAPS)) {
 *   // Show swap UI
 * }
 * ```
 *
 * @see requirements/usdt-integration-plan.md §1.1
 */

export const FEATURE_FLAGS = {
	CHANGELLY_SWAPS: 'CHANGELLY_SWAPS',
	CHANGELLY_FIAT: 'CHANGELLY_FIAT',
	LIFI: 'LIFI',
	SYMBIOSIS: 'SYMBIOSIS',
	LOAN_FLOW: 'LOAN_FLOW',
	/** Draft, category, translation, and voice helpers. Off unless VITE_QVAC_ENABLED is true. */
	QVAC_ENABLED: 'QVAC_ENABLED',
	CONNECTED_METAMASK: 'CONNECTED_METAMASK',
	CONNECTED_TREZOR: 'CONNECTED_TREZOR',
	CONNECTED_LEDGER: 'CONNECTED_LEDGER'
} as const;

export const FeatureFlagService = {
	isEnabled: (_feature: string): boolean => false
};

function isEnvFlagEnabled(value: unknown): boolean {
	return value === true || value === 'true' || value === '1';
}

export const isChangeallySwapsEnabled = (): boolean => false;

/** Changelly fiat on/off-ramp remains available behind its explicit env flag. */
export const isChangellyFiatEnabled = (): boolean =>
	isEnvFlagEnabled(import.meta.env.VITE_CHANGELLY_FIAT_ENABLED);

/** @deprecated Use the correctly spelled isChangellyFiatEnabled export. */
export const isChangeallyFiatEnabled = isChangellyFiatEnabled;
export const isLifiEnabled = (): boolean => false;
export const isSymbiosisEnabled = (): boolean => false;

/**
 * QVAC drafting, category, translation, and voice helpers.
 * Dev and sandbox builds set VITE_QVAC_ENABLED. Production leaves it unset.
 */
export function isQvacEnabled(): boolean {
	return isEnvFlagEnabled(import.meta.env.VITE_QVAC_ENABLED);
}

/**
 * Convenience wrapper to check if any named feature is enabled.
 * QVAC reads the environment. Retired flags stay off.
 *
 * @param feature - The feature flag key to check
 * @returns true when the feature is enabled, false otherwise
 */
export const isEnabled = (feature: string): boolean => {
	if (feature === FEATURE_FLAGS.QVAC_ENABLED) return isQvacEnabled();
	return FeatureFlagService.isEnabled(feature);
};
