import { walletStore } from './wallet-state';

export async function loadTransactions(): Promise<void> {
// Transaction history for UTEXOWallet Lightning & RGB operations
walletStore.update((s) => ({ ...s, transactions: [] }));
}
