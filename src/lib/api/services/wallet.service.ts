/**
 * Bitcoin Wallet Service
 * 
 * Handles Bitcoin on-chain wallet operations:
 * - Address generation and validation
 * - UTXO management
 * - Transaction building and signing
 * - Transaction broadcasting
 * - Balance queries
 */

import type { SendTxParams, Transaction, WalletAddress } from '$lib/types/wallet';
import { BaseApiService } from '../apiService';
import { ENDPOINTS } from '../endpoints';
import { bytesToHex, hexToBytes } from '$lib/utils/helpers/encoding';

class BitcoinWalletService extends BaseApiService {
    /**
     * Get or create a Bitcoin wallet for the authenticated user
     */
    async getOrCreateWallet() {
        const response = await this.get(ENDPOINTS.WALLET.BITCOIN.CREATE);
        return response.data;
    }

    /**
     * Generate a new Bitcoin address
     */
    async generateNewAddress(): Promise<WalletAddress> {
        try {
            const response = await this.post(ENDPOINTS.WALLET.BITCOIN.ADDRESS);

            return {
                type: 'Bitcoin',
                address: response.data.address,
                isDefault: false
            };
        } catch (error) {
            console.error('Failed to generate new Bitcoin address:', error);
            throw error;
        }
    }

    /**
     * Validate a Bitcoin address (not available)
     */
    async validateAddress(address: string): Promise<boolean> {
        try {
            // Directly validate using regex for basic check
            const basicBitcoinAddressRegex = /^(bc1|[13])[a-zA-HJ-NP-Z0-9]{25,62}$/;
            if (!basicBitcoinAddressRegex.test(address)) {
                return false;
            }

            // For complete validation, check with API
            const response = await this.get(`${ENDPOINTS.WALLET.BITCOIN.VALIDATE}?address=${address}`);
            return response.data.isValid;
        } catch (error) {
            console.error('Failed to validate Bitcoin address:', error);
            return false;
        }
    }

    /**
     * Get wallet balance for authenticated user
     */
    async getWalletBalance() {
        try {
            const response = await this.get(ENDPOINTS.WALLET.BITCOIN.BALANCE);
            return response.data;
        } catch (error) {
            console.error('Failed to get Bitcoin wallet balance:', error);
            throw error;
        }
    }

    /**
     * Get balance for a specific address
     */
    async getAddressBalance(address: string) {
        try {
            const response = await this.get(ENDPOINTS.WALLET.BITCOIN.ADDRESS_BALANCE(address));
            return response.data;
        } catch (error) {
            console.error(`Failed to get balance for address ${address}:`, error);
            throw error;
        }
    }

    /**
     * Get fee estimates for bitcoin transactions
     */
    async getFeeEstimates() {
        try {
            const response = await this.get(ENDPOINTS.WALLET.BITCOIN.FEES);
            return response.data;
        } catch (error) {
            console.error('Failed to get fee estimates:', error);
            throw error;
        }
    }

    /**
     * Get transactions for a specific address
     */
    async getAddressTransactions(address: string, limit?: number): Promise<Transaction[]> {
        try {
            const response = await this.get(ENDPOINTS.WALLET.BITCOIN.ADDRESS_TRANSACTIONS(address, limit));

            // Transform API response to our Transaction type
            return response.data.map((tx: any) => ({
                id: tx.txid,
                type: tx.type === 'incoming' ? 'received' : 'sent',
                amount: tx.amount,
                timestamp: new Date(tx.confirmationTime || Date.now()).getTime(),
                sender: tx.type === 'incoming' ? '' : address,
                recipient: tx.type === 'incoming' ? address : '',
                confirmations: tx.confirmed ? 1 : 0,
                txid: tx.txid,
                network: 'Bitcoin',
                status: tx.confirmed ? 'confirmed' : 'pending',
                fee: tx.fees
            }));
        } catch (error) {
            console.error(`Failed to get transactions for address ${address}:`, error);
            throw error;
        }
    }

    /**
     * Send Bitcoin to an address
     */
    async sendBitcoin(params: SendTxParams): Promise<{
        txid: string;
        fee: number;
    }> {
        try {
            const { amount, recipientAddress, networkFee } = params;

            // Build the request payload
            const payload = {
                recipientAddress,
                amount,
                feeRate: networkFee, // 'low', 'medium', 'high'
                description: params.description || 'BitTasker Transfer'
            };

            // Send the transaction
            const response = await this.post(ENDPOINTS.WALLET.BITCOIN.SEND, payload);

            return {
                txid: response.data.txid,
                fee: response.data.fee
            };
        } catch (error) {
            console.error('Failed to send Bitcoin transaction:', error);
            throw error;
        }
    }

    /**
     * Get all user balances for all addresses
     */
    async getUserBalances() {
        try {
            const response = await this.get(ENDPOINTS.WALLET.BITCOIN.BALANCES);
            return response.data;
        } catch (error) {
            console.error('Failed to get user balances:', error);
            throw error;
        }
    }

    /**
     * Add address to whitelist
     */
    async whitelistAddress(address: string, label: string, description?: string) {
        try {
            const payload = {
                address,
                label,
                description
            };

            const response = await this.post(ENDPOINTS.WALLET.BITCOIN.WHITELIST, payload);
            return response.data;
        } catch (error) {
            console.error('Failed to whitelist address:', error);
            throw error;
        }
    }

    /**
     * Get whitelisted addresses
     */
    async getWhitelistedAddresses() {
        try {
            const response = await this.get(ENDPOINTS.WALLET.BITCOIN.WHITELIST);
            return response.data;
        } catch (error) {
            console.error('Failed to get whitelisted addresses:', error);
            throw error;
        }
    }

    /**
     * Convert fiat to bitcoin
     */
    async convertFiatToBitcoin(amount: number, currency: string) {
        try {
            const response = await this.post(ENDPOINTS.WALLET.BITCOIN.CONVERT, { amount, currency });
            return response.data;
        } catch (error) {
            console.error('Failed to convert fiat to bitcoin:', error);
            throw error;
        }
    }

    /**
     * Get current bitcoin price
     */
    async getCurrentBitcoinPrice() {
        try {
            const response = await this.get(ENDPOINTS.WALLET.BITCOIN.PRICE);
            return response.data;
        } catch (error) {
            console.error('Failed to get current bitcoin price:', error);
            throw error;
        }
    }

    /**
     * Store E2E encrypted mnemonic phrase on the server - NOT AVAILABLE
     * @param encryptedData The encrypted mnemonic data
     * @returns Success status
     */
    async storeEncryptedMnemonic(encryptedData: { ciphertext: string; iv: string; salt: string }): Promise<boolean> {
        try {
            const response = await this.post(ENDPOINTS.WALLET.BITCOIN.STORE_MNEMONIC, encryptedData);
            return response.status === 200;
        } catch (error) {
            console.error('Failed to store encrypted mnemonic:', error);
            throw error;
        }
    }

    /**
     * Retrieve E2E encrypted mnemonic phrase from the server - NOT AVAILABLE
     * @returns The encrypted mnemonic data or null if not found
     */
    async getEncryptedMnemonic(): Promise<{ ciphertext: string; iv: string; salt: string } | null> {
        try {
            const response = await this.get(ENDPOINTS.WALLET.BITCOIN.GET_MNEMONIC);
            return response.data;
        } catch (error) {
            console.error('Failed to retrieve encrypted mnemonic:', error);
            return null;
        }
    }
}

const walletService = new BitcoinWalletService();
export default walletService; 