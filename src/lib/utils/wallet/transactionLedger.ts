/**
 * Transaction ledger projector — merge, dedup, unified running balance.
 */

import type { ProcessedTransaction } from '$lib/types/wallet';
import { isSwapCompleted } from '$lib/utils/wallet/swapStatusMap';

const REVERSE_CLAIM_PAIR_WINDOW_MS = 15 * 60 * 1000;

function claimPreimage(tx: ProcessedTransaction): string | null {
	if (tx.displayType !== 'swap-claim') return null;
	const decoded = tx.decodedInput as Record<string, unknown> | undefined;
	const params = decoded?.parameters as Array<{ name?: string; value?: string }> | undefined;
	if (!params) return null;
	const preimage = params.find((p) => p.name === 'preimage');
	return preimage?.value ?? null;
}

function isFailedChainTx(tx: ProcessedTransaction): boolean {
	const label = tx.status?.label;
	return (
		label === 'wallet.transaction.status.failed' || label === 'wallet.transaction.status.error'
	);
}

function isSuccessChainTx(tx: ProcessedTransaction): boolean {
	return tx.status?.label === 'wallet.transaction.status.confirmed';
}

function isMinerFeeClaim(tx: ProcessedTransaction): boolean {
	const method = tx.methodName?.toLowerCase() ?? '';
	const decoded = tx.decodedInput as Record<string, unknown> | undefined;
	const methodCall =
		typeof decoded?.method_call === 'string' ? decoded.method_call.toLowerCase() : '';
	return method.includes('claimminerfee') || methodCall.includes('claimminerfee');
}

/** Hide reverted claim attempts when a successful claim exists for the same preimage. */
export function dedupChainClaims(txs: ProcessedTransaction[]): ProcessedTransaction[] {
	const successPreimages = new Set<string>();
	for (const tx of txs) {
		if (tx.displayType !== 'swap-claim') continue;
		if (!isSuccessChainTx(tx)) continue;
		const preimage = claimPreimage(tx);
		if (preimage) successPreimages.add(preimage);
	}

	if (successPreimages.size === 0) return txs;

	return txs.filter((tx) => {
		if (tx.displayType !== 'swap-claim') return true;
		if (!isFailedChainTx(tx)) return true;
		const preimage = claimPreimage(tx);
		if (!preimage) return true;
		return !successPreimages.has(preimage);
	});
}

/** Hide Boltz claimMinerFee rows — net receive is shown on the main claim tx. */
export function filterMinerFeeClaims(txs: ProcessedTransaction[]): ProcessedTransaction[] {
	return txs.filter((tx) => !isMinerFeeClaim(tx));
}

/**
 * When Blockscout labels miner-fee claims as plain `claim` or `receive`, drop
 * the smaller confirmed incoming tx if another larger one lands within 15 minutes.
 */
export function dedupePairedReverseClaims(txs: ProcessedTransaction[]): ProcessedTransaction[] {
	const claims = txs.filter(
		(tx) =>
			(tx.displayType === 'swap-claim' || tx.displayType === 'receive') &&
			isSuccessChainTx(tx) &&
			Number(tx.value) > 0
	);
	if (claims.length < 2) return txs;

	const sorted = [...claims].sort(
		(a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
	);
	const dropHashes = new Set<string>();

	for (let i = 0; i < sorted.length; i++) {
		if (dropHashes.has(sorted[i].hash)) continue;

		const group: ProcessedTransaction[] = [sorted[i]];
		const anchorTime = new Date(sorted[i].timestamp).getTime();

		for (let j = i + 1; j < sorted.length; j++) {
			const delta = new Date(sorted[j].timestamp).getTime() - anchorTime;
			if (delta > REVERSE_CLAIM_PAIR_WINDOW_MS) break;
			group.push(sorted[j]);
		}

		if (group.length < 2) continue;

		const primary = group.reduce((best, tx) => (Number(tx.value) > Number(best.value) ? tx : best));
		const primaryVal = Number(primary.value);

		for (const tx of group) {
			if (tx.hash === primary.hash) continue;
			const val = Number(tx.value);
			if (val < 1000 && val < primaryVal * 0.25) {
				dropHashes.add(tx.hash);
			}
		}
	}

	return txs.filter((tx) => !dropHashes.has(tx.hash));
}

/** At most one swap row per swapId; drop swaps whose hash exists on-chain. */
export function dedupSwapRows(
	swapTxs: ProcessedTransaction[],
	blockchainTxHashes: Set<string>
): ProcessedTransaction[] {
	const bySwapId = new Map<string, ProcessedTransaction>();

	for (const swapTx of swapTxs) {
		if (swapTx.swap?.rawStatus && isSwapCompleted(swapTx.swap.rawStatus)) {
			continue;
		}

		const swapId = swapTx.swap?.id;
		if (swapId) {
			const existing = bySwapId.get(swapId);
			if (!existing) {
				bySwapId.set(swapId, swapTx);
			}
			continue;
		}
		bySwapId.set(swapTx.hash, swapTx);
	}

	const normalizedChainHashes = blockchainTxHashes;

	return [...bySwapId.values()].filter(
		(swapTx) => !normalizedChainHashes.has(swapTx.hash.toLowerCase())
	);
}

export function txActivityTime(tx: ProcessedTransaction): number {
	return new Date(tx.sortTimestamp ?? tx.timestamp).getTime();
}

/** Newest activity first (block time, swap createdAt, or completion hint). */
export function sortByActivity(txs: ProcessedTransaction[]): ProcessedTransaction[] {
	return [...txs].sort((a, b) => txActivityTime(b) - txActivityTime(a));
}

/** Unified running balance across merged chain + swap rows (newest first). */
export function applyRunningBalance(
	txs: ProcessedTransaction[],
	currentBalanceSats: number
): ProcessedTransaction[] {
	const sorted = sortByActivity(txs);

	let runningBalance = currentBalanceSats;
	return sorted.map((tx) => {
		const result = { ...tx, balanceAfter: runningBalance };
		const txValueSats = Number(tx.value) || 0;
		const txFeeSats = tx.feeSats || 0;
		const isFailed = tx.txStatus === 'failed';

		if (tx.displayType === 'receive' || tx.displayType === 'swap-claim') {
			// Failed receives never arrived — don't adjust balance
			if (!isFailed) {
				runningBalance -= txValueSats;
			}
		} else if (tx.displayType === 'send' || tx.displayType === 'contract-function') {
			// Failed sends only cost gas fee, not the value
			if (isFailed) {
				runningBalance += txFeeSats;
			} else {
				runningBalance += txValueSats + txFeeSats;
			}
		}

		return result;
	});
}

export function projectTransactions(
	blockchainTxs: ProcessedTransaction[],
	swapTxs: ProcessedTransaction[],
	currentBalanceSats: number
): ProcessedTransaction[] {
	const dedupedChain = dedupePairedReverseClaims(
		filterMinerFeeClaims(dedupChainClaims(blockchainTxs))
	);
	const blockchainHashes = new Set(dedupedChain.map((tx) => tx.hash.toLowerCase()));
	const uniqueSwaps = dedupSwapRows(swapTxs, blockchainHashes);
	return applyRunningBalance([...dedupedChain, ...uniqueSwaps], currentBalanceSats);
}

/** Patch a single swap row in the transactions array (immutable). */
export function patchSwapRow(
	transactions: ProcessedTransaction[],
	swapId: string,
	updatedTx: ProcessedTransaction
): ProcessedTransaction[] {
	const idx = transactions.findIndex((tx) => tx.swap?.id === swapId);
	if (idx === -1) return transactions;
	return transactions.map((tx, i) => (i === idx ? updatedTx : tx));
}

/** Apply chain-tx sort hints from recently completed swaps. */
export function applyChainSortHints(
	txs: ProcessedTransaction[],
	hints: ReadonlyMap<string, string>
): ProcessedTransaction[] {
	if (hints.size === 0) return txs;
	return txs.map((tx) => {
		const hint = hints.get(tx.hash.toLowerCase());
		if (!hint) return tx;
		return { ...tx, sortTimestamp: hint };
	});
}

/** Re-merge chain + swap rows after a single swap update (stable timestamp sort). */
export function mergeSwapUpdate(
	transactions: ProcessedTransaction[],
	swapId: string,
	updatedSwapTx: ProcessedTransaction,
	currentBalanceSats: number
): ProcessedTransaction[] {
	const chainTxs = transactions.filter((tx) => !tx.swap);
	const swapTxs = [...transactions.filter((tx) => tx.swap && tx.swap.id !== swapId), updatedSwapTx];
	return projectTransactions(chainTxs, swapTxs, currentBalanceSats);
}
