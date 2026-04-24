import cryptoPriceService from '$lib/api/services/crypto-price.service';
import { ethers } from 'ethers';
import { createServiceContractFromSnapshot } from '$lib/utils/service-contract/create-from-snapshot';
import {
	preflightServiceContractCreation,
	type ServiceContractPreflightErrorCode
} from '$lib/utils/service-contract/preflight';
import { escrow } from '$lib/utils/escrow';
import { extractContractError } from '$lib/utils/wallet/contractErrorHandler';
import type {
	ServiceContractAgreementSnapshot,
	ServiceContractPricingSnapshot
} from '$lib/types/contract';
import {
	createServiceAcceptanceSnapshot,
	getConfiguredRskChainId,
	getConfiguredRskContractAddress,
	getConfiguredVerificationRpcLabel
} from '$lib/utils/service-contract/acceptance-snapshot';
import { normalizeServiceContractSchedule } from '$lib/utils/service-contract/schedule';

const DEFAULT_CLIENT_FEE_TIER = 1;

function normalizePlainRskAddress(address: string): string {
	return ethers.getAddress(address.trim().toLowerCase()).toLowerCase();
}

export interface ServiceContractCreationInput {
	freelancerPubkey: string;
	freelancerAddress: string;
	amountUsdt: string;
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
	freelancerFeeTier?: 0 | 1 | 2;
}

export type ServiceContractCreationState =
	| 'preflight_failed'
	| 'funding_failed'
	| 'funding_submitted';

export type ServiceContractCreationResult =
	| {
			success: true;
			state: 'funding_submitted';
			transactionHash: string;
			amount: string;
			clientRskAddress: string;
			acceptanceSnapshot: ReturnType<typeof createServiceAcceptanceSnapshot>;
	  }
	| {
			success: false;
			state: 'preflight_failed' | 'funding_failed';
			transactionHash?: string;
			amount?: string;
			clientRskAddress?: string;
			acceptanceSnapshot?: ReturnType<typeof createServiceAcceptanceSnapshot>;
			error?: string;
			errorCode?: ServiceContractPreflightErrorCode;
	  };

export function convertUsdAmountToRbtc(amountUsdt: string, btcPrice: number): string {
	const parsedAmount = Number(amountUsdt);
	if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
		throw new Error('Invalid service amount. Expected a positive USD value.');
	}

	if (!Number.isFinite(btcPrice) || btcPrice <= 0) {
		throw new Error('Unable to determine the current BTC price.');
	}

	return (parsedAmount / btcPrice).toFixed(8);
}

export async function createServiceContract(
	input: ServiceContractCreationInput
): Promise<ServiceContractCreationResult> {
	let transactionHash: string | null = null;
	let amount: string | undefined;
	let clientRskAddress: string | undefined;
	let acceptanceSnapshot: ReturnType<typeof createServiceAcceptanceSnapshot> | undefined;
	const schedule = normalizeServiceContractSchedule(
		input.estimatedStartTime,
		input.estimatedCompletionTime
	);

	try {
		const btcPrice = await cryptoPriceService.getCurrentPrice('BTC');
		const preflight = await preflightServiceContractCreation(
			{
				freelancerAddress: input.freelancerAddress,
				freelancerPubkey: input.freelancerPubkey,
				amountUsdt: input.amountUsdt,
				estimatedStartTime: schedule.estimatedStartTime,
				estimatedCompletionTime: schedule.estimatedCompletionTime,
				freelancerFeeTier: input.freelancerFeeTier
			},
			btcPrice
		);
		if (!preflight.ok) {
			return {
				success: false,
				state: 'preflight_failed',
				error: preflight.error,
				errorCode: preflight.errorCode
			};
		}

		amount = preflight.amount;

		// Defensive: ensure walletAddress exists before normalization
		if (!preflight.walletAddress) {
			return {
				success: false,
				state: 'preflight_failed',
				error: 'Wallet address was not provided by preflight check.'
			};
		}

		clientRskAddress = normalizePlainRskAddress(preflight.walletAddress);
		acceptanceSnapshot = createServiceAcceptanceSnapshot({
			clientRskAddress,
			clientFeeTier: DEFAULT_CLIENT_FEE_TIER,
			freelancerRskAddress: input.freelancerAddress,
			freelancerFeeTier: input.freelancerFeeTier ?? 1,
			chainId: getConfiguredRskChainId(),
			contractAddress: getConfiguredRskContractAddress(),
			purchaseMode: input.purchaseMode,
			proposalId: input.proposalId,
			instantOrderId: input.instantOrderId,
			btcUsdRateMicros: Math.round(btcPrice * 1_000_000),
			weiAmount: ethers.parseEther(amount).toString(),
			confirmationsAtVerification: 0,
			verificationRpc: getConfiguredVerificationRpcLabel()
		});
		const transactionResult = await escrow.escrowOps.createEscrow(
			input.freelancerAddress,
			amount,
			schedule.estimatedStartTime,
			schedule.estimatedCompletionTime,
			DEFAULT_CLIENT_FEE_TIER,
			input.freelancerFeeTier ?? 1
		);

		if (!transactionResult?.hash) {
			return {
				success: false,
				state: 'funding_failed',
				error: 'Transaction failed: Missing transaction hash. Please try again.'
			};
		}

		transactionHash = transactionResult.hash;
		const pendingContract = createServiceContractFromSnapshot({
			escrowId: 'pending',
			freelancerPubkey: input.freelancerPubkey,
			clientRskAddress,
			amount,
			estimatedStartTime: schedule.estimatedStartTime,
			estimatedCompletionTime: schedule.estimatedCompletionTime,
			serviceId: input.serviceId,
			serviceAddress: input.serviceAddress,
			serviceTitle: input.serviceTitle,
			serviceDescription: input.serviceDescription,
			contextVersionRef: input.contextVersionRef,
			purchaseMode: input.purchaseMode,
			quoteRequestId: input.quoteRequestId,
			proposalId: input.proposalId,
			proposalEventId: input.proposalEventId,
			instantOrderId: input.instantOrderId,
			selectedTierId: input.selectedTierId,
			pricingSnapshot: input.pricingSnapshot,
			agreementSnapshot: input.agreementSnapshot,
			transactionHash
		});
		const pendingContractWithoutEscrowId = { ...pendingContract };
		delete pendingContractWithoutEscrowId.escrowId;
		try {
			escrow.eventOps.registerPendingContractByTxHash({
				bidEventId: input.proposalEventId ?? input.instantOrderId ?? input.serviceId,
				...pendingContractWithoutEscrowId,
				transactionHash,
				acceptanceSnapshot
			});
		} catch (registrationError) {
			console.error(
				'Failed to register pending service contract after funding submission:',
				registrationError
			);
		}

		return {
			success: true,
			state: 'funding_submitted',
			transactionHash,
			amount,
			clientRskAddress,
			acceptanceSnapshot
		};
	} catch (error) {
		if (transactionHash && amount && clientRskAddress && acceptanceSnapshot) {
			return {
				success: true,
				state: 'funding_submitted',
				transactionHash,
				amount,
				clientRskAddress,
				acceptanceSnapshot
			};
		}

		return {
			success: false,
			state: 'funding_failed',
			error: extractContractError(error).userMessage
		};
	}
}
