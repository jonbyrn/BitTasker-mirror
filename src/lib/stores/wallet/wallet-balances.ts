import { get } from 'svelte/store';
import { ContractRune } from '$lib/runes/contract.svelte';
import { walletStore, state } from './wallet-state';
import { getUtexoWallet } from '$lib/stores/wallet/wallet-init';
import { browser } from '$app/environment';
import type { RgbAsset, WalletProbeWindow } from './wallet-types';
import {
	getConfiguredRgbUsdtAssetId,
	spendableRgbAssets,
	formatUsdtBalance,
	usdtBaseUnits,
	usdtInvoiceAsset,
	usdtPrecision
} from '$lib/types/rgb-contract';
import { FAUCET_IFA_ASSET } from './signet-lsp';
import { loadTransactions } from './wallet-transactions';
import { receiveWithAllocations } from './rgb-allocations';
import { unpaidReceiveBatches } from './decode-rgb-invoice';
import {
	chainAllocation,
	allocationCoversSpendable,
	enqueueWallet,
	inWalletTurn,
	releasePhantomSends,
	walletSendPending,
	type RgbUnspentRef
} from './prepare-rgb-send';
import { esploraOutputSpent } from './signet-broadcast';
import { wasmBusy, wasmCrashed, withWasm } from './wasm-lock';

interface RgbAmount {
	settled?: number;
	spendable?: number;
	future?: number;
}

interface RawRgbAsset {
	id?: string;
	assetId?: string;
	name?: string;
	ticker?: string;
	precision?: number;
	balance?: string | number | RgbAmount;
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

/**
 * True when this browser already has a wasm wallet database.
 * Checked before `wallet.init()`, which creates `rln_*` on a fresh device.
 * A missing `databases()` listing is treated as present so unlock does not restore.
 */
export async function rgbDatabasePresent(): Promise<boolean> {
	if (typeof indexedDB === 'undefined' || typeof indexedDB.databases !== 'function') return true;
	try {
		const listed = await indexedDB.databases();
		return listed.some((entry) => typeof entry.name === 'string' && /rln_/i.test(entry.name));
	} catch {
		return true;
	}
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

function requestMethod(input: RequestInfo | URL, init?: RequestInit): string {
	if (init?.method) return init.method.toUpperCase();
	if (typeof Request !== 'undefined' && input instanceof Request) return input.method.toUpperCase();
	return 'GET';
}

function isTxBroadcast(url: string, method: string): boolean {
	return method === 'POST' && /\/tx\/?(?:\?|#|$)/.test(url);
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
		if (isTxBroadcast(url, requestMethod(input, init))) {
			const response = await originalFetch(input, init);
			if (response.status === 400) {
				const body = await response.clone().text();
				console.warn('[esplora] POST /tx rejected', body);
			}
			return response;
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
): Promise<{ address: string; balanceSats: number; utxoCount: number } | null> {
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
		if (lastError) return null;
	}
	if (wallet.syncWallet) {
		await wallet.syncWallet();
	}
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
		return null;
	}
}

function isRawRgbAsset(value: unknown): value is RawRgbAsset {
	if (value === null || typeof value !== 'object') return false;
	const row = value as RawRgbAsset;
	return typeof row.id === 'string' || typeof row.assetId === 'string';
}

function positiveAmount(value: unknown): number | null {
	const numeric =
		typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
	return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

function spendableAmount(balance: RawRgbAsset['balance']): number {
	if (!balance || typeof balance !== 'object') return 0;
	return positiveAmount(balance.spendable) ?? 0;
}

/** Spendable when it is funded, otherwise settled, otherwise incoming. A zero spendable field must not hide settled USDT. */
function assetAmount(balance: RawRgbAsset['balance']): number {
	if (typeof balance === 'number' && Number.isFinite(balance)) return Math.max(0, balance);
	if (typeof balance === 'string') return positiveAmount(balance) ?? 0;
	if (balance && typeof balance === 'object') {
		return (
			positiveAmount(balance.spendable) ??
			positiveAmount(balance.settled) ??
			positiveAmount(balance.future) ??
			0
		);
	}
	return 0;
}

const ASSET_GROUPS = ['nia', 'cfa', 'uda', 'ifa'] as const;

export function unwrapListAssets(raw: unknown): RawRgbAsset[] {
	if (Array.isArray(raw)) return raw.filter(isRawRgbAsset);
	if (raw === null || typeof raw !== 'object') return [];
	const record = raw as Record<string, unknown>;
	if (Array.isArray(record.assets)) return record.assets.filter(isRawRgbAsset);
	return ASSET_GROUPS.flatMap((group) =>
		Array.isArray(record[group]) ? record[group].filter(isRawRgbAsset) : []
	);
}

export function parseRgbAssets(raw: unknown): RgbAsset[] {
	return unwrapListAssets(raw)
		.map((asset) => {
			const balance = assetAmount(asset.balance);
			const assetId = asset.assetId ?? asset.id ?? '';
			const symbol = asset.ticker;
			const precision = typeof asset.precision === 'number' ? asset.precision : undefined;
			const usdt = (symbol ?? '').toUpperCase() === 'USDT';
			return {
				assetId,
				name: asset.name ?? asset.ticker ?? 'RGB Asset',
				symbol,
				precision,
				balance,
				spendable: spendableAmount(asset.balance),
				formattedBalance: usdt
					? formatUsdtBalance(balance, usdtPrecision(symbol, precision))
					: new Intl.NumberFormat().format(balance)
			};
		})
		.filter((asset) => asset.assetId !== '');
}

function balanceRecord(raw: unknown): RawRgbAsset['balance'] | null {
	if (raw === null || typeof raw !== 'object') return null;
	const record = raw as Record<string, unknown>;
	const nested = record.balance;
	if (nested && typeof nested === 'object') return nested as RawRgbAsset['balance'];
	if ('spendable' in record || 'settled' in record || 'future' in record) {
		return record as RawRgbAsset['balance'];
	}
	return null;
}

/** Replace the USDT row with getAssetBalance. A missing row uses the faucet IFA, not the env id. */
export async function fillUsdtBalance(
	wallet: { getAssetBalance?: (assetId: string) => Promise<unknown> },
	assets: RgbAsset[]
): Promise<RgbAsset[]> {
	const held = assets.find(
		(asset) => (asset.symbol ?? '').toUpperCase() === 'USDT' && asset.assetId
	);
	const assetId = held?.assetId || FAUCET_IFA_ASSET;
	if (typeof wallet.getAssetBalance !== 'function') return assets;
	let raw: unknown;
	try {
		raw = await wallet.getAssetBalance(assetId);
	} catch {
		return assets;
	}
	const balance = balanceRecord(raw);
	if (!balance) return assets;
	const shown = assetAmount(balance);
	const spendable = spendableAmount(balance);
	if (!held && shown <= 0 && spendable <= 0) return assets;
	const precision = usdtPrecision(held?.symbol ?? 'USDT', held?.precision ?? 6);
	const row: RgbAsset = {
		assetId,
		name: held?.name ?? 'Tether USD',
		symbol: 'USDT',
		precision,
		balance: shown,
		spendable,
		formattedBalance: formatUsdtBalance(shown, precision)
	};
	if (!held) return [...assets, row];
	return assets.map((asset) => (asset.assetId === assetId ? { ...asset, ...row } : asset));
}

function unspentRows(value: unknown): RgbUnspentRef[] | null {
	if (!Array.isArray(value)) return null;
	const rows = value.filter((row): row is RgbUnspentRef => {
		if (!row || typeof row !== 'object') return false;
		const record = row as RgbUnspentRef;
		return (
			Array.isArray(record.rgbAllocations) &&
			typeof record.utxo === 'object' &&
			record.utxo !== null &&
			typeof record.utxo.exists === 'boolean'
		);
	});
	return rows.length === value.length ? rows : null;
}

/** Warn only when spendable USDT exceeds confirmed unspent outputs. Settled-only rows do not warn. */
export function chainGap(assets: RgbAsset[], ready = true): RgbAsset | undefined {
	if (!ready) return undefined;
	return assets.find((asset) => {
		if (asset.symbol?.toUpperCase() !== 'USDT' || asset.chainSpendable == null) return false;
		if (asset.chainUnknown || asset.pendingConfirm) return false;
		if (asset.spendable == null) return false;
		return asset.spendable > asset.chainSpendable;
	});
}

/** Refresh transfers once when the reported USDT is above the unspent outputs. */
async function resyncChainGap(
	wallet: Parameters<typeof pullIncomingTransfers>[0],
	assets: RgbAsset[],
	pull: boolean
): Promise<RgbAsset[]> {
	const gapped = chainGap(assets);
	if (!gapped || !pull) return assets;
	await pullIncomingTransfers(wallet, { skipSync: false, assetId: gapped.assetId }).catch(
		(error: unknown) => {
			console.warn(
				'[wallet-balances] chain resync failed',
				error instanceof Error ? error.message : String(error)
			);
		}
	);
	return attachChainSpendable(wallet, assets);
}

/** Set chainSpendable when Esplora answered for at least one allocation. */
export async function attachChainSpendable(
	wallet: { listUnspents?: () => Promise<unknown> },
	assets: RgbAsset[]
): Promise<RgbAsset[]> {
	const usdt = assets.find((asset) => asset.symbol?.toUpperCase() === 'USDT' && asset.assetId);
	if (!usdt || typeof wallet.listUnspents !== 'function') return assets;
	let listed: unknown;
	try {
		listed = await wallet.listUnspents();
	} catch (error: unknown) {
		console.warn(
			'[wallet-balances] listUnspents failed',
			error instanceof Error ? error.message : String(error)
		);
		return assets;
	}
	const unspents = unspentRows(listed);
	if (!unspents) return assets;
	const chain = await chainAllocation(unspents, usdt.assetId, esploraOutputSpent);
	const spendable = usdt.spendable ?? usdt.balance;
	if (!allocationCoversSpendable(chain, spendable)) {
		return assets.map((asset) =>
			asset.assetId === usdt.assetId ? { ...asset, chainUnknown: true } : asset
		);
	}
	if (chain.checked === 0 && !chain.unknown && chain.pending === 0) return assets;
	return assets.map((asset) => {
		if (asset.assetId !== usdt.assetId) return asset;
		return {
			...asset,
			chainUnknown: chain.unknown,
			pendingConfirm: chain.pending > 0,
			...(chain.unknown || chain.checked === 0 ? {} : { chainSpendable: chain.live })
		};
	});
}

export function scheduleBalanceRefresh(): void {
	if (state.balanceRefreshTimer) clearTimeout(state.balanceRefreshTimer);
	state.balanceRefreshTimer = setTimeout(() => {
		loadAssets();
	}, 500);
}

export async function loadAssets(options?: { pull?: boolean }): Promise<void> {
	if (walletSendPending()) return;
	if (!inWalletTurn()) return enqueueWallet(() => loadAssets(options));
	const wallet = state.utexoWallet;
	if (!wallet) return;

	try {
		const scanned = await scanBtcBalance(wallet);
		if (!scanned) return;
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

		const previousAssets = get(walletStore).rgb.assets ?? [];
		let rgbAssets: RgbAsset[] = previousAssets;
		try {
			rgbAssets = parseRgbAssets(await wallet.listAssets());
			rgbAssets = keepHeldUsdt(rgbAssets, previousAssets);
			rgbAssets = await fillUsdtBalance(wallet, rgbAssets);
			rgbAssets = await attachChainSpendable(wallet, rgbAssets);
			rgbAssets = await resyncChainGap(wallet, rgbAssets, options?.pull !== false);
		} catch (err) {
			console.warn('[wallet-balances] listAssets error:', err);
			rgbAssets = previousAssets;
		}

		const heldUsdt = rgbAssets.find((asset) => asset.symbol?.toUpperCase() === 'USDT');
		const usdtAssetId = getConfiguredRgbUsdtAssetId();
		const usdtBalance =
			heldUsdt?.balance ??
			(usdtAssetId ? (rgbAssets.find((asset) => asset.assetId === usdtAssetId)?.balance ?? 0) : 0);

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
		await loadTransactions();
		const incomingOnly = (heldUsdt?.balance ?? 0) > 0 && (heldUsdt?.spendable ?? 0) <= 0;
		if (options?.pull !== false && (usdtBalance <= 0 || incomingOnly)) {
			scheduleRgbRefresh(wallet);
		}
	} catch (err) {
		console.error('[wallet-balances] Error loading assets:', err);
	}
}

export async function refreshRgbBalances(): Promise<void> {
	await loadAssets({ pull: false });
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
	await flushWalletState(wallet);
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
	await flushWalletState(wallet);
	await refreshRgbBalances();
	return result;
}

const RECEIVE_KINDS = new Set(['ReceiveBlind', 'ReceiveWitness']);
const RECEIVE_READY = new Set(['WaitingConfirmations', 'WaitingSafeHeight', 'Settled']);
const RGB_INDEXER = 'https://esplora-api.utexo.com';

export class IncomingPaymentPending extends Error {
	constructor() {
		super('Incoming RGB payment has not arrived yet');
		this.name = 'IncomingPaymentPending';
	}
}

export function incomingReceiveReady(transfers: { kind?: string; status?: string }[]): boolean {
	return transfers.some(
		(transfer) => RECEIVE_KINDS.has(transfer.kind ?? '') && RECEIVE_READY.has(transfer.status ?? '')
	);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

/** rgb-lib `Wallet::refresh(online, asset_id, filter, skip_sync)`. Empty filter refreshes every waiting transfer. */
type RefreshValue = (
	online: unknown,
	assetId: string | null,
	filter: readonly unknown[],
	skipSync: boolean
) => Promise<unknown>;

interface RefreshEntry {
	failure?: unknown;
}

function isRefreshValue(value: unknown): value is RefreshValue {
	return typeof value === 'function';
}

function rawWasmWallet(wallet: unknown): Record<string, unknown> | null {
	if (!isRecord(wallet)) return null;
	const manager = wallet._manager;
	if (!isRecord(manager) || !isRecord(manager.rlnBinding)) return null;
	const raw = manager.rlnBinding._wallet;
	return isRecord(raw) ? raw : null;
}

function rawRefresh(wallet: unknown): { online: unknown; raw: Record<string, unknown> } | null {
	if (!isRecord(wallet)) return null;
	const manager = wallet._manager;
	if (!isRecord(manager)) return null;
	const binding = manager.rlnBinding;
	if (!isRecord(binding) || binding.online == null) return null;
	const raw = rawWasmWallet(wallet);
	if (!raw || !isRefreshValue(raw.refreshValue)) return null;
	return { online: binding.online, raw };
}

function refreshEntries(result: unknown): RefreshEntry[] {
	if (result instanceof Map) {
		return [...result.values()].filter(isRecord);
	}
	if (!isRecord(result)) return [];
	return Object.values(result).filter(isRecord);
}

/** First hard error from a refresh result. `refreshWallet` drops this field. */
export function readRefreshFailure(failure: unknown): string | null {
	if (!isRecord(failure)) return null;
	const schema = failure.UnknownRgbSchema;
	if (isRecord(schema) && typeof schema.schema_id === 'string' && schema.schema_id.length > 0) {
		return `Unknown RGB schema ${schema.schema_id}`;
	}
	const [name] = Object.keys(failure);
	return name ?? null;
}

/** A refresh that drops the USDT row must not replace a balance the wallet already showed. */
function keepHeldUsdt(next: readonly RgbAsset[], previous: readonly RgbAsset[]): RgbAsset[] {
	const prior = previous.find(
		(asset) => asset.symbol?.toUpperCase() === 'USDT' && asset.balance > 0
	);
	if (!prior) return [...next];
	if (next.some((asset) => asset.assetId === prior.assetId && asset.balance > 0)) return [...next];
	if (next.some((asset) => asset.assetId === prior.assetId)) return [...next];
	return [...next, prior];
}

type PullWallet = {
	goOnline?: (indexer: string) => Promise<unknown>;
	isOnline?: () => boolean;
	syncWallet?: () => Promise<unknown>;
	refreshWallet?: () => Promise<unknown>;
};

/**
 * Pull pending ReceiveBlind rows from the default https proxy.
 * One wasm refresh at a time. `refreshValue(online, null, [], false)` is the
 * call that imports a consignment and notices new confirmations.
 */
export function pullIncomingTransfers(
	wallet: PullWallet,
	options?: { skipSync?: boolean; assetId?: string | null }
): Promise<void> {
	if (inWalletTurn()) return pullIncomingOnce(wallet, options);
	return enqueueWallet(() => pullIncomingOnce(wallet, options));
}

async function pullIncomingOnce(
	wallet: PullWallet,
	options?: { skipSync?: boolean; assetId?: string | null }
): Promise<void> {
	await withWasm('pull-transfers', async () => {
		if (wasmCrashed()) return;
		if (wallet.goOnline && wallet.isOnline?.() !== true) {
			await wallet.goOnline(RGB_INDEXER);
		}
		const pulled = rawRefresh(wallet);
		if (pulled) {
			// refreshValue(skipSync false) syncs the chain itself. A syncWallet call
			// beside it overlaps the same wasm wallet and throws a null pointer.
			// The method must keep the wasm wallet as `this`; a detached call throws
			// "null pointer passed to rust".
			const assetId = options?.assetId ?? null;
			const result = await Reflect.apply(pulled.raw.refreshValue as RefreshValue, pulled.raw, [
				pulled.online,
				assetId,
				[],
				options?.skipSync === true
			]);
			const failure = refreshEntries(result)
				.map((entry) => readRefreshFailure(entry.failure))
				.find((message) => message != null);
			if (failure) throw new Error(failure);
			return;
		}
		if (!options?.skipSync && wallet.syncWallet) await wallet.syncWallet();
		if (wallet.refreshWallet) await wallet.refreshWallet();
	});
}

const REFRESH_LIMIT_MS = 45_000;

let rgbRefreshTask: Promise<void> | null = null;

function externalRefreshPending(): boolean {
	if (!browser) return false;
	const probe = (window as { __btPersist?: { started?: boolean; done?: boolean } }).__btPersist;
	return Boolean(probe?.started && probe.done !== true);
}

const RGB_BACKUP_DB = 'rgb_backup_bytes';
const RGB_BACKUP_STORE = 'bytes';

interface SnapshotWallet {
	listAssets?: () => Promise<unknown>;
	listTransfers?: (assetId?: string) => Promise<unknown[]>;
	failTransfers?: (params: {
		batchTransferIdx?: number;
		skipSync?: boolean;
		noAssetOnly?: boolean;
	}) => Promise<boolean>;
	createBackup?: (params: { backupPath: string; password: string }) => Promise<unknown>;
	restoreFromBackupBytes?: (bytes: Uint8Array, password: string) => void;
}

function backupPassword(wallet: unknown): string | null {
	if (!isRecord(wallet)) return null;
	const manager = wallet._manager;
	if (!isRecord(manager)) return null;
	const binding = manager.rlnBinding;
	if (!isRecord(binding) || typeof binding.password !== 'string' || binding.password.length === 0) {
		return null;
	}
	return binding.password;
}

async function callRawBackup(wallet: unknown, password: string): Promise<boolean> {
	if (!isRecord(wallet)) return false;
	const manager = wallet._manager;
	if (!isRecord(manager)) return false;
	const binding = manager.rlnBinding;
	if (!isRecord(binding)) return false;
	const raw = binding._wallet;
	if (!isRecord(raw) || typeof raw.backup !== 'function') return false;
	await withWasm('raw-backup', async () => {
		Reflect.apply(raw.backup as (password: string) => unknown, raw, [password]);
	});
	return true;
}

/** IFA USDT from listAssets. Ignores the configured NIA id. */
function ifaUsdtRow(raw: unknown): { assetId: string | null; balance: number } | null {
	if (!isRecord(raw) || !Array.isArray(raw.ifa)) return null;
	for (const item of raw.ifa) {
		if (!isRawRgbAsset(item)) continue;
		if ((item.ticker ?? '').toUpperCase() !== 'USDT') continue;
		const assetId = item.assetId ?? item.id ?? null;
		return { assetId, balance: assetAmount(item.balance) };
	}
	return null;
}

function walletFingerprint(wallet: unknown): string | null {
	if (!isRecord(wallet)) return null;
	const manager = wallet._manager;
	if (!isRecord(manager)) return null;
	const binding = manager.rlnBinding;
	if (!isRecord(binding) || !isRecord(binding.walletData)) return null;
	const fingerprint = binding.walletData.master_fingerprint;
	return typeof fingerprint === 'string' && fingerprint.length > 0 ? fingerprint : null;
}

function readBackupBytes(wallet: unknown): Uint8Array | null {
	if (!isRecord(wallet)) return null;
	const manager = wallet._manager;
	if (!isRecord(manager) || !isRecord(manager.rlnBinding)) return null;
	const bytes = manager.rlnBinding.lastBackupBytes;
	return bytes instanceof Uint8Array && bytes.byteLength > 0 ? bytes : null;
}

function backupInfoDirty(wallet: unknown): boolean {
	if (!isRecord(wallet)) return false;
	const manager = wallet._manager;
	if (!isRecord(manager) || !isRecord(manager.rlnBinding)) return false;
	const raw = manager.rlnBinding._wallet;
	if (!isRecord(raw) || typeof raw.backupInfo !== 'function') return false;
	return Reflect.apply(raw.backupInfo, raw, []) === true;
}

let persistHooksInstalled = false;

function openNamedDb(name: string): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const request = indexedDB.open(name);
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error ?? new Error('indexedDB open failed'));
	});
}

interface DurableWallet {
	backupNow?: () => Promise<unknown>;
	createBackup?: (params: { backupPath: string; password: string }) => Promise<unknown>;
}

/**
 * beta.12 has no `flush` / `flushValue`. Persist with VSS `backupNow` or
 * `createBackup`. Never call the raw wasm `backup()` from a visibility hook.
 */
export async function flushWalletState(wallet: unknown): Promise<boolean> {
	if (!isRecord(wallet) || wasmCrashed()) return false;
	const durable = wallet as DurableWallet;
	const password = backupPassword(wallet);
	try {
		if (typeof durable.backupNow === 'function') {
			await durable.backupNow();
			console.info('[wallet-persist] wallet.backupNow');
			return true;
		}
		if (typeof durable.createBackup === 'function' && password) {
			await durable.createBackup({ backupPath: '', password });
			console.info('[wallet-persist] wallet.createBackup');
			return true;
		}
	} catch (error) {
		console.warn(
			'[wallet-persist] backup failed',
			error instanceof Error ? error.message : String(error)
		);
		return false;
	}
	console.warn('[wallet-persist] backup method missing');
	return false;
}

/** Flush when the tab is hidden. The awaited flush after refresh is the durable path. */
export function installPersistHooks(): void {
	if (!browser || persistHooksInstalled) return;
	persistHooksInstalled = true;
	const flushHidden = (): void => {
		if (wasmCrashed() || wasmBusy()) return;
		void withWasm('persist', () => flushWalletState(state.utexoWallet));
	};
	document.addEventListener('visibilitychange', () => {
		if (document.visibilityState === 'hidden') flushHidden();
	});
	window.addEventListener('pagehide', flushHidden);
}

function asBackupBytes(value: unknown): Uint8Array | null {
	if (value instanceof Uint8Array && value.byteLength > 0) return value;
	if (value instanceof ArrayBuffer && value.byteLength > 0) return new Uint8Array(value);
	return null;
}

function openBackupDb(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const request = indexedDB.open(RGB_BACKUP_DB, 1);
		request.onupgradeneeded = () => {
			const db = request.result;
			if (!db.objectStoreNames.contains(RGB_BACKUP_STORE)) db.createObjectStore(RGB_BACKUP_STORE);
		};
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error ?? new Error('backup db open failed'));
	});
}

/** App-owned encrypted export. Not the wasm JSON snapshot. */
export async function loadRgbBackup(fingerprint: string): Promise<Uint8Array | null> {
	if (typeof indexedDB === 'undefined' || typeof indexedDB.open !== 'function') return null;
	const db = await openBackupDb();
	try {
		return await new Promise((resolve, reject) => {
			const request = db
				.transaction(RGB_BACKUP_STORE)
				.objectStore(RGB_BACKUP_STORE)
				.get(fingerprint);
			request.onsuccess = () => resolve(asBackupBytes(request.result));
			request.onerror = () => reject(request.error ?? new Error('backup get failed'));
		});
	} finally {
		db.close();
	}
}

/** Writes the encrypted export and returns the readback length. */
export async function storeRgbBackup(fingerprint: string, bytes: Uint8Array): Promise<number> {
	if (typeof indexedDB === 'undefined' || typeof indexedDB.open !== 'function') return 0;
	const db = await openBackupDb();
	try {
		await new Promise<void>((resolve, reject) => {
			const request = db
				.transaction(RGB_BACKUP_STORE, 'readwrite')
				.objectStore(RGB_BACKUP_STORE)
				.put(bytes, fingerprint);
			request.onsuccess = () => resolve();
			request.onerror = () => reject(request.error ?? new Error('backup put failed'));
		});
	} finally {
		db.close();
	}
	const readback = await loadRgbBackup(fingerprint);
	return readback?.byteLength ?? 0;
}

/** True when this fingerprint already has a non-empty rgb-lib snapshot. */
export function snapshotCovers(
	rows: readonly { key: string; bytes: number }[],
	fingerprint: string
): boolean {
	if (!/^[0-9a-f]{8}$/i.test(fingerprint)) return false;
	const needle = fingerprint.toLowerCase();
	return rows.some((row) => row.bytes > 0 && row.key.toLowerCase().includes(needle));
}

async function snapshotAlreadyKept(fingerprint: string): Promise<boolean> {
	if (typeof indexedDB === 'undefined' || typeof indexedDB.open !== 'function') return false;
	let db: IDBDatabase;
	try {
		db = await openNamedDb('rgb_lib_wallet');
	} catch {
		return false;
	}
	try {
		if (!db.objectStoreNames.contains('snapshots')) return false;
		const tx = db.transaction('snapshots', 'readonly');
		const store = tx.objectStore('snapshots');
		if (typeof store.getAllKeys !== 'function' || typeof store.getAll !== 'function') return false;
		const rows = await new Promise<{ key: string; bytes: number }[]>((resolve, reject) => {
			const keysReq = store.getAllKeys();
			const valsReq = store.getAll();
			tx.oncomplete = () => {
				const keys = keysReq.result ?? [];
				const vals = valsReq.result ?? [];
				resolve(
					keys.map((key, index) => {
						const value = vals[index];
						return {
							key: String(key),
							bytes: typeof value === 'string' ? value.length : 0
						};
					})
				);
			};
			tx.onerror = () => reject(tx.error ?? new Error('snapshot read failed'));
		});
		return snapshotCovers(rows, fingerprint);
	} catch {
		return false;
	} finally {
		db.close();
	}
}

/**
 * Restores the encrypted export for this fingerprint.
 * Unlock calls this only for a fresh device. An explicit caller may use it directly.
 * A stored snapshot, a live receive, a positive balance, or a failed transfer list skips the restore.
 */
export async function restoreStoredBackup(wallet: SnapshotWallet): Promise<boolean> {
	const fingerprint = walletFingerprint(wallet);
	const password = backupPassword(wallet);
	if (!fingerprint || !password || typeof wallet.restoreFromBackupBytes !== 'function')
		return false;
	if (await snapshotAlreadyKept(fingerprint)) {
		console.info('[wallet-persist] skip restore; latest snapshot kept');
		return false;
	}
	const block = await restoreBlock(wallet);
	if (block !== 'clear') {
		console.warn(
			block === 'list-failed'
				? '[wallet-persist] skip restore; transfer list failed'
				: '[wallet-persist] skip restore; live receive kept'
		);
		return false;
	}
	const bytes = await loadRgbBackup(fingerprint);
	if (!bytes) return false;
	wallet.restoreFromBackupBytes(bytes, password);
	console.info('[wallet-persist] restored rgb_backup_bytes/' + fingerprint, bytes.byteLength);
	return true;
}

/** Unlock must not restore over a wallet IndexedDB that already exists. */
export async function restoreOnUnlock(
	wallet: SnapshotWallet,
	databasePresent: boolean
): Promise<boolean> {
	if (databasePresent) {
		console.info('[wallet-persist] skip restore; indexeddb wallet kept');
		return false;
	}
	return restoreStoredBackup(wallet);
}

/**
 * Keeps the encrypted export from createBackup in rgb_backup_bytes/{fingerprint}.
 * Does not write those bytes onto the wasm JSON snapshot.
 */
export async function persistWalletSnapshot(wallet: SnapshotWallet): Promise<void> {
	try {
		await writeWalletBackup(wallet);
	} finally {
		await flushWalletState(wallet);
	}
}

async function writeWalletBackup(wallet: SnapshotWallet): Promise<void> {
	const password = backupPassword(wallet);
	if (!password) {
		console.warn('[wallet-persist] backup password missing');
		return;
	}
	if (typeof wallet.createBackup === 'function') {
		await wallet.createBackup({ backupPath: '', password });
	} else if (!(await callRawBackup(wallet, password))) {
		console.warn('[wallet-persist] UTEXOWallet.createBackup missing');
		return;
	}
	const bytes = readBackupBytes(wallet);
	const fingerprint = walletFingerprint(wallet);
	if (!bytes || !fingerprint) {
		if (backupInfoDirty(wallet)) {
			console.warn('[wallet-persist] backupInfo true but stored bytes missing');
		}
		console.warn('[wallet-persist] backup bytes missing');
		return;
	}
	let readback = 0;
	try {
		readback = await storeRgbBackup(fingerprint, bytes);
	} catch (error) {
		console.warn(
			'[wallet-persist] backup store failed',
			error instanceof Error ? error.message : String(error)
		);
	}
	if (readback !== bytes.byteLength) {
		console.warn('[wallet-persist] backup readback mismatch', bytes.byteLength, readback);
		if (backupInfoDirty(wallet)) {
			console.warn('[wallet-persist] backupInfo true but stored bytes missing');
		}
		return;
	}
	console.info('[wallet-persist] stored rgb_backup_bytes/' + fingerprint, bytes.byteLength);
}

type RefreshWallet = Parameters<typeof pullIncomingTransfers>[0] & SnapshotWallet;

/**
 * Bitcoin history is already on screen. The 45s cap is armed before the light
 * poll is awaited. On timeout the running flag drops, then one backup runs,
 * then one full refresh if IFA USDT is still missing.
 */
export function scheduleRgbRefresh(
	wallet: RefreshWallet,
	options?: { timeoutMs?: number }
): Promise<void> {
	if (walletSendPending()) return Promise.resolve();
	if (rgbRefreshTask || externalRefreshPending()) {
		console.warn('[wallet-refresh] already running');
		return rgbRefreshTask ?? Promise.resolve();
	}
	const timeoutMs = options?.timeoutMs ?? REFRESH_LIMIT_MS;
	const run = enqueueWallet(() => finishRgbRefresh(wallet, timeoutMs));
	rgbRefreshTask = run;
	void run.finally(() => {
		if (rgbRefreshTask === run) rgbRefreshTask = null;
	});
	armContractRefresh();
	return run;
}

const PENDING_CONTRACT = new Set([
	'locked',
	'funded',
	'work_in_progress',
	'work_submitted',
	'approved',
	'settlement_requested',
	'releasing',
	'released_pending'
]);

let contractRefreshTimer: ReturnType<typeof setInterval> | null = null;
let contractRefreshPending = false;

function armContractRefresh(): void {
	if (contractRefreshTimer || typeof setInterval === 'undefined') return;
	contractRefreshTimer = setInterval(() => {
		if (contractRefreshPending || wasmBusy() || wasmCrashed()) return;
		const pending = ContractRune.snapshots().some((row) => PENDING_CONTRACT.has(row.status));
		if (!pending || !state.utexoWallet || walletSendPending()) return;
		contractRefreshPending = true;
		withWasm('contract-refresh', () => loadAssets({ pull: true }))
			.catch((error: unknown) => {
				console.warn('[wallet-refresh] pending contract refresh failed', error);
			})
			.finally(() => {
				contractRefreshPending = false;
			});
	}, 20_000);
}

export function stopContractRefresh(): void {
	if (!contractRefreshTimer) return;
	clearInterval(contractRefreshTimer);
	contractRefreshTimer = null;
}

function refreshCap(timeoutMs: number): Promise<'timeout'> {
	return new Promise((resolve) => {
		setTimeout(() => resolve('timeout'), timeoutMs);
	});
}

/** Txid, or the blinded seal when the payer has not published one yet. */
function settledReceiveKeys(rows: unknown): string[] {
	if (!Array.isArray(rows)) return [];
	const keys: string[] = [];
	for (const value of rows) {
		if (!isRecord(value)) continue;
		const kind = typeof value.kind === 'string' ? value.kind : '';
		const status = typeof value.status === 'string' ? value.status : '';
		if (!RECEIVE_KINDS.has(kind) || !RECEIVE_READY.has(status)) continue;
		const txid = typeof value.txid === 'string' ? value.txid : '';
		const invoice = typeof value.invoiceString === 'string' ? value.invoiceString : '';
		const seal = invoice.match(/utxob:([^-/?]+)/)?.[1] ?? '';
		const key = txid || seal;
		if (key) keys.push(key);
	}
	return keys;
}

interface ReceiveSnap {
	keys: string[];
	settled: boolean;
	spendable: number;
}

function ifaSpendable(raw: unknown): number {
	if (!isRecord(raw) || !Array.isArray(raw.ifa)) return 0;
	for (const item of raw.ifa) {
		if (!isRecord(item)) continue;
		if (String(item.ticker ?? '').toUpperCase() !== 'USDT') continue;
		const balance = item.balance;
		if (!isRecord(balance) || typeof balance.spendable !== 'number') return 0;
		return balance.spendable;
	}
	return 0;
}

function snapSettled(rows: readonly unknown[]): boolean {
	return rows.some((value) => {
		if (!isRecord(value)) return false;
		const kind = typeof value.kind === 'string' ? value.kind : '';
		return RECEIVE_KINDS.has(kind) && value.status === 'Settled';
	});
}

type RestoreBlock = 'clear' | 'live' | 'list-failed';

function listedAssetIds(listed: unknown): string[] {
	const ids: string[] = [];
	if (!isRecord(listed)) return ids;
	for (const group of ['ifa', 'nia', 'cfa', 'uda'] as const) {
		const rows = listed[group];
		if (!Array.isArray(rows)) continue;
		for (const row of rows) {
			if (!isRecord(row)) continue;
			const id = row.assetId ?? row.id;
			if (typeof id === 'string' && id.length > 0) ids.push(id);
		}
	}
	return ids;
}

function positiveBalance(listed: unknown): boolean {
	if (!isRecord(listed)) return false;
	for (const group of ['ifa', 'nia', 'cfa', 'uda'] as const) {
		const rows = listed[group];
		if (!Array.isArray(rows)) continue;
		for (const row of rows) {
			if (!isRecord(row)) continue;
			const balance = isRecord(row.balance) ? row.balance : row;
			for (const field of ['spendable', 'settled', 'future'] as const) {
				const amount = balance[field];
				if (typeof amount === 'number' && amount > 0) return true;
			}
		}
	}
	return false;
}

/** Fail closed: a thrown list is not an empty wallet. Asset-tied rows are queried by id. */
async function restoreBlock(wallet: SnapshotWallet): Promise<RestoreBlock> {
	if (!wallet.listAssets && !wallet.listTransfers) return 'clear';
	let listed: unknown = null;
	if (wallet.listAssets) {
		try {
			listed = await wallet.listAssets();
		} catch {
			return 'list-failed';
		}
	}
	if (positiveBalance(listed)) return 'live';
	if (!wallet.listTransfers) return 'clear';
	const ids = listedAssetIds(listed);
	const queries: Array<string | undefined> = ids.length > 0 ? ids : [undefined];
	const rows: unknown[] = [];
	for (const id of queries) {
		try {
			const batch =
				id === undefined ? await wallet.listTransfers() : await wallet.listTransfers(id);
			if (Array.isArray(batch)) rows.push(...batch);
		} catch {
			return 'list-failed';
		}
	}
	return settledReceiveKeys(rows).length > 0 ? 'live' : 'clear';
}

async function readReceiveSnap(wallet: SnapshotWallet): Promise<ReceiveSnap> {
	const empty: ReceiveSnap = { keys: [], settled: false, spendable: 0 };
	if (!wallet.listTransfers) return empty;
	const listed = wallet.listAssets ? await wallet.listAssets().catch(() => null) : null;
	const ids: string[] = [];
	if (isRecord(listed)) {
		for (const group of ['ifa', 'nia', 'cfa', 'uda'] as const) {
			const rows = listed[group];
			if (!Array.isArray(rows)) continue;
			for (const row of rows) {
				if (!isRecord(row)) continue;
				const id = row.assetId ?? row.id;
				if (typeof id === 'string' && id.length > 0) ids.push(id);
			}
		}
	}
	let rows: unknown[] = [];
	if (ids.length === 0) {
		const fallback = await wallet.listTransfers().catch(() => []);
		rows = Array.isArray(fallback) ? fallback : [];
	} else {
		const batches = await Promise.all(
			ids.map(async (id) => {
				try {
					const batch = await wallet.listTransfers?.(id);
					return Array.isArray(batch) ? batch : [];
				} catch {
					return [];
				}
			})
		);
		rows = batches.flat();
	}
	return {
		keys: settledReceiveKeys(rows),
		settled: snapSettled(rows),
		spendable: ifaSpendable(listed)
	};
}

function lostSettledReceive(before: readonly string[], after: readonly string[]): boolean {
	const next = new Set(after);
	return before.some((key) => !next.has(key));
}

function emptyOverwrite(
	before: ReceiveSnap,
	after: ReceiveSnap,
	failedOnPurpose: boolean
): boolean {
	if (lostSettledReceive(before.keys, after.keys)) return true;
	return before.spendable > 0 && after.spendable === 0 && !failedOnPurpose;
}

async function finishRgbRefresh(wallet: RefreshWallet, timeoutMs: number): Promise<void> {
	console.info('[wallet-refresh] start');
	const before = await readReceiveSnap(wallet);
	let failedOnPurpose = false;
	const originalFail = wallet.failTransfers;
	if (typeof originalFail === 'function') {
		wallet.failTransfers = async (params) => {
			failedOnPurpose = true;
			return originalFail(params);
		};
	}
	try {
		const needsConsignment = !before.settled && before.spendable <= 0;
		const timeout = refreshCap(timeoutMs);
		const refresh = pullIncomingTransfers(wallet, { skipSync: !needsConsignment }).catch(
			(error: unknown) => {
				console.warn(
					'[wallet-refresh] failed',
					error instanceof Error ? error.message : String(error)
				);
			}
		);
		const outcome = await Promise.race([refresh.then(() => 'done' as const), timeout]);
		if (outcome === 'timeout') {
			console.warn('[wallet-refresh] stopped after 45s');
			await refresh;
		} else {
			await releasePhantomSends(wallet).catch((error: unknown) => {
				console.warn(
					'[wallet-send] phantom release failed',
					error instanceof Error ? error.message : String(error)
				);
			});
		}
		const afterPull = await readReceiveSnap(wallet);
		if (emptyOverwrite(before, afterPull, failedOnPurpose)) {
			console.warn('[wallet-refresh] refused empty overwrite');
			return;
		}
		await persistWalletSnapshot(wallet);
		if (before.settled || needsConsignment) {
			await loadAssets({ pull: false });
			return;
		}
		const listed = wallet.listAssets ? await wallet.listAssets().catch(() => null) : null;
		const held = ifaUsdtRow(listed);
		if (!held || held.balance <= 0) {
			const followTimeout = refreshCap(timeoutMs);
			const follow = pullIncomingTransfers(wallet, {
				skipSync: false,
				assetId: held?.assetId ?? null
			}).catch((error: unknown) => {
				console.warn(
					'[wallet-refresh] failed',
					error instanceof Error ? error.message : String(error)
				);
			});
			const followOutcome = await Promise.race([follow.then(() => 'done' as const), followTimeout]);
			if (followOutcome === 'timeout') {
				console.warn('[wallet-refresh] stopped after 45s');
				await follow;
			} else {
				await releasePhantomSends(wallet).catch((error: unknown) => {
					console.warn(
						'[wallet-send] phantom release failed',
						error instanceof Error ? error.message : String(error)
					);
				});
			}
			const afterFollow = await readReceiveSnap(wallet);
			if (emptyOverwrite(before, afterFollow, failedOnPurpose)) {
				console.warn('[wallet-refresh] refused empty overwrite');
				return;
			}
			await persistWalletSnapshot(wallet);
		}
		await loadAssets({ pull: false });
	} finally {
		if (originalFail) wallet.failTransfers = originalFail;
	}
}

export async function acceptIncomingPayment(): Promise<void> {
	const wallet = getUtexoWallet();
	if (!wallet?.refreshWallet) throw new Error('Wallet not initialized');
	if (rgbRefreshTask || externalRefreshPending()) {
		throw new Error('RGB refresh already running');
	}
	await pullIncomingTransfers(wallet);
	const transfers = wallet.listTransfers ? await wallet.listTransfers().catch(() => []) : [];
	await loadAssets({ pull: false });
	if (!incomingReceiveReady(transfers)) throw new IncomingPaymentPending();
}

/** Fail every unpaid RGB receive so a new invoice replaces the cancelled one. */
export async function cancelUnpaidInvoices(): Promise<number> {
	const wallet = getUtexoWallet();
	const fail = wallet as {
		failTransfers?: (params: { batchTransferIdx: number; skipSync: boolean }) => Promise<unknown>;
		listTransfers?: (assetId?: string) => Promise<unknown>;
		listAssets?: () => Promise<unknown>;
	} | null;
	if (!fail?.failTransfers || !fail.listTransfers) return 0;
	const rows: unknown[] = [];
	const plain = await fail.listTransfers().catch(() => []);
	if (Array.isArray(plain)) rows.push(...plain);
	const ids = listedAssetIds(fail.listAssets ? await fail.listAssets().catch(() => null) : null);
	const named = await Promise.all(ids.map((id) => fail.listTransfers?.(id).catch(() => [])));
	for (const batch of named) {
		if (Array.isArray(batch)) rows.push(...batch);
	}
	const indexes = unpaidReceiveBatches(rows);
	for (const batchTransferIdx of indexes) {
		await fail.failTransfers({ batchTransferIdx, skipSync: true });
	}
	return indexes.length;
}

/**
 * rgb-lib encodes this fungible amount as the invoice path segment `nWca`.
 * That is the only amount the UTEXO bot has paid. `0` encodes as `aa` and
 * `100000000` encodes as `adFZnbk`; the bot rejected both.
 */
const NWCA_AMOUNT = 1111;

/**
 * Named invoice for the configured or held USDT id, with the entered amount in base units.
 * A blank `nWca` invoice (1111 units) only when no asset id is configured and no amount was entered.
 */
export async function receiveUsdtInvoice(amount?: number): Promise<{
	invoice: string;
	blank: boolean;
	units: number | null;
	precision: number;
}> {
	const configured = getConfiguredRgbUsdtAssetId();
	const wallet = getUtexoWallet();
	if (!wallet) throw new Error('Wallet not initialized');
	const listed = typeof wallet.listAssets === 'function' ? await wallet.listAssets() : undefined;
	const assetId = usdtInvoiceAsset(listed, configured) ?? configured ?? undefined;
	if (assetId) {
		const row = spendableRgbAssets(listed).find((item) => item.assetId === assetId);
		const precision = usdtPrecision(row?.ticker ?? 'USDT', row?.precision);
		const units = amount === undefined ? undefined : usdtBaseUnits(amount, precision);
		const named = await createRgbInvoice({ assetId, amount: units });
		return { invoice: named.invoice, blank: false, units: units ?? null, precision };
	}
	const blankUnits = amount === undefined ? NWCA_AMOUNT : usdtBaseUnits(amount, 6);
	const blank = await receiveBlankInvoice(blankUnits);
	return {
		invoice: blank.invoice,
		blank: true,
		units: amount === undefined ? null : blankUnits,
		precision: amount === undefined ? 0 : 6
	};
}

/** Blank RGB invoice. The sender, such as the UTEXO bot, chooses the asset. */
export async function receiveBlankInvoice(amount?: number): Promise<{ invoice: string }> {
	if (amount !== undefined && (!Number.isSafeInteger(amount) || amount <= 0)) {
		throw new Error('USDT amount must be a positive whole number');
	}
	const wallet = getUtexoWallet();
	if (!wallet?.onchainReceive) throw new Error('Wallet not initialized');
	const received = await receiveWithAllocations(wallet, () =>
		wallet.onchainReceive({
			witness: false,
			minConfirmations: 1,
			durationSeconds: 3600,
			...(amount === undefined ? {} : { amount })
		})
	);
	const invoice = (typeof received === 'string' ? received : received.invoice)?.trim() ?? '';
	if (!invoice) throw new Error('RGB invoice was empty');
	return { invoice };
}

export async function createRgbInvoice(params?: {
	assetId?: string;
	amount?: number;
}): Promise<{ invoice: string; blindedUtxo?: string }> {
	const wallet = getUtexoWallet();
	if (!wallet) throw new Error('Wallet not initialized');
	console.info('[rgb-invoice:start]', params);
	const invoice = await receiveWithAllocations(wallet, () => requestRgbInvoice(wallet, params));
	await flushWalletState(wallet);
	return invoice;
}

async function requestRgbInvoice(
	wallet: NonNullable<ReturnType<typeof getUtexoWallet>>,
	params?: { assetId?: string; amount?: number }
): Promise<{ invoice: string; blindedUtxo?: string }> {
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
