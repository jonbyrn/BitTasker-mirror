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
import { getTaskStableId } from '$lib/nostr/task';
import { createDebug } from '$lib/utils/debug';

const d = createDebug('escrow:bid');

/**
 * Calculate escrow details from bid data
 * @param bid TaskBid with amount in USD
 * @param task Task details
 * @param btcPrice Current BTC price in USD (needed to convert USD to rBTC)
 */
export function calculateBidEscrowDetails(
	bid: NostrBidContent,
	task: Task,
	btcPrice: number
): BidEscrowDetails {
	// Convert bid amount from USD to rBTC
	// Ensure minimum amount to avoid parsing issues
	if (bid.amount <= 0) {
		throw new Error('Invalid bid amount: amount must be greater than 0');
	}

	if (!btcPrice || btcPrice <= 0) {
		throw new Error('Invalid BTC price: price must be greater than 0');
	}

	// Convert USD to rBTC (rBTC has same value as BTC)
	const baseAmountRBTC = bid.amount / btcPrice;

	// Format the amount properly for ethers (ensure no scientific notation)
	const baseAmount = baseAmountRBTC.toFixed(8);

	// Calculate fees using rBTC amounts and FEE_TIERS (using tier 1 as default)
	const baseAmountWei = ethers.parseEther(baseAmount);
	const clientFeePercentage = FEE_TIERS[1].percentage; // 250 for tier 1 (2.5%)
	const freelancerFeePercentage = FEE_TIERS[1].percentage; // 250 for tier 1 (2.5%)

	const clientFeeAmount = (baseAmountWei * BigInt(clientFeePercentage)) / BigInt(10000); // Divide by 10000 to convert basis points to percentage
	const freelancerFeeAmount = (baseAmountWei * BigInt(freelancerFeePercentage)) / BigInt(10000); // Divide by 10000 to convert basis points to percentage
	const totalAmountWei = baseAmountWei + clientFeeAmount;

	// Determine timing from bid data - check for startDateTime and endDateTime
	let startTime: number | undefined;
	let completionTime: number | undefined;

	// First check if bid has timing information
	// Use parseDateWithLocalTime to preserve the user's selected local time
	if (bid.startDateTime && bid.endDateTime) {
		const startDate = parseDateWithLocalTime(bid.startDateTime);
		const endDate = parseDateWithLocalTime(bid.endDateTime);
		if (startDate && endDate) {
			startTime = Math.floor(startDate.getTime() / 1000);
			completionTime = Math.floor(endDate.getTime() / 1000);
		}
	} else if (task?.dateRange) {
		// Fallback to task date range
		startTime = Math.floor(new Date(task.dateRange.start).getTime() / 1000);
		completionTime = Math.floor(new Date(task.dateRange.end).getTime() / 1000);
	} else if (task?.deadline) {
		// Fallback to task deadline, set start time to now + 1 hour
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
		clientFeeTier: 1, // Default to tier 1 (2.5%)
		freelancerFeeTier: 1 // Default to tier 1 (2.5%)
	};
}

/**
 * Check if user has sufficient balance for the escrow
 */
export function validateSufficientBalance(details: BidEscrowDetails): string[] {
	const errors: string[] = [];

	// Get current wallet state
	const walletState = get(walletStore);

	if (!walletState.rsk.connected || !walletState.rsk.balance) {
		errors.push('RSK wallet not connected. Please connect your wallet to check balance.');
		return errors;
	}

	try {
		// Parse current balance (in wei) and required amount
		const currentBalanceWei = BigInt(walletState.rsk.balance);
		const requiredAmountWei = ethers.parseEther(details.totalAmount);

		// Estimate gas cost (approximate)
		const estimatedGasLimit = BigInt(150000); // Conservative estimate for escrow creation
		const estimatedGasPrice = BigInt(65164000); // 0.065164 gwei (typical RSK gas price)
		const estimatedGasCost = estimatedGasLimit * estimatedGasPrice;

		// Total required = escrow amount + gas fees
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
		d.error('validateSufficientBalance', error);
		errors.push('Unable to validate balance. Please check your wallet connection.');
	}

	return errors;
}

/**
 * Validate escrow details before creation
 */
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

	// Validate freelancer address
	if (!details.freelancerAddress) {
		errors.push('Freelancer address is required');
	} else {
		try {
			// Normalize RSK address checks for valid Hex format and lowercases it
			normalizeRskAddress(details.freelancerAddress);
		} catch (error) {
			d.error('validateEscrowDetails: freelancer address', error);
			errors.push('Invalid freelancer address format');
		}
	}

	// Validate amount
	const amount = parseFloat(details.baseAmount);
	if (isNaN(amount) || amount <= 0) {
		errors.push('Invalid escrow amount');
	}

	// Validate timing
	const now = Math.floor(Date.now() / 1000);
	const timeDifferenceSeconds = now - details.estimatedStartTime;
	const timeDifferenceMinutes = Math.floor(timeDifferenceSeconds / 60);
	const timeDifferenceHours = Math.floor(timeDifferenceMinutes / 60);
	const timeDifferenceDays = Math.floor(timeDifferenceHours / 24);

	if (details.estimatedStartTime <= now) {
		// Show warning for any past start time - tasker should contact taskee to arrange new time
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

/**
 * Accept bid and create escrow contract
 */
export async function acceptBidAndCreateEscrow(
	bid: NostrEventWithFollowup,
	task: NostrEvent,
	btcPrice: number,
	network: 'RSK' | 'BSC' = 'RSK'
): Promise<BidAcceptanceResult> {
	// Store transaction hash outside try block for cleanup in catch block
	let transactionHash: string | null = null;

	const taskId = getTaskStableId(task);
	d.log('acceptBidAndCreateEscrow start', { taskId, bidId: bid.id });

	try {
		const bidContent = bid.content as unknown as NostrBidContent;
		const taskContent = JSON.parse(task.content) as Task;

		// Calculate escrow details
		const escrowDetails = calculateBidEscrowDetails(bidContent, taskContent, btcPrice);
		d.log('acceptBidAndCreateEscrow escrowDetails', {
			taskId,
			totalAmount: escrowDetails.totalAmount
		});

		// Validate details
		const validationResult = validateEscrowDetails(escrowDetails);
		if (validationResult.errors.length > 0) {
			return {
				success: false,
				error: `Validation failed: ${validationResult.errors.join(', ')}`
			};
		}

		// Check if wallet is connected for the selected network
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

		// Connect to escrow contract if not already connected
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

		// Adjust estimated start time if it's in the past
		let adjustedStartTime = escrowDetails.estimatedStartTime;
		let adjustedCompletionTime = escrowDetails.estimatedCompletionTime;

		const now = Math.floor(Date.now() / 1000);

		if (escrowDetails.estimatedStartTime <= now) {
			// Start time is in the past - adjust to current time + 1 hour
			const newStartTime = now + 3600; // 1 hour buffer

			// Calculate the time shift (how much later the new start time is compared to original)
			const timeShift = newStartTime - escrowDetails.estimatedStartTime;

			// Shift the completion time by the same amount
			adjustedStartTime = newStartTime;
			adjustedCompletionTime = escrowDetails.estimatedCompletionTime + timeShift;
		}

		// Create the escrow using multi-network manager
		d.log('acceptBidAndCreateEscrow createEscrow', { taskId });
		const transactionResult = await escrow.createEscrow(
			escrowDetails.freelancerAddress,
			escrowDetails.baseAmount,
			adjustedStartTime,
			adjustedCompletionTime,
			escrowDetails.clientFeeTier,
			escrowDetails.freelancerFeeTier
		);

		// Validate transaction result and hash before proceeding
		if (!transactionResult || !transactionResult.hash) {
			return {
				success: false,
				error: 'Transaction failed: Missing transaction hash. Please try again.'
			};
		}

		// Store transaction hash for potential cleanup in catch block
		transactionHash = transactionResult.hash;
		d.log('acceptBidAndCreateEscrow tx submitted', {
			taskId,
			txHash: transactionHash.slice(0, 10)
		});

		// Register pending contract creation with our event management system.
		// Use d-tag (stable id) so updateTask(contract.taskId) works on repeated updates (Nostr Addressable Event).
		registerPendingContractByTxHash({
			bidEventId: bid.id,
			taskId,
			taskTitle: taskContent.title,
			taskDescription: taskContent.description,
			freelancerPubkey: bidContent.bidderId || '',
			amount: escrowDetails.baseAmount,
			estimatedStartTime: adjustedStartTime,
			estimatedCompletionTime: adjustedCompletionTime,
			transactionHash: transactionHash
		});
		d.log('acceptBidAndCreateEscrow success', { taskId, txHash: transactionHash.slice(0, 10) });

		return {
			success: true,
			transactionResult
		};
	} catch (error) {
		d.error('acceptBidAndCreateEscrow failed', { taskId }, error);

		// Clean up any pending contracts that might have been registered
		// If transaction was submitted and registered, we need to clean up by transaction hash
		if (transactionHash) {
			try {
				cleanupPendingContractByTxHash(transactionHash);
				d.log('acceptBidAndCreateEscrow cleanup', { taskId, txHash: transactionHash.slice(0, 10) });
			} catch (cleanupError) {
				d.warn('acceptBidAndCreateEscrow cleanup failed', { taskId }, cleanupError);
			}
		}

		return {
			success: false,
			error: extractContractError(error).userMessage
		};
	}
}

/**
 * Get fee percentage display string
 */
export function getFeePercentageDisplay(tier: FeeTier): string {
	return FEE_TIERS[tier]?.label || FEE_TIERS[1].label;
}

/**
 * Format RBTC amount for display
 */
export function formatRBTCAmount(amount: string): string {
	const num = parseFloat(amount);
	if (isNaN(num)) return '0.000000';
	return num.toFixed(6);
}
