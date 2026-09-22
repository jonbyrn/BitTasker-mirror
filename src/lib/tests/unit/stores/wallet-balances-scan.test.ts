import { describe, expect, it, vi } from 'vitest';
import {
	clearRlnRuntime,
	installEsploraRetryFetch,
	isMnemonicError,
	isRlnUrlParseError,
	rgbDatabasesToDelete,
	isWssGateway,
	rlnCreateUrls,
	rlnProxyUrl,
	resetEsploraFetchState,
	resolveBrowserIndexer,
	scanBtcBalance,
	setEsploraBackoffMs,
	sumSpendableSats
} from '$lib/stores/wallet/wallet-balances';

describe('scanBtcBalance', () => {
	it('does not treat a bip39 reject as an indexer failure', () => {
		expect(
			isMnemonicError(
				new Error('Invalid mnemonic error: mnemonic contains an unknown word (word 6)')
			)
		).toBe(true);
		expect(
			isMnemonicError('Invalid mnemonic error: mnemonic contains an unknown word (word 6)')
		).toBe(true);
		expect(isMnemonicError(new Error('Invalid indexer: not a valid esplora server'))).toBe(false);
	});

	it('uses the signet lightning gateway when no wss proxy is set', () => {
		expect(rlnProxyUrl('https://rgb-proxy.utexo.com/json-rpc')).toBe(
			'wss://ln-gateway-signet.utexo.com'
		);
		expect(rlnProxyUrl('ssl://electrum.blockstream.info:60002')).toBe(
			'wss://ln-gateway-signet.utexo.com'
		);
		expect(rlnProxyUrl(undefined)).toBe('wss://ln-gateway-signet.utexo.com');
		expect(rlnProxyUrl('wss://ln-gateway.example/')).toBe('wss://ln-gateway.example/');
	});

	it('defaults the rln node to the signet lightning gateway', () => {
		const urls = rlnCreateUrls({
			indexer: 'ssl://electrum.blockstream.info:60002',
			transport: 'https://rgb-proxy.utexo.com/json-rpc',
			network: 'testnet'
		});
		expect(urls.indexerUrl).toBe('https://blockstream.info/testnet/api');
		expect(urls.transportEndpoint).toBe('https://rgb-proxy.utexo.com/json-rpc');
		expect(urls.proxyUrl).toBe('wss://ln-gateway-signet.utexo.com');
	});

	it('detects rln rust url parse throws', () => {
		expect(isRlnUrlParseError(new Error('url parse'))).toBe(true);
		expect(isRlnUrlParseError('Error: url parse')).toBe(true);
		expect(isRlnUrlParseError(new Error('Invalid mnemonic'))).toBe(false);
	});

	it('purges the ghost signet database and any other rln stores', () => {
		expect(rgbDatabasesToDelete(['rln_73c5da0a_signet', 'app-cache', undefined])).toEqual(
			expect.arrayContaining(['rln_wasm_sdk_runtime', 'rln_73c5da0a_signet'])
		);
		expect(rgbDatabasesToDelete(['app-cache'])).not.toContain('app-cache');
	});

	it('clears the rln runtime idb store', async () => {
		const deleteDatabase = vi.fn(() => {
			const request: { onsuccess: (() => void) | null } = { onsuccess: null };
			queueMicrotask(() => request.onsuccess?.());
			return request;
		});
		vi.stubGlobal('indexedDB', { deleteDatabase });
		await clearRlnRuntime();
		expect(deleteDatabase).toHaveBeenCalledWith('rln_wasm_sdk_runtime');
		vi.unstubAllGlobals();
	});

	it('accepts only a real wss lightning gateway', () => {
		expect(isWssGateway('wss://ln-gateway.example/')).toBe(true);
		expect(isWssGateway('')).toBe(false);
		expect(isWssGateway('ssl://electrum.blockstream.info:60002')).toBe(false);
		expect(isWssGateway('https://blockstream.info/testnet/api')).toBe(false);
	});

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

	it('retries Blockstream tip-height once when the cache is empty', async () => {
		const originalFetch = window.fetch;
		resetEsploraFetchState();
		setEsploraBackoffMs(0);
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
			setEsploraBackoffMs(8_000);
			resetEsploraFetchState();
			window.fetch = originalFetch;
			delete (window as Window & { __btEsploraRetryFetch?: boolean }).__btEsploraRetryFetch;
		}
	});

	it('serves cached tip-height instead of retrying 429', async () => {
		const originalFetch = window.fetch;
		resetEsploraFetchState();
		setEsploraBackoffMs(0);
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(new Response('5149184', { status: 200 }))
			.mockResolvedValueOnce(new Response('rate limited', { status: 429 }));
		window.fetch = fetchMock;
		(window as Window & { __btEsploraRetryFetch?: boolean }).__btEsploraRetryFetch = false;

		try {
			installEsploraRetryFetch();
			const first = await window.fetch('https://blockstream.info/testnet/api/blocks/tip/height');
			const second = await window.fetch('https://blockstream.info/testnet/api/blocks/tip/height');
			expect(first.status).toBe(200);
			expect(await second.text()).toBe('5149184');
			expect(fetchMock).toHaveBeenCalledTimes(1);
		} finally {
			setEsploraBackoffMs(8_000);
			resetEsploraFetchState();
			window.fetch = originalFetch;
			delete (window as Window & { __btEsploraRetryFetch?: boolean }).__btEsploraRetryFetch;
		}
	});
});
