/**
 * Transaction History Processing Utility
 * 
 * Single-pass processing of blockchain transactions with ALL properties computed:
 * - Contract detection (Escrow, EtherSwap)
 * - Transaction type classification
 * - Display properties (border, icon, title)
 * - Network information (icon, display name, explorer URL)
 * - Running balance calculation
 * - Icon components (ready to render)
 * - Everything needed for UI rendering
 */

import type { Transaction } from '@bittasker/wallet-core';
import { getSwapAddress, weiToSatoshi } from '@bittasker/wallet-core';
import { parseFunction } from './functionParsing';
import IconArrowUpBold from '~icons/mdi/arrow-up-bold';
import IconArrowDownBold from '~icons/mdi/arrow-down-bold';
import IconFileDocumentOutline from '~icons/mdi/file-document-outline';
import { ESCROW_CONTRACT_ADDRESSES, statusUI } from '$lib/utils/constants/transactions.constants';

type Component = typeof IconArrowUpBold;

// Processed transaction type with all display properties
export interface ProcessedTransaction {
    // Core fields from API (pass-through)
    hash: string;
    from: string;
    to: string;
    value: string; // sats
    timestamp: string; // API returns ISO 8601
    status: {
        label: string;
        icon: Component;
        color: string;
    };
    network: 'rsk' | 'bsc';

    // Computed fields
    type: 'send' | 'receive' | 'swap' | 'contract';
    subType?: 'lock' | 'claim' | 'refund'; // for swaps
    methodName?: string; // decoded method name (camelCase from contract)

    // Display helpers (computed once)
    displayType: 'send' | 'receive' | 'swap-claim' | 'contract-function';
    borderColor: 'warning' | 'success' | 'info';
    iconConfig: {
        base: Component; // Icon component for rendering
        overlay: Component | null; // Overlay icon component (for contract interactions)
    };
    title: string; // Translation key for title (e.g., 'dashboard.wallet.transactions.sent')

    // Network information (computed once)
    networkIcon: string;
    networkDisplayName: string;
    explorerUrl: string | null;

    // Fee in sats (converted once)
    feeSats: number;

    // Running balance (calculated once)
    balanceAfter: number;

    // Raw for advanced use
    rawMethod?: string; // method selector
    decodedInput?: any;

    // Token info for BSC
    tokenSymbol?: string;
}

// Contract addresses cache
interface ContractAddresses {
    etherSwap: string | null;
    escrowAddresses: string[];
}

let contractAddressesCache: ContractAddresses | null = null;

/**
 * Get contract addresses (cached for session)
 */
async function getContractAddresses(): Promise<ContractAddresses> {
    if (contractAddressesCache) {
        return contractAddressesCache;
    }

    // Fetch EtherSwap address from Boltz API
    const etherSwapAddress = await getSwapAddress();

    // Get Escrow addresses from constants based on network
    const rskNetwork = (import.meta.env.VITE_RSK_NETWORK || 'testnet') as 'mainnet' | 'testnet';
    const escrowAddresses = ESCROW_CONTRACT_ADDRESSES[rskNetwork].map(addr => addr.toLowerCase());

    contractAddressesCache = {
        etherSwap: etherSwapAddress?.toLowerCase() || null,
        escrowAddresses
    };

    return contractAddressesCache;
}

/**
 * Clear contract addresses cache (useful for testing or network changes)
 */
export function clearContractAddressesCache(): void {
    contractAddressesCache = null;
}

/**
 * Extract human-readable method name from transaction
 * Uses multiple strategies to get the best method name
 */
function extractMethodName(tx: Transaction, isEscrowContract: boolean): string | undefined {
    // Strategy 1: Use decoded_input.method_call (most reliable, from API)
    if (tx.decoded_input?.method_call) {
        // Extract just the function name (before parentheses)
        const match = tx.decoded_input.method_call.match(/^([a-zA-Z_][a-zA-Z0-9_]*)/);
        return match ? match[1] : tx.decoded_input.method_call;
    }

    // Strategy 2: Parse raw_input using our function parser (for escrow contracts)
    if (isEscrowContract && tx.raw_input) {
        const parsed = parseFunction(tx.raw_input, 'escrow');
        if (parsed?.functionName) {
            return parsed.functionName;
        }
    }

    // Strategy 3: Parse raw_input for unknown contracts
    if (tx.raw_input) {
        const parsed = parseFunction(tx.raw_input, 'unknown');
        if (parsed?.functionName) {
            return parsed.functionName;
        }
    }

    // No human-readable name available
    return undefined;
}

/**
 * Check if address is an escrow contract
 */
function isEscrowContract(address: string, escrowAddresses: string[]): boolean {
    const lowerAddress = address.toLowerCase();
    return escrowAddresses.some(escrow => escrow === lowerAddress);
}

/**
 * Get network information based on network and environment
 * Computes explorer URL dynamically based on environment
 */
function getNetworkInfo(network: 'rsk' | 'bsc'): {
    icon: string;
    displayName: string;
    explorerBaseUrl: string;
} {
    if (network === 'rsk') {
        const rskNetwork = (import.meta.env.VITE_RSK_NETWORK || 'testnet') as 'mainnet' | 'testnet';
        return {
            icon: '/images/chains/Bitcoin-Rootstock-logo.webp',
            displayName: 'Rootstock (Bitcoin)',
            explorerBaseUrl: rskNetwork === 'mainnet'
                ? 'https://rootstock.blockscout.com/tx/'
                : 'https://rootstock-testnet.blockscout.com/tx/'
        };
    } else {
        const bscNetwork = (import.meta.env.VITE_BSC_NETWORK || 'testnet') as 'mainnet' | 'testnet';
        return {
            icon: '/images/chains/Binance-logo.svg',
            displayName: 'Binance Smart Chain',
            explorerBaseUrl: bscNetwork === 'mainnet'
                ? 'https://bscscan.com/tx/'
                : 'https://testnet.bscscan.com/tx/'
        };
    }
}


/**
 * Detect transaction type based on contract interaction
 */
function detectTransactionType(
    tx: Transaction,
    userAddress: string,
    contractAddresses: ContractAddresses
): {
    type: 'send' | 'receive' | 'swap' | 'contract';
    subType?: 'lock' | 'claim' | 'refund';
    methodName?: string;
} {
    const toAddress = tx.to.hash.toLowerCase();
    const fromAddress = tx.from.hash.toLowerCase();
    const userAddr = userAddress.toLowerCase();

    // Check if it's a contract interaction
    if (!tx.to.is_contract) {
        // Simple transfer
        return {
            type: fromAddress === userAddr ? 'send' : 'receive',
        };
    }

    // Check if it's Escrow contract first (for method name extraction)
    const isEscrow = isEscrowContract(toAddress, contractAddresses.escrowAddresses);

    // Get method name (with escrow flag for better parsing)
    const methodName = extractMethodName(tx, isEscrow);

    // Check if it's EtherSwap contract (by address OR by contract name from API)
    const isEtherSwap = (contractAddresses.etherSwap && toAddress === contractAddresses.etherSwap) ||
        tx.to.name === 'EtherSwap';

    if (isEtherSwap) {
        // Determine swap subtype
        let subType: 'lock' | 'claim' | 'refund' | undefined;
        if (methodName?.toLowerCase().includes('lock')) {
            subType = 'lock';
        } else if (methodName?.toLowerCase().includes('claim')) {
            subType = 'claim';
        } else if (methodName?.toLowerCase().includes('refund')) {
            subType = 'refund';
        }

        return {
            type: 'swap',
            subType,
            methodName,
        };
    }

    // Return contract type (escrow or unknown)
    return {
        type: 'contract',
        methodName,
    };
}

/**
 * Determine all display properties for UI
 * Returns icon components directly and translation keys for titles
 */
function determineDisplayProperties(
    type: 'send' | 'receive' | 'swap' | 'contract',
    subType?: 'lock' | 'claim' | 'refund',
    methodName?: string,
    hasValue?: boolean
): {
    displayType: 'send' | 'receive' | 'swap-claim' | 'contract-function';
    borderColor: 'warning' | 'success' | 'info';
    iconConfig: {
        base: Component;
        overlay: Component | null;
    };
    title: string;
} {
    // Swap transactions
    if (type === 'swap') {
        if (subType === 'claim' || subType === 'refund') {
            return {
                displayType: 'swap-claim',
                borderColor: 'success',
                iconConfig: { base: IconArrowDownBold, overlay: null },
                title: 'wallet.transaction.swap_claimed'
            };
        }
        // lock is treated as send
        return {
            displayType: 'send',
            borderColor: 'warning',
            iconConfig: { base: IconArrowUpBold, overlay: null },
            title: methodName
                ? `wallet.transaction.${methodName.toLowerCase()}`
                : 'wallet.sent'
        };
    }

    // Regular receive
    if (type === 'receive') {
        return {
            displayType: 'receive',
            borderColor: 'success',
            iconConfig: { base: IconArrowDownBold, overlay: null },
            title: 'wallet.received'
        };
    }

    // Regular send
    if (type === 'send') {
        return {
            displayType: 'send',
            borderColor: 'warning',
            iconConfig: { base: IconArrowUpBold, overlay: null },
            title: 'wallet.sent'
        };
    }

    // Contract interactions
    if (type === 'contract') {
        // Special handling for escrow functions that transfer value
        if (hasValue && methodName) {
            const methodLower = methodName.toLowerCase();

            // createEscrow with value → display as send
            if (methodLower.includes('createescrow')) {
                return {
                    displayType: 'send',
                    borderColor: 'warning',
                    iconConfig: { base: IconFileDocumentOutline, overlay: IconArrowUpBold },
                    title: `wallet.transaction.${methodLower}`
                };
            }
            // acceptTask with value → display as receive
            if (methodLower.includes('accepttask')) {
                return {
                    displayType: 'receive',
                    borderColor: 'success',
                    iconConfig: { base: IconFileDocumentOutline, overlay: IconArrowDownBold },
                    title: `wallet.transaction.${methodLower}`
                };
            }
        }

        // All other contract functions
        return {
            displayType: 'contract-function',
            borderColor: 'info',
            iconConfig: { base: IconFileDocumentOutline, overlay: null },
            title: methodName
                ? `wallet.transaction.${methodName.toLowerCase()}`
                : 'wallet.transaction.contract_function'
        };
    }

    // Default fallback
    return {
        displayType: 'contract-function',
        borderColor: 'info',
        iconConfig: { base: IconFileDocumentOutline, overlay: null },
        title: 'wallet.transaction.unknown'
    };
}

/**
 * Convert transaction status from API to our standard format
 */
function normalizeStatus(status: string): 'confirmed' | 'pending' | 'failed' {
    const statusLower = status.toLowerCase();
    if (statusLower === 'ok' || statusLower === 'success' || statusLower === 'confirmed') {
        return 'confirmed';
    }
    if (statusLower === 'pending') {
        return 'pending';
    }
    return 'failed';
}

/**
 * Process raw transactions into clean, typed format with ALL properties computed
 * Single-pass processing including running balance calculation
 * 
 * @param rawTransactions - Raw transactions from blockchain API
 * @param userAddress - User's wallet address
 * @param network - Network type ('rsk' or 'bsc')
 * @param currentBalanceSats - Current balance in satoshis (for running balance calculation)
 * @returns Processed transactions with all display properties and running balances
 */
export async function processTransactions(
    rawTransactions: Transaction[],
    userAddress: string,
    network: 'rsk' | 'bsc',
    currentBalanceSats: number
): Promise<ProcessedTransaction[]> {
    // Fetch contract addresses once
    const contractAddresses = await getContractAddresses();

    // Get network information once
    const networkInfo = getNetworkInfo(network);

    // Process all transactions in single iteration
    const processed = rawTransactions.map((tx) => {
        // Detect transaction type
        const { type, subType, methodName } = detectTransactionType(
            tx,
            userAddress,
            contractAddresses
        );

        const valueSats = Number(weiToSatoshi(BigInt(tx.value || '0')));

        // Check if transaction has value
        const hasValue = valueSats > 0;

        // Determine all display properties in one go (including icon config and translation keys)
        const { displayType, borderColor, iconConfig, title } = determineDisplayProperties(
            type,
            subType,
            methodName,
            hasValue
        );

        // Calculate fee in sats
        const feeSats = Number(weiToSatoshi(BigInt(tx.fee.value || '0')));

        // Build explorer URL
        const explorerUrl = tx.hash ? `${networkInfo.explorerBaseUrl}${tx.hash}` : null;

        // Build processed transaction with all properties computed
        const processedTx: ProcessedTransaction = {
            // Core fields
            hash: tx.hash,
            from: tx.from.hash,
            to: tx.to.hash,
            value: valueSats.toString(),
            timestamp: tx.timestamp,
            status: statusUI[normalizeStatus(tx.status) as keyof typeof statusUI],
            network,

            // Computed fields
            type,
            subType,
            methodName,

            // Display helpers (all computed in one pass)
            displayType,
            borderColor,
            iconConfig, // Pre-computed icon components
            title, // Translation key for i18n

            // Network information (computed once)
            networkIcon: networkInfo.icon,
            networkDisplayName: networkInfo.displayName,
            explorerUrl,

            // Fee
            feeSats,

            // Balance (will be calculated below)
            balanceAfter: 0, // Placeholder, calculated in next step

            // Raw data
            rawMethod: tx.method || undefined,
            decodedInput: tx.decoded_input || undefined
        };

        // Add token symbol for BSC transactions if available
        if (network === 'bsc' && tx.token_transfers && tx.token_transfers.length > 0) {
            // For token transfers, use the token symbol
            processedTx.tokenSymbol = 'USDT'; // Default for now, can be enhanced
        }

        return processedTx;
    });

    // Sort by timestamp (newest first) - required for balance calculation
    processed.sort((a, b) => new Date(b.timestamp)?.getTime() - new Date(a.timestamp)?.getTime());

    // Calculate running balances in single pass (working backwards from current balance)
    let runningBalance = currentBalanceSats;

    for (const tx of processed) {
        const txValueSats = Number(tx.value);
        const txFeeSats = tx.feeSats || 0;

        // Store balance after this transaction
        tx.balanceAfter = runningBalance;

        // Work backwards: if it was a receive, subtract it; if it was a send, add it back
        if (tx.displayType === 'receive' || tx.displayType === 'swap-claim') {
            // For receives and swap claims, user received RBTC, so subtract when going backwards
            runningBalance -= txValueSats;
        } else if (tx.displayType === 'send' || tx.displayType === 'contract-function') {
            // For sends and contract functions, user spent RBTC, so add it back when going backwards
            runningBalance += txValueSats + txFeeSats;
        }
    }

    return processed;
}
