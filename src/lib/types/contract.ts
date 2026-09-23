export type ContractStatus =
	| 'draft'
	| 'bid_accepted'
	| 'funded'
	| 'work_submitted'
	| 'released'
	| 'disputed'
	| 'refunded';

export interface ContractEscrowState {
	contractId: string;
	taskEventId: string;
	taskDTag: string;
	clientPubkey: string;
	freelancerPubkey: string;
	amountSats: number;
	escrowAddress: string | null;
	fundingTxid: string | null;
	releaseTxid: string | null;
	status: ContractStatus;
	createdAt: number;
	fundedAt: number | null;
	workSubmittedAt: number | null;
	releasedAt: number | null;
	workMessage: string | null;
	workDeliveryUrl: string | null;
	network?: string;
	refundTxid?: string | null;
}

export interface ServiceContractAgreementSnapshot {
	serviceId?: string;
	serviceAddress?: string;
	title?: string;
	description?: string;
	amount?: number;
	currency?: string;
	[key: string]: unknown;
}

export interface ContractWithEvents {
	id: string;
	status?: string;
	escrowData?: unknown;
	contractEvent: {
		id?: string;
		content: Record<string, unknown>;
		[key: string]: unknown;
	};
	permissions: Record<string, boolean>;
	[key: string]: unknown;
}
