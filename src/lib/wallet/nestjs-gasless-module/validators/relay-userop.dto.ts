/**
 * Relay UserOp DTO
 *
 * Validates incoming UserOp payloads at the controller boundary.
 * Uses class-validator decorators for declarative validation.
 * Reference implementation for the NestJS backend.
 */

import {
	IsString,
	IsNumber,
	Min,
	Max,
	Matches,
	IsNotEmpty,
	ValidateNested,
	IsOptional
} from 'class-validator';
import { Type } from 'class-transformer';

// =============================================================================
// Fee Tier Enum
// =============================================================================

export enum FeeTierName {
	STANDARD = 'standard',
	FAST = 'fast',
	URGENT = 'urgent'
}

// =============================================================================
// Nested DTOs
// =============================================================================

/**
 * Token payment information included when paying gas fees in ERC-20 tokens.
 */
export class TokenPaymentDto {
	@IsString()
	@IsNotEmpty()
	@Matches(/^0x[0-9a-fA-F]{40}$/, {
		message: 'tokenAddress must be a valid 20-byte hex address'
	})
	tokenAddress!: string;

	@IsString()
	@IsNotEmpty()
	tokenSymbol!: string;

	@IsString()
	@IsNotEmpty()
	@Matches(/^[0-9]+$/, {
		message: 'amount must be a string-encoded integer (no decimals)'
	})
	amount!: string;

	@IsString()
	@IsNotEmpty()
	@Matches(/^0x[0-9a-fA-F]*$/, {
		message: 'transferData must be hex-encoded calldata'
	})
	transferData!: string;
}

// =============================================================================
// Main UserOp DTO
// =============================================================================

/**
 * Validates a relayed UserOp submission.
 * Client builds and signs this locally; backend validates, adds paymaster, and forwards to bundler.
 */
export class RelayUserOpDto {
	// --- UserOp fields ---

	@IsString()
	@IsNotEmpty()
	@Matches(/^0x[0-9a-fA-F]{40}$/, {
		message: 'sender must be a valid 20-byte hex address'
	})
	sender!: string;

	@IsNumber()
	@Min(0)
	nonce!: number;

	@IsString()
	@IsNotEmpty()
	@Matches(/^0x[0-9a-fA-F]+$/, {
		message: 'callData must be hex-encoded'
	})
	callData!: string;

	@IsNumber()
	@Min(21000, { message: 'callGasLimit too low — minimum 21000' })
	@Max(10_000_000, { message: 'callGasLimit exceeds maximum 10M' })
	callGasLimit!: number;

	@IsNumber()
	@Min(0)
	@Max(10_000_000, { message: 'verificationGasLimit exceeds maximum 10M' })
	verificationGasLimit!: number;

	@IsNumber()
	@Min(0)
	@Max(500_000, { message: 'preVerificationGas exceeds maximum 500K' })
	preVerificationGas!: number;

	@IsNumber()
	@Min(0)
	maxFeePerGas!: number;

	@IsNumber()
	@Min(0)
	maxPriorityFeePerGas!: number;

	@IsString()
	@IsNotEmpty()
	@Matches(/^0x[0-9a-fA-F]*$/, {
		message: 'paymasterAndData must be hex-encoded'
	})
	paymasterAndData!: string;

	@IsString()
	@IsNotEmpty()
	@Matches(/^0x[0-9a-fA-F]+$/, {
		message: 'signature must be hex-encoded'
	})
	signature!: string;

	// --- Relay metadata ---

	/**
	 * Requested fee tier for priority inclusion.
	 * Falls back to 'standard' if omitted.
	 */
	@IsOptional()
	@IsString()
	@Matches(/^(standard|fast|urgent)$/, {
		message: 'feeTier must be standard, fast, or urgent'
	})
	feeTier?: FeeTierName;

	/**
	 * Optional token payment info if paying gas in ERC-20 tokens.
	 */
	@IsOptional()
	@ValidateNested()
	@Type(() => TokenPaymentDto)
	tokenPayment?: TokenPaymentDto;

	// --- EIP-7702 delegation (optional) ---

	/**
	 * If true, the UserOp uses EIP-7702 delegation instead of a smart account.
	 */
	@IsOptional()
	@IsString()
	@Matches(/^0x[0-9a-fA-F]*$/, {
		message: 'delegationSuffix must be hex-encoded if provided'
	})
	delegationSuffix?: string;
}

// =============================================================================
// Response DTOs
// =============================================================================

export class RelayUserOpResponseDto {
	/** Bundler-assigned UserOp hash */
	userOpHash!: string;

	/** Transaction hash once included on-chain */
	txHash?: string;

	/** Fee tier used */
	feeTierUsed!: string;

	/** Whether the paymaster signed successfully */
	paymasterSigned!: boolean;

	/** Whether preflight simulation passed */
	simulationPassed!: boolean;

	/** Human-readable status message */
	message!: string;
}

export class GasEstimateResponseDto {
	callGasLimit!: number;
	verificationGasLimit!: number;
	preVerificationGas!: number;
	totalGasLimit!: number;
	estimatedCostWei!: string;
	estimatedCostToken?: string;
	estimatedCostTokenSymbol?: string;
	suggestedFeeTier!: string;
}
