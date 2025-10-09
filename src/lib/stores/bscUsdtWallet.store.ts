/**
 * BSC USDT Wallet Store
 * 
 * Manages BSC wallet functionality following the same patterns as the main wallet store.
 * Handles USDT transactions, BNB transfers, and EIP-7702 paymaster integration.
 * 
 * @deprecated This store is no longer used. Use wallet.store instead.
 */

import { writable, derived, get } from 'svelte/store';
import { ethers } from 'ethers';
import { BSCPaymasterContract } from '$lib/utils/wallet/BSCPaymasterContract';
import {
	ERC20_ABI,
	BSC_NETWORKS,
	getBSCPaymasterConfig,
	getUSDTToken,
} from '$lib/utils/wallet/networkConfig';
import type {
	BSCUnit,
	Transaction,
	TokenBalance,
	BSCWalletState,
	GasEstimation,
    NetworkType
} from '$lib/types/wallet';

// Unit display preferences
export const bscUnitPreference = writable<BSCUnit>('usdt');

// Initial state
const initialState: BSCWalletState = {
    isConnected: false,
    isConnecting: false,
    error: null,
    network: 'testnet', // Default to testnet for safety
    address: null,
    bnbBalance: '0',
    formattedBnbBalance: '0.00',
    blockNumber: null,
    tokenBalances: [],
    usdtBalance: '0',
    formattedUsdtBalance: '0.00',
    transactions: [],
    pendingTransactions: [],
    paymasterConnected: false,
    paymasterAddress: null,
    canPayFeesInUsdt: false
};

// Create the store
export const bscUsdtWalletStore = writable(initialState);

// Internal state
let provider: ethers.JsonRpcProvider | null = null;
let wallet: ethers.Wallet | null = null;
let usdtContract: ethers.Contract | null = null;
let paymasterContract: BSCPaymasterContract | null = null;
let eventListeners: (() => void)[] = [];


// Initialize the BSC USDT wallet
async function initialize(mnemonic: string): Promise<void> {
    try {
        bscUsdtWalletStore.update(state => ({
            ...state,
            isConnecting: true,
            error: null
        }));

        // Get current network from store
        const currentState = get(bscUsdtWalletStore);

        // Initialize provider
        const networkConfig = BSC_NETWORKS[currentState.network];
        
        // Create provider with static network to avoid auto-detection
        const network = ethers.Network.from({
            name: networkConfig.name.toLowerCase().replace(' ', '-'),
            chainId: networkConfig.chainId
        });
        
        provider = new ethers.JsonRpcProvider(networkConfig.rpcUrl, network);
        
        // Test connection with timeout to avoid infinite retry loops
        const connectionTimeout = new Promise<never>((_, reject) => 
            setTimeout(() => reject(new Error('Connection timeout')), 8000)
        );
        
        try {
            // Test basic connectivity without triggering network auto-detection
            await Promise.race([
                provider.send('eth_chainId', []),
                connectionTimeout
            ]);
            console.log('BSC provider connected successfully to chain:', networkConfig.chainId);
        } catch (error) {
            console.warn('BSC provider connection failed, but continuing with initialization:', error);
            // Set error state but don't throw - allow wallet to continue with limited functionality
            bscUsdtWalletStore.update(state => ({
                ...state,
                error: 'Network connection failed. Some features may be unavailable.'
            }));
        }

        // Create wallet from mnemonic with BSC derivation path: m/44'/60'/0'/0/0 (Ethereum standard)
        const hdNode = ethers.HDNodeWallet.fromPhrase(mnemonic, undefined, "m/44'/60'/0'/0/0");

        wallet = new ethers.Wallet(hdNode.privateKey, provider);

        bscUsdtWalletStore.update(state => ({
            ...state,
            address: wallet!.address
        }));

        // Initialize USDT contract
        const usdtToken = getUSDTToken(currentState.network);
        if (usdtToken) {
            usdtContract = new ethers.Contract(usdtToken.address, ERC20_ABI, wallet);
        }

        // Initialize paymaster contract if available
        const paymasterConfig = getBSCPaymasterConfig(currentState.network);
        if (paymasterConfig.address && paymasterConfig.address !== '0x0000000000000000000000000000000000000000') {
            if (wallet) {
                paymasterContract = new BSCPaymasterContract(
                    paymasterConfig.address,
                    provider,
                    wallet,
                    paymasterConfig
                );
            }
            await checkPaymasterConnection();
        }

        // Get initial data
        await updateBalances();
        await updateBlockNumber();
        await loadTokenBalances();
        await loadTransactionHistory();

        // Set up event listeners
        setupEventListeners();

        bscUsdtWalletStore.update(state => ({
            ...state,
            isConnected: true,
            isConnecting: false,
            error: null
        }));

    } catch (error) {
        console.error('BSC USDT Wallet initialization failed:', error);
        bscUsdtWalletStore.update(state => ({
            ...state,
            isConnecting: false,
            error: error instanceof Error ? error.message : 'Failed to initialize wallet'
        }));
    }
}

// Switch network
async function switchNetwork(network: NetworkType, mnemonic: string): Promise<void> {
    try {
        bscUsdtWalletStore.update(state => ({
            ...state,
            isConnecting: true,
            network
        }));

        // Cleanup existing connections
        cleanup();

        // Reinitialize with new network
        await initialize(mnemonic);

    } catch (error) {
        console.error('Network switch failed:', error);
        bscUsdtWalletStore.update(state => ({
            ...state,
            isConnecting: false,
            error: error instanceof Error ? error.message : 'Failed to switch network'
        }));
    }
}

// Check paymaster connection and capabilities
async function checkPaymasterConnection(): Promise<void> {
    if (!paymasterContract || !wallet) return;

    try {
        const status = await paymasterContract.getStatus();
        const currentState = get(bscUsdtWalletStore);
        const paymasterConfig = getBSCPaymasterConfig(currentState.network);

        bscUsdtWalletStore.update(state => ({
            ...state,
            paymasterConnected: status.hasDeposit,
            paymasterAddress: paymasterContract ? paymasterConfig.address : null,
            canPayFeesInUsdt: status.canPayInUsdt
        }));

    } catch (error) {
        console.error('Failed to check paymaster connection:', error);
        bscUsdtWalletStore.update(state => ({
            ...state,
            paymasterConnected: false,
            canPayFeesInUsdt: false
        }));
    }
}

// Send USDT transaction
async function sendUSDT(to: string, amount: string, payFeesInUsdt: boolean = false): Promise<string> {
    if (!wallet || !usdtContract) {
        throw new Error('Wallet or USDT contract not initialized');
    }

    try {
        // Ensure amount is a string
        const amountStr = String(amount);
        // Get USDT decimals
        const decimals = await usdtContract.decimals();
        const parsedAmount = ethers.parseUnits(amountStr, decimals);

        let tx: ethers.ContractTransactionResponse;

        if (payFeesInUsdt && paymasterContract && get(bscUsdtWalletStore).canPayFeesInUsdt) {
            // Use EIP-7702 paymaster to pay fees in USDT
            // Estimate gas cost first
            const gasEstimate = await usdtContract.transfer.estimateGas(to, parsedAmount);
            const gasPrice = await provider!.getFeeData();
            const gasCost = gasEstimate * (gasPrice.gasPrice || BigInt(0));

            // Convert gas cost to USDT
            const usdtCost = await paymasterContract.convertUsdtToBnb(gasCost);

            // Pay for transaction with USDT
            const contractInterface = usdtContract.interface;
            const transactionData = contractInterface.encodeFunctionData('transfer', [to, parsedAmount]);
            return await paymasterContract.payForTransactionWithUsdt(transactionData, usdtCost);
        } else {
            // Standard USDT transfer
            tx = await usdtContract.transfer(to, parsedAmount);
        }

        // Add to pending transactions
        const pendingTx: Transaction = {
            hash: tx.hash,
            from: wallet.address,
            to,
            value: parsedAmount.toString(),
            gasUsed: '0',
            gasPrice: tx.gasPrice?.toString() || '0',
            blockNumber: 0,
            timestamp: Date.now(),
            status: 'pending',
            type: 'send',
            network: 'bsc',
            tokenSymbol: 'USDT'
        };

        bscUsdtWalletStore.update(state => ({
            ...state,
            pendingTransactions: [...state.pendingTransactions, pendingTx]
        }));

        // Wait for confirmation
        const receipt = await tx.wait();

        // Update transaction status
        updateTransactionStatus(tx.hash, receipt);

        return tx.hash;

    } catch (error) {
        throw new Error(`USDT transfer failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

// Send BNB transaction
async function sendBNB(to: string, amount: string): Promise<string> {
    if (!wallet) {
        throw new Error('Wallet not initialized');
    }

    try {
        // Ensure amount is a string
        const amountStr = String(amount);
        const tx = await wallet.sendTransaction({
            to,
            value: ethers.parseEther(amountStr)
        });

        // Add to pending transactions
        const pendingTx: Transaction = {
            hash: tx.hash,
            from: wallet.address,
            to,
            value: ethers.parseEther(amountStr).toString(),
            gasUsed: '0',
            gasPrice: tx.gasPrice?.toString() || '0',
            blockNumber: 0,
            timestamp: Date.now(),
            status: 'pending',
            type: 'send',
            network: 'bsc'
        };

        bscUsdtWalletStore.update(state => ({
            ...state,
            pendingTransactions: [...state.pendingTransactions, pendingTx]
        }));

        // Wait for confirmation
        const receipt = await tx.wait();

        // Update transaction status
        updateTransactionStatus(tx.hash, receipt);

        return tx.hash;

    } catch (error) {
        throw new Error(`BNB transfer failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

// Estimate gas for USDT transaction
async function estimateUSDTGas(to: string, amount: string, payFeesInUsdt: boolean = false): Promise<GasEstimation> {
    if (!wallet || !usdtContract || !provider) {
        throw new Error('Wallet or contracts not initialized');
    }

    try {
        // Ensure amount is a string
        const amountStr = String(amount);
        const decimals = await usdtContract.decimals();
        const parsedAmount = ethers.parseUnits(amountStr, decimals);

        const gasPrice = await provider.getFeeData();
        const gasLimit = await usdtContract.transfer.estimateGas(to, parsedAmount);

        const totalCost = gasLimit * (gasPrice.gasPrice || BigInt(0));

        const result: GasEstimation = {
            gasLimit: gasLimit.toString(),
            gasPrice: gasPrice.gasPrice?.toString() || '0',
            totalCost: totalCost.toString(),
            totalCostFormatted: ethers.formatEther(totalCost)
        };

        // If paying fees in USDT, calculate USDT cost
        if (payFeesInUsdt && paymasterContract && get(bscUsdtWalletStore).canPayFeesInUsdt) {
            const usdtCost = await paymasterContract.estimateUsdtCost(gasLimit, gasPrice.gasPrice || BigInt(0));
            result.usdtCost = ethers.formatUnits(usdtCost, 18);
        }

        return result;

    } catch (error) {
        throw new Error(`Gas estimation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

// Estimate gas for BNB transaction
async function estimateBNBGas(to: string, amount: string): Promise<GasEstimation> {
    if (!wallet || !provider) {
        throw new Error('Wallet not initialized');
    }

    try {
        // Ensure amount is a string
        const amountStr = String(amount);
        const gasPrice = await provider.getFeeData();
        const gasLimit = await wallet.estimateGas({
            to,
            value: ethers.parseEther(amountStr)
        });

        const totalCost = gasLimit * (gasPrice.gasPrice || BigInt(0));

        return {
            gasLimit: gasLimit.toString(),
            gasPrice: gasPrice.gasPrice?.toString() || '0',
            totalCost: totalCost.toString(),
            totalCostFormatted: ethers.formatEther(totalCost)
        };

    } catch (error) {
        throw new Error(`Gas estimation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

// Update wallet balances
async function updateBalances(): Promise<void> {
    if (!wallet || !provider || !usdtContract) return;

    try {
        // Add timeout for balance operations
        const balanceTimeout = new Promise<never>((_, reject) => 
            setTimeout(() => reject(new Error('Balance update timeout')), 5000)
        );

        // Update BNB balance with timeout
        const bnbBalance = await Promise.race([
            provider.getBalance(wallet.address),
            balanceTimeout
        ]) as bigint;
        const formattedBnb = ethers.formatEther(bnbBalance);

        // Update USDT balance with timeout
        const usdtBalancePromise = Promise.all([
            usdtContract.balanceOf(wallet.address),
            usdtContract.decimals()
        ]);
        
        const [usdtBalance, decimals] = await Promise.race([
            usdtBalancePromise,
            balanceTimeout
        ]) as [bigint, number];
        
        const formattedUsdt = ethers.formatUnits(usdtBalance, decimals);

        bscUsdtWalletStore.update(state => ({
            ...state,
            bnbBalance: bnbBalance.toString(),
            formattedBnbBalance: parseFloat(formattedBnb).toFixed(6),
            usdtBalance: usdtBalance.toString(),
            formattedUsdtBalance: parseFloat(formattedUsdt).toFixed(6)
        }));

    } catch (error) {
        console.error('Failed to update balances:', error);
        // Don't retry automatically to avoid infinite loops
        bscUsdtWalletStore.update(state => ({
            ...state,
            error: 'Failed to update balances. Please check your network connection.'
        }));
    }
}

// Update current block number
async function updateBlockNumber(): Promise<void> {
    if (!provider) return;

    try {
        const blockNumber = await provider.getBlockNumber();

        bscUsdtWalletStore.update(state => ({
            ...state,
            blockNumber
        }));

    } catch (error) {
        console.error('Failed to update block number:', error);
    }
}

// Load transaction history using BSCScan API
async function loadTransactionHistory(): Promise<void> {
    if (!wallet || !provider) {
        console.log('loadTransactionHistory: wallet or provider not available', { wallet: !!wallet, provider: !!provider });
        return;
    }

    try {
        const transactions: Transaction[] = [];
        const address = wallet.address.toLowerCase();
        const network = get(bscUsdtWalletStore).network;

        console.log('Loading transaction history for address:', address, 'network:', network);

        // Get BSCScan API key from environment
        const apiKey = import.meta.env.VITE_BSCSCAN_API_KEY;

        // If no API key is configured, show pending transactions only
        if (!apiKey || apiKey === 'YourBSCScanAPIKey') {
            console.warn('BSCScan API key not configured. Only pending transactions will be shown.');

            // Add test transactions for debugging
            const testTransactions: Transaction[] = [
                {
                    hash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
                    from: address,
                    to: '0x0000000000000000000000000000000000000000',
                    value: '1000000000000000000', // 1 BNB in wei
                    gasUsed: '21000',
                    gasPrice: '5000000000',
                    blockNumber: 12345,
                    timestamp: Date.now() - 3600000, // 1 hour ago
                    status: 'confirmed',
                    type: 'send',
                    network: 'bsc'
                },
                {
                    hash: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
                    from: '0x1111111111111111111111111111111111111111',
                    to: address,
                    value: '2000000000000000000', // 2 BNB in wei
                    gasUsed: '21000',
                    gasPrice: '5000000000',
                    blockNumber: 12346,
                    timestamp: Date.now() - 7200000, // 2 hours ago
                    status: 'confirmed',
                    type: 'receive',
                    network: 'bsc'
                },
                {
                    hash: '0x9876543210fedcba9876543210fedcba9876543210fedcba9876543210fedcba',
                    from: '0x2222222222222222222222222222222222222222',
                    to: address,
                    value: '500000000000000000', // 0.5 BNB in wei
                    gasUsed: '21000',
                    gasPrice: '5000000000',
                    blockNumber: 12347,
                    timestamp: Date.now() - 10800000, // 3 hours ago
                    status: 'confirmed',
                    type: 'receive',
                    network: 'bsc',
                    tokenSymbol: 'USDT'
                }
            ];

            bscUsdtWalletStore.update(state => ({
                ...state,
                transactions: [...testTransactions, ...state.pendingTransactions]
            }));
            return;
        }

        // Use BSCScan API to get transaction history
        const explorerApiUrl = network === 'mainnet'
            ? 'https://api.bscscan.com/api'
            : 'https://api-testnet.bscscan.com/api';

        try {
            // Fetch BNB transactions
            const bnbUrl = `${explorerApiUrl}?module=account&action=txlist&address=${address}&startblock=0&endblock=99999999&sort=desc&apikey=${apiKey}`;
            console.log('Fetching BNB transactions from:', bnbUrl);

            const bnbResponse = await fetch(bnbUrl);

            if (bnbResponse.ok) {
                const bnbData = await bnbResponse.json();
                console.log('BNB transactions response:', bnbData);

                if (bnbData.result && Array.isArray(bnbData.result)) {
                    console.log('Found', bnbData.result.length, 'BNB transactions');
                    for (const tx of bnbData.result.slice(0, 50)) {
                        // Determine transaction type based on user's address
                        const isFromUser = tx.from.toLowerCase() === address;
                        const isToUser = tx.to && tx.to.toLowerCase() === address;

                        let transactionType: 'send' | 'receive' | 'contract';
                        if (isFromUser && isToUser) {
                            // Self-transaction (sending to self)
                            transactionType = 'send';
                        } else if (isFromUser) {
                            // User sent the transaction
                            transactionType = 'send';
                        } else if (isToUser) {
                            // User received the transaction
                            transactionType = 'receive';
                        } else {
                            // Contract interaction or other
                            transactionType = 'contract';
                        }

                        const transaction: Transaction = {
                            hash: tx.hash,
                            from: tx.from,
                            to: tx.to || '0x0000000000000000000000000000000000000000',
                            value: tx.value || '0',
                            gasUsed: tx.gasUsed?.toString() || '0',
                            gasPrice: tx.gasPrice?.toString() || '0',
                            blockNumber: parseInt(tx.blockNumber) || 0,
                            timestamp: parseInt(tx.timeStamp) * 1000,
                            status: tx.isError === '0' ? 'confirmed' : 'failed',
                            type: transactionType,
                            network: 'bsc'
                        };

                        transactions.push(transaction);
                    }
                }
            }

            // Fetch USDT token transactions
            const usdtToken = getUSDTToken(network);

            if (usdtToken) {
                const usdtResponse = await fetch(
                    `${explorerApiUrl}?module=account&action=tokentx&contractaddress=${usdtToken.address}&address=${address}&startblock=0&endblock=99999999&sort=desc&apikey=${apiKey}`
                );

                if (usdtResponse.ok) {
                    const usdtData = await usdtResponse.json();

                    if (usdtData.result && Array.isArray(usdtData.result)) {
                        for (const tx of usdtData.result.slice(0, 50)) {
                            // Determine transaction type based on user's address
                            const isFromUser = tx.from.toLowerCase() === address;
                            const isToUser = tx.to && tx.to.toLowerCase() === address;

                            let transactionType: 'send' | 'receive' | 'contract';
                            if (isFromUser && isToUser) {
                                // Self-transaction (sending to self)
                                transactionType = 'send';
                            } else if (isFromUser) {
                                // User sent the transaction
                                transactionType = 'send';
                            } else if (isToUser) {
                                // User received the transaction
                                transactionType = 'receive';
                            } else {
                                // Contract interaction or other
                                transactionType = 'contract';
                            }

                            const transaction: Transaction = {
                                hash: tx.hash,
                                from: tx.from,
                                to: tx.to || '0x0000000000000000000000000000000000000000',
                                value: tx.value || '0',
                                gasUsed: tx.gasUsed?.toString() || '0',
                                gasPrice: tx.gasPrice?.toString() || '0',
                                blockNumber: parseInt(tx.blockNumber) || 0,
                                timestamp: parseInt(tx.timeStamp) * 1000,
                                status: tx.isError === '0' ? 'confirmed' : 'failed',
                                type: transactionType,
                                network: 'bsc',
                                tokenSymbol: 'USDT'
                            };

                            transactions.push(transaction);
                        }
                    }
                }
            }

        } catch (apiError) {
            console.error('Failed to fetch from BSCScan API:', apiError);
            // If API fails, at least show pending transactions
            bscUsdtWalletStore.update(state => ({
                ...state,
                transactions: state.pendingTransactions
            }));
            return;
        }

        // Sort transactions by timestamp and remove duplicates
        const uniqueTransactions = transactions
            .filter((tx, index, self) =>
                index === self.findIndex(t => t.hash === tx.hash)
            )
            .sort((a, b) => b.timestamp - a.timestamp)
            .slice(0, 100); // Limit to 100 most recent

        console.log('Final unique transactions:', uniqueTransactions.length, uniqueTransactions);

        bscUsdtWalletStore.update(state => ({
            ...state,
            transactions: uniqueTransactions
        }));

    } catch (error) {
        console.error('Failed to load transaction history:', error);
    }
}

// Update transaction status when confirmed
function updateTransactionStatus(hash: string, receipt: ethers.TransactionReceipt | null): void {
    if (!receipt) return;

    bscUsdtWalletStore.update(state => {
        // Remove from pending
        const pendingTransactions = state.pendingTransactions.filter(tx => tx.hash !== hash);

        // Add to confirmed transactions
        const confirmedTx: Transaction = {
            hash,
            from: receipt.from,
            to: receipt.to || '',
            value: '0', // Would need to get from original transaction
            gasUsed: receipt.gasUsed.toString(),
            gasPrice: receipt.gasPrice?.toString() || '0',
            blockNumber: receipt.blockNumber,
            timestamp: Date.now(),
            status: receipt.status === 1 ? 'confirmed' : 'failed',
            type: 'send',
            network: 'bsc'
        };

        return {
            ...state,
            pendingTransactions,
            transactions: [confirmedTx, ...state.transactions]
        };
    });

    // Update balance after transaction
    updateBalances();
}

// Load token balances
async function loadTokenBalances(): Promise<void> {
    if (!wallet || !provider) return;

    try {
        const network = get(bscUsdtWalletStore).network;
        const networkConfig = BSC_NETWORKS[network];

        const tokenBalances: TokenBalance[] = [];

        for (const token of networkConfig.tokens) {
            try {
                const tokenContract = new ethers.Contract(token.address, ERC20_ABI, provider);
                const balance = await tokenContract.balanceOf(wallet.address);
                const formattedBalance = ethers.formatUnits(balance, token.decimals);

                tokenBalances.push({
                    token,
                    balance,
                    formattedBalance
                });
            } catch (error) {
                console.error(`Failed to load balance for token ${token.symbol}:`, error);
                // Add zero balance for failed tokens
                tokenBalances.push({
                    token,
                    balance: BigInt(0),
                    formattedBalance: '0.0'
                });
            }
        }

        bscUsdtWalletStore.update(state => ({
            ...state,
            tokenBalances
        }));

    } catch (error) {
        console.error('Failed to load token balances:', error);
    }
}

// Set up event listeners
function setupEventListeners(): void {
    if (!provider) return;

    // Listen for new blocks
    const blockListener = (blockNumber: number) => {
        bscUsdtWalletStore.update(state => ({
            ...state,
            blockNumber
        }));
    };

    provider.on('block', blockListener);
    eventListeners.push(() => provider?.off('block', blockListener));

    // Set up periodic balance updates
    const balanceInterval = setInterval(() => {
        updateBalances();
    }, 30000); // Every 30 seconds

    eventListeners.push(() => clearInterval(balanceInterval));

    // Listen for USDT Transfer events
    if (usdtContract && wallet) {
        const transferListener = (from: string, to: string, value: bigint) => {
            const userAddress = wallet!.address.toLowerCase();
            if (from.toLowerCase() === userAddress || to.toLowerCase() === userAddress) {
                // Refresh balances when USDT transfers occur
                updateBalances();
            }
        };

        usdtContract.on('Transfer', transferListener);
        eventListeners.push(() => usdtContract?.off('Transfer', transferListener));
    }
}

// Cleanup function
function cleanup(): void {
    // Remove all event listeners
    eventListeners.forEach(cleanup => cleanup());
    eventListeners.splice(0, eventListeners.length);

    // Reset provider and wallet
    provider = null;
    wallet = null;
    usdtContract = null;
    paymasterContract = null;

    // Reset store state
    bscUsdtWalletStore.set(initialState);
}

// Paymaster management functions
async function depositToPaymaster(amount: string): Promise<string> {
    if (!paymasterContract) {
        throw new Error('Paymaster not initialized');
    }

    try {
        const amountWei = ethers.parseEther(amount);
        return await paymasterContract.deposit(amountWei);
    } catch (error) {
        throw new Error(`Failed to deposit to paymaster: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

async function withdrawFromPaymaster(amount: string): Promise<string> {
    if (!paymasterContract) {
        throw new Error('Paymaster not initialized');
    }

    try {
        const amountWei = ethers.parseEther(amount);
        return await paymasterContract.withdraw(amountWei);
    } catch (error) {
        throw new Error(`Failed to withdraw from paymaster: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

async function getPaymasterStatus(): Promise<{
    hasDeposit: boolean;
    depositAmount: string;
    canPayInUsdt: boolean;
    usdtPrice: string;
    minDeposit: string;
}> {
    if (!paymasterContract) {
        return {
            hasDeposit: false,
            depositAmount: '0',
            canPayInUsdt: false,
            usdtPrice: '0',
            minDeposit: '0'
        };
    }

    try {
        const status = await paymasterContract.getStatus();
        return {
            hasDeposit: status.hasDeposit,
            depositAmount: ethers.formatEther(status.depositAmount),
            canPayInUsdt: status.canPayInUsdt,
            usdtPrice: ethers.formatEther(status.usdtPrice),
            minDeposit: ethers.formatEther(status.minDeposit)
        };
    } catch (error) {
        console.error('Failed to get paymaster status:', error);
        return {
            hasDeposit: false,
            depositAmount: '0',
            canPayInUsdt: false,
            usdtPrice: '0',
            minDeposit: '0'
        };
    }
}

// Export service methods
export const bscUsdtWallet = {
    initialize,
    switchNetwork,
    sendUSDT,
    sendBNB,
    estimateUSDTGas,
    estimateBNBGas,
    loadTokenBalances,
    refreshTransactions: loadTransactionHistory,
    cleanup,
    checkPaymasterConnection,

    // Paymaster management
    depositToPaymaster,
    withdrawFromPaymaster,
    getPaymasterStatus
};

// Unit conversion utilities
export function formatBSCAmount(amount: string, unit: BSCUnit, decimals: number = 6): string {
    if (!amount || amount === '0') return '0';

    try {
        if (unit === 'wei') {
            // Convert USDT to wei (assuming 18 decimals)
            const weiAmount = ethers.parseUnits(amount, 18);
            return weiAmount.toString();
        } else {
            // Format USDT with specified decimal places
            const num = parseFloat(amount);
            return num.toFixed(decimals).replace(/\.?0+$/, '');
        }
    } catch (error) {
        console.error('Error formatting BSC amount:', error);
        return amount;
    }
}

export function parseBSCAmount(amount: string, fromUnit: BSCUnit): string {
    if (!amount || amount === '0') return '0';

    try {
        if (fromUnit === 'wei') {
            // Convert wei to USDT (assuming 18 decimals)
            return ethers.formatUnits(amount, 18);
        } else {
            // Already in USDT
            return amount;
        }
    } catch (error) {
        console.error('Error parsing BSC amount:', error);
        return amount;
    }
}

// Enhanced balance derived store with unit formatting
export const bscUsdtBalance = derived(
    [bscUsdtWalletStore, bscUnitPreference],
    ([$store, $unit]) => {
        if (!$store.formattedUsdtBalance) return '0';
        return formatBSCAmount($store.formattedUsdtBalance, $unit);
    }
);

export const bscBnbBalance = derived(
    bscUsdtWalletStore,
    $store => $store.formattedBnbBalance
);

// Derived stores for convenience
export const bscAddress = derived(bscUsdtWalletStore, $store => $store.address);
export const bscTokenBalances = derived(bscUsdtWalletStore, $store => $store.tokenBalances);
export const bscTransactions = derived(bscUsdtWalletStore, $store => $store.transactions);
export const bscNetwork = derived(bscUsdtWalletStore, $store => $store.network);
export const bscCanPayFeesInUsdt = derived(bscUsdtWalletStore, $store => $store.canPayFeesInUsdt);
export const bscPaymasterConnected = derived(bscUsdtWalletStore, $store => $store.paymasterConnected);
