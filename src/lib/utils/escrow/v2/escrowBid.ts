/**
 * V2 Escrow Bid — create payment contract (payable) and publish CONTRACT (v2) after tx.
 * No pending Nostr; publish only when we have tx hash and paymentId.
 */

import type { Task } from '$lib/types/task';
import type { NostrBidContent, NostrEventWithFollowup } from '$lib/types/bid';
import type { BidAcceptanceResult, BidEscrowDetails } from '$lib/types/wallet';
import { type FeeTier, FEE_TIERS } from '@bittasker/wallet-core';
import { walletStore } from '$lib/stores/wallet.store';
import { get } from 'svelte/store';
import { ethers } from 'ethers';
import { escrow } from './escrow';
import { extractContractError } from '$lib/utils/wallet/contractErrorHandler';
import { parseDateWithLocalTime } from '$lib/utils/helpers/dateFormatter';
import { getTaskStableId } from '$lib/nostr/task';
import { createDebug } from '$lib/utils/debug';
import type { NostrEvent } from 'nostr-tools';
import { t } from 'svelte-i18n';
import { TaskStatusEnum } from '$lib/utils/enums/task.enum';
import { updateTask } from '$lib/nostr/task';
import { sendBidStatusUpdate } from '$lib/utils/nostr-bid';
import { BidStatusEnum } from '$lib/utils/enums/bid.enum';
import { publishContractEvent as publishContractEventV2 } from './nostrContract';
import { contractCreationStore } from './escrowEvents';

// Re-use v1 validation and display helpers (same BidEscrowDetails shape)
import {
	validateEscrowDetails as validateEscrowDetailsV1,
	validateSufficientBalance as validateSufficientBalanceV1,
	getFeePercentageDisplay as getFeePercentageDisplayV1,
	formatRBTCAmount as formatRBTCAmountV1
} from '../v1/escrowBid';

const d = createDebug('escrow:v2:bid');

/**
 * V2 creation params: cancellationFee and upfrontDeposit (uint72).
 * Default both to 0 for minimal flow.
 */
const DEFAULT_CANCELLATION_FEE_WEI = 0n;
const DEFAULT_UPFRONT_DEPOSIT_WEI = 0n;

/**
 * Calculate escrow details from bid data for V2.
 * Same shape as BidEscrowDetails so existing validation and balance checks work.
 * totalAmount is the value we send (base + client fee); contract requires msg.value >= 2×GAS_REIMBURSEMENT (enforced in acceptBidAndCreateEscrow).
 */
export function calculateBidEscrowDetails(
	bid: NostrBidContent,
	task: Task,
	btcPrice: number
): BidEscrowDetails {
	if (bid.amount <= 0) {
		throw new Error('Invalid bid amount: amount must be greater than 0');
	}
	if (!btcPrice || btcPrice <= 0) {
		throw new Error('Invalid BTC price: price must be greater than 0');
	}

	const baseAmountRBTC = bid.amount / btcPrice;
	const baseAmount = baseAmountRBTC.toFixed(8);
	const baseAmountWei = ethers.parseEther(baseAmount);
	const clientFeePercentage = FEE_TIERS[1].percentage;
	const freelancerFeePercentage = FEE_TIERS[1].percentage;
	const clientFeeAmount = (baseAmountWei * BigInt(clientFeePercentage)) / 10000n;
	const freelancerFeeAmount = (baseAmountWei * BigInt(freelancerFeePercentage)) / 10000n;
	const totalAmountWei = baseAmountWei + clientFeeAmount;

	let startTime: number | undefined;
	let completionTime: number | undefined;
	if (bid.startDateTime && bid.endDateTime) {
		const startDate = parseDateWithLocalTime(bid.startDateTime);
		const endDate = parseDateWithLocalTime(bid.endDateTime);
		if (startDate && endDate) {
			startTime = Math.floor(startDate.getTime() / 1000);
			completionTime = Math.floor(endDate.getTime() / 1000);
		}
	}
	if (!startTime || !completionTime) {
		startTime = Math.floor((Date.now() + 60 * 60 * 1000) / 1000);
		completionTime = startTime + 3600;
	}
	if (!startTime || !completionTime || completionTime <= startTime) {
		throw new Error('Invalid start or completion time');
	}

	return {
		freelancerAddress: bid?.bidderWalletAddress ?? '',
		baseAmount,
		totalAmount: ethers.formatEther(totalAmountWei),
		clientFee: ethers.formatEther(clientFeeAmount),
		freelancerFee: ethers.formatEther(freelancerFeeAmount),
		estimatedStartTime: startTime,
		estimatedCompletionTime: completionTime,
		clientFeeTier: 1,
		freelancerFeeTier: 1
	};
}

export const validateSufficientBalance = validateSufficientBalanceV1;
export const validateEscrowDetails = validateEscrowDetailsV1;
export function getFeePercentageDisplay(tier: FeeTier): string {
	return getFeePercentageDisplayV1(tier);
}
export function formatRBTCAmount(amount: string): string {
	return formatRBTCAmountV1(amount);
}

/**
 * Accept bid and create V2 payment contract (direct payable), then publish CONTRACT with v2 tags.
 * No pending Nostr: we only publish after we have tx hash and paymentId.
 */
export async function acceptBidAndCreateEscrow(
	bid: NostrEventWithFollowup,
	task: NostrEvent,
	btcPrice: number,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars -- signature matches interface
	_network: 'RSK' | 'BSC' = 'RSK'
): Promise<BidAcceptanceResult> {
	const taskId = getTaskStableId(task);
	const taskDTagFromEvent = task.tags?.find((t: string[]) => t[0] === 'd')?.[1];
	d.log('acceptBidAndCreateEscrow start', { taskId, bidId: bid.id });
	d.log('[V2 CONTRACT] taskId for CONTRACT event = task d-tag', {
		taskId,
		taskEventDTag: taskDTagFromEvent,
		match: taskId === taskDTagFromEvent
	});

	try {
		const bidContent = bid.content as unknown as NostrBidContent;
		const taskContent = JSON.parse(task.content) as Task;

		const escrowDetails = calculateBidEscrowDetails(bidContent, taskContent, btcPrice);
		d.log('acceptBidAndCreateEscrow escrowDetails', {
			taskId,
			totalAmount: escrowDetails.totalAmount
		});

		const validationResult = validateEscrowDetails(escrowDetails);
		if (validationResult.errors.length > 0) {
			return {
				success: false,
				error: `Validation failed: ${validationResult.errors.join(', ')}`
			};
		}

		const walletState = get(walletStore);
		if (!walletState.rsk.connected) {
			return {
				success: false,
				error: 'RSK wallet not connected. Please connect your wallet first.'
			};
		}

		const { wallet, provider } = await escrow.ensureEscrowReady(undefined, true);
		// Spec: msg.value must cover task value + 2× GAS_REIMBURSEMENT_PER_OP for two gasless txs (completeTask + acceptTask).
		// See V2-CONTRACT-FRONTEND-SPEC §1.2 / §5 and FRONTEND-INTEGRATION "Gas Reserve (User-Side)".
		const gasReimbursement = await escrow.getGasReimbursementPerOp();
		const gasReserveWei = 2n * gasReimbursement;
		const totalAmountWei = ethers.parseEther(escrowDetails.totalAmount);
		const valueWei = totalAmountWei + gasReserveWei;
		d.log('acceptBidAndCreateEscrow valueWei', {
			totalAmountWei: totalAmountWei.toString(),
			gasReserveWei: gasReserveWei.toString(),
			valueWei: valueWei.toString()
		});

		// Ensure wallet has enough for valueWei (payment + gas reserve); creation tx gas is separate
		const balance = await provider.getBalance(wallet.address);
		if (balance < valueWei) {
			const shortfall = valueWei - balance;
			return {
				success: false,
				error: `Insufficient balance. You need ${ethers.formatEther(valueWei)} RBTC (${ethers.formatEther(totalAmountWei)} for the task + ${ethers.formatEther(gasReserveWei)} for gasless reserve). Shortfall: ${ethers.formatEther(shortfall)} RBTC.`
			};
		}

		let adjustedStartTime = escrowDetails.estimatedStartTime;
		let adjustedCompletionTime = escrowDetails.estimatedCompletionTime;
		const now = Math.floor(Date.now() / 1000);
		if (escrowDetails.estimatedStartTime <= now) {
			const newStartTime = now + 3600;
			const timeShift = newStartTime - escrowDetails.estimatedStartTime;
			adjustedStartTime = newStartTime;
			adjustedCompletionTime = escrowDetails.estimatedCompletionTime + timeShift;
		}

		const transactionResult = await escrow.createPaymentContract(
			{
				taskee: escrowDetails.freelancerAddress,
				estimatedStartTime: adjustedStartTime,
				estimatedCompletionTime: adjustedCompletionTime,
				taskerFeeTier: escrowDetails.clientFeeTier,
				taskeeFeeTier: escrowDetails.freelancerFeeTier,
				cancellationFee: DEFAULT_CANCELLATION_FEE_WEI,
				upfrontDeposit: DEFAULT_UPFRONT_DEPOSIT_WEI,
				valueWei
			},
			undefined
		);

		if (!transactionResult?.hash) {
			return {
				success: false,
				error: 'Transaction failed: Missing transaction hash. Please try again.'
			};
		}

		const paymentId = transactionResult.escrowId ?? '';
		if (!paymentId) {
			return {
				success: false,
				error: 'Transaction succeeded but payment id could not be determined.'
			};
		}

		d.log('[V2 CONTRACT] Publishing CONTRACT event with taskId (task d-tag)', { taskId });
		await publishContractEventV2({
			escrowId: paymentId,
			taskId,
			taskTitle: taskContent.title,
			taskDescription: taskContent.description ?? '',
			freelancerPubkey: bidContent.bidderId ?? '',
			amount: escrowDetails.baseAmount,
			estimatedStartTime: adjustedStartTime,
			estimatedCompletionTime: adjustedCompletionTime,
			transactionHash: transactionResult.hash
		});

		// Update contract creation store so the success screen shows "Contract created" and the extra bullet (same as v1).
		contractCreationStore.set({
			escrowId: paymentId,
			contractEventId: `contract-${paymentId}`
		});

		// Task status → IN_PROGRESS (public) so task shows "In Progress" like v1. taskId = d-tag from getTaskStableId(task).
		try {
			await updateTask(taskId, { status: TaskStatusEnum.IN_PROGRESS });
		} catch (taskUpdateError) {
			d.error(
				'acceptBidAndCreateEscrow: Failed to update task status',
				{ taskId },
				taskUpdateError
			);
		}

		// Bid status → ACCEPTED (encrypted DM to taskee) so bid shows as accepted, same as v1.
		try {
			await sendBidStatusUpdate(
				bid.id,
				taskId,
				bidContent.bidderId ?? '',
				BidStatusEnum.ACCEPTED,
				get(t)('dashboard.bids.bid_acceptance.bid_accepted_message'),
				paymentId,
				transactionResult.hash
			);
		} catch (bidStatusError) {
			d.error(
				'acceptBidAndCreateEscrow: Failed to send bid status update',
				{ taskId },
				bidStatusError
			);
		}

		d.log('acceptBidAndCreateEscrow success', {
			taskId,
			paymentId,
			txHash: transactionResult.hash.slice(0, 10)
		});

		return {
			success: true,
			transactionResult
		};
	} catch (error) {
		d.error('acceptBidAndCreateEscrow failed', { taskId }, error);
		return {
			success: false,
			error: extractContractError(error).userMessage
		};
	}
}
