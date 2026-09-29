import { describe, expect, it, vi } from 'vitest';
import { getUtexoWallet } from '$lib/stores/wallet/wallet-init';
import {
	acceptIncomingPayment,
	clearRlnRuntime,
	IncomingPaymentPending,
	installEsploraRetryFetch,
	isMnemonicError,
	isRlnUrlParseError,
	rgbDatabasesToDelete,
	isWssGateway,
	rlnCreateUrls,
	rlnProxyUrl,
	resetEsploraFetchState,
	resolveBrowserIndexer,
	incomingReceiveReady,
	parseRgbAssets,
	pullIncomingTransfers,
	restoreStoredBackup,
	scheduleRgbRefresh,
	readRefreshFailure,
	scanBtcBalance,
	setEsploraBackoffMs,
	sumSpendableSats
} from '$lib/stores/wallet/wallet-balances';

vi.mock('$lib/stores/wallet/wallet-init', () => ({
	getUtexoWallet: vi.fn()
}));

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

	it('syncs before reading spendable', async () => {
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

		expect(order.slice(0, 3)).toEqual(['goOnline', 'syncWallet', 'getBtcBalance']);
		expect(wallet.refreshWallet).not.toHaveBeenCalled();
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

describe('incomingReceiveReady', () => {
	it('accepts a blind or witness receive once it has left the counterparty', () => {
		expect(
			incomingReceiveReady([
				{ kind: 'Send', status: 'Settled' },
				{ kind: 'ReceiveBlind', status: 'WaitingConfirmations' }
			])
		).toBe(true);
		expect(incomingReceiveReady([{ kind: 'ReceiveWitness', status: 'Settled' }])).toBe(true);
		expect(incomingReceiveReady([{ kind: 'ReceiveBlind', status: 'WaitingSafeHeight' }])).toBe(
			true
		);
	});

	it('rejects an unpaid invoice and a send', () => {
		expect(incomingReceiveReady([])).toBe(false);
		expect(incomingReceiveReady([{ kind: 'ReceiveBlind', status: 'WaitingCounterparty' }])).toBe(
			false
		);
		expect(incomingReceiveReady([{ kind: 'ReceiveBlind', status: 'Failed' }])).toBe(false);
		expect(incomingReceiveReady([{ kind: 'Send', status: 'Settled' }])).toBe(false);
	});
});

describe('acceptIncomingPayment', () => {
	const schemaId = 'rgb:sch:IpjJhFLz3oywYKQxO3KmFgR0Aa415nlTNrNyEFqMZCE#shoe-colombo-mango';

	it('reads an unknown schema as a hard refresh failure', () => {
		expect(readRefreshFailure({ UnknownRgbSchema: { schema_id: schemaId } })).toBe(
			`Unknown RGB schema ${schemaId}`
		);
		expect(readRefreshFailure(null)).toBeNull();
	});

	it('throws the wasm failure from refreshValue and does not treat it as pending', async () => {
		const online = { connected: true };
		const refreshValue = vi.fn(
			async () => new Map([[3, { failure: { UnknownRgbSchema: { schema_id: schemaId } } }]])
		);
		vi.mocked(getUtexoWallet).mockReturnValue({
			refreshWallet: vi.fn(),
			isOnline: () => true,
			syncWallet: vi.fn(),
			listTransfers: vi.fn(async () => [{ kind: 'ReceiveBlind', status: 'WaitingCounterparty' }]),
			_manager: { rlnBinding: { online, _wallet: { refreshValue } } }
		} as never);

		await expect(acceptIncomingPayment()).rejects.toThrow(`Unknown RGB schema ${schemaId}`);
		expect(refreshValue).toHaveBeenCalledWith(online, null, [], false);
	});

	it('backs up when the light poll misses the cap, then runs one full refresh', async () => {
		const online = { connected: true };
		const refreshValue = vi.fn(() => {
			if (refreshValue.mock.calls.length === 1)
				return new Promise<Map<number, unknown>>(() => undefined);
			return Promise.resolve(new Map());
		});
		const syncWallet = vi.fn();
		const createBackup = vi.fn(async () => ({ message: 'ok' }));
		const listAssets = vi.fn(async () => ({
			ifa: [],
			nia: [{ assetId: 'rgb:buHqKXhJ-configured-usdt', ticker: 'USDT', balance: { spendable: 1 } }]
		}));
		const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
		const stored = new Map<string, Uint8Array>();
		const backupBytes = new Uint8Array([4, 11, 22, 33]);
		vi.stubGlobal('indexedDB', fakeBackupDb(stored));
		const wallet = {
			isOnline: () => true,
			syncWallet,
			createBackup,
			listAssets,
			restoreFromBackupBytes: vi.fn(),
			_manager: {
				rlnBinding: {
					online,
					password: 'test-password',
					lastBackupBytes: backupBytes,
					walletData: { master_fingerprint: '4bfb7ab5' },
					_wallet: { refreshValue, flush: vi.fn(), backupInfo: () => true }
				}
			}
		};
		scheduleRgbRefresh(wallet, { timeoutMs: 15 });
		expect(info).toHaveBeenCalledWith('[wallet-refresh] start');
		scheduleRgbRefresh(wallet, { timeoutMs: 15 });
		expect(warn).toHaveBeenCalledWith('[wallet-refresh] already running');
		await vi.waitFor(() => {
			expect(warn).toHaveBeenCalledWith('[wallet-refresh] stopped after 45s');
			expect(createBackup).toHaveBeenCalledTimes(2);
			expect(refreshValue).toHaveBeenCalledTimes(2);
		});
		expect(createBackup).toHaveBeenCalledWith({
			backupPath: '',
			password: 'test-password'
		});
		expect(stored.get('4bfb7ab5')?.byteLength).toBe(backupBytes.byteLength);
		expect(refreshValue).toHaveBeenNthCalledWith(1, online, null, [], true);
		expect(refreshValue).toHaveBeenNthCalledWith(2, online, null, [], false);
		expect(syncWallet).toHaveBeenCalledTimes(1);
		scheduleRgbRefresh(wallet, { timeoutMs: 1000 });
		await vi.waitFor(() => {
			expect(info.mock.calls.filter((call) => call[0] === '[wallet-refresh] start')).toHaveLength(
				2
			);
			expect(createBackup).toHaveBeenCalledTimes(4);
		});
		info.mockRestore();
		warn.mockRestore();
		vi.unstubAllGlobals();
	});

	it('does not back up when a settled receive disappears', async () => {
		const online = { connected: true };
		const refreshValue = vi.fn(async () => new Map());
		const createBackup = vi.fn(async () => ({ message: 'ok' }));
		const settled = {
			kind: 'ReceiveBlind',
			status: 'Settled',
			txid: '62425ebc1d0c6da591375f4251504ae6fd1de8891018268aca2d373fb85b1238',
			invoiceString:
				'rgb:~/~/nWca/sb:utxob:HNc3NsZw-rest?assignment_name=assetOwner&expiry=1'
		};
		let reads = 0;
		const listTransfers = vi.fn(async () => {
			reads += 1;
			return reads === 1 ? [settled] : [];
		});
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
		const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
		const wallet = {
			isOnline: () => true,
			syncWallet: vi.fn(),
			createBackup,
			listAssets: vi.fn(async () => ({
				ifa: [
					{
						assetId: 'rgb:usdt',
						ticker: 'USDT',
						balance: { spendable: 100000000, settled: 100000000, future: 100000000 }
					}
				]
			})),
			listTransfers,
			_manager: {
				rlnBinding: {
					online,
					password: 'test-password',
					walletData: { master_fingerprint: 'a56d0ea6' },
					_wallet: { refreshValue, backupInfo: () => false }
				}
			}
		};
		scheduleRgbRefresh(wallet, { timeoutMs: 1000 });
		await vi.waitFor(() => {
			expect(warn).toHaveBeenCalledWith(
				'[wallet-refresh] settled receive missing; backup skipped'
			);
		});
		expect(createBackup).not.toHaveBeenCalled();
		expect(refreshValue).toHaveBeenCalledTimes(1);
		warn.mockRestore();
		info.mockRestore();
		vi.unstubAllGlobals();
	});

	it('restores the encrypted export for this fingerprint', async () => {
		const stored = new Map<string, Uint8Array>();
		const bytes = new Uint8Array([4, 11, 22, 33]);
		stored.set('__store__', new Uint8Array());
		stored.set('4bfb7ab5', bytes);
		vi.stubGlobal('indexedDB', fakeBackupDb(stored));
		const restoreFromBackupBytes = vi.fn();
		const restored = await restoreStoredBackup({
			restoreFromBackupBytes,
			_manager: {
				rlnBinding: {
					password: 'test-password',
					walletData: { master_fingerprint: '4bfb7ab5' }
				}
			}
		});
		expect(restored).toBe(true);
		expect(restoreFromBackupBytes).toHaveBeenCalledWith(bytes, 'test-password');
		vi.unstubAllGlobals();
	});

	it('skips restore when a settled receive is already live', async () => {
		const stored = new Map<string, Uint8Array>();
		stored.set('__store__', new Uint8Array());
		stored.set('a56d0ea6', new Uint8Array([1, 2, 3]));
		vi.stubGlobal('indexedDB', fakeBackupDb(stored));
		const restoreFromBackupBytes = vi.fn();
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
		const restored = await restoreStoredBackup({
			listAssets: async () => ({
				ifa: [{ assetId: 'rgb:usdt', ticker: 'USDT', balance: { spendable: 100000000 } }]
			}),
			listTransfers: async () => [
				{
					kind: 'ReceiveBlind',
					status: 'Settled',
					txid: '62425ebc1d0c6da591375f4251504ae6fd1de8891018268aca2d373fb85b1238'
				}
			],
			restoreFromBackupBytes,
			_manager: {
				rlnBinding: {
					password: 'test-password',
					walletData: { master_fingerprint: 'a56d0ea6' }
				}
			}
		});
		expect(restored).toBe(false);
		expect(restoreFromBackupBytes).not.toHaveBeenCalled();
		expect(warn).toHaveBeenCalledWith('[wallet-persist] skip restore; live receive kept');
		warn.mockRestore();
		vi.unstubAllGlobals();
	});

	it('pulls a new wallet without a second chain sync', async () => {
		const online = { connected: true };
		const refreshValue = vi.fn(async () => new Map());
		const syncWallet = vi.fn();
		await pullIncomingTransfers(
			{
				isOnline: () => true,
				syncWallet,
				_manager: { rlnBinding: { online, _wallet: { refreshValue } } }
			},
			{ skipSync: true }
		);
		expect(syncWallet).not.toHaveBeenCalled();
		expect(refreshValue).toHaveBeenCalledWith(online, null, [], true);
	});

	it('stays pending when refresh reports no failure and the receive is still waiting', async () => {
		const refreshValue = vi.fn(async () => new Map([[3, { failure: null }]]));
		vi.mocked(getUtexoWallet).mockReturnValue({
			refreshWallet: vi.fn(),
			isOnline: () => true,
			syncWallet: vi.fn(),
			listTransfers: vi.fn(async () => [{ kind: 'ReceiveBlind', status: 'WaitingCounterparty' }]),
			_manager: { rlnBinding: { online: {}, _wallet: { refreshValue } } }
		} as never);

		await expect(acceptIncomingPayment()).rejects.toBeInstanceOf(IncomingPaymentPending);
	});
});

describe('parseRgbAssets', () => {
	it('reads spendable NIA balances from grouped listAssets', () => {
		const assets = parseRgbAssets({
			nia: [
				{
					assetId: 'rgb:buHqKXhJ-kWm2Fnb-mBA1eIz-qr4wn7I-07MDVPY-idSqdJs',
					ticker: 'USDT',
					name: 'Tether USD',
					balance: { settled: 100_000_000, spendable: 100_000_000, future: 100_000_000 }
				}
			],
			ifa: [],
			cfa: [],
			uda: []
		});

		expect(assets).toEqual([
			{
				assetId: 'rgb:buHqKXhJ-kWm2Fnb-mBA1eIz-qr4wn7I-07MDVPY-idSqdJs',
				name: 'Tether USD',
				symbol: 'USDT',
				balance: 100_000_000,
				formattedBalance: '100,000,000'
			}
		]);
	});

	it('reads the bot IFA USDT contract into the balance row', () => {
		const assets = parseRgbAssets({
			nia: [],
			ifa: [
				{
					assetId: 'rgb:f~9F4X0C-TiLOTvy-pALF29V-2xJ2p0m-hP3_vpW-Alj4G5Y',
					ticker: 'USDT',
					name: 'Tether USD',
					balance: { settled: 100_000_000, spendable: 100_000_000 }
				}
			]
		});

		expect(assets[0]?.symbol).toBe('USDT');
		expect(assets[0]?.balance).toBe(100_000_000);
		expect(assets[0]?.assetId).toBe('rgb:f~9F4X0C-TiLOTvy-pALF29V-2xJ2p0m-hP3_vpW-Alj4G5Y');
	});

	it('keeps settled USDT when a refresh reports spendable zero', () => {
		const assets = parseRgbAssets({
			ifa: [
				{
					assetId: 'rgb:f~9F4X0C-TiLOTvy-pALF29V-2xJ2p0m-hP3_vpW-Alj4G5Y',
					ticker: 'USDT',
					name: 'USDT Token',
					balance: { spendable: 0, settled: 100_000_000, future: 100_000_000 }
				}
			]
		});

		expect(assets[0]?.balance).toBe(100_000_000);
	});
});

function fakeBackupDb(stored: Map<string, Uint8Array>) {
	return {
		open() {
			const request: {
				result: {
					objectStoreNames: { contains: (name: string) => boolean };
					createObjectStore: (name: string) => void;
					close: () => void;
					transaction: () => {
						objectStore: () => {
							put: (
								value: Uint8Array,
								key: string
							) => { onsuccess: (() => void) | null; onerror: (() => void) | null };
							get: (key: string) => {
								onsuccess: (() => void) | null;
								onerror: (() => void) | null;
								result?: Uint8Array;
							};
						};
					};
				};
				onupgradeneeded: (() => void) | null;
				onsuccess: (() => void) | null;
				onerror: (() => void) | null;
			} = {
				result: {
					objectStoreNames: { contains: () => stored.has('__store__') },
					createObjectStore: () => {
						stored.set('__store__', new Uint8Array());
					},
					close: () => undefined,
					transaction: () => ({
						objectStore: () => ({
							put: (value, key) => {
								const putRequest: { onsuccess: (() => void) | null; onerror: (() => void) | null } =
									{
										onsuccess: null,
										onerror: null
									};
								queueMicrotask(() => {
									stored.set(key, value);
									putRequest.onsuccess?.();
								});
								return putRequest;
							},
							get: (key) => {
								const getRequest: {
									onsuccess: (() => void) | null;
									onerror: (() => void) | null;
									result?: Uint8Array;
								} = { onsuccess: null, onerror: null };
								queueMicrotask(() => {
									getRequest.result = stored.get(key);
									getRequest.onsuccess?.();
								});
								return getRequest;
							}
						})
					})
				},
				onupgradeneeded: null,
				onsuccess: null,
				onerror: null
			};
			queueMicrotask(() => {
				if (!request.result.objectStoreNames.contains('bytes')) request.onupgradeneeded?.();
				request.onsuccess?.();
			});
			return request;
		}
	};
}
