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
import { rescanColoredCoins } from './prepare-rgb-send';
import { FAUCET_IFA_ASSET } from './signet-lsp';
import { uncreditedIncomingUnits } from '$lib/components/wallet/wallet-formatters';
import {
	loadTransactions,
	rememberIncomingReceives,
	rememberedIncomingTransfers
} from './wallet-transactions';
import { readWalletCache, writeWalletCache } from './wallet-account';
import { receiveWithAllocations } from './rgb-allocations';
import { decodeRgbInvoice, unpaidReceiveMarks } from './decode-rgb-invoice';
import { invoiceMatchesAmount, invoiceOmitsAmount } from '$lib/services/rgb/escrow-rail';
import { bookedUsdt, satsForDisplay, shownUsdt } from './plain-wallet';
import {
	chainAllocation,
	allocationCoversSpendable,
	changeOwed,
	enqueueWallet,
	inWalletTurn,
	releasePhantomSends,
	walletSendPending,
	type RgbUnspentRef
} from './prepare-rgb-send';
import { esploraOutputSpent } from './signet-broadcast';
import { isWasmPanic, WASM_CRASH_MESSAGE, wasmBusy, wasmCrashed, withWasm } from './wasm-lock';
import {
	debugReceiveRows,
	formatWalletDebug,
	noteProxyProbe,
	noteWalletRefresh,
	publicWalletDetail,
	walletDebugSnapshot,
	type DebugReceive
} from './wallet-debug';
import {
	allocationSignature,
	markLocalRefresh,
	noteChainView,
	setWalletRefreshing
} from './wallet-session';

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

/** UTEXO signet. Public testnet3 explorers do not have these transactions. */
export const SIGNET_ESPLORA = 'https://esplora-api.utexo.com';

/** Address lookups for this wallet stay on UTEXO signet. */
export function addressBalanceIndexer(configuredUrl?: string): string {
	if (configuredUrl?.startsWith(SIGNET_ESPLORA)) return configuredUrl.replace(/\/$/, '');
	return SIGNET_ESPLORA;
}

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
	const names = await rgbDatabaseNames();
	if (names === null) return true;
	return names.some((name) => /rln_/i.test(name));
}

/** Names present before this wallet's init. `null` means the browser could not list them. */
export async function rgbDatabaseNames(): Promise<string[] | null> {
	if (typeof indexedDB === 'undefined' || typeof indexedDB.databases !== 'function') return null;
	try {
		const listed = await indexedDB.databases();
		return listed.flatMap((entry) => (typeof entry.name === 'string' ? [entry.name] : []));
	} catch {
		return null;
	}
}

/** Another account's `rln_*` database is not this fingerprint's wallet. */
export function ownRgbDatabasePresent(names: string[] | null, fingerprint: string | null): boolean {
	if (names === null) return true;
	if (!fingerprint || !/^[0-9a-f]{8}$/i.test(fingerprint)) {
		return names.some((name) => /rln_/i.test(name));
	}
	const needle = fingerprint.toLowerCase();
	return names.some((name) => name.toLowerCase().includes(needle));
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

	const indexerUrl = addressBalanceIndexer(
		import.meta.env.VITE_BITCOIN_ELECTRUM_URL as string | undefined
	);
	if (typeof fetch !== 'function') return null;

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
	// The first goOnline sticks. Public testnet3 must not win, or later UTEXO
	// refreshes are ignored and confirmed signet payments never show up.
	if (wallet.isOnline?.() !== true && wallet.goOnline) {
		try {
			await wallet.goOnline(SIGNET_ESPLORA);
		} catch (error) {
			console.warn('[wallet-balances] UTEXO indexer connect failed:', error);
			return null;
		}
	}
	if (wallet.syncWallet) {
		await wallet.syncWallet();
	}
	try {
		const btcBalance = await wallet.getBtcBalance();
		const address = await wallet.getAddress();
		const unspents = wallet.listUnspents ? await wallet.listUnspents().catch(() => []) : [];
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

function finiteAmount(value: unknown): number | null {
	const numeric =
		typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
	return Number.isFinite(numeric) && numeric >= 0 ? numeric : null;
}

function spendableAmount(balance: RawRgbAsset['balance']): number {
	if (!balance || typeof balance !== 'object') return 0;
	return positiveAmount(balance.spendable) ?? 0;
}

/** Spendable when it is funded. A smaller `future` after a partial send is the change. */
function assetAmount(balance: RawRgbAsset['balance']): number {
	if (typeof balance === 'number' && Number.isFinite(balance)) return Math.max(0, balance);
	if (typeof balance === 'string') return positiveAmount(balance) ?? 0;
	if (balance && typeof balance === 'object') return bookedUsdt(balance);
	return 0;
}

function bookedFields(balance: RawRgbAsset['balance']): Pick<RgbAsset, 'settled' | 'future'> {
	if (!balance || typeof balance !== 'object') return {};
	const settled = finiteAmount(balance.settled);
	const future = finiteAmount(balance.future);
	return {
		...(settled !== null ? { settled } : {}),
		...(future !== null ? { future } : {})
	};
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
				...bookedFields(asset.balance),
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
		...bookedFields(balance),
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

type ChainWallet = Parameters<typeof pullIncomingTransfers>[0] & {
	listAssets?: () => Promise<unknown>;
	getAssetBalance?: (assetId: string) => Promise<unknown>;
	listUnspents?: () => Promise<unknown>;
	listTransfers?: (assetId: string) => Promise<unknown>;
};

/**
 * Change still owed when rgb-lib has not moved it onto `future` yet.
 * `assignments` on the send that spent the coin is that remainder.
 */
async function remainderDue(
	wallet: { listTransfers?: (assetId: string) => Promise<unknown> },
	asset: RgbAsset,
	spentBy: readonly (string | null)[]
): Promise<number> {
	const future = asset.future ?? 0;
	const settled = asset.settled ?? 0;
	if (future > 0 && (settled === 0 || future < settled)) return future;
	if (typeof wallet.listTransfers !== 'function') return future;
	try {
		const owed = changeOwed(await wallet.listTransfers(asset.assetId), spentBy);
		return owed > 0 ? owed : future;
	} catch (error: unknown) {
		console.warn(
			'[wallet-balances] change lookup failed',
			error instanceof Error ? error.message : String(error)
		);
		return future;
	}
}

function needsChainReconcile(assets: RgbAsset[]): boolean {
	if (chainGap(assets)) return true;
	return assets.some(
		(asset) =>
			asset.symbol?.toUpperCase() === 'USDT' &&
			((asset.chainSpent ?? 0) > 0 || asset.changeDue === true)
	);
}

/** Refresh once when USDT is above the unspent outputs, or a spent allocation is still listed. */
async function resyncChainGap(
	wallet: ChainWallet,
	assets: RgbAsset[],
	pull: boolean
): Promise<RgbAsset[]> {
	const gapped = chainGap(assets);
	const due = assets.find((asset) => asset.symbol?.toUpperCase() === 'USDT' && asset.changeDue);
	const spentListed = assets.find(
		(asset) => asset.symbol?.toUpperCase() === 'USDT' && (asset.chainSpent ?? 0) > 0
	);
	if ((!gapped && !due && !spentListed) || !pull) return assets;
	const assetId = (gapped ?? due ?? spentListed)?.assetId;
	if (!assetId) return assets;
	// Refresh only. Failing the transfer drops the consignment, and the dollars
	// on that coin cannot be put back. Repair is the path that fails stale rows.
	await pullIncomingTransfers(wallet, { skipSync: false, assetId }).catch((error: unknown) => {
		console.warn(
			'[wallet-balances] chain resync failed',
			error instanceof Error ? error.message : String(error)
		);
	});
	if (typeof wallet.listAssets !== 'function') {
		markLocalRefresh();
		return attachChainSpendable(wallet, assets);
	}
	try {
		const reread = await fillUsdtBalance(wallet, parseRgbAssets(await wallet.listAssets()));
		markLocalRefresh();
		return attachChainSpendable(wallet, reread);
	} catch (error: unknown) {
		console.warn(
			'[wallet-balances] chain reread failed',
			error instanceof Error ? error.message : String(error)
		);
		return assets;
	}
}

/** Set chainSpendable when Esplora answered for at least one allocation. */
export async function attachChainSpendable(
	wallet: {
		listUnspents?: () => Promise<unknown>;
		listTransfers?: (assetId: string) => Promise<unknown>;
	},
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
	const spentTotal = chain.spent.reduce((sum, row) => sum + row.amount, 0);
	const future =
		chain.live === 0 && spentTotal > 0
			? await remainderDue(
					wallet,
					usdt,
					chain.spent.map((row) => row.spentBy)
				)
			: (usdt.future ?? 0);
	const settled = usdt.settled ?? 0;
	const booked = Math.max(settled, usdt.balance ?? 0, usdt.spendable ?? 0);
	const changeDue = chain.live === 0 && future > 0 && booked > future;
	const precision = usdtPrecision(usdt.symbol, usdt.precision);
	const provedSpend = !chain.unknown && chain.checked > 0 && chain.live === 0 && spentTotal > 0;
	const spentOutputTxids = chain.unknown
		? undefined
		: chain.spent.map((row) => row.txid.toLowerCase());
	const spentKeys = new Set(spentOutputTxids ?? []);
	const liveOutputTxids = chain.unknown
		? undefined
		: unspents.flatMap((row) => {
				if (!row.utxo.exists) return [];
				const txid = row.utxo.outpoint?.txid?.trim().toLowerCase();
				if (!txid || spentKeys.has(txid)) return [];
				const amount = row.rgbAllocations.reduce((sum, allocation) => {
					if (allocation.assetId !== usdt.assetId) return sum;
					return sum + (allocation.assignment?.amount ?? 0);
				}, 0);
				return amount > 0 ? [txid] : [];
			});
	const next = assets.map((asset) => {
		if (asset.assetId !== usdt.assetId) return asset;
		const balance = provedSpend ? chain.live : asset.balance;
		return {
			...asset,
			balance,
			...(future > 0 ? { future } : {}),
			...(balance === asset.balance
				? {}
				: { formattedBalance: formatUsdtBalance(balance, precision) }),
			chainUnknown: chain.unknown,
			pendingConfirm: chain.pending > 0,
			chainSpent: spentTotal,
			changeDue,
			...(spentOutputTxids ? { spentOutputTxids } : {}),
			...(liveOutputTxids ? { liveOutputTxids } : {}),
			...(chain.unknown || chain.checked === 0 ? {} : { chainSpendable: chain.live })
		};
	});
	if (!chain.unknown && chain.checked > 0 && chain.live === 0 && spentTotal > 0) {
		writeSpentProof({
			assetId: usdt.assetId,
			spent: spentTotal,
			...(spentOutputTxids?.length ? { outputs: spentOutputTxids } : {})
		});
	} else if (!chain.unknown && (chain.live > 0 || chain.pending > 0)) {
		writeSpentProof(null);
	}
	noteChainView(allocationSignature(allocationPoints(unspents, usdt.assetId)));
	return applyStoredSpentProof(next);
}

function allocationPoints(
	unspents: RgbUnspentRef[],
	assetId: string
): { txid: string; vout: number; amount: number }[] {
	return unspents.flatMap((row) => {
		const txid = row.utxo.outpoint?.txid?.trim();
		const vout = row.utxo.outpoint?.vout;
		if (!txid || !Number.isSafeInteger(vout)) return [];
		const amount = row.rgbAllocations.reduce((sum, allocation) => {
			if (allocation.assetId !== assetId) return sum;
			return sum + (allocation.assignment?.amount ?? 0);
		}, 0);
		if (amount <= 0) return [];
		return [{ txid, vout: vout as number, amount }];
	});
}

function txidSet(ids: readonly string[] | undefined): Set<string> | undefined {
	if (!ids) return undefined;
	return new Set(ids.map((id) => id.toLowerCase()));
}

/**
 * A payment listTransfers already has, whose coin is not in the live balance
 * and is not one of the spent outputs. Saved rows are this pubkey only.
 */
export async function applyIncomingCredit(
	wallet: FailWallet,
	assets: RgbAsset[]
): Promise<RgbAsset[]> {
	const listed = await listedTransferRows(wallet);
	rememberIncomingReceives(listed);
	const saved = rememberedIncomingTransfers();
	const usdt = assets.find((asset) => asset.symbol?.toUpperCase() === 'USDT');
	const spentKnown = Array.isArray(usdt?.spentOutputTxids);
	const includeSettled = spentKnown || (usdt?.chainSpent ?? 0) <= 0;
	const units = uncreditedIncomingUnits([...listed, ...saved], {
		spentTxids: txidSet(usdt?.spentOutputTxids),
		liveTxids: txidSet(usdt?.liveOutputTxids),
		includeSettled
	});
	if (!usdt) {
		if (units <= 0) return assets;
		return [
			...assets,
			{
				assetId: getConfiguredRgbUsdtAssetId() ?? FAUCET_IFA_ASSET,
				name: 'Tether USD',
				symbol: 'USDT',
				precision: 6,
				balance: 0,
				spendable: 0,
				incomingUnits: units,
				formattedBalance: formatUsdtBalance(0, 6)
			}
		];
	}
	return assets.map((asset) =>
		asset.assetId === usdt.assetId ? { ...asset, incomingUnits: units } : asset
	);
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
		const previousSats =
			get(walletStore).rgb?.balanceSats || get(walletStore).totalBalances?.sats || 0;
		const syncing = get(walletStore).syncing || get(walletStore).isInitializing;
		const scannedSats = isE2ETest && resolvedBalanceSats === 0 ? 100_000 : resolvedBalanceSats;
		const balanceSats = satsForDisplay(scannedSats, previousSats, syncing);

		const previousAssets = get(walletStore).rgb.assets ?? [];
		let rgbAssets: RgbAsset[] = previousAssets;
		try {
			rgbAssets = parseRgbAssets(await wallet.listAssets());
			rgbAssets = keepHeldUsdt(rgbAssets, previousAssets);
			rgbAssets = await fillUsdtBalance(wallet, rgbAssets);
			rgbAssets = await attachChainSpendable(wallet, rgbAssets);
			const reconcile = options?.pull !== false && needsChainReconcile(rgbAssets);
			if (reconcile) setWalletRefreshing(true);
			try {
				rgbAssets = await resyncChainGap(wallet, rgbAssets, options?.pull !== false);
			} finally {
				if (reconcile) setWalletRefreshing(false);
			}
			rgbAssets = capUnspentUsdt(rgbAssets);
			rgbAssets = holdUsdtBalance(rgbAssets, previousAssets);
			rgbAssets = applyStoredSpentProof(rgbAssets);
			rgbAssets = await applyIncomingCredit(wallet, rgbAssets);
		} catch (err) {
			console.warn('[wallet-balances] listAssets error:', err);
			rgbAssets = previousAssets;
		}

		const heldUsdt = rgbAssets.find((asset) => asset.symbol?.toUpperCase() === 'USDT');
		const usdtAssetId = getConfiguredRgbUsdtAssetId();
		const engineUsdt =
			heldUsdt?.balance ??
			(usdtAssetId ? (rgbAssets.find((asset) => asset.assetId === usdtAssetId)?.balance ?? 0) : 0);
		const usdtBalance = shownUsdt(heldUsdt ?? null, engineUsdt, 0);

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
		if (options?.pull !== false) {
			armReceivePull();
			if (usdtBalance <= 0 || incomingOnly || receivePullDue()) {
				// After this turn drops, so the import does not re-enter wasm still in loadAssets.
				queueMicrotask(() => {
					void refreshIncomingTransfers();
				});
			}
		}
	} catch (err) {
		console.error('[wallet-balances] Error loading assets:', err);
	}
}

export async function refreshRgbBalances(): Promise<void> {
	await loadAssets({ pull: false });
}

const SPENT_PROOF_KEY = 'bittasker.usdt-spent-proof';

export interface SpentProof {
	assetId: string;
	spent: number;
	/** Outpoints that were spent. A later deposit uses a different txid. */
	outputs?: string[];
}

/** The last Esplora proof that this account's USDT sits on a spent output. */
export function readSpentProof(owner?: string | null): SpentProof | null {
	try {
		const parsed: unknown = JSON.parse(readWalletCache(SPENT_PROOF_KEY, owner) ?? 'null');
		if (!parsed || typeof parsed !== 'object') return null;
		const row = parsed as { assetId?: unknown; spent?: unknown; outputs?: unknown };
		if (typeof row.assetId !== 'string' || row.assetId.length === 0) return null;
		if (typeof row.spent !== 'number' || !Number.isSafeInteger(row.spent) || row.spent <= 0) {
			return null;
		}
		const outputs = Array.isArray(row.outputs)
			? row.outputs.filter((id): id is string => typeof id === 'string' && id.length > 0)
			: undefined;
		return { assetId: row.assetId, spent: row.spent, ...(outputs?.length ? { outputs } : {}) };
	} catch {
		return null;
	}
}

export function writeSpentProof(proof: SpentProof | null, owner?: string | null): void {
	try {
		writeWalletCache(SPENT_PROOF_KEY, proof ? JSON.stringify(proof) : null, owner);
	} catch (error: unknown) {
		console.warn(
			'[wallet-balances] could not store the spent proof',
			error instanceof Error ? error.message : String(error)
		);
	}
}

/**
 * Keep a proved spent allocation at 0 when this load could not ask Esplora.
 * A live chain total is left as the chain check reported it.
 */
export function withSpentProof(assets: readonly RgbAsset[], proof: SpentProof | null): RgbAsset[] {
	if (!proof) return [...assets];
	return assets.map((asset) => {
		if (asset.assetId !== proof.assetId || asset.symbol?.toUpperCase() !== 'USDT') return asset;
		if (asset.pendingConfirm) return asset;
		if (asset.chainUnknown !== true && typeof asset.chainSpendable === 'number') return asset;
		const precision = usdtPrecision(asset.symbol, asset.precision);
		const outputs = proof.outputs?.map((id) => id.toLowerCase());
		return {
			...asset,
			balance: 0,
			spendable: 0,
			formattedBalance: formatUsdtBalance(0, precision),
			chainUnknown: false,
			chainSpendable: 0,
			chainSpent: proof.spent,
			changeDue: false,
			...(outputs?.length ? { spentOutputTxids: outputs } : {})
		};
	});
}

export function applyStoredSpentProof(assets: RgbAsset[]): RgbAsset[] {
	return withSpentProof(assets, readSpentProof());
}

/**
 * Sync, refresh, fail stale counterparty rows, and drop allocations on spent outputs.
 * Does not fail the send that spent the coin. Then reloads the balance.
 */
export async function repairUsdtBalance(): Promise<void> {
	const wallet = getUtexoWallet();
	if (!wallet) throw new Error('RGB wallet is not initialized');
	const listed = wallet.listAssets ? await wallet.listAssets().catch(() => null) : null;
	const held = ifaUsdtRow(listed);
	const assetId = held?.assetId ?? FAUCET_IFA_ASSET;
	await rescanColoredCoins(wallet, assetId);
	await pullIncomingTransfers(wallet, { skipSync: true, assetId: held?.assetId ?? null });
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
const RGB_INDEXER = SIGNET_ESPLORA;

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
	updated_status?: unknown;
	updatedStatus?: unknown;
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

function refreshFailureDetail(body: unknown): string | null {
	if (typeof body === 'string' && body.length > 0 && body.length < 300) return body;
	if (!isRecord(body)) return null;
	for (const key of ['details', 'schema_id', 'asset_id', 'message']) {
		const value = body[key];
		if (typeof value === 'string' && value.length > 0 && value.length < 300) return value;
	}
	return null;
}

/** First hard error from a refresh result. `refreshWallet` drops this field. */
export function readRefreshFailure(failure: unknown): string | null {
	if (!isRecord(failure)) return null;
	const schema = failure.UnknownRgbSchema;
	if (isRecord(schema) && typeof schema.schema_id === 'string' && schema.schema_id.length > 0) {
		return `Unknown RGB schema ${schema.schema_id}`;
	}
	const [name] = Object.keys(failure);
	if (!name) return null;
	const detail = refreshFailureDetail(failure[name]);
	return detail ? `${name}: ${detail}` : name;
}

let acceptUsdtDrop = false;

/** The next balance read may show a lower USDT figure. A failed send must not. */
export function acceptNextUsdtDrop(): void {
	acceptUsdtDrop = true;
}

/** Keep the last USDT figure until a send has succeeded. */
export function holdUsdtBalance(
	next: readonly RgbAsset[],
	previous: readonly RgbAsset[]
): RgbAsset[] {
	const allowDrop = acceptUsdtDrop;
	acceptUsdtDrop = false;
	if (allowDrop) return [...next];
	return next.map((asset) => {
		if (asset.symbol?.toUpperCase() !== 'USDT') return asset;
		const prior = previous.find((row) => row.assetId === asset.assetId && row.balance > 0);
		if (!prior || prior.balance <= asset.balance) return asset;
		if (asset.changeDue) return asset;
		if ((asset.chainSpent ?? 0) > 0) return asset;
		return {
			...asset,
			balance: prior.balance,
			spendable: prior.spendable ?? prior.balance,
			formattedBalance: prior.formattedBalance
		};
	});
}

/** Show the unspent amount when RGB still lists a seal the chain already spent. */
export function capUnspentUsdt(assets: readonly RgbAsset[]): RgbAsset[] {
	return assets.map((asset) => {
		if (asset.symbol?.toUpperCase() !== 'USDT') return asset;
		if (asset.changeDue) return asset;
		if (asset.chainUnknown || asset.pendingConfirm || asset.chainSpendable == null) return asset;
		const reported = asset.spendable ?? asset.balance;
		if (reported <= asset.chainSpendable) return asset;
		const precision = usdtPrecision(asset.symbol, asset.precision);
		return {
			...asset,
			balance: asset.chainSpendable,
			spendable: asset.chainSpendable,
			formattedBalance: formatUsdtBalance(asset.chainSpendable, precision)
		};
	});
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

const RECEIVE_PROXY = 'rpcs://rgb-proxy.utexo.com/json-rpc';
/** The wasm default setter rejects `rpcs://` and wants the https URL. */
const RECEIVE_PROXY_HTTPS = 'https://rgb-proxy.utexo.com/json-rpc';
const RECEIVE_PROXY_HOST = 'rgb-proxy.utexo.com';

/** Invoices keep `rpcs://`. Wasm and fetch only accept http(s). */
function wasmProxyUrl(url: string): string {
	return url
		.trim()
		.replace(/^rpcs:\/\//i, 'https://')
		.replace(/^rpc:\/\//i, 'http://');
}

/**
 * rgb-lib posts the consignment request to the URL stored on the transfer.
 * `rpcs://` and a bare host are what the invoice stores. Wasm rejects `rpcs://`,
 * and `https://rgb-proxy.utexo.com` (no `/json-rpc`) is a 404.
 */
export function consignmentProxyUrl(url: string): string {
	const rewritten = wasmProxyUrl(url);
	let parsed: URL;
	try {
		parsed = new URL(rewritten);
	} catch {
		return rewritten;
	}
	if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return rewritten;
	if (parsed.hostname.toLowerCase() !== RECEIVE_PROXY_HOST) return rewritten;
	const path = parsed.pathname.replace(/\/+$/, '') || '/';
	if (path !== '/' && path !== '/json-rpc') return rewritten;
	const next = new URL(RECEIVE_PROXY_HTTPS);
	next.search = parsed.search;
	next.hash = parsed.hash;
	return next.toString();
}

function rewriteConsignmentFetch(input: RequestInfo | URL): RequestInfo | URL {
	const current = requestUrl(input);
	const next = consignmentProxyUrl(current);
	if (next === current) return input;
	if (typeof input === 'string') return next;
	if (input instanceof URL) return new URL(next);
	if (typeof Request !== 'undefined' && input instanceof Request) return new Request(next, input);
	return input;
}

let consignmentFetchDepth = 0;
let savedConsignmentFetch: typeof window.fetch | null = null;

/** Wasm reqwest uses `window.fetch`. Rewrite only the UTEXO proxy host, then restore it. */
function beginConsignmentFetch(): () => void {
	if (!browser || typeof window === 'undefined' || typeof window.fetch !== 'function') {
		return () => undefined;
	}
	if (consignmentFetchDepth === 0) {
		const original = window.fetch.bind(window);
		savedConsignmentFetch = window.fetch;
		window.fetch = (input: RequestInfo | URL, init?: RequestInit) =>
			original(rewriteConsignmentFetch(input), init);
	}
	consignmentFetchDepth += 1;
	let closed = false;
	return () => {
		if (closed) return;
		closed = true;
		consignmentFetchDepth -= 1;
		if (consignmentFetchDepth <= 0) {
			consignmentFetchDepth = 0;
			if (savedConsignmentFetch) window.fetch = savedConsignmentFetch;
			savedConsignmentFetch = null;
		}
	};
}

/**
 * The consignment is fetched from the RGB proxy. A missing proxy leaves the payment unseen.
 * `setRgbProxyTransport` takes `(endpoint, auth, node)` and rejects `rpcs://`.
 * The invoice string still uses `rpcs://`. Only this wasm configuration is https.
 */
function ensureReceiveProxy(wallet: unknown): void {
	const raw = rawWasmWallet(wallet);
	const setProxy = raw?.setRgbProxyTransport;
	if (typeof setProxy !== 'function') return;
	const endpoint = consignmentProxyUrl(RECEIVE_PROXY);
	Reflect.apply(setProxy, raw, [endpoint, null, null]);
}

function thrownMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error ?? '');
}

function fatalWasm(error: unknown): boolean {
	return isWasmPanic(error) || wasmCrashed() || thrownMessage(error) === WASM_CRASH_MESSAGE;
}

function onlineFromWallet(wallet: unknown): unknown {
	if (!isRecord(wallet)) return null;
	const manager = wallet._manager;
	if (!isRecord(manager) || !isRecord(manager.rlnBinding)) return null;
	return manager.rlnBinding.online;
}

function indexerUrlOf(online: unknown): string | null {
	if (!isRecord(online)) return null;
	const url = online.indexer_url ?? online.indexerUrl;
	return typeof url === 'string' && url.trim().length > 0 ? url.trim() : null;
}

function sameUtexoIndexer(url: string): boolean {
	return url.replace(/\/+$/, '') === SIGNET_ESPLORA;
}

/**
 * The JS SDK ignores a later goOnline once `online` is set. A stuck public
 * indexer cannot see UTEXO signet payments, so validation returns a resolver
 * error and the consignment stays unimported. The raw method does switch.
 * Unit-test wallets omit `indexer_url`; those stay untouched.
 */
async function ensureUtexoOnline(wallet: unknown): Promise<void> {
	if (!isRecord(wallet)) return;
	const manager = wallet._manager;
	if (!isRecord(manager) || !isRecord(manager.rlnBinding)) return;
	const binding = manager.rlnBinding;
	const current = indexerUrlOf(binding.online);
	if (!current || sameUtexoIndexer(current)) return;
	const raw = rawWasmWallet(wallet);
	const goOnlineValue = raw?.goOnlineValue;
	if (typeof goOnlineValue !== 'function') return;
	try {
		const next = await Reflect.apply(goOnlineValue, raw, [true, SIGNET_ESPLORA]);
		if (isRecord(next)) binding.online = next;
		console.info('[wallet-refresh] indexer switch', { from: current, to: SIGNET_ESPLORA });
	} catch (error: unknown) {
		console.warn('[wallet-refresh] indexer switch failed', thrownMessage(error));
		if (fatalWasm(error)) throw error;
	}
}

async function syncBeforeRefresh(wallet: PullWallet): Promise<void> {
	if (!wallet.syncWallet) return;
	try {
		await wallet.syncWallet();
	} catch (error: unknown) {
		console.warn('[wallet-refresh] chain sync failed', thrownMessage(error));
		throw error;
	}
}

async function pullIncomingOnce(
	wallet: PullWallet,
	options?: { skipSync?: boolean; assetId?: string | null }
): Promise<void> {
	if (wasmCrashed()) throw new Error(WASM_CRASH_MESSAGE);
	const releaseFetch = beginConsignmentFetch();
	try {
		if (wallet.goOnline && wallet.isOnline?.() !== true) {
			await wallet.goOnline(RGB_INDEXER);
		}
		const skipSync = options?.skipSync === true;
		// `refresh(..., skip_sync: false)` does not sync. The chain sync has to
		// finish before refresh. `syncWallet` is a queued proxy method, so it stays
		// outside this `withWasm` or the two queues deadlock.
		if (!skipSync) await syncBeforeRefresh(wallet);
		if (wasmCrashed()) throw new Error(WASM_CRASH_MESSAGE);
		const raw = rawWasmWallet(wallet);
		if (!raw || typeof raw.refreshValue !== 'function') {
			if (wallet.refreshWallet) await wallet.refreshWallet();
			return;
		}
		await withWasm('pull-transfers', async () => {
			if (wasmCrashed()) throw new Error(WASM_CRASH_MESSAGE);
			// Raw setter and goOnline share the queue with Lightning. A raw call
			// beside an open chain-sync closure panics with
			// "closure invoked recursively or after being dropped".
			ensureReceiveProxy(wallet);
			await ensureUtexoOnline(wallet);
			// Read online after the indexer switch. The object captured before it
			// still points at the public electrum endpoint.
			const pulled = rawRefresh(wallet);
			if (!pulled) return;
			// The method must keep the wasm wallet as `this`; a detached call throws
			// "null pointer passed to rust".
			const assetId = options?.assetId ?? null;
			try {
				await runRgbRefresh(pulled, assetId, skipSync);
			} catch (error) {
				// A named id this wallet has never imported throws and can panic wasm.
				// Null refreshes every pending transfer and lets the consignment register it.
				if (!assetId || !assetUnknown(error)) throw error;
				await runRgbRefresh(pulled, null, skipSync);
			}
		});
	} finally {
		releaseFetch();
	}
}

function updatedStatusOf(entry: RefreshEntry): unknown {
	if (!isRecord(entry)) return null;
	return entry.updated_status ?? entry.updatedStatus ?? null;
}

async function runRgbRefresh(
	pulled: NonNullable<ReturnType<typeof rawRefresh>>,
	assetId: string | null,
	skipSync: boolean
): Promise<void> {
	const result = await Reflect.apply(pulled.raw.refreshValue as RefreshValue, pulled.raw, [
		pulled.online,
		assetId,
		[],
		skipSync
	]);
	const entries = refreshEntries(result);
	if (entries.length === 0) {
		console.info('[wallet-refresh] result', { updatedStatus: null, failure: null, empty: true });
	}
	for (const entry of entries) {
		console.info('[wallet-refresh] result', {
			updatedStatus: updatedStatusOf(entry),
			failure: readRefreshFailure(entry.failure)
		});
	}
	const failure = entries
		.map((entry) => readRefreshFailure(entry.failure))
		.find((message) => message != null);
	if (failure) throw new Error(failure);
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

export function walletFingerprint(wallet: unknown): string | null {
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
	if (wasmCrashed()) {
		console.warn('[wallet-persist] skipped backup after wasm crash');
		return;
	}
	try {
		await writeWalletBackup(wallet);
	} finally {
		if (!wasmCrashed()) await flushWalletState(wallet);
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
async function waitOutPersist(capMs: number): Promise<void> {
	const started = Date.now();
	while (externalRefreshPending() && Date.now() - started < capMs) {
		await new Promise((resolve) => setTimeout(resolve, 250));
	}
}

export function scheduleRgbRefresh(
	wallet: RefreshWallet,
	options?: { timeoutMs?: number }
): Promise<void> {
	if (walletSendPending()) return Promise.resolve();
	if (rgbRefreshTask) {
		console.warn('[wallet-refresh] already running');
		return rgbRefreshTask;
	}
	const timeoutMs = options?.timeoutMs ?? REFRESH_LIMIT_MS;
	const run = enqueueWallet(async () => {
		if (externalRefreshPending()) await waitOutPersist(15_000);
		if (walletSendPending()) return;
		await finishRgbRefresh(wallet, timeoutMs);
	});
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
let receivePullTimer: ReturnType<typeof setInterval> | null = null;
let lastReceivePull = 0;

const RECEIVE_PULL_MS = 20_000;

/** A wallet that already holds USDT still has to ask the proxy for the next payment. */
function receivePullDue(): boolean {
	const now = Date.now();
	if (now - lastReceivePull < RECEIVE_PULL_MS) return false;
	lastReceivePull = now;
	return true;
}

export function armReceivePull(): void {
	if (receivePullTimer || typeof setInterval === 'undefined') return;
	receivePullTimer = setInterval(() => {
		if (wasmBusy() || wasmCrashed() || walletSendPending() || rgbRefreshTask) return;
		const wallet = state.utexoWallet;
		if (!wallet) return;
		lastReceivePull = Date.now();
		void refreshIncomingTransfers();
	}, RECEIVE_PULL_MS);
}

export function stopReceivePull(): void {
	if (!receivePullTimer) return;
	clearInterval(receivePullTimer);
	receivePullTimer = null;
}

function armContractRefresh(): void {
	if (contractRefreshTimer || typeof setInterval === 'undefined') return;
	contractRefreshTimer = setInterval(() => {
		if (contractRefreshPending || wasmBusy() || wasmCrashed()) return;
		const pending = ContractRune.snapshots().some((row) => PENDING_CONTRACT.has(row.status));
		if (!pending || !state.utexoWallet || walletSendPending()) return;
		contractRefreshPending = true;
		loadAssets({ pull: true })
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
	openReceive: boolean;
	/** Waiting receive with no contract id. A named refresh skips these. */
	blankReceive: boolean;
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
	const empty: ReceiveSnap = {
		keys: [],
		settled: false,
		spendable: 0,
		openReceive: false,
		blankReceive: false
	};
	if (!wallet.listTransfers) return empty;
	const listed = wallet.listAssets ? await wallet.listAssets().catch(() => null) : null;
	const ids = listedAssetIds(listed);
	const rows: unknown[] = [];
	// Blank receives have no asset id. listTransfers(assetId) does not return them.
	const unscoped = await wallet.listTransfers().catch(() => []);
	if (Array.isArray(unscoped)) rows.push(...unscoped);
	if (ids.length > 0) {
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
		for (const batch of batches) rows.push(...batch);
	}
	return {
		keys: settledReceiveKeys(rows),
		settled: snapSettled(rows),
		spendable: ifaSpendable(listed),
		openReceive: incomingStillOpen(rows),
		blankReceive: blankReceiveWaiting(rows)
	};
}

function blankRgbInvoice(invoice: unknown): boolean {
	return typeof invoice === 'string' && /^rgb:~\/~\//.test(invoice.trim());
}

const RECEIVE_LOG_STATUSES = new Set([
	'WaitingCounterparty',
	'Failed',
	'WaitingConfirmations',
	'WaitingBroadcast',
	'WaitingSafeHeight'
]);

export interface ReceiveRefreshRow {
	kind: string;
	status: string;
	batchTransferIdx: number | null;
	expiration: number | null;
	recipientId: string | null;
	endpoints: string[];
	blank: boolean;
	txid: string | null;
}

function invoiceBeneficiary(invoice: string): string | null {
	const [path] = invoice.trim().split('?');
	const body = path.startsWith('rgb:') ? path.slice('rgb:'.length) : path;
	const parts = body.split('/');
	if (parts.length < 4) return null;
	const beneficiary = parts.slice(3).join('/');
	return beneficiary.length > 0 ? beneficiary : null;
}

function invoiceEndpoint(invoice: string): string | null {
	const query = invoice.split('?')[1] ?? '';
	if (!query) return null;
	const endpoint = new URLSearchParams(query).get('endpoints');
	return endpoint && endpoint.length > 0 ? endpoint : null;
}

function rowEndpoints(row: Record<string, unknown>, invoice: string): string[] {
	const listed = row.transportEndpoints ?? row.transport_endpoints;
	const endpoints: string[] = [];
	if (Array.isArray(listed)) {
		for (const item of listed) {
			if (typeof item === 'string' && item.length > 0) endpoints.push(item);
			else if (isRecord(item) && typeof item.endpoint === 'string' && item.endpoint.length > 0) {
				endpoints.push(item.endpoint);
			}
		}
	}
	if (endpoints.length === 0) {
		const fromInvoice = invoiceEndpoint(invoice);
		if (fromInvoice) endpoints.push(fromInvoice);
	}
	return endpoints;
}

function rowTxid(row: Record<string, unknown>): string | null {
	if (typeof row.txid === 'string' && row.txid.length > 0) return row.txid;
	const receive = row.receiveUtxo ?? row.receive_utxo;
	if (isRecord(receive) && typeof receive.txid === 'string' && receive.txid.length > 0) {
		return receive.txid;
	}
	return null;
}

/** Compact receive rows for the refresh log. Omits invoices, secrets, and consignment bytes. */
export function receiveRefreshRows(rows: unknown): ReceiveRefreshRow[] {
	if (!Array.isArray(rows)) return [];
	const logged: ReceiveRefreshRow[] = [];
	for (const value of rows) {
		if (!isRecord(value)) continue;
		const kind = typeof value.kind === 'string' ? value.kind : '';
		if (kind !== 'ReceiveBlind' && kind !== 'ReceiveWitness') continue;
		const status = typeof value.status === 'string' ? value.status : '';
		if (!RECEIVE_LOG_STATUSES.has(status)) continue;
		const invoice = typeof value.invoiceString === 'string' ? value.invoiceString : '';
		const directId = value.recipientId ?? value.recipient_id;
		const recipientId =
			typeof directId === 'string' && directId.length > 0 ? directId : invoiceBeneficiary(invoice);
		const batch = value.batchTransferIdx ?? value.batch_transfer_idx;
		const expiration = value.expiration;
		logged.push({
			kind,
			status,
			batchTransferIdx: typeof batch === 'number' ? batch : null,
			expiration: typeof expiration === 'number' ? expiration : null,
			recipientId,
			endpoints: rowEndpoints(value, invoice),
			blank: blankRgbInvoice(invoice),
			txid: rowTxid(value)
		});
	}
	return logged;
}

/** A blank receive is still waiting on the proxy after the invoice date. */
export function blankReceiveWaiting(rows: unknown): boolean {
	if (!Array.isArray(rows)) return false;
	return rows.some((value) => {
		if (!isRecord(value)) return false;
		const kind = typeof value.kind === 'string' ? value.kind : '';
		if (kind !== 'ReceiveBlind' && kind !== 'ReceiveWitness') return false;
		if (value.status !== 'WaitingCounterparty') return false;
		return blankRgbInvoice(value.invoiceString);
	});
}

/** An unpaid receive whose invoice expiry has not passed. A blank invoice stays open after that date. */
export function incomingStillOpen(rows: unknown, nowSec = Math.floor(Date.now() / 1000)): boolean {
	if (!Array.isArray(rows)) return false;
	return rows.some((value) => {
		if (!isRecord(value)) return false;
		const kind = typeof value.kind === 'string' ? value.kind : '';
		if (kind !== 'ReceiveBlind' && kind !== 'ReceiveWitness') return false;
		if (value.status !== 'WaitingCounterparty') return false;
		if (blankRgbInvoice(value.invoiceString)) return true;
		const expiration = value.expiration;
		return typeof expiration !== 'number' || !Number.isFinite(expiration) || expiration > nowSec;
	});
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
		const timeout = refreshCap(timeoutMs);
		let crashed = false;
		const refresh = pullIncomingTransfers(wallet, { skipSync: false }).catch((error: unknown) => {
			console.warn('[wallet-refresh] failed', thrownMessage(error));
			if (fatalWasm(error)) crashed = true;
		});
		const outcome = await Promise.race([refresh.then(() => 'done' as const), timeout]);
		if (outcome === 'timeout') {
			console.warn('[wallet-refresh] stopped after 45s');
			await refresh;
		}
		if (crashed || wasmCrashed()) {
			console.warn('[wallet-refresh] skipped backup after wasm crash');
			return;
		}
		if (outcome !== 'timeout') {
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
		const listed = wallet.listAssets ? await wallet.listAssets().catch(() => null) : null;
		if (wasmCrashed()) {
			console.warn('[wallet-refresh] skipped backup after wasm crash');
			return;
		}
		const held = ifaUsdtRow(listed);
		const askProxy = before.openReceive || (!before.settled && (!held || held.balance <= 0));
		if (askProxy) {
			const followTimeout = refreshCap(timeoutMs);
			// The first pull syncs the chain. The faucet consignment is named by
			// asset id, and a second sync beside it throws a null pointer.
			// An asset id this wallet has never listed makes refresh throw, and a
			// wasm panic then blocks Receive. Null refreshes every pending transfer
			// and lets the consignment register the contract.
			// A named asset id drops transfers whose asset id is still empty.
			// Blank invoices stay empty until the consignment is imported.
			let followCrashed = false;
			const follow = pullIncomingTransfers(wallet, {
				skipSync: true,
				assetId: before.blankReceive ? null : (held?.assetId ?? null)
			}).catch((error: unknown) => {
				console.warn('[wallet-refresh] failed', thrownMessage(error));
				if (fatalWasm(error)) followCrashed = true;
			});
			const followOutcome = await Promise.race([follow.then(() => 'done' as const), followTimeout]);
			if (followOutcome === 'timeout') {
				console.warn('[wallet-refresh] stopped after 45s');
				await follow;
			}
			if (followCrashed || wasmCrashed()) {
				console.warn('[wallet-refresh] skipped backup after wasm crash');
				return;
			}
			if (followOutcome !== 'timeout') {
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
	await stickCancelledReceives();
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

const CANCELLED_RECEIVE_KEY = 'bittasker.cancelled-receives';
let cancelledMemory: Array<{ batch: number; seal: string }> = [];

function cancelledRows(value: unknown): Array<{ batch: number; seal: string }> {
	if (!Array.isArray(value)) return [];
	return value.flatMap((row) => {
		if (!row || typeof row !== 'object') return [];
		const batch = (row as { batch?: unknown }).batch;
		const seal = (row as { seal?: unknown }).seal;
		if (typeof batch !== 'number' || typeof seal !== 'string') return [];
		return [{ batch, seal }];
	});
}

function readCancelledStore(owner?: string | null): Array<{ batch: number; seal: string }> | null {
	try {
		const raw = readWalletCache(CANCELLED_RECEIVE_KEY, owner);
		if (raw === null) return null;
		return cancelledRows(JSON.parse(raw));
	} catch {
		return null;
	}
}

export function readCancelledReceives(): Array<{ batch: number; seal: string }> {
	const stored = readCancelledStore();
	if (stored !== null) {
		cancelledMemory = stored;
		return stored;
	}
	return cancelledMemory;
}

export function clearCancelledReceives(owner?: string | null): void {
	cancelledMemory = [];
	try {
		writeWalletCache(CANCELLED_RECEIVE_KEY, null, owner);
	} catch {
		// The page can still forget the cancel in memory.
	}
}

function rememberCancelled(marks: Array<{ batch: number; seal: string }>): void {
	if (marks.length === 0) return;
	const next = [...readCancelledReceives()];
	for (const mark of marks) {
		if (next.some((row) => row.batch === mark.batch)) continue;
		next.push(mark);
	}
	cancelledMemory = next;
	try {
		writeWalletCache(CANCELLED_RECEIVE_KEY, JSON.stringify(next));
	} catch {
		// Memory still hides and re-fails the receive in this session.
	}
}

export function hidesCancelledReceive(seal: string, remembered = readCancelledReceives()): boolean {
	return seal.length > 0 && remembered.some((row) => row.seal === seal);
}

function blindedLock(rows: unknown): boolean {
	if (!Array.isArray(rows)) return false;
	return rows.some((row) => {
		if (!row || typeof row !== 'object') return false;
		const pending = (row as { pendingBlinded?: unknown }).pendingBlinded;
		return typeof pending === 'number' && pending > 0;
	});
}

type FailWallet = {
	failTransfers?: (params: { batchTransferIdx: number; skipSync: boolean }) => Promise<unknown>;
	listTransfers?: (assetId?: string) => Promise<unknown>;
	listAssets?: () => Promise<unknown>;
	listUnspents?: () => Promise<unknown>;
	refreshWallet?: () => Promise<unknown>;
};

async function listedTransferRows(wallet: FailWallet): Promise<unknown[]> {
	if (!wallet.listTransfers) return [];
	const rows: unknown[] = [];
	const plain = await wallet.listTransfers().catch(() => []);
	if (Array.isArray(plain)) rows.push(...plain);
	const ids = listedAssetIds(
		wallet.listAssets ? await wallet.listAssets().catch(() => null) : null
	);
	const named = await Promise.all(ids.map((id) => wallet.listTransfers?.(id).catch(() => [])));
	for (const batch of named) {
		if (Array.isArray(batch)) rows.push(...batch);
	}
	return rows;
}

/** The last fail syncs. A pull from the proxy after that brings the same receive back. */
async function failReceiveBatches(wallet: FailWallet, indexes: number[]): Promise<void> {
	if (!wallet.failTransfers || indexes.length === 0) return;
	for (let index = 0; index < indexes.length; index += 1) {
		const last = index === indexes.length - 1;
		await wallet.failTransfers({ batchTransferIdx: indexes[index], skipSync: !last });
	}
}

/**
 * Fail every unpaid RGB receive and write that failure into the wallet.
 * A later call still refreshes when the transfer is already failed but the coin stays blinded.
 * It does not pull from the proxy, because that restores the receive on the next reload.
 */
export async function cancelUnpaidInvoices(): Promise<number> {
	const wallet = getUtexoWallet() as FailWallet | null;
	if (!wallet?.failTransfers || !wallet.listTransfers) return 0;
	const marks = unpaidReceiveMarks(await listedTransferRows(wallet));
	rememberCancelled(marks);
	const indexes = [...new Set(marks.map((mark) => mark.batch))];
	await failReceiveBatches(wallet, indexes);
	const unspents = wallet.listUnspents ? await wallet.listUnspents().catch(() => []) : [];
	if (indexes.length === 0 && !blindedLock(unspents)) return 0;
	if (wallet.refreshWallet) await wallet.refreshWallet();
	await flushWalletState(wallet);
	return indexes.length;
}

/** Fail a cancelled receive again when a reload lists it as still waiting. */
export async function stickCancelledReceives(): Promise<number> {
	const remembered = readCancelledReceives();
	if (remembered.length === 0) return 0;
	const wallet = getUtexoWallet() as FailWallet | null;
	if (!wallet?.failTransfers || !wallet.listTransfers) return 0;
	const revived = unpaidReceiveMarks(await listedTransferRows(wallet)).filter((mark) =>
		remembered.some(
			(row) => row.batch === mark.batch || (row.seal !== '' && row.seal === mark.seal)
		)
	);
	if (revived.length === 0) return 0;
	await failReceiveBatches(wallet, [...new Set(revived.map((mark) => mark.batch))]);
	if (wallet.refreshWallet) await wallet.refreshWallet();
	await flushWalletState(wallet);
	return revived.length;
}

/**
 * The UTEXO faucet pays 100 USDT (100_000_000 base units, invoice path `adFZnbk`).
 * rgb-lib encodes 1111 as `nWca`. That figure is the Lightning inbound amount.
 * A blank on-chain receive uses Assignment::Any so the consignment chooses the amount.
 */
const FAUCET_RECEIVE_UNITS = 100_000_000;
const LIGHTNING_INBOUND_UNITS = 1111;
const RECEIVE_DURATION_SECONDS = 3600;

/**
 * Named USDT invoice for an accepted bid. `units` is already the contract amount.
 * It is not scaled again by the asset precision.
 */
export async function receiveEscrowInvoice(units: number): Promise<{
	invoice: string;
	units: number;
}> {
	if (!Number.isSafeInteger(units) || units <= 0) {
		throw new Error('Invoice amount does not match the contract');
	}
	const wallet = getUtexoWallet();
	if (!wallet) throw new Error('Wallet not initialized');
	const listed = typeof wallet.listAssets === 'function' ? await wallet.listAssets() : undefined;
	const listedId = usdtInvoiceAsset(listed, getConfiguredRgbUsdtAssetId());
	// A receiver can invoice with a zero balance. The faucet id is known even before the first sync.
	const assetId = listedId ?? FAUCET_IFA_ASSET;
	try {
		const named = await createRgbInvoice({ assetId, amount: units });
		if (!invoiceMatchesAmount('usdt_rgb', named.invoice, units)) {
			throw new Error('Invoice amount does not match the contract');
		}
		return { invoice: named.invoice, units };
	} catch (error) {
		if (listedId || !assetUnknown(error)) throw invoiceError(error);
	}
	const blank = await receiveBlankInvoice(units);
	if (!invoiceMatchesAmount('usdt_rgb', blank.invoice, units)) {
		throw new Error(
			'This wallet cannot invoice USDT yet. Open the wallet, receive dollars once, then connect escrow again.'
		);
	}
	return { invoice: blank.invoice, units };
}

/** This wallet's RGB database has not imported the USDT contract. */
export class UsdtUnregisteredError extends Error {
	constructor() {
		super('This wallet has not registered USDT yet.');
		this.name = 'UsdtUnregisteredError';
	}
}

async function unscopedTransfers(wallet: {
	listTransfers?: (assetId?: string) => Promise<unknown>;
}): Promise<unknown[]> {
	if (typeof wallet.listTransfers !== 'function') return [];
	try {
		const rows = await wallet.listTransfers();
		return Array.isArray(rows) ? rows : [];
	} catch (error: unknown) {
		console.warn('[wallet-refresh] list transfers failed', thrownMessage(error));
		if (fatalWasm(error)) throw error;
		return [];
	}
}

function proxyProbeEnabled(): boolean {
	return browser && import.meta.env.VITEST !== 'true';
}

function rpcErrorMessage(payload: unknown): string | null {
	if (!isRecord(payload) || !isRecord(payload.error)) return null;
	const message = payload.error.message;
	return typeof message === 'string' ? message : null;
}

function consignmentMeta(payload: unknown): {
	found: boolean;
	txid: string | null;
	validated: boolean | null;
} {
	if (!isRecord(payload) || !isRecord(payload.result)) {
		return { found: false, txid: null, validated: null };
	}
	const result = payload.result;
	const txid = typeof result.txid === 'string' ? result.txid : null;
	const validated = typeof result.validated === 'boolean' ? result.validated : null;
	const found = typeof result.consignment === 'string' && result.consignment.length > 0;
	return { found, txid, validated };
}

async function proxyRpc(
	method: string,
	recipientId: string,
	signal: AbortSignal
): Promise<unknown> {
	const response = await fetch(RECEIVE_PROXY_HTTPS, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({
			jsonrpc: '2.0',
			id: '1',
			method,
			params: { recipient_id: recipientId }
		}),
		signal
	});
	return response.json();
}

/** Ask the proxy whether this recipient still has a consignment. Never posts ack. */
async function probeProxyConsignments(rows: readonly ReceiveRefreshRow[]): Promise<void> {
	if (!proxyProbeEnabled()) return;
	const targets = rows
		.filter(
			(row) =>
				row.blank &&
				row.recipientId &&
				(row.status === 'WaitingCounterparty' || row.status === 'Failed')
		)
		.slice(0, 4);
	await Promise.all(
		targets.map(async (row) => {
			const recipientId = row.recipientId;
			if (!recipientId) return;
			const controller = new AbortController();
			const timer = setTimeout(() => controller.abort(), 8_000);
			try {
				const [consignment, ack] = await Promise.all([
					proxyRpc('consignment.get', recipientId, controller.signal),
					proxyRpc('ack.get', recipientId, controller.signal)
				]);
				const meta = consignmentMeta(consignment);
				const ackValue = isRecord(ack) ? ack.result : null;
				const error = rpcErrorMessage(consignment) ?? rpcErrorMessage(ack);
				noteProxyProbe({
					recipientId,
					found: meta.found,
					validated: meta.validated,
					ack: typeof ackValue === 'boolean' ? ackValue : null,
					txid: meta.txid,
					error
				});
				console.info('[wallet-refresh] proxy', {
					recipientId,
					found: meta.found,
					txid: meta.txid,
					validated: meta.validated,
					ack: ackValue ?? null,
					error
				});
			} catch (error: unknown) {
				console.info('[wallet-refresh] proxy', {
					recipientId,
					found: false,
					txid: null,
					validated: null,
					ack: null,
					error: error instanceof Error ? error.message : String(error)
				});
			} finally {
				clearTimeout(timer);
			}
		})
	);
}

/**
 * Accept every pending incoming transfer. A consignment registers the contract
 * in this wallet. Passing an asset id the wallet has never seen does not.
 * A named asset id also drops blank receives, whose asset id is still empty.
 * `failTransfers` is not used: on an expired receive whose refresh changes
 * nothing, it marks the transfer Failed, and Failed is never refreshed again.
 */
export async function acceptPendingRgb(): Promise<{
	registered: boolean;
	pendingBlank: boolean;
	failure: string | null;
}> {
	const wallet = getUtexoWallet();
	if (!wallet) throw new Error('Wallet not initialized');
	let schemaMissing = false;
	let failure: string | null = null;
	const before = receiveRefreshRows(await unscopedTransfers(wallet));
	console.info('[wallet-refresh] receives', {
		indexer: indexerUrlOf(onlineFromWallet(wallet)),
		rows: before
	});
	const noteFailure = (error: unknown, label: string): void => {
		const message = error instanceof Error ? error.message : String(error);
		if (/unknown rgb schema/i.test(message)) schemaMissing = true;
		failure = message;
		console.warn(label, message);
	};
	try {
		await pullIncomingTransfers(wallet, { skipSync: false });
	} catch (error: unknown) {
		if (fatalWasm(error)) {
			return { registered: false, pendingBlank: false, failure: thrownMessage(error) };
		}
		noteFailure(error, '[wallet-refresh] pending accept failed');
	}
	if (wasmCrashed()) {
		return { registered: false, pendingBlank: false, failure: failure ?? WASM_CRASH_MESSAGE };
	}
	const listed =
		typeof wallet.listAssets === 'function'
			? await wallet.listAssets().catch((error: unknown) => {
					if (fatalWasm(error)) throw error;
					return null;
				})
			: null;
	const id = usdtInvoiceAsset(listed, getConfiguredRgbUsdtAssetId());
	const midway = receiveRefreshRows(await unscopedTransfers(wallet));
	const blankWaiting = midway.some((row) => row.blank && row.status === 'WaitingCounterparty');
	if (blankWaiting || id) {
		try {
			await pullIncomingTransfers(wallet, {
				skipSync: true,
				assetId: blankWaiting ? null : id
			});
		} catch (error: unknown) {
			if (fatalWasm(error)) {
				return { registered: false, pendingBlank: false, failure: thrownMessage(error) };
			}
			noteFailure(error, '[wallet-refresh] asset refresh failed');
		}
	}
	const after = receiveRefreshRows(await unscopedTransfers(wallet));
	console.info('[wallet-refresh] receives after', after);
	for (const row of after) {
		if (!row.blank || row.status !== 'Failed') continue;
		console.warn('[wallet-refresh] refresh does not retry Failed', {
			recipientId: row.recipientId,
			batchTransferIdx: row.batchTransferIdx
		});
	}
	await probeProxyConsignments(after).catch((error: unknown) => {
		console.warn(
			'[wallet-refresh] proxy probe failed',
			error instanceof Error ? error.message : String(error)
		);
	});
	return {
		registered: Boolean(id) && !schemaMissing,
		pendingBlank: after.some((row) => row.blank && row.status === 'WaitingCounterparty'),
		failure
	};
}

export interface IncomingRefreshResult {
	ok: boolean;
	registered: boolean;
	detail: string | null;
}

let incomingRefresh: Promise<IncomingRefreshResult> | null = null;

/**
 * Pull the RGB proxy consignment and accept pending incoming transfers.
 * Concurrent calls share one run. This does not fail a transfer.
 * A row that is already Failed stays Failed. This wasm build has no accept or
 * un-fail method, so a validated proxy consignment cannot be imported again.
 */
function recordedRefreshDetail(failure: string | null, pendingBlank: boolean): string | null {
	if (failure) return publicWalletDetail(failure) ?? failure.slice(0, 160);
	if (pendingBlank) return 'waiting for sender';
	return null;
}

export function refreshIncomingTransfers(): Promise<IncomingRefreshResult> {
	if (incomingRefresh) return incomingRefresh;
	const run = (async () => {
		const wallet = getUtexoWallet();
		if (!wallet) {
			const detail = 'Wallet not initialized';
			noteWalletRefresh(false, detail);
			return { ok: false, registered: false, detail };
		}
		if (wasmCrashed()) {
			noteWalletRefresh(false, WASM_CRASH_MESSAGE);
			return { ok: false, registered: false, detail: WASM_CRASH_MESSAGE };
		}
		const result = await acceptPendingRgb();
		if (wasmCrashed() || result.failure === WASM_CRASH_MESSAGE) {
			const detail = result.failure ?? WASM_CRASH_MESSAGE;
			console.error('[wallet-refresh] incoming refresh failed', detail);
			noteWalletRefresh(false, detail);
			return { ok: false, registered: false, detail };
		}
		await loadAssets({ pull: false });
		// A blank receive still waiting on the sender is a finished check, not a failure.
		const ok = result.failure == null;
		const detail = recordedRefreshDetail(result.failure, result.pendingBlank);
		if (!ok) console.error('[wallet-refresh] incoming refresh failed', result.failure);
		noteWalletRefresh(ok, detail);
		return { ok, registered: result.registered, detail };
	})().catch((error: unknown) => {
		const detail = fatalWasm(error) ? WASM_CRASH_MESSAGE : thrownMessage(error);
		console.error('[wallet-refresh] incoming refresh failed', detail);
		noteWalletRefresh(false, detail);
		if (isWasmPanic(error)) throw error;
		return { ok: false, registered: false, detail };
	});
	// The finally() promise is a different object from `run`. Comparing `run`
	// left the first result cached, so a later press never called wasm again.
	let tracked: Promise<IncomingRefreshResult> | null = null;
	tracked = run.finally(() => {
		if (incomingRefresh === tracked) incomingRefresh = null;
	});
	incomingRefresh = tracked;
	return tracked;
}

/** Copyable receive readout. No invoice, consignment, or blinding secret. */
export async function readWalletDebug(): Promise<string> {
	const wallet = getUtexoWallet();
	const receives: DebugReceive[] = [];
	if (typeof wallet?.listTransfers === 'function') {
		try {
			receives.push(...debugReceiveRows(await wallet.listTransfers(), 'listTransfers'));
		} catch (error: unknown) {
			if (fatalWasm(error)) throw error;
		}
		if (typeof wallet.listAssets === 'function') {
			try {
				for (const assetId of listedAssetIds(await wallet.listAssets())) {
					try {
						const batch = await wallet.listTransfers(assetId);
						receives.push(...debugReceiveRows(batch, 'asset', assetId));
					} catch (error: unknown) {
						if (fatalWasm(error)) throw error;
					}
				}
			} catch (error: unknown) {
				if (fatalWasm(error)) throw error;
			}
		}
	}
	return formatWalletDebug(walletDebugSnapshot(receives));
}

/**
 * Named invoice when this wallet already lists USDT. An older wallet that has
 * never imported the contract gets a blank invoice with no amount, so the
 * sender chooses the asset. A blank invoice is not checked against an amount.
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
	const listedId = usdtInvoiceAsset(listed, configured);
	const assetId = listedId ?? FAUCET_IFA_ASSET;
	const row = spendableRgbAssets(listed).find((item) => item.assetId === assetId);
	const precision = usdtPrecision(row?.ticker ?? 'USDT', row?.precision);
	const units = amount === undefined ? FAUCET_RECEIVE_UNITS : usdtBaseUnits(amount, precision);
	if (listedId) {
		const named = await createRgbInvoice({ assetId: listedId, amount: units });
		if (invoiceOmitsAmount(named.invoice)) {
			return { invoice: named.invoice, blank: true, units: null, precision };
		}
		return { invoice: named.invoice, blank: false, units, precision };
	}
	try {
		const named = await createRgbInvoice({ assetId: FAUCET_IFA_ASSET, amount: units });
		const stated = statedRgbAmount(named.invoice);
		if (stated === null) {
			return { invoice: named.invoice, blank: true, units: null, precision };
		}
		if (stated === undefined || stated === units) {
			return { invoice: named.invoice, blank: false, units, precision };
		}
	} catch (error) {
		if (!assetUnknown(error)) throw invoiceError(error);
	}
	const blank = await receiveBlankInvoice();
	if (statedRgbAmount(blank.invoice) === LIGHTNING_INBOUND_UNITS) {
		throw new Error('RGB invoice amount is not valid');
	}
	return { invoice: blank.invoice, blank: true, units: null, precision };
}

/** Null when the invoice omits the amount. Undefined when it is not a decoded rgb: invoice. */
function statedRgbAmount(invoice: string): number | null | undefined {
	if (!invoice.trim().startsWith('rgb:')) return undefined;
	try {
		return decodeRgbInvoice(invoice).amount;
	} catch {
		return undefined;
	}
}

function invoiceText(received: unknown): string {
	if (typeof received === 'string') return received.trim();
	if (!isRecord(received)) return '';
	const invoice = received.invoice ?? received.invoiceString ?? received.invoice_string;
	return typeof invoice === 'string' ? invoice.trim() : '';
}

/**
 * Assignment::Any. The pinned SDK turns a missing amount into Fungible(0),
 * and Fungible(1111) is the Lightning inbound invoice (`nWca`).
 */
async function receiveAssignmentAny(
	wallet: NonNullable<ReturnType<typeof getUtexoWallet>>
): Promise<string> {
	const raw = rawWasmWallet(wallet);
	const blind = raw?.blindReceiveValue;
	if (typeof blind !== 'function') return '';
	try {
		const received = await receiveWithAllocations(wallet, () =>
			Reflect.apply(blind, raw, [null, 'Any', RECEIVE_DURATION_SECONDS, [RECEIVE_PROXY], 1])
		);
		const invoice = invoiceText(received);
		if (!invoice || statedRgbAmount(invoice) === LIGHTNING_INBOUND_UNITS) return '';
		return invoice;
	} catch (error: unknown) {
		console.warn(
			'[rgb-invoice] assignment Any failed',
			error instanceof Error ? error.message : String(error)
		);
		return '';
	}
}

/** Blank RGB invoice. The sender, such as the UTEXO bot, chooses the asset. */
export async function receiveBlankInvoice(amount?: number): Promise<{ invoice: string }> {
	if (amount !== undefined && (!Number.isSafeInteger(amount) || amount <= 0)) {
		throw new Error('USDT amount must be a positive whole number');
	}
	const wallet = getUtexoWallet();
	if (!wallet) throw new Error('Wallet not initialized');
	if (amount === undefined) {
		const anyInvoice = await receiveAssignmentAny(wallet);
		if (anyInvoice && statedRgbAmount(anyInvoice) === null) return { invoice: anyInvoice };
	}
	const params = {
		witness: false as const,
		minConfirmations: 1,
		durationSeconds: RECEIVE_DURATION_SECONDS,
		...(amount === undefined ? {} : { amount })
	};
	const receive =
		typeof wallet.onchainReceive === 'function'
			? () => wallet.onchainReceive(params)
			: typeof wallet.blindReceive === 'function'
				? () => wallet.blindReceive(params)
				: null;
	if (!receive) throw new Error('Wallet not initialized');
	const received = await receiveWithAllocations(wallet, receive);
	const invoice = invoiceText(received);
	if (!invoice) throw new Error('RGB invoice was empty');
	if (amount === undefined && statedRgbAmount(invoice) === LIGHTNING_INBOUND_UNITS) {
		throw new Error('RGB invoice amount is not valid');
	}
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

function thrownText(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function assetUnknown(error: unknown): boolean {
	const text = thrownText(error);
	return (
		/asset with id .+ not found/i.test(text) ||
		/not configured/i.test(text) ||
		/not registered/i.test(text)
	);
}

function invoiceError(error: unknown): Error {
	if (error instanceof Error && error.message.trim()) return error;
	const text = thrownText(error).trim();
	return new Error(text || 'Failed to generate RGB invoice');
}

async function requestRgbInvoice(
	wallet: NonNullable<ReturnType<typeof getUtexoWallet>>,
	params?: { assetId?: string; amount?: number }
): Promise<{ invoice: string; blindedUtxo?: string }> {
	try {
		return await callRgbInvoice(wallet, params);
	} catch (error) {
		throw invoiceError(error);
	}
}

async function callRgbInvoice(
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
