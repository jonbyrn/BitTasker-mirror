/**
 * Unified Wallet Service
 * 
 * This service combines functionalities from:
 * - Bitcoin on-chain operations (bitcoin-wallet.service.ts)
 * - Lightning Network operations (lightning-wallet.service.ts)
 * - Liquid Network operations (liquid-wallet.service.ts)
 * - Hardware wallet integration (hardware-wallet.service.ts)
 * - Mobile wallet features (mobile-wallet.service.ts)
 * - Cryptographic operations (wallet-crypto.service.ts)
 */

import type { Transaction, SendTxParams, NetworkFee, LightningInvoice, WalletBalance } from '$lib/types/wallet';
import * as bitcoinWalletService from '$lib/utils/helpers/wallet/bitcoin-wallet.service';
import * as lightningWalletService from '$lib/utils/helpers/wallet/lightning-wallet.service';
import * as liquidWalletService from '$lib/utils/helpers/wallet/liquid-wallet.service';
import * as hardwareWalletService from '$lib/utils/helpers/wallet/hardware-wallet.service';
import * as walletCryptoService from '$lib/utils/helpers/wallet/wallet-crypto';
import * as mobileWalletService from '$lib/utils/helpers/wallet/mobile-wallet';
import { walletStore } from '$lib/stores/wallet.store';
import { checkBiometricAvailability } from '../biometrics';
import { get } from 'svelte/store';

// Flag to track if the wallet is initialized
let isInitialized = false;
let currentNetworkType: 'bitcoin' | 'lightning' | 'liquid' = 'bitcoin';

/**
 * Initialize the wallet
 * 
 * Will either create a new wallet or retrieve an existing one
 */
export async function initializeWallet(password: string, mnemonic?: string): Promise<boolean> {
    try {
        // Check for existing wallet
        const walletExists = await walletCryptoService.walletExists();

        // Mobile-specific: Check if we can use biometric auth on mobile
        let canUseBiometrics = await checkBiometricAvailability();

        if (walletExists) {
            // Unlock existing wallet
            const unlocked = await unlockWallet(password);

            // If on mobile and biometrics available, set up biometric auth
            if (unlocked && canUseBiometrics) {
                await mobileWalletService.setupBiometricAuth(password);
            }

            return unlocked;
        } else {
            // Create a new wallet
            const newWallet = await walletCryptoService.createWallet(password);
            if (!newWallet) {
                return false;
            }

            // Store the encrypted wallet data
            walletCryptoService.storeWalletData(newWallet.encryptedMnemonic, newWallet.salt, newWallet.iv);

            // If on mobile and biometrics available, set up biometric auth
            if (canUseBiometrics) {
                await mobileWalletService.setupBiometricAuth(password);
            }

            // Initialize the store with the new wallet
            walletStore.initializeWallet(password);

            isInitialized = true;

            // If on mobile, setup transaction notifications and background monitoring
            if (canUseBiometrics) {
                mobileWalletService.setupBackgroundMonitoring();
            }

            return true;
        }
    } catch (error) {
        console.error('Failed to initialize wallet:', error);
        return false;
    }
}

/**
 * Unlock the wallet with password or biometrics
 */
export async function unlockWallet(password?: string): Promise<boolean> {
    try {
        // Check if we can use biometrics on mobile
        let canUseBiometrics = await checkBiometricAvailability();
        let walletPassword = password || '';

        if (canUseBiometrics && !password) {
            // Try to get password from biometric auth
            const bioPassword = await mobileWalletService.getBiometricPassword();

            if (!bioPassword) {
                return false;
            }

            walletPassword = bioPassword;
        }

        if (!walletPassword) {
            return false;
        }

        // Use the wallet store's unlock method
        return await walletStore.unlockWallet(walletPassword);
    } catch (error) {
        console.error('Failed to unlock wallet:', error);
        return false;
    }
}

/**
 * Lock the wallet
 */
export function lockWallet(): boolean {
    try {
        walletStore.lockWallet();
        return true;
    } catch (error) {
        console.error('Failed to lock wallet:', error);
        return false;
    }
}

/**
 * Check if wallet is initialized
 */
export function isWalletInitialized(): boolean {
    let isWalletInit = get(walletStore).isInitialized;
    return isInitialized || isWalletInit;
}

/**
 * Get wallet balance
 */
export async function getWalletBalance(networkType?: 'bitcoin' | 'lightning' | 'liquid'): Promise<WalletBalance> {
    // Use the wallet store's getBalance method
    return walletStore.getBalance();
}

/**
 * Generate new address
 */
export async function generateAddress(networkType: 'bitcoin' | 'lightning' | 'liquid'): Promise<any> {
    let isLocked = get(walletStore).isLocked;

    if (isLocked) {
        throw new Error('Wallet is locked');
    }

    // If on mobile, ensure we're authenticated for sensitive operations
    let canUseBiometrics = await checkBiometricAvailability();
    if (canUseBiometrics) {
        await mobileWalletService.getBiometricPassword();
    }

    // Convert lowercase network type to proper case for wallet store
    const networkTypeFormatted = networkType.charAt(0).toUpperCase() + networkType.slice(1) as 'Bitcoin' | 'Lightning' | 'Liquid';

    // Use the wallet store's generateAddress method
    return walletStore.generateAddress(networkTypeFormatted);
}

/**
 * Updated SendTxParams interface
 */
interface ExtendedSendTxParams extends SendTxParams {
    network: 'bitcoin' | 'lightning' | 'liquid';
    destination: string;
    feeRate?: string;
    assetId?: string;
}

/**
 * Send transaction
 */
export async function sendTransaction(params: ExtendedSendTxParams): Promise<Transaction | null> {
    let state = {
        isLocked: true,
        addresses: [] as any[]
    };

    walletStore.subscribe(s => {
        state = s;
    })();

    if (state.isLocked) {
        throw new Error('Wallet is locked');
    }

    // If on mobile, ensure we're authenticated for transactions
    if (mobileWalletService.isMobileDevice()) {
        const authenticated = await mobileWalletService.getBiometricPassword();
        if (!authenticated) {
            throw new Error('Biometric authentication required for sending funds');
        }
    }

    // Convert ExtendedSendTxParams to SendTxParams for walletStore
    const txParams: SendTxParams = {
        amount: params.amount,
        recipientAddress: params.destination,
        networkFee: params.networkFee || 'medium',
        description: params.description
    };

    // Use the wallet store's sendTransaction method
    return walletStore.sendTransaction(txParams);
}

/**
 * Get transaction history
 */
export async function getTransactionHistory(networkType?: 'bitcoin' | 'lightning' | 'liquid'): Promise<Transaction[]> {
    let transactions: Transaction[] = [];
    let isLocked = true;

    walletStore.subscribe(state => {
        isLocked = state.isLocked;
        transactions = state.transactions;
    })();

    if (isLocked) {
        throw new Error('Wallet is locked');
    }

    if (networkType) {
        // Filter transactions by network type
        return transactions.filter(tx => tx.network.toLowerCase() === networkType);
    }

    // Return all transactions
    return transactions;
}

/**
 * Validate an address for the specified network
 */
export function validateAddress(address: string, networkType: 'bitcoin' | 'lightning' | 'liquid'): boolean | Promise<boolean> {
    switch (networkType) {
        case 'bitcoin':
            return bitcoinWalletService.validateBitcoinAddress(address);
        case 'lightning':
            return lightningWalletService.validateLightningDestination(address).isValid;
        case 'liquid':
            return liquidWalletService.validateLiquidAddress(address);
        default:
            return false;
    }
}

/**
 * Generate a Lightning invoice
 */
export async function generateLightningInvoice(
    amountSats: number,
    description: string
): Promise<LightningInvoice> {
    // Ensure the wallet is unlocked
    let isLocked = true;
    walletStore.subscribe(state => {
        isLocked = state.isLocked;
    })();

    if (isLocked) {
        throw new Error('Wallet is locked');
    }

    // If on mobile, ensure we're authenticated
    if (mobileWalletService.isMobileDevice()) {
        await mobileWalletService.getBiometricPassword();
    }

    return lightningWalletService.generateInvoice(amountSats, description);
}

/**
 * Save wallet data to storage
 */
async function saveWalletData(): Promise<boolean> {
    try {
        let walletData = {
            balance: { btc: 0, sats: 0, usd: 0 },
            addresses: [] as any[],
            transactions: [] as Transaction[]
        };

        walletStore.subscribe(state => {
            walletData = {
                balance: state.balance,
                addresses: state.addresses,
                transactions: state.transactions
            };
        })();

        // Mock for getting the current key - in a real implementation this would be properly handled
        const mockKey = 'password123';

        // Encrypt the wallet data
        const encryptedResult = await walletCryptoService.encryptData(JSON.stringify(walletData), mockKey);

        // Store the encrypted data
        if (mobileWalletService.isMobileDevice()) {
            // Use the mobile-specific secure storage on mobile devices
            return mobileWalletService.storeSecureData('wallet_data', encryptedResult.encryptedData);
        } else {
            // Use the standard wallet crypto service for non-mobile
            walletCryptoService.storeWalletData(
                encryptedResult.encryptedData,
                encryptedResult.salt,
                encryptedResult.iv
            );
            return true;
        }
    } catch (error) {
        console.error('Failed to save wallet data:', error);
        return false;
    }
}

/**
 * Connect to a hardware wallet
 */
export async function connectHardwareWallet(
    walletType: 'ledger' | 'trezor'
): Promise<boolean> {
    try {
        let connected: boolean;

        if (walletType === 'ledger') {
            connected = await hardwareWalletService.connectLedger();
        } else {
            connected = await hardwareWalletService.connectTrezor();
        }

        if (connected) {
            // Using subscribe pattern instead of direct update
            let currentState: any = {};
            walletStore.subscribe(state => {
                currentState = state;
            })();

            walletStore.update(state => ({
                ...state,
                hardwareWalletConnected: true,
                hardwareWalletType: walletType
            }));
        }

        return connected;
    } catch (error) {
        console.error('Failed to connect hardware wallet:', error);
        return false;
    }
}

/**
 * Scan QR code for wallet operation (mobile only)
 */
export async function scanQRCodeForWallet(): Promise<{
    type: 'bitcoin' | 'lightning' | 'liquid' | 'unknown';
    value: string;
} | null> {
    if (!mobileWalletService.isMobileDevice()) {
        console.error('QR scanning is only available on mobile devices');
        return null;
    }

    return mobileWalletService.scanQRCode();
}

/**
 * Create a task escrow contract
 */
export async function createTaskEscrow(
    taskId: string,
    amount: number,
    hirerId: string,
    doerId: string
): Promise<{
    contractId: string;
    address: string;
    status: string;
}> {
    // Mock escrow platform data (in a real implementation, this would be retrieved from a backend)
    const platformEscrowData = {
        pubkey: 'platformPubKey123',
        timeoutHours: 72,
        platformFeePercent: 5
    };

    // If on mobile, verify with biometrics for creating an escrow
    if (mobileWalletService.isMobileDevice()) {
        const authenticated = await mobileWalletService.getBiometricPassword();
        if (!authenticated) {
            throw new Error('Biometric authentication required for creating escrow');
        }
    }

    // Prepare participant data for the escrow contract
    const hirer = {
        address: `VJL1...hirer-${hirerId}`,
        pubkey: `pubkey-hirer-${hirerId}`
    };

    const doer = {
        address: `VJL2...doer-${doerId}`,
        pubkey: `pubkey-doer-${doerId}`
    };

    const platform = {
        address: 'VJL3...platform',
        pubkey: platformEscrowData.pubkey
    };

    // Create the escrow contract using the Liquid wallet service with correct parameters
    const escrowContract = await liquidWalletService.createEscrowContract(
        hirer,
        doer,
        platform,
        amount,
        undefined, // Use default asset (L-BTC)
        Date.now() + (platformEscrowData.timeoutHours * 60 * 60 * 1000) // Convert hours to milliseconds
    );

    // Return the necessary escrow details
    return {
        contractId: escrowContract.id,
        address: escrowContract.participants[0].address, // Use hirer's address as reference
        status: escrowContract.status
    };
} 