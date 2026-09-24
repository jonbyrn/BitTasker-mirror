import { afterEach, describe, expect, it, vi } from 'vitest';
import { getConfiguredRgbUsdtAssetId } from '$lib/types/rgb-contract';

describe('getConfiguredRgbUsdtAssetId', () => {
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it('returns a configured asset id', () => {
		vi.stubEnv('VITE_RGB_USDT_ASSET_ID', ' rgb:usdt-signet ');
		expect(getConfiguredRgbUsdtAssetId()).toBe('rgb:usdt-signet');
	});

	it('returns null when the id is missing, the known testnet id, or a 64-char hex', () => {
		vi.stubEnv('VITE_RGB_USDT_ASSET_ID', '');
		expect(getConfiguredRgbUsdtAssetId()).toBeNull();

		vi.stubEnv('VITE_RGB_USDT_ASSET_ID', 'rgb:2s69152-rg39309-8438210-usdt_testnet');
		expect(getConfiguredRgbUsdtAssetId()).toBeNull();

		vi.stubEnv('VITE_RGB_USDT_ASSET_ID', 'a'.repeat(64));
		expect(getConfiguredRgbUsdtAssetId()).toBeNull();
	});
});
