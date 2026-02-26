import { describe, it, expect, vi } from 'vitest';
import { ethers } from 'ethers';

// Mock wallet-core (FEE_TIERS required by escrow fee helpers; avoid EventBus in test env)
vi.mock('@bittasker/wallet-core', () => ({
	FEE_TIERS: {
		1: { percentage: 250 }, // 2.5%
		2: { percentage: 200 }, // 2.0%
		3: { percentage: 150 } // 1.5%
	}
}));

import { calculateFeeAmount, calculateTotalPayment } from '$lib/utils/escrow/v1/escrow';
import type { FeeTier } from '@bittasker/wallet-core';

// Utility function to calculate freelancer payout (base amount - freelancer fee)
function calculateFreelancerPayout(baseAmount: bigint, freelancerFeeTier: FeeTier): bigint {
	const freelancerFee = calculateFeeAmount(baseAmount, freelancerFeeTier);
	return baseAmount - freelancerFee;
}

describe('Fee Calculations', () => {
	describe('calculateFeeAmount', () => {
		it('should calculate fee for tier 1 (2.5%)', () => {
			const baseAmount = ethers.parseEther('1.0'); // 1.0 RBTC
			const fee = calculateFeeAmount(baseAmount, 1);

			// 1.0 * 0.025 = 0.025 RBTC
			expect(fee).toBe(ethers.parseEther('0.025'));
		});

		it('should calculate fee for tier 2 (2.0%)', () => {
			const baseAmount = ethers.parseEther('1.0');
			const fee = calculateFeeAmount(baseAmount, 2);

			// 1.0 * 0.02 = 0.02 RBTC
			expect(fee).toBe(ethers.parseEther('0.02'));
		});

		it('should calculate fee for tier 3 (1.5%)', () => {
			const baseAmount = ethers.parseEther('1.0');
			const fee = calculateFeeAmount(baseAmount, 3);

			// 1.0 * 0.015 = 0.015 RBTC
			expect(fee).toBe(ethers.parseEther('0.015'));
		});

		it('should handle large amounts correctly', () => {
			const baseAmount = ethers.parseEther('100.0');
			const fee = calculateFeeAmount(baseAmount, 1);

			// 100.0 * 0.025 = 2.5 RBTC (tier 1 is 2.5%)
			expect(fee).toBe(ethers.parseEther('2.5'));
		});

		it('should handle small amounts correctly', () => {
			const baseAmount = ethers.parseEther('0.001');
			const fee = calculateFeeAmount(baseAmount, 1);

			// 0.001 * 0.025 = 0.000025 RBTC (tier 1 is 2.5%)
			expect(fee).toBe(ethers.parseEther('0.000025'));
		});

		it('should handle zero amount', () => {
			const baseAmount = BigInt(0);
			const fee = calculateFeeAmount(baseAmount, 1);

			expect(fee).toBe(BigInt(0));
		});
	});

	describe('calculateTotalPayment', () => {
		it('should calculate total payment with client fee tier 1', () => {
			const baseAmount = ethers.parseEther('1.0');
			const total = calculateTotalPayment(baseAmount, 1);

			// 1.0 + 0.025 = 1.025 RBTC
			expect(total).toBe(ethers.parseEther('1.025'));
		});

		it('should calculate total payment with client fee tier 2', () => {
			const baseAmount = ethers.parseEther('1.0');
			const total = calculateTotalPayment(baseAmount, 2);

			// 1.0 + 0.02 = 1.02 RBTC
			expect(total).toBe(ethers.parseEther('1.02'));
		});

		it('should calculate total payment with client fee tier 3', () => {
			const baseAmount = ethers.parseEther('1.0');
			const total = calculateTotalPayment(baseAmount, 3);

			// 1.0 + 0.015 = 1.015 RBTC
			expect(total).toBe(ethers.parseEther('1.015'));
		});

		it('should handle large amounts', () => {
			const baseAmount = ethers.parseEther('100.0');
			const total = calculateTotalPayment(baseAmount, 1);

			// 100.0 + 2.5 = 102.5 RBTC (tier 1 is 2.5%)
			expect(total).toBe(ethers.parseEther('102.5'));
		});
	});

	describe('calculateFreelancerPayout', () => {
		it('should calculate freelancer payout with fee tier 1', () => {
			const baseAmount = ethers.parseEther('1.0');
			const payout = calculateFreelancerPayout(baseAmount, 1);

			// 1.0 - 0.025 = 0.975 RBTC
			expect(payout).toBe(ethers.parseEther('0.975'));
		});

		it('should calculate freelancer payout with fee tier 2', () => {
			const baseAmount = ethers.parseEther('1.0');
			const payout = calculateFreelancerPayout(baseAmount, 2);

			// 1.0 - 0.02 = 0.98 RBTC
			expect(payout).toBe(ethers.parseEther('0.98'));
		});

		it('should calculate freelancer payout with fee tier 3', () => {
			const baseAmount = ethers.parseEther('1.0');
			const payout = calculateFreelancerPayout(baseAmount, 3);

			// 1.0 - 0.015 = 0.985 RBTC
			expect(payout).toBe(ethers.parseEther('0.985'));
		});

		it('should handle large amounts', () => {
			const baseAmount = ethers.parseEther('100.0');
			const payout = calculateFreelancerPayout(baseAmount, 1);

			// 100.0 - 2.5 = 97.5 RBTC (tier 1 is 2.5%)
			expect(payout).toBe(ethers.parseEther('97.5'));
		});

		it('should ensure payout is less than base amount', () => {
			const baseAmount = ethers.parseEther('1.0');
			const payout = calculateFreelancerPayout(baseAmount, 2);

			expect(payout).toBeLessThan(baseAmount);
		});
	});

	describe('Fee calculation integration', () => {
		it('should maintain consistency: total payment = base + client fee, payout = base - freelancer fee', () => {
			const baseAmount = ethers.parseEther('10.0');
			const clientFeeTier = 1;
			const freelancerFeeTier = 1;

			const clientFee = calculateFeeAmount(baseAmount, clientFeeTier);
			const freelancerFee = calculateFeeAmount(baseAmount, freelancerFeeTier);
			const totalPayment = calculateTotalPayment(baseAmount, clientFeeTier);
			const freelancerPayout = calculateFreelancerPayout(baseAmount, freelancerFeeTier);

			// Verify relationships
			expect(totalPayment).toBe(baseAmount + clientFee);
			expect(freelancerPayout).toBe(baseAmount - freelancerFee);
			expect(totalPayment).toBeGreaterThan(baseAmount);
			expect(freelancerPayout).toBeLessThan(baseAmount);
		});

		it('should handle different fee tiers for client and freelancer', () => {
			const baseAmount = ethers.parseEther('1.0');
			const clientFeeTier = 3; // 1.5%
			const freelancerFeeTier = 1; // 2.5%

			const totalPayment = calculateTotalPayment(baseAmount, clientFeeTier);
			const freelancerPayout = calculateFreelancerPayout(baseAmount, freelancerFeeTier);

			// Client pays: 1.0 + 0.015 = 1.015
			expect(totalPayment).toBe(ethers.parseEther('1.015'));

			// Freelancer receives: 1.0 - 0.025 = 0.975
			expect(freelancerPayout).toBe(ethers.parseEther('0.975'));
		});
	});
});
