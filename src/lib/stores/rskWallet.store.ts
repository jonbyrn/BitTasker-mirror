import type { RSKTransaction, RSKUnit, RSKWalletState } from '$lib/types/wallet';
import { ethers } from 'ethers';
import { writable, derived, get } from 'svelte/store';
import { getMnemonic } from '$lib/utils/helpers/mnemonic';
import { RSK_NETWORKS, type RSKNetwork } from '$lib/utils/wallet/escrowContract';

// Initial state
const initialState: RSKWalletState = {
    isConnected: false,
    isConnecting: false,
    error: null,
    network: import.meta.env.VITE_RSK_NETWORK,
    address: null,
    balance: '0',
    formattedBalance: '0.00',
    blockNumber: null,
    unitPreference: 'rbtc',
    tokenBalances: [],
    transactions: [],
    pendingTransactions: [],
    escrows: [],
    disputeProposals: [],
    contractAddress: null,
    contractConnected: false,
    contractConfig: null
};

// Create the store
export const rskWalletStore = writable(initialState);

// Internal state
let provider: ethers.JsonRpcProvider | null = null;
let wallet: ethers.Wallet | null = null;
let eventListeners: (() => void)[] = [];

// Export getters for wallet and provider (for use by escrow utilities)
export function getRSKWallet(): ethers.Wallet | null {
    return wallet;
}

export function getRSKProvider(): ethers.JsonRpcProvider | null {
    return provider;
}

export function getEventListeners(): (() => void)[] {
    return eventListeners;
}

// Initialize wallet from mnemonic
async function initializeWallet(): Promise<void> {
    try {
        const mnemonic = await getMnemonic();

        if (!mnemonic) {
            throw new Error('No wallet mnemonic found. Please set up your wallet first.');
        }

        // Create wallet from mnemonic with RSK derivation path: m/44'/137'/0'/0/0
        const hdNode = ethers.HDNodeWallet.fromPhrase(mnemonic, undefined, "m/44'/137'/0'/0/0");

        wallet = new ethers.Wallet(hdNode.privateKey, provider);

        rskWalletStore.update(state => ({
            ...state,
            address: wallet!.address
        }));

    } catch (error) {
        throw new Error(`Failed to initialize wallet: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

// Initialize the RSK wallet
async function initialize(): Promise<void> {
    try {
        rskWalletStore.update(state => ({
            ...state,
            isConnecting: true,
            error: null
        }));

        // Get current network from store
        const currentState = get(rskWalletStore);

        // Initialize provider
        const networkConfig = RSK_NETWORKS[currentState.network];
        provider = new ethers.JsonRpcProvider(networkConfig.rpcUrl);

        // Initialize wallet from existing mnemonic
        await initializeWallet();

        // Get initial data
        await updateBalance();
        await updateBlockNumber();
        // await loadTokenBalances();
        await loadTransactionHistory();

        // Set up event listeners
        setupEventListeners();

        rskWalletStore.update(state => ({
            ...state,
            isConnected: true,
            isConnecting: false,
            error: null
        }));

    } catch (error) {
        console.error('RSK Wallet initialization failed:', error);
        rskWalletStore.update(state => ({
            ...state,
            isConnecting: false,
            error: error instanceof Error ? error.message : 'Failed to initialize wallet'
        }));
    }
}

// Send RBTC transaction
async function sendRBTC(to: string, amount: string, gasLimit?: string): Promise<string> {
    if (!wallet) {
        throw new Error('Wallet not initialized');
    }

    try {
        const tx = await wallet.sendTransaction({
            to,
            value: ethers.parseEther(amount),
            gasLimit: gasLimit ? BigInt(gasLimit) : undefined
        });

        // Add to pending transactions
        const pendingTx: RSKTransaction = {
            hash: tx.hash,
            from: wallet.address,
            to,
            value: ethers.parseEther(amount).toString(),
            gasUsed: '0',
            gasPrice: tx.gasPrice?.toString() || '0',
            blockNumber: 0,
            timestamp: Date.now(),
            status: 'pending',
            type: 'send'
        };

        rskWalletStore.update(state => ({
            ...state,
            pendingTransactions: [...state.pendingTransactions, pendingTx]
        }));

        // Wait for confirmation
        const receipt = await tx.wait();

        // Update transaction status
        updateTransactionStatus(tx.hash, receipt);

        return tx.hash;

    } catch (error) {
        throw new Error(`Transaction failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

// Estimate gas for transaction
async function estimateGas(to: string, amount: string): Promise<{ gasLimit: string; gasPrice: string; totalCost: string }> {
    if (!wallet || !provider) {
        throw new Error('Wallet not initialized');
    }

    try {
        const gasPrice = await provider.getFeeData();
        const gasLimit = await wallet.estimateGas({
            to,
            value: ethers.parseEther(amount)
        });

        const totalCost = gasLimit * (gasPrice.gasPrice || BigInt(0));

        return {
            gasLimit: gasLimit.toString(),
            gasPrice: gasPrice.gasPrice?.toString() || '0',
            totalCost: ethers.formatEther(totalCost)
        };

    } catch (error) {
        throw new Error(`Gas estimation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

// Update wallet balance
async function updateBalance(): Promise<void> {
    if (!wallet || !provider) return;

    try {
        const balance = await provider.getBalance(wallet.address);
        const formatted = ethers.formatEther(balance);

        rskWalletStore.update(state => ({
            ...state,
            balance: balance.toString(),
            formattedBalance: parseFloat(formatted).toFixed(6)
        }));

    } catch (error) {
        console.error('Failed to update balance:', error);
    }
}

// Update current block number
async function updateBlockNumber(): Promise<void> {
    if (!provider) return;

    try {
        const blockNumber = await provider.getBlockNumber();

        rskWalletStore.update(state => ({
            ...state,
            blockNumber
        }));

    } catch (error) {
        console.error('Failed to update block number:', error);
    }
}

// Load transaction history using RSK Explorer API
async function loadTransactionHistory(): Promise<void> {
    if (!wallet || !provider) return;

    try {
        const transactions: RSKTransaction[] = [];
        const address = wallet.address.toLowerCase();
        const network = get(rskWalletStore).network;

        // Use RSK Explorer API to get transaction history
        const explorerApiUrl = network === 'mainnet'
            ? 'https://rootstock.blockscout.com/api'
            : 'https://rootstock-testnet.blockscout.com/api';

        try {
            // Fetch transactions from RSK Explorer API
            const response = await fetch(
                `${explorerApiUrl}/v2/addresses/${address}/transactions`
            );

            if (!response.ok) {
                throw new Error(`API responded with status: ${response.status} - ${response.text()}`);
            }

            const data = await response.json();

            if (data.items && Array.isArray(data.items)) {
                for (const tx of data.items.slice(0, 50)) { // Limit to 50 most recent
                    const transaction: RSKTransaction = {
                        hash: tx.hash,
                        from: tx.from.hash,
                        to: tx.to?.hash || '0x0000000000000000000000000000000000000000',
                        value: tx.value || '0',
                        gasUsed: tx.gas_used?.toString() || '0',
                        gasPrice: tx.gas_price?.toString() || '0',
                        blockNumber: parseInt(tx.block_number) || 0,
                        timestamp: new Date(tx.timestamp).getTime(),
                        status: tx.status === 'ok' ? 'confirmed' : 'failed',
                        type: tx.from.hash.toLowerCase() === address ? 'send' : 'receive'
                    };

                    transactions.push(transaction);
                }

            }

        } catch (apiError) {
            console.error('Failed to fetch from explorer API:', apiError);

            // Try alternative API endpoint format
            try {
                const altResponse = await fetch(
                    `${explorerApiUrl}/v2/addresses/${address}/transactions?type=all`
                );

                if (altResponse.ok) {
                    const altData = await altResponse.json();

                    if (altData.items && Array.isArray(altData.items)) {
                        for (const tx of altData.items.slice(0, 50)) {
                            const transaction: RSKTransaction = {
                                hash: tx.hash,
                                from: tx.from?.hash || tx.from,
                                to: tx.to?.hash || tx.to || '0x0000000000000000000000000000000000000000',
                                value: tx.value || '0',
                                gasUsed: tx.gas_used?.toString() || '0',
                                gasPrice: tx.gas_price?.toString() || '0',
                                blockNumber: parseInt(tx.block_number) || 0,
                                timestamp: new Date(tx.timestamp).getTime(),
                                status: tx.status === 'ok' ? 'confirmed' : 'failed',
                                type: (tx.from?.hash || tx.from)?.toLowerCase() === address ? 'send' : 'receive'
                            };

                            transactions.push(transaction);
                        }

                    }
                }
            } catch (altError) {
                console.error('Alternative API also failed:', altError);

                // Try v1 API as final fallback
                try {
                    const v1Response = await fetch(
                        `${explorerApiUrl}?module=account&action=txlist&address=${address}&startblock=0&endblock=99999999&sort=desc`
                    );

                    if (v1Response.ok) {
                        const v1Data = await v1Response.json();

                        if (v1Data.result && Array.isArray(v1Data.result)) {
                            for (const tx of v1Data.result.slice(0, 50)) {
                                const transaction: RSKTransaction = {
                                    hash: tx.hash,
                                    from: tx.from,
                                    to: tx.to || '0x0000000000000000000000000000000000000000',
                                    value: tx.value || '0',
                                    gasUsed: tx.gasUsed?.toString() || '0',
                                    gasPrice: tx.gasPrice?.toString() || '0',
                                    blockNumber: parseInt(tx.blockNumber) || 0,
                                    timestamp: parseInt(tx.timeStamp) * 1000, // Convert to milliseconds
                                    status: tx.isError === '0' ? 'confirmed' : 'failed',
                                    type: tx.from.toLowerCase() === address ? 'send' : 'receive'
                                };

                                transactions.push(transaction);
                            }
                        }
                    }
                } catch (v1Error) {
                    console.error('V1 API also failed:', v1Error);

                    // Final fallback: Check transaction count
                    const txCount = await provider.getTransactionCount(wallet.address);

                    if (txCount > 0) {
                        throw new Error(`Address has ${txCount} transactions, but all APIs are unavailable`);
                    }
                }
            }
        }

        rskWalletStore.update(state => ({
            ...state,
            transactions
        }));

    } catch (error) {
        console.error('Failed to load transaction history:', error);
    }
}

// Update transaction status when confirmed
function updateTransactionStatus(hash: string, receipt: ethers.TransactionReceipt | null): void {
    if (!receipt) return;

    rskWalletStore.update(state => {
        // Remove from pending
        const pendingTransactions = state.pendingTransactions.filter(tx => tx.hash !== hash);

        // Add to confirmed transactions
        const confirmedTx: RSKTransaction = {
            hash,
            from: receipt.from,
            to: receipt.to || '',
            value: '0', // Would need to get from original transaction
            gasUsed: receipt.gasUsed.toString(),
            gasPrice: receipt.gasPrice?.toString() || '0',
            blockNumber: receipt.blockNumber,
            timestamp: Date.now(),
            status: receipt.status === 1 ? 'confirmed' : 'failed',
            type: 'send'
        };

        return {
            ...state,
            pendingTransactions,
            transactions: [confirmedTx, ...state.transactions]
        };
    });

    // Update balance after transaction
    updateBalance();
}

// Set up event listeners
function setupEventListeners(): void {
    if (!provider) return;

    // Listen for new blocks
    const blockListener = (blockNumber: number) => {
        rskWalletStore.update(state => ({
            ...state,
            blockNumber
        }));
    };

    provider.on('block', blockListener);
    eventListeners.push(() => provider?.off('block', blockListener));

    // Set up periodic balance updates
    const balanceInterval = setInterval(() => {
        updateBalance();
    }, 30000); // Every 30 seconds

    eventListeners.push(() => clearInterval(balanceInterval));
}

// Cleanup function
function cleanup(): void {
    // Remove all event listeners
    eventListeners.forEach(cleanup => cleanup());
    eventListeners.splice(0, eventListeners.length);

    // Reset provider and wallet
    provider = null;
    wallet = null;

    // Reset store state
    rskWalletStore.set(initialState);
}

// Export service methods following app.store.ts pattern
export const rskWallet = {
    initialize,
    sendRBTC,
    estimateGas,
    refreshTransactions: loadTransactionHistory,
    cleanup,
    updateTransactionStatus,
    initializeWallet
};

// Unit conversion utilities
export function formatRSKAmount(amount: string, unit: RSKUnit, decimals: number = 6): string {
    if (!amount || amount === '0') return '0';

    try {
        if (unit === 'wei') {
            // Convert RBTC to wei
            const weiAmount = ethers.parseEther(amount);
            return weiAmount.toString();
        } else {
            // Format RBTC with specified decimal places
            const num = parseFloat(amount);
            return num.toFixed(decimals).replace(/\.?0+$/, '');
        }
    } catch (error) {
        console.error('Error formatting RSK amount:', error);
        return amount;
    }
}

export function parseRSKAmount(amount: string, fromUnit: RSKUnit): string {
    if (!amount || amount === '0') return '0';

    try {
        if (fromUnit === 'wei') {
            // Convert wei to RBTC
            return ethers.formatEther(amount);
        } else {
            // Already in RBTC
            return amount;
        }
    } catch (error) {
        console.error('Error parsing RSK amount:', error);
        return amount;
    }
}

export function getUnitLabel(unit: RSKUnit, network: RSKNetwork): string {
    if (unit === 'wei') {
        return 'wei';
    }
    return RSK_NETWORKS[network]?.currency.symbol || 'RBTC';
}

// Enhanced balance derived store with unit formatting
export const rskBalance = derived(rskWalletStore, $store => {
    if (!$store.formattedBalance) return '0';
    return formatRSKAmount($store.formattedBalance, $store.unitPreference);
})

// Derived stores for convenience
export const rskAddress = derived(rskWalletStore, $store => $store.address);
export const rskTokenBalances = derived(rskWalletStore, $store => $store.tokenBalances);
export const rskTransactions = derived(rskWalletStore, $store => $store.transactions);
export const rskEscrows = derived(rskWalletStore, $store => $store.escrows);
export const rskDisputeProposals = derived(rskWalletStore, $store => $store.disputeProposals);
export const rskNetwork = derived(rskWalletStore, $store => $store.network);
export const rskContractConnected = derived(rskWalletStore, $store => $store.contractConnected);
export const rskContractAddress = derived(rskWalletStore, $store => $store.contractAddress);
