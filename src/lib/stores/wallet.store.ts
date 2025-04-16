import type {
    WalletAddress,
    Transaction,
    SendTxParams,
    NetworkFee,
    WalletState,
    WalletBalance
} from '$lib/types/wallet';
import { writable } from 'svelte/store';
import { browser } from '$app/environment';
import { checkBiometricAvailability } from '$lib/utils/helpers/biometrics';
import { Preferences } from '@capacitor/preferences';
import * as walletCryptoService from '$lib/utils/helpers/wallet/wallet-crypto';
import * as mobileWalletService from '$lib/utils/helpers/wallet/mobile-wallet';
import bitcoinWalletService from '$lib/api/services/wallet.service';

// Initial state with empty data
const initialState: WalletState = {
    balance: {
        btc: 0,
        sats: 0,
        usd: 0
    },
    addresses: [],
    transactions: [],
    isInitialized: false,
    isLocked: true,
    networkType: 'bitcoin',
    hardwareWalletConnected: false,
    isEncrypted: false,
    encryptionStatus: 'unencrypted'
};

// User storage preference
const WALLET_STORAGE_PREFERENCE_KEY = 'bittasker_wallet_storage_preference';

// Network fee estimates
export const networkFees: NetworkFee[] = [
    { type: 'low', satPerVbyte: 1, estimatedConfirmationTime: 60 },
    { type: 'medium', satPerVbyte: 5, estimatedConfirmationTime: 20 },
    { type: 'high', satPerVbyte: 10, estimatedConfirmationTime: 10 }
];

/**
 * Wallet Store - manages wallet state across the application
 */
const createWalletStore = () => {
    const { subscribe, set, update } = writable<WalletState>(initialState);

    // Initialize from API when in browser
    if (browser) {
        // Check if wallet is initialized
        bitcoinWalletService.getOrCreateWallet()
            .then(data => {
                if (data && data.isInitialized) {
                    update(state => ({
                        ...state,
                        isInitialized: true,
                        isLocked: true
                    }));
                }
            })
            .catch(error => {
                console.error('Failed to check wallet initialization status:', error);
            });
    }

    return {
        subscribe,
        set,
        update,

        /**
         * Initialize wallet with password
         * @param passphrase The password to encrypt the wallet
         * @param storagePreference 'self' for user to store mnemonic, 'service' for service to store 
         * @returns Object containing success status and mnemonic (if self-storage)
         */
        initializeWallet: async (passphrase: string, storagePreference: 'self' | 'service'): Promise<{ success: boolean, mnemonic?: string }> => {
            try {
                // Generate a new mnemonic for the wallet
                const mnemonic = await walletCryptoService.generateMnemonic();

                // Store the user's preference
                if (browser) {
                    Preferences.set({ key: WALLET_STORAGE_PREFERENCE_KEY, value: storagePreference });
                }

                if (storagePreference === 'service') {
                    // Encrypt the mnemonic with the passphrase
                    const encryptedData = await walletCryptoService.encryptMnemonic(mnemonic, passphrase);

                    // Check if biometric auth is available
                    const biometricsAvailable = await checkBiometricAvailability();
                    if (biometricsAvailable) {
                        // Store passphrase with biometrics
                        await mobileWalletService.setupBiometricAuth(passphrase);
                        // Store in device secure storage
                        await mobileWalletService.storeMnemonicInSecureStorage(encryptedData);
                    } else {
                        // Store via API with E2E encryption
                        await bitcoinWalletService.storeEncryptedMnemonic(encryptedData);
                    }
                }

                // Set up the wallet with the API
                await bitcoinWalletService.getOrCreateWallet();

                // Generate an initial address
                const newAddress = await bitcoinWalletService.generateNewAddress();

                // Update wallet state
                update(state => {
                    const updatedState = {
                        ...state,
                        isInitialized: true,
                        isLocked: false,
                        isEncrypted: true,
                        encryptionStatus: 'unlocked' as const,
                        addresses: [{ ...newAddress, isDefault: true }]
                    };

                    return updatedState;
                });

                // Load initial balance and transactions
                await walletStore.refreshWallet();

                // If user chose to store mnemonic themselves, return it
                return {
                    success: true,
                    ...(storagePreference === 'self' ? { mnemonic } : {})
                };
            } catch (error) {
                console.error('Failed to initialize wallet:', error);
                return { success: false };
            }
        },

        /**
         * Unlock wallet with password
         */
        unlockWallet: async (passphrase: string): Promise<boolean> => {
            try {
                // Get storage preference
                const storagePreference = browser ? (await Preferences.get({ key: WALLET_STORAGE_PREFERENCE_KEY })).value : null;

                // Try to get encrypted mnemonic based on storage preference
                let encryptedData: { ciphertext: string; iv: string; salt: string } | null = null;

                if (storagePreference === 'service') {
                    // Check secure storage first (mobile with biometrics)
                    const hasMnemonicInSecureStorage = await mobileWalletService.hasMnemonicInSecureStorage();

                    if (hasMnemonicInSecureStorage) {
                        encryptedData = await mobileWalletService.getMnemonicFromSecureStorage();
                    } else {
                        // Try to get from API
                        encryptedData = await bitcoinWalletService.getEncryptedMnemonic();
                    }
                }

                if (!encryptedData) {
                    console.error('No encrypted wallet data found');
                    return false;
                }

                // Try to decrypt the mnemonic
                try {
                    await walletCryptoService.decryptMnemonic(encryptedData, passphrase);

                    // If decryption succeeded, wallet is unlocked
                    update(state => ({
                        ...state,
                        isLocked: false
                    }));

                    // Load wallet data from API
                    await walletStore.refreshWallet();

                    return true;
                } catch (error) {
                    console.error('Failed to decrypt wallet:', error);
                    return false;
                }
            } catch (error) {
                console.error('Failed to unlock wallet:', error);
                return false;
            }
        },

        /**
         * Try to unlock wallet with biometrics
         */
        unlockWithBiometrics: async (): Promise<boolean> => {
            try {
                // Check if biometrics are available and enabled
                const biometricsAvailable = await checkBiometricAvailability();

                if (!biometricsAvailable) {
                    return false;
                }

                // Try to get the password from biometric storage
                const password = await mobileWalletService.getBiometricPassword();

                if (!password) {
                    return false;
                }

                // Use the retrieved password to unlock the wallet
                return walletStore.unlockWallet(password);
            } catch (error) {
                console.error('Failed to unlock with biometrics:', error);
                return false;
            }
        },

        /**
         * Lock wallet
         */
        lockWallet: () => {
            update(state => {
                const updatedState = {
                    ...state,
                    isLocked: true
                };
                return updatedState;
            });
        },

        /**
         * Generate new address
         */
        generateAddress: async (type: WalletAddress['type'] = 'Bitcoin'): Promise<WalletAddress | null> => {
            try {
                // In a real implementation, this would generate a new address
                const newAddress = await bitcoinWalletService.generateNewAddress();

                update(state => {
                    const updatedState = {
                        ...state,
                        addresses: [...state.addresses, newAddress]
                    };
                    return updatedState;
                });

                return newAddress;
            } catch (error) {
                console.error('Failed to generate address:', error);
                return null;
            }
        },

        /**
         * Send transaction
         */
        sendTransaction: async (params: SendTxParams): Promise<Transaction | null> => {
            try {
                // Get current state to use in transaction creation
                let currentState: WalletState = initialState;
                subscribe(state => { currentState = state; })();

                // Send the transaction using the API service
                const { txid, fee } = await bitcoinWalletService.sendBitcoin(params);

                // Create a new transaction object
                const newTransaction: Transaction = {
                    id: txid,
                    type: 'sent',
                    amount: params.amount,
                    timestamp: Date.now(),
                    sender: currentState.addresses.find(a => a.isDefault)?.address || '',
                    recipient: params.recipientAddress,
                    confirmations: 0, // Pending transaction
                    txid,
                    network: 'Bitcoin', // Assuming Bitcoin for now
                    status: 'pending'
                };

                // Update the wallet state with the new transaction and updated balance
                update(state => {
                    const updatedState = {
                        ...state,
                        transactions: [newTransaction, ...state.transactions]
                    };
                    return updatedState;
                });

                // Refresh wallet data to get updated balance
                await walletStore.refreshWallet();

                return newTransaction;
            } catch (error) {
                console.error('Failed to send transaction:', error);
                return null;
            }
        },

        /**
         * Refresh wallet data from API
         */
        refreshWallet: async () => {
            try {
                // Get balance
                const balanceData = await bitcoinWalletService.getWalletBalance();

                // Update state with new balance
                update(state => {
                    const btcBalance = balanceData.confirmedBalance || 0;
                    const satsBalance = Math.floor(btcBalance * 100000000);
                    const usdValue = balanceData.usdEquivalent || 0;

                    const updatedState = {
                        ...state,
                        balance: {
                            btc: btcBalance,
                            sats: satsBalance,
                            usd: usdValue
                        }
                    };

                    return updatedState;
                });

                // Get transactions for all addresses
                let allTransactions: Transaction[] = [];
                let currentState: WalletState = initialState;
                subscribe(state => { currentState = state; })();

                for (const address of currentState.addresses) {
                    const addressTransactions = await bitcoinWalletService.getAddressTransactions(address.address);
                    allTransactions = [...allTransactions, ...addressTransactions];
                }

                // Sort transactions by timestamp (newest first)
                allTransactions.sort((a, b) => b.timestamp - a.timestamp);

                // Update state with transactions
                update(state => ({
                    ...state,
                    transactions: allTransactions
                }));

                return true;
            } catch (error) {
                console.error('Failed to refresh wallet:', error);
                return false;
            }
        },

        /**
         * Get transaction history
         */
        getTransactionHistory: async () => {
            let transactions: Transaction[] = [];
            subscribe(state => { transactions = state.transactions; })();
            return transactions;
        },

        /**
         * Get wallet balance
         */
        getBalance: async () => {
            let balance: WalletBalance = { btc: 0, sats: 0, usd: 0 };
            subscribe(state => { balance = state.balance; })();
            return balance;
        },

        /**
         * Get user's storage preference
         */
        getStoragePreference: () => {
            return browser ? localStorage.getItem(WALLET_STORAGE_PREFERENCE_KEY) as 'self' | 'service' | null : null;
        }
    };
};

export const walletStore = createWalletStore();