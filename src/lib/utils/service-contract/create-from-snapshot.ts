import type {
	CreateContractParams,
	ServiceContractAgreementSnapshot,
	ServiceContractPricingSnapshot
} from '$lib/types/contract';

export interface CreateServiceContractFromSnapshotInput {
	escrowId: string;
	freelancerPubkey: string;
	amount: string;
	estimatedStartTime: number;
	estimatedCompletionTime: number;
	serviceId: string;
	serviceAddress: string;
	serviceTitle: string;
	serviceDescription?: string;
	contextVersionRef: string;
	purchaseMode: 'quote' | 'instant_buy';
	quoteRequestId?: string;
	proposalId?: string;
	proposalEventId?: string;
	instantOrderId?: string;
	selectedTierId?: string;
	pricingSnapshot: ServiceContractPricingSnapshot;
	agreementSnapshot?: ServiceContractAgreementSnapshot;
	transactionHash?: string;
}

export function createServiceContractFromSnapshot(
	input: CreateServiceContractFromSnapshotInput
): CreateContractParams {
	return {
		escrowId: input.escrowId,
		taskId: input.serviceId,
		taskTitle: input.serviceTitle,
		taskDescription: input.serviceDescription,
		freelancerPubkey: input.freelancerPubkey,
		amount: input.amount,
		estimatedStartTime: input.estimatedStartTime,
		estimatedCompletionTime: input.estimatedCompletionTime,
		contextType: 'service',
		contextId: input.serviceId,
		contextTitle: input.serviceTitle,
		contextDescription: input.serviceDescription,
		contextVersionRef: input.contextVersionRef,
		serviceId: input.serviceId,
		serviceAddress: input.serviceAddress,
		serviceTitle: input.serviceTitle,
		quoteRequestId: input.quoteRequestId,
		proposalId: input.proposalId,
		proposalEventId: input.proposalEventId,
		purchaseMode: input.purchaseMode,
		instantOrderId: input.instantOrderId,
		selectedTierId: input.selectedTierId,
		pricingSnapshot: input.pricingSnapshot,
		agreementSnapshot: input.agreementSnapshot,
		transactionHash: input.transactionHash
	};
}
