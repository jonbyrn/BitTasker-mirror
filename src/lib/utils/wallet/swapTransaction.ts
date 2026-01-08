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

/**
 * Swap Status Constants
 * Based on: https://api.docs.boltz.exchange/lifecycle.html
 */

// Pending statuses - swap in progress (non-final)
export const PENDING_STATUSES = [
    'swap.created',
    'invoice.set',
    'transaction.mempool',
    'transaction.confirmed',
    'invoice.pending',
    'transaction.claim.pending',
    'minerfee.paid',
    'transaction.server.mempool',
    'transaction.server.confirmed'
] as const;

// Completed statuses - swap successful (final states)
export const COMPLETED_STATUSES = [
    'transaction.claimed',
    'invoice.settled',
    'invoice.paid'
] as const;

// Failed statuses - swap failed (includes both final and transitional)
export const FAILED_STATUSES = [
    'swap.expired',
    'invoice.failedToPay',
    'invoice.expired',
    'transaction.failed',
    'transaction.refunded',
    'transaction.lockupFailed' // Transitions to swap.expired but shown as failed
] as const;

// Final statuses - absolutely cannot change (excludes transaction.lockupFailed)
export const FINAL_STATUSES = [
    ...COMPLETED_STATUSES,
    'swap.expired',
    'invoice.failedToPay',
    'invoice.expired',
    'transaction.failed',
    'transaction.refunded'
] as const;

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
    if (COMPLETED_STATUSES.includes(status as any)) {
        return false;
    }

    // Hide expired swaps safe to delete
    if (status === 'swap.expired' && isExpiredSwapSafeToDelete(swap, swapType)) {
        return false;
    }

    return true;
}

/**
 * Check if swap is in a completed state
 */
export function isSwapCompleted(status: string): boolean {
    return COMPLETED_STATUSES.includes(status as any);
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

    // Determine network based on swap type
    // Submarine and reverse swaps involve Lightning, chain swaps are on RSK
    const network = (swapType === 'submarine' || swapType === 'reverse') ? 'lightning' : 'rsk';
    const networkIcon = network === 'lightning'
        ? '/images/chains/lightning.svg'
        : '/images/chains/Bitcoin-Rootstock-logo.webp';
    const networkDisplayName = network === 'lightning'
        ? 'Lightning Bitcoin'
        : 'Rootstock (Bitcoin)';

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
            base: iconBase,
            overlay: IconSwapHorizontal
        },
        title,
        networkIcon,
        networkDisplayName,
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
    if (PENDING_STATUSES.includes(status as any)) {
        return statusUI.pending;
    } else if (FAILED_STATUSES.includes(status as any)) {
        return statusUI.failed;
    } else if (COMPLETED_STATUSES.includes(status as any)) {
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

    // ViewQR action for non-final swaps
    if (!FINAL_STATUSES.includes(status as any)) {
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
async function refundSubmarineSwap(swap: SubmarineSwapData): Promise<void> {
    try {
        console.log('Refunding submarine swap:', swap.id);
        // TODO: Add refund method once available in wallet-core
    } catch (error) {
        console.error('Failed to refund submarine swap:', error);
        throw error;
    }
}
