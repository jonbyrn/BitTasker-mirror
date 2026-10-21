import { formatUsdtBalance } from '$lib/types/rgb-contract';
import { formatUsd, isUsdtHistory, usdFromSats } from '$lib/stores/wallet/plain-wallet';
import {
	formatRelativeTime,
	historyIdentity,
	signetTxUrl,
	uniqueHistory
} from './wallet-formatters';

export interface TransactionListInput {
	id: string;
	type: string;
	amountSats: number;
	assetUnits?: number;
	timestamp: number;
	txHash?: string;
	description?: string;
	status?: 'pending' | 'confirmed' | 'failed';
}

export interface TransactionListRow {
	key: string;
	asset: 'USDT' | 'BTC';
	direction: 'sent' | 'received';
	primary: string;
	secondary: string;
	when: string;
	txid: string | null;
	explorerUrl: string | null;
	timestamp: number;
	status: 'pending' | 'confirmed' | 'failed' | null;
	/** Escrow rows use this sentence instead of Sent or Received. */
	detail: string;
}

function incoming(type: string): boolean {
	return type === 'receive' || type === 'escrow_release';
}

/** One date-sorted list. Dollars are the main figure. Sats or USDT sit underneath. */
export function mergedTransactionRows(
	transactions: readonly TransactionListInput[],
	options: {
		btcUsd: number | null;
		now: number;
		locale: string;
		satsWord: string;
		unavailable: string;
	}
): TransactionListRow[] {
	return uniqueHistory(transactions)
		.slice()
		.sort((left, right) => right.timestamp - left.timestamp)
		.map((row) => {
			const usdt = isUsdtHistory(row.description, row.assetUnits);
			const units =
				typeof row.assetUnits === 'number' && Number.isFinite(row.assetUnits) ? row.assetUnits : 0;
			const sats = Number.isFinite(row.amountSats) ? Math.max(0, Math.trunc(row.amountSats)) : 0;
			const explorerUrl = signetTxUrl(row.txHash);
			const txid = explorerUrl ? (row.txHash ?? '').trim().toLowerCase() : null;
			const dollars = usdt
				? units / 1_000_000
				: options.btcUsd == null
					? null
					: usdFromSats(sats, options.btcUsd);
			return {
				key: historyIdentity(row),
				asset: usdt ? 'USDT' : 'BTC',
				direction: incoming(row.type) ? 'received' : 'sent',
				primary: dollars == null ? options.unavailable : formatUsd(dollars),
				secondary: usdt
					? `${formatUsdtBalance(units, 6)} USDT`
					: `${new Intl.NumberFormat(options.locale || 'en').format(sats)} ${options.satsWord}`,
				when: formatRelativeTime(row.timestamp, options.now, options.locale),
				txid,
				explorerUrl,
				timestamp: row.timestamp,
				status: row.status ?? null,
				detail: row.type.startsWith('escrow_') ? (row.description ?? '').trim() : ''
			};
		});
}
