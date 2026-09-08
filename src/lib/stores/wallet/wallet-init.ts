import { browser } from '$app/environment';
import { get } from 'svelte/store';
import { getMnemonic } from '$lib/utils/helpers/mnemonic';
import { walletStore, state, clearRefreshTimers } from './wallet-state';
import { initialState } from './wallet-types';
import type { RgbAsset } from './wallet-types';
import { unwrapListAssets } from './wallet-balances';
import { rgbConsignmentSubscription } from '$lib/services/rgb/consignment-subscription';

async function deriveUtexoWalletPassword(mnemonic: string): Promise<string> {
	const encoder = new TextEncoder();
	const data = encoder.encode(`bittasker-utexo-rgb-wallet:${mnemonic}`);
	const hashBuffer = await crypto.subtle.digest('SHA-256', data);
	const hashArray = Array.from(new Uint8Array(hashBuffer));
	return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function ensureWasmAssetAvailable(): Promise<void> {
	if (!browser || typeof fetch !== 'function') return;

	const assets = ['/wasm/rln_wasm_sdk_bg.wasm', '/wasm/rgb_lib_wasm_bindings_bg.wasm'];
	for (const asset of assets) {
		let response: Response;
		try {
			response = await fetch(asset, { method: 'HEAD' });
		} catch {
			response = await fetch(asset);
		}

		if (!response.ok) {
			response = await fetch(asset);
		}
		if (!response.ok) {
			throw new Error(`RGB WASM asset unavailable: ${asset} (HTTP ${response.status})`);
		}
	}
}

async function initializeRgbWallet(mnemonic: string): Promise<void> {
	if (!browser) return;
	const indexerUrl = import.meta.env.VITE_BITCOIN_ELECTRUM_URL as string | undefined;
	if (!indexerUrl) {
		walletStore.update((s) => ({
			...s,
			isInitializing: false,
			rgb: { ...s.rgb, initialized: false, error: 'Electrum missing' }
		}));
		throw new Error('Bitcoin Electrum indexer URL is not configured.');
	}

	try {
		await ensureWasmAssetAvailable();
		const rgbSdk = await import('@utexo/rgb-sdk-web');
		if (import.meta.env.DEV) {
			console.log('[DEBUG SDK] keys:', Object.keys(rgbSdk).filter((k) => k !== 'default'));
		}
		const Ctor =
			rgbSdk.UTEXOWallet ??
			(rgbSdk as { RgbWallet?: unknown }).RgbWallet ??
			(rgbSdk as { Wallet?: unknown }).Wallet;

		const create =
			typeof (Ctor as { create?: unknown })?.create === 'function'
				? (Ctor as { create: Function }).create.bind(Ctor)
				: typeof Ctor === 'function'
					? (args: unknown) => new (Ctor as new (a: unknown) => unknown)(args)
					: null;

		if (!create) {
			throw new Error(
				`UTEXOWallet export unavailable. keys=${Object.keys(rgbSdk)
					.filter((k) => k !== 'default')
					.join(', ')}`
			);
		}
		const network = (import.meta.env.VITE_BITCOIN_NETWORK || 'testnet') as
			| 'mainnet'
			| 'testnet'
			| 'regtest';
		const password = await deriveUtexoWalletPassword(mnemonic);

		const wallet = await create({
			mnemonic,
			password,
			network,
			indexerUrl,
			transportEndpoint:
				(import.meta.env.VITE_RGB_TRANSPORT_ENDPOINT as string | undefined) ??
				'https://rgb-proxy.utexo.com/json-rpc',
			proxyUrl:
				(import.meta.env.VITE_RGB_LN_PROXY_URL as string | undefined) ??
				'wss://ln-gateway-signet.utexo.com',
			vssUrl: (import.meta.env.VITE_UTEXO_VSS_URL as string | undefined) ?? null
		});
		state.utexoWallet = wallet;

		const address = await wallet.getAddress();
		const btcBalance = await wallet.getBtcBalance();
		const balanceSats = btcBalance.vanilla.spendable + btcBalance.colored.spendable;

		let rgbAssets: RgbAsset[] = [];
		try {
			const rawAssets = await wallet.listAssets();
			rgbAssets = unwrapListAssets(rawAssets).map((a) => ({
				assetId: a.id,
				name: a.name ?? 'RGB Asset',
				symbol: a.ticker,
				balance: Number(a.balance ?? 0),
				formattedBalance: String(a.balance ?? 0)
			}));
		} catch (err) {
			console.warn('[wallet-init] listAssets skipped or failed:', err);
		}

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
				usdt:
					rgbAssets.find(
						(a) => a.assetId === (import.meta.env.VITE_RGB_USDT_ASSET_ID as string | undefined)
					)?.balance ?? 0
			}
		}));
		if (browser) {
			void rgbConsignmentSubscription
				.start({
					onError: (error) => console.warn('[wallet-init] RGB consignment ignored:', error)
				})
				.catch((error) => console.warn('[wallet-init] RGB consignment startup ignored:', error));
		}
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
	const storeState = get(walletStore);
	if (storeState.isInitializing) return;

	walletStore.update((s) => ({ ...s, isInitializing: true, error: null }));

	if (state.utexoWallet && storeState.rgb?.initialized) {
		walletStore.update((s) => ({ ...s, isInitializing: false }));
		return;
	}

	try {
		const mnemonic = await getMnemonic();
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

