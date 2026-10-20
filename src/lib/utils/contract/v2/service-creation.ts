/**
 * v2 Service Contract Creation
 *
 * Implements the service contract creation flow using v2 escrow patterns.
 * Adapts the task-oriented v2 creation module for service-specific needs:
 * - Works with ServiceContractCreationInput (USD amounts, fee tiers, service metadata)
 * - Publishes NDKPaymentContract with service context
 * - Integrates with service quote acceptance flow
 *
 * This module follows the "build forward" strategy - leveraging existing v2 code
 * for tasks and adapting it for services, rather than migrating v1 patterns.
 */

import { ethers } from 'ethers';
import { FEE_TIERS, type FeeTier } from '@bittasker/wallet-core';
import { createDebug } from '$lib/utils/debug';
import { NDKPaymentContract } from '$lib/nostr/events/contract';
import { ndk } from '$lib/nostr/ndk';
import {
	GAS_REIMBURSEMENT_PER_OP,
	type CreatePaymentContractParams,
	type ContractCreationDisplay,
	type GasEstimateResult,
	type WriteTxResult
} from './types';
import { assertValidCreatePaymentContractParams } from './createPaymentContractParams';
import { runParallelNamed } from '../parallelEffects';
import { createPaymentContract, estimateWrite } from './blockchainWrites';
import { getSecurePaymentContractAddress } from './contractAddress';
import type { ServiceAcceptanceSnapshot } from '$lib/types/service-quote';
import type {
	ServiceContractPricingSnapshot,
	ServiceContractAgreementSnapshot
} from '$lib/types/contract';
import type { TransactionReceipt } from 'ethers';
import { parsePaymentContractCreatedPaymentId } from './creation';
import { notificationCenterService } from '$lib/api/services/notificationCenter.service';

const d = createDebug('contract:v2:service');

const DEFAULT_FEE_TIER: FeeTier = 1;
const SERVICE_CONTRACT_START_BUFFER_SECONDS = 3600;

/**
 * Input for creating a service contract via v2.
 * Mirrors ServiceContractCreationInput from service-contract/create.ts
 */
export interface ServiceContractCreationInputV2 {
	freelancerPubkey: string;
	freelancerAddress: string;
	/** Amount in RBTC (already converted from USD) */
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
	clientFeeTier?: FeeTier;
	freelancerFeeTier?: FeeTier;
	acceptanceSnapshot?: ServiceAcceptanceSnapshot;
}

/**
 * Result from service contract creation
 */
export type ServiceContractCreationResultV2 =
	| {
			success: true;
			transactionHash: string;
			estimatedCostFormatted: string;
			tx: WriteTxResult['tx'];
			afterBroadcast: Promise<{ failures: { name: string; error: unknown }[] }>;
			afterConfirmed: (receipt: TransactionReceipt) => Promise<{ paymentId: number }>;
	  }
	| {
			success: false;
			error: string;
	  };

/**
 * Normalizes the service contract schedule, adjusting start time if it's in the past.
 */
function normalizeServiceSchedule(
	estimatedStartTime: number,
	estimatedCompletionTime: number,
	nowSeconds = Math.floor(Date.now() / 1000)
): {
	estimatedStartTime: number;
	estimatedCompletionTime: number;
	wasTimeAdjusted: boolean;
} {
	if (
		!Number.isFinite(estimatedStartTime) ||
		!Number.isFinite(estimatedCompletionTime) ||
		estimatedCompletionTime <= estimatedStartTime ||
		estimatedStartTime > nowSeconds
	) {
		return {
			estimatedStartTime,
			estimatedCompletionTime,
			wasTimeAdjusted: false
		};
	}

	const nextStartTime = nowSeconds + SERVICE_CONTRACT_START_BUFFER_SECONDS;
	const timeShift = nextStartTime - estimatedStartTime;

	return {
		estimatedStartTime: nextStartTime,
		estimatedCompletionTime: estimatedCompletionTime + timeShift,
		wasTimeAdjusted: true
	};
}

/**
 * Derives CreatePaymentContractParams from a service contract input.
 * This is the service-specific equivalent of deriveContractCreationParams in creation.ts
 */
export function deriveServiceContractParams(input: ServiceContractCreationInputV2): {
	params: CreatePaymentContractParams;
	display: ContractCreationDisplay;
} {
	const {
		freelancerAddress,
		amountRbtc,
		clientFeeTier = DEFAULT_FEE_TIER,
		freelancerFeeTier = DEFAULT_FEE_TIER
	} = input;

	if (!freelancerAddress || !ethers.isAddress(freelancerAddress)) {
		throw new Error('Invalid freelancer wallet address');
	}

	const baseAmountRbtc = parseFloat(amountRbtc);
	if (!Number.isFinite(baseAmountRbtc) || baseAmountRbtc <= 0) {
		throw new Error('Invalid service amount: amount must be a finite number greater than 0');
	}

	const baseAmount = baseAmountRbtc.toFixed(8);
	const baseAmountWei = ethers.parseEther(baseAmount);

	const taskerFeeTier = clientFeeTier;
	const taskeeFeeTier = freelancerFeeTier;
	const taskerFeePercentage = FEE_TIERS[taskerFeeTier]?.percentage ?? 250;
	const taskeeFeePercentage = FEE_TIERS[taskeeFeeTier]?.percentage ?? 250;

	const taskerFeeWei = (baseAmountWei * BigInt(taskerFeePercentage)) / 10000n;
	const taskeeFeeWei = (baseAmountWei * BigInt(taskeeFeePercentage)) / 10000n;

	const cancellationFee = 0n;
	const upfrontDeposit = 0n;

	const gasReimbursementWei = 2n * GAS_REIMBURSEMENT_PER_OP;
	const totalValueWei = baseAmountWei + taskerFeeWei + gasReimbursementWei;

	const schedule = normalizeServiceSchedule(
		input.estimatedStartTime,
		input.estimatedCompletionTime
	);

	if (schedule.estimatedCompletionTime <= schedule.estimatedStartTime) {
		throw new Error('Completion time must be after start time');
	}

	if (
		schedule.estimatedStartTime < 0 ||
		schedule.estimatedStartTime > 0xffff_ffff ||
		schedule.estimatedCompletionTime < 0 ||
		schedule.estimatedCompletionTime > 0xffff_ffff
	) {
		throw new Error('Estimated times must be within uint32 range');
	}

	const taskeeEip55 = ethers.getAddress(freelancerAddress.toLowerCase());

	const params: CreatePaymentContractParams = {
		taskee: taskeeEip55,
		estimatedStartTime: schedule.estimatedStartTime,
		estimatedCompletionTime: schedule.estimatedCompletionTime,
		taskerFeeTier,
		taskeeFeeTier,
		cancellationFee,
		upfrontDeposit,
		totalValueWei,
		baseAmountWei,
		taskerFeeWei,
		taskeeFeeWei
	};

	assertValidCreatePaymentContractParams(params);

	const display: ContractCreationDisplay = {
		chain: 'rsk',
		currency: 'RBTC',
		baseAmount,
		taskerFee: ethers.formatEther(taskerFeeWei),
		totalAmount: ethers.formatEther(totalValueWei),
		gasReimbursementAmount: ethers.formatEther(gasReimbursementWei),
		startTime: schedule.estimatedStartTime,
		completionTime: schedule.estimatedCompletionTime,
		wasTimeAdjusted: schedule.wasTimeAdjusted
	};

	return { params, display };
}

/**
 * Estimates gas cost for service contract creation.
 */
export async function estimateGasForServiceContract(
	input: ServiceContractCreationInputV2
): Promise<GasEstimateResult> {
	try {
		const { params } = deriveServiceContractParams(input);

		return estimateWrite({
			method: 'createPaymentContract',
			args: [
				params.taskee,
				params.estimatedStartTime,
				params.estimatedCompletionTime,
				params.taskerFeeTier,
				params.taskeeFeeTier,
				params.cancellationFee,
				params.upfrontDeposit
			],
			overrides: { value: params.totalValueWei }
		});
	} catch (error) {
		const err = error instanceof Error ? error : new Error(String(error));
		return { success: false, error: err.message };
	}
}

/**
 * Creates a service contract using v2 patterns.
 *
 * This is the main entry point for service contract creation.
 * It follows the same pattern as createContract() in creation.ts but adapted for services.
 */
export async function createServiceContract(
	input: ServiceContractCreationInputV2
): Promise<ServiceContractCreationResultV2> {
	const serviceId = input.serviceId;

	d.log('createServiceContract start', {
		serviceId,
		freelancerAddress: input.freelancerAddress.slice(0, 10) + '…'
	});

	try {
		const { params, display } = deriveServiceContractParams(input);
		d.log('createServiceContract: params derived', {
			taskee: params.taskee.slice(0, 10) + '…',
			totalWei: params.totalValueWei.toString().slice(0, 16) + '…',
			estimatedStartTime: params.estimatedStartTime,
			estimatedCompletionTime: params.estimatedCompletionTime
		});

		const taskeePubkey = input.freelancerPubkey;
		if (!taskeePubkey) {
			return {
				success: false,
				error: 'Freelancer pubkey is required'
			};
		}

		const taskerPubkey = (await ndk.signer?.user())?.pubkey;
		if (!taskerPubkey) {
			return {
				success: false,
				error: 'NDK signer not set. Please sign in.'
			};
		}

		d.log('createServiceContract: createPaymentContract (init, gas, staticCall, broadcast)');
		const { tx, estimatedCostFormatted } = await createPaymentContract(params);
		const transactionHash = tx.hash;
		d.log('createServiceContract: broadcast ok — pending confirmation', { transactionHash });

		const network = import.meta.env.VITE_RSK_NETWORK || 'testnet';
		const paymentContractAddress = getSecurePaymentContractAddress();

		const contractEvent = new NDKPaymentContract(ndk);
		const currentUser = await ndk.signer?.user();
		if (currentUser) {
			contractEvent.author = currentUser;
		}
		contractEvent.dTag = serviceId;
		contractEvent.taskId = serviceId;
		contractEvent.taskeePubkey = taskeePubkey;
		contractEvent.network = network;
		contractEvent.version = 'v2';
		contractEvent.status = 'pending';
		contractEvent.messageType = 'contract';
		contractEvent.taskTitle = input.serviceTitle;
		contractEvent.taskDescription = input.serviceDescription ?? '';
		contractEvent.amount = display.baseAmount;
		contractEvent.currency = 'RBTC';
		contractEvent.estimatedStartTime = params.estimatedStartTime;
		contractEvent.estimatedCompletionTime = params.estimatedCompletionTime;
		contractEvent.transactionHash = transactionHash;
		contractEvent.contractAddress = paymentContractAddress;

		// Store the agreement snapshot (includes service location)
		if (input.agreementSnapshot) {
			contractEvent.agreementSnapshot = input.agreementSnapshot;
		}

		// Add service-specific tags for context
		contractEvent.tags.push(['contextType', 'service']);
		contractEvent.tags.push(['serviceId', input.serviceId]);
		if (input.serviceAddress) {
			contractEvent.tags.push(['serviceAddress', input.serviceAddress]);
		}
		if (input.purchaseMode) {
			contractEvent.tags.push(['purchaseMode', input.purchaseMode]);
		}
		if (input.proposalId) {
			contractEvent.tags.push(['proposalId', input.proposalId]);
		}
		if (input.quoteRequestId) {
			contractEvent.tags.push(['quoteRequestId', input.quoteRequestId]);
		}
		if (input.instantOrderId) {
			contractEvent.tags.push(['instantOrderId', input.instantOrderId]);
		}

		d.log('createServiceContract: NDK payment contract (kind 30006) prepared', {
			serviceDTag: serviceId,
			transactionHash
		});

		// Push notification removed — backend's Nostr indexer handles proposal_accepted
		// via the reminder engine when it processes the Kind 30006 contract event.
		// The contract event itself is published only after the funding tx confirms.
		const afterBroadcast = runParallelNamed([]);

		const afterConfirmed = async (receipt: TransactionReceipt) => {
			if (receipt.status === 0) {
				d.warn('createServiceContract: tx reverted on-chain', { transactionHash });
				throw new Error('Transaction reverted on-chain');
			}
			const paymentId = parsePaymentContractCreatedPaymentId(
				receipt,
				getSecurePaymentContractAddress()
			);
			d.log('createServiceContract: receipt confirmed', { transactionHash, paymentId });

			contractEvent.paymentId = String(paymentId);
			contractEvent.status = 'confirmed';
			await contractEvent.publish();
			d.log('createServiceContract: contract event published after confirmation', {
				transactionHash,
				paymentId
			});

			try {
				await notificationCenterService.enrich({
					action: 'contract_created',
					escrowId: String(paymentId),
					recipientNpub: taskeePubkey,
					estimatedStartTime: params.estimatedStartTime,
					amount: display.baseAmount?.toString(),
					taskTitle: input.serviceTitle
				});
			} catch (e) {
				d.warn('createServiceContract: enrichment failed (non-blocking)', e);
			}

			return { paymentId };
		};

		return {
			success: true,
			transactionHash,
			estimatedCostFormatted,
			tx,
			afterBroadcast,
			afterConfirmed
		};
	} catch (error) {
		const err = error instanceof Error ? error : new Error(String(error));
		d.error('createServiceContract failed', { serviceId }, err);
		return {
			success: false,
			error: err.message
		};
	}
}

/**
 * Input for publishing a service contract event (for recovery scenarios).
 */
export interface PublishServiceContractEventInput {
	paymentId: string;
	transactionHash: string;
	freelancerPubkey: string;
	clientRskAddress?: string;
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
	pricingSnapshot?: ServiceContractPricingSnapshot;
	agreementSnapshot?: ServiceContractAgreementSnapshot;
}

/**
 * Publishes a service contract event to Nostr relays.
 * Used for recovery scenarios when the blockchain transaction succeeded
 * but the Nostr event wasn't published.
 */
export async function publishServiceContractEvent(
	input: PublishServiceContractEventInput
): Promise<{ success: boolean; error?: string }> {
	const network = import.meta.env.VITE_RSK_NETWORK || 'testnet';
	const paymentContractAddress = getSecurePaymentContractAddress();

	try {
		const contractEvent = new NDKPaymentContract(ndk);
		const currentUser = await ndk.signer?.user();
		if (!currentUser) {
			return { success: false, error: 'NDK signer not set. Please sign in.' };
		}
		contractEvent.author = currentUser;
		contractEvent.dTag = input.serviceId;
		contractEvent.paymentId = input.paymentId;
		contractEvent.taskId = input.serviceId;
		contractEvent.taskeePubkey = input.freelancerPubkey;
		contractEvent.network = network;
		contractEvent.version = 'v2';
		contractEvent.status = 'confirmed';
		contractEvent.messageType = 'contract';
		contractEvent.taskTitle = input.serviceTitle;
		contractEvent.taskDescription = input.serviceDescription ?? '';
		contractEvent.amount = input.amount;
		contractEvent.currency = 'RBTC';
		contractEvent.estimatedStartTime = input.estimatedStartTime;
		contractEvent.estimatedCompletionTime = input.estimatedCompletionTime;
		contractEvent.transactionHash = input.transactionHash;
		contractEvent.contractAddress = paymentContractAddress;

		// Store the agreement snapshot (includes service location)
		if (input.agreementSnapshot) {
			contractEvent.agreementSnapshot = input.agreementSnapshot;
		}

		contractEvent.tags.push(['contextType', 'service']);
		contractEvent.tags.push(['serviceId', input.serviceId]);
		if (input.serviceAddress) {
			contractEvent.tags.push(['serviceAddress', input.serviceAddress]);
		}
		if (input.purchaseMode) {
			contractEvent.tags.push(['purchaseMode', input.purchaseMode]);
		}
		if (input.proposalId) {
			contractEvent.tags.push(['proposalId', input.proposalId]);
		}
		if (input.quoteRequestId) {
			contractEvent.tags.push(['quoteRequestId', input.quoteRequestId]);
		}
		if (input.instantOrderId) {
			contractEvent.tags.push(['instantOrderId', input.instantOrderId]);
		}
		if (input.clientRskAddress) {
			contractEvent.tags.push(['clientRskAddress', input.clientRskAddress]);
		}

		await contractEvent.publishReplaceable();
		d.log('publishServiceContractEvent: published', {
			serviceId: input.serviceId,
			paymentId: input.paymentId,
			transactionHash: input.transactionHash
		});

		return { success: true };
	} catch (error) {
		const err = error instanceof Error ? error : new Error(String(error));
		d.error('publishServiceContractEvent failed', { serviceId: input.serviceId }, err);
		return { success: false, error: err.message };
	}
}
