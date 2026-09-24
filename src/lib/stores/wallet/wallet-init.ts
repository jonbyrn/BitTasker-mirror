import type { UTEXOWallet } from '@utexo/rgb-sdk-web';
import type { RgbAsset, WalletProbeWindow } from './wallet-types';
import { ContractRune } from '$lib/services/rgb/contract-rune';
import { browser } from '$app/environment';
import { get } from 'svelte/store';
import { getMnemonic } from '$lib/utils/helpers/mnemonic';
import { initWasm } from '$lib/wasm/init-wasm';
import { walletStore, state, clearRefreshTimers } from './wallet-state';
import { initialState } from './wallet-types';
import {
	installEsploraRetryFetch,
	isE2eWalletReset,
	loadAssets,
	scanBtcBalance,
	unwrapListAssets
} from './wallet-balances';
import { rgbConsignmentSubscription } from '$lib/services/rgb/consignment-subscription';
import { getConfiguredRgbUsdtAssetId } from '$lib/types/rgb-contract';
import { ensureRgbAllocations } from './rgb-allocations';

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
async function initializeRgbWallet(mnemonic: string): Promise<void> {
	if (!browser) return;

	// TEST: Explicit 3-phase lifecycle with network: 'utexo' + vssUrl: null
	// Tests if bypassing create() and using native preset avoids the vssUrl url-parse panic.
	const network = 'utexo' as const;

	try {
		await initWasm();
		installEsploraRetryFetch();

		// Import UTEXOWallet directly for explicit 3-phase lifecycle
		const { UTEXOWallet } = await import('@utexo/rgb-sdk-web');
		const password = await deriveUtexoWalletPassword(mnemonic);
		const e2eReset = isE2eWalletReset();

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

		const wallet = new UTEXOWallet({
			mnemonic,
			password,
			network: 'utexo',
			indexerUrl: 'https://esplora-api.utexo.com',
			transportEndpoint: 'https://rgb-proxy.utexo.com/json-rpc',
			proxyUrl: 'wss://ln-gateway-signet.utexo.com',
			vssUrl: '',
			enableVirtualChannels: false,
			...(e2eReset ? { dataDir: taskerDataDir } : {})
		});

		console.info('[wallet-diagnostic] Wallet constructed, calling init()...');
		try {
			await wallet.init();
			console.info('[wallet-diagnostic] init() succeeded, calling unlock()...');
			await wallet.unlock();
		} catch (connectError) {
			console.warn('[wallet-init] RLN handshake failed:', connectError);
			throw connectError;
		}

		console.info('[wallet-diagnostic] unlock() succeeded, wallet ready!');

		state.utexoWallet = wallet;
		if (typeof window !== 'undefined' && wallet) {
			probeWindow().__utexoWallet = wallet;
			console.info('[wallet-init] exposed __utexoWallet on window');
		}
		markWalletReady();

		try {
			await scanAndUpdateBalances(wallet, network);
		} catch (scanError) {
			console.warn('[wallet-init] balance scan deferred:', scanError);
		}

		try {
			await ensureRgbAllocations(wallet);
		} catch (allocationError) {
			console.warn('[wallet-init] RGB allocation setup skipped:', allocationError);
		}

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

async function scanAndUpdateBalances(wallet: UTEXOWallet, network: string): Promise<void> {
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

function markWalletReady(): void {
	walletStore.update((current) => ({
		...current,
		isConnected: true,
		isInitializing: false,
		error: null,
		rgb: {
			...current.rgb,
			initialized: true,
			error: null
		}
	}));
}

function updateWalletStore(address: string, balanceSats: number, rgbAssets: RgbAsset[]): void {
	const usdtAssetId = getConfiguredRgbUsdtAssetId();
	if (!usdtAssetId) {
		console.warn('[wallet-init] No active RGB_USDT_ASSET_ID');
	}
	const usdtBalance = usdtAssetId
		? (rgbAssets.find((asset) => asset.assetId === usdtAssetId)?.balance ?? 0)
		: 0;

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

	const probe = probeWindow();
	const isTestEnvironment =
		probe.__PLAYWRIGHT_TEST__ === true || import.meta.env.VITE_E2E_TURNSTILE_BYPASS === 'true';

	if (isTestEnvironment) {
		probe.__connectWallet = () => initialize();
	}

	const storeState = get(walletStore);
	if (storeState.isInitializing) return;

	walletStore.update((s) => ({ ...s, isInitializing: true, error: null }));

	if (state.utexoWallet) {
		walletStore.update((s) => ({ ...s, isInitializing: false, isConnected: true }));
		probeWindow().__utexoWallet = state.utexoWallet;
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
	if (typeof window !== 'undefined') {
		probeWindow().__utexoWallet = null;
		console.info('[wallet-init] cleared __utexoWallet from window');
	}
	clearRefreshTimers();
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
