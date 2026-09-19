import { describe, expect, it, vi } from 'vitest';
import {
	installEsploraRetryFetch,
	resolveBrowserIndexer,
	scanBtcBalance,
	sumSpendableSats
} from '$lib/stores/wallet/wallet-balances';

describe('scanBtcBalance', () => {
	it('maps electrum ssl urls to esplora https on testnet', () => {
		expect(resolveBrowserIndexer('ssl://electrum.blockstream.info:60002', 'testnet')).toBe(
			'https://blockstream.info/testnet/api'
		);
	});

	it('sums vanilla and colored spendable across the keychain', () => {
		expect(
			sumSpendableSats({
				vanilla: { spendable: 5000 },
				colored: { spendable: 3075 }
			})
		).toBe(8075);
	});

	it('syncs and refreshes before reading spendable', async () => {
		const order: string[] = [];
		const wallet = {
			isOnline: () => false,
			goOnline: vi.fn(async () => {
				order.push('goOnline');
			}),
			syncWallet: vi.fn(async () => {
				order.push('syncWallet');
			}),
			refreshWallet: vi.fn(async () => {
				order.push('refreshWallet');
			}),
			getBtcBalance: vi.fn(async () => {
				order.push('getBtcBalance');
				return { vanilla: { spendable: 5000 }, colored: { spendable: 0 } };
			}),
			getAddress: vi.fn(async () => {
				order.push('getAddress');
				return 'tb1ptestreceive';
			}),
			listUnspents: vi.fn(async () => {
				order.push('listUnspents');
				return [{}, {}];
			})
		};

		const scanned = await scanBtcBalance(wallet);

		expect(order.slice(0, 3)).toEqual(['goOnline', 'syncWallet', 'refreshWallet']);
		expect(scanned.balanceSats).toBe(5000);
		expect(scanned.utxoCount).toBe(2);
		expect(scanned.address).toBe('tb1ptestreceive');
	});

	it('retries Blockstream tip-height polls after 429', async () => {
		const originalFetch = window.fetch;
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(new Response('rate limited', { status: 429 }))
			.mockResolvedValueOnce(new Response('5149184', { status: 200 }));
		window.fetch = fetchMock;
		(window as Window & { __btEsploraRetryFetch?: boolean }).__btEsploraRetryFetch = false;

		try {
			installEsploraRetryFetch();
			const response = await window.fetch('https://blockstream.info/testnet/api/blocks/tip/height');
			expect(response.status).toBe(200);
			expect(fetchMock).toHaveBeenCalledTimes(2);
		} finally {
			window.fetch = originalFetch;
			delete (window as Window & { __btEsploraRetryFetch?: boolean }).__btEsploraRetryFetch;
		}
	});
});
