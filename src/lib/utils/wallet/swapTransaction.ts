/**
 * Swap Transaction Utility
 * 
 * Handles mapping Boltz swaps to ProcessedTransaction format,
 * determining available actions, and managing swap-specific logic.
 */

import type { BoltzSwapData, ChainSwapData, SubmarineSwapData } from '@bittasker/wallet-core';
import type { ProcessedTransaction } from './transactionHistory';
import { walletManager } from '$lib/stores/wallet.store';
import { statusUI } from '$lib/utils/constants/transactions.constants';
import IconArrowUpBold from '~icons/mdi/arrow-up-bold';
import IconArrowDownBold from '~icons/mdi/arrow-down-bold';
import IconSwapHorizontal from '~icons/mdi/swap-horizontal';

type SwapType = 'submarine' | 'reverse' | 'chain';
type SwapData = BoltzSwapData | ChainSwapData | SubmarineSwapData;

export interface SwapAction {
    type: 'refund' | 'renegotiate' | 'claim' | 'viewQR';
    label: string; // Translation key
    handler: () => Promise<void>;
}

/**
 * Determine which statuses should be shown in transaction history
 * Exclude completed swaps as they will appear from blockchain
 * 
 * Completed statuses by type:
 * - Submarine: transaction.claimed, invoice.paid
 * - Reverse: invoice.settled
 * - Chain: transaction.claimed
 */
export function shouldShowSwap(status: string, swapType: SwapType): boolean {
    const completedStatuses = [
        'transaction.claimed', // Submarine & Chain final state
        'invoice.settled',     // Reverse final state
        'invoice.paid'         // Submarine intermediate state (before claim)
    ];

    return !completedStatuses.includes(status);
}

/**
 * Check if swap is in a completed state
 */
export function isSwapCompleted(status: string): boolean {
    return ['transaction.claimed', 'invoice.settled', 'invoice.paid'].includes(status);
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
    let iconBase: any;
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
        iconBase = IconArrowUpBold;
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
        iconBase = IconArrowDownBold;
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
        iconBase = IconArrowDownBold;
        if (isPending) {
            title = granularTitle;
        } else if (isFailed) {
            title = 'wallet.swap.failed_receive';
        } else {
            title = 'wallet.received';
        }
        value = (swap as ChainSwapData).toAmount?.toString() || '0';
    }

    // Build transaction hash (use lockupTxHash or claimTxHash if available)
    const txHash =
        (swap as any).lockupTxHash || (swap as any).claimTxHash || `swap-${swap.id}`;

    // Get available actions
    const actions = getSwapActions(swap, swapType);

    return {
        hash: txHash,
        from: swapType === 'submarine' ? 'user' : 'boltz',
        to: swapType === 'submarine' ? 'boltz' : 'user',
        value,
        timestamp,
        status: swapStatus,
        network: 'rsk',
        type: swapType === 'submarine' ? 'send' : 'receive',
        displayType,
        borderColor,
        iconConfig: {
            base: iconBase,
            overlay: IconSwapHorizontal
        },
        title,
        networkIcon: '/images/chains/Bitcoin-Rootstock-logo.webp',
        networkDisplayName: 'Rootstock (Bitcoin)',
        explorerUrl: txHash.startsWith('swap-') ? null : `${explorerBaseUrl}/tx/${txHash}`,
        feeSats: 0, // Swap fees are included in the amount
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
	// Pending statuses (swap in progress)
	// Submarine: swap.created, invoice.set, transaction.mempool, transaction.confirmed, invoice.pending, transaction.claim.pending
	// Reverse: swap.created, minerfee.paid, transaction.mempool, transaction.confirmed
	// Chain: swap.created, transaction.mempool, transaction.confirmed, transaction.server.mempool, transaction.server.confirmed
	const pendingStatuses = [
		'swap.created',
		'invoice.set',
		'transaction.mempool',
		'transaction.confirmed',
		'invoice.pending',
		'transaction.claim.pending',
		'minerfee.paid',
		'transaction.server.mempool',
		'transaction.server.confirmed'
	];

	// Failed statuses (swap failed, may need refund)
	// Submarine: invoice.failedToPay, swap.expired, transaction.lockupFailed
	// Reverse: invoice.expired, swap.expired, transaction.failed, transaction.refunded
	// Chain: swap.expired, transaction.lockupFailed, transaction.failed, transaction.refunded
	const failedStatuses = [
		'swap.expired',              // All swap types - final
		'transaction.failed',        // Reverse & Chain swaps - final
		'invoice.failedToPay',       // Submarine swaps - final
		'transaction.lockupFailed',  // Submarine & Chain swaps - transitions to swap.expired
		'invoice.expired',           // Reverse swaps - final
		'transaction.refunded'       // Reverse & Chain swaps - final
	];

	// Completed statuses (swap successful)
	// Submarine: transaction.claimed, invoice.paid
	// Reverse: invoice.settled
	// Chain: transaction.claimed
	const completedStatuses = [
		'transaction.claimed',
		'invoice.settled',
		'invoice.paid'
	];

	if (pendingStatuses.includes(status)) {
		return statusUI.pending;
	} else if (failedStatuses.includes(status)) {
		return statusUI.failed;
	} else if (completedStatuses.includes(status)) {
		return statusUI.confirmed;
	} else {
		// Unknown status, default to pending
		console.warn('Unknown swap status:', status);
		return statusUI.pending;
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
                return 'wallet.swap.awaiting_payment';
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
export function getSwapActions(swap: SwapData, swapType: SwapType): SwapAction[] {
	const actions: SwapAction[] = [];
	const status = swap.status;

	// Check if swap is not in final state - add viewQR action
	// Final states per Boltz API: https://api.docs.boltz.exchange/lifecycle.html
	const finalStatuses = [
		'invoice.settled',          // Reverse swaps - success
		'transaction.claimed',      // Submarine & Chain swaps - success
		'swap.expired',            // All types - failed (final)
		'transaction.failed',      // Reverse & Chain - failed (final)
		'transaction.refunded',    // Reverse & Chain - failed (final)
		'invoice.expired',         // Reverse - failed (final)
		'invoice.failedToPay'      // Submarine - failed (final)
		// Note: transaction.lockupFailed is not final - transitions to swap.expired
	];

	if (!finalStatuses.includes(status)) {
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

    // Chain swap actions (DISABLED - not implemented in wallet yet)
    // if (swapType === 'chain') {
    //     const chainSwap = swap as ChainSwapData;
    //     if (status === 'transaction.lockupFailed') {
    //         // Check renegotiation eligibility
    //         if (canRenegotiate(chainSwap)) {
    //             actions.push({
    //                 type: 'renegotiate',
    //                 label: 'wallet.swap.action.renegotiate',
    //                 handler: () => renegotiateChainSwap(chainSwap)
    //             });
    //         }
    //         actions.push({
    //             type: 'refund',
    //             label: 'wallet.swap.action.refund',
    //             handler: () => refundChainSwap(chainSwap)
    //         });
    //     }
    //     if (status === 'swap.expired' && chainSwap.lockupTxHash) {
    //         actions.push({
    //             type: 'refund',
    //             label: 'wallet.swap.action.refund',
    //             handler: () => refundChainSwap(chainSwap)
    //         });
    //     }
    // }

    // Reverse swaps are handled automatically by wallet-core
    // No manual actions needed

    return actions;
}

/**
 * Check if chain swap can be renegotiated
 */
function canRenegotiate(swap: ChainSwapData): boolean {
    const status = swap.status as string;
    const timeUntilExpiry = (swap.expiresAt || 0) - Date.now();
    const hasEnoughTime = timeUntilExpiry >= 60 * 60 * 1000; // 60 minutes
    const hasLockupTx = !!swap.lockupTxHash;
    const isLockupFailed = status === 'transaction.lockupFailed';

    return hasEnoughTime && hasLockupTx && isLockupFailed;
}

/**
 * Refund submarine swap
 * TODO: Use wallet-core refund method once available
 */
async function refundSubmarineSwap(swap: SubmarineSwapData): Promise<void> {
    try {
        console.log('Refunding submarine swap:', swap.id);
        // TODO: Add refund method once available in wallet-core
    } catch (error) {
        console.error('Failed to refund submarine swap:', error);
        throw error;
    }
}

/**
 * Refund chain swap
 * TODO: Use wallet-core refund method once available
 */
async function refundChainSwap(swap: ChainSwapData): Promise<void> {
    try {
        console.log('Refunding chain swap:', swap.id);
        // TODO: Add refund method once available in wallet-core
    } catch (error) {
        console.error('Failed to refund chain swap:', error);
        throw error;
    }
}

/**
 * Renegotiate chain swap
 * Calls Boltz API to get new quote and accept it
 */
async function renegotiateChainSwap(swap: ChainSwapData): Promise<void> {
    try {
        console.log('Renegotiating chain swap:', swap.id);

        const boltzApiUrl =
            import.meta.env.VITE_RSK_NETWORK === 'testnet'
                ? 'https://api.testnet.boltz.exchange'
                : 'https://api.boltz.exchange';

        // Get new quote
        const quoteResponse = await fetch(`${boltzApiUrl}/v2/swap/chain/${swap.id}/quote`);
        if (!quoteResponse.ok) {
            throw new Error('Failed to get renegotiation quote');
        }
        const quote = await quoteResponse.json();

        // Confirm with user
        const confirmed = confirm(
            `Renegotiate swap with new amount: ${quote.amount} sats?\n\nOriginal: ${swap.toAmount} sats\nNew: ${quote.amount} sats`
        );

        if (!confirmed) {
            return;
        }

        // Accept the quote
        const acceptResponse = await fetch(`${boltzApiUrl}/v2/swap/chain/${swap.id}/quote`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ amount: quote.amount })
        });

        if (!acceptResponse.ok) {
            throw new Error('Failed to accept renegotiation quote');
        }

        // Status will be updated via WebSocket automatically
        console.log('Swap renegotiated successfully!');
    } catch (error) {
        console.error('Failed to renegotiate chain swap:', error);
        throw error;
    }
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

