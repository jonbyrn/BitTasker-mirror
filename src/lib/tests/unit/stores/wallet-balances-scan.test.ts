import { describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import { getUtexoWallet } from '$lib/stores/wallet/wallet-init';
import { state, walletStore } from '$lib/stores/wallet/wallet-state';
import { initialState, type RgbAsset } from '$lib/stores/wallet/wallet-types';
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
	fillUsdtBalance,
	flushWalletState,
	parseRgbAssets,
	pullIncomingTransfers,
	restoreOnUnlock,
	restoreStoredBackup,
	snapshotCovers,
	rgbDatabasePresent,
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

	it('does not retry a rejected transaction broadcast', async () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
		const originalFetch = window.fetch;
		resetEsploraFetchState();
		const fetchMock = vi
			.fn()
			.mockResolvedValue(new Response('bad-txns-inputs-missingorspent', { status: 400 }));
		window.fetch = fetchMock;
		(window as Window & { __btEsploraRetryFetch?: boolean }).__btEsploraRetryFetch = false;

		try {
			installEsploraRetryFetch();
			const response = await window.fetch('https://esplora-api.utexo.com/tx', {
				method: 'POST',
				body: '00'
			});
			expect(response.status).toBe(400);
			expect(await response.text()).toBe('bad-txns-inputs-missingorspent');
			expect(fetchMock).toHaveBeenCalledTimes(1);
			expect(warn).toHaveBeenCalledWith(
				'[esplora] POST /tx rejected',
				'bad-txns-inputs-missingorspent'
			);
		} finally {
			resetEsploraFetchState();
			window.fetch = originalFetch;
			delete (window as Window & { __btEsploraRetryFetch?: boolean }).__btEsploraRetryFetch;
			warn.mockRestore();
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

	it('keeps the wasm wallet as this when refreshing and flushing', async () => {
		const online = { connected: true };
		const raw = {
			refreshValue: vi.fn(function (this: unknown) {
				if (this == null) throw new Error('null pointer passed to rust');
				return new Map();
			}),
			flush: vi.fn(function (this: unknown) {
				if (this == null) throw new Error('null pointer passed to rust');
				return Promise.resolve();
			})
		};
		const wallet = {
			isOnline: () => true,
			_manager: { rlnBinding: { online, _wallet: raw } }
		};
		await pullIncomingTransfers(wallet);
		expect(raw.refreshValue.mock.instances[0]).toBe(raw);
		expect(raw.flush).not.toHaveBeenCalled();
		expect(raw.refreshValue).toHaveBeenCalledWith(online, null, [], false);
	});

	it('persists with backupNow and does not call flush', async () => {
		const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
		const backupNow = vi.fn(async () => undefined);
		const flush = vi.fn();
		const wallet = {
			backupNow,
			_manager: { rlnBinding: { _wallet: { flush } } }
		};
		await expect(flushWalletState(wallet)).resolves.toBe(true);
		expect(backupNow).toHaveBeenCalledOnce();
		expect(flush).not.toHaveBeenCalled();
		expect(info).toHaveBeenCalledWith('[wallet-persist] wallet.backupNow');
		info.mockRestore();
	});

	it('reports a missing backup method without throwing', async () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
		const wallet = {
			isOnline: () => true,
			_manager: {
				rlnBinding: {
					online: { connected: true },
					_wallet: { refreshValue: vi.fn(async () => new Map()) }
				}
			}
		};
		await expect(flushWalletState(wallet)).resolves.toBe(false);
		expect(warn).toHaveBeenCalledWith('[wallet-persist] backup method missing');
		warn.mockRestore();
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

	it('does not start a second refresh while the first wasm call is still running', async () => {
		const online = { connected: true };
		const refreshValue = vi.fn(
			() => new Promise<Map<number, unknown>>((resolve) => setTimeout(() => resolve(new Map()), 40))
		);
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
			expect(refreshValue).toHaveBeenCalledTimes(1);
		});
		expect(refreshValue).toHaveBeenCalledWith(online, null, [], false);
		expect(syncWallet).not.toHaveBeenCalled();
		await refreshValue.mock.results[0]?.value;
		expect(refreshValue).toHaveBeenCalledTimes(1);
		await vi.waitFor(() => {
			expect(info.mock.calls.filter((call) => call[0] === '[wallet-refresh] start')).toHaveLength(
				1
			);
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
			invoiceString: 'rgb:~/~/nWca/sb:utxob:HNc3NsZw-rest?assignment_name=assetOwner&expiry=1'
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
			expect(warn).toHaveBeenCalledWith('[wallet-refresh] refused empty overwrite');
		});
		expect(createBackup).not.toHaveBeenCalled();
		expect(refreshValue).toHaveBeenCalledTimes(1);
		warn.mockRestore();
		info.mockRestore();
		vi.unstubAllGlobals();
	});

	it('keeps the store when a settled 100000000 receive disappears', async () => {
		const online = { connected: true };
		const assetId = 'rgb:f~9F4X0C-TiLOTvy-pALF29V-2xJ2p0m-hP3_vpW-Alj4G5Y';
		const held: RgbAsset = {
			assetId,
			name: 'Tether USD',
			symbol: 'USDT',
			balance: 100_000_000,
			formattedBalance: '100000000'
		};
		const starting = structuredClone(initialState);
		starting.rgb.balanceSats = 49347;
		starting.rgb.assets = [held];
		starting.assets = [held];
		starting.totalBalances.usdt = 100_000_000;
		walletStore.set(starting);
		const beforeStore = structuredClone(get(walletStore));
		const refreshValue = vi.fn(async () => new Map());
		const createBackup = vi.fn(async () => ({ message: 'ok' }));
		const failTransfers = vi.fn(async () => true);
		const settled = {
			kind: 'ReceiveBlind',
			status: 'Settled',
			txid: '62425ebc1d0c6da591375f4251504ae6fd1de8891018268aca2d373fb85b1238',
			invoiceString: 'rgb:~/~/nWca/sb:utxob:HNc3NsZw-rest?assignment_name=assetOwner&expiry=1'
		};
		let transferReads = 0;
		let assetReads = 0;
		const wallet = {
			isOnline: () => true,
			syncWallet: vi.fn(),
			getBtcBalance: vi.fn(async () => ({
				vanilla: { spendable: 44347 },
				colored: { spendable: 5000 }
			})),
			getAddress: vi.fn(async () => 'tb1p-test'),
			createBackup,
			failTransfers,
			listAssets: vi.fn(async () => {
				assetReads += 1;
				if (assetReads === 1) {
					return {
						ifa: [
							{
								assetId,
								ticker: 'USDT',
								balance: { spendable: 100_000_000, settled: 100_000_000, future: 100_000_000 }
							}
						]
					};
				}
				return { ifa: [] };
			}),
			listTransfers: vi.fn(async () => {
				transferReads += 1;
				return transferReads === 1 ? [settled] : [];
			}),
			_manager: {
				rlnBinding: {
					online,
					password: 'test-password',
					walletData: { master_fingerprint: 'a56d0ea6' },
					_wallet: { refreshValue, backupInfo: () => false }
				}
			}
		};
		state.utexoWallet = wallet as never;
		const stored = new Map<string, Uint8Array>();
		const backupBytes = new Uint8Array([7, 8, 6]);
		stored.set('a56d0ea6', backupBytes);
		vi.stubGlobal('indexedDB', fakeBackupDb(stored));
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
		vi.spyOn(console, 'info').mockImplementation(() => undefined);
		scheduleRgbRefresh(wallet, { timeoutMs: 1000 });
		await vi.waitFor(() => {
			expect(warn).toHaveBeenCalledWith('[wallet-refresh] refused empty overwrite');
		});
		expect(get(walletStore)).toEqual(beforeStore);
		expect(createBackup).not.toHaveBeenCalled();
		expect(failTransfers).not.toHaveBeenCalled();
		expect(stored.get('a56d0ea6')).toEqual(backupBytes);
		expect(refreshValue.mock.calls.map((call) => call[3])).toEqual([true]);
		state.utexoWallet = null;
		walletStore.set(structuredClone(initialState));
		warn.mockRestore();
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	});

	it('keeps a stored snapshot ahead of an older backup', () => {
		expect(
			snapshotCovers([{ key: '/rln_037153fd_signet/037153fd', bytes: 481_097 }], '037153fd')
		).toBe(true);
		expect(snapshotCovers([{ key: '/rln_eb259f1f_signet/eb259f1f', bytes: 100 }], '037153fd')).toBe(
			false
		);
		expect(snapshotCovers([{ key: '/rln_037153fd_signet/037153fd', bytes: 0 }], '037153fd')).toBe(
			false
		);
	});

	it('does not restore over a snapshot that is already stored', async () => {
		const fingerprint = '037153fd';
		const snapshots = [{ key: `/rln_${fingerprint}_signet/${fingerprint}`, value: 'snapshot' }];
		vi.stubGlobal('indexedDB', {
			open() {
				const request: {
					result: {
						objectStoreNames: { contains: (name: string) => boolean };
						close: () => void;
						transaction: () => {
							objectStore: () => {
								getAllKeys: () => { result: IDBValidKey[] };
								getAll: () => { result: string[] };
							};
							oncomplete: (() => void) | null;
							onerror: (() => void) | null;
						};
					};
					onsuccess: (() => void) | null;
					onerror: (() => void) | null;
				} = {
					result: {
						objectStoreNames: { contains: (name: string) => name === 'snapshots' },
						close: () => undefined,
						transaction: () => {
							const tx: {
								objectStore: () => {
									getAllKeys: () => { result: IDBValidKey[] };
									getAll: () => { result: string[] };
								};
								oncomplete: (() => void) | null;
								onerror: (() => void) | null;
							} = {
								oncomplete: null,
								onerror: null,
								objectStore: () => ({
									getAllKeys: () => ({ result: snapshots.map((row) => row.key) }),
									getAll: () => ({ result: snapshots.map((row) => row.value) })
								})
							};
							queueMicrotask(() => {
								tx.oncomplete?.();
							});
							return tx;
						}
					},
					onsuccess: null,
					onerror: null
				};
				queueMicrotask(() => {
					request.onsuccess?.();
				});
				return request;
			}
		});
		const restoreFromBackupBytes = vi.fn();
		const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
		const restored = await restoreStoredBackup({
			restoreFromBackupBytes,
			_manager: {
				rlnBinding: {
					password: 'test-password',
					walletData: { master_fingerprint: fingerprint }
				}
			}
		});
		expect(restored).toBe(false);
		expect(restoreFromBackupBytes).not.toHaveBeenCalled();
		expect(info).toHaveBeenCalledWith('[wallet-persist] skip restore; latest snapshot kept');
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

	it('does not restore on unlock when an rln database already exists', async () => {
		const stored = new Map<string, Uint8Array>();
		stored.set('__store__', new Uint8Array());
		stored.set('2b3173cc', new Uint8Array([9, 8, 7]));
		vi.stubGlobal('indexedDB', fakeBackupDb(stored));
		const restoreFromBackupBytes = vi.fn();
		const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
		const restored = await restoreOnUnlock(
			{
				restoreFromBackupBytes,
				_manager: {
					rlnBinding: {
						password: 'test-password',
						walletData: { master_fingerprint: '2b3173cc' }
					}
				}
			},
			true
		);
		expect(restored).toBe(false);
		expect(restoreFromBackupBytes).not.toHaveBeenCalled();
		expect(info).toHaveBeenCalledWith('[wallet-persist] skip restore; indexeddb wallet kept');
		info.mockRestore();
		vi.unstubAllGlobals();
	});

	it('treats an rln database as local wallet state and a backup db as fresh', async () => {
		vi.stubGlobal('indexedDB', {
			databases: async () => [{ name: 'rln_2b3173cc_signet' }, { name: 'rgb_backup_bytes' }]
		});
		await expect(rgbDatabasePresent()).resolves.toBe(true);
		vi.stubGlobal('indexedDB', {
			databases: async () => [{ name: 'rgb_backup_bytes' }]
		});
		await expect(rgbDatabasePresent()).resolves.toBe(false);
		vi.unstubAllGlobals();
	});

	it('skips restore when listAssets throws instead of treating the wallet as empty', async () => {
		const stored = new Map<string, Uint8Array>();
		stored.set('__store__', new Uint8Array());
		stored.set('2b3173cc', new Uint8Array([9, 8, 7]));
		vi.stubGlobal('indexedDB', fakeBackupDb(stored));
		const restoreFromBackupBytes = vi.fn();
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
		const restored = await restoreStoredBackup({
			listAssets: async () => {
				throw new Error('null pointer passed to rust');
			},
			listTransfers: async () => [{ kind: 'ReceiveBlind', status: 'Settled', txid: 'a66f7313' }],
			restoreFromBackupBytes,
			_manager: {
				rlnBinding: {
					password: 'test-password',
					walletData: { master_fingerprint: '2b3173cc' }
				}
			}
		});
		expect(restored).toBe(false);
		expect(restoreFromBackupBytes).not.toHaveBeenCalled();
		expect(warn).toHaveBeenCalledWith('[wallet-persist] skip restore; transfer list failed');
		warn.mockRestore();
		vi.unstubAllGlobals();
	});

	it('skips restore when the asset balance is future-only and the unfiltered transfer list is empty', async () => {
		const stored = new Map<string, Uint8Array>();
		stored.set('__store__', new Uint8Array());
		stored.set('2b3173cc', new Uint8Array([9, 8, 7]));
		vi.stubGlobal('indexedDB', fakeBackupDb(stored));
		const restoreFromBackupBytes = vi.fn();
		const listTransfers = vi.fn(async (assetId?: string) =>
			assetId ? [{ kind: 'ReceiveBlind', status: 'WaitingConfirmations', txid: 'c53f8ff2' }] : []
		);
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
		const restored = await restoreStoredBackup({
			listAssets: async () => ({
				ifa: [
					{
						assetId: 'rgb:usdt',
						ticker: 'USDT',
						balance: { spendable: 0, settled: 0, future: 100000000 }
					}
				]
			}),
			listTransfers,
			restoreFromBackupBytes,
			_manager: {
				rlnBinding: {
					password: 'test-password',
					walletData: { master_fingerprint: '2b3173cc' }
				}
			}
		});
		expect(restored).toBe(false);
		expect(restoreFromBackupBytes).not.toHaveBeenCalled();
		expect(listTransfers).not.toHaveBeenCalled();
		expect(warn).toHaveBeenCalledWith('[wallet-persist] skip restore; live receive kept');
		warn.mockRestore();
		vi.unstubAllGlobals();
	});

	it('queries asset-tied transfers when the unfiltered list would miss them', async () => {
		const stored = new Map<string, Uint8Array>();
		stored.set('__store__', new Uint8Array());
		stored.set('2b3173cc', new Uint8Array([9, 8, 7]));
		vi.stubGlobal('indexedDB', fakeBackupDb(stored));
		const restoreFromBackupBytes = vi.fn();
		const listTransfers = vi.fn(async (assetId?: string) =>
			assetId === 'rgb:usdt' ? [{ kind: 'ReceiveBlind', status: 'Settled', txid: 'a66f7313' }] : []
		);
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
		const restored = await restoreStoredBackup({
			listAssets: async () => ({
				ifa: [
					{ assetId: 'rgb:usdt', ticker: 'USDT', balance: { spendable: 0, settled: 0, future: 0 } }
				]
			}),
			listTransfers,
			restoreFromBackupBytes,
			_manager: {
				rlnBinding: {
					password: 'test-password',
					walletData: { master_fingerprint: '2b3173cc' }
				}
			}
		});
		expect(restored).toBe(false);
		expect(restoreFromBackupBytes).not.toHaveBeenCalled();
		expect(listTransfers).toHaveBeenCalledWith('rgb:usdt');
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
				spendable: 100_000_000,
				precision: undefined,
				formattedBalance: '100.00'
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

describe('fillUsdtBalance', () => {
	it('shows the faucet USDT balance when listAssets has no USDT row', async () => {
		const faucet = 'rgb:f~9F4X0C-TiLOTvy-pALF29V-2xJ2p0m-hP3_vpW-Alj4G5Y';
		const assets = await fillUsdtBalance(
			{
				getAssetBalance: vi.fn().mockResolvedValue({
					spendable: 200_000_000,
					settled: 200_000_000,
					future: 200_000_000
				})
			},
			[]
		);
		expect(assets).toEqual([
			expect.objectContaining({
				assetId: faucet,
				symbol: 'USDT',
				balance: 200_000_000,
				spendable: 200_000_000,
				formattedBalance: '200.00'
			})
		]);
	});

	it('leaves the list unchanged when the faucet asset is missing', async () => {
		const assets = await fillUsdtBalance(
			{
				getAssetBalance: vi
					.fn()
					.mockRejectedValue(new Error('Asset with id rgb:f~9F4X0C not found'))
			},
			[]
		);
		expect(assets).toEqual([]);
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
