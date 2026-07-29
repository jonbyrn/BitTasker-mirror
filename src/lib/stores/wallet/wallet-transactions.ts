/**
 * Wallet Transactions — loading, updating, swap coordination
 */

import {
	WalletManager,
	type SubmarineSwapData,
	type BoltzSwapData,
	type ChainSwapData
} from '@bittasker/wallet-core';
import { get } from 'svelte/store';
import {
	processTransactions,
	fetchArbitrumTransactions,
	type ProcessedTransaction
} from '$lib/utils/wallet/transactionHistory';
import {
	isSwapCompleted,
	mapSwapToTransaction,
	shouldShowSwap
} from '$lib/utils/wallet/swapTransaction';
import { isSwapFailed, isSwapFinal } from '$lib/utils/wallet/swapStatusMap';
import {
	projectTransactions,
	applyChainSortHints,
	mergeSwapUpdate
} from '$lib/utils/wallet/transactionLedger';
import {
	hydrateChainSortHints,
	buildChainSortHintsFromSwaps,
	mergeChainSortHints,
	persistChainSortHint,
	persistChainSortHintsMap,
	toSortIso
} from '$lib/utils/wallet/chainSortHints';
import { walletStore, state, getWalletManager } from './wallet-state';
import { initialize } from './wallet-init';
import { scheduleBalanceRefresh } from './wallet-balances';

// ─── Internal helpers ────────────────────────────────────────────────────────

function scheduleChainRefresh(): void {
	if (state.chainRefreshTimer) clearTimeout(state.chainRefreshTimer);
	state.chainRefreshTimer = setTimeout(() => {
		state.chainRefreshTimer = null;
		loadTransactions().catch((err) => {
			console.error('[loadTransactions] Debounced chain refresh failed:', err);
		});
	}, 500);
}

function recordChainSortHints(
	swapType: 'submarine' | 'reverse' | 'chain',
	swap: BoltzSwapData | ChainSwapData | SubmarineSwapData
): void {
	if (swapType === 'submarine') {
		const lockupHash = (swap as SubmarineSwapData).lockupTxHash;
		const createdAt = toSortIso(swap.createdAt);
		if (lockupHash && createdAt && /^0x[0-9a-fA-F]{64}$/.test(lockupHash)) {
			const normalized = lockupHash.toLowerCase();
			state.chainSortHints.set(normalized, createdAt);
			void persistChainSortHint(normalized, createdAt);
		}
		return;
	}

	const claimHash =
		swapType === 'reverse'
			? (swap as BoltzSwapData).claimTxHash
			: (swap as ChainSwapData).claimTxHash;
	const completionTime = toSortIso(swap.updatedAt) ?? new Date().toISOString();

	if (claimHash && /^0x[0-9a-fA-F]{64}$/.test(claimHash)) {
		const normalized = claimHash.toLowerCase();
		state.chainSortHints.set(normalized, completionTime);
		void persistChainSortHint(normalized, completionTime);
	}
}

function shouldPreserveSwapRow(tx: ProcessedTransaction, mappedSwapIds: Set<string>): boolean {
	if (!tx.swap || mappedSwapIds.has(tx.swap.id)) {
		return false;
	}
	const rawStatus = tx.swap.rawStatus ?? '';
	if (isSwapCompleted(rawStatus)) {
		return false;
	}
	if (isSwapFailed(rawStatus) && rawStatus !== 'transaction.claim.failed') {
		return false;
	}
	return true;
}

async function loadTransactionsInternal(): Promise<void> {
	try {
		await hydrateChainSortHints(state.chainSortHints);

		const storeState = get(walletStore);
		const shouldRecoverSwaps = state.recoverSwapsOnNextLoad;

		// Ensure wallet is initialized before loading transactions
		if (!storeState.isConnected || !state.sdkWalletManager) {
			if (!storeState.isInitializing) {
				await initialize();
			} else {
				// Wait for initialization to complete
				const maxWaitTime = 10000;
				const startTime = Date.now();
				while (Date.now() - startTime < maxWaitTime) {
					await new Promise((resolve) => setTimeout(resolve, 100));
					const currentState = get(walletStore);
					if (
						!currentState.isInitializing ||
						(currentState.isConnected && state.sdkWalletManager)
					) {
						break;
					}
				}
			}

			const updatedState = get(walletStore);
			if (!updatedState.isConnected || !state.sdkWalletManager) {
				throw new Error('Wallet not initialized. Cannot load transactions.');
			}
		}

		const manager = getWalletManager();
		const finalState = get(walletStore);

		if (shouldRecoverSwaps) {
			await refreshChainSortHintsFromNostr();
		}

		const previousReceiveHashes = new Set(
			finalState.transactions
				.filter((tx) => tx.displayType === 'receive' || tx.displayType === 'swap-claim')
				.map((tx) => tx.hash.toLowerCase())
		);

		// Validate wallets exist
		if (!manager.rskWallet || !manager.bscWallet) {
			throw new Error(
				`Wallets not available. RSK: ${!!manager.rskWallet}, BSC: ${!!manager.bscWallet}`
			);
		}

		// Get current balance for running balance calculation
		const currentBalanceSats = finalState.totalBalances.sats;

		// Load blockchain transactions
		const [rskTxs, bscTxs] = await Promise.all([
			manager.rskWallet.loadTransactions(),
			manager.bscWallet.loadTransactions()
		]);

		// Fetch Arbitrum transactions directly from Blockscout
		const arbAddress = finalState.arb?.address;
		const arbTxs = arbAddress ? await fetchArbitrumTransactions(arbAddress) : [];

		// Process blockchain transactions
		const [processedRskTxs, processedBscTxs, _processedArbTxs] = await Promise.all([
			processTransactions(rskTxs, finalState.rsk.address || '', 'rsk', currentBalanceSats),
			processTransactions(bscTxs, finalState.bsc.address || '', 'bsc', currentBalanceSats),
			arbTxs.length > 0
				? processTransactions(arbTxs, arbAddress ?? '', 'arb', currentBalanceSats)
				: Promise.resolve([])
		]);

		// Recover pending swaps only on init / explicit refresh
		let submarineSwaps: SubmarineSwapData[] = [];
		let reverseSwaps: BoltzSwapData[] = [];
		let chainSwaps: ChainSwapData[] = [];

		if (state.recoverSwapsOnNextLoad) {
			[submarineSwaps, reverseSwaps, chainSwaps] = await Promise.all([
				manager.submarineSwapService.recoverPendingSwaps().catch(() => []),
				manager.reverseSwapService.recoverPendingSwaps().catch(() => []),
				manager.chainSwapService.recoverPendingSwaps().catch(() => [])
			]);
			submarineSwaps = submarineSwaps.filter((s) => shouldShowSwap(s.status, 'submarine', s));
			reverseSwaps = reverseSwaps.filter((s) => shouldShowSwap(s.status, 'reverse', s));
			chainSwaps = chainSwaps.filter((s) => shouldShowSwap(s.status, 'chain', s));
			state.recoverSwapsOnNextLoad = false;
		} else {
			submarineSwaps = manager.submarineSwapService.getActiveSwaps();
			chainSwaps = manager.chainSwapService.getActiveSwaps();
			const reverseIds = finalState.transactions
				.filter((tx) => tx.swap?.type === 'reverse')
				.map((tx) => tx.swap!.id);
			reverseSwaps = reverseIds
				.map((id) => manager.reverseSwapService.getSwap(id))
				.filter((swap): swap is BoltzSwapData => swap != null);
		}

		// One-shot post-recovery cleanup
		if (shouldRecoverSwaps) {
			if (state.postCleanupTimer) clearTimeout(state.postCleanupTimer);
			const cleanupSwaps = { submarineSwaps, reverseSwaps, chainSwaps };
			state.postCleanupTimer = setTimeout(() => {
				state.postCleanupTimer = null;
				cleanupExpiredSwaps(
					manager,
					cleanupSwaps.submarineSwaps,
					cleanupSwaps.reverseSwaps,
					cleanupSwaps.chainSwaps
				);
				loadTransactions().catch((err) => {
					console.error('[loadTransactions] Post-cleanup refresh failed:', err);
				});
			}, 2000);
		}

		// Map swaps to transaction format
		const swapTransactions = [
			...submarineSwaps
				.filter((s) => shouldShowSwap(s.status, 'submarine', s))
				.map((s) => mapSwapToTransaction(s, 'submarine', currentBalanceSats)),
			...reverseSwaps
				.filter((s) => shouldShowSwap(s.status, 'reverse', s))
				.map((s) => mapSwapToTransaction(s, 'reverse', currentBalanceSats)),
			...chainSwaps
				.filter((s) => shouldShowSwap(s.status, 'chain', s))
				.map((s) => mapSwapToTransaction(s, 'chain', currentBalanceSats))
		];

		const mappedSwapIds = new Set(
			swapTransactions.map((tx) => tx.swap?.id).filter((id): id is string => !!id)
		);
		const preservedSwapRows = finalState.transactions.filter((tx) =>
			shouldPreserveSwapRow(tx, mappedSwapIds)
		);

		const allTransactions = projectTransactions(
			applyChainSortHints([...processedRskTxs, ...processedBscTxs], state.chainSortHints),
			[...swapTransactions, ...preservedSwapRows],
			currentBalanceSats
		);

		walletStore.update((s) => ({ ...s, transactions: allTransactions }));

		const hasNewReceive = allTransactions.some(
			(tx) =>
				(tx.displayType === 'receive' || tx.displayType === 'swap-claim') &&
				!previousReceiveHashes.has(tx.hash.toLowerCase())
		);
		if (hasNewReceive) {
			scheduleBalanceRefresh();
		}
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : 'Unknown error';
		console.error('[loadTransactions] Failed to load transactions:', errorMessage, error);

		walletStore.update((s) => ({
			...s,
			error: s.error || errorMessage
		}));

		throw error;
	}
}

async function refreshChainSortHintsFromNostr(): Promise<void> {
	if (!state.cachedSwapStorages) return;

	const [submarineSwaps, reverseSwaps, chainSwaps] = await Promise.all([
		state.cachedSwapStorages.submarine.loadAllIncludingFinal(),
		state.cachedSwapStorages.reverse.loadAllIncludingFinal(),
		state.cachedSwapStorages.chain.loadAllIncludingFinal()
	]);

	const fromNostr = buildChainSortHintsFromSwaps([
		...submarineSwaps.map((swap) => ({ swapType: 'submarine' as const, swap })),
		...reverseSwaps.map((swap) => ({ swapType: 'reverse' as const, swap })),
		...chainSwaps.map((swap) => ({ swapType: 'chain' as const, swap }))
	]);

	mergeChainSortHints(state.chainSortHints, fromNostr);
	await persistChainSortHintsMap(state.chainSortHints);
}

/**
 * Cleanup expired swaps from Nostr storage.
 * Called after WebSocket has synced swap statuses.
 */
export function cleanupExpiredSwaps(
	manager: WalletManager,
	submarineSwaps: SubmarineSwapData[],
	reverseSwaps: BoltzSwapData[],
	chainSwaps: ChainSwapData[]
): void {
	// Collect expired swaps to delete based on swap type
	const swapsToDelete: Array<{ id: string; type: 'submarine' | 'reverse' | 'chain' }> = [];

	// Submarine swaps: delete if expired and user never locked funds
	submarineSwaps.forEach((s) => {
		if (s.status === 'swap.expired' && !s.lockupTxHash) {
			swapsToDelete.push({ id: s.id, type: 'submarine' });
		}
	});

	// Reverse swaps: delete if expired (invoice was never paid or Boltz auto-refunded)
	reverseSwaps.forEach((s) => {
		if (s.status === 'swap.expired') {
			swapsToDelete.push({ id: s.id, type: 'reverse' });
		}
	});

	// Chain swaps: delete if expired and neither side locked funds
	chainSwaps.forEach((s) => {
		if (s.status === 'swap.expired' && !s.lockupTxHash && !s.serverLockupTxHash) {
			swapsToDelete.push({ id: s.id, type: 'chain' });
		}
	});

	// Delete safe-to-delete expired swaps from Nostr storage
	if (swapsToDelete.length > 0) {
		console.log(
			`Deleting ${swapsToDelete.length} expired swap(s) from Nostr:`,
			swapsToDelete.map((s) => s.id)
		);
		Promise.allSettled(
			swapsToDelete.map(({ id, type }) => {
				const service =
					type === 'submarine'
						? manager.submarineSwapService
						: type === 'reverse'
							? manager.reverseSwapService
							: manager.chainSwapService;
				return service.deleteSwap(id);
			})
		).then((results) => {
			const failures = results.filter((r) => r.status === 'rejected');
			if (failures.length > 0) {
				console.error(
					`Failed to delete ${failures.length}/${swapsToDelete.length} expired swap(s):`,
					failures.map((r) => (r as PromiseRejectedResult).reason)
				);
			}
		});
	}
}

// ─── Exported functions ──────────────────────────────────────────────────────

/**
 * Load transactions including pending swaps (single-flight mutex).
 */
export async function loadTransactions(): Promise<void> {
	if (state.loadTransactionsPromise) {
		return state.loadTransactionsPromise;
	}
	state.loadTransactionsPromise = loadTransactionsInternal().finally(() => {
		state.loadTransactionsPromise = null;
	});
	return state.loadTransactionsPromise;
}

/** Force Nostr swap recovery on next load (manual refresh / modal open). */
export function refreshTransactions(): Promise<void> {
	state.recoverSwapsOnNextLoad = true;
	return loadTransactions();
}

/**
 * Update a specific swap transaction in the transactions store
 * without replacing the entire array.
 */
export function updateSwapTransaction(
	swapId: string,
	updatedSwap: BoltzSwapData | ChainSwapData | SubmarineSwapData,
	swapType: 'submarine' | 'reverse' | 'chain'
): void {
	if (state.terminalSwapIds.has(swapId)) return;

	const storeState = get(walletStore);
	const txIndex = storeState.transactions.findIndex((tx) => tx.swap?.id === swapId);
	const currentTx = txIndex === -1 ? null : storeState.transactions[txIndex];
	const currentSwapStatus = currentTx?.swap?.rawStatus;
	const newSwapStatus = updatedSwap.status;

	if (currentSwapStatus === newSwapStatus) {
		return;
	}

	const balanceAnchor = currentTx?.balanceAfter ?? storeState.totalBalances.sats;
	const updatedTx = mapSwapToTransaction(updatedSwap, swapType, balanceAnchor);

	if (isSwapFinal(newSwapStatus)) {
		state.terminalSwapIds.add(swapId);

		if (isSwapCompleted(newSwapStatus)) {
			recordChainSortHints(swapType, updatedSwap);
			walletStore.update((s) => ({
				...s,
				transactions: s.transactions.filter((tx) => tx.swap?.id !== swapId)
			}));
			if (swapType === 'reverse' || swapType === 'chain') {
				scheduleBalanceRefresh();
			}
			scheduleChainRefresh();
			return;
		}

		if (isSwapFailed(newSwapStatus)) {
			if (txIndex === -1) {
				walletStore.update((s) => ({
					...s,
					transactions: projectTransactions(s.transactions, [updatedTx], s.totalBalances.sats)
				}));
			} else {
				walletStore.update((s) => ({
					...s,
					transactions: mergeSwapUpdate(s.transactions, swapId, updatedTx, s.totalBalances.sats)
				}));
			}
			return;
		}
	}

	walletStore.update((s) => ({
		...s,
		transactions: mergeSwapUpdate(s.transactions, swapId, updatedTx, s.totalBalances.sats)
	}));
}
