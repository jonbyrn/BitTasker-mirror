import { get } from 'svelte/store';
import { appStore } from '$lib/stores/app.store';
import { idbRequest, openIndexedDb, withIndexedDb } from '$lib/utils/helpers/indexed-db-open';
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
	return openIndexedDb(DB_NAME, 1, (db) => {
		if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
	});
}

export async function saveWalletSnapshot(snapshot: WalletSnapshot, key = userKey()): Promise<void> {
	if (typeof indexedDB === 'undefined') return;
	await withIndexedDb(openDb(), (db) =>
		idbRequest(
			db.transaction(STORE, 'readwrite').objectStore(STORE).put(snapshot, key),
			'snapshot write'
		).then(() => undefined)
	);
}

export async function readWalletSnapshot(key = userKey()): Promise<WalletSnapshot | null> {
	if (typeof indexedDB === 'undefined') return null;
	return withIndexedDb(openDb(), async (db) => {
		const result = await idbRequest<WalletSnapshot | undefined>(
			db.transaction(STORE, 'readonly').objectStore(STORE).get(key),
			'snapshot read'
		);
		return result ?? null;
	});
}

/** Show the last good balances while the wallet is locked or still syncing. */
export async function hydrateWalletSnapshot(): Promise<void> {
	let saved: WalletSnapshot | null = null;
	try {
		saved = await readWalletSnapshot();
	} catch (error) {
		console.warn(
			'[wallet-init] snapshot skipped',
			error instanceof Error ? error.message : String(error)
		);
		return;
	}
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
