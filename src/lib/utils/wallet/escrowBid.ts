import type { TaskBid } from '$lib/types/bid';
import type { Task } from '$lib/types/task';
import type { ContractTransactionResult } from '$lib/types/wallet';
import type { FeeTier } from '$lib/utils/wallet/escrowContract';
import { FEE_TIERS } from '$lib/utils/wallet/escrowContract';
import { escrow } from '$lib/utils/wallet/escrow';
import { rskWalletStore } from '$lib/stores/rskWallet.store';
import { get } from 'svelte/store';
import { ethers } from 'ethers';
import { registerPendingContractByTxHash } from '$lib/utils/wallet/escrowEvents';

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
 * @param bid TaskBid with amount in USD
 * @param task Task details
 * @param btcPrice Current BTC price in USD (needed to convert USD to rBTC)
 */
export function calculateBidEscrowDetails(bid: TaskBid, task: Task, btcPrice: number): BidEscrowDetails {
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

	// Determine timing - prioritize task dates since bid dates aren't available in TaskBid type
	let startTime: number | undefined;
	let completionTime: number | undefined;

	if (task?.dateRange) {
		// Use task date range
		startTime = Math.floor(new Date(task.dateRange.start).getTime() / 1000);
		completionTime = Math.floor(new Date(task.dateRange.end).getTime() / 1000);
	} else if (task?.deadline) {
		// Use task deadline, set start time to now + 1 hour
		startTime = Math.floor((Date.now() + 60 * 60 * 1000) / 1000);
		completionTime = Math.floor(new Date(task.deadline).getTime() / 1000);
	}

	if (!startTime || !completionTime) {
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
	const walletState = get(rskWalletStore);
	
	if (!walletState.isConnected || !walletState.balance) {
		errors.push('RSK wallet not connected. Please connect your wallet to check balance.');
		return errors;
	}

	try {
		// Parse current balance (in wei) and required amount
		const currentBalanceWei = BigInt(walletState.balance);
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
			
			errors.push(`Insufficient RBTC balance. You have ${parseFloat(currentBalanceRBTC).toFixed(6)} RBTC but need ${parseFloat(requiredRBTC).toFixed(6)} RBTC (including gas fees). Shortfall: ${parseFloat(shortfallRBTC).toFixed(6)} RBTC.`);
		}
	} catch (error) {
		console.error('Error validating balance:', error);
		errors.push('Unable to validate balance. Please check your wallet connection.');
	}

	return errors;
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
	task: Task,
	btcPrice: number
): Promise<BidAcceptanceResult> {
	try {
		// Calculate escrow details
		const escrowDetails = calculateBidEscrowDetails(bid, task, btcPrice);

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
					error: extractUserFriendlyError(error)
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

		console.log({ transactionResult })

		// Register pending contract creation with our event management system		
		registerPendingContractByTxHash({
			taskId: task.id,
			taskTitle: task.title,
			taskDescription: task.description,
			freelancerPubkey: bid.userProfile?.user?.id || '',
			amount: escrowDetails.baseAmount,
			estimatedStartTime: escrowDetails.estimatedStartTime,
			estimatedCompletionTime: escrowDetails.estimatedCompletionTime,
			transactionHash: transactionResult.hash
		});

		return {
			success: true,
			transactionResult
		};

	} catch (error) {
		console.error('Failed to accept bid and create escrow:', error);
		return {
			success: false,
			error: extractUserFriendlyError(error)
		};
	}
}

/**
 * Extract user-friendly error message from blockchain/wallet errors
 */
function extractUserFriendlyError(error: unknown): string {
	if (!(error instanceof Error)) {
		return 'An unknown error occurred';
	}

	const errorMessage = error.message.toLowerCase();

	// Insufficient funds errors
	if (errorMessage.includes('insufficient funds')) {
		if (errorMessage.includes('intrinsic transaction cost') || errorMessage.includes('gas')) {
			return 'Insufficient RBTC balance to pay for transaction fees. Please add more RBTC to your wallet.';
		}
		return 'Insufficient funds in your wallet. Please add more RBTC.';
	}

	// Gas related errors
	if (errorMessage.includes('gas') || errorMessage.includes('out of gas')) {
		return 'Transaction failed due to insufficient gas. Please try again with higher gas settings.';
	}

	// Network errors
	if (errorMessage.includes('network') || errorMessage.includes('connection')) {
		return 'Network connection error. Please check your internet connection and try again.';
	}

	// User rejection
	if (errorMessage.includes('user rejected') || errorMessage.includes('user denied')) {
		return 'Transaction was cancelled by user.';
	}

	// Contract errors
	if (errorMessage.includes('revert') || errorMessage.includes('execution reverted')) {
		return 'Smart contract rejected the transaction. Please verify the transaction details.';
	}

	// Wallet connection errors
	if (errorMessage.includes('wallet') || errorMessage.includes('provider')) {
		return 'Wallet connection error. Please reconnect your wallet and try again.';
	}

	// Nonce errors
	if (errorMessage.includes('nonce')) {
		return 'Transaction nonce error. Please try again in a moment.';
	}

	// For any other error, return a cleaned version or generic message
	if (error.message.length > 100) {
		return 'Transaction failed. Please check your wallet balance and network connection.';
	}

	return error.message;
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

/**
 * Format timestamp for display
 */
export function formatTimestamp(timestamp: number): string {
	return new Date(timestamp * 1000).toLocaleString();
}
