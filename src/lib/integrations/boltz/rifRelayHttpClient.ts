/**
 * RIF Relay HTTP Client
 * Direct HTTP API implementation for RIF Relay without SDK dependency
 * 
 * This avoids the ethers v5/v6 compatibility issues with @rsksmart/rif-relay-client
 * by directly calling the RIF Relay HTTP API.
 * 
 * Based on official RIF Relay Integration documentation:
 * https://dev.rootstock.io/developers/integrate/rif-relay/integrate/
 * 
 * API Endpoint: POST http://<SERVER_URL>/relay
 * Request Format:
 * {
 *   "relayRequest": { request: {...}, relayData: {...} },
 *   "metadata": { relayHubAddress, signature, relayMaxNonce }
 * }
 */

import { ethers, type Wallet } from 'ethers';
import { getBoltzConfig, isRifRelayAvailable } from './config';

export interface RelayTransactionParams {
    from: string;
    to: string;
    data: string;
    gas?: string;
    value?: string;
    tokenContract?: string; // Token to pay fees with (optional)
    tokenAmount?: string; // Amount of tokens to pay (optional)
}

export interface RelayTransactionResult {
    hash: string;
    relayed: boolean;
}

export interface RelayMetadata {
    relayHubAddress: string;
    relayWorkerAddress: string;
    relayManagerAddress: string;
    feesReceiver: string;
    minGasPrice: string;
    ready: boolean;
    version: string;
    chainId: string;
    networkId: string;
}

export interface RelayVerifiers {
    trustedVerifiers: string[];
}

export class RifRelayHttpClientError extends Error {
    constructor(
        message: string,
        public code: string,
        public originalError?: unknown
    ) {
        super(message);
        this.name = 'RifRelayHttpClientError';
    }
}

/**
 * RIF Relay HTTP Client
 * Direct HTTP API integration without SDK dependency
 */
export class RifRelayHttpClient {
    private config = getBoltzConfig();
    private relayMetadata: RelayMetadata | null = null;

    /**
     * Get relay server metadata
     */
    async getRelayMetadata(): Promise<RelayMetadata> {
        if (this.relayMetadata) {
            return this.relayMetadata;
        }

        try {
            const response = await fetch(`${this.config.rifRelayServerUrl}/chain-info`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw new RifRelayHttpClientError(
                    `Failed to fetch relay metadata: ${response.statusText}`,
                    'METADATA_FETCH_FAILED'
                );
            }

            this.relayMetadata = await response.json();
            return this.relayMetadata!;
        } catch (error) {
            console.error('❌ Failed to get relay metadata:', error);
            throw new RifRelayHttpClientError(
                'Failed to get relay metadata: ' + (error instanceof Error ? error.message : 'Unknown error'),
                'METADATA_ERROR',
                error
            );
        }
    }

    /**
     * Get relay verifiers
     */
    async getRelayVerifiers(): Promise<RelayVerifiers> {
        try {
            const response = await fetch(`${this.config.rifRelayServerUrl}/verifiers`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw new RifRelayHttpClientError(
                    `Failed to fetch relay verifiers: ${response.statusText}`,
                    'VERIFIERS_FETCH_FAILED'
                );
            }

            return await response.json();
        } catch (error) {
            console.error('❌ Failed to get relay verifiers:', error);
            throw new RifRelayHttpClientError(
                'Failed to get relay verifiers: ' + (error instanceof Error ? error.message : 'Unknown error'),
                'VERIFIERS_ERROR',
                error
            );
        }
    }

    /**
     * Check if relay server is healthy and ready
     */
    async checkHealth(): Promise<boolean> {
        try {
            const metadata = await this.getRelayMetadata();
            return metadata.ready === true;
        } catch (error) {
            console.error('❌ Health check failed:', error);
            return false;
        }
    }

    /**
     * Relay a transaction through RIF Relay (gasless)
     * 
     * This method constructs a relay request according to the official RIF Relay API spec
     * and submits it to the RIF Relay server which will pay the gas fees and broadcast it.
     * 
     * Important: For RIF Relay to work, the transaction must be sent FROM a Smart Wallet,
     * not an EOA. If you don't have a smart wallet deployed, you need to deploy one first
     * using a Deploy Request.
     * 
     * Reference: https://dev.rootstock.io/developers/integrate/rif-relay/integrate/
     * 
     * @param txParams - Transaction parameters
     * @param signer - Ethers wallet signer (must be the smart wallet owner)
     * @param smartWalletAddress - The smart wallet address (callForwarder)
     * @returns Transaction hash
     */
    async relayTransaction(
        txParams: RelayTransactionParams,
        signer: Wallet,
        smartWalletAddress?: string
    ): Promise<RelayTransactionResult> {
        try {
            if (!isRifRelayAvailable()) {
                throw new RifRelayHttpClientError(
                    'RIF Relay is not available for this environment',
                    'RIF_RELAY_UNAVAILABLE'
                );
            }

            console.log('🚀 Relaying transaction via RIF Relay HTTP API:', {
                from: txParams.from,
                to: txParams.to,
                dataLength: txParams.data.length,
                gas: txParams.gas,
                value: txParams.value || '0'
            });

            // Get relay metadata
            const metadata = await this.getRelayMetadata();

            if (!metadata.ready) {
                throw new RifRelayHttpClientError(
                    'RIF Relay server is not ready',
                    'RELAY_NOT_READY'
                );
            }

            // Build relay request according to RIF Relay specification
            // The relay request needs to be signed by the user
            const nonce = await signer.provider!.getTransactionCount(txParams.from);
            const relayRequest = {
                request: {
                    from: txParams.from,
                    to: txParams.to,
                    data: txParams.data,
                    value: txParams.value || '0',
                    gas: txParams.gas || '200000',
                    nonce: nonce?.toString() || '0',
                    relayHub: metadata.relayHubAddress,
                    relayWorker: metadata.relayWorkerAddress
                },
                relayData: {
                    gasPrice: metadata.minGasPrice,
                    feesReceiver: metadata.feesReceiver,
                    callForwarder: txParams.from, // User's address
                    callVerifier: metadata.relayHubAddress
                }
            };

            // Sign the relay request
            // The signature proves that the user authorized this transaction
            const requestHash = ethers.keccak256(
                ethers.AbiCoder.defaultAbiCoder().encode(
                    ['address', 'address', 'bytes', 'uint256', 'uint256', 'uint256', 'address', 'address'],
                    [
                        relayRequest.request.from,
                        relayRequest.request.to,
                        relayRequest.request.data,
                        relayRequest.request.value,
                        relayRequest.request.gas,
                        relayRequest.request.nonce,
                        relayRequest.request.relayHub,
                        relayRequest.request.relayWorker
                    ]
                )
            );

            const signature = await signer.signMessage(ethers.getBytes(requestHash));

            // Submit relay request to RIF Relay server
            const response = await fetch(`${this.config.rifRelayServerUrl}/relay`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    relayRequest,
                    signature
                })
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error('❌ RIF Relay server error:', response.status, errorText);
                throw new RifRelayHttpClientError(
                    `Relay request failed: ${response.status} ${errorText}`,
                    'RELAY_REQUEST_FAILED'
                );
            }

            const result = await response.json();

            console.log({ result });

            // Extract transaction hash from result
            const txHash = result.txHash || result.hash || result.transactionHash || result.tx;

            if (!txHash) {
                console.error('❌ Response structure:', {
                    keys: Object.keys(result),
                    fullResult: result
                });
                throw new RifRelayHttpClientError(
                    `No transaction hash in relay response. Response keys: ${Object.keys(result).join(', ')}`,
                    'INVALID_RELAY_RESPONSE'
                );
            }

            console.log('✅ Transaction relayed successfully:', txHash);

            return {
                hash: txHash,
                relayed: true
            };
        } catch (error) {
            console.error('❌ Failed to relay transaction:', error);

            if (error instanceof RifRelayHttpClientError) {
                throw error;
            }

            throw new RifRelayHttpClientError(
                'Transaction relay failed: ' + (error instanceof Error ? error.message : 'Unknown error'),
                'RELAY_FAILED',
                error
            );
        }
    }

    /**
     * Estimate relay transaction fees
     */
    async estimateRelayFees(txParams: RelayTransactionParams): Promise<bigint> {
        try {
            const metadata = await this.getRelayMetadata();
            const gasLimit = BigInt(txParams.gas || '200000');
            const gasPrice = BigInt(metadata.minGasPrice);
            return gasLimit * gasPrice;
        } catch (error) {
            console.error('❌ Failed to estimate relay fees:', error);
            // Return a safe default estimate
            return BigInt('200000') * BigInt('60000000'); // ~0.012 RBTC
        }
    }

    /**
     * Reset cached metadata (for testing or error recovery)
     */
    reset(): void {
        this.relayMetadata = null;
        console.log('🔄 RIF Relay HTTP client reset');
    }
}

// Export singleton instance
export const rifRelayHttpClient = new RifRelayHttpClient();

