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

async function initializeRgbWallet(mnemonic: string): Promise<void> {
	const indexerUrl = import.meta.env.VITE_BITCOIN_ELECTRUM_URL as string | undefined;
	if (!indexerUrl) {
		walletStore.update((s) => ({
			...s,
			rgb: { ...s.rgb, initialized: false, error: 'Electrum missing' }
		}));
		return;
	}

	try {
		const { UTEXOWallet } = await import('@utexo/rgb-sdk-web');
		const network = (import.meta.env.VITE_BITCOIN_NETWORK || 'testnet') as
			| 'mainnet'
			| 'testnet'
			| 'regtest';
		const password = await deriveUtexoWalletPassword(mnemonic);

		const wallet = await UTEXOWallet.create({
			mnemonic,
			password,
			network,
			indexerUrl
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
				usdt: rgbAssets.find((a) => a.assetId === 'usdt_rgb')?.balance ?? 0
			}
		}));
		if (browser) {
			void rgbConsignmentSubscription.start({
				onError: (error) => console.warn('[wallet-init] RGB consignment ignored:', error)
			});
		}
	} catch (err) {
		console.warn('[wallet-init] RGB wallet init failed:', err);
		walletStore.update((s) => ({
			...s,
			isInitializing: false,
			rgb: { ...s.rgb, initialized: false, error: 'Init failed' }
		}));
	}
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
	const storeState = get(walletStore);
	if (storeState.isInitializing) return;

	walletStore.update((s) => ({ ...s, isInitializing: true, error: null }));

	try {
		if (state.utexoWallet && storeState.rgb?.initialized) {
			walletStore.update((s) => ({ ...s, isInitializing: false }));
			return;
		}

		const mnemonic = await getMnemonic();
		await initializeRgbWallet(mnemonic);
	} catch (error) {
		walletStore.update((s) => ({
			...s,
			isInitializing: false,
			error: 'Failed to initialize wallet'
		}));
		throw error;
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

export const getRSKAddress = async (): Promise<string> => {
	console.warn('[wallet-init] getRSKAddress() is deprecated. Use getRgbAddress().');
	return getRgbAddress();
};
