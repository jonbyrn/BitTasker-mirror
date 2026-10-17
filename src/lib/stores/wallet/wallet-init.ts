import type { UTEXOWallet } from '@utexo/rgb-sdk-web';
import type { RgbAsset, WalletProbeWindow } from './wallet-types';
import { ContractRune } from '$lib/runes/contract.svelte';
import { browser } from '$app/environment';
import { get } from 'svelte/store';
import { getMnemonic } from '$lib/utils/helpers/mnemonic';
import { clearMnemonicSession, readMnemonicSession } from '$lib/utils/helpers/session-mnemonic';
import { initWasm } from '$lib/wasm/init-wasm';
import { walletStore, state, clearRefreshTimers } from './wallet-state';
import { initialState } from './wallet-types';
import {
	installEsploraRetryFetch,
	isE2eWalletReset,
	fillUsdtBalance,
	installPersistHooks,
	loadAssets,
	restoreOnUnlock,
	rgbDatabasePresent,
	scheduleRgbRefresh,
	stopContractRefresh,
	scanBtcBalance,
	parseRgbAssets
} from './wallet-balances';
import { loadTransactions } from './wallet-transactions';
import { rgbConsignmentSubscription } from '$lib/services/rgb/consignment-subscription';
import { getConfiguredRgbUsdtAssetId } from '$lib/types/rgb-contract';
import { ensureRgbAllocations } from './rgb-allocations';
import { discoverSignetLsp, signetLspParams, stopLspPolling } from './signet-lsp';
import { rgbWalletConfig } from './rgb-wallet-config';
import { shareInit } from './init-gate';
import { applyBalanceUpdate } from './balance-merge';
import { hydrateWalletSnapshot, saveWalletSnapshot } from './wallet-snapshot';
import {
	WASM_CRASH_MESSAGE,
	installWasmPanicListener,
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

// Constants
const RGB_SDK_VERSION = '@utexo/rgb-sdk-web@1.0.0-beta.12' as const;

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

		const databasePresent = await rgbDatabasePresent();
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
		await withWasm('restore', () => restoreOnUnlock(wallet, databasePresent));

		state.utexoWallet = wallet;
		installPersistHooks();
		if (typeof window !== 'undefined' && wallet) {
			probeWindow().__utexoWallet = wallet;
			console.info('[wallet-init] exposed __utexoWallet on window');
		}
		walletStore.update((current) => ({
			...current,
			locked: false,
			syncing: true,
			isConnected: true,
			error: null
		}));

		let scanFailed = false;
		await withWasm('on-chain-setup', async () => {
			await wallet.refreshWallet();
			try {
				await scanAndUpdateBalances(wallet, network);
				markWalletReady();
			} catch (scanError) {
				scanFailed = true;
				console.warn('[wallet-init] balance scan deferred:', scanError);
			}
			try {
				await ensureRgbAllocations(wallet);
			} catch (error: unknown) {
				console.warn('[wallet-init] RGB allocation setup skipped', error);
			}
		});
		if (scanFailed) void retryScan(wallet, network);
		await attachLightning(wallet);
		await startNodeChainSync(wallet);
		await loadTransactions().catch((error: unknown) => {
			console.warn('[wallet-init] transaction load skipped', error);
		});
		if (!skipLsp) {
			await discoverSignetLsp(wallet).catch((error: unknown) => {
				console.warn('[wallet-init] LSP discovery skipped', error);
			});
		}
		scheduleRgbRefresh(wallet);
		startConsignmentSubscription();
	} catch (err) {
		console.warn('[wallet-init] RGB wallet init failed:', err);
		if (isWasmPanic(err)) markWasmCrashed();
		walletStore.update((s) => ({
			...s,
			isInitializing: false,
			syncing: false,
			error: initInvoked || wasmCrashed() ? WASM_CRASH_MESSAGE : s.error,
			rgb: {
				...s.rgb,
				initialized: false,
				error: initInvoked || wasmCrashed() ? WASM_CRASH_MESSAGE : 'Init failed'
			}
		}));
		throw err;
	}
}

function armWasmPanicHooks(): void {
	installWasmPanicListener();
	if (panicHooksReady) return;
	panicHooksReady = true;
	onWasmCrash(() => {
		clearRefreshTimers();
		stopContractRefresh();
		stopLspPolling();
		walletStore.update((current) => ({
			...current,
			isInitializing: false,
			syncing: false,
			error: WASM_CRASH_MESSAGE
		}));
	});
}

async function attachLightning(wallet: LightningRuntime): Promise<void> {
	if (typeof wallet.attachLightningNode !== 'function') return;
	await wallet.attachLightningNode();
}

async function startNodeChainSync(wallet: LightningRuntime): Promise<void> {
	if (nodeChainSyncStarted || typeof wallet.startNodeChainSync !== 'function') return;
	nodeChainSyncStarted = true;
	await wallet.startNodeChainSync();
}

async function retryScan(wallet: UTEXOWallet, network: string): Promise<void> {
	for (let attempt = 0; attempt < 4; attempt += 1) {
		await new Promise((resolve) => setTimeout(resolve, Math.min(30_000, 2_000 * 2 ** attempt)));
		if (wasmCrashed()) return;
		if (wasmBusy()) continue;
		try {
			await withWasm('retry-scan', () => scanAndUpdateBalances(wallet, network));
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
	return fillUsdtBalance(wallet, parseRgbAssets(rawAssets));
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
		const nextSats = merged.balanceSats;
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

async function runInitialize(options?: { skipLsp?: boolean }): Promise<void> {
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
	await hydrateWalletSnapshot();
	const mnemonic = await readMnemonicSession();
	if (!mnemonic) {
		walletStore.update((current) => ({
			...current,
			isInitializing: false,
			locked: true,
			syncing: false
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
	const reload = initInvoked || wasmCrashed();
	const message = reload
		? WASM_CRASH_MESSAGE
		: lastError instanceof Error
			? lastError.message
			: 'Failed to initialize wallet';
	console.warn('[wallet-init] Wallet initialization unavailable:', lastError);
	walletStore.update((current) => ({
		...current,
		isInitializing: false,
		syncing: false,
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

/** WebAuthn runs only from this click. A cached session skips the prompt. */
export async function unlockWallet(signal?: AbortSignal): Promise<void> {
	await getMnemonic({ signal });
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

	void clearMnemonicSession();
	stopLspPolling();
	state.utexoWallet = null;
	if (typeof window !== 'undefined') {
		probeWindow().__utexoWallet = null;
		console.info('[wallet-init] cleared __utexoWallet from window');
	}
	clearRefreshTimers();
	stopContractRefresh();
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
