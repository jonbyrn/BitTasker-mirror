import type { Task } from '$lib/types/task';
import type { SimplifiedTaskBid } from '$lib/types/bid';
import type { ContractTransactionResult } from '$lib/types/wallet';
import type { FeeTier } from '$lib/utils/wallet/networkConfig';
import { FEE_TIERS } from '$lib/utils/wallet/networkConfig';
import { walletStore } from '$lib/stores/wallet.store';
import { get } from 'svelte/store';
import { ethers } from 'ethers';
import { registerPendingContractByTxHash } from '$lib/utils/wallet/escrowEvents';
import { escrow } from './escrow';
import { extractContractError } from '$lib/utils/wallet/contractErrorHandler';

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
export function calculateBidEscrowDetails(bid: SimplifiedTaskBid, task: Task, btcPrice: number): BidEscrowDetails {
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
	if (bid.startDateTime && bid.endDateTime) {
		startTime = Math.floor(new Date(bid.startDateTime).getTime() / 1000);
		completionTime = Math.floor(new Date(bid.endDateTime).getTime() / 1000);
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

	// Ensure freelancer address is a valid string and normalize it
	let freelancerAddress = '';
	if (bid?.bidderWalletAddress) {
		// Convert to string explicitly and normalize using ethers.getAddress
		const addressStr = String(bid.bidderWalletAddress).trim();
		if (addressStr && ethers.isAddress(addressStr)) {
			freelancerAddress = ethers.getAddress(addressStr);
		} else {
			throw new Error('Invalid freelancer wallet address format');
		}
	} else {
		throw new Error('Freelancer wallet address is required');
	}

	return {
		freelancerAddress,
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
 * Now uses real-time gas prices from the provider
 */
export async function validateSufficientBalance(details: BidEscrowDetails): Promise<string[]> {
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
		
		// Fetch real-time gas price from provider
		let gasPrice: bigint;
		if (walletState.rsk.provider) {
			try {
				const feeData = await walletState.rsk.provider.getFeeData();
				gasPrice = feeData.gasPrice || BigInt(0);
				
				// Fallback to a reasonable default if gas price is 0 or unavailable
				if (gasPrice === 0n) {
					console.warn('Gas price returned 0, using fallback value');
					gasPrice = BigInt(65164000); // 0.065164 gwei fallback
				}
			} catch (gasError) {
				console.warn('Failed to fetch real-time gas price, using fallback:', gasError);
				// Fallback to typical RSK gas price if fetch fails
				gasPrice = BigInt(65164000); // 0.065164 gwei (typical RSK gas price)
			}
		} else {
			// Fallback if provider is not available
			console.warn('Provider not available, using fallback gas price');
			gasPrice = BigInt(65164000); // 0.065164 gwei (typical RSK gas price)
		}
		
		// Estimate gas cost using real-time gas price
		const estimatedGasLimit = BigInt(150000); // Conservative estimate for escrow creation
		const estimatedGasCost = estimatedGasLimit * gasPrice;
		
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
export interface ValidationResult {
	errors: string[];
	warnings: string[];
}

export function validateEscrowDetails(details: BidEscrowDetails): ValidationResult {
	const errors: string[] = [];
	const warnings: string[] = [];

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
	const timeDifferenceSeconds = now - details.estimatedStartTime;
	const timeDifferenceMinutes = Math.floor(timeDifferenceSeconds / 60);

	if (details.estimatedStartTime <= now) {
		// Check if it's more than 15 minutes past the estimated start time
		if (timeDifferenceMinutes > 15) {
			errors.push(`The estimated start time was ${timeDifferenceMinutes} minutes ago. The bid is no longer valid as the Taskee may no longer have this time slot available.`);
		} else if (timeDifferenceMinutes >= 0) {
			// Between 0 and 15 minutes past - show warning but allow funding
			const timeText = timeDifferenceMinutes === 0 
				? 'just now' 
				: `${timeDifferenceMinutes} minute${timeDifferenceMinutes !== 1 ? 's' : ''} ago`;
			warnings.push(`Warning: The estimated start time was ${timeText}. The Taskee may no longer have this time slot available.`);
		}
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
	bid: SimplifiedTaskBid,
	task: Task,
	btcPrice: number,
	network: 'RSK' | 'BSC' = 'RSK'
): Promise<BidAcceptanceResult> {
	try {
		// Calculate escrow details
		const escrowDetails = calculateBidEscrowDetails(bid, task, btcPrice);

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
				const { ensureEscrowReady } = await import('$lib/utils/wallet/escrow');
				await ensureEscrowReady();
			} catch (error) {
				return {
					success: false,
					error: extractContractError(error).userMessage
				};
			}
		}

		// Adjust estimated start time if it's in the past but within 15 minutes
		let adjustedStartTime = escrowDetails.estimatedStartTime;
		let adjustedCompletionTime = escrowDetails.estimatedCompletionTime;

		const now = Math.floor(Date.now() / 1000);
		const timeDifferenceSeconds = now - escrowDetails.estimatedStartTime;
		const timeDifferenceMinutes = Math.floor(timeDifferenceSeconds / 60);

		if (escrowDetails.estimatedStartTime <= now && timeDifferenceMinutes <= 15) {
			// Start time is in the past but within 15 minutes - adjust to 1 minute after current time
			adjustedStartTime = now + 60; // 1 minute buffer
			
			// Maintain the same duration by adjusting completion time
			const originalDuration = escrowDetails.estimatedCompletionTime - escrowDetails.estimatedStartTime;
			adjustedCompletionTime = now + 60 + originalDuration;
			
			console.log('⏰ Adjusted start time from past to 1 minute after current time:', {
				originalStart: escrowDetails.estimatedStartTime,
				adjustedStart: adjustedStartTime,
				originalCompletion: escrowDetails.estimatedCompletionTime,
				adjustedCompletion: adjustedCompletionTime,
				duration: originalDuration,
				minutesPast: timeDifferenceMinutes
			});
		}

		// Create the escrow using multi-network manager
		const transactionResult = await escrow.createEscrow(
			escrowDetails.freelancerAddress,
			escrowDetails.baseAmount,
			adjustedStartTime,
			adjustedCompletionTime,
			escrowDetails.clientFeeTier,
			escrowDetails.freelancerFeeTier
		);
		console.log({transactionResult})

		// Register pending contract creation with our event management system
		registerPendingContractByTxHash({
			taskId: task.id,
			taskTitle: task.title,
			bidId: bid.id,
			taskDescription: task.description,
			freelancerPubkey: bid.userProfile?.user?.id || '',
			amount: escrowDetails.baseAmount,
			estimatedStartTime: adjustedStartTime,
			estimatedCompletionTime: adjustedCompletionTime,
			transactionHash: transactionResult.hash
		});
		console.log('✅ [EscrowBid] Pending contract registered');

		return {
			success: true,
			transactionResult
		};

	} catch (error) {
		console.error('Failed to accept bid and create escrow:', error);
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