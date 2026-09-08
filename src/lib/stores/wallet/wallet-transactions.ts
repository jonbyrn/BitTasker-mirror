import { walletStore } from './wallet-state';
import { state } from './wallet-state';
import type { Transaction } from './wallet-types';

export async function loadTransactions(): Promise<void> {
	const wallet = state.utexoWallet;
	if (!wallet) return;

	try {
		const records = await wallet.listTransactions();
		const transactions: Transaction[] = records
			.map((record) => {
				const incoming = record.received > 0 && record.sent === 0;
				const amountSats = Math.max(record.received, record.sent);
				const timestamp = record.confirmationTime?.timestamp
					? record.confirmationTime.timestamp * 1000
					: Date.now();
				return {
					id: record.txid,
					type: incoming ? 'receive' : 'send',
					amountSats,
					timestamp,
					status: record.confirmationTime ? 'confirmed' : 'pending',
					txHash: record.txid,
					description:
						record.transactionType === 'RgbSend'
							? 'RGB transfer'
							: record.transactionType === 'SendBtc'
								? 'Bitcoin transfer'
								: record.transactionType
				};
			})
			.sort((left, right) => right.timestamp - left.timestamp);

		walletStore.update((s) => ({ ...s, transactions }));
	} catch (error) {
		console.warn('[wallet-transactions] listTransactions skipped:', error);
	}
}
