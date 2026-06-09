/**
 * UserOp Fee Validator
 *
 * Custom class-validator constraint that ensures UserOp gas fees
 * are within acceptable bounds for the selected fee tier.
 * Reference implementation for the NestJS backend.
 */

import {
	registerDecorator,
	ValidationOptions,
	ValidatorConstraint,
	ValidatorConstraintInterface,
	ValidationArguments
} from 'class-validator';

// =============================================================================
// Fee Tier Lookup Map
// =============================================================================

/**
 * Known fee tiers with their maximum allowed gas prices.
 * In production, inject this via DI from GaslessConfig.
 */
const FEE_TIER_LIMITS: Record<string, { maxFeePerGas: number; maxPriorityFeePerGas: number }> = {
	standard: {
		maxFeePerGas: 100_000_000,
		maxPriorityFeePerGas: 10_000_000
	},
	fast: {
		maxFeePerGas: 200_000_000,
		maxPriorityFeePerGas: 25_000_000
	},
	urgent: {
		maxFeePerGas: 500_000_000,
		maxPriorityFeePerGas: 50_000_000
	}
};

// =============================================================================
// Constraint Implementation
// =============================================================================

@ValidatorConstraint({ name: 'UserOpFee', async: false })
export class UserOpFeeConstraint implements ValidatorConstraintInterface {
	validate(_value: unknown, args: ValidationArguments): boolean {
		const obj = args.object as Record<string, unknown>;

		const maxFeePerGas = obj['maxFeePerGas'] as number | undefined;
		const maxPriorityFeePerGas = obj['maxPriorityFeePerGas'] as number | undefined;
		const feeTier = (obj['feeTier'] as string) ?? 'standard';
		const callGasLimit = obj['callGasLimit'] as number | undefined;
		const verificationGasLimit = obj['verificationGasLimit'] as number | undefined;
		const preVerificationGas = obj['preVerificationGas'] as number | undefined;

		// Validate gas price bounds
		if (maxFeePerGas !== undefined && maxFeePerGas < 0) {
			return false;
		}

		if (maxPriorityFeePerGas !== undefined && maxPriorityFeePerGas < 0) {
			return false;
		}

		// Validate fee tier constraints
		const tierLimits = FEE_TIER_LIMITS[feeTier];
		if (tierLimits) {
			if (maxFeePerGas !== undefined && maxFeePerGas > tierLimits.maxFeePerGas) {
				return false;
			}
			if (
				maxPriorityFeePerGas !== undefined &&
				maxPriorityFeePerGas > tierLimits.maxPriorityFeePerGas
			) {
				return false;
			}
		}

		// Validate total gas estimate is within reasonable bounds
		if (
			callGasLimit !== undefined &&
			verificationGasLimit !== undefined &&
			preVerificationGas !== undefined
		) {
			const totalGas = callGasLimit + verificationGasLimit + preVerificationGas;
			if (totalGas > 10_000_000) {
				return false;
			}
			if (totalGas < 21_000) {
				return false;
			}
		}

		// Priority fee should not exceed max fee
		if (
			maxFeePerGas !== undefined &&
			maxPriorityFeePerGas !== undefined &&
			maxPriorityFeePerGas > maxFeePerGas
		) {
			return false;
		}

		return true;
	}

	defaultMessage(args: ValidationArguments): string {
		const obj = args.object as Record<string, unknown>;
		const feeTier = (obj['feeTier'] as string) ?? 'standard';
		const tierLimits = FEE_TIER_LIMITS[feeTier];

		if (!tierLimits) {
			return `Unknown fee tier '${feeTier}'. Must be standard, fast, or urgent.`;
		}

		return (
			`Gas fees exceed ${feeTier} tier limits. ` +
			`maxFeePerGas must be ≤ ${tierLimits.maxFeePerGas}, ` +
			`maxPriorityFeePerGas must be ≤ ${tierLimits.maxPriorityFeePerGas}. ` +
			`priority fee must not exceed max fee. ` +
			`total gas must be between 21K and 10M.`
		);
	}
}

// =============================================================================
// Decorator Factory
// =============================================================================

/**
 * Decorator: Validates UserOp gas fees against the specified fee tier bounds.
 *
 * Usage:
 *   @IsUserOpFeeValid()
 *   maxFeePerGas!: number;
 */
export function IsUserOpFeeValid(validationOptions?: ValidationOptions) {
	return function (object: object, propertyName: string) {
		registerDecorator({
			name: 'IsUserOpFeeValid',
			target: object.constructor,
			propertyName,
			constraints: [],
			options: validationOptions,
			validator: UserOpFeeConstraint
		});
	};
}

// =============================================================================
// Standalone Validation Functions
// =============================================================================

export interface FeeValidationResult {
	valid: boolean;
	error?: string;
	estimatedCostWei?: bigint;
}

/**
 * Validate gas fees against a specific fee tier.
 */
export function validateGasFees(
	maxFeePerGas: number,
	maxPriorityFeePerGas: number,
	feeTier: string
): FeeValidationResult {
	const tierLimits = FEE_TIER_LIMITS[feeTier];
	if (!tierLimits) {
		return { valid: false, error: `Unknown fee tier: ${feeTier}` };
	}

	if (maxFeePerGas > tierLimits.maxFeePerGas) {
		return {
			valid: false,
			error: `maxFeePerGas ${maxFeePerGas} exceeds ${feeTier} limit ${tierLimits.maxFeePerGas}`
		};
	}

	if (maxPriorityFeePerGas > tierLimits.maxPriorityFeePerGas) {
		return {
			valid: false,
			error: `maxPriorityFeePerGas ${maxPriorityFeePerGas} exceeds ${feeTier} limit ${tierLimits.maxPriorityFeePerGas}`
		};
	}

	if (maxPriorityFeePerGas > maxFeePerGas) {
		return {
			valid: false,
			error: 'priority fee must not exceed max fee'
		};
	}

	return { valid: true };
}

/**
 * Calculate estimated cost in wei for a given gas estimate and fee tier.
 */
export function estimateGasCost(totalGasLimit: number, feeTier: string): FeeValidationResult {
	const tierLimits = FEE_TIER_LIMITS[feeTier];
	if (!tierLimits) {
		return { valid: false, error: `Unknown fee tier: ${feeTier}` };
	}

	const estimatedCostWei = BigInt(totalGasLimit) * BigInt(tierLimits.maxFeePerGas);

	return {
		valid: true,
		estimatedCostWei
	};
}
