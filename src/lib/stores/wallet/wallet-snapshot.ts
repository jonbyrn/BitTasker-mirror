import { get } from 'svelte/store';
import {
	IndexedDbTimeoutError,
	idbRequest,
	openIndexedDb,
	withIndexedDb
} from '$lib/utils/helpers/indexed-db-open';
import { SHARED_SNAPSHOT_KEY, walletOwnerId } from './wallet-account';
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

function userKey(): string | null {
	return walletOwnerId();
}

function openDb(): Promise<IDBDatabase> {
	return openIndexedDb(DB_NAME, 1, (db) => {
		if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
	});
}

/** An empty reload must not erase transfers that were already saved. */
export function snapshotTransactions(
	next: readonly Transaction[],
	prior: readonly Transaction[] | undefined
): Transaction[] {
	if (next.length > 0) return [...next];
	return prior ? [...prior] : [];
}

export async function saveWalletSnapshot(
	snapshot: WalletSnapshot,
	key: string | null = userKey()
): Promise<void> {
	if (!key || typeof indexedDB === 'undefined') return;
	const prior = await readWalletSnapshot(key).catch(() => null);
	const stored: WalletSnapshot = {
		...snapshot,
		transactions: snapshotTransactions(snapshot.transactions, prior?.transactions)
	};
	await withIndexedDb(openDb(), (db) =>
		idbRequest(
			db.transaction(STORE, 'readwrite').objectStore(STORE).put(stored, key),
			'snapshot write'
		).then(() => undefined)
	);
}

export async function readWalletSnapshot(key: string | null = userKey()): Promise<WalletSnapshot | null> {
	if (!key || typeof indexedDB === 'undefined') return null;
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
	const live = get(walletStore).rgb.address;
	if (live && saved.address && live !== saved.address) return;
	walletStore.update((current) => {
		if (current.transactions.length > 0) return current;
		if (current.rgb.address && saved.address && current.rgb.address !== saved.address) return current;
		return { ...current, transactions: saved.transactions };
	});
}

/** Logout drops this pubkey's snapshot and the old shared `active` row. */
export async function clearWalletSnapshots(owner: string | null): Promise<void> {
	if (typeof indexedDB === 'undefined') return;
	const keys = [SHARED_SNAPSHOT_KEY, owner].filter((key): key is string => Boolean(key));
	try {
		await withIndexedDb(openDb(), async (db) => {
			const store = db.transaction(STORE, 'readwrite').objectStore(STORE);
			await Promise.all(keys.map((key) => idbRequest(store.delete(key), 'snapshot delete')));
		});
	} catch (error: unknown) {
		console.warn(
			'[wallet-snapshot] clear skipped',
			error instanceof Error ? error.message : String(error)
		);
	}
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
