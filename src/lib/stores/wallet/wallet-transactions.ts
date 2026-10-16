import { walletHistoryRows } from '$lib/components/wallet/wallet-formatters';
import { escrowHistoryEntries } from './escrow-history';
import { walletStore } from './wallet-state';
import { state } from './wallet-state';
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

async function collectTransfers(wallet: {
	listAssets: () => Promise<unknown>;
	listTransfers: (assetId?: string) => Promise<unknown[]>;
}): Promise<unknown[]> {
	const listed = await wallet.listAssets().catch(() => null);
	const ids = rgbAssetIds(listed);
	if (ids.length === 0) {
		const fallback = await wallet.listTransfers().catch(() => []);
		return Array.isArray(fallback) ? fallback : [];
	}
	const batches = await Promise.all(ids.map((id) => wallet.listTransfers(id).catch(() => [])));
	return batches.flat();
}

export async function loadTransactions(): Promise<void> {
	const wallet = state.utexoWallet;
	if (!wallet) return;

	try {
		const [records, listed] = await Promise.all([
			wallet.listTransactions(),
			collectTransfers(wallet)
		]);
		const transactions: Transaction[] = [
			...walletHistoryRows(records, listed),
			...escrowHistoryEntries()
		];

		walletStore.update((current) => {
			const seen = new Set(transactions.map((row) => (row.txHash || row.id).toLowerCase()));
			const kept = current.transactions.filter((row) => {
				const id = (row.txHash || row.id).toLowerCase();
				return row.status === 'pending' && id.length > 0 && !seen.has(id);
			});
			const merged = [...kept, ...transactions].sort(
				(left, right) => right.timestamp - left.timestamp
			);
			return { ...current, transactions: merged };
		});
	} catch (error) {
		console.warn('[wallet-transactions] listTransactions skipped:', error);
	}
}
