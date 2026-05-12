/**
 * Blockchain provider interface
 */

/**
 * Escrow status from blockchain contract
 */
export enum EscrowStatus {
	Funded = 'Funded',
	InDispute = 'InDispute',
	DisputeResolved = 'DisputeResolved',
	DisputeUnresolved = 'DisputeUnresolved',
	Completed = 'Completed',
	Cancelled = 'Cancelled'
}

/**
 * Escrow event data from blockchain
 */
export interface EscrowEvent {
	/** Escrow ID */
	escrowId: string;
	/** Transaction hash */
	transactionHash: string;
	/** Block number */
	blockNumber: number;
	/** Block timestamp */
	timestamp: number;
	/** Client address */
	client: string;
	/** Freelancer address */
	freelancer: string;
	/** Amount (in wei or smallest unit) */
	amount: string;
}

/**
 * Escrow creation event
 */
export interface EscrowCreatedEvent extends EscrowEvent {
	type: 'EscrowCreated';
}

/**
 * Escrow resolution event (completed or dispute resolved)
 */
export interface EscrowResolvedEvent extends EscrowEvent {
	type: 'EscrowResolved';
	/** Freelancer amount */
	freelancerAmount: string;
	/** Platform fee */
	platformFee: string;
}

/**
 * Abstract blockchain provider interface
 */
export interface BlockchainProvider {
	/**
	 * Get escrow details by ID
	 */
	getEscrow(escrowId: string): Promise<EscrowDetails | null>;

	/**
	 * Query escrow creation events
	 */
	queryEscrowCreatedEvents(params: {
		fromBlock?: number;
		toBlock?: number;
		client?: string;
		freelancer?: string;
	}): Promise<EscrowCreatedEvent[]>;

	/**
	 * Query escrow resolution events
	 */
	queryEscrowResolvedEvents(params: {
		fromBlock?: number;
		toBlock?: number;
		escrowId?: string;
	}): Promise<EscrowResolvedEvent[]>;

	/**
	 * Get transaction receipt
	 */
	getTransactionReceipt(txHash: string): Promise<TransactionReceipt | null>;
}

/**
 * Escrow details from contract
 */
export interface EscrowDetails {
	/** Escrow ID */
	id: string;
	/** Client address */
	client: string;
	/** Freelancer address */
	freelancer: string;
	/** Current status */
	status: EscrowStatus;
	/** Amount */
	amount: string;
	/** Created timestamp */
	createdAt: number;
}

/**
 * Transaction receipt
 */
export interface TransactionReceipt {
	/** Transaction hash */
	hash: string;
	/** Block number */
	blockNumber: number;
	/** Block timestamp */
	timestamp: number;
	/** Status (true = success) */
	status: boolean;
	/** Events emitted */
	events: any[];
}


