/**
 * Feature Flags Service — Phase 1.1 (Add-on)
 *
 * Centralised feature flag gating for Changelly integration.
 * All flags are backed by build-time VITE_ environment variables.
 *
 * This module re-exports from the kill-switch implementation while providing
 * a canonical public API surface for feature flag checks throughout the app.
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
 * @see src/lib/services/kill-switch.ts
 */

import {
	FeatureFlagService,
	FEATURE_FLAGS,
	isChangeallySwapsEnabled,
	isChangeallyFiatEnabled,
	isLifiEnabled,
	isSymbiosisEnabled
} from './kill-switch';

export {
	FEATURE_FLAGS,
	isChangeallySwapsEnabled,
	isChangeallyFiatEnabled,
	isLifiEnabled,
	isSymbiosisEnabled,
	FeatureFlagService
};

/**
 * Convenience wrapper to check if any named feature is enabled.
 * Defers to FeatureFlagService.isEnabled() for all evaluation logic.
 *
 * @param feature - The feature flag key to check
 * @returns true when the feature is enabled, false otherwise
 */
export const isEnabled: (feature: string) => boolean =
	FeatureFlagService.isEnabled.bind(FeatureFlagService);
