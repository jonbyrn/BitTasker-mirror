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
 * - Internal transaction handling (for escrow payouts)
 */

import { ethers } from 'ethers';
import type { Transaction } from '@bittasker/wallet-core';
import type { 
    InternalTransaction, 
    ExtendedTransaction, 
    ProcessedTransaction 
} from '$lib/types/wallet';
import { ESCROW_CONTRACT_ADDRESSES, statusUI } from '$lib/utils/constants/transactions.constants';
import { getSwapAddress, weiToSatoshi } from '@bittasker/wallet-core';
import { parseFunction } from './functionParsing';
import IconArrowUpBold from '~icons/mdi/arrow-up-bold';
import IconArrowDownBold from '~icons/mdi/arrow-down-bold';
import IconFileDocumentOutline from '~icons/mdi/file-document-outline';

type Component = typeof IconArrowUpBold;

// Re-export ProcessedTransaction for backward compatibility
export type { ProcessedTransaction } from '$lib/types/wallet';

// Contract addresses cache
interface ContractAddresses {
    etherSwap: string | null;
    escrowAddresses: string[];
}

interface BscTokenTransferSummary {
    amount: number;
    fee: number;
    symbol: string;
    decimals: number;
    direction: 'send' | 'receive';
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
    const escrowAddressesArray = ESCROW_CONTRACT_ADDRESSES[rskNetwork];
    
    if (!escrowAddressesArray || !Array.isArray(escrowAddressesArray)) {
        console.error('[getContractAddresses] Invalid escrow addresses configuration', {
            rskNetwork,
            hasConfig: !!ESCROW_CONTRACT_ADDRESSES[rskNetwork]
        });
        throw new Error(`Invalid escrow addresses configuration for network: ${rskNetwork}`);
    }
    
    const escrowAddresses = escrowAddressesArray
        .filter((addr): addr is string => addr != null && typeof addr === 'string')
        .map(addr => addr.toLowerCase());

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
    if (!address || typeof address !== 'string') {
        return false;
    }
    const lowerAddress = address.toLowerCase();
    return escrowAddresses.some(escrow => escrow === lowerAddress);
}

function getEntityHash(entity: any): string | null {
    if (!entity || typeof entity !== 'object') return null;
    return entity.hash || entity.address_hash || entity.address || null;
}

function getTransferDecimals(transfer: any): number {
    const rawDecimals =
        transfer?.total?.decimals ??
        transfer?.token?.decimals ??
        transfer?.decimals;
    const parsed = Number.parseInt(String(rawDecimals ?? ''), 10);
    if (Number.isFinite(parsed) && parsed >= 0) {
        return parsed;
    }

    const symbol = String(
        transfer?.token?.symbol ??
        transfer?.token_symbol ??
        transfer?.symbol ??
        ''
    ).toUpperCase();

    return symbol === 'USDT' ? 6 : 18;
}

function getTransferSymbol(transfer: any): string {
    return String(
        transfer?.token?.symbol ??
        transfer?.token_symbol ??
        transfer?.symbol ??
        'USDT'
    ).toUpperCase();
}

function getTransferAtomicValue(transfer: any): bigint {
    const rawValue = transfer?.total?.value ?? transfer?.amount ?? transfer?.value ?? '0';
    try {
        return BigInt(String(rawValue));
    } catch {
        return 0n;
    }
}

function formatAtomicValue(value: bigint, decimals: number): number {
    const normalized = Number(ethers.formatUnits(value, decimals));
    return Number.isFinite(normalized) ? normalized : 0;
}

function extractBscTokenTransferSummary(
    tx: ExtendedTransaction,
    userAddress: string
): BscTokenTransferSummary | null {
    if (!Array.isArray(tx.token_transfers) || tx.token_transfers.length === 0) {
        return null;
    }

    const userAddr = userAddress.toLowerCase();
    const transfers = tx.token_transfers
        .map((transfer) => {
            const from = getEntityHash(transfer?.from)?.toLowerCase();
            const to = getEntityHash(transfer?.to)?.toLowerCase();
            const decimals = getTransferDecimals(transfer);
            const symbol = getTransferSymbol(transfer);
            const atomicValue = getTransferAtomicValue(transfer);

            return { from, to, decimals, symbol, atomicValue };
        })
        .filter((transfer) => transfer.atomicValue > 0n && (transfer.from === userAddr || transfer.to === userAddr));

    if (transfers.length === 0) {
        return null;
    }

    const outgoing = transfers.filter((transfer) => transfer.from === userAddr);
    const incoming = transfers.filter((transfer) => transfer.to === userAddr);
    const prioritized = outgoing.length > 0 ? outgoing : incoming;
    if (prioritized.length === 0) {
        return null;
    }

    const [primary] = prioritized;
    const matchingTransfers = prioritized.filter(
        (transfer) => transfer.symbol === primary.symbol && transfer.decimals === primary.decimals
    );

    if (outgoing.length > 0) {
        const sorted = [...matchingTransfers].sort((a, b) =>
            a.atomicValue > b.atomicValue ? -1 : a.atomicValue < b.atomicValue ? 1 : 0
        );
        const amountAtomic = sorted[0]?.atomicValue ?? 0n;
        const totalAtomic = matchingTransfers.reduce((sum, transfer) => sum + transfer.atomicValue, 0n);
        const feeAtomic = totalAtomic > amountAtomic ? totalAtomic - amountAtomic : 0n;

        return {
            amount: formatAtomicValue(amountAtomic, primary.decimals),
            fee: formatAtomicValue(feeAtomic, primary.decimals),
            symbol: primary.symbol,
            decimals: primary.decimals,
            direction: 'send'
        };
    }

    const totalIncomingAtomic = matchingTransfers.reduce((sum, transfer) => sum + transfer.atomicValue, 0n);
    return {
        amount: formatAtomicValue(totalIncomingAtomic, primary.decimals),
        fee: 0,
        symbol: primary.symbol,
        decimals: primary.decimals,
        direction: 'receive'
    };
}

/**
 * Get network information based on network and environment
 * Computes explorer URL dynamically based on environment
 */
const rskNetwork = (import.meta.env.VITE_RSK_NETWORK || 'testnet') as 'mainnet' | 'testnet';
const rskExplorerBaseUrl = rskNetwork === 'mainnet'
    ? 'https://rootstock.blockscout.com/tx/'
    : 'https://rootstock-testnet.blockscout.com/tx/';

const bscNetwork = (import.meta.env.VITE_BSC_NETWORK || 'testnet') as 'mainnet' | 'testnet';
const bscExplorerBaseUrl = bscNetwork === 'mainnet'
    ? 'https://bscscan.com/tx/'
    : 'https://testnet.bscscan.com/tx/';

const networks = {
    rsk: {
        icon: '/images/chains/Bitcoin-Rootstock-logo.webp',
        displayName: 'Rootstock (Bitcoin)',
        explorerBaseUrl: rskExplorerBaseUrl
    },
    bsc: {
        icon: '/images/chains/Binance-logo.svg',
        displayName: 'Binance Smart Chain',
        explorerBaseUrl: bscExplorerBaseUrl
    },
    lightning: {
        icon: '/images/chains/lightning.svg',
        displayName: 'Lightning Bitcoin',
        explorerBaseUrl: rskExplorerBaseUrl
    }
}


/**
 * Determine Boltz swap type based on method and caller
 * 
 * Submarine Swap (Chain → Lightning): User locks RBTC to receive Lightning
 * Reverse Swap (Lightning → Chain): User claims RBTC after paying Lightning
 * Chain Swap (Chain → Chain): Cross-chain swaps (e.g., L-BTC ↔ RBTC)
 */
function determineBoltzSwapType(
    method: string | undefined,
    fromAddress: string,
    userAddress: string
): 'submarine' | 'reverse' | 'chain' | undefined {
    if (!method) return undefined;

    const methodLower = method.toLowerCase();
    const isFromUser = fromAddress === userAddress;

    // Chain swaps use 'lockup' method
    if (methodLower.includes('lockup')) {
        return 'chain';
    }

    // Submarine vs Reverse detection for lock/claim/refund
    if (methodLower.includes('lock')) {
        // lock called by user = submarine (user locking to get Lightning)
        // lock called by Boltz = reverse (Boltz locking for user to claim)
        return isFromUser ? 'submarine' : 'reverse';
    }

    if (methodLower.includes('claim')) {
        // claim called by user = reverse (user claiming Lightning → RBTC)
        // claim called by Boltz = submarine (Boltz claiming after user paid Lightning)
        return isFromUser ? 'reverse' : 'submarine';
    }

    if (methodLower.includes('refund')) {
        // Refunds can happen for both submarine and reverse swaps
        // We'll default to reverse since user typically refunds their own failed swaps
        return 'reverse';
    }

    return undefined;
}

/**
 * Detect transaction type based on contract interaction
 */
function detectTransactionType(
    tx: ExtendedTransaction,
    userAddress: string,
    contractAddresses: ContractAddresses
): {
    type: 'send' | 'receive' | 'swap' | 'contract';
    subType?: 'lock' | 'claim' | 'refund';
    methodName?: string;
    swapType?: 'submarine' | 'reverse' | 'chain';
    isInternalEscrowPayout?: boolean;
} {
    // Add null checks to prevent "Cannot read properties of null" errors
    if (!tx.to || !tx.to.hash || !tx.from || !tx.from.hash) {
        // If transaction data is incomplete, default to contract type
        return {
            type: 'contract',
            methodName: 'unknown'
        };
    }

    if (!userAddress) {
        // If user address is missing, we can't determine send/receive
        return {
            type: 'contract',
            methodName: 'unknown'
        };
    }

    const toAddress = tx.to.hash.toLowerCase();
    const fromAddress = tx.from.hash.toLowerCase();
    const userAddr = userAddress.toLowerCase();

    // Handle internal transactions
    if (tx._isInternal) {
        const isFromEscrow = isEscrowContract(fromAddress, contractAddresses.escrowAddresses);
        const isToEscrow = isEscrowContract(toAddress, contractAddresses.escrowAddresses);
        
        // Internal transaction FROM escrow contract TO user = funds received (taskee getting paid)
        if (isFromEscrow && toAddress === userAddr) {
            return {
                type: 'receive',
                methodName: 'fundsReleased',
                isInternalEscrowPayout: true
            };
        }
        
        // Internal transaction FROM user TO escrow contract = funds sent (shouldn't happen in practice)
        if (isToEscrow && fromAddress === userAddr) {
            return {
                type: 'send',
                methodName: 'internalEscrowFunding'
            };
        }
        
        // Other internal transactions (user receiving from non-escrow contract)
        if (toAddress === userAddr) {
            return {
                type: 'receive',
                methodName: 'internalTransfer'
            };
        }
        
        // Other internal transactions (user sending via contract)
        if (fromAddress === userAddr) {
            return {
                type: 'send',
                methodName: 'internalTransfer'
            };
        }
        
        // Internal transaction not involving user (shouldn't happen as we filter by user address)
        return {
            type: 'contract',
            methodName: 'internalTransaction'
        };
    }

    // Check if it's a contract interaction
    // Add null check for tx.to.is_contract
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
        (tx.to.name === 'EtherSwap');

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

        // Determine Boltz swap type (submarine, reverse, or chain)
        const swapType = determineBoltzSwapType(methodName, fromAddress, userAddr);

        return {
            type: 'swap',
            subType,
            methodName,
            swapType,
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
    hasValue?: boolean,
    isInternalEscrowPayout?: boolean
): {
    displayType: 'send' | 'receive' | 'swap-claim' | 'contract-function';
    borderColor: 'warning' | 'success' | 'info';
    iconConfig: {
        base: Component;
        overlay: Component | null;
    };
    title: string;
} {
    // Internal escrow payout (funds released to taskee)
    if (isInternalEscrowPayout) {
        return {
            displayType: 'receive',
            borderColor: 'success',
            iconConfig: { base: IconFileDocumentOutline, overlay: IconArrowDownBold },
            title: 'wallet.transaction.funds_released'
        };
    }

    // Swap transactions
    if (type === 'swap') {
        if (subType === 'claim' || subType === 'refund') {
            return {
                displayType: 'swap-claim',
                borderColor: 'success',
                iconConfig: { base: IconArrowDownBold, overlay: null },
                title: 'wallet.received'
            };
        }
        // lock is treated as send
        return {
            displayType: 'send',
            borderColor: 'warning',
            iconConfig: { base: IconArrowUpBold, overlay: null },
            title: 'wallet.sent'
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
    if (!status || typeof status !== 'string') {
        return 'pending'; // Default to pending if status is invalid
    }
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
 * Now includes internal transactions to capture escrow payouts to freelancers
 * 
 * @param rawTransactions - Raw transactions from blockchain API
 * @param userAddress - User's wallet address
 * @param network - Network type ('rsk' or 'bsc')
 * @param currentBalanceAmount - Current balance in the active rail unit (sats for RSK, token units for BSC)
 * @returns Processed transactions with all display properties and running balances
 */
export async function processTransactions(
    rawTransactions: Transaction[],
    userAddress: string,
    network: 'rsk' | 'bsc',
    currentBalanceAmount: number
): Promise<ProcessedTransaction[]> {
    try {
        // Validate userAddress
        if (!userAddress || typeof userAddress !== 'string') {
            if (import.meta.env.DEV) {
                console.error('[processTransactions] Invalid userAddress', { userAddress, type: typeof userAddress });
            }
            return []; // Return empty array if user address is invalid
        }

        // Fetch contract addresses once
        const contractAddresses = await getContractAddresses();

        // Fetch internal transactions
        const internalTransactions = await fetchInternalTransactions(userAddress, network);
        
        // Convert internal transactions to ExtendedTransaction format
        const convertedInternalTxs = internalTransactions
            .map(internal => convertInternalToTransaction(internal, contractAddresses.escrowAddresses))
            .filter((tx): tx is ExtendedTransaction => tx !== null);

        // Merge regular and internal transactions
        const allTransactions: ExtendedTransaction[] = [...rawTransactions, ...convertedInternalTxs];
        
        // Deduplicate by hash + internal index (regular txs don't have _internalIndex)
        const uniqueTransactions = Array.from(
            new Map(
                allTransactions.map(tx => {
                    const key = tx.hash + (tx._isInternal && tx._internalIndex !== undefined ? `-internal-${tx._internalIndex}` : '');
                    return [key, tx];
                })
            ).values()
        );

        // Process all transactions in single iteration
        const processed = uniqueTransactions
        .filter((tx) => {
            // Filter out transactions with missing required fields
            if (!tx.to || !tx.to.hash || !tx.from || !tx.from.hash) {
                if (import.meta.env.DEV) {
                    console.warn('[processTransactions] Skipping transaction with missing to/from addresses', {
                        hash: tx.hash,
                        hasTo: !!tx.to,
                        hasFrom: !!tx.from,
                        toHash: tx.to?.hash,
                        fromHash: tx.from?.hash
                    });
                }
                return false;
            }
            return true;
        })
            .map((tx) => {
                // Detect transaction type
                const { type, subType, methodName, swapType, isInternalEscrowPayout } = detectTransactionType(
                    tx as Transaction & { _isInternal?: boolean },
                    userAddress,
                    contractAddresses
                );

                const bscTokenTransferSummary =
                    network === 'bsc' ? extractBscTokenTransferSummary(tx, userAddress) : null;

                // Extract transaction value
                // For swap claims/refunds, the value field is 0, but the actual amount is in decoded_input.parameters
                let valueSats = Number(weiToSatoshi(BigInt(tx.value || '0')));

                // Special handling for swap claims and refunds - extract amount from decoded input
                if (type === 'swap' && (subType === 'claim' || subType === 'refund')) {
                    if (tx.decoded_input?.parameters) {
                        const amountParam = tx.decoded_input.parameters.find((p) => p.name === 'amount');
                        if (amountParam?.value) {
                            valueSats = Number(weiToSatoshi(BigInt(amountParam.value)));
                        }
                    }
                }

                const amountUnit = bscTokenTransferSummary?.symbol || 'sats';
                const feeUnit = bscTokenTransferSummary?.symbol || 'sats';
                const balanceUnit = bscTokenTransferSummary?.symbol || 'sats';
                const normalizedValue = bscTokenTransferSummary?.amount ?? valueSats;

                // Check if transaction has value
                const hasValue = normalizedValue > 0;

                const normalizedType =
                    network === 'bsc' && bscTokenTransferSummary && type === 'contract'
                        ? bscTokenTransferSummary.direction
                        : type;
                const normalizedMethodName =
                    normalizedType === type ? methodName : undefined;

                // Determine all display properties in one go (including icon config and translation keys)
                const { displayType, borderColor, iconConfig, title } = determineDisplayProperties(
                    normalizedType,
                    subType,
                    normalizedMethodName,
                    hasValue,
                    isInternalEscrowPayout
                );

                // Calculate fee in sats (internal transactions have no gas fees)
                const feeSats = bscTokenTransferSummary
                    ? bscTokenTransferSummary.fee
                    : tx._isInternal
                        ? 0
                        : Number(weiToSatoshi(BigInt(tx.fee?.value || '0')));

                // Determine network - Lightning for submarine/reverse swaps, otherwise use provided network
                // Get network information once
                const isLightningSwap = type === 'swap' && (swapType === 'submarine' || swapType === 'reverse');
                const networkInfo = networks[isLightningSwap ? 'lightning' : network];

                // Build explorer URL
                const explorerUrl = tx.hash ? `${networkInfo.explorerBaseUrl}${tx.hash}` : null;

                // Build processed transaction with all properties computed
                // Note: We've already filtered out transactions with missing to/from, but add defensive checks
                const processedTx: ProcessedTransaction = {
                    // Core fields
                    hash: tx.hash,
                    from: tx.from?.hash || '',
                    to: tx.to?.hash || '',
                    value: normalizedValue.toString(),
                    timestamp: tx.timestamp,
                    status: statusUI[normalizeStatus(tx.status || 'pending') as keyof typeof statusUI],
                    network: isLightningSwap ? 'lightning' : network,

                    // Computed fields
                    type: normalizedType,
                    subType,
                    methodName: normalizedMethodName,

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
                    amountUnit,
                    feeUnit,
                    balanceUnit,

                    // Raw data
                    rawMethod: tx.method || undefined,
                    decodedInput: tx.decoded_input || undefined
                };

                // Add token symbol for BSC transactions if available
                if (bscTokenTransferSummary) {
                    processedTx.tokenSymbol = bscTokenTransferSummary.symbol;
                    processedTx.tokenDecimals = bscTokenTransferSummary.decimals;
                }

                return processedTx;
            });

        // Sort by timestamp (newest first) - required for balance calculation
        processed.sort((a, b) => new Date(b.timestamp)?.getTime() - new Date(a.timestamp)?.getTime());

        // Calculate running balances in single pass (working backwards from current balance)
        let runningBalance = currentBalanceAmount;

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
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('[processTransactions] Error processing transactions:', errorMessage, error);
        
        // Log additional context for debugging
        if (import.meta.env.DEV) {
            console.error('[processTransactions] Error context:', {
                userAddress,
                network,
                rawTransactionCount: rawTransactions?.length || 0,
                errorStack: error instanceof Error ? error.stack : 'No stack'
            });
        }
        
        // Return empty array on error to prevent UI crash
        return [];
    }
}

/**
 * Get explorer API URL based on network
 * Note: BSC internal transactions are not supported (BSCScan API not used)
 */
function getExplorerApiUrl(network: 'rsk' | 'bsc'): string {
    if (network === 'rsk') {
        const rskNetwork = (import.meta.env.VITE_RSK_NETWORK || 'testnet') as 'mainnet' | 'testnet';
        return rskNetwork === 'mainnet'
            ? 'https://rootstock.blockscout.com/api/v2'
            : 'https://rootstock-testnet.blockscout.com/api/v2';
    } else {
        // BSC: Internal transactions not supported (BSCScan API no longer used)
        // This function is only called for RSK, but included for type safety
        return '';
    }
}

/**
 * TODO: To be added to wallet-core
 * Fetch internal transactions from Blockscout API
 * Internal transactions show value transfers that occur inside smart contract execution
 * This is crucial for tracking escrow payouts to freelancers
 */
async function fetchInternalTransactions(
    userAddress: string,
    network: 'rsk' | 'bsc'
): Promise<InternalTransaction[]> {
    // BSCScan API doesn't support Blockscout-style internal transactions endpoint
    // Only fetch for RSK network which uses Blockscout
    if (network === 'bsc') {
        return [];
    }
    
    try {
        const explorerApiUrl = getExplorerApiUrl(network);
        const url = `${explorerApiUrl}/addresses/${userAddress}/internal-transactions`;

        const response = await fetch(url, {
            signal: AbortSignal.timeout(10000)
        });

        if (!response.ok) {
            // 404 is expected for addresses without internal transactions - only log in dev mode
            if (import.meta.env.DEV && response.status !== 404) {
                console.error(`Failed to fetch internal transactions: ${response.status}`);
            }
            return [];
        }

        const data = await response.json();
        
        // Blockscout returns { items: [...] }
        if (!data.items || !Array.isArray(data.items)) {
            // Only log in dev mode - API may return unexpected formats
            if (import.meta.env.DEV) {
                console.error('Invalid internal transactions response format:', data);
            }
            return [];
        }

        return data.items;
    } catch (error) {
        // Only log errors in dev mode - network errors are expected
        if (import.meta.env.DEV) {
            console.error('Error fetching internal transactions:', error);
        }
        return [];
    }
}

/**
 * Convert internal transaction to ExtendedTransaction format
 * This allows internal transactions to be processed alongside regular transactions
 * 
 * @param internal - Internal transaction from Blockscout API
 * @param escrowAddresses - List of escrow contract addresses to filter
 * @returns ExtendedTransaction or null if should be filtered out
 */
function convertInternalToTransaction(
    internal: InternalTransaction,
    escrowAddresses: string[]
): ExtendedTransaction | null {
    // Only process successful internal transactions
    if (!internal.success) {
        return null;
    }

    // Validate that from and to addresses exist
    if (!internal.from || !internal.from.hash || !internal.to || !internal.to.hash) {
        if (import.meta.env.DEV) {
            console.warn('[convertInternalToTransaction] Missing from/to addresses in internal transaction', {
                internal,
                hasFrom: !!internal.from,
                hasTo: !!internal.to
            });
        }
        return null;
    }

    // Only process internal transactions involving escrow contracts
    const fromLower = internal.from.hash.toLowerCase();
    const toLower = internal.to.hash.toLowerCase();
    const isFromEscrow = escrowAddresses.some(addr => addr === fromLower);
    const isToEscrow = escrowAddresses.some(addr => addr === toLower);
    
    // Filter: only include transactions that involve escrow contracts
    if (!isFromEscrow && !isToEscrow) {
        return null;
    }

    // Create an ExtendedTransaction object compatible with our processing
    // For internal transactions, we use data from the internal tx with minimal extras
    const extendedTx: ExtendedTransaction = {
        hash: internal.transaction_hash,
        from: internal.from,
        to: internal.to,
        value: internal.value,
        gas_used: '0',
        gas_price: '0',
        gas_limit: internal.gas_limit,
        block_number: internal.block_number,
        timestamp: internal.timestamp,
        status: 'ok',
        nonce: 0,
        position: 0,
        confirmations: 0,
        raw_input: '0x',
        method: null,
        decoded_input: null,
        transaction_types: ['call'],
        token_transfers: null,
        max_fee_per_gas: null,
        max_priority_fee_per_gas: null,
        base_fee_per_gas: null,
        priority_fee: null,
        transaction_burnt_fee: null,
        result: 'success',
        revert_reason: null,
        created_contract: null,
        is_pending_update: false,
        type: 0,
        has_error_in_internal_transactions: false,
        fee: {
            type: 'maximum',
            value: '0'
        },
        exchange_rate: null,
        historic_exchange_rate: null,
        confirmation_duration: null,
        token_transfers_overflow: null,
        transaction_tag: null,
        authorization_list: [],
        actions: [],
        // Extended fields to identify internal transactions
        _isInternal: true,
        _internalIndex: internal.internal_transaction_index
    };

    return extendedTx;
}
