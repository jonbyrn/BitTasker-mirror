import type { UTEXOWallet } from '@utexo/rgb-sdk-web';
import type { RgbAsset, WalletProbeWindow, WalletFactory } from './wallet-types';
import { browser } from '$app/environment';
import { get } from 'svelte/store';
import { getMnemonic } from '$lib/utils/helpers/mnemonic';
import { initWasm } from '$lib/wasm/init-wasm';
import { walletStore, state, clearRefreshTimers } from './wallet-state';
import { initialState } from './wallet-types';
import {
	clearRlnRuntime,
	installEsploraRetryFetch,
	loadAssets,
	scanBtcBalance,
	unwrapListAssets
} from './wallet-balances';
import { rgbConsignmentSubscription } from '$lib/services/rgb/consignment-subscription';

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

// RGB Wallet Factory
async function resolveWalletFactory(): Promise<WalletFactory> {
	const rgbSdk = await import('@utexo/rgb-sdk-web');
	console.info(
		'[wallet-diagnostic] SDK imported, keys:',
		Object.keys(rgbSdk).filter((k) => k !== 'default').length
	);

	const Ctor =
		rgbSdk.UTEXOWallet ??
		(rgbSdk as { RgbWallet?: unknown }).RgbWallet ??
		(rgbSdk as { Wallet?: unknown }).Wallet;

	if (typeof (Ctor as { create?: unknown })?.create === 'function') {
		return (Ctor as { create: WalletFactory }).create.bind(Ctor) as WalletFactory;
	}

	if (typeof Ctor === 'function') {
		return (args: Record<string, unknown>) =>
			new (Ctor as new (input: Record<string, unknown>) => UTEXOWallet)(args);
	}

	throw new Error(
		`UTEXOWallet export unavailable. keys=${Object.keys(rgbSdk)
			.filter((k) => k !== 'default')
			.join(', ')}`
	);
}

// Wallet initialization core logic
async function initializeRgbWallet(mnemonic: string): Promise<void> {
	if (!browser) return;

	// TEST: Explicit 3-phase lifecycle with network: 'utexo' + vssUrl: null
	// Tests if bypassing create() and using native preset avoids the vssUrl url-parse panic.
	const network = 'utexo' as const;






















	try {
		await initWasm();
		installEsploraRetryFetch();
		await clearRlnRuntime();

		// Import UTEXOWallet directly for explicit 3-phase lifecycle
		const { UTEXOWallet } = await import('@utexo/rgb-sdk-web');
		const password = await deriveUtexoWalletPassword(mnemonic);

		// Diagnostic logging (redacted - no mnemonic, xpub, fingerprint, or tokens)
		console.info('[wallet-diagnostic:init]', {
			network: 'utexo',
			sdk_version: RGB_SDK_VERSION,
			method: 'explicit-3phase-lifecycle'
		});

		// RGB wallet configuration with all required endpoints
				const wallet = new UTEXOWallet({
					mnemonic,
					password,
					network: 'utexo',
					transportEndpoint: 'https://rgb-proxy.utexo.com/json-rpc',
					proxyUrl: 'wss://ln-gateway-signet.utexo.com',
					vssUrl: '',
					enableVirtualChannels: false
				});

		console.info('[wallet-diagnostic] Wallet constructed, calling init()...');
		await wallet.init();   // Phase 1: Loads WASM, derives keys

		console.info('[wallet-diagnostic] init() succeeded, calling unlock()...');
		await wallet.unlock(); // Phase 2: Unlocks local storage

		console.info('[wallet-diagnostic] unlock() succeeded, wallet ready!');

		state.utexoWallet = wallet;

		// Scan and update balances
		await scanAndUpdateBalances(wallet, network);

		// Start RGB consignment subscription
		startConsignmentSubscription();

	} catch (err) {
		console.warn('[wallet-init] RGB wallet init failed:', err);
		walletStore.update((s) => ({
			...s,
			isInitializing: false,
			rgb: { ...s.rgb, initialized: false, error: 'Init failed' }
		}));
		throw err;
	}
}

// tryIndexers removed — wallet creation now uses hardcoded testnet config directly in initializeRgbWallet

async function scanAndUpdateBalances(
	wallet: UTEXOWallet,
	network: string
): Promise<void> {
	const scanned = await scanBtcBalance(wallet);
	const { address, balanceSats, utxoCount } = scanned;

	// Diagnostic logging (redacted - no sensitive data)
	console.info('[wallet-diagnostic:ready]', {
		network,
		hasAddress: !!address,
		balanceSats,
		utxoCount
	});

	updateProbeWindow(address, balanceSats, utxoCount, wallet);
	const rgbAssets = await loadRgbAssets(wallet);
	updateWalletStore(address, balanceSats, rgbAssets);
}

function updateProbeWindow(
	address: string,
	balanceSats: number,
	utxoCount: number,
	wallet: UTEXOWallet
): void {
	if (!browser) return;

	const probeWindow = window as WalletProbeWindow;
	const isTestEnvironment =
		probeWindow.__PLAYWRIGHT_TEST__ === true ||
		import.meta.env.VITE_E2E_TURNSTILE_BYPASS === 'true';

	if (isTestEnvironment) {
		probeWindow.__btcAddress = address;
		probeWindow.__btcBalanceSats = balanceSats;
		probeWindow.__btcUtxoCount = utxoCount;
		probeWindow.__btcWalletSynced = true;
		probeWindow.__refreshBtcBalance = () => loadAssets();
		probeWindow.__sendBtc = (params) =>
			wallet.sendBtc({
				address: params.address,
				amount: params.amountSats,
				feeRate: params.feeRate ?? 1
			});
	}
}

async function loadRgbAssets(wallet: UTEXOWallet): Promise<RgbAsset[]> {
	try {
		const rawAssets = await wallet.listAssets();
		return unwrapListAssets(rawAssets).map((a) => ({
			assetId: a.id,
			name: a.name ?? 'RGB Asset',
			symbol: a.ticker,
			balance: Number(a.balance ?? 0),
			formattedBalance: String(a.balance ?? 0)
		}));
	} catch (err) {
		console.warn('[wallet-init] listAssets skipped or failed:', err);
		return [];
	}
}

function updateWalletStore(address: string, balanceSats: number, rgbAssets: RgbAsset[]): void {
	const usdtAssetId = import.meta.env.VITE_RGB_USDT_ASSET_ID as string | undefined;
	const usdtBalance = rgbAssets.find((a) => a.assetId === usdtAssetId)?.balance ?? 0;

	walletStore.update((s) => ({
		...s,
		isConnected: true,
		isInitializing: false,
		error: null,
		rgb: {
			initialized: true,
			error: null,
			address,
			balanceSats,
			formattedBalance: (balanceSats / 1e8).toFixed(8),
			assets: rgbAssets
		},
		wdk: {
			...s.wdk,
			initialized: true,
			error: null,
			btcOnchain: { address, balanceSats, formattedBalance: (balanceSats / 1e8).toFixed(8) }
		},
		totalBalances: {
			...s.totalBalances,
			sats: balanceSats,
			usdt: usdtBalance
		}
	}));
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

export async function initialize(): Promise<void> {
	if (!browser) return;

	const probeWindow = window as WalletProbeWindow;
	const isTestEnvironment =
		probeWindow.__PLAYWRIGHT_TEST__ === true ||
		import.meta.env.VITE_E2E_TURNSTILE_BYPASS === 'true';

	if (isTestEnvironment) {
		probeWindow.__connectWallet = () => initialize();
	}

	const storeState = get(walletStore);
	if (storeState.isInitializing) return;

	walletStore.update((s) => ({ ...s, isInitializing: true, error: null }));

	if (state.utexoWallet && storeState.rgb?.initialized) {
		walletStore.update((s) => ({ ...s, isInitializing: false }));
		return;
	}

	try {
		await initWasm();
		const mnemonic = await getMnemonic();

		// Diagnostic logging (redacted - no mnemonic data)
		console.info('[wallet-diagnostic:mnemonic]', {
			wordCount: mnemonic.trim().split(/\s+/).length
		});

		let lastError: unknown;

		for (let attempt = 0; attempt < 2; attempt += 1) {
			try {
				await initializeRgbWallet(mnemonic);
				return;
			} catch (error) {
				lastError = error;
				if (!isWasmGlobalError(error) || attempt === 1) break;
				await waitForWasmGlobals();
			}
		}

		console.warn('[wallet-init] Wallet initialization unavailable:', lastError);
		walletStore.update((s) => ({
			...s,
			isInitializing: false,
			error: lastError instanceof Error ? lastError.message : 'Failed to initialize wallet'
		}));
	} catch (error) {
		console.warn('[wallet-init] Wallet initialization setup failed:', error);
		walletStore.update((s) => ({
			...s,
			isInitializing: false,
			error: error instanceof Error ? error.message : 'Failed to initialize wallet'
		}));
	}
}

export function disconnectWallet(): void {
	rgbConsignmentSubscription.stop();

	if (state.utexoWallet && typeof state.utexoWallet.dispose === 'function') {
		try {
			void state.utexoWallet.dispose();
		} catch (error) {
			console.warn('[wallet-init] Wallet dispose failed:', error);
		}
	}

	state.utexoWallet = null;
	clearRefreshTimers();
	state.unsubscribeBlockWatch?.();
	state.unsubscribeBlockWatch = null;
	walletStore.set(structuredClone(initialState));
}

export const markExpectingInbound = (_ttlMs?: number) => {};

export const softCleanup = () => {};

export function getUtexoWallet() {
	if (typeof window === 'undefined') return null;
	return state?.utexoWallet || null;
}