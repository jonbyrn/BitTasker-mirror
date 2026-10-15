import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	escrowSendAmount,
	getConfiguredRgbUsdtAssetId,
	listsRgbAsset,
	selectEscrowAsset,
	spendableRgbAssets,
	usdtInvoiceAsset,
	formatUsdtBalance,
	formatUsdtUnits,
	usdtBaseUnits,
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

describe('spendableRgbAssets', () => {
	it('keeps IFA rows when nia is empty', () => {
		const ifa = [
			{ assetId: 'rgb:f~9F4X0C-signet-usdt', ticker: 'USDT', balance: { spendable: 100_000_000 } }
		];
		expect(spendableRgbAssets({ nia: [], ifa })).toEqual(ifa);
		expect(selectEscrowAsset(spendableRgbAssets({ nia: [], ifa }))).toBe(ifa[0].assetId);
	});
});

describe('usdtInvoiceAsset', () => {
	const ifaId = 'rgb:f~9F4X0C-TiLOTvy-pALF29V-2xJ2p0m-hP3_vpW-Alj4G5Y';

	it('uses the held IFA USDT contract when the configured id is a different asset', () => {
		expect(
			usdtInvoiceAsset(
				{
					nia: [],
					ifa: [{ assetId: ifaId, ticker: 'USDT', balance: { spendable: 89_000_000 } }]
				},
				'rgb:buHqKXhJ-configured'
			)
		).toBe(ifaId);
	});

	it('keeps a listed USDT contract when its spendable balance is zero', () => {
		expect(
			usdtInvoiceAsset(
				{
					nia: [],
					ifa: [{ assetId: ifaId, ticker: 'USDT', balance: { spendable: 0 } }]
				},
				null
			)
		).toBe(ifaId);
	});

	it('matches a lowercase USDT ticker', () => {
		expect(
			usdtInvoiceAsset(
				{
					nia: [],
					ifa: [{ assetId: ifaId, ticker: 'usdt', balance: { spendable: 200_000_000 } }]
				},
				'rgb:buHqKXhJ-configured'
			)
		).toBe(ifaId);
	});

	it('returns undefined when this wallet has no spendable USDT', () => {
		expect(
			usdtInvoiceAsset(
				{
					nia: [{ assetId: 'rgb:e2e', ticker: 'E2E', balance: { spendable: 10_000 } }],
					ifa: []
				},
				'rgb:buHqKXhJ-configured'
			)
		).toBeUndefined();
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

describe('usdtBaseUnits', () => {
	it('turns 10 USDT into 6-decimal base units and prints them back', () => {
		expect(usdtBaseUnits(10, 6)).toBe(10_000_000);
		expect(formatUsdtUnits(10, 6)).toBe('0.00001');
		expect(formatUsdtUnits(10_000_000, 6)).toBe('10');
		expect(formatUsdtUnits(1111, 6)).toBe('0.001111');
		expect(formatUsdtBalance(100_000_000, 6)).toBe('100.00');
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
