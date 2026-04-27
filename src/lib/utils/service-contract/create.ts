/**
 * Service Contract Creation
 *
 * Creates service contracts using v2 escrow patterns.
 * This module follows the same pattern as BidAcceptanceFormV2.svelte uses for tasks:
 * - Derives params from input
 * - Broadcasts transaction
 * - Returns tx + afterBroadcast + afterConfirmed for the UI to handle
 */

import cryptoPriceService from '$lib/api/services/crypto-price.service';
import { ethers } from 'ethers';
import {
	createServiceContract as createServiceContractV2,
	type ServiceContractCreationInputV2
} from '$lib/utils/contract/v2/service-creation';
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
import { createDebug } from '$lib/utils/debug';
import type { FeeTier } from '@bittasker/wallet-core';

const d = createDebug('service-contract:create');
const DEFAULT_CLIENT_FEE_TIER: FeeTier = 1;

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
	/** Client wallet address - if not provided, will be fetched from v2 creation */
	clientRskAddress?: string;
}

export type ServiceContractCreationResult =
	| {
			success: true;
			transactionHash: string;
			amount: string;
			clientRskAddress: string;
			acceptanceSnapshot: ReturnType<typeof createServiceAcceptanceSnapshot>;
			tx: ethers.ContractTransactionResponse;
			afterBroadcast: Promise<{ failures: { name: string; error: unknown }[] }>;
			afterConfirmed: (receipt: ethers.TransactionReceipt) => Promise<{ paymentId: number }>;
	  }
	| {
			success: false;
			error: string;
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

/**
 * Creates a service contract using v2 escrow patterns.
 *
 * This follows the same pattern as v2 task creation:
 * 1. Derives contract params from input
 * 2. Broadcasts the transaction
 * 3. Returns tx + afterBroadcast + afterConfirmed for the UI to handle
 *
 * The UI is responsible for:
 * - Checking wallet balance before calling this
 * - Calling tx.wait() to wait for confirmation
 * - Calling afterConfirmed(receipt) to update the Nostr event
 */
export async function createServiceContract(
	input: ServiceContractCreationInput
): Promise<ServiceContractCreationResult> {
	const schedule = normalizeServiceContractSchedule(
		input.estimatedStartTime,
		input.estimatedCompletionTime
	);

	try {
		d.log('createServiceContract: starting', { serviceId: input.serviceId });

		const btcPrice = await cryptoPriceService.getCurrentPrice('BTC');
		const amount = convertUsdAmountToRbtc(input.amountUsdt, btcPrice);

		const v2Input: ServiceContractCreationInputV2 = {
			freelancerPubkey: input.freelancerPubkey,
			freelancerAddress: input.freelancerAddress,
			amountRbtc: amount,
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
			clientFeeTier: DEFAULT_CLIENT_FEE_TIER,
			freelancerFeeTier: (input.freelancerFeeTier ?? 1) as FeeTier
		};

		d.log('createServiceContract: calling v2 createServiceContract');
		const v2Result = await createServiceContractV2(v2Input);

		if (!v2Result.success) {
			d.log('createServiceContract: v2 creation failed', { error: v2Result.error });
			return {
				success: false,
				error: v2Result.error ?? 'Failed to create service contract'
			};
		}

		const clientRskAddress = input.clientRskAddress
			? normalizePlainRskAddress(input.clientRskAddress)
			: '';

		const acceptanceSnapshot = createServiceAcceptanceSnapshot({
			clientRskAddress,
			clientFeeTier: DEFAULT_CLIENT_FEE_TIER as 0 | 1 | 2,
			freelancerRskAddress: input.freelancerAddress,
			freelancerFeeTier: (input.freelancerFeeTier ?? 1) as 0 | 1 | 2,
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

		d.log('createServiceContract: success', { transactionHash: v2Result.transactionHash });

		return {
			success: true,
			transactionHash: v2Result.transactionHash,
			amount,
			clientRskAddress,
			acceptanceSnapshot,
			tx: v2Result.tx,
			afterBroadcast: v2Result.afterBroadcast,
			afterConfirmed: v2Result.afterConfirmed
		};
	} catch (error) {
		d.error('createServiceContract: unexpected error', error);
		return {
			success: false,
			error: extractContractError(error).userMessage
		};
	}
}
