/**
 * Unit tests for v2 escrow creation (Phase 1)
 */
import { describe, it, expect, vi } from 'vitest';
import { deriveV2CreationParams } from '$lib/utils/escrow/v2/creation';
import {
	GAS_REIMBURSEMENT_PER_OP,
	CANCELLATION_FEE_MVP,
	UPFRONT_DEPOSIT_MVP
} from '$lib/utils/escrow/v2/types';
vi.mock('@bittasker/wallet-core', () => ({
	FEE_TIERS: {
		1: { percentage: 250, label: '2.5%' }
	}
}));

const mockBidContent = {
	type: 'bid' as const,
	taskId: 'task-123',
	taskTitle: 'Test Task',
	taskDescription: 'Description',
	amount: 100,
	currency: 'USD',
	paymentType: 'FIXED' as const,
	description: 'Bid description',
	estimatedDuration: '2 hours',
	proposedApproach: 'Approach',
	coverLetter: 'Cover',
	timestamp: Date.now(),
	bidId: 'bid-123',
	startDateTime: '2026-04-01T10:00:00',
	endDateTime: '2026-04-01T12:00:00',
	bidderWalletAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1'
};

const mockTask = {
	id: 'task-123',
	title: 'Test Task',
	description: 'Description',
	status: 'OPEN',
	dateRange: { start: '2026-04-01', end: '2026-04-01' }
};

describe('deriveV2CreationParams', () => {
	const btcPrice = 100_000;

	it('should derive params with correct total value formula', () => {
		const { params, display } = deriveV2CreationParams(mockBidContent, mockTask, btcPrice);

		expect(params.taskee).toBe(mockBidContent.bidderWalletAddress);
		expect(params.cancellationFee).toBe(CANCELLATION_FEE_MVP);
		expect(params.upfrontDeposit).toBe(UPFRONT_DEPOSIT_MVP);
		expect(params.taskerFeeTier).toBe(1);
		expect(params.taskeeFeeTier).toBe(1);

		const baseAmountWei = params.baseAmountWei;
		const expectedTaskerFee = (baseAmountWei * 250n) / 10000n;
		const expectedTaskeeFee = (baseAmountWei * 250n) / 10000n;
		expect(params.taskerFeeWei).toBe(expectedTaskerFee);
		expect(params.taskeeFeeWei).toBe(expectedTaskeeFee);

		// Total = base + taskerFee + gasReimbursement (taskee fee deducted from base inside contract)
		const expectedTotal = baseAmountWei + params.taskerFeeWei + 2n * GAS_REIMBURSEMENT_PER_OP;
		expect(params.totalValueWei).toBe(expectedTotal);

		expect(display.baseAmount).toBeDefined();
		expect(display.totalAmount).toBeDefined();
		expect(display.gasReimbursementAmount).toBeDefined();
		expect(display.estimatedStartTime).toBeGreaterThan(0);
		expect(display.estimatedCompletionTime).toBeGreaterThan(display.estimatedStartTime);
	});

	it('should throw on invalid bid amount', () => {
		expect(() =>
			deriveV2CreationParams({ ...mockBidContent, amount: 0 }, mockTask, btcPrice)
		).toThrow('Invalid bid amount');
	});

	it('should throw on invalid BTC price', () => {
		expect(() => deriveV2CreationParams(mockBidContent, mockTask, 0)).toThrow('Invalid BTC price');
	});

	it('should throw on missing bidder wallet address', () => {
		expect(() =>
			deriveV2CreationParams({ ...mockBidContent, bidderWalletAddress: '' }, mockTask, btcPrice)
		).toThrow('Bid must include bidder wallet address');
	});

	it('should adjust times when start is in the past', () => {
		// Use a fixed past date: 2020-01-01 10:00:00 (local time format)
		const bidWithPastTimes = {
			...mockBidContent,
			startDateTime: '2020-01-01T10:00:00',
			endDateTime: '2020-01-01T12:00:00'
		};

		const { display } = deriveV2CreationParams(bidWithPastTimes, mockTask, btcPrice);
		expect(display.wasTimeAdjusted).toBe(true);
		const now = Math.floor(Date.now() / 1000);
		expect(display.estimatedStartTime).toBeGreaterThanOrEqual(now);
	});
});
