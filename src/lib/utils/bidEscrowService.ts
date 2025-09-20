import type { TaskBid } from '$lib/types/bid';
import type { Task } from '$lib/types/task';
import type { ContractTransactionResult } from '$lib/types/wallet';
import type { FeeTier } from '$lib/utils/wallet/escrowContract';
import { escrow } from '$lib/utils/wallet/escrow';
import { rskWallet, rskWalletStore } from '$lib/stores/rskWallet.store';
import { get } from 'svelte/store';
import { ethers } from 'ethers';

export interface BidEscrowDetails {
	freelancerAddress: string;
	baseAmount: string;
	totalAmount: string;
	clientFee: string;
	freelancerFee: string;
	estimatedStartTime: number;
	estimatedCompletionTime: number;
	clientFeeTier: FeeTier;
	freelancerFeeTier: FeeTier;
}

export interface BidAcceptanceResult {
	success: boolean;
	transactionResult?: ContractTransactionResult;
	error?: string;
}

/**
 * Calculate escrow details from bid data
 */
export function calculateBidEscrowDetails(bid: TaskBid, task: Task): BidEscrowDetails {	
	// Use bid amount directly as RBTC (assuming bid.amount is already in RBTC)
	// Ensure minimum amount to avoid parsing issues
	if (bid.amount <= 0) {
		throw new Error('Invalid bid amount: amount must be greater than 0');
	}
	
	// Format the amount properly for ethers (ensure no scientific notation)
	const baseAmount = bid.amount.toFixed(8);
	
	// TODO: Use default fee tiers (can be made configurable later)
	const clientFeeTier: FeeTier = 1; // 2.5%
	const freelancerFeeTier: FeeTier = 1; // 2.5%
	
	// Calculate fees using RBTC amounts
	const baseAmountWei = ethers.parseEther(baseAmount);
	const clientFeeAmount = (baseAmountWei * BigInt(250)) / BigInt(10000); // 2.5%
	const freelancerFeeAmount = (baseAmountWei * BigInt(250)) / BigInt(10000); // 2.5%
	const totalAmountWei = baseAmountWei + clientFeeAmount;
	
	// Determine timing - prioritize task dates since bid dates aren't available in TaskBid type
	let startTime: number;
	let completionTime: number;
	
	if (task?.dateRange) {
		// Use task date range
		startTime = Math.floor(new Date(task.dateRange.start).getTime() / 1000);
		completionTime = Math.floor(new Date(task.dateRange.end).getTime() / 1000);
	} else if (task?.deadline) {
		// Use task deadline, set start time to now + 1 hour
		startTime = Math.floor((Date.now() + 60 * 60 * 1000) / 1000);
		completionTime = Math.floor(new Date(task.deadline).getTime() / 1000);
	} else {
		// Default to reasonable timeframes
		const now = Date.now();
		startTime = Math.floor((now + 60 * 60 * 1000) / 1000); // 1 hour from now
		completionTime = Math.floor((now + 7 * 24 * 60 * 60 * 1000) / 1000); // 1 week from now
	}
	
	return {
		freelancerAddress: bid?.bidderWalletAddress || '',
		baseAmount,
		totalAmount: ethers.formatEther(totalAmountWei),
		clientFee: ethers.formatEther(clientFeeAmount),
		freelancerFee: ethers.formatEther(freelancerFeeAmount),
		estimatedStartTime: startTime,
		estimatedCompletionTime: completionTime,
		clientFeeTier,
		freelancerFeeTier
	};
}

/**
 * Validate escrow details before creation
 */
export function validateEscrowDetails(details: BidEscrowDetails): string[] {
	const errors: string[] = [];
	
	// Validate freelancer address
	if (!details.freelancerAddress) {
		errors.push('Freelancer address is required');
	} else if (!ethers.isAddress(details.freelancerAddress)) {
		errors.push('Invalid freelancer address format');
	}
	
	// Validate amount
	const amount = parseFloat(details.baseAmount);
	if (isNaN(amount) || amount <= 0) {
		errors.push('Invalid escrow amount');
	}
	
	// Validate timing
	const now = Math.floor(Date.now() / 1000);
	if (details.estimatedStartTime <= now) {
		errors.push('Start time must be in the future');
	}
	
	if (details.estimatedCompletionTime <= details.estimatedStartTime) {
		errors.push('Completion time must be after start time');
	}
	
	return errors;
}

/**
 * Accept bid and create escrow contract
 */
export async function acceptBidAndCreateEscrow(
	bid: TaskBid,
	task: Task
): Promise<BidAcceptanceResult> {
	try {
		// Calculate escrow details
		const escrowDetails = calculateBidEscrowDetails(bid, task);
		
		// Validate details
		const validationErrors = validateEscrowDetails(escrowDetails);
		if (validationErrors.length > 0) {
			return {
				success: false,
				error: `Validation failed: ${validationErrors.join(', ')}`
			};
		}
		
		// Check if RSK wallet is connected
		const walletState = get(rskWalletStore);
		if (!walletState.isConnected) {
			return {
				success: false,
				error: 'RSK wallet not connected. Please connect your wallet first.'
			};
		}
		
		// Connect to escrow contract if not already connected
		if (!walletState.contractConnected) {
			try {
				await escrow.connectToEscrowContract();
			} catch (error) {
				return {
					success: false,
					error: error instanceof Error ? error.message : 'Failed to connect to escrow contract'
				};
			}
		}
		
		// Create the escrow
		const transactionResult = await escrow.createEscrow(
			escrowDetails.freelancerAddress,
			escrowDetails.baseAmount,
			escrowDetails.estimatedStartTime,
			escrowDetails.estimatedCompletionTime,
			escrowDetails.clientFeeTier,
			escrowDetails.freelancerFeeTier
		);
		
		return {
			success: true,
			transactionResult
		};
		
	} catch (error) {
		console.error('Failed to accept bid and create escrow:', error);
		return {
			success: false,
			error: error instanceof Error ? error.message : 'Unknown error occurred'
		};
	}
}

/**
 * Get fee percentage display string
 */
export function getFeePercentageDisplay(tier: FeeTier): string {
	switch (tier) {
		case 1:
			return '2.5%';
		case 2:
			return '2.0%';
		case 3:
			return '1.5%';
		default:
			return '2.5%';
	}
}

/**
 * Format RBTC amount for display
 */
export function formatRBTCAmount(amount: string): string {
	const num = parseFloat(amount);
	if (isNaN(num)) return '0.000000';
	return num.toFixed(6);
}

/**
 * Format timestamp for display
 */
export function formatTimestamp(timestamp: number): string {
	return new Date(timestamp * 1000).toLocaleString();
}
