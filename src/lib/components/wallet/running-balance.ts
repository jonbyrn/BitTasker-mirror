/**
 * Running balance computation for connected wallet transactions.
 *
 * Pure function — takes transactions and current balances, returns the
 * same transactions with `balanceAfter` populated. No store or side-effect
 * dependencies.
 */

import type { ConnectedTransaction } from '$lib/services/connected-wallet-transactions';

/** Minimal balance shape needed for running balance computation. */
export interface WalletBalances {
	rbtc?: string;
	btc?: string;
	wbtc?: string;
}

/**
 * Compute running BTC balances working backwards from current wallet totals.
 *
 * Transactions must be sorted newest-first (as returned by the fetcher).
 * For each transaction, the current running balance is stored as `balanceAfter`,
 * then adjusted based on the transaction type and status:
 * - Successful receive: subtract value (it arrived, so before it arrived the balance was lower)
 * - Failed receive: no adjustment (never arrived)
 * - Successful send: add value + fee (before the send, balance was higher)
 * - Failed send: add fee only (value wasn't spent, but gas was consumed)
 *
 * ERC-20 token transfers on Arbitrum do NOT affect the BTC running balance.
 *
 * @param txs - Transactions sorted newest-first
 * @param walletBalances - Map of wallet ID to their current raw balance values
 * @returns The same array with `balanceAfter` populated on each transaction
 */
export function computeRunningBalances(
	txs: ConnectedTransaction[],
	walletBalances: Record<string, WalletBalances>
): ConnectedTransaction[] {
	if (txs.length === 0) return txs;

	// Aggregate current BTC sats across all wallets
	let currentBtcSats = 0;
	for (const balances of Object.values(walletBalances)) {
		currentBtcSats += Number(balances.rbtc ?? 0);
		currentBtcSats += Number(balances.btc ?? 0);
		currentBtcSats += Number(balances.wbtc ?? 0);
	}

	// Work backwards: for each tx (newest first), store current balance, then adjust
	let runningBtc = currentBtcSats;

	for (const tx of txs) {
		const isFailed = tx.status === 'failed';

		if (tx.network === 'rsk') {
			// RSK = Bitcoin (rBTC)
			tx.balanceAfter = runningBtc;
			if (tx.type === 'receive') {
				if (!isFailed) runningBtc -= tx.valueSats;
			} else {
				runningBtc += isFailed ? tx.feeSats : tx.valueSats + tx.feeSats;
			}
		} else if (tx.tokenSymbol) {
			// Arbitrum ERC-20 token transfer — doesn't affect BTC running balance
			tx.balanceAfter = runningBtc;
		} else {
			// Arbitrum native transfer — contributes to BTC running balance
			tx.balanceAfter = runningBtc;
			if (tx.type === 'receive') {
				if (!isFailed) runningBtc -= tx.valueSats;
			} else {
				runningBtc += isFailed ? tx.feeSats : tx.valueSats + tx.feeSats;
			}
		}
	}

	return txs;
}
