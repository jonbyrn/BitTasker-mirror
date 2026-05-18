import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
	isChangeallySwapsEnabled,
	isChangeallyFiatEnabled,
	FeatureFlagService,
	FEATURE_FLAGS
} from '$lib/services/kill-switch';

describe('kill-switch', () => {
	beforeEach(() => {
		vi.stubEnv('VITE_CHANGELLY_ENABLED', 'true');
		vi.stubEnv('VITE_CHANGELLY_FIAT_ENABLED', 'true');
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	describe('isChangeallySwapsEnabled', () => {
		it('returns true when VITE_CHANGELLY_ENABLED is exactly "true"', () => {
			vi.stubEnv('VITE_CHANGELLY_ENABLED', 'true');
			expect(isChangeallySwapsEnabled()).toBe(true);
		});

		it('returns false when VITE_CHANGELLY_ENABLED is "false"', () => {
			vi.stubEnv('VITE_CHANGELLY_ENABLED', 'false');
			expect(isChangeallySwapsEnabled()).toBe(false);
		});

		it('returns false when VITE_CHANGELLY_ENABLED is empty string', () => {
			vi.stubEnv('VITE_CHANGELLY_ENABLED', '');
			expect(isChangeallySwapsEnabled()).toBe(false);
		});

		it('returns false when VITE_CHANGELLY_ENABLED is undefined', () => {
			vi.stubEnv('VITE_CHANGELLY_ENABLED', undefined as unknown as string);
			expect(isChangeallySwapsEnabled()).toBe(false);
		});

		it('returns false for truthy values other than "true"', () => {
			vi.stubEnv('VITE_CHANGELLY_ENABLED', '1');
			expect(isChangeallySwapsEnabled()).toBe(false);
		});
	});

	describe('isChangeallyFiatEnabled', () => {
		it('returns true when VITE_CHANGELLY_FIAT_ENABLED is exactly "true"', () => {
			vi.stubEnv('VITE_CHANGELLY_FIAT_ENABLED', 'true');
			expect(isChangeallyFiatEnabled()).toBe(true);
		});

		it('returns false when VITE_CHANGELLY_FIAT_ENABLED is "false"', () => {
			vi.stubEnv('VITE_CHANGELLY_FIAT_ENABLED', 'false');
			expect(isChangeallyFiatEnabled()).toBe(false);
		});

		it('returns false when VITE_CHANGELLY_FIAT_ENABLED is undefined', () => {
			vi.stubEnv('VITE_CHANGELLY_FIAT_ENABLED', undefined as unknown as string);
			expect(isChangeallyFiatEnabled()).toBe(false);
		});
	});

	describe('FeatureFlagService.isEnabled', () => {
		it('returns true for enabled FEATURE_FLAGS.CHANGELLY_SWAPS', () => {
			vi.stubEnv('VITE_CHANGELLY_ENABLED', 'true');
			expect(FeatureFlagService.isEnabled(FEATURE_FLAGS.CHANGELLY_SWAPS)).toBe(true);
		});

		it('returns true for enabled FEATURE_FLAGS.CHANGELLY_FIAT', () => {
			vi.stubEnv('VITE_CHANGELLY_FIAT_ENABLED', 'true');
			expect(FeatureFlagService.isEnabled(FEATURE_FLAGS.CHANGELLY_FIAT)).toBe(true);
		});

		it('returns false for disabled FEATURE_FLAGS.CHANGELLY_SWAPS', () => {
			vi.stubEnv('VITE_CHANGELLY_ENABLED', 'false');
			expect(FeatureFlagService.isEnabled(FEATURE_FLAGS.CHANGELLY_SWAPS)).toBe(false);
		});

		it('returns false for disabled FEATURE_FLAGS.CHANGELLY_FIAT', () => {
			vi.stubEnv('VITE_CHANGELLY_FIAT_ENABLED', 'false');
			expect(FeatureFlagService.isEnabled(FEATURE_FLAGS.CHANGELLY_FIAT)).toBe(false);
		});

		it('returns false for unknown feature name', () => {
			expect(FeatureFlagService.isEnabled('nonexistent-feature')).toBe(false);
		});

		it('returns false for empty string feature name', () => {
			expect(FeatureFlagService.isEnabled('')).toBe(false);
		});

		it('returns false for null feature name', () => {
			expect(FeatureFlagService.isEnabled(null as unknown as string)).toBe(false);
		});

		it('returns false for undefined feature name', () => {
			expect(FeatureFlagService.isEnabled(undefined as unknown as string)).toBe(false);
		});

		it('returns false for numeric feature name', () => {
			expect(FeatureFlagService.isEnabled(42 as unknown as string)).toBe(false);
		});

		it('returns false for object feature name', () => {
			expect(FeatureFlagService.isEnabled({} as unknown as string)).toBe(false);
		});
	});
});
