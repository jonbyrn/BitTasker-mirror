import { createDebug } from '$lib/utils/debug';

const debug = createDebug('kill-switch');

/**
 * Known feature flag identifiers for the application.
 * Maps to VITE_ environment variables for build-time configuration.
 */
export const FEATURE_FLAGS = {
	CHANGELLY_SWAPS: 'changelly-swaps',
	CHANGELLY_FIAT: 'changelly-fiat'
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
			default:
				debug.warn('Unknown feature flag queried: %s', feature);
				return false;
		}
	}
};
