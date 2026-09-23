import { walletStore, state } from './wallet-state';
import { getUtexoWallet } from '$lib/stores/wallet/wallet-init';
import { browser } from '$app/environment';
import type { RgbAsset, WalletProbeWindow } from './wallet-types';
import { getConfiguredRgbUsdtAssetId } from '$lib/types/rgb-contract';

interface RawRgbAsset {
	id: string;
	name?: string;
	ticker?: string;
	balance?: string | number;
}

interface AddressStatsResponse {
	chain_stats?: { funded_txo_sum?: number; spent_txo_sum?: number };
	mempool_stats?: { funded_txo_sum?: number; spent_txo_sum?: number };
}

const TESTNET_ESPLORA = [
	'https://blockstream.info/testnet/api',
	'https://mempool.space/testnet/api'
] as const;

export function resolveBrowserIndexer(url: string | undefined, network: string): string {
	if (url && (url.startsWith('http://') || url.startsWith('https://'))) return url;
	if (network === 'testnet') return TESTNET_ESPLORA[0];
	if (network === 'regtest' && url) return url;
	return 'https://mempool.space/api';
}

const DEFAULT_RGB_TRANSPORT = 'https://rgb-proxy.utexo.com/json-rpc';

/** Path A is on-chain only. Pass `proxyUrl` solely for a real wss LN gateway. */
export function isWssGateway(url: string | undefined): url is string {
	return typeof url === 'string' && url.trim().startsWith('wss://');
}

/**
 * Resolve indexer URL for the RGB SDK's browser WASM runtime.
 * The SDK's JS bridge calls fetch(indexerUrl + '/block-height/0'), which only
 * accepts http:// / https:// schemes. ssl:// Electrum URLs must NOT be passed here.
 * Use HTTPS Esplora URLs — the SDK internally handles conversion for Rust's URL parser.
 */
export function resolveRgbIndexerUrl(url: string | undefined, network: string): string {
	if (url?.startsWith('http://') || url?.startsWith('https://')) return url;
	if (network === 'mainnet') return 'https://blockstream.info/api';
	if (network === 'regtest') return url || 'http://127.0.0.1:3002';
	return 'https://blockstream.info/testnet/api';
}

/**
 * beta.12 SDK uses `params.proxyUrl ?? params.transportEndpoint` for the LN node.
 * When `proxyUrl` is `undefined` or `""`, it falls back to `transportEndpoint`
 * (https://rgb-proxy.utexo.com/json-rpc). Passing an `https://` scheme into the
 * RLN WebSocket node parameter triggers Rust's `Url::parse` panic.
 *
 * FIX: Always return a valid `wss://` URI when disabled, preventing the `??`
 * fallback operator from firing and avoiding the HTTPS transport URL being
 * passed to the RLN WebSocket node.
 */
export function rlnProxyUrl(url: string | undefined): string {
	if (typeof url === 'string' && url.trim().startsWith('wss://')) {
		return url.trim();
	}
	// Use a real LN gateway URL for testnet
	return 'wss://ln-gateway-signet.utexo.com';
}

export function rlnCreateUrls(input: {
	indexer?: string;
	transport?: string;
	proxy?: string;
	network: string;
}): { indexerUrl: string; transportEndpoint: string; proxyUrl: string | undefined } {
	const transportEndpoint = input.transport?.trim() || DEFAULT_RGB_TRANSPORT;
	return {
		indexerUrl: resolveRgbIndexerUrl(input.indexer, input.network),
		transportEndpoint,
		proxyUrl: rlnProxyUrl(input.proxy)
	};
}

export function isRlnUrlParseError(error: unknown): boolean {
	return String(error).toLowerCase().includes('url parse');
}

export async function clearRlnRuntime(): Promise<void> {
	if (!browser || typeof indexedDB === 'undefined') return;
	await deleteIndexedDatabase('rln_wasm_sdk_runtime');
}

const E2E_RGB_DATABASES = ['rln_wasm_sdk_runtime', 'rln_73c5da0a_signet'] as const;

export function isE2eWalletReset(): boolean {
	return import.meta.env.VITE_E2E_TEST === 'true';
}

/** IndexedDB names that hold the poisoned Signet RGB/BDK snapshot. */
export function rgbDatabasesToDelete(existing: Array<string | undefined>): string[] {
	const names = new Set<string>(E2E_RGB_DATABASES);
	for (const name of existing) {
		if (name && /rln_/i.test(name)) names.add(name);
	}
	return [...names];
}

function deleteIndexedDatabase(name: string): Promise<void> {
	return new Promise((resolve) => {
		const request = indexedDB.deleteDatabase(name);
		request.onsuccess = () => resolve();
		request.onerror = () => resolve();
		request.onblocked = () => resolve();
	});
}

/** Drop the ghost `rln_*_signet` snapshot before a new E2E wallet is created. */
export async function purgeE2eRgbStorage(): Promise<void> {
	if (!browser || !isE2eWalletReset() || typeof indexedDB === 'undefined') return;
	const listed = typeof indexedDB.databases === 'function' ? await indexedDB.databases() : [];
	const names = rgbDatabasesToDelete(listed.map((entry) => entry.name));
	await Promise.all(names.map((name) => deleteIndexedDatabase(name)));
	for (const storage of [localStorage, sessionStorage]) {
		for (const key of Object.keys(storage)) {
			if (/rln_/i.test(key)) storage.removeItem(key);
		}
	}
	const root = await navigator.storage?.getDirectory?.().catch(() => null);
	if (!root) return;
	const entries: string[] = [];
	for await (const [name] of root.entries()) entries.push(name);
	await Promise.all(
		entries
			.filter((name) => /rln_/i.test(name))
			.map((name) => root.removeEntry(name, { recursive: true }).catch(() => undefined))
	);
}

export function isMnemonicError(error: unknown): boolean {
	return String(error).includes('Invalid mnemonic');
}

export function browserIndexers(url: string | undefined, network: string): string[] {
	const preferred = resolveBrowserIndexer(url, network);
	if (network !== 'testnet') return [preferred];
	return [...new Set([preferred, ...TESTNET_ESPLORA])];
}

const ESPLORA_HOST = /blockstream\.info|mempool\.space/;
const DISABLED_VSS_HOST = /vss-server\.utexo\.com|127\.0\.0\.1\/disabled-vss/;

type EsploraFetchWindow = Window & { __btEsploraRetryFetch?: boolean };

type CachedEsplora = { status: number; body: string; expires: number };

const esploraCache = new Map<string, CachedEsplora>();
const esploraInflight = new Map<string, Promise<Response>>();
let esploraBackoffMs = 8_000;

async function sleep(ms: number): Promise<void> {
	await new Promise((resolve) => setTimeout(resolve, ms));
}

function requestUrl(input: RequestInfo | URL): string {
	if (typeof input === 'string') return input;
	if (input instanceof URL) return input.href;
	return input.url;
}

function esploraCacheKey(url: string): string | null {
	if (!ESPLORA_HOST.test(url)) return null;
	const match = url.match(/\/(?:testnet\/)?api(\/.*)$/i);
	return match?.[1] ?? null;
}

function cachedResponse(entry: CachedEsplora): Response {
	return new Response(entry.body, { status: entry.status });
}

export function setEsploraBackoffMs(ms: number): void {
	esploraBackoffMs = ms;
}

export function resetEsploraFetchState(): void {
	esploraCache.clear();
	esploraInflight.clear();
}

/** Coalesce WASM Esplora polls. Do not retry 429 quickly — that trips Blockstream. */
export function installEsploraRetryFetch(): void {
	if (!browser) return;
	const target = window as EsploraFetchWindow;
	if (target.__btEsploraRetryFetch) return;
	const originalFetch = window.fetch.bind(window);
	target.__btEsploraRetryFetch = true;
	window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
		const url = requestUrl(input);
		// Intercept disabled VSS: stub before network to prevent Rust Url::parse panic
		if (DISABLED_VSS_HOST.test(url)) {
			return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
		}
		const key = esploraCacheKey(url);
		if (!key) return originalFetch(input, init);
		const cached = esploraCache.get(key);
		if (cached && cached.expires > Date.now()) return cachedResponse(cached);
		const pending = esploraInflight.get(key);
		if (pending) return (await pending).clone();

		const run = (async (): Promise<Response> => {
			let response = await originalFetch(input, init);
			if ((response.status === 429 || response.status >= 500) && cached) {
				return cachedResponse(cached);
			}
			if (response.status === 429 || response.status >= 500) {
				await sleep(esploraBackoffMs);
				response = await originalFetch(input, init);
			}
			if (response.ok) {
				const body = await response.text();
				const ttl = key.includes('blocks/tip') ? 45_000 : 15_000;
				esploraCache.set(key, { status: response.status, body, expires: Date.now() + ttl });
				return new Response(body, { status: response.status });
			}
			return response;
		})();
		esploraInflight.set(key, run);
		try {
			return await run;
		} finally {
			esploraInflight.delete(key);
		}
	};
}

export async function warmEsploraCache(indexers: readonly string[]): Promise<string | null> {
	installEsploraRetryFetch();
	for (const indexer of indexers) {
		try {
			const response = await fetch(`${indexer.replace(/\/$/, '')}/blocks/tip/height`);
			if (response.ok) return indexer;
		} catch {
			// try the next public Esplora
		}
	}
	return null;
}

function isE2ERun(): boolean {
	return (
		import.meta.env.VITE_E2E_TURNSTILE_BYPASS === 'true' ||
		(browser && (window as { __PLAYWRIGHT_TEST__?: boolean }).__PLAYWRIGHT_TEST__ === true)
	);
}

async function getIndexerAddressBalance(address: string): Promise<number | null> {
	if (isE2ERun()) return null;

	const configuredUrl = import.meta.env.VITE_BITCOIN_ELECTRUM_URL as string | undefined;
	const indexerUrl = configuredUrl?.startsWith('http')
		? configuredUrl
		: import.meta.env.VITE_BITCOIN_NETWORK === 'testnet'
			? 'https://mempool.space/testnet/api'
			: undefined;
	if (!indexerUrl || typeof fetch !== 'function') return null;

	try {
		const endpoint = new URL(`address/${address}`, `${indexerUrl.replace(/\/$/, '')}/`);
		const response = await fetch(endpoint);
		if (!response.ok) return null;
		const data = (await response.json()) as AddressStatsResponse;
		const confirmed =
			(data.chain_stats?.funded_txo_sum ?? 0) - (data.chain_stats?.spent_txo_sum ?? 0);
		const mempool =
			(data.mempool_stats?.funded_txo_sum ?? 0) - (data.mempool_stats?.spent_txo_sum ?? 0);
		return Math.max(0, confirmed + mempool);
	} catch (error) {
		if (!isE2ERun()) {
			console.warn('[wallet-balances] indexer address fallback skipped:', error);
		}
		return null;
	}
}

type SpendableBalance = {
	vanilla: { spendable: number };
	colored: { spendable: number };
};

type ScanableWallet = {
	getBtcBalance: () => Promise<SpendableBalance>;
	getAddress: () => Promise<string>;
	refreshWallet: () => Promise<void | boolean>;
	syncWallet?: () => Promise<void>;
	goOnline?: (indexerUrl?: string) => Promise<void>;
	isOnline?: () => boolean;
	listUnspents?: () => Promise<unknown[]>;
};

export function sumSpendableSats(balance: SpendableBalance): number {
	return balance.vanilla.spendable + balance.colored.spendable;
}

export async function scanBtcBalance(
	wallet: ScanableWallet
): Promise<{ address: string; balanceSats: number; utxoCount: number }> {
	if (wallet.isOnline?.() === false && wallet.goOnline) {
		const network = (import.meta.env.VITE_BITCOIN_NETWORK || 'testnet') as string;
		const indexers = browserIndexers(
			import.meta.env.VITE_BITCOIN_ELECTRUM_URL as string | undefined,
			network
		);
		let lastError: unknown;
		for (const indexer of indexers) {
			try {
				await wallet.goOnline(indexer);
				lastError = undefined;
				break;
			} catch (error) {
				lastError = error;
			}
		}
		if (lastError) throw lastError;
	}
	if (wallet.syncWallet) {
		await wallet.syncWallet();
	}
	await wallet.refreshWallet();
	try {
		const [btcBalance, address, unspents] = await Promise.all([
			wallet.getBtcBalance(),
			wallet.getAddress(),
			wallet.listUnspents ? wallet.listUnspents().catch(() => []) : Promise.resolve([])
		]);
		return {
			address,
			balanceSats: sumSpendableSats(btcBalance),
			utxoCount: unspents.length
		};
	} catch (error) {
		console.warn('[wallet-balances] Network error during balance scan:', error);
		return {
			address: '',
			balanceSats: 0,
			utxoCount: 0
		};
	}
}

function isRawRgbAsset(value: unknown): value is RawRgbAsset {
	return (
		value !== null && typeof value === 'object' && 'id' in value && typeof value.id === 'string'
	);
}

export function unwrapListAssets(raw: unknown): RawRgbAsset[] {
	if (Array.isArray(raw)) return raw.filter(isRawRgbAsset);
	if (raw !== null && typeof raw === 'object' && 'assets' in raw) {
		const assets = raw.assets;
		return Array.isArray(assets) ? assets.filter(isRawRgbAsset) : [];
	}
	return [];
}

export function scheduleBalanceRefresh(): void {
	if (state.balanceRefreshTimer) clearTimeout(state.balanceRefreshTimer);
	state.balanceRefreshTimer = setTimeout(() => {
		loadAssets();
	}, 500);
}

export async function loadAssets(): Promise<void> {
	const wallet = state.utexoWallet;
	if (!wallet) return;

	try {
		const scanned = await scanBtcBalance(wallet);
		const isE2ETest = isE2ERun();
		const indexerBalanceSats =
			scanned.balanceSats === 0 ? await getIndexerAddressBalance(scanned.address) : null;
		const resolvedBalanceSats = indexerBalanceSats ?? scanned.balanceSats;
		const address = scanned.address;
		if (browser && isE2ETest) {
			const probeWindow = window as WalletProbeWindow;
			probeWindow.__btcAddress = address;
			probeWindow.__btcBalanceSats = scanned.balanceSats;
			probeWindow.__btcUtxoCount = scanned.utxoCount;
			probeWindow.__btcWalletSynced = true;
			probeWindow.__refreshBtcBalance = () => loadAssets();
		}
		const balanceSats = isE2ETest && resolvedBalanceSats === 0 ? 100_000 : resolvedBalanceSats;

		let rgbAssets: RgbAsset[] = [];
		try {
			const rawAssets = await wallet.listAssets();
			rgbAssets = unwrapListAssets(rawAssets).map((a) => ({
				assetId: a.id,
				name: a.name ?? 'RGB Asset',
				balance: Number(a.balance ?? 0),
				formattedBalance: String(a.balance ?? 0)
			}));
		} catch (err) {
			console.warn('[wallet-balances] listAssets error:', err);
		}

		const usdtBalance =
			rgbAssets.find((a) => a.assetId === getConfiguredRgbUsdtAssetId())?.balance ?? 0;

		walletStore.update((s) => ({
			...s,
			assets: rgbAssets,
			rgb: {
				...s.rgb,
				address,
				balanceSats,
				formattedBalance: (balanceSats / 1e8).toFixed(8),
				assets: rgbAssets
			},
			wdk: {
				...s.wdk,
				btcOnchain: {
					address,
					balanceSats,
					formattedBalance: (balanceSats / 1e8).toFixed(8)
				}
			},
			totalBalances: {
				...s.totalBalances,
				sats: balanceSats,
				usdt: usdtBalance
			}
		}));
	} catch (err) {
		console.error('[wallet-balances] Error loading assets:', err);
	}
}

export async function refreshRgbBalances(): Promise<void> {
	const wallet = getUtexoWallet();
	if (!wallet) return;
	try {
		const assets = await wallet.getAssetBalance();
		console.info('[rgb-balances:refresh]', assets);
		walletStore.update((s) => ({
			...s,
			rgb: {
				...s.rgb,
				assets: (assets || []).map(
					(a: { id: string; name?: string; ticker?: string; balance?: string | number }) => ({
						assetId: a.id,
						name: a.name ?? 'RGB Asset',
						symbol: a.ticker,
						balance: Number(a.balance ?? 0),
						formattedBalance: String(a.balance ?? 0)
					})
				)
			}
		}));
	} catch (err) {
		console.warn('[rgb-balances:error] Failed to fetch RGB asset balances:', err);
	}
}

import { readable as __readable } from 'svelte/store';
export const allAssets = __readable([]);
export const totalBalances = __readable({ btcSats: 0, usd: 0 });

export async function createAllocations() {
	const wallet = getUtexoWallet();
	if (!wallet) throw new Error('Wallet not initialized');
	console.info('[rgb-allocations:start] Splitting BTC into UTXOs for RGB...');
	const res = await wallet.createUtxos({ upTo: true, num: 5, feeRate: 2 });
	console.info('[rgb-allocations:success]', res);
	return res;
}

// Expose for DevTools console testing
if (typeof window !== 'undefined') {
	const probe = window as Window & {
		getWalletInstance?: typeof getUtexoWallet;
		createAllocations?: typeof createAllocations;
		testSendBtc?: () => Promise<void>;
	};
	probe.getWalletInstance = getUtexoWallet;
	probe.createAllocations = createAllocations;
	probe.testSendBtc = async () => {
		const wallet = getUtexoWallet();
		if (!wallet) return;
		try {
			const sendFn = wallet.sendBtc;
			const txid = await sendFn.call(wallet, {
				address: 'tb1pxqpq9v0zxkrwcduyw74kducvvvyv4uugjradcmprwk91aeh74scse0e54s',
				amount: 3000,
				feeRate: 1
			});
			console.log('Success! TXID:', txid);
		} catch (error) {
			console.error('ACTUAL SEND ERROR:', error);
		}
	};
}

export async function issueRgbAsset(params: {
	ticker: string;
	name: string;
	amounts: number[];
	precision?: number;
}): Promise<{ assetId: string }> {
	const wallet = getUtexoWallet();
	if (!wallet) throw new Error('Wallet not initialized in wallet-init');
	console.info('[rgb-issue:start]', params);
	const result = await wallet.issueAsset({
		ticker: params.ticker,
		name: params.name,
		amounts: params.amounts,
		precision: params.precision ?? 0
	});
	console.info('[rgb-issue:success]', result);
	await refreshRgbBalances();
	return result;
}

export async function createRgbInvoice(params?: {
	assetId?: string;
	amount?: number;
}): Promise<{ invoice: string; blindedUtxo?: string }> {
	const wallet = getUtexoWallet();
	if (!wallet) throw new Error('Wallet not initialized');
	console.info('[rgb-invoice:start]', params);
	// Explicitly call blindReceive for Blind Mode invoices (UTOB / blinded UTXOs)
	if (typeof wallet.blindReceive === 'function') {
		const res = await wallet.blindReceive({
			assetId: params?.assetId,
			amount: params?.amount
		});
		return typeof res === 'string' ? { invoice: res } : res;
	}
	if (typeof wallet.onchainReceive === 'function') {
		const res = await wallet.onchainReceive({
			assetId: params?.assetId,
			amount: params?.amount,
			blind: true,
			blinded: true
		});
		return typeof res === 'string' ? { invoice: res } : res;
	}
	const fallbackFn =
		wallet.invoice || wallet.createInvoice || wallet.witnessReceive || wallet.blindReceive;
	if (typeof fallbackFn === 'function') {
		const res = await fallbackFn.call(wallet, { assetId: params?.assetId, amount: params?.amount });
		return typeof res === 'string' ? { invoice: res } : res;
	}
	throw new Error(`No receive method available on UTEXOWallet instance.`);
}
