/**
 * Ethers.js blockchain provider implementation for Rootstock
 */

import type { Contract, JsonRpcProvider } from 'ethers';
import type {
	BlockchainProvider,
	EscrowCreatedEvent,
	EscrowResolvedEvent,
	EscrowDetails,
	TransactionReceipt
} from '../types/blockchain.js';
import { EscrowStatus } from '../types/blockchain.js';

/**
 * Configuration for Ethers blockchain provider
 */
export interface EthersProviderConfig {
	/** Ethers contract instance */
	contract: Contract;
	/** Ethers provider instance */
	provider: JsonRpcProvider;
}

/**
 * Ethers.js implementation of BlockchainProvider
 */
export class EthersBlockchainProvider implements BlockchainProvider {
	private contract: Contract;
	private provider: JsonRpcProvider;

	constructor(config: EthersProviderConfig) {
		this.contract = config.contract;
		this.provider = config.provider;
	}

	/**
	 * Get escrow details by ID
	 */
	async getEscrow(escrowId: string): Promise<EscrowDetails | null> {
		try {
			const escrowData = await this.contract.getEscrow(escrowId);

			// Map contract state enum to EscrowStatus
			const statusMapping: Record<number, EscrowStatus> = {
				0: EscrowStatus.Funded,
				1: EscrowStatus.InDispute,
				2: EscrowStatus.DisputeResolved,
				3: EscrowStatus.DisputeUnresolved,
				4: EscrowStatus.Completed,
				5: EscrowStatus.Cancelled
			};

			const status = statusMapping[escrowData.state] || EscrowStatus.Funded;

			// Get block timestamp for createdAt
			const block = await this.provider.getBlock('latest');
			const createdAt = block ? block.timestamp * 1000 : Date.now();

			return {
				id: escrowId,
				client: escrowData.client.toLowerCase(),
				freelancer: escrowData.freelancer.toLowerCase(),
				status,
				amount: escrowData.amount.toString(),
				createdAt
			};
		} catch (error) {
			console.error('Failed to get escrow:', error);
			return null;
		}
	}

	/**
	 * Query escrow creation events
	 */
	async queryEscrowCreatedEvents(params: {
		fromBlock?: number;
		toBlock?: number;
		client?: string;
		freelancer?: string;
	}): Promise<EscrowCreatedEvent[]> {
		try {
			const filter = this.contract.filters.EscrowCreated(
				null, // escrowId
				params.client,
				params.freelancer
			);

			const events = await this.contract.queryFilter(
				filter,
				params.fromBlock,
				params.toBlock
			);

			const results: EscrowCreatedEvent[] = [];

			for (const event of events) {
				// Handle both EventLog and ContractEventLog types
				const eventLog = event as any;
				if (eventLog.args) {
					const block = eventLog.getBlock ? await eventLog.getBlock() : null;
					const escrowId = eventLog.args[0]?.toString() || '';
					const client = eventLog.args[1]?.toLowerCase() || '';
					const freelancer = eventLog.args[2]?.toLowerCase() || '';
					const amount = eventLog.args[3]?.toString() || '0';

					results.push({
						escrowId,
						transactionHash: eventLog.transactionHash || eventLog.hash || '',
						blockNumber: eventLog.blockNumber || 0,
						timestamp: block ? block.timestamp * 1000 : Date.now(),
						client,
						freelancer,
						amount,
						type: 'EscrowCreated'
					});
				}
			}

			return results;
		} catch (error) {
			console.error('Failed to query EscrowCreated events:', error);
			return [];
		}
	}

	/**
	 * Query escrow resolution events
	 */
	async queryEscrowResolvedEvents(params: {
		fromBlock?: number;
		toBlock?: number;
		escrowId?: string;
	}): Promise<EscrowResolvedEvent[]> {
		try {
			const filter = this.contract.filters.EscrowResolved(
				params.escrowId || null,
				null, // client
				null // freelancer
			);

			const events = await this.contract.queryFilter(
				filter,
				params.fromBlock,
				params.toBlock
			);

			const results: EscrowResolvedEvent[] = [];

			for (const event of events) {
				// Handle both EventLog and ContractEventLog types
				const eventLog = event as any;
				if (eventLog.args) {
					const block = eventLog.getBlock ? await eventLog.getBlock() : null;
					const escrowId = eventLog.args[0]?.toString() || '';
					const client = eventLog.args[1]?.toLowerCase() || '';
					const freelancer = eventLog.args[2]?.toLowerCase() || '';
					const amount = eventLog.args[3]?.toString() || '0';
					const freelancerAmount = eventLog.args[4]?.toString() || '0';
					const platformFee = eventLog.args[5]?.toString() || '0';

					results.push({
						escrowId,
						transactionHash: eventLog.transactionHash || eventLog.hash || '',
						blockNumber: eventLog.blockNumber || 0,
						timestamp: block ? block.timestamp * 1000 : Date.now(),
						client,
						freelancer,
						amount,
						freelancerAmount,
						platformFee,
						type: 'EscrowResolved'
					});
				}
			}

			return results;
		} catch (error) {
			console.error('Failed to query EscrowResolved events:', error);
			return [];
		}
	}

	/**
	 * Get transaction receipt
	 */
	async getTransactionReceipt(txHash: string): Promise<TransactionReceipt | null> {
		try {
			const receipt = await this.provider.getTransactionReceipt(txHash);
			if (!receipt) {
				return null;
			}

			const block = await receipt.getBlock();

			return {
				hash: receipt.hash,
				blockNumber: receipt.blockNumber,
				timestamp: block ? block.timestamp * 1000 : Date.now(),
				status: receipt.status === 1,
				events: [...receipt.logs]
			};
		} catch (error) {
			console.error('Failed to get transaction receipt:', error);
			return null;
		}
	}
}

