import type { FeeTier } from '@bittasker/wallet-core';
import type { ethers } from 'ethers';
import type {
	ServiceContractAgreementSnapshot,
	ServiceContractPricingSnapshot
} from '$lib/types/contract';

export interface ServiceContractCreationInputV2 {
	freelancerPubkey: string;
	freelancerAddress: string;
	amountRbtc: string;
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
	clientFeeTier: FeeTier;
	freelancerFeeTier: FeeTier;
}

export type ServiceContractCreationResultV2 =
	| {
			success: true;
			transactionHash: string;
			tx: ethers.ContractTransactionResponse;
			afterBroadcast: Promise<{ failures: { name: string; error: unknown }[] }>;
			afterConfirmed: (receipt: ethers.TransactionReceipt) => Promise<{ paymentId: number }>;
	  }
	| {
			success: false;
			error: string;
	  };

export async function createServiceContract(
	input: ServiceContractCreationInputV2
): Promise<ServiceContractCreationResultV2> {
	void input;

	return {
		success: false,
		error: 'Service contract v2 creation is not configured for this client build.'
	};
}