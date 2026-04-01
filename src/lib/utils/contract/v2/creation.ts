/**
 * v2 Payment Contract Creation
 *
 * Implements the dry-run and (future) real creation flow for v2 escrow.
 * Phase 1: dryRun only — validation, gas estimation, staticCall, no broadcast.
 *
 * See docs/payments-v2/escrow-creation-report.md for full specification.
 */

import type { NostrBidContent } from '$lib/types/bid';
import { FEE_TIERS } from '@bittasker/wallet-core';
import { ethers } from 'ethers';
import { parseDateWithLocalTime } from '$lib/utils/helpers/dateFormatter';
import { createDebug } from '$lib/utils/debug';
import {
	GAS_REIMBURSEMENT_PER_OP,
	type CreatePaymentContractParams,
	type GasEstimateResult,
	type ContractCreationResult,
	type ContractCreationDisplay
} from '$lib/utils/contract/v2/types';
import { assertValidCreatePaymentContractParams } from './createPaymentContractParams';
import { runParallelNamed } from '../parallelEffects';
import { NDKPaymentContract } from '$lib/nostr/events/contract';
import { ndk } from '$lib/nostr/ndk';
import abi from './abi.json';
import type { NDKBid } from '$lib/nostr/events/bid';
import type { NDKTask } from '$lib/nostr/events/task';
import { sendLocationsToTaskee } from '$lib/utils/location/sendLocation';
import { pushNotificationService } from '$lib/api/services/push-notification.service';
import { TaskStatusEnum, TaskTypeEnum } from '$lib/utils/enums/task.enum';
import { createPaymentContract, estimateWrite } from './blockchainWrites';
import { getSecurePaymentContractAddress } from './contractAddress';

const d = createDebug('contract:v2');

/** Default fee tier (tier 1 = 2.5%) — maps to v1 clientFeeTier/freelancerFeeTier */
const DEFAULT_FEE_TIER = 1;

export { ContractCreationParamsError } from './createPaymentContractParams';

function assertValidDerivationInputs(bidContent: NostrBidContent, btcPrice: number): void {
	if (!Number.isFinite(bidContent.amount) || bidContent.amount <= 0) {
		throw new Error('Invalid bid amount: amount must be a finite number greater than 0');
	}
	if (!Number.isFinite(btcPrice) || btcPrice <= 0) {
		throw new Error('Invalid BTC price: price must be a finite number greater than 0');
	}
	const taskee = bidContent.bidderWalletAddress || '';
	if (!taskee) {
		throw new Error('Bid must include bidder wallet address');
	}
}

/**
 * Single derivation pass: validates inputs, builds contract params, validates params, builds display.
 * Not exported — use {@link deriveContractCreationParams}.
 */
export function deriveContractCreationParams(
	bidContent: NostrBidContent,
	btcPrice: number
): { params: CreatePaymentContractParams; display: ContractCreationDisplay } {
	assertValidDerivationInputs(bidContent, btcPrice);

	const taskee = bidContent.bidderWalletAddress || '';

	const baseAmountRBTC = bidContent.amount / btcPrice;
	const baseAmount = baseAmountRBTC.toFixed(8);
	const baseAmountWei = ethers.parseEther(baseAmount);

	const taskerFeeTier = DEFAULT_FEE_TIER;
	const taskeeFeeTier = DEFAULT_FEE_TIER;
	const taskerFeePercentage = FEE_TIERS[taskerFeeTier]?.percentage ?? 250;
	const taskeeFeePercentage = FEE_TIERS[taskeeFeeTier]?.percentage ?? 250;

	const taskerFeeWei = (baseAmountWei * BigInt(taskerFeePercentage)) / 10000n;
	const taskeeFeeWei = (baseAmountWei * BigInt(taskeeFeePercentage)) / 10000n;

	const cancellationFee = BigInt(bidContent.cancellationFee ?? 0);
	const upfrontDeposit = BigInt(bidContent.upfrontDeposit ?? 0);

	const gasReimbursementWei = 2n * GAS_REIMBURSEMENT_PER_OP;
	const totalValueWei = baseAmountWei + taskerFeeWei + gasReimbursementWei;

	let startTime: number;
	let completionTime: number;

	if (bidContent.startDateTime && bidContent.endDateTime) {
		const startDate = parseDateWithLocalTime(bidContent.startDateTime);
		const endDate = parseDateWithLocalTime(bidContent.endDateTime);
		if (startDate && endDate) {
			startTime = Math.floor(startDate.getTime() / 1000);
			completionTime = Math.floor(endDate.getTime() / 1000);
		} else {
			startTime = Math.floor((Date.now() + 60 * 60 * 1000) / 1000);
			completionTime = startTime + 3600;
		}
	} else {
		startTime = Math.floor((Date.now() + 60 * 60 * 1000) / 1000);
		completionTime = startTime + 3600;
	}

	const now = Math.floor(Date.now() / 1000);
	let wasTimeAdjusted = false;

	if (startTime <= now) {
		const newStartTime = now + 3600;
		const timeShift = newStartTime - startTime;
		startTime = newStartTime;
		completionTime = completionTime + timeShift;
		wasTimeAdjusted = true;
	}

	if (completionTime <= startTime) {
		throw new Error('Completion time must be after start time');
	}

	if (
		startTime < 0 ||
		startTime > 0xffff_ffff ||
		completionTime < 0 ||
		completionTime > 0xffff_ffff
	) {
		throw new Error('Estimated times must be within uint32 range');
	}

	const params: CreatePaymentContractParams = {
		taskee,
		estimatedStartTime: startTime,
		estimatedCompletionTime: completionTime,
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
		startTime,
		completionTime,
		wasTimeAdjusted
	};

	return { params, display };
}

/**
 * Estimate gas for createPaymentContract. Call when form opens to show network fee before submit.
 * Requires wallet connected. Safe to call; returns error result instead of throwing.
 */
export async function estimateGasForCreatePaymentContract(
	params: CreatePaymentContractParams
): Promise<GasEstimateResult> {
	const taskeeEip55 = ethers.getAddress(params.taskee.toLowerCase());

	return estimateWrite({
		method: 'createPaymentContract',
		args: [
			taskeeEip55,
			params.estimatedStartTime,
			params.estimatedCompletionTime,
			params.taskerFeeTier,
			params.taskeeFeeTier,
			params.cancellationFee,
			params.upfrontDeposit
		],
		overrides: { value: params.totalValueWei }
	});
}

/**
 * Estimates network fee (RBTC) for `createPaymentContract` from bid content and BTC price.
 * Derives params via {@link deriveContractCreationParams}, then {@link estimateGasForCreatePaymentContract}.
 * @returns Formatted cost string, or `null` if gas estimation fails (wallet/network). Validation errors from derivation propagate.
 */
export async function estimateGasCostForCreatePaymentContract(
	bidContent: NostrBidContent,
	btcPrice: number
): Promise<string> {
	const { params } = deriveContractCreationParams(bidContent, btcPrice);
	const result = await estimateGasForCreatePaymentContract(params);
	if (!result.success) {
		return '';
	}
	return result.estimatedCostFormatted;
}

/**
 * Read `paymentId` from mined tx logs (authoritative — not from staticCall).
 */
export function parsePaymentContractCreatedPaymentId(
	receipt: ethers.TransactionReceipt,
	contractAddress: string
): number {
	const iface = new ethers.Interface(abi as ethers.InterfaceAbi);
	const expected = contractAddress.toLowerCase();
	for (const log of receipt.logs) {
		if (!log.address || log.address.toLowerCase() !== expected) continue;
		try {
			const parsed = iface.parseLog({
				topics: log.topics as string[],
				data: log.data
			});
			if (parsed?.name === 'PaymentContractCreated') {
				const raw = parsed.args.paymentContractId;
				return typeof raw === 'bigint' ? Number(raw) : Number(raw);
			}
		} catch {
			continue;
		}
	}
	throw new Error('PaymentContractCreated event not found in transaction receipt');
}

/**
 * Mark task as bid-accepted + IN_PROGRESS and publish replaceable (kind 31000).
 * Uses NDKTask setters so tags/body stay aligned with the loaded event.
 */
async function publishTaskAcceptedBid(task: NDKTask, bidEventId: string): Promise<void> {
	if (!task.ndk) {
		throw new Error('NDK is required to publish task update');
	}
	task.acceptedBid = bidEventId;
	task.status = TaskStatusEnum.IN_PROGRESS;
	await task.publishReplaceable();
}

/**
 * Escrow creation orchestrator: validate → broadcast → parallel post-hash effects.
 * Does not call `tx.wait()` — the UI should await confirmation, then call `afterConfirmed(receipt)`.
 */
export async function createContract(
	bid: NDKBid,
	task: NDKTask,
	btcPrice: number,
	additionalNotes: string = ''
): Promise<ContractCreationResult> {
	const bidContent = bid.bidContent;
	const taskContent = task.taskContent;
	const taskId = task.tagValue('d') ?? task.id ?? '';

	d.log('createContract start', { taskId, bidId: bid.id });

	try {
		d.log('createContract: deriveContractCreationParams');
		const { params, display } = deriveContractCreationParams(bidContent, btcPrice);
		d.log('createContract: params derived', {
			taskee: params.taskee.slice(0, 10) + '…',
			totalWei: params.totalValueWei.toString().slice(0, 16) + '…',
			estimatedStartTime: params.estimatedStartTime,
			estimatedCompletionTime: params.estimatedCompletionTime
		});

		const taskeePubkey = bid.author?.pubkey;
		if (!taskeePubkey) {
			return {
				success: false,
				error: 'Could not determine Taskee pubkey from bid'
			};
		}

		const taskerPubkey = (await ndk.signer?.user())?.pubkey;
		if (!taskerPubkey) {
			return {
				success: false,
				error: 'NDK signer not set. Please sign in.'
			};
		}

		d.log('createContract: createPaymentContract (init, gas, staticCall, broadcast)');
		const { tx, estimatedCostFormatted } = await createPaymentContract(params);
		const transactionHash = tx.hash;
		d.log('createContract: broadcast ok — pending confirmation', { transactionHash });

		const taskeeNpub = bid.author?.npub;
		const isRemote = taskContent.taskType === TaskTypeEnum.REMOTE;

		const network = import.meta.env.VITE_RSK_NETWORK || 'testnet';
		const paymentContractAddress = getSecurePaymentContractAddress();

		const contractEvent = new NDKPaymentContract(ndk);
		contractEvent.author = task.author;
		contractEvent.dTag = taskId; // Contract event shares the same dtag as task event for tracking
		contractEvent.taskId = taskId;
		contractEvent.taskeePubkey = taskeePubkey;
		contractEvent.network = network;
		contractEvent.version = 'v2';
		contractEvent.status = 'pending';
		contractEvent.messageType = 'contract';
		contractEvent.taskTitle = taskContent.title ?? '';
		contractEvent.taskDescription = taskContent.description ?? '';
		contractEvent.amount = display.baseAmount;
		contractEvent.currency = 'RBTC';
		contractEvent.estimatedStartTime = params.estimatedStartTime;
		contractEvent.estimatedCompletionTime = params.estimatedCompletionTime;
		contractEvent.transactionHash = transactionHash;
		contractEvent.contractAddress = paymentContractAddress;

		d.log('createContract: NDK payment contract (kind 30006) prepared', {
			taskDTag: taskId,
			transactionHash
		});

		const publishPromise = contractEvent.publish();

		const dmPromise = sendLocationsToTaskee(
			taskContent.pickupLocation ?? null,
			taskContent.dropOffLocation ?? null,
			taskeePubkey,
			{
				taskId,
				taskTitle: taskContent.title ?? '',
				taskDescription: taskContent.description ?? '',
				isRemote,
				additionalNotes: additionalNotes.trim() || undefined
			}
		);

		const taskUpdatePromise = publishTaskAcceptedBid(task, bid.id);

		const pushPromise = taskeeNpub
			? pushNotificationService.sendNotificationToNpubs({
					npubs: [taskeeNpub],
					title: 'Bid Accepted',
					body: `Your bid on "${taskContent.title ?? 'Task'}" has been accepted`,
					type: 'bid_accepted',
					clickAction: `${import.meta.env.VITE_CLIENT_URL}/dashboard?tab=contracts`,
					icon: 'https://bittasker.com/images/Logos/BitTasker-square-logo.svg'
				})
			: Promise.resolve();

		const afterBroadcast = runParallelNamed([
			{ name: 'nostrPublish', run: () => publishPromise },
			{ name: 'sendLocations', run: () => dmPromise },
			{ name: 'taskPublishReplaceable', run: () => taskUpdatePromise },
			{ name: 'push', run: () => pushPromise }
		]);

		const afterConfirmed = async (receipt: ethers.TransactionReceipt) => {
			const paymentId = parsePaymentContractCreatedPaymentId(
				receipt,
				getSecurePaymentContractAddress()
			);
			d.log('createContract: receipt confirmed', { transactionHash, paymentId });
			try {
				await publishPromise;
			} catch (e) {
				d.warn('createContract: initial Nostr publish failed before republish', e);
			}
			// Recreate NDKEvent to decrypt it before updating it and republishing
			const updatedContractEvent = await NDKPaymentContract.from(contractEvent);
			if (updatedContractEvent) {
				updatedContractEvent.paymentId = String(paymentId);
				updatedContractEvent.status = 'confirmed';
				await updatedContractEvent.publishReplaceable();
				d.log('createContract: contract event republished with paymentId', {
					transactionHash,
					paymentId
				});
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
		d.error('createContract failed', { taskId }, err);
		return {
			success: false,
			error: err.message
		};
	}
}
