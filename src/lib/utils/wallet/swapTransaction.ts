/**
 * Swap Transaction Utility
 *
 * Handles mapping Boltz swaps to ProcessedTransaction format,
 * determining available actions, and managing swap-specific logic.
 */

import type { BoltzSwapData, ChainSwapData, SubmarineSwapData } from '@bittasker/wallet-core';
import type { Component, ComponentType } from 'svelte';
import type { ProcessedTransaction } from './transactionHistory';
import { statusUI } from '$lib/utils/constants/transactions.constants';
import IconArrowUpBold from '~icons/mdi/arrow-up-bold';
import IconArrowDownBold from '~icons/mdi/arrow-down-bold';
import IconSwapHorizontal from '~icons/mdi/swap-horizontal';
import {
	PENDING_STATUSES,
	COMPLETED_STATUSES,
	FAILED_STATUSES,
	FINAL_STATUSES,
	isSwapCompleted as isStatusCompleted
} from './swapStatusMap';

export {
	PENDING_STATUSES,
	COMPLETED_STATUSES,
	FAILED_STATUSES,
	FINAL_STATUSES
} from './swapStatusMap';

type SwapType = 'submarine' | 'reverse' | 'chain';
type SwapData = BoltzSwapData | ChainSwapData | SubmarineSwapData;

export interface SwapAction {
	type: 'refund' | 'renegotiate' | 'claim' | 'viewQR';
	label: string; // Translation key
	handler: () => Promise<void>;
}

/**
 * Check if an expired swap is safe to delete
 * Based on Boltz API documentation: https://api.docs.boltz.exchange/lifecycle.html
 *
 * Safe to delete if:
 * - Submarine: expired AND user never locked funds (no lockupTxHash)
 * - Reverse: expired (invoice was never paid, or Boltz auto-refunded)
 * - Chain: expired AND user never locked L-BTC (no lockupTxHash) AND server never locked RBTC (no serverLockupTxHash)
 */
export function isExpiredSwapSafeToDelete(swap: SwapData, swapType: SwapType): boolean {
	if (swap.status !== 'swap.expired') {
		return false;
	}

	// Submarine swaps: safe to delete if user never locked funds
	if (swapType === 'submarine') {
		const submarineSwap = swap as SubmarineSwapData;
		return !submarineSwap.lockupTxHash;
	}

	// Reverse swaps: safe to delete if expired
	// Per Boltz docs: "If the swap expires without the lightning invoice being paid,
	// the final status will be swap.expired". If invoice was paid and Boltz locked funds,
	// the status would be transaction.refunded (Boltz auto-refunds).
	if (swapType === 'reverse') {
		return true;
	}

	// Chain swaps: safe to delete if neither side locked funds
	if (swapType === 'chain') {
		const chainSwap = swap as ChainSwapData;
		const userLockedFunds = !!chainSwap.lockupTxHash;
		const serverLockedFunds = !!chainSwap.serverLockupTxHash;
		return !userLockedFunds && !serverLockedFunds;
	}

	return false;
}

/**
 * Determine which statuses should be shown in transaction history
 * Exclude completed swaps as they will appear from blockchain
 * Also exclude expired swaps that are safe to delete (never paid)
 */
export function shouldShowSwap(status: string, swapType: SwapType, swap: SwapData): boolean {
	// Hide completed swaps (appear from blockchain)
	if (COMPLETED_STATUSES.includes(status)) {
		return false;
	}

	// Expired: show only when funds were locked and may need user attention
	if (status === 'swap.expired') {
		return !isExpiredSwapSafeToDelete(swap, swapType);
	}

	// Hide terminal failed swaps with no in-app recovery (prevents Nostr recovery flash)
	if (FAILED_STATUSES.includes(status)) {
		if (status === 'transaction.claim.failed') {
			return true;
		}
		// Show submarine swaps where funds were locked — user needs to see these for refund
		if (swapType === 'submarine') {
			const submarineSwap = swap as SubmarineSwapData;
			if (submarineSwap.lockupTxHash) {
				return true;
			}
			return false;
		}
		return false;
	}

	return true;
}

/**
 * Check if swap is in a completed state
 */
export function isSwapCompleted(status: string): boolean {
	return isStatusCompleted(status);
}

/**
 * Map swap data to ProcessedTransaction format
 */
export function mapSwapToTransaction(
	swap: SwapData,
	swapType: SwapType,
	currentBalanceSats: number
): ProcessedTransaction {
	const timestamp = new Date(swap.createdAt || Date.now()).toISOString();
	const explorerBaseUrl =
		import.meta.env.VITE_RSK_NETWORK === 'testnet'
			? 'https://explorer.testnet.rsk.co'
			: 'https://explorer.rsk.co';

	// Get swap status display first to determine styling
	const swapStatus = getSwapStatusDisplay(swap.status);

	// Determine transaction type and display properties
	let displayType: ProcessedTransaction['displayType'];
	let borderColor: ProcessedTransaction['borderColor'];
	let iconBase: Component;
	let title: string;
	let value: string;

	// Determine base direction (send/receive) based on swap type
	const isSend = swapType === 'submarine';

	// Set border color based on status
	if (swapStatus.label === 'wallet.transaction.status.pending') {
		borderColor = 'neutral'; // Gray for pending
	} else if (swapStatus.label === 'wallet.transaction.status.failed') {
		borderColor = 'error'; // Red for failed
	} else if (isSend) {
		borderColor = 'warning'; // Orange for completed send
	} else {
		borderColor = 'success'; // Green for completed receive
	}

	// Determine if swap is pending or failed for title
	const isPending = swapStatus.label === 'wallet.transaction.status.pending';
	const isFailed = swapStatus.label === 'wallet.transaction.status.failed';

	// Get granular status-based title
	const granularTitle = getSwapTitle(swap.status, swapType);

	// Set display properties based on swap type
	if (swapType === 'submarine') {
		// Submarine: RBTC → Lightning (Send)
		displayType = 'send';
		iconBase = IconArrowUpBold as unknown as Component;
		if (isPending) {
			title = granularTitle;
		} else if (isFailed) {
			title = 'wallet.swap.failed_send';
		} else {
			title = 'wallet.sent';
		}
		value = (swap as SubmarineSwapData).invoiceAmount?.toString() || '0';
	} else if (swapType === 'reverse') {
		// Reverse: Lightning → RBTC (Receive)
		displayType = 'receive';
		iconBase = IconArrowDownBold as unknown as Component;
		if (isPending) {
			title = granularTitle;
		} else if (isFailed) {
			title = 'wallet.swap.failed_receive';
		} else {
			title = 'wallet.received';
		}
		value = (swap as BoltzSwapData).amount?.toString() || '0';
	} else {
		// Chain: L-BTC → RBTC (Receive)
		displayType = 'receive';
		iconBase = IconArrowDownBold as unknown as Component;
		if (isPending) {
			title = granularTitle;
		} else if (isFailed) {
			title = 'wallet.swap.failed_receive';
		} else {
			title = 'wallet.received';
		}
		value = (swap as ChainSwapData).toAmount?.toString() || '0';
	}

	// Build transaction hash — always use swap ID as stable key to prevent DOM flash
	const displayHash =
		(swap as SubmarineSwapData).lockupTxHash ||
		(swap as ChainSwapData).claimTxHash ||
		null;
	const txHash = `swap-${swap.id}`;

	// Get available actions
	const actions = getSwapActions(swap);

	// Determine network based on swap type
	// Submarine and reverse swaps involve Lightning, chain swaps are on RSK
	const network = swapType === 'submarine' || swapType === 'reverse' ? 'lightning' : 'rsk';
	const networkIcon =
		network === 'lightning'
			? '/images/chains/lightning.svg'
			: '/images/chains/Bitcoin-Rootstock-logo.webp';
	const networkDisplayName = network === 'lightning' ? 'Lightning Bitcoin' : 'Rootstock (Bitcoin)';

	// Calculate swap fee from the swap data
	let feeSats = 0;
	if (swapType === 'reverse') {
		const rs = swap as BoltzSwapData;
		if (rs.amount && rs.onchainAmount) {
			feeSats = Math.max(0, Number(rs.amount) - Number(rs.onchainAmount));
		}
	} else if (swapType === 'submarine') {
		const ss = swap as SubmarineSwapData;
		if (ss.expectedAmount && ss.invoiceAmount) {
			feeSats = Math.max(0, Number(ss.expectedAmount) - Number(ss.invoiceAmount));
		}
	} else if (swapType === 'chain') {
		const cs = swap as ChainSwapData;
		if (cs.fromAmount && cs.toAmount) {
			feeSats = Math.max(0, Number(cs.fromAmount) - Number(cs.toAmount));
		}
	}

	return {
		hash: txHash,
		from: swapType === 'submarine' ? 'user' : 'boltz',
		to: swapType === 'submarine' ? 'boltz' : 'user',
		value,
		timestamp,
		status: swapStatus,
		network,
		type: swapType === 'submarine' ? 'send' : 'receive',
		displayType,
		borderColor,
		iconConfig: {
			base: iconBase as unknown as Record<string, unknown>,
			overlay: IconSwapHorizontal as unknown as ComponentType
		},
		title,
		networkIcon,
		networkDisplayName,
		explorerUrl: displayHash ? `${explorerBaseUrl}/tx/${displayHash}` : null,
		feeSats,
		balanceAfter: currentBalanceSats,
		swap: {
			id: swap.id,
			type: swapType,
			actions,
			rawStatus: swap.status // Store raw Boltz status for accurate comparison
		}
	};
}

/**
 * Get user-friendly status display for swap
 * Based on: https://api.docs.boltz.exchange/lifecycle.html
 */
function getSwapStatusDisplay(status: string): ProcessedTransaction['status'] {
	if (PENDING_STATUSES.includes(status)) {
		return statusUI.pending as unknown as ProcessedTransaction['status'];
	} else if (FAILED_STATUSES.includes(status)) {
		return statusUI.failed as unknown as ProcessedTransaction['status'];
	} else if (COMPLETED_STATUSES.includes(status)) {
		return statusUI.confirmed as unknown as ProcessedTransaction['status'];
	} else {
		// Unknown status, default to pending
		console.warn('Unknown swap status:', status);
		return statusUI.pending as unknown as ProcessedTransaction['status'];
	}
}

/**
 * Get granular title based on specific swap status
 */
function getSwapTitle(status: string, swapType: SwapType): string {
	// Submarine swaps (Send: RBTC → Lightning)
	if (swapType === 'submarine') {
		switch (status) {
			case 'swap.created':
			case 'invoice.set':
				return 'wallet.swap.pending_send';
			case 'transaction.mempool':
			case 'invoice.pending':
				return 'wallet.swap.pending_send';
			case 'transaction.confirmed':
			case 'transaction.claim.pending':
				return 'wallet.swap.send_finalizing';
			default:
				return 'wallet.swap.pending_send';
		}
	}

	// Reverse swaps (Receive: Lightning → RBTC)
	if (swapType === 'reverse') {
		switch (status) {
			case 'swap.created':
				return 'wallet.swap.awaiting_payment';
			case 'transaction.mempool':
			case 'minerfee.paid':
				return 'wallet.swap.pending_receive';
			case 'transaction.confirmed':
			case 'transaction.claim.pending':
				return 'wallet.swap.receive_finalizing';
			case 'transaction.claim.failed':
				return 'wallet.swap.failed_receive';
			default:
				return 'wallet.swap.pending_receive';
		}
	}

	// Chain swaps (Receive: L-BTC → RBTC)
	switch (status) {
		case 'swap.created':
			return 'wallet.swap.awaiting_payment';
		case 'transaction.mempool':
		case 'transaction.confirmed':
			return 'wallet.swap.pending_receive';
		case 'transaction.server.mempool':
		case 'transaction.server.confirmed':
		case 'transaction.claim.pending':
			return 'wallet.swap.receive_finalizing';
		default:
			return 'wallet.swap.pending_receive';
	}
}

/**
 * Get available actions for a swap based on its status
 */
export function getSwapActions(swap: SwapData): SwapAction[] {
	const actions: SwapAction[] = [];
	const status = swap.status;

	// ViewQR action for non-final swaps
	if (!FINAL_STATUSES.includes(status)) {
		actions.push({
			type: 'viewQR',
			label: 'wallet.swap.action.view_qr',
			handler: async () => {
				// Handler will be overridden in TransactionHistory component
				console.log('View QR action triggered for swap:', swap.id);
			}
		});
	}

	// Submarine swap actions (DISABLED - not implemented in wallet yet)
	// if (swapType === 'submarine') {
	//     const submarineSwap = swap as SubmarineSwapData;
	//     if (
	//         status === 'invoice.failedToPay' ||
	//         status === 'transaction.lockupFailed' ||
	//         (status === 'swap.expired' && submarineSwap.lockupTxHash)
	//     ) {
	//         actions.push({
	//             type: 'refund',
	//             label: 'wallet.swap.action.refund',
	//             handler: () => refundSubmarineSwap(submarineSwap)
	//         });
	//     }
	// }

	// Chain swap renegotiation (NOW ENABLED)
	// if (swapType === 'chain' && status === 'transaction.lockupFailed') {
	//     const chainSwap = swap as ChainSwapData;

	//     // Check if eligible via wallet-core
	//     if (walletManager.chainSwapService.canRenegotiate(chainSwap)) {
	//         actions.push({
	//             type: 'renegotiate',
	//             label: 'wallet.swap.action.renegotiate',
	//             handler: async () => {
	//                 // Handler will be overridden in TransactionHistory component
	//                 console.log('Renegotiate action triggered for swap:', swap.id);
	//             }
	//         });
	//     }

	//     // Code commented until refund is implemented by the wallet-core
	//     // Always show refund option for lockup failed
	//     // actions.push({
	//     //     type: 'refund',
	//     //     label: 'wallet.swap.action.refund',
	//     //     handler: async () => {
	//     //         console.log('Refund action triggered for swap:', swap.id);
	//     //     }
	//     // });
	// }

	// Reverse swaps are handled automatically by wallet-core
	// No manual actions needed

	return actions;
}

/**
 * Determine swap type from swap data
 */
export function getSwapType(swapData: SwapData): SwapType {
	if ('invoice' in swapData && 'lockupAddress' in swapData) {
		return 'submarine';
	}
	if ('invoice' in swapData && !('lockupAddress' in swapData)) {
		return 'reverse';
	}
	return 'chain';
}

/**
 * Refund submarine swap
 * TODO: Use wallet-core refund method once available
 */
// async function refundSubmarineSwap(swap: SubmarineSwapData): Promise<void> {
//     try {
//         console.log('Refunding submarine swap:', swap.id);
//         // TODO: Add refund method once available in wallet-core
//     } catch (error) {
//         console.error('Failed to refund submarine swap:', error);
//         throw error;
//     }
// }
