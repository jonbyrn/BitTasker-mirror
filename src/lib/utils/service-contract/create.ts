/**
 * Service Contract Creation
 *
 * Creates service contracts using v2 escrow patterns.
 * This module serves as the entry point for service contract creation,
 * delegating to the v2 service-creation module for blockchain operations.
 */

import cryptoPriceService from '$lib/api/services/crypto-price.service';
import { ethers } from 'ethers';
import {
	preflightServiceContractCreation,
	type ServiceContractPreflightErrorCode
} from '$lib/utils/service-contract/preflight';
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
import { registerPendingServiceContractV2 } from '$lib/utils/contract/v2';
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
			tx?: unknown;
			afterBroadcast?: Promise<{ failures: { name: string; error: unknown }[] }>;
			afterConfirmed?: (receipt: ethers.TransactionReceipt) => Promise<{ paymentId: number }>;
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

/**
 * Creates a service contract using v2 escrow patterns.
 *
 * Flow:
 * 1. Preflight: Check wallet, balance, and network
 * 2. Convert USD to RBTC using current BTC price
 * 3. Call v2 createServiceContract which:
 *    - Broadcasts the transaction
 *    - Publishes NDKPaymentContract with service context
 *    - Sends push notifications
 * 4. Register pending contract for tx confirmation handling
 */
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
		d.log('createServiceContract: starting', { serviceId: input.serviceId });

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
			d.log('createServiceContract: preflight failed', { error: preflight.error });
			return {
				success: false,
				state: 'preflight_failed',
				error: preflight.error,
				errorCode: preflight.errorCode
			};
		}

		amount = preflight.amount;
		clientRskAddress = normalizePlainRskAddress(preflight.walletAddress);

		acceptanceSnapshot = createServiceAcceptanceSnapshot({
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
			freelancerFeeTier: (input.freelancerFeeTier ?? 1) as FeeTier,
			acceptanceSnapshot
		};

		d.log('createServiceContract: calling v2 createServiceContract');
		const v2Result = await createServiceContractV2(v2Input);

		if (!v2Result.success) {
			d.log('createServiceContract: v2 creation failed', { error: v2Result.error });
			return {
				success: false,
				state: 'funding_failed',
				error: v2Result.error
			};
		}

		transactionHash = v2Result.transactionHash;
		d.log('createServiceContract: v2 creation succeeded', { transactionHash });

		try {
			registerPendingServiceContractV2({
				transactionHash,
				serviceId: input.serviceId,
				serviceAddress: input.serviceAddress,
				serviceTitle: input.serviceTitle,
				freelancerPubkey: input.freelancerPubkey,
				purchaseMode: input.purchaseMode,
				proposalId: input.proposalId,
				proposalEventId: input.proposalEventId,
				quoteRequestId: input.quoteRequestId,
				instantOrderId: input.instantOrderId,
				acceptanceSnapshot
			});
		} catch (registrationError) {
			d.warn('createServiceContract: failed to register pending contract', registrationError);
		}

		return {
			success: true,
			state: 'funding_submitted',
			transactionHash,
			amount,
			clientRskAddress,
			acceptanceSnapshot,
			tx: v2Result.tx,
			afterBroadcast: v2Result.afterBroadcast,
			afterConfirmed: v2Result.afterConfirmed
		};
	} catch (error) {
		d.error('createServiceContract: unexpected error', error);

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
