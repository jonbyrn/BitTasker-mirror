import type { Task } from '$lib/types/task';
import type { NostrBidContent, NostrEventWithFollowup } from '$lib/types/bid';
import type { BidAcceptanceResult, BidEscrowDetails } from '$lib/types/wallet';
import { type FeeTier, FEE_TIERS } from '@bittasker/wallet-core';
import { walletStore } from '$lib/stores/wallet.store';
import { get } from 'svelte/store';
import { ethers } from 'ethers';
import { cleanupPendingContractByTxHash, registerPendingContractByTxHash } from './escrowEvents';
import { escrow } from './escrow';
import { extractContractError } from '$lib/utils/wallet/contractErrorHandler';
import { normalizeRskAddress } from '@bittasker/wallet-core';
import type { NostrEvent } from 'nostr-tools';
import { parseDateWithLocalTime } from '$lib/utils/helpers/dateFormatter';
import { createDebug } from '$lib/utils/debug';
import { updateTask } from '$lib/nostr/task';
import { TaskStatusEnum } from '$lib/utils/enums/task.enum';

const d = createDebug('escrow:v2:bid');

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
	} else if (task?.dateRange) {
		startTime = Math.floor(new Date(task.dateRange.start).getTime() / 1000);
		completionTime = Math.floor(new Date(task.dateRange.end).getTime() / 1000);
	} else if (task?.deadline) {
		startTime = Math.floor((Date.now() + 60 * 60 * 1000) / 1000);
		completionTime = Math.floor(new Date(task.deadline).getTime() / 1000);
	}

	if (!startTime || !completionTime || completionTime <= startTime) {
		throw new Error('Invalid start or completion time');
	}

	return {
		freelancerAddress: bid?.bidderWalletAddress || '',
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

export function validateSufficientBalance(details: BidEscrowDetails): string[] {
	const errors: string[] = [];
	const walletState = get(walletStore);

	if (!walletState.rsk.connected || !walletState.rsk.balance) {
		errors.push('RSK wallet not connected. Please connect your wallet to check balance.');
		return errors;
	}

	try {
		const currentBalanceWei = BigInt(walletState.rsk.balance);
		const requiredAmountWei = ethers.parseEther(details.totalAmount);
		const estimatedGasLimit = 200000n;
		const estimatedGasPrice = 65164000n;
		const estimatedGasCost = estimatedGasLimit * estimatedGasPrice;
		const totalRequired = requiredAmountWei + estimatedGasCost;

		if (currentBalanceWei < totalRequired) {
			const currentBalanceRBTC = ethers.formatEther(currentBalanceWei);
			const requiredRBTC = ethers.formatEther(totalRequired);
			const shortfallRBTC = ethers.formatEther(totalRequired - currentBalanceWei);
			errors.push(
				`Insufficient RBTC balance. You have ${parseFloat(currentBalanceRBTC).toFixed(6)} RBTC but need ${parseFloat(requiredRBTC).toFixed(6)} RBTC (including gas fees). Shortfall: ${parseFloat(shortfallRBTC).toFixed(6)} RBTC.`
			);
		}
	} catch (error) {
		console.error('Error validating balance:', error);
		errors.push('Unable to validate balance. Please check your wallet connection.');
	}

	return errors;
}

export interface ValidationWarning {
	key: string;
	params?: Record<string, string | number>;
}

export interface ValidationResult {
	errors: string[];
	warnings: (string | ValidationWarning)[];
}

export function validateEscrowDetails(details: BidEscrowDetails): ValidationResult {
	const errors: string[] = [];
	const warnings: (string | ValidationWarning)[] = [];

	if (!details.freelancerAddress) {
		errors.push('Freelancer address is required');
	} else {
		try {
			normalizeRskAddress(details.freelancerAddress);
		} catch {
			errors.push('Invalid freelancer address format');
		}
	}

	const amount = parseFloat(details.baseAmount);
	if (isNaN(amount) || amount <= 0) {
		errors.push('Invalid escrow amount');
	}

	const now = Math.floor(Date.now() / 1000);
	const timeDifferenceSeconds = now - details.estimatedStartTime;
	const timeDifferenceMinutes = Math.floor(timeDifferenceSeconds / 60);
	const timeDifferenceHours = Math.floor(timeDifferenceMinutes / 60);
	const timeDifferenceDays = Math.floor(timeDifferenceHours / 24);

	if (details.estimatedStartTime <= now) {
		let timeText: string;
		if (timeDifferenceDays > 0) {
			timeText = `${timeDifferenceDays} day${timeDifferenceDays !== 1 ? 's' : ''} ago`;
		} else if (timeDifferenceHours > 0) {
			timeText = `${timeDifferenceHours} hour${timeDifferenceHours !== 1 ? 's' : ''} ago`;
		} else if (timeDifferenceMinutes > 0) {
			timeText = `${timeDifferenceMinutes} minute${timeDifferenceMinutes !== 1 ? 's' : ''} ago`;
		} else {
			timeText = 'just now';
		}
		warnings.push({
			key: 'dashboard.bids.bid_acceptance.warning.past_start_time',
			params: { timeText }
		});
	}

	if (details.estimatedCompletionTime <= details.estimatedStartTime) {
		errors.push('Completion time must be after start time');
	}

	return { errors, warnings };
}

export function getFeePercentageDisplay(tier: FeeTier): string {
	return FEE_TIERS[tier]?.label || FEE_TIERS[1].label;
}

export function formatRBTCAmount(amount: string): string {
	const num = parseFloat(amount);
	if (isNaN(num)) return '0.000000';
	return num.toFixed(6);
}

export async function acceptBidAndCreateEscrow(
	bid: NostrEventWithFollowup,
	task: NostrEvent,
	btcPrice: number,
	network: 'RSK' | 'BSC' = 'RSK'
): Promise<BidAcceptanceResult> {
	d.log('acceptBidAndCreateEscrow start', {
		bidEventId: bid.id,
		taskId: task.id,
		network
	});
	let transactionHash: string | null = null;

	try {
		const bidContent = bid.content as unknown as NostrBidContent;
		const taskContent = JSON.parse(task.content) as Task;

		const escrowDetails = calculateBidEscrowDetails(bidContent, taskContent, btcPrice);
		d.log('acceptBidAndCreateEscrow escrowDetails calculated', {
			baseAmount: escrowDetails.baseAmount,
			totalAmount: escrowDetails.totalAmount,
			escrowId: '(will be set after createEscrow)'
		});

		const validationResult = validateEscrowDetails(escrowDetails);
		if (validationResult.errors.length > 0) {
			d.warn('acceptBidAndCreateEscrow validation failed', { errors: validationResult.errors });
			return {
				success: false,
				error: `Validation failed: ${validationResult.errors.join(', ')}`
			};
		}

		const walletState = get(walletStore);

		if (network === 'RSK' && !walletState.rsk.connected) {
			return {
				success: false,
				error: 'RSK wallet not connected. Please connect your wallet first.'
			};
		}

		if (network === 'BSC' && !walletState.bsc.connected) {
			return {
				success: false,
				error: 'BSC wallet not connected. Please connect your wallet first.'
			};
		}

		if (!walletState.rsk.contractConnected) {
			try {
				await escrow.ensureEscrowReady();
			} catch (error) {
				return {
					success: false,
					error: extractContractError(error).userMessage
				};
			}
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

		d.log('acceptBidAndCreateEscrow calling escrow.createEscrow (v2, direct payable)');

		const transactionResult = await escrow.createEscrow(
			escrowDetails.freelancerAddress,
			escrowDetails.baseAmount,
			adjustedStartTime,
			adjustedCompletionTime,
			escrowDetails.clientFeeTier,
			escrowDetails.freelancerFeeTier
		);

		if (!transactionResult || !transactionResult.hash) {
			d.warn('acceptBidAndCreateEscrow createEscrow returned no hash');
			return {
				success: false,
				error: 'Transaction failed: Missing transaction hash. Please try again.'
			};
		}

		transactionHash = transactionResult.hash;
		d.log('acceptBidAndCreateEscrow createEscrow tx broadcast', {
			hash: transactionHash.slice(0, 18) + '...'
		});

		registerPendingContractByTxHash({
			bidEventId: bid.id,
			taskId: task.id,
			taskTitle: taskContent.title,
			taskDescription: taskContent.description,
			freelancerPubkey: bidContent.bidderId || '',
			amount: escrowDetails.baseAmount,
			estimatedStartTime: adjustedStartTime,
			estimatedCompletionTime: adjustedCompletionTime,
			transactionHash,
			cancellationFee: '0',
			upfrontDeposit: '0'
		});

		try {
			await updateTask(task.id, { status: TaskStatusEnum.IN_PROGRESS });
			d.log('acceptBidAndCreateEscrow task updated at submit-time', {
				taskId: task.id,
				transactionHash: transactionHash.slice(0, 18) + '...'
			});
		} catch (taskUpdateError) {
			d.error('acceptBidAndCreateEscrow failed to update task at submit-time', {
				taskId: task.id,
				error: taskUpdateError
			});
		}

		d.log('acceptBidAndCreateEscrow success', {
			transactionHash: transactionHash.slice(0, 18) + '...',
			note: 'Nostr CONTRACT (v2) will be published when EscrowCreated is confirmed'
		});

		return { success: true, transactionResult };
	} catch (error) {
		d.error('acceptBidAndCreateEscrow failed', { error });

		if (transactionHash) {
			try {
				cleanupPendingContractByTxHash(transactionHash);
			} catch (cleanupError) {
				console.warn('[V2] Failed to cleanup pending contract:', cleanupError);
			}
		}

		return {
			success: false,
			error: extractContractError(error).userMessage
		};
	}
}
