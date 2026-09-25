import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	escrowSendAmount,
	getConfiguredRgbUsdtAssetId,
	listsRgbAsset,
	selectEscrowAsset,
	usdtEscrowUnits,
	usdtPrecision
} from '$lib/types/rgb-contract';

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

describe('listsRgbAsset', () => {
	it('matches only an asset id already in this wallet', () => {
		const nia = [{ assetId: 'rgb:held' }];
		expect(listsRgbAsset(nia, 'rgb:held')).toBe(true);
		expect(listsRgbAsset(nia, 'rgb:missing')).toBe(false);
		expect(listsRgbAsset(nia, null)).toBe(false);
	});
});

describe('selectEscrowAsset', () => {
	const usdt = {
		assetId: 'rgb:buHqKXhJ-kWm2Fnb-mBA1eIz-qr4wn7I-07MDVPY-idSqdJs',
		ticker: 'USDT',
		balance: { spendable: 100_000_000 }
	};
	const e2e = {
		assetId: 'rgb:rZcsRSmi-Qzfndgh-s_ihu8G-b2SjZHw-RgDiSh8-XPs82nI',
		ticker: 'E2E',
		balance: { spendable: 10_000 }
	};

	it('skips a configured id the wallet does not hold and uses spendable USDT', () => {
		expect(selectEscrowAsset([e2e, usdt], ['rgb:KF0H4ytS-missing'])).toBe(usdt.assetId);
	});

	it('keeps a preferred id when that asset is spendable', () => {
		expect(selectEscrowAsset([e2e, usdt], [e2e.assetId, usdt.assetId])).toBe(e2e.assetId);
	});

	it('returns undefined when nothing is spendable', () => {
		expect(
			selectEscrowAsset([{ ...usdt, balance: { spendable: 0 } }], ['rgb:KF0H4ytS-missing'])
		).toBeUndefined();
	});
});

describe('usdtEscrowUnits', () => {
	it('converts a dollar bid into 6-decimal USDT and refuses the whole balance', () => {
		expect(usdtPrecision('USDT', undefined)).toBe(6);
		expect(usdtEscrowUnits(3.588, 6, 100_000_000)).toBe(3_588_000);
		expect(() => usdtEscrowUnits(3.588, 6, 100)).toThrow('Not enough USDT');
	});

	it('sends the full minted balance only when that path is requested', () => {
		expect(
			escrowSendAmount({
				spendable: 10_000,
				totalAmountUsd: 3.588,
				precision: 0,
				fullSpendable: true
			})
		).toBe(10_000);
		expect(
			escrowSendAmount({
				spendable: 10_000,
				totalAmountUsd: 3.588,
				precision: 0,
				fullSpendable: false
			})
		).toBe(4);
	});
});
