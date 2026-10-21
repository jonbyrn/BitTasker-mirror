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
	/** Escrow-backed USDT advances. Off unless VITE_CREDIT_ENABLED is true. */
	CREDIT_ENABLED: 'CREDIT_ENABLED',
	/** Temporary staffing. Off unless VITE_TEMP_STAFF_ENABLED is true. */
	TEMP_STAFF_ENABLED: 'TEMP_STAFF_ENABLED',
	/** Buy & Sell goods. Off unless VITE_MARKET_ENABLED is true. */
	MARKET_ENABLED: 'MARKET_ENABLED',
	/** Local QVAC helpers. Off unless VITE_QVAC_ENABLED is true. */
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
 * BitTasker Credit beta. Defaults to off. The sandbox build sets
 * VITE_CREDIT_ENABLED=true. Staging and production leave it unset.
 */
export function isCreditEnabled(): boolean {
	return isEnvFlagEnabled(import.meta.env.VITE_CREDIT_ENABLED);
}

/** Hire temporary staff. Off unless the sandbox build sets the flag. */
export function isTempStaffEnabled(): boolean {
	return isEnvFlagEnabled(import.meta.env.VITE_TEMP_STAFF_ENABLED);
}

/** Buy & Sell marketplace. Off unless the sandbox build sets the flag. */
export function isMarketEnabled(): boolean {
	return isEnvFlagEnabled(import.meta.env.VITE_MARKET_ENABLED);
}

/**
 * Local QVAC drafting, category, translation, and voice helpers.
 * The sandbox build sets VITE_QVAC_ENABLED. Production leaves it unset.
 */
export function isQvacEnabled(): boolean {
	return isEnvFlagEnabled(import.meta.env.VITE_QVAC_ENABLED);
}

/**
 * Convenience wrapper to check if any named feature is enabled.
 * Credit, temporary staff, the marketplace, and QVAC read the environment. Retired flags stay off.
 *
 * @param feature - The feature flag key to check
 * @returns true when the feature is enabled, false otherwise
 */
export const isEnabled = (feature: string): boolean => {
	if (feature === FEATURE_FLAGS.CREDIT_ENABLED) return isCreditEnabled();
	if (feature === FEATURE_FLAGS.TEMP_STAFF_ENABLED) return isTempStaffEnabled();
	if (feature === FEATURE_FLAGS.MARKET_ENABLED) return isMarketEnabled();
	if (feature === FEATURE_FLAGS.QVAC_ENABLED) return isQvacEnabled();
	return FeatureFlagService.isEnabled(feature);
};
