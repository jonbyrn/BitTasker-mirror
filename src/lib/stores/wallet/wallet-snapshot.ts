import { get } from 'svelte/store';
import { appStore } from '$lib/stores/app.store';
import {
	IndexedDbTimeoutError,
	idbRequest,
	openIndexedDb,
	withIndexedDb
} from '$lib/utils/helpers/indexed-db-open';
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

/** Show the last saved transfers when a reload has not listed any yet. */
export async function restoreKnownHistory(): Promise<void> {
	if (get(walletStore).transactions.length > 0) return;
	const saved = await readWalletSnapshot();
	if (!saved?.transactions?.length) return;
	walletStore.update((current) => {
		if (current.transactions.length > 0) return current;
		return { ...current, transactions: saved.transactions };
	});
}

/** Read the last saved balances. The locked screen does not apply this. */
export async function hydrateWalletSnapshot(): Promise<void> {
	let saved: WalletSnapshot | null = null;
	for (let attempt = 0; attempt < 2; attempt += 1) {
		try {
			saved = await readWalletSnapshot();
			break;
		} catch (error) {
			const timedOut = error instanceof IndexedDbTimeoutError;
			if (!timedOut || attempt === 1) {
				console.warn(
					'[wallet-init] snapshot skipped',
					error instanceof Error ? error.message : String(error)
				);
				return;
			}
			console.warn('[wallet-init] snapshot timed out, retrying');
		}
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
