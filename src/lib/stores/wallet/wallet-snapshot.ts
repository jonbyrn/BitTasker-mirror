import { get } from 'svelte/store';
import { appStore } from '$lib/stores/app.store';
import { walletStore } from './wallet-state';
import type { RgbAsset, Transaction } from './wallet-types';

const DB_NAME = 'bittasker-wallet-snapshot';
const STORE = 'rows';

export interface WalletSnapshot {
	address: string | null;
	balanceSats: number;
	formattedBalance: string;
	usdt: number;
	assets: RgbAsset[];
	transactions: Transaction[];
}

function userKey(): string {
	return get(appStore).biometricData?.npub || 'active';
}

function openDb(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const request = indexedDB.open(DB_NAME, 1);
		request.onupgradeneeded = () => {
			if (!request.result.objectStoreNames.contains(STORE)) {
				request.result.createObjectStore(STORE);
			}
		};
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error ?? new Error('snapshot db failed'));
	});
}

export async function saveWalletSnapshot(snapshot: WalletSnapshot, key = userKey()): Promise<void> {
	if (typeof indexedDB === 'undefined') return;
	const db = await openDb();
	await new Promise<void>((resolve, reject) => {
		const request = db.transaction(STORE, 'readwrite').objectStore(STORE).put(snapshot, key);
		request.onsuccess = () => resolve();
		request.onerror = () => reject(request.error ?? new Error('snapshot write failed'));
	});
}

export async function readWalletSnapshot(key = userKey()): Promise<WalletSnapshot | null> {
	if (typeof indexedDB === 'undefined') return null;
	const db = await openDb();
	return new Promise((resolve, reject) => {
		const request = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
		request.onsuccess = () => resolve((request.result as WalletSnapshot | undefined) ?? null);
		request.onerror = () => reject(request.error ?? new Error('snapshot read failed'));
	});
}

/** Show the last good balances while the wallet is locked or still syncing. */
export async function hydrateWalletSnapshot(): Promise<void> {
	const saved = await readWalletSnapshot().catch(() => null);
	if (!saved) return;
	walletStore.update((current) => ({
		...current,
		rgb: {
			...current.rgb,
			address: saved.address,
			balanceSats: saved.balanceSats,
			formattedBalance: saved.formattedBalance,
			assets: saved.assets
		},
		totalBalances: {
			...current.totalBalances,
			sats: saved.balanceSats,
			usdt: saved.usdt
		},
		transactions: saved.transactions
	}));
}
