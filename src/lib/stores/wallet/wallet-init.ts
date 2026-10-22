import type { UTEXOWallet } from '@utexo/rgb-sdk-web';
import type { RgbAsset, WalletProbeWindow } from './wallet-types';
import { ContractRune } from '$lib/runes/contract.svelte';
import { browser } from '$app/environment';
import { get } from 'svelte/store';
import { getMnemonic } from '$lib/utils/helpers/mnemonic';
import {
	clearKeySessions,
	clearMnemonicSession,
	isTransientSessionError,
	readMnemonicSession
} from '$lib/utils/helpers/session-mnemonic';
import { initWasm } from '$lib/wasm/init-wasm';
import { walletStore, state, clearRefreshTimers } from './wallet-state';
import { initialState } from './wallet-types';
import {
	installEsploraRetryFetch,
	isE2eWalletReset,
	applyStoredSpentProof,
	attachChainSpendable,
	capUnspentUsdt,
	fillUsdtBalance,
	installPersistHooks,
	loadAssets,
	repairUsdtBalance,
	restoreOnUnlock,
	ownRgbDatabasePresent,
	rgbDatabaseNames,
	stopContractRefresh,
	stopReceivePull,
	scanBtcBalance,
	parseRgbAssets,
	sumSpendableSats,
	walletFingerprint
} from './wallet-balances';
import { beginWalletSession, endWalletSession } from './wallet-session';
import { loadTransactions } from './wallet-transactions';
import { rgbConsignmentSubscription } from '$lib/services/rgb/consignment-subscription';
import { getConfiguredRgbUsdtAssetId } from '$lib/types/rgb-contract';
import { chainSyncPlan } from './chain-sync';
import {
	armLightningSetupTimeout,
	confirmLightningAttached,
	discoverSignetLsp,
	installLightningGuard,
	lightningStore,
	signetLspParams,
	stopLspPolling,
	watchLightningPeer
} from './signet-lsp';
import { claimWalletTab, WALLET_TAB_BUSY, type WalletTabClaim } from './wallet-tab-lock';
import { rgbWalletConfig } from './rgb-wallet-config';
import { shareInit } from './init-gate';
import { applyBalanceUpdate } from './balance-merge';
import { satsForDisplay } from './plain-wallet';
import { saveWalletSnapshot } from './wallet-snapshot';
import {
	WASM_CRASH_MESSAGE,
	installWasmPanicListener,
	releaseWasmQueue,
	isWasmPanic,
	lockedWallet,
	markWasmCrashed,
	onWasmCrash,
	wasmBusy,
	wasmCrashed,
	withWasm
} from './wasm-lock';

const initSlot: { current: Promise<void> | null } = { current: null };
/** wallet.init() has run. A second call on this page overlaps a live or dead instance. */
let initInvoked = false;
let nodeChainSyncStarted = false;
let panicHooksReady = false;
let tabClaim: WalletTabClaim | null = null;

// Constants
const RGB_SDK_VERSION = '@utexo/rgb-sdk-web@1.0.0-beta.12' as const;
/** Shown when the session store never answers. The wallet page already translates this string. */
export const WALLET_INIT_TIMEOUT = 'Wallet init timed out';

// Helper functions
async function deriveUtexoWalletPassword(mnemonic: string): Promise<string> {
	const encoder = new TextEncoder();
	const data = encoder.encode(`bittasker-utexo-rgb-wallet:${mnemonic}`);
	const hashBuffer = await crypto.subtle.digest('SHA-256', data);
	const hashArray = Array.from(new Uint8Array(hashBuffer));
	return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Utility functions
function isWasmGlobalError(error: unknown): boolean {
	if (!(error instanceof Error)) return false;
	const message = error.message.toLowerCase();
	return (
		message.includes('exports is not defined') ||
		message.includes('module is not defined') ||
		message.includes('.wasm') ||
		message.includes('wasm')
	);
}

async function waitForWasmGlobals(): Promise<void> {
	if (!browser) return;
	await new Promise<void>((resolve) => setTimeout(resolve, 50));
}

type LightningRuntime = UTEXOWallet & {
	attachLightningNode?: () => void | Promise<void>;
	startNodeChainSync?: (indexerUrl?: string, pollMs?: number) => void | Promise<void>;
};

type ProbeWindow = WalletProbeWindow & {
	__utexoWallet?: UTEXOWallet | null;
	__createRgbUtxos?: (count?: number, sizeSats?: number) => Promise<number | undefined>;
	E2E?: {
		escrowStatus: () => string;
		refreshRgb: () => Promise<void>;
	};
};

/**
 * Open and unlock are not on a timer. A wallet with history can take longer
 * than 20s inside init(); failing that leaves the page locked with no passkey.
 * Timeouts belong on the background sync and Lightning steps.
 */

/** Balances already in the local database. No chain sync and no Lightning. */
async function readLocalBalances(wallet: UTEXOWallet): Promise<void> {
	let address = '';
	let balanceSats = 0;
	let utxoCount = 0;
	try {
		address = await wallet.getAddress();
	} catch (error: unknown) {
		console.warn('[wallet-init] local address skipped', thrownInit(error));
	}
	try {
		balanceSats = sumSpendableSats(await wallet.getBtcBalance());
	} catch (error: unknown) {
		console.warn('[wallet-init] local balance skipped', thrownInit(error));
	}
	try {
		const unspents = wallet.listUnspents ? await wallet.listUnspents() : [];
		utxoCount = Array.isArray(unspents) ? unspents.length : 0;
	} catch (error: unknown) {
		console.warn('[wallet-init] local utxos skipped', thrownInit(error));
	}
	updateProbeWindow(address, balanceSats, utxoCount, wallet);
	let assets: RgbAsset[] | null = null;
	try {
		assets = parseRgbAssets(await wallet.listAssets());
	} catch (error: unknown) {
		console.warn('[wallet-init] local assets skipped', thrownInit(error));
	}
	updateWalletStore(address, balanceSats, assets);
}

function thrownInit(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

/**
 * Network sync and Lightning run after the wallet is already open.
 * A timeout retries the step. It does not lock the wallet or set the open error.
 */
async function runBackgroundStartup(
	wallet: UTEXOWallet,
	network: string,
	skipLsp: boolean
): Promise<void> {
	armLightningSetupTimeout();
	console.info('[wallet-init] background sync');
	let scanFailed = false;
	try {
		await wallet.refreshWallet();
	} catch (error: unknown) {
		scanFailed = true;
		console.warn('[wallet-init] balance scan deferred:', thrownInit(error));
	}
	try {
		await scanAndUpdateBalances(wallet, network);
	} catch (error: unknown) {
		scanFailed = true;
		console.warn('[wallet-init] balance scan deferred:', thrownInit(error));
	}
	repairUsdtBalance().catch((error: unknown) => {
		console.warn('[wallet-init] usdt repair skipped', thrownInit(error));
	});
	if (scanFailed) void retryScan(wallet, network);
	else walletStore.update((current) => ({ ...current, syncing: false }));

	let lightningAttached = false;
	try {
		console.info('[wallet-init] attachLightningNode');
		await attachLightning(wallet);
		lightningAttached = true;
		console.info('[wallet-init] lightning node attached');
	} catch (error: unknown) {
		console.warn('[wallet-init] lightning attach failed', thrownInit(error));
		lightningStore.update((row) => (row.failure ? row : { ...row, failure: 'attach' }));
	}
	await loadTransactions().catch((error: unknown) => {
		console.warn('[wallet-init] transaction load skipped', error);
	});
	if (!skipLsp && lightningAttached && !wasmCrashed()) {
		confirmLightningAttached();
		watchLightningPeer(wallet);
		installLightningGuard();
		void discoverSignetLsp(wallet).catch((error: unknown) => {
			console.warn('[wallet-init] LSP discovery skipped', thrownInit(error));
		});
	} else if (!lightningAttached) {
		console.warn('[wallet-init] LSP discovery skipped after attach failure');
	}
	if (lightningAttached && !wasmCrashed()) {
		console.info('[wallet-init] startNodeChainSync');
		// The start keeps running if it is slow. A second start panics the wasm
		// closure, so this does not retry while the first call is still in flight.
		void limitWait(startNodeChainSync(wallet), 20_000, 'Lightning chain sync timed out').catch(
			(error: unknown) => {
				console.warn('[wallet-init] chain sync start failed', thrownInit(error));
			}
		);
	}
	// The wallet page imports consignments after loadAssets. This subscription
	// does not call refresh, so it does not overlap that scan.
	startConsignmentSubscription();
}

function limitWait<T>(run: Promise<T>, ms: number, message: string): Promise<T> {
	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => reject(new Error(message)), ms);
		run.then(
			(value) => {
				clearTimeout(timer);
				resolve(value);
			},
			(error: unknown) => {
				clearTimeout(timer);
				reject(error);
			}
		);
	});
}

function probeWindow(): ProbeWindow {
	return window as ProbeWindow;
}

// Wallet initialization core logic
async function initializeRgbWallet(mnemonic: string, skipLsp = false): Promise<void> {
	if (!browser) return;

	// TEST: Explicit 3-phase lifecycle with network: 'utexo' + vssUrl: null
	// Tests if bypassing create() and using native preset avoids the vssUrl url-parse panic.
	const network = 'utexo' as const;

	try {
		const tab = await claimWalletTab(
			typeof navigator === 'undefined' || !navigator.locks
				? null
				: (navigator.locks as unknown as Parameters<typeof claimWalletTab>[0])
		);
		if (!tab) {
			walletStore.update((current) => ({
				...current,
				isInitializing: false,
				syncing: false,
				locked: false,
				error: WALLET_TAB_BUSY
			}));
			lightningStore.update((row) => ({ ...row, ready: false, failure: 'tab' }));
			console.warn('[wallet-init] wallet tab lock busy');
			throw new Error(WALLET_TAB_BUSY);
		}
		tabClaim = tab;
		await initWasm();
		installEsploraRetryFetch();
		armWasmPanicHooks();

		// Import UTEXOWallet directly for explicit 3-phase lifecycle
		const { UTEXOWallet, getRlnUrls } = await import('@utexo/rgb-sdk-web');
		const password = await deriveUtexoWalletPassword(mnemonic);
		const e2eReset = isE2eWalletReset();
		const urls = getRlnUrls('utexo');
		if (!urls?.relayAuthToken || !urls.relayNodeId) {
			throw new Error('Wallet transport auth is missing');
		}

		// Diagnostic logging (redacted - no mnemonic, xpub, fingerprint, or tokens)
		console.info('[wallet-diagnostic:init]', {
			network: 'utexo',
			sdk_version: RGB_SDK_VERSION,
			method: 'explicit-3phase-lifecycle'
		});
		const taskerDataDir = 'rln_73c5da0a_signet';
		if (e2eReset) {
			console.info('[wallet-init] pinned data dir', taskerDataDir);
		}

		const databasesBefore = await rgbDatabaseNames();
		const lsp = signetLspParams(null);
		const wallet = lockedWallet(
			new UTEXOWallet(
				rgbWalletConfig({
					mnemonic,
					password,
					indexerUrl: lsp.indexerUrl,
					transportEndpoint: lsp.transportEndpoint,
					proxyUrl: lsp.proxyUrl,
					relayAuthToken: urls.relayAuthToken,
					relayNodeId: urls.relayNodeId,
					enableVirtualChannels: lsp.enableVirtualChannels,
					lspBaseUrl: lsp.lspBaseUrl,
					...(e2eReset ? { dataDir: taskerDataDir } : {})
				})
			)
		);

		console.info('[wallet-init] start');
		console.info('[wallet-diagnostic] Wallet constructed, calling init()...');
		initInvoked = true;
		try {
			await withWasm('init', () => wallet.init());
			console.info('[wallet-diagnostic] init() succeeded, calling unlock()...');
			await withWasm('unlock', () => wallet.unlock());
		} catch (connectError) {
			console.warn('[wallet-init] RLN handshake failed:', connectError);
			throw connectError;
		}

		console.info('[wallet-diagnostic] unlock() succeeded, wallet ready!');
		await restoreOnUnlock(
			wallet,
			ownRgbDatabasePresent(databasesBefore, walletFingerprint(wallet))
		);

		state.utexoWallet = wallet;
		beginWalletSession(walletFingerprint(wallet) ?? '');
		installPersistHooks();
		if (typeof window !== 'undefined' && wallet) {
			probeWindow().__utexoWallet = wallet;
			console.info('[wallet-init] exposed __utexoWallet on window');
		}
		await readLocalBalances(wallet);
		walletStore.update((current) => ({
			...current,
			locked: false,
			syncing: true,
			isInitializing: false,
			isConnected: true,
			error: null,
			rgb: {
				...current.rgb,
				initialized: true,
				error: null
			}
		}));
		// Sync and Lightning keep running after the page can show local balances.
		// A slow chain must not fail open or cover the wallet with the skeleton.
		void runBackgroundStartup(wallet, network, skipLsp);
	} catch (err) {
		console.warn('[wallet-init] RGB wallet init failed:', err);
		if (isWasmPanic(err)) markWasmCrashed();
		const failure = walletOpenFailure(err, wasmCrashed());
		if (failure.retry) {
			initInvoked = false;
			releaseTabLock();
		}
		walletStore.update((s) => ({
			...s,
			isInitializing: false,
			syncing: false,
			error: failure.message,
			rgb: {
				...s.rgb,
				initialized: false,
				error: failure.message
			}
		}));
		throw err;
	}
}

let reviveCount = 0;
let reviving = false;

async function dropDeadWallet(): Promise<void> {
	const wallet = state.utexoWallet;
	state.utexoWallet = null;
	initInvoked = false;
	initSlot.current = null;
	releaseTabLock();
	if (wallet && typeof wallet.dispose === 'function') {
		try {
			wallet.dispose();
		} catch (error) {
			console.warn('[wallet-init] dispose after panic failed', error);
		}
	}
	releaseWasmQueue();
}

function releaseTabLock(): void {
	tabClaim?.release();
	tabClaim = null;
	endWalletSession();
}

/** Rebuild the engine from the cached session. Never prompts for a passkey. */
async function reviveWallet(): Promise<void> {
	if (reviving || reviveCount >= 3) return;
	reviving = true;
	reviveCount += 1;
	walletStore.update((current) => ({
		...current,
		isInitializing: true,
		syncing: false,
		error: null
	}));
	const cached = await readMnemonicSession(Date.now(), 0).catch(() => null);
	if (!cached) {
		reviving = false;
		reviveCount -= 1;
		walletStore.update((current) => ({
			...current,
			isInitializing: false,
			locked: true,
			error: null
		}));
		return;
	}
	releaseTabLock();
	await dropDeadWallet();
	await new Promise((resolve) => setTimeout(resolve, 400 * reviveCount));
	try {
		await initialize({ skipLsp: true });
		reviveCount = 0;
	} catch (error) {
		console.warn('[wallet-init] revive failed', error);
	} finally {
		reviving = false;
	}
	if (reviveCount > 0 && reviveCount < 3 && !state.utexoWallet) await reviveWallet();
	if (wasmCrashed()) {
		walletStore.update((current) => ({
			...current,
			isInitializing: false,
			locked: !state.utexoWallet,
			error: null
		}));
	}
}

function armWasmPanicHooks(): void {
	installWasmPanicListener();
	if (panicHooksReady) return;
	panicHooksReady = true;
	onWasmCrash(() => {
		clearRefreshTimers();
		stopContractRefresh();
		stopReceivePull();
		stopLspPolling();
		lightningStore.update((row) => ({ ...row, ready: false, failure: row.failure || 'attach' }));
		walletStore.update((current) => ({
			...current,
			isInitializing: true,
			syncing: false,
			error: null
		}));
		void reviveWallet();
	});
}

async function attachLightning(wallet: LightningRuntime): Promise<void> {
	if (typeof wallet.attachLightningNode !== 'function') {
		throw new Error('Lightning node attach is missing');
	}
	await wallet.attachLightningNode();
}

interface ChainSyncBinding {
	startNodeChainSync?: (indexerUrl?: string, pollMs?: number) => void | Promise<void>;
	nodeHandle?: { chainSyncStatusValue?: () => unknown };
	defaultIndexerUrl?: string;
}

function chainSyncBinding(wallet: LightningRuntime): ChainSyncBinding | null {
	const manager = (wallet as { _manager?: { rlnBinding?: ChainSyncBinding } })._manager;
	return manager?.rlnBinding ?? null;
}

async function startNodeChainSync(wallet: LightningRuntime): Promise<void> {
	if (nodeChainSyncStarted) return;
	await withWasm('startNodeChainSync', async () => {
		if (nodeChainSyncStarted) return;
		const binding = chainSyncBinding(wallet);
		let status: unknown;
		const readStatus = binding?.nodeHandle?.chainSyncStatusValue;
		if (typeof readStatus === 'function') {
			try {
				status = readStatus.call(binding?.nodeHandle);
			} catch (error: unknown) {
				console.warn(
					'[wallet-init] chain sync status unread',
					error instanceof Error ? error.message : String(error)
				);
			}
		}
		const hasStart =
			typeof wallet.startNodeChainSync === 'function' ||
			typeof binding?.startNodeChainSync === 'function';
		const plan = chainSyncPlan(status, hasStart);
		console.info('[wallet-init] chain sync', plan);
		nodeChainSyncStarted = true;
		if (plan !== 'start') return;
		const start = wallet.startNodeChainSync ?? binding?.startNodeChainSync;
		if (typeof start !== 'function') return;
		const owner = typeof wallet.startNodeChainSync === 'function' ? wallet : binding;
		await start.call(owner, binding?.defaultIndexerUrl);
	});
}

async function retryScan(wallet: UTEXOWallet, network: string): Promise<void> {
	for (let attempt = 0; attempt < 4; attempt += 1) {
		await new Promise((resolve) => setTimeout(resolve, Math.min(30_000, 2_000 * 2 ** attempt)));
		if (wasmCrashed()) return;
		if (wasmBusy()) continue;
		try {
			await scanAndUpdateBalances(wallet, network);
			markWalletReady();
			return;
		} catch (error: unknown) {
			console.warn('[wallet-init] balance retry failed', error);
		}
	}
	walletStore.update((current) => ({ ...current, syncing: false }));
}

async function scanAndUpdateBalances(wallet: UTEXOWallet, network: string): Promise<void> {
	const scanned = await scanBtcBalance(wallet);
	if (!scanned) throw new Error('Balance scan failed');
	const { address, balanceSats, utxoCount } = scanned;

	// Diagnostic logging (redacted - no sensitive data)
	console.info('[wallet-diagnostic:ready]', {
		network,
		hasAddress: !!address,
		balanceSats,
		utxoCount
	});

	updateProbeWindow(address, balanceSats, utxoCount, wallet);
	let rgbAssets: RgbAsset[] | null = null;
	try {
		rgbAssets = await loadRgbAssets(wallet);
	} catch (error: unknown) {
		console.warn('[wallet-init] listAssets skipped or failed:', error);
	}
	updateWalletStore(address, balanceSats, rgbAssets);
}

function updateProbeWindow(
	address: string,
	balanceSats: number,
	utxoCount: number,
	wallet: UTEXOWallet
): void {
	if (!browser) return;

	const probe = probeWindow();
	const isTestEnvironment =
		probe.__PLAYWRIGHT_TEST__ === true || import.meta.env.VITE_E2E_TURNSTILE_BYPASS === 'true';

	if (isTestEnvironment) {
		probe.__btcAddress = address;
		probe.__btcBalanceSats = balanceSats;
		probe.__btcUtxoCount = utxoCount;
		probe.__btcWalletSynced = true;
		probe.__refreshBtcBalance = () => loadAssets();
		probe.__sendBtc = (params) =>
			wallet.sendBtc({
				address: params.address,
				amount: params.amountSats,
				feeRate: params.feeRate ?? 1
			});
		probe.__createRgbUtxos = async (count = 5, sizeSats = 2500) => {
			try {
				return await wallet.createUtxos({ num: count, size: sizeSats, feeRate: 1, upTo: true });
			} catch (err: unknown) {
				const msg = err instanceof Error ? err.message : String(err);
				if (msg.includes('Allocations already available')) {
					console.info('[wallet-init] Allocations already available, skipping UTXO creation');
					return;
				}
				throw err;
			}
		};
		probe.E2E = {
			escrowStatus: () => {
				const snapshots = ContractRune.snapshots();
				const s = snapshots[0];
				return s?.fundingState ?? s?.status ?? '';
			},
			refreshRgb: async () => {
				const w = state.utexoWallet;
				if (w) await w.refreshWallet();
			}
		};
	}
}

async function loadRgbAssets(wallet: UTEXOWallet): Promise<RgbAsset[]> {
	const rawAssets = await wallet.listAssets();
	const filled = await fillUsdtBalance(wallet, parseRgbAssets(rawAssets));
	const checked = await attachChainSpendable(wallet, filled);
	return capUnspentUsdt(applyStoredSpentProof(checked));
}

function markWalletReady(): void {
	walletStore.update((current) => ({
		...current,
		isConnected: true,
		isInitializing: false,
		locked: false,
		syncing: false,
		error: null,
		rgb: {
			...current.rgb,
			initialized: true,
			error: null
		}
	}));
}

function updateWalletStore(
	address: string,
	balanceSats: number | null,
	rgbAssets: RgbAsset[] | null
): void {
	const heldUsdt = (rgbAssets ?? get(walletStore).rgb.assets).find(
		(asset) => asset.symbol?.toUpperCase() === 'USDT'
	);
	const usdtAssetId = getConfiguredRgbUsdtAssetId();
	if (!usdtAssetId && !heldUsdt) {
		console.warn('[wallet-init] No active RGB_USDT_ASSET_ID');
	}
	const listed = rgbAssets ?? get(walletStore).rgb.assets;
	const usdtBalance =
		heldUsdt?.balance ??
		(usdtAssetId ? (listed.find((asset) => asset.assetId === usdtAssetId)?.balance ?? 0) : 0);

	walletStore.update((s) => {
		const merged = applyBalanceUpdate(
			{ balanceSats: s.rgb.balanceSats, assets: s.rgb.assets },
			{ balanceSats, assets: rgbAssets }
		);
		const previous = s.rgb.balanceSats || s.totalBalances?.sats || 0;
		const nextSats = satsForDisplay(merged.balanceSats, previous, s.syncing || s.isInitializing);
		const nextAssets = merged.assets as RgbAsset[];
		const nextAddress = address || s.rgb.address;
		return {
			...s,
			isConnected: true,
			locked: false,
			error: null,
			rgb: {
				...s.rgb,
				initialized: true,
				error: null,
				address: nextAddress,
				balanceSats: nextSats,
				formattedBalance: (nextSats / 1e8).toFixed(8),
				assets: nextAssets
			},
			wdk: {
				...s.wdk,
				initialized: true,
				error: null,
				btcOnchain: {
					address: nextAddress ?? '',
					balanceSats: nextSats,
					formattedBalance: (nextSats / 1e8).toFixed(8)
				}
			},
			totalBalances: {
				...s.totalBalances,
				sats: nextSats,
				usdt: rgbAssets === null ? s.totalBalances.usdt : usdtBalance
			}
		};
	});
	const saved = get(walletStore);
	void saveWalletSnapshot({
		address: saved.rgb.address,
		balanceSats: saved.rgb.balanceSats,
		formattedBalance: saved.rgb.formattedBalance,
		usdt: saved.totalBalances.usdt,
		assets: saved.rgb.assets,
		transactions: saved.transactions
	}).catch(() => undefined);
}

function startConsignmentSubscription(): void {
	if (!browser) return;

	void rgbConsignmentSubscription
		.start({
			onError: (error) => console.warn('[wallet-init] RGB consignment ignored:', error)
		})
		.catch((error) => console.warn('[wallet-init] RGB consignment startup ignored:', error));
}

// Exported functions
export async function getRgbAddress(): Promise<string> {
	const storeState = get(walletStore);
	if (storeState.rgb?.address) return storeState.rgb.address;

	try {
		await initialize();
	} catch {
		return '';
	}

	return get(walletStore).rgb?.address || '';
}

/**
 * A wasm panic needs a reload. Any other open failure can be retried, and the
 * real message stays on screen instead of the generic crash line.
 */
export function walletOpenFailure(
	error: unknown,
	crashed: boolean
): { message: string; retry: boolean } {
	if (crashed || isWasmPanic(error)) {
		return { message: WASM_CRASH_MESSAGE, retry: false };
	}
	const message =
		error instanceof Error && error.message.trim()
			? error.message
			: 'Wallet could not open. Tap Retry.';
	return { message, retry: true };
}

/** A blocked or empty IndexedDB error can be opened again. A real message stays on screen. */
export function describeSessionOpenError(error: unknown): { retry: boolean; message: string } {
	const name = error instanceof Error ? error.name.toLowerCase() : '';
	const message = error instanceof Error ? error.message.trim() : '';
	const retry =
		isTransientSessionError(error) ||
		!(error instanceof Error) ||
		!message ||
		/abort|invalidstate|unknown|timeout|notfound|quota/.test(name) ||
		/timed out|blocked|aborted|invalidstate|versionchange/.test(message.toLowerCase());
	if (retry) return { retry: true, message: WALLET_INIT_TIMEOUT };
	return { retry: false, message };
}

function startFailureMessage(error: unknown): string {
	return describeSessionOpenError(error).message;
}

async function runInitialize(options?: { skipLsp?: boolean }): Promise<void> {
	console.info('[wallet-init] start');
	const probe = probeWindow();
	const isTestEnvironment =
		probe.__PLAYWRIGHT_TEST__ === true || import.meta.env.VITE_E2E_TURNSTILE_BYPASS === 'true';
	if (isTestEnvironment) probe.__connectWallet = () => initialize();

	if (state.utexoWallet) {
		walletStore.update((current) => ({
			...current,
			isInitializing: false,
			isConnected: true,
			locked: false
		}));
		probe.__utexoWallet = state.utexoWallet;
		return;
	}

	walletStore.update((current) => ({ ...current, isInitializing: true, error: null }));
	let mnemonic: string | null = null;
	try {
		for (let attempt = 0; attempt < 3; attempt += 1) {
			try {
				mnemonic = await readMnemonicSession();
				break;
			} catch (error) {
				const described = describeSessionOpenError(error);
				if (!described.retry || attempt === 2) throw error;
				console.warn('[wallet-init] session open failed, retrying', described.message);
				await new Promise((resolve) => setTimeout(resolve, 50 * (attempt + 1)));
			}
		}
	} catch (error) {
		const message = startFailureMessage(error);
		console.warn('[wallet-init] start failed', message);
		walletStore.update((current) => ({
			...current,
			isInitializing: false,
			syncing: false,
			locked: true,
			error: message
		}));
		throw new Error(message);
	}
	if (!mnemonic) {
		walletStore.update((current) => ({
			...current,
			isInitializing: false,
			locked: true,
			syncing: false,
			transactions: [],
			rgb: {
				...current.rgb,
				balanceSats: 0,
				formattedBalance: '0.00000000',
				assets: []
			},
			totalBalances: {
				...current.totalBalances,
				sats: 0,
				usdt: 0
			}
		}));
		initSlot.current = null;
		return;
	}

	console.info('[wallet-diagnostic:mnemonic]', {
		wordCount: mnemonic.trim().split(/\s+/).length
	});

	let lastError: unknown;
	for (let attempt = 0; attempt < 2; attempt += 1) {
		if (initInvoked || wasmCrashed()) break;
		try {
			await initWasm();
			await initializeRgbWallet(mnemonic, options?.skipLsp === true);
			return;
		} catch (error) {
			lastError = error;
			if (initInvoked || wasmCrashed() || !isWasmGlobalError(error) || attempt === 1) break;
			await waitForWasmGlobals();
		}
	}
	const failure = walletOpenFailure(lastError, wasmCrashed());
	const message = failure.message;
	console.warn('[wallet-init] Wallet initialization unavailable:', lastError);
	if (!state.utexoWallet && !failure.retry) {
		await clearMnemonicSession().catch(() => undefined);
	}
	walletStore.update((current) => ({
		...current,
		isInitializing: false,
		syncing: false,
		locked: state.utexoWallet ? current.locked : true,
		error: message
	}));
	throw new Error(message);
}

export function initialize(options?: { skipLsp?: boolean }): Promise<void> {
	if (!browser) return Promise.resolve();
	if (initSlot.current) return initSlot.current;
	if (wasmCrashed() || (initInvoked && !state.utexoWallet)) {
		return Promise.reject(new Error(WASM_CRASH_MESSAGE));
	}
	if (initInvoked && state.utexoWallet) return Promise.resolve();
	return shareInit(initSlot, () => runInitialize(options));
}

/** WebAuthn runs only from a passkey click. An nsec account uses the pasted or session key. */
export async function unlockWallet(signal?: AbortSignal, nsec?: string): Promise<void> {
	await getMnemonic({ signal, nsec });
	if (initInvoked || wasmCrashed()) {
		if (initSlot.current) await initSlot.current;
		if (!state.utexoWallet) throw new Error(WASM_CRASH_MESSAGE);
		return;
	}
	if (initSlot.current) {
		await initSlot.current;
		if (state.utexoWallet || initInvoked) return;
	}
	initSlot.current = null;
	await initialize();
}

export function disconnectWallet(): void {
	initSlot.current = null;
	rgbConsignmentSubscription.stop();

	if (state.utexoWallet && typeof state.utexoWallet.dispose === 'function') {
		try {
			void state.utexoWallet.dispose();
		} catch (error) {
			console.warn('[wallet-init] Wallet dispose failed:', error);
		}
	}

	void clearKeySessions();
	stopLspPolling();
	tabClaim?.release();
	tabClaim = null;
	endWalletSession();
	state.utexoWallet = null;
	if (typeof window !== 'undefined') {
		probeWindow().__utexoWallet = null;
		console.info('[wallet-init] cleared __utexoWallet from window');
	}
	clearRefreshTimers();
	stopContractRefresh();
	stopReceivePull();
	state.unsubscribeBlockWatch?.();
	state.unsubscribeBlockWatch = null;
	walletStore.set(structuredClone(initialState));
}

export const markExpectingInbound = (_ttlMs?: number) => {};

export const softCleanup = () => {};

export function getUtexoWallet() {
	if (typeof window === 'undefined') return null;
	const w = state?.utexoWallet || null;
	// Re-expose on window if we have a wallet but window doesn't have it
	if (w && !probeWindow().__utexoWallet) {
		probeWindow().__utexoWallet = w;
		console.info('[wallet-init] re-exposed __utexoWallet on window via getUtexoWallet');
	}
	return w;
}
