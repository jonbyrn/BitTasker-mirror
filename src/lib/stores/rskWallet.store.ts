import { writable, derived, get } from 'svelte/store';
import { ethers } from 'ethers';
import { decryptWalletMnemonicWithBiometrics } from '$lib/utils/helpers/auth';
import { appStore } from '$lib/stores/app.store';
import { checkBiometricAvailability, getBiometricData } from '$lib/utils/helpers/biometrics';
import { getWebBiometricData } from '$lib/utils/helpers/webBiometrics';
import { Preferences } from '@capacitor/preferences';
import { StorageKeys } from '$lib/utils/constants/storage';
import { 
    calculateFeeAmount, 
    calculateTotalPayment, 
    calculateFreelancerPayout,
    FEE_TIERS,
    EscrowStatus,
    TIMELOCK_PERIODS,
    type FeeTier,
    type ContractConfig
} from '$lib/contracts/SimplifiedEscrowContract';
import { getEscrowContractConfig } from '$lib/config/escrow.config';

// Unit display preferences
export type RSKUnit = 'rbtc' | 'wei';
export const rskUnitPreference = writable<RSKUnit>('rbtc');

// ERC-20 Token Configuration
export interface RSKToken {
    address: string;
    symbol: string;
    name: string;
    decimals: number;
    logoUrl?: string;
}

// ERC-20 ABI (minimal for basic operations)
const ERC20_ABI = [
    'function name() view returns (string)',
    'function symbol() view returns (string)',
    'function decimals() view returns (uint8)',
    'function totalSupply() view returns (uint256)',
    'function balanceOf(address owner) view returns (uint256)',
    'function transfer(address to, uint256 amount) returns (bool)',
    'function transferFrom(address from, address to, uint256 amount) returns (bool)',
    'function approve(address spender, uint256 amount) returns (bool)',
    'function allowance(address owner, address spender) view returns (uint256)',
    'event Transfer(address indexed from, address indexed to, uint256 value)',
    'event Approval(address indexed owner, address indexed spender, uint256 value)'
];

// RSK Network Configuration
export const RSK_NETWORKS = {
    mainnet: {
        name: 'RSK Mainnet',
        chainId: 30,
        rpcUrl: 'https://public-node.rsk.co',
        explorerUrl: 'https://explorer.rsk.co',
        currency: {
            name: 'Smart Bitcoin',
            symbol: 'RBTC',
            decimals: 18
        },
        /* tokens: [
            {
                address: '0xEf213441a85dF4d7acBdAe0Cf78004E1e486BB96',
                symbol: 'USDT',
                name: 'Tether USD',
                decimals: 18
            },
            {
                address: '0x1BdA44fDA023F2aF8280A16fd1b01d1A493Ba6C4',
                symbol: 'USDC',
                name: 'USD Coin',
                decimals: 18
            },
            {
                address: '0x967f8799aF07DF1534d48A95a5C9FEBE92c53ae0',
                symbol: 'WETH',
                name: 'Wrapped Ether',
                decimals: 18
            }
        ] as RSKToken[] */
    },
    testnet: {
        name: 'RSK Testnet',
        chainId: 31,
        rpcUrl: 'https://public-node.testnet.rsk.co',
        explorerUrl: 'https://explorer.testnet.rsk.co',
        currency: {
            name: 'Testnet Smart Bitcoin',
            symbol: 'tRBTC',
            decimals: 18
        },
        /* tokens: [
            {
                address: '0x19F64674D8A5B4E652319F5e239eFd3bc969A1fE',
                symbol: 'tUSDT',
                name: 'Testnet Tether USD',
                decimals: 18
            },
            {
                address: '0x5A0b54D5dc17e0AadC383d2db43B0a0D3E029c4c',
                symbol: 'tUSDC',
                name: 'Testnet USD Coin',
                decimals: 18
            }
        ] as RSKToken[] */
    }
} as const;

export type RSKNetwork = keyof typeof RSK_NETWORKS;

// Transaction types
export interface RSKTransaction {
    hash: string;
    from: string;
    to: string;
    value: string;
    gasUsed: string;
    gasPrice: string;
    blockNumber: number;
    timestamp: number;
    status: 'pending' | 'confirmed' | 'failed';
    type: 'send' | 'receive' | 'contract';
}

// Enhanced Escrow types
export interface EscrowData {
    id: string;
    client: string;
    freelancer: string;
    baseAmount: string;
    clientFee: string;
    freelancerFee: string;
    totalAmount: string;
    status: EscrowStatus;
    estimatedStartTime: number;
    estimatedCompletionTime: number;
    completionTime: number;
    timelockExpiry: number;
    clientFeeTier: FeeTier;
    freelancerFeeTier: FeeTier;
    createdAt: number;
    lastUpdated: number;
}

// Dispute proposal interface
export interface DisputeProposal {
    escrowId: string;
    proposer: string;
    clientAmount: string;
    freelancerAmount: string;
    timestamp: number;
    accepted: boolean;
}

// Gas estimation result
export interface GasEstimation {
    gasLimit: string;
    gasPrice: string;
    totalCost: string;
    totalCostFormatted: string;
}

// Contract transaction result
export interface ContractTransactionResult {
    hash: string;
    escrowId?: string;
    gasUsed?: string;
    status: 'pending' | 'confirmed' | 'failed';
}

// Token balance interface
export interface TokenBalance {
    token: RSKToken;
    balance: bigint;
    formattedBalance: string;
}

// Store state interface
interface RSKWalletState {
    // Connection
    isConnected: boolean;
    isConnecting: boolean;
    error: string | null;
    network: RSKNetwork;

    // Wallet
    address: string | null;
    balance: string;
    formattedBalance: string;
    blockNumber: number | null;

    // Tokens
    tokenBalances: TokenBalance[];

    // Transactions
    transactions: RSKTransaction[];
    pendingTransactions: RSKTransaction[];

    // Escrows
    escrows: EscrowData[];
    disputeProposals: DisputeProposal[];

    // Contract
    contractAddress: string | null;
    contractConnected: boolean;
    contractConfig: ContractConfig | null;
}

// Initial state
const initialState: RSKWalletState = {
    isConnected: false,
    isConnecting: false,
    error: null,
    network: 'testnet', // Default to testnet for safety
    address: null,
    balance: '0',
    formattedBalance: '0.00',
    blockNumber: null,
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
let contract: ethers.Contract | null = null;
let eventListeners: (() => void)[] = [];

// Helper function to get mnemonic using the same logic as wallet.store.ts
async function getMnemonic(): Promise<string> {
    try {
        // Check if we have biometric data with master key format
        const currentState = get(appStore);
        if (!currentState.biometricData) {
            const biometricsAvailable = await checkBiometricAvailability();
            let biometricData = null;
            if (biometricsAvailable) {
                const { value: authMethod } = await Preferences.get({ key: StorageKeys.AUTH_METHOD });
                biometricData = await getBiometricData(authMethod as 'biometrics' | 'passkey', true);
            } else {
                biometricData = await getWebBiometricData(true);
            }

            if (!biometricData) throw new Error('No biometric data found');
            return await decryptWalletMnemonicWithBiometrics(biometricData.password);
        } else {
            return await decryptWalletMnemonicWithBiometrics(currentState.biometricData.password);
        }
    } catch (error) {
        throw new Error(error instanceof Error ? error.message : 'Failed to get mnemonic');
    }
}

// Initialize wallet from mnemonic
async function initializeWalletFromMnemonic(): Promise<void> {
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
        await initializeWalletFromMnemonic();

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

// Switch network
async function switchNetwork(network: RSKNetwork): Promise<void> {
    try {
        rskWalletStore.update(state => ({
            ...state,
            isConnecting: true,
            network
        }));

        // Cleanup existing connections
        cleanup();

        // Reinitialize with new network
        await initialize();

    } catch (error) {
        console.error('Network switch failed:', error);
        rskWalletStore.update(state => ({
            ...state,
            isConnecting: false,
            error: error instanceof Error ? error.message : 'Failed to switch network'
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
    contract = null;

    // Reset store state
    rskWalletStore.set(initialState);
}

// Connect to escrow contract
async function connectToEscrowContract(): Promise<void> {
    if (!wallet || !provider) {
        throw new Error('Wallet not initialized');
    }

    try {
        const network = get(rskWalletStore).network;
        const contractConfig = getEscrowContractConfig(network);
        
        contract = new ethers.Contract(contractConfig.address, contractConfig.abi, wallet);

        rskWalletStore.update(state => ({
            ...state,
            contractAddress: contractConfig.address,
            contractConnected: true,
            contractConfig
        }));

        // Set up contract event listeners
        setupContractEventListeners();

        // Load existing escrows for the user
        await loadUserEscrows();

        console.log('Successfully connected to escrow contract:', contractConfig.address);

    } catch (error) {
        throw new Error(`Failed to connect to contract: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

// Set up contract event listeners
function setupContractEventListeners(): void {
    if (!contract || !wallet) return;

    const userAddress = wallet.address.toLowerCase();

    // Listen for EscrowCreated events
    const escrowCreatedListener = (escrowId: bigint, client: string, freelancer: string, amount: bigint) => {
        // Only handle events where user is involved
        if (client.toLowerCase() !== userAddress && freelancer.toLowerCase() !== userAddress) return;

        loadEscrowDetails(escrowId.toString()).then(escrowData => {
            if (escrowData) {
                rskWalletStore.update(state => ({
                    ...state,
                    escrows: [escrowData, ...state.escrows.filter(e => e.id !== escrowData.id)]
                }));
            }
        }).catch(console.error);
    };

    // Listen for TaskCompleted events
    const taskCompletedListener = (escrowId: bigint) => {
        updateEscrowStatus(escrowId.toString(), EscrowStatus.Completed);
    };

    // Listen for TaskAccepted events
    const taskAcceptedListener = (escrowId: bigint) => {
        updateEscrowStatus(escrowId.toString(), EscrowStatus.Resolved);
    };

    // Listen for TaskDisputed events
    const taskDisputedListener = (escrowId: bigint, disputer: string) => {
        updateEscrowStatus(escrowId.toString(), EscrowStatus.InDispute);
    };

    // Listen for DisputeProposed events
    const disputeProposedListener = (escrowId: bigint, proposer: string, clientAmount: bigint, freelancerAmount: bigint) => {
        loadDisputeProposal(escrowId.toString()).then(proposal => {
            if (proposal) {
                rskWalletStore.update(state => ({
                    ...state,
                    disputeProposals: [proposal, ...state.disputeProposals.filter(p => p.escrowId !== proposal.escrowId)]
                }));
            }
        }).catch(console.error);
    };

    // Listen for DisputeResolved events
    const disputeResolvedListener = (escrowId: bigint, clientAmount: bigint, freelancerAmount: bigint) => {
        updateEscrowStatus(escrowId.toString(), EscrowStatus.Resolved);
        // Remove dispute proposal
        rskWalletStore.update(state => ({
            ...state,
            disputeProposals: state.disputeProposals.filter(p => p.escrowId !== escrowId.toString())
        }));
    };

    // Listen for EscrowCancelled events
    const escrowCancelledListener = (escrowId: bigint, clientAmount: bigint, freelancerAmount: bigint) => {
        updateEscrowStatus(escrowId.toString(), EscrowStatus.Cancelled);
    };

    // Listen for EscrowResolved events
    const escrowResolvedListener = (escrowId: bigint, freelancerAmount: bigint, platformFee: bigint) => {
        updateEscrowStatus(escrowId.toString(), EscrowStatus.Resolved);
    };

    // Set up all event listeners
    contract.on('EscrowCreated', escrowCreatedListener);
    contract.on('TaskCompleted', taskCompletedListener);
    contract.on('TaskAccepted', taskAcceptedListener);
    contract.on('TaskDisputed', taskDisputedListener);
    contract.on('DisputeProposed', disputeProposedListener);
    contract.on('DisputeResolved', disputeResolvedListener);
    contract.on('EscrowCancelled', escrowCancelledListener);
    contract.on('EscrowResolved', escrowResolvedListener);

    // Store cleanup functions
    eventListeners.push(() => {
        if (contract) {
            contract.off('EscrowCreated', escrowCreatedListener);
            contract.off('TaskCompleted', taskCompletedListener);
            contract.off('TaskAccepted', taskAcceptedListener);
            contract.off('TaskDisputed', taskDisputedListener);
            contract.off('DisputeProposed', disputeProposedListener);
            contract.off('DisputeResolved', disputeResolvedListener);
            contract.off('EscrowCancelled', escrowCancelledListener);
            contract.off('EscrowResolved', escrowResolvedListener);
        }
    });
}

// Load token balances
async function loadTokenBalances(): Promise<void> {
    if (!wallet || !provider) return;

    try {
        const network = get(rskWalletStore).network;
        const networkConfig = RSK_NETWORKS[network];
        const tokenBalances: TokenBalance[] = [];

        // Check if tokens are defined for this network
        if ('tokens' in networkConfig && networkConfig.tokens) {
            const tokens = networkConfig.tokens as RSKToken[];
            
            for (const token of tokens) {
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
        }

        rskWalletStore.update(state => ({
            ...state,
            tokenBalances
        }));

    } catch (error) {
        console.error('Failed to load token balances:', error);
    }
}

// Send ERC-20 token
async function sendToken(tokenAddress: string, to: string, amount: string): Promise<string> {
    if (!wallet) {
        throw new Error('Wallet not initialized');
    }

    try {
        const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, wallet);
        
        // Get token decimals
        const decimals = await tokenContract.decimals();
        
        // Parse amount with correct decimals
        const parsedAmount = ethers.parseUnits(amount, decimals);
        
        const tx = await tokenContract.transfer(to, parsedAmount);

        // Add to pending transactions
        const pendingTx: RSKTransaction = {
            hash: tx.hash,
            from: wallet.address,
            to,
            value: parsedAmount.toString(),
            gasUsed: '0',
            gasPrice: tx.gasPrice?.toString() || '0',
            blockNumber: 0,
            timestamp: Date.now(),
            status: 'pending',
            type: 'send'
        };

        rskWalletStore.update(state => ({
            ...state,
            pendingTransactions: [pendingTx, ...state.pendingTransactions]
        }));

        // Wait for confirmation
        const receipt = await tx.wait();
        
        // Update transaction status
        updateTransactionStatus(tx.hash, receipt);

        return tx.hash;

    } catch (error) {
        throw new Error(`Token transfer failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

// Estimate gas for token transfer
async function estimateTokenGas(tokenAddress: string, to: string, amount: string): Promise<{ gasLimit: string; gasPrice: string; totalCost: string }> {
    if (!wallet || !provider) {
        throw new Error('Wallet not initialized');
    }

    try {
        const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, wallet);
        const decimals = await tokenContract.decimals();
        const parsedAmount = ethers.parseUnits(amount, decimals);

        const gasPrice = await provider.getFeeData();
        const gasLimit = await tokenContract.transfer.estimateGas(to, parsedAmount);

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

// ============================================================================
// ESCROW CONTRACT FUNCTIONS
// ============================================================================

// Helper function to update escrow status
function updateEscrowStatus(escrowId: string, status: EscrowStatus): void {
    rskWalletStore.update(state => ({
        ...state,
        escrows: state.escrows.map(escrow => 
            escrow.id === escrowId 
                ? { ...escrow, status, lastUpdated: Date.now() }
                : escrow
        )
    }));
}

// Load escrow details from contract
async function loadEscrowDetails(escrowId: string): Promise<EscrowData | null> {
    if (!contract) return null;

    try {
        const escrowData = await contract.escrows(escrowId);
        
        const escrow: EscrowData = {
            id: escrowId,
            client: escrowData.client,
            freelancer: escrowData.freelancer,
            baseAmount: ethers.formatEther(escrowData.baseAmount),
            clientFee: ethers.formatEther(escrowData.clientFee),
            freelancerFee: ethers.formatEther(escrowData.freelancerFee),
            totalAmount: ethers.formatEther(escrowData.baseAmount + escrowData.clientFee),
            status: escrowData.status,
            estimatedStartTime: Number(escrowData.estimatedStartTime),
            estimatedCompletionTime: Number(escrowData.estimatedCompletionTime),
            completionTime: Number(escrowData.completionTime),
            timelockExpiry: Number(escrowData.timelockExpiry),
            clientFeeTier: getFeeTierFromAmount(escrowData.baseAmount, escrowData.clientFee),
            freelancerFeeTier: getFeeTierFromAmount(escrowData.baseAmount, escrowData.freelancerFee),
            createdAt: Date.now(),
            lastUpdated: Date.now()
        };

        return escrow;
    } catch (error) {
        console.error('Failed to load escrow details:', error);
        return null;
    }
}

// Helper function to determine fee tier from amounts
function getFeeTierFromAmount(baseAmount: bigint, feeAmount: bigint): FeeTier {
    if (baseAmount === 0n) return 1;
    
    const percentage = Number((feeAmount * 10000n) / baseAmount);
    
    if (percentage >= 240 && percentage <= 260) return 1; // 2.5%
    if (percentage >= 190 && percentage <= 210) return 2; // 2.0%
    if (percentage >= 140 && percentage <= 160) return 3; // 1.5%
    
    return 1; // Default to tier 1
}

// Load dispute proposal details
async function loadDisputeProposal(escrowId: string): Promise<DisputeProposal | null> {
    if (!contract) return null;

    try {
        const proposalData = await contract.getDisputeProposal(escrowId);
        
        if (proposalData.proposer === ethers.ZeroAddress) return null;
        
        const proposal: DisputeProposal = {
            escrowId,
            proposer: proposalData.proposer,
            clientAmount: ethers.formatEther(proposalData.clientAmount),
            freelancerAmount: ethers.formatEther(proposalData.freelancerAmount),
            timestamp: Number(proposalData.timestamp),
            accepted: proposalData.accepted
        };

        return proposal;
    } catch (error) {
        console.error('Failed to load dispute proposal:', error);
        return null;
    }
}

// Load all user escrows
async function loadUserEscrows(): Promise<void> {
    if (!contract || !wallet) return;

    try {
        const userAddress = wallet.address;
        const nextEscrowId = await contract.nextEscrowId();
        const escrows: EscrowData[] = [];

        // Load recent escrows (last 100)
        const startId = Math.max(0, Number(nextEscrowId) - 100);
        
        for (let i = startId; i < Number(nextEscrowId); i++) {
            try {
                const escrowData = await loadEscrowDetails(i.toString());
                if (escrowData && 
                    (escrowData.client.toLowerCase() === userAddress.toLowerCase() || 
                     escrowData.freelancer.toLowerCase() === userAddress.toLowerCase())) {
                    escrows.push(escrowData);
                }
            } catch (error) {
                // Skip failed escrows
                continue;
            }
        }

        rskWalletStore.update(state => ({
            ...state,
            escrows: escrows.sort((a, b) => b.createdAt - a.createdAt)
        }));

    } catch (error) {
        throw new Error(`Failed to load user escrows: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

// Create new escrow
async function createEscrow(
    freelancerAddress: string,
    baseAmount: string,
    estimatedStartTime: number,
    estimatedCompletionTime: number,
    clientFeeTier: FeeTier,
    freelancerFeeTier: FeeTier
): Promise<ContractTransactionResult> {
    if (!contract || !wallet) {
        throw new Error('Contract not connected');
    }

    try {
        const baseAmountWei = ethers.parseEther(baseAmount);
        const totalPayment = calculateTotalPayment(baseAmountWei, clientFeeTier);

        // Estimate gas first
        const gasEstimate = await contract.createEscrow.estimateGas(
            freelancerAddress,
            estimatedStartTime,
            estimatedCompletionTime,
            clientFeeTier,
            freelancerFeeTier,
            { value: totalPayment }
        );

        const tx = await contract.createEscrow(
            freelancerAddress,
            estimatedStartTime,
            estimatedCompletionTime,
            clientFeeTier,
            freelancerFeeTier,
            { 
                value: totalPayment,
                gasLimit: gasEstimate + (gasEstimate / 10n) // Add 10% buffer
            }
        );

        const result: ContractTransactionResult = {
            hash: tx.hash,
            status: 'pending'
        };

        // Wait for transaction to be mined to get escrow ID
        tx.wait().then((receipt: ethers.TransactionReceipt | null) => {
            if (receipt) {
                // Find EscrowCreated event to get escrow ID
                const escrowCreatedEvent = receipt.logs.find((log: ethers.Log) => {
                    try {
                        const parsed = contract!.interface.parseLog(log);
                        return parsed?.name === 'EscrowCreated';
                    } catch {
                        return false;
                    }
                });

                if (escrowCreatedEvent) {
                    const parsed = contract!.interface.parseLog(escrowCreatedEvent);
                    result.escrowId = parsed?.args[0].toString();
                }
                
                result.status = 'confirmed';
                result.gasUsed = receipt.gasUsed.toString();
            }
        }).catch(() => {
            result.status = 'failed';
        });

        return result;

    } catch (error) {
        throw new Error(`Failed to create escrow: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

// Complete task
async function completeTask(escrowId: string): Promise<ContractTransactionResult> {
    if (!contract) {
        throw new Error('Contract not connected');
    }

    try {
        const gasEstimate = await contract.completeTask.estimateGas(escrowId);
        const tx = await contract.completeTask(escrowId, {
            gasLimit: gasEstimate + (gasEstimate / 10n)
        });

        const result: ContractTransactionResult = {
            hash: tx.hash,
            escrowId,
            status: 'pending'
        };

        tx.wait().then((receipt: ethers.TransactionReceipt | null) => {
            result.status = receipt ? 'confirmed' : 'failed';
            if (receipt) result.gasUsed = receipt.gasUsed.toString();
        }).catch(() => {
            result.status = 'failed';
        });

        return result;

    } catch (error) {
        throw new Error(`Failed to complete task: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

// Accept task
async function acceptTask(escrowId: string): Promise<ContractTransactionResult> {
    if (!contract) {
        throw new Error('Contract not connected');
    }

    try {
        const gasEstimate = await contract.acceptTask.estimateGas(escrowId);
        const tx = await contract.acceptTask(escrowId, {
            gasLimit: gasEstimate + (gasEstimate / 10n)
        });

        const result: ContractTransactionResult = {
            hash: tx.hash,
            escrowId,
            status: 'pending'
        };

        tx.wait().then((receipt: ethers.TransactionReceipt | null) => {
            result.status = receipt ? 'confirmed' : 'failed';
            if (receipt) result.gasUsed = receipt.gasUsed.toString();
        }).catch(() => {
            result.status = 'failed';
        });

        return result;

    } catch (error) {
        throw new Error(`Failed to accept task: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

// Cancel escrow
async function cancelEscrow(escrowId: string): Promise<ContractTransactionResult> {
    if (!contract) {
        throw new Error('Contract not connected');
    }

    try {
        const gasEstimate = await contract.cancelEscrow.estimateGas(escrowId);
        const tx = await contract.cancelEscrow(escrowId, {
            gasLimit: gasEstimate + (gasEstimate / 10n)
        });

        const result: ContractTransactionResult = {
            hash: tx.hash,
            escrowId,
            status: 'pending'
        };

        tx.wait().then((receipt: ethers.TransactionReceipt | null) => {
            result.status = receipt ? 'confirmed' : 'failed';
            if (receipt) result.gasUsed = receipt.gasUsed.toString();
        }).catch(() => {
            result.status = 'failed';
        });

        return result;

    } catch (error) {
        throw new Error(`Failed to cancel escrow: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

// Dispute task
async function disputeTask(escrowId: string): Promise<ContractTransactionResult> {
    if (!contract) {
        throw new Error('Contract not connected');
    }

    try {
        const gasEstimate = await contract.disputeTask.estimateGas(escrowId);
        const tx = await contract.disputeTask(escrowId, {
            gasLimit: gasEstimate + (gasEstimate / 10n)
        });

        const result: ContractTransactionResult = {
            hash: tx.hash,
            escrowId,
            status: 'pending'
        };

        tx.wait().then((receipt: ethers.TransactionReceipt | null) => {
            result.status = receipt ? 'confirmed' : 'failed';
            if (receipt) result.gasUsed = receipt.gasUsed.toString();
        }).catch(() => {
            result.status = 'failed';
        });

        return result;

    } catch (error) {
        throw new Error(`Failed to dispute task: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

// Propose resolution
async function proposeResolution(
    escrowId: string,
    clientAmount: string,
    freelancerAmount: string
): Promise<ContractTransactionResult> {
    if (!contract) {
        throw new Error('Contract not connected');
    }

    try {
        const clientAmountWei = ethers.parseEther(clientAmount);
        const freelancerAmountWei = ethers.parseEther(freelancerAmount);

        const gasEstimate = await contract.proposeResolution.estimateGas(
            escrowId,
            clientAmountWei,
            freelancerAmountWei
        );

        const tx = await contract.proposeResolution(
            escrowId,
            clientAmountWei,
            freelancerAmountWei,
            { gasLimit: gasEstimate + (gasEstimate / 10n) }
        );

        const result: ContractTransactionResult = {
            hash: tx.hash,
            escrowId,
            status: 'pending'
        };

        tx.wait().then((receipt: ethers.TransactionReceipt | null) => {
            result.status = receipt ? 'confirmed' : 'failed';
            if (receipt) result.gasUsed = receipt.gasUsed.toString();
        }).catch(() => {
            result.status = 'failed';
        });

        return result;

    } catch (error) {
        throw new Error(`Failed to propose resolution: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

// Accept proposal
async function acceptProposal(escrowId: string): Promise<ContractTransactionResult> {
    if (!contract) {
        throw new Error('Contract not connected');
    }

    try {
        const gasEstimate = await contract.acceptProposal.estimateGas(escrowId);
        const tx = await contract.acceptProposal(escrowId, {
            gasLimit: gasEstimate + (gasEstimate / 10n)
        });

        const result: ContractTransactionResult = {
            hash: tx.hash,
            escrowId,
            status: 'pending'
        };

        tx.wait().then((receipt: ethers.TransactionReceipt | null) => {
            result.status = receipt ? 'confirmed' : 'failed';
            if (receipt) result.gasUsed = receipt.gasUsed.toString();
        }).catch(() => {
            result.status = 'failed';
        });

        return result;

    } catch (error) {
        throw new Error(`Failed to accept proposal: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

// Resolve after timelock
async function resolveAfterTimelock(escrowId: string): Promise<ContractTransactionResult> {
    if (!contract) {
        throw new Error('Contract not connected');
    }

    try {
        const gasEstimate = await contract.resolveAfterTimelock.estimateGas(escrowId);
        const tx = await contract.resolveAfterTimelock(escrowId, {
            gasLimit: gasEstimate + (gasEstimate / 10n)
        });

        const result: ContractTransactionResult = {
            hash: tx.hash,
            escrowId,
            status: 'pending'
        };

        tx.wait().then((receipt: ethers.TransactionReceipt | null) => {
            result.status = receipt ? 'confirmed' : 'failed';
            if (receipt) result.gasUsed = receipt.gasUsed.toString();
        }).catch(() => {
            result.status = 'failed';
        });

        return result;

    } catch (error) {
        throw new Error(`Failed to resolve after timelock: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

// Estimate gas for escrow creation
async function estimateEscrowCreationGas(
    freelancerAddress: string,
    baseAmount: string,
    estimatedStartTime: number,
    estimatedCompletionTime: number,
    clientFeeTier: FeeTier,
    freelancerFeeTier: FeeTier
): Promise<GasEstimation> {
    if (!contract || !provider) {
        throw new Error('Contract not connected');
    }

    try {
        const baseAmountWei = ethers.parseEther(baseAmount);
        const totalPayment = calculateTotalPayment(baseAmountWei, clientFeeTier);

        const gasLimit = await contract.createEscrow.estimateGas(
            freelancerAddress,
            estimatedStartTime,
            estimatedCompletionTime,
            clientFeeTier,
            freelancerFeeTier,
            { value: totalPayment }
        );

        const feeData = await provider.getFeeData();
        const gasPrice = feeData.gasPrice || BigInt(0);
        const totalCost = gasLimit * gasPrice;

        return {
            gasLimit: gasLimit.toString(),
            gasPrice: gasPrice.toString(),
            totalCost: totalCost.toString(),
            totalCostFormatted: ethers.formatEther(totalCost)
        };

    } catch (error) {
        throw new Error(`Gas estimation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

// Estimate gas for contract function
async function estimateContractGas(functionName: string, escrowId: string, ...args: any[]): Promise<GasEstimation> {
    if (!contract || !provider) {
        throw new Error('Contract not connected');
    }

    try {
        const contractFunction = contract[functionName];
        if (!contractFunction) {
            throw new Error(`Function ${functionName} not found`);
        }

        const gasLimit = await contractFunction.estimateGas(escrowId, ...args);
        const feeData = await provider.getFeeData();
        const gasPrice = feeData.gasPrice || BigInt(0);
        const totalCost = gasLimit * gasPrice;

        return {
            gasLimit: gasLimit.toString(),
            gasPrice: gasPrice.toString(),
            totalCost: totalCost.toString(),
            totalCostFormatted: ethers.formatEther(totalCost)
        };

    } catch (error) {
        throw new Error(`Gas estimation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

// Get escrow by ID
async function getEscrow(escrowId: string): Promise<EscrowData | null> {
    return await loadEscrowDetails(escrowId);
}

// Get dispute proposal by escrow ID
async function getDisputeProposal(escrowId: string): Promise<DisputeProposal | null> {
    return await loadDisputeProposal(escrowId);
}

// Refresh escrow data
async function refreshEscrows(): Promise<void> {
    await loadUserEscrows();
}

// Check if contract is paused
async function isContractPaused(): Promise<boolean> {
    if (!contract) return true;
    
    try {
        return await contract.paused();
    } catch (error) {
        console.error('Failed to check contract pause status:', error);
        return true;
    }
}

// Export service methods following app.store.ts pattern
export const rskWallet = {
    initialize,
    switchNetwork,
    sendRBTC,
    estimateGas,
    sendToken,
    estimateTokenGas,
    loadTokenBalances,
    connectToEscrowContract,
    refreshTransactions: loadTransactionHistory,
    cleanup,
    
    // Escrow contract methods
    createEscrow,
    completeTask,
    acceptTask,
    cancelEscrow,
    disputeTask,
    proposeResolution,
    acceptProposal,
    resolveAfterTimelock,
    estimateEscrowCreationGas,
    estimateContractGas,
    getEscrow,
    getDisputeProposal,
    refreshEscrows,
    isContractPaused
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

export function getUnitLabel(unit: RSKUnit, network: string): string {
    if (unit === 'wei') {
        return 'wei';
    }
    return RSK_NETWORKS[network as keyof typeof RSK_NETWORKS]?.currency.symbol || 'RBTC';
}

// Enhanced balance derived store with unit formatting
export const rskBalance = derived(
    [rskWalletStore, rskUnitPreference],
    ([$store, $unit]) => {
        if (!$store.formattedBalance) return '0';
        return formatRSKAmount($store.formattedBalance, $unit);
    }
);

// Derived stores for convenience
export const rskAddress = derived(rskWalletStore, $store => $store.address);
export const rskTokenBalances = derived(rskWalletStore, $store => $store.tokenBalances);
export const rskTransactions = derived(rskWalletStore, $store => $store.transactions);
export const rskEscrows = derived(rskWalletStore, $store => $store.escrows);
export const rskDisputeProposals = derived(rskWalletStore, $store => $store.disputeProposals);
export const rskNetwork = derived(rskWalletStore, $store => $store.network);
export const rskContractConnected = derived(rskWalletStore, $store => $store.contractConnected);
export const rskContractAddress = derived(rskWalletStore, $store => $store.contractAddress);

// Enhanced derived stores for escrow data
export const rskActiveEscrows = derived(rskWalletStore, $store => 
    $store.escrows.filter(escrow => 
        escrow.status === EscrowStatus.Funded || 
        escrow.status === EscrowStatus.Completed || 
        escrow.status === EscrowStatus.InDispute
    )
);

export const rskClientEscrows = derived([rskWalletStore, rskAddress], ([$store, $address]) => 
    $store.escrows.filter(escrow => escrow.client.toLowerCase() === $address?.toLowerCase())
);

export const rskFreelancerEscrows = derived([rskWalletStore, rskAddress], ([$store, $address]) => 
    $store.escrows.filter(escrow => escrow.freelancer.toLowerCase() === $address?.toLowerCase())
);

export const rskPendingEscrows = derived(rskWalletStore, $store => 
    $store.escrows.filter(escrow => escrow.status === EscrowStatus.Funded)
);

export const rskCompletedEscrows = derived(rskWalletStore, $store => 
    $store.escrows.filter(escrow => escrow.status === EscrowStatus.Completed)
);

export const rskDisputedEscrows = derived(rskWalletStore, $store => 
    $store.escrows.filter(escrow => escrow.status === EscrowStatus.InDispute)
);

export const rskResolvedEscrows = derived(rskWalletStore, $store => 
    $store.escrows.filter(escrow => escrow.status === EscrowStatus.Resolved)
);

export const rskCancelledEscrows = derived(rskWalletStore, $store => 
    $store.escrows.filter(escrow => escrow.status === EscrowStatus.Cancelled)
);
