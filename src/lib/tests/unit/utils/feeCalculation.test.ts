import { describe, it, expect } from 'vitest';

/**
 * Fee calculation utility tests
 * Tests percentage-based and fixed fee calculations
 */

// Fee tier definitions (matching escrow.ts)
type FeeTier = 'tier1' | 'tier2' | 'tier3' | 'tier4';

const FEE_TIERS: Record<FeeTier, { percentage: number }> = {
	tier1: { percentage: 50 }, // 0.5%
	tier2: { percentage: 100 }, // 1.0%
	tier3: { percentage: 150 }, // 1.5%
	tier4: { percentage: 200 } // 2.0%
};

/**
 * Calculate fee amount from base amount and fee tier
 */
function calculateFeeAmount(baseAmount: bigint, feeTier: FeeTier): bigint {
	const feePercentage = BigInt(FEE_TIERS[feeTier].percentage);
	return (baseAmount * feePercentage) / 10000n;
}

/**
 * Calculate total payment (base amount + fee)
 */
function calculateTotalPayment(baseAmount: bigint, feeTier: FeeTier): bigint {
	return baseAmount + calculateFeeAmount(baseAmount, feeTier);
}

/**
 * Calculate max amount that can be sent after deducting fixed fee
 */
function calculateMaxAmount(balance: bigint, fixedFee: bigint): bigint {
	if (balance <= fixedFee) {
		return 0n;
	}
	return balance - fixedFee;
}

/**
 * Refine max amount calculation with percentage fee
 * Iteratively calculates the max amount accounting for percentage fee
 */
function refineMaxAmountWithPercentageFee(
	balance: bigint,
	feePercentage: number,
	fixedFee: bigint,
	maxIterations: number = 10
): bigint {
	// Handle edge cases
	if (balance <= fixedFee) {
		return 0n;
	}

	let maxAmount = balance - fixedFee;

	for (let i = 0; i < maxIterations; i++) {
		const feeAmount = (maxAmount * BigInt(feePercentage)) / 10000n;
		const totalNeeded = maxAmount + feeAmount + fixedFee;

		if (totalNeeded <= balance) {
			// We found the correct max amount
			break;
		}

		// Adjust max amount downward
		const excess = totalNeeded - balance;
		maxAmount = maxAmount > excess ? maxAmount - excess : 0n;

		if (maxAmount === 0n) {
			break;
		}
	}

	return maxAmount;
}

describe('Fee Calculation', () => {
	describe('calculateFeeAmount', () => {
		it('should calculate percentage fee correctly', () => {
			const baseAmount = 1000000n; // 1,000,000 sats
			const fee = calculateFeeAmount(baseAmount, 'tier1');
			expect(fee).toBe(5000n); // 0.5% of 1,000,000 = 5,000 sats
		});

		it('should handle different fee tiers', () => {
			const baseAmount = 1000000n;
			expect(calculateFeeAmount(baseAmount, 'tier1')).toBe(5000n); // 0.5%
			expect(calculateFeeAmount(baseAmount, 'tier2')).toBe(10000n); // 1.0%
			expect(calculateFeeAmount(baseAmount, 'tier3')).toBe(15000n); // 1.5%
			expect(calculateFeeAmount(baseAmount, 'tier4')).toBe(20000n); // 2.0%
		});

		it('should handle zero amount', () => {
			expect(calculateFeeAmount(0n, 'tier1')).toBe(0n);
		});

		it('should handle very small amounts', () => {
			const baseAmount = 100n; // 100 sats
			const fee = calculateFeeAmount(baseAmount, 'tier1');
			expect(fee).toBe(0n); // 0.5% of 100 = 0.5, floored to 0
		});

		it('should handle very large amounts', () => {
			const baseAmount = 100000000000n; // 1,000 BTC
			const fee = calculateFeeAmount(baseAmount, 'tier2');
			expect(fee).toBe(1000000000n); // 1% of 1,000 BTC = 10 BTC
		});
	});

	describe('calculateTotalPayment', () => {
		it('should calculate total payment correctly', () => {
			const baseAmount = 1000000n;
			const total = calculateTotalPayment(baseAmount, 'tier1');
			expect(total).toBe(1005000n); // 1,000,000 + 5,000 fee
		});

		it('should handle zero amount', () => {
			expect(calculateTotalPayment(0n, 'tier1')).toBe(0n);
		});
	});

	describe('calculateMaxAmount', () => {
		it('should calculate max amount with fixed fee', () => {
			const balance = 1000000n;
			const fixedFee = 3000n;
			const maxAmount = calculateMaxAmount(balance, fixedFee);
			expect(maxAmount).toBe(997000n); // 1,000,000 - 3,000
		});

		it('should return zero if balance is less than fee', () => {
			const balance = 1000n;
			const fixedFee = 3000n;
			const maxAmount = calculateMaxAmount(balance, fixedFee);
			expect(maxAmount).toBe(0n);
		});

		it('should return zero if balance equals fee', () => {
			const balance = 3000n;
			const fixedFee = 3000n;
			const maxAmount = calculateMaxAmount(balance, fixedFee);
			expect(maxAmount).toBe(0n);
		});
	});

	describe('refineMaxAmountWithPercentageFee', () => {
		it('should refine max amount accounting for percentage fee', () => {
			const balance = 1000000n; // 1,000,000 sats
			const feePercentage = 100; // 1%
			const fixedFee = 3000n;

			const maxAmount = refineMaxAmountWithPercentageFee(balance, feePercentage, fixedFee);

			// Verify: maxAmount + (maxAmount * 1%) + 3000 <= 1,000,000
			const feeAmount = (maxAmount * BigInt(feePercentage)) / 10000n;
			const totalNeeded = maxAmount + feeAmount + fixedFee;

			expect(totalNeeded).toBeLessThanOrEqual(balance);
			expect(maxAmount).toBeGreaterThan(0n);
		});

		it('should handle zero balance', () => {
			const maxAmount = refineMaxAmountWithPercentageFee(0n, 100, 3000n);
			expect(maxAmount).toBe(0n);
		});

		it('should handle balance less than fixed fee', () => {
			const balance = 1000n;
			const fixedFee = 3000n;
			const maxAmount = refineMaxAmountWithPercentageFee(balance, 100, fixedFee);
			expect(maxAmount).toBe(0n);
		});

		it('should converge to correct value', () => {
			const balance = 1000000n;
			const feePercentage = 150; // 1.5%
			const fixedFee = 3000n;

			const maxAmount = refineMaxAmountWithPercentageFee(balance, feePercentage, fixedFee);

			// Verify the result is valid: maxAmount + fee + fixedFee <= balance
			const feeAmount = (maxAmount * BigInt(feePercentage)) / 10000n;
			const totalNeeded = maxAmount + feeAmount + fixedFee;

			expect(totalNeeded).toBeLessThanOrEqual(balance);
			expect(maxAmount).toBeGreaterThan(0n);

			// Allow some tolerance for iterative convergence (within 500 sats)
			const expectedMax = ((balance - fixedFee) * 10000n) / (10000n + BigInt(feePercentage));
			const diff = maxAmount > expectedMax ? maxAmount - expectedMax : expectedMax - maxAmount;
			expect(diff).toBeLessThan(500n); // Within 500 sats tolerance
		});
	});

	describe('Edge cases', () => {
		it('should handle very small balance', () => {
			const balance = 100n;
			const fixedFee = 50n;
			const maxAmount = calculateMaxAmount(balance, fixedFee);
			expect(maxAmount).toBe(50n);
		});

		it('should handle very large balance', () => {
			const balance = 100000000000n; // 1,000 BTC
			const fixedFee = 3000n;
			const maxAmount = calculateMaxAmount(balance, fixedFee);
			expect(maxAmount).toBe(99999997000n);
		});

		it('should handle zero fixed fee', () => {
			const balance = 1000000n;
			const maxAmount = calculateMaxAmount(balance, 0n);
			expect(maxAmount).toBe(balance);
		});
	});
});
