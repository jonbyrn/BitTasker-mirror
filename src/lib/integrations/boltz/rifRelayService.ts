/**
 * RIF Relay Service
 * Wrapper around @rsksmart/rif-relay-client for gasless RBTC transactions
 * 
 * RIF Relay allows users to execute blockchain transactions without holding
 * the native token (RBTC) for gas fees. The relay server pays gas fees and
 * optionally charges users through alternative means.
 * 
 * This implementation bridges between ethers v6 (used in our contracts) and
 * ethers v5 (required by @rsksmart/rif-relay-client).
 */

import { RelayClient } from '@rsksmart/rif-relay-client';
import type { Wallet } from 'ethers';
import { getBoltzConfig, isRifRelayAvailable } from './config';

export interface RelayTransactionParams {
	from: string;
	to: string;
	data: string;
	gas?: string;
	value?: string;
}

export interface RelayTransactionResult {
	hash: string;
	relayed: boolean;
}

export class RifRelayServiceError extends Error {
	constructor(
		message: string,
		public code: string,
		public originalError?: unknown
	) {
		super(message);
		this.name = 'RifRelayServiceError';
	}
}

/**
 * RIF Relay Service for gasless transaction relaying
 */
export class RifRelayService {
	private relayClient: RelayClient | null = null;
	private initialized = false;
	private config = getBoltzConfig();

	/**
	 * Initialize the RIF Relay client
	 */
	async initialize(): Promise<void> {
		try {
			if (this.initialized && this.relayClient) {
				return; // Already initialized
			}

			if (!isRifRelayAvailable()) {
				throw new RifRelayServiceError(
					'RIF Relay is not available for this environment',
					'RIF_RELAY_UNAVAILABLE'
				);
			}

			console.log('🔧 Initializing RIF Relay client:', {
				serverUrl: this.config.rifRelayServerUrl,
				chainId: this.config.rskChainId
			});

			// Initialize RIF Relay client
			// The constructor takes an optional HttpClient and relay server URL
			this.relayClient = new RelayClient(undefined, this.config.rifRelayServerUrl);

			// Verify connection by checking if relay server is reachable
			const relayServerUrl = this.relayClient.getRelayServerUrl();
			if (!relayServerUrl) {
				throw new RifRelayServiceError(
					'Relay server URL not set',
					'RIF_RELAY_NOT_CONFIGURED'
				);
			}

			// Test connection
			const isHealthy = await this.checkHealth();
			if (!isHealthy) {
				throw new RifRelayServiceError(
					'RIF Relay server is not healthy',
					'RIF_RELAY_UNHEALTHY'
				);
			}

			this.initialized = true;
			console.log('✅ RIF Relay client initialized successfully');
		} catch (error) {
			console.error('❌ Failed to initialize RIF Relay client:', error);
			this.initialized = false;
			this.relayClient = null;

			if (error instanceof RifRelayServiceError) {
				throw error;
			}

			throw new RifRelayServiceError(
				'Failed to initialize RIF Relay: ' + (error instanceof Error ? error.message : 'Unknown error'),
				'INITIALIZATION_FAILED',
				error
			);
		}
	}

	/**
	 * Check if RIF Relay server is healthy
	 */
	async checkHealth(): Promise<boolean> {
		try {
			// Try to fetch chain info from RIF Relay server
			const response = await fetch(`${this.config.rifRelayServerUrl}/chain-info`, {
				method: 'GET',
				headers: {
					'Content-Type': 'application/json'
				}
			});

			if (!response.ok) {
				console.warn('⚠️ RIF Relay health check failed:', response.status, response.statusText);
				return false;
			}

			const chainInfo = await response.json();
			console.log('✅ RIF Relay server is healthy:', {
				relayHubAddress: chainInfo.relayHubAddress,
				relayWorkerAddress: chainInfo.relayWorkerAddress
			});

			return true;
		} catch (error) {
			console.error('❌ RIF Relay health check error:', error);
			return false;
		}
	}

	/**
	 * Relay a transaction through RIF Relay (gasless)
	 * 
	 * @param txParams - Transaction parameters
	 * @param signer - Ethers v6 wallet signer for signing relay request
	 * @returns Transaction hash
	 */
	async relayTransaction(
		txParams: RelayTransactionParams,
		signer: Wallet
	): Promise<RelayTransactionResult> {
		try {
			if (!this.initialized || !this.relayClient) {
				await this.initialize();
			}

			if (!this.relayClient) {
				throw new RifRelayServiceError(
					'RIF Relay client not available',
					'CLIENT_NOT_INITIALIZED'
				);
			}

			console.log('🚀 Relaying transaction via RIF Relay:', {
				from: txParams.from,
				to: txParams.to,
				dataLength: txParams.data.length,
				gas: txParams.gas,
				value: txParams.value || '0'
			});

			// Build the enveloping request according to RIF Relay specification
			// This is a relay request (not a deploy request)
			const envelopingRequest = {
				request: {
					// Required fields for relay request
					from: txParams.from,
					to: txParams.to,
					data: txParams.data,
					value: txParams.value || '0',
					
					// Optional fields that will be filled by the client if not provided
					gas: txParams.gas || '200000',
					// nonce, relayHub, tokenGas, validUntilTime, tokenAmount will be auto-filled
				},
				relayData: {
					// Optional fields that will be filled by the client if not provided
					// callVerifier, feesReceiver, gasPrice will be auto-filled by RIF Relay client
				}
			};

			// Relay the transaction using the RIF Relay client
			// The client will:
			// 1. Complete the request with missing fields (nonce, relayHub, etc.)
			// 2. Sign it with the provided signer (converted to ethers v5 internally)
			// 3. Send to RIF Relay server
			// 4. Return the transaction object
			const result = await this.relayClient.relayTransaction(
				envelopingRequest as any,
				{
					// Pass the ethers v6 wallet
					// The RIF Relay client will handle the conversion internally
					from: signer
				} as any
			);

			console.log('✅ Transaction relayed successfully:', result);

			// Extract transaction hash from result
			// The result is an ethers Transaction object
			const txHash = result.hash;

			if (!txHash) {
				throw new RifRelayServiceError(
					'No transaction hash in relay response',
					'INVALID_RELAY_RESPONSE'
				);
			}

			return {
				hash: txHash,
				relayed: true
			};
		} catch (error) {
			console.error('❌ Failed to relay transaction:', error);

			if (error instanceof RifRelayServiceError) {
				throw error;
			}

			throw new RifRelayServiceError(
				'Transaction relay failed: ' + (error instanceof Error ? error.message : 'Unknown error'),
				'RELAY_FAILED',
				error
			);
		}
	}

	/**
	 * Check if service is initialized and ready
	 */
	isReady(): boolean {
		return this.initialized && this.relayClient !== null;
	}

	/**
	 * Reset the service (for testing or error recovery)
	 */
	reset(): void {
		this.initialized = false;
		this.relayClient = null;
		console.log('🔄 RIF Relay service reset');
	}
}

// Export singleton instance
export const rifRelayService = new RifRelayService();
