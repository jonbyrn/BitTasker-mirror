import { walletStore, state } from './wallet-state';
import type { RgbAsset } from './wallet-types';

interface RawRgbAsset {
	id: string;
	name?: string;
	balance?: string | number;
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
		const btcBalance = await wallet.getBtcBalance();
		const balanceSats = btcBalance.vanilla.spendable + btcBalance.colored.spendable;
		const address = await wallet.getAddress();

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

		walletStore.update((s) => ({
			...s,
			rgb: {
				...s.rgb,
				address,
				balanceSats,
				formattedBalance: (balanceSats / 1e8).toFixed(8),
				assets: rgbAssets
			},
			totalBalances: {
				...s.totalBalances,
				sats: balanceSats,
				usdt: rgbAssets.find((a) => a.assetId === 'usdt_rgb')?.balance ?? 0
			}
		}));
	} catch (err) {
		console.error('[wallet-balances] Error loading assets:', err);
	}
}

import { readable as __readable } from 'svelte/store';
export const allAssets = __readable([]);
export const totalBalances = __readable({ btcSats: 0, usd: 0 });
