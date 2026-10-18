import { walletHistoryRows } from '$lib/components/wallet/wallet-formatters';
import { escrowHistoryEntries } from './escrow-history';
import { isUsdtHistory } from './plain-wallet';
import { walletStore } from './wallet-state';
import { state } from './wallet-state';
import { restoreKnownHistory } from './wallet-snapshot';
import type { Transaction } from './wallet-types';

function rgbAssetIds(raw: unknown): string[] {
	if (!raw || typeof raw !== 'object') return [];
	const record = raw as Record<string, unknown>;
	const ids: string[] = [];
	for (const group of ['nia', 'ifa', 'cfa', 'uda'] as const) {
		const rows = record[group];
		if (!Array.isArray(rows)) continue;
		for (const row of rows) {
			if (!row || typeof row !== 'object') continue;
			const asset = row as { assetId?: unknown; id?: unknown };
			const id = asset.assetId ?? asset.id;
			if (typeof id === 'string' && id.length > 0) ids.push(id);
		}
	}
	return ids;
}

function transferIdentity(row: unknown): string {
	if (!row || typeof row !== 'object') return '';
	const item = row as {
		kind?: unknown;
		status?: unknown;
		txid?: unknown;
		batchTransferIdx?: unknown;
	};
	const kind = typeof item.kind === 'string' ? item.kind : '';
	const status = typeof item.status === 'string' ? item.status : '';
	const txid = typeof item.txid === 'string' ? item.txid : '';
	const batch = typeof item.batchTransferIdx === 'number' ? String(item.batchTransferIdx) : '';
	return `${kind}|${status}|${txid}|${batch}`;
}

async function collectTransfers(wallet: {
	listAssets: () => Promise<unknown>;
	listTransfers: (assetId?: string) => Promise<unknown[]>;
}): Promise<unknown[]> {
	const listed = await wallet.listAssets().catch(() => null);
	const ids = rgbAssetIds(listed);
	const rows: unknown[] = [];
	const seen = new Set<string>();
	const add = (batch: unknown): void => {
		if (!Array.isArray(batch)) return;
		for (const row of batch) {
			const key = transferIdentity(row);
			if (key && seen.has(key)) continue;
			if (key) seen.add(key);
			rows.push(row);
		}
	};
	add(await wallet.listTransfers().catch(() => []));
	for (const id of ids) {
		add(await wallet.listTransfers(id).catch(() => []));
	}
	return rows;
}

const SENT_USDT_KEY = 'bittasker.usdt-sends';

function isTransaction(value: unknown): value is Transaction {
	if (!value || typeof value !== 'object') return false;
	const row = value as Partial<Transaction>;
	return typeof row.txHash === 'string' && /^[0-9a-f]{64}$/i.test(row.txHash);
}

/** USDT sends the wallet broadcast, kept across a reload. */
export function rememberedUsdtSends(): Transaction[] {
	if (typeof localStorage === 'undefined') return [];
	try {
		const parsed: unknown = JSON.parse(localStorage.getItem(SENT_USDT_KEY) ?? '[]');
		if (!Array.isArray(parsed)) return [];
		return parsed.filter(isTransaction).slice(0, 20);
	} catch {
		return [];
	}
}

export function rememberUsdtSend(row: Transaction): void {
	if (typeof localStorage === 'undefined' || !row.txHash) return;
	const next = [row, ...rememberedUsdtSends().filter((item) => item.txHash !== row.txHash)].slice(
		0,
		20
	);
	try {
		localStorage.setItem(SENT_USDT_KEY, JSON.stringify(next));
	} catch (error: unknown) {
		console.warn(
			'[wallet-transactions] could not store the send',
			error instanceof Error ? error.message : String(error)
		);
	}
}

/** Keep a pending USDT send when the reload only has its Bitcoin anchor. */
export function mergeHistory(
	current: readonly Transaction[],
	next: readonly Transaction[]
): Transaction[] {
	if (next.length === 0) {
		return [...current].sort((left, right) => right.timestamp - left.timestamp);
	}
	const seen = new Set(next.map((row) => (row.txHash || row.id).toLowerCase()));
	const usdtSeen = new Set(
		next
			.filter((row) => isUsdtHistory(row.description, row.assetUnits))
			.map((row) => (row.txHash || row.id).toLowerCase())
	);
	const kept = current.filter((row) => {
		if (row.status !== 'pending') return false;
		const id = (row.txHash || row.id).toLowerCase();
		if (!id) return false;
		if (isUsdtHistory(row.description, row.assetUnits)) return !usdtSeen.has(id);
		return !seen.has(id);
	});
	return [...kept, ...next].sort((left, right) => right.timestamp - left.timestamp);
}

export async function loadTransactions(): Promise<void> {
	const wallet = state.utexoWallet;
	if (!wallet) return;
	await restoreKnownHistory().catch((error: unknown) => {
		console.warn(
			'[wallet-transactions] history restore skipped',
			error instanceof Error ? error.message : String(error)
		);
	});

	try {
		const [records, listed] = await Promise.all([
			wallet.listTransactions(),
			collectTransfers(wallet)
		]);
		const transactions: Transaction[] = [
			...walletHistoryRows(records, listed),
			...escrowHistoryEntries()
		];

		walletStore.update((current) => ({
			...current,
			transactions: mergeHistory([...rememberedUsdtSends(), ...current.transactions], transactions)
		}));
	} catch (error) {
		console.warn('[wallet-transactions] listTransactions skipped:', error);
	}
}
