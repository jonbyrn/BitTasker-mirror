import { escrow } from './wallet/escrow';
import { EscrowStatus } from './enums/wallet.enum';
import type { EscrowData } from '$lib/types/wallet';
import type { RequestQueueItem } from '$lib/stores/request-queue.store';
import { ethers } from 'ethers';

export interface EscrowVerificationResult {
	isValid: boolean;
	errors: string[];
	warnings: string[];
}

/**
 * Verify escrow status before allowing confirmation
 * Must be Funded, not Cancelled/Disputed
 */
export async function verifyEscrowStatus(escrowId: string): Promise<EscrowVerificationResult> {
	const errors: string[] = [];
	const warnings: string[] = [];

	try {
		const escrowData = await escrow.getEscrow(escrowId);

		if (!escrowData) {
			return {
				isValid: false,
				errors: ['Escrow not found'],
				warnings: []
			};
		}

		// Check status
		if (escrowData.status === EscrowStatus.Cancelled) {
			errors.push('Escrow has been cancelled');
		}

		if (escrowData.status === EscrowStatus.InDispute) {
			errors.push('Escrow is currently in dispute');
		}

		if (escrowData.status !== EscrowStatus.Funded && escrowData.status !== EscrowStatus.Completed) {
			warnings.push(`Escrow status is ${EscrowStatus[escrowData.status]}, expected Funded`);
		}

		return {
			isValid: errors.length === 0,
			errors,
			warnings
		};
	} catch (error) {
		return {
			isValid: false,
			errors: [`Failed to verify escrow status: ${error instanceof Error ? error.message : 'Unknown error'}`],
			warnings: []
		};
	}
}

/**
 * Verify escrow parties match request (tasker and taskee)
 */
export async function verifyEscrowParties(
	escrowId: string,
	taskerPubkey: string,
	taskeePubkey: string,
	taskerWalletAddress?: string,
	taskeeWalletAddress?: string
): Promise<EscrowVerificationResult> {
	const errors: string[] = [];
	const warnings: string[] = [];

	try {
		const escrowData = await escrow.getEscrow(escrowId);

		if (!escrowData) {
			return {
				isValid: false,
				errors: ['Escrow not found'],
				warnings: []
			};
		}

		// If wallet addresses are provided, verify them
		if (taskerWalletAddress && escrowData.client.toLowerCase() !== taskerWalletAddress.toLowerCase()) {
			errors.push('Escrow client address does not match tasker wallet address');
		}

		if (taskeeWalletAddress && escrowData.freelancer.toLowerCase() !== taskeeWalletAddress.toLowerCase()) {
			errors.push('Escrow freelancer address does not match taskee wallet address');
		}

		// Note: We can't directly verify pubkeys from escrow contract
		// This verification relies on the Nostr contract having correct pubkeys
		// and the escrow having correct wallet addresses

		return {
			isValid: errors.length === 0,
			errors,
			warnings
		};
	} catch (error) {
		return {
			isValid: false,
			errors: [`Failed to verify escrow parties: ${error instanceof Error ? error.message : 'Unknown error'}`],
			warnings: []
		};
	}
}

/**
 * Verify escrow amount matches bid amount (with tolerance for fees)
 */
export async function verifyEscrowAmount(
	escrowId: string,
	expectedBaseAmount: string, // In rBTC (as string)
	tolerancePercent: number = 0.01 // 1% tolerance for rounding
): Promise<EscrowVerificationResult> {
	const errors: string[] = [];
	const warnings: string[] = [];

	try {
		const escrowData = await escrow.getEscrow(escrowId);

		if (!escrowData) {
			return {
				isValid: false,
				errors: ['Escrow not found'],
				warnings: []
			};
		}

		const expectedAmountWei = ethers.parseEther(expectedBaseAmount);
		const actualAmountWei = ethers.parseEther(escrowData.baseAmount);

		const difference = expectedAmountWei > actualAmountWei
			? expectedAmountWei - actualAmountWei
			: actualAmountWei - expectedAmountWei;

		const tolerance = (expectedAmountWei * BigInt(Math.floor(tolerancePercent * 10000))) / 10000n;

		if (difference > tolerance) {
			errors.push(
				`Escrow amount mismatch: expected ${expectedBaseAmount} rBTC, got ${escrowData.baseAmount} rBTC`
			);
		} else if (difference > 0n) {
			warnings.push(`Escrow amount differs slightly: expected ${expectedBaseAmount} rBTC, got ${escrowData.baseAmount} rBTC`);
		}

		return {
			isValid: errors.length === 0,
			errors,
			warnings
		};
	} catch (error) {
		return {
			isValid: false,
			errors: [`Failed to verify escrow amount: ${error instanceof Error ? error.message : 'Unknown error'}`],
			warnings: []
		};
	}
}

/**
 * Verify escrow time matches requested slot
 */
export async function verifyEscrowTime(
	escrowId: string,
	requestedStartTime: number, // Unix timestamp in milliseconds
	requestedEndTime: number, // Unix timestamp in milliseconds
	toleranceMinutes: number = 5 // 5 minute tolerance
): Promise<EscrowVerificationResult> {
	const errors: string[] = [];
	const warnings: string[] = [];

	try {
		const escrowData = await escrow.getEscrow(escrowId);

		if (!escrowData) {
			return {
				isValid: false,
				errors: ['Escrow not found'],
				warnings: []
			};
		}

		// Convert escrow times to milliseconds (they're stored as seconds)
		const escrowStartTime = escrowData.estimatedStartTime * 1000;
		const escrowEndTime = escrowData.estimatedCompletionTime * 1000;

		const toleranceMs = toleranceMinutes * 60 * 1000;

		// Check start time
		const startDifference = Math.abs(escrowStartTime - requestedStartTime);
		if (startDifference > toleranceMs) {
			errors.push(
				`Escrow start time mismatch: expected ${new Date(requestedStartTime).toISOString()}, got ${new Date(escrowStartTime).toISOString()}`
			);
		} else if (startDifference > 0) {
			warnings.push(`Escrow start time differs slightly: expected ${new Date(requestedStartTime).toISOString()}, got ${new Date(escrowStartTime).toISOString()}`);
		}

		// Check end time
		const endDifference = Math.abs(escrowEndTime - requestedEndTime);
		if (endDifference > toleranceMs) {
			errors.push(
				`Escrow end time mismatch: expected ${new Date(requestedEndTime).toISOString()}, got ${new Date(escrowEndTime).toISOString()}`
			);
		} else if (endDifference > 0) {
			warnings.push(`Escrow end time differs slightly: expected ${new Date(requestedEndTime).toISOString()}, got ${new Date(escrowEndTime).toISOString()}`);
		}

		return {
			isValid: errors.length === 0,
			errors,
			warnings
		};
	} catch (error) {
		return {
			isValid: false,
			errors: [`Failed to verify escrow time: ${error instanceof Error ? error.message : 'Unknown error'}`],
			warnings: []
		};
	}
}

/**
 * Comprehensive escrow verification for scheduling confirmation
 */
export async function verifyEscrowForScheduling(
	escrowId: string,
	request: RequestQueueItem,
	expectedBaseAmount: string,
	taskerWalletAddress?: string,
	taskeeWalletAddress?: string
): Promise<EscrowVerificationResult> {
	const allErrors: string[] = [];
	const allWarnings: string[] = [];

	// Verify status
	const statusResult = await verifyEscrowStatus(escrowId);
	allErrors.push(...statusResult.errors);
	allWarnings.push(...statusResult.warnings);

	// Verify parties
	const partiesResult = await verifyEscrowParties(
		escrowId,
		request.taskerPubkey,
		request.taskeePubkey,
		taskerWalletAddress,
		taskeeWalletAddress
	);
	allErrors.push(...partiesResult.errors);
	allWarnings.push(...partiesResult.warnings);

	// Verify amount
	const amountResult = await verifyEscrowAmount(escrowId, expectedBaseAmount);
	allErrors.push(...amountResult.errors);
	allWarnings.push(...amountResult.warnings);

	// Verify time (if request has accepted time)
	if (request.acceptedTime) {
		const timeResult = await verifyEscrowTime(
			escrowId,
			request.acceptedTime.startTime,
			request.acceptedTime.endTime
		);
		allErrors.push(...timeResult.errors);
		allWarnings.push(...timeResult.warnings);
	}

	return {
		isValid: allErrors.length === 0,
		errors: allErrors,
		warnings: allWarnings
	};
}

/**
 * Poll escrow status until it reaches a target status or timeout
 */
export async function pollEscrowStatus(
	escrowId: string,
	targetStatus: EscrowStatus,
	timeoutMs: number = 60000, // 1 minute default
	pollIntervalMs: number = 2000 // 2 seconds
): Promise<{ success: boolean; finalStatus?: EscrowStatus; error?: string }> {
	const startTime = Date.now();

	while (Date.now() - startTime < timeoutMs) {
		try {
			const escrowData = await escrow.getEscrow(escrowId);
			if (!escrowData) {
				return { success: false, error: 'Escrow not found' };
			}

			if (escrowData.status === targetStatus) {
				return { success: true, finalStatus: escrowData.status };
			}

			// If escrow is cancelled or disputed, fail immediately
			if (escrowData.status === EscrowStatus.Cancelled || escrowData.status === EscrowStatus.InDispute) {
				return {
					success: false,
					finalStatus: escrowData.status,
					error: `Escrow status is ${EscrowStatus[escrowData.status]}, cannot proceed`
				};
			}

			// Wait before next poll
			await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
		} catch (error) {
			return {
				success: false,
				error: `Failed to poll escrow status: ${error instanceof Error ? error.message : 'Unknown error'}`
			};
		}
	}

	return {
		success: false,
		error: `Timeout waiting for escrow status ${EscrowStatus[targetStatus]}`
	};
}

