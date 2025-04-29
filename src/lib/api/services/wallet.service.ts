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

import type { Transaction, TransactionType, Wallet } from '$lib/types/wallet';
import { NetworkTypeEnum } from '$lib/utils/enums/wallet.enum';
import { BaseApiService } from '../apiService';
import { ENDPOINTS } from '../endpoints';

class BitcoinWalletService extends BaseApiService {
    /**
     * Get Bitcoin wallets for the authenticated user
     * @response 200: Wallets retrieved
     * @response 400: Failed to retrieve wallets
     * @response 404: User has no wallets
     * @returns User wallets
     */
    async getWallets(): Promise<Wallet[]> {
        try {
            const response = await this.get(ENDPOINTS.WALLET.BITCOIN.GET);
            return response.data;
        } catch (error) {
            console.error('Failed to get wallets:', error);
            return [];
        }
    }

    /**
     * Create a new Bitcoin wallet for the authenticated user
     */
    async createWallet({ address, network }: { address: string, network: string }) {
        const response = await this.post(ENDPOINTS.WALLET.BITCOIN.CREATE, { address, network });
        return response.data;
    }

    /**
     * Get all transactions for the authenticated user
     */
    async getTransactions(): Promise<TransactionType[]> {
        try {
            // TODO: ENDPOINT NOT AVAILABLE
            // const response = await this.get(ENDPOINTS.WALLET.BITCOIN.TRANSACTIONS);
            // return response.data;
            const mockTransactions: TransactionType[] = [
                {
                    txid: 'tx1',
                    type: 'incoming',
                    amount: 0.00123456,
                    blockHeight: 680000,
                    confirmed: true,
                    confirmationTime: '2025-04-29T20:11:43.988Z',
                    fees: 0.00005678,
                },
                {
                    txid: 'tx2',
                    type: 'outgoing',
                    amount: 0.00045678,
                    blockHeight: 680001,
                    confirmed: true,
                    confirmationTime: '2025-04-29T20:11:43.988Z',
                    fees: 0.00005678,
                }
            ];
            return new Promise((resolve) => {
                setTimeout(() => {
                    resolve(mockTransactions);
                }, 1000);
            });
        } catch (error) {
            console.error('Failed to get transactions:', error);
            throw error;
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
     * Check balance for a specific Bitcoin address
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
     * Get transactions for a specific Bitcoin address
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
     * Add address to user's whitelist
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
     * Get user's whitelisted addresses
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
     * Create a Bitcoin transaction skeleton
     * @param fromAddress The address to send from
     * @param toAddress The address to send to
     * @param amount The amount to send
     * @response 201: Transaction skeleton created
     * @response 400: Invalid input
     */
    async createTransactionSkeleton({ fromAddress, toAddress, amount }: { fromAddress: string, toAddress: string, amount: number }) {
        try {
            const response = await this.post(ENDPOINTS.WALLET.BITCOIN.TRANSACTION, { fromAddress, toAddress, amount });
            return response.data;
        } catch (error) {
            console.error('Failed to create transaction skeleton:', error);
            throw error;
        }
    }

    /**
     * Broadcast a signed Bitcoin transaction
     * TODO: Validate endpoint payload
     * @param tx The transaction to broadcast
     * @param signatures The signatures of the transaction
     * @param pubKeys The public keys of the transaction
     * @response 200: Broadcast successfull
     * @response 400: Invalid payload
     * @returns The transaction ID
     */
    async broadcastTransaction({ tx, signatures, pubKeys }: { tx: Transaction, signatures: string[], pubKeys: string[] }) {
        try {
            const response = await this.post(ENDPOINTS.WALLET.BITCOIN.BROADCAST, { tx, signatures, pubKeys });
            return response.data;
        } catch (error) {
            console.error('Failed to broadcast transaction:', error);
            throw error;
        }
    }

    /**
     * Check Bitcoin transaction status
     * @param txid The transaction ID
     * @response 200: Transaction status retrieved
     * @response 400: Invalid transaction ID
     * @returns The transaction status
     */
    async checkTransactionStatus(txid: string) {
        try {
            const response = await this.get(ENDPOINTS.WALLET.BITCOIN.CHECK_STATUS(txid));
            return response.data;
        } catch (error) {
            console.error('Failed to check transaction status:', error);
            throw error;
        }
    }

    /**
     * Withdraw Bitcoin
     * @param amount The amount to withdraw
     * @param address The address to withdraw to
     * @param fee The fee to pay
     * @param memo The memo to send with the transaction
     * @param verificationId The verification ID
     * @param verificationCode The verification code
     * @response 200: Withdrawal successful
     * @response 400: Invalid input
     */
    async withdrawBitcoin({ address, amount, fee, memo, verificationId, verificationCode }: { address: string, amount: number, fee: number, memo: string, verificationId: string, verificationCode: string }) {
        try {
            const response = await this.post(ENDPOINTS.WALLET.BITCOIN.WITHDRAW, { address, amount, fee, memo, verificationId, verificationCode });
            return response.data;
        } catch (error) {
            console.error('Failed to withdraw Bitcoin:', error);
            throw error;
        }
    }
    /**
     * Validate a Bitcoin address (not available)
     */
    /* async validateAddress(address: string): Promise<boolean> {
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
    } */

    /**
     * Send Bitcoin to an address
     */
    /* async sendBitcoin(params: SendTxParams): Promise<{
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
    } */

    /**
     * Store E2E encrypted mnemonic phrase on the server - NOT AVAILABLE
     * @param encryptedData The encrypted mnemonic data
     * @returns Success status
     */
    /* async storeEncryptedMnemonic(encryptedData: { ciphertext: string; iv: string; salt: string }): Promise<boolean> {
        try {
            const response = await this.post(ENDPOINTS.WALLET.BITCOIN.STORE_MNEMONIC, encryptedData);
            return response.status === 200;
        } catch (error) {
            console.error('Failed to store encrypted mnemonic:', error);
            throw error;
        }
    } */

    /**
     * Retrieve E2E encrypted mnemonic phrase from the server - NOT AVAILABLE
     * @returns The encrypted mnemonic data or null if not found
     */
    /* async getEncryptedMnemonic(): Promise<{ ciphertext: string; iv: string; salt: string } | null> {
        try {
            const response = await this.get(ENDPOINTS.WALLET.BITCOIN.GET_MNEMONIC);
            return response.data;
        } catch (error) {
            console.error('Failed to retrieve encrypted mnemonic:', error);
            return null;
        }
    } */
}

const walletService = new BitcoinWalletService();
export default walletService; 