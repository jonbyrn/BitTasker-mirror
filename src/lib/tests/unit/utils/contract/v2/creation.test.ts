import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ethers } from 'ethers';
import { MINIMUM_START_BUFFER_SECONDS } from '$lib/utils/contract/v2/types';

vi.mock('$lib/nostr/ndk', () => ({ ndk: {} }));
vi.mock('$lib/nostr/events/contract', () => ({
	NDKPaymentContract: { from: vi.fn() }
}));
vi.mock('$lib/utils/contract/v2/blockchainWrites', () => ({
	createPaymentContract: vi.fn(),
	estimateWrite: vi.fn()
}));
vi.mock('$lib/utils/contract/v2/contractAddress', () => ({
	getSecurePaymentContractAddress: vi.fn(() => '0x1234567890123456789012345678901234567890')
}));
vi.mock('$lib/utils/location/sendLocation', () => ({
	sendLocationsToTaskee: vi.fn(() => Promise.resolve())
}));
vi.mock('$lib/api/services/push-notification.service', () => ({
	pushNotificationService: { sendNotificationToNpubs: vi.fn(() => Promise.resolve()) }
}));
vi.mock('@bittasker/wallet-core', () => ({
	FEE_TIERS: { 1: { percentage: 250 } },
	normalizeRskAddress: (addr: string) => addr
}));

import { deriveContractCreationParams } from '$lib/utils/contract/v2/creation';
import { assertValidCreatePaymentContractParams } from '$lib/utils/contract/v2/createPaymentContractParams';

function makeBidContent(overrides: Record<string, unknown> = {}) {
	return {
		amount: 100000,
		bidderWalletAddress: '0x64bF4b77D21e1849C42165F8558d681857933994',
		startDateTime: undefined,
		endDateTime: undefined,
		cancellationFee: 0,
		upfrontDeposit: 0,
		...overrides
	} as unknown as Parameters<typeof deriveContractCreationParams>[0];
}

describe('deriveContractCreationParams — start time buffer', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('adjusts startTime when it is within the safety buffer of now', () => {
		const now = Math.floor(Date.now() / 1000);
		vi.setSystemTime(now * 1000);

		// Set startDateTime to 30 seconds from now — within the 180s buffer
		const nearFuture = (now + 30).toString();
		const bid = makeBidContent({
			startDateTime: nearFuture,
			endDateTime: String(now + 3600)
		});

		const { params, display } = deriveContractCreationParams(bid, 100000);

		expect(params.estimatedStartTime).toBe(now + MINIMUM_START_BUFFER_SECONDS);
		expect(display.wasTimeAdjusted).toBe(true);
	});

	it('does NOT adjust startTime when it is beyond the safety buffer', () => {
		const now = Math.floor(Date.now() / 1000);
		vi.setSystemTime(now * 1000);

		// Set startDateTime to 20 minutes from now — beyond the 900s buffer
		const farFuture = (now + 1200).toString();
		const bid = makeBidContent({
			startDateTime: farFuture,
			endDateTime: String(now + 7200)
		});

		const { params, display } = deriveContractCreationParams(bid, 100000);

		expect(params.estimatedStartTime).toBe(now + 1200);
		expect(display.wasTimeAdjusted).toBe(false);
	});

	it('does NOT adjust startTime when it equals now + buffer (boundary passes)', () => {
		const now = Math.floor(Date.now() / 1000);
		vi.setSystemTime(now * 1000);

		// startTime == now + buffer — should pass without adjustment (<)
		const bid = makeBidContent({
			startDateTime: String(now + MINIMUM_START_BUFFER_SECONDS),
			endDateTime: String(now + 7200)
		});

		const { params, display } = deriveContractCreationParams(bid, 100000);

		expect(params.estimatedStartTime).toBe(now + MINIMUM_START_BUFFER_SECONDS);
		expect(display.wasTimeAdjusted).toBe(false);
	});

	it('preserves duration when startTime is adjusted', () => {
		const now = Math.floor(Date.now() / 1000);
		vi.setSystemTime(now * 1000);

		const originalCompletion = now + 3600;
		const bid = makeBidContent({
			startDateTime: String(now + 30),
			endDateTime: String(originalCompletion)
		});

		const { params } = deriveContractCreationParams(bid, 100000);

		// completionTime should be adjusted to preserve the original duration
		const originalDuration = originalCompletion - (now + 30);
		expect(params.estimatedStartTime).toBe(now + MINIMUM_START_BUFFER_SECONDS);
		expect(params.estimatedCompletionTime).toBe(
			now + MINIMUM_START_BUFFER_SECONDS + originalDuration
		);
	});

	it('preserves duration for short-window bids instead of throwing', () => {
		const now = Math.floor(Date.now() / 1000);
		vi.setSystemTime(now * 1000);

		// completionTime is only 60 seconds from now — short window, but duration preserved
		const originalStart = now + 30;
		const originalEnd = now + 60;
		const originalDuration = originalEnd - originalStart; // 30s

		const bid = makeBidContent({
			startDateTime: String(originalStart),
			endDateTime: String(originalEnd)
		});

		const { params, display } = deriveContractCreationParams(bid, 100000);

		// Duration is preserved — no throw
		expect(params.estimatedStartTime).toBe(now + MINIMUM_START_BUFFER_SECONDS);
		expect(params.estimatedCompletionTime).toBe(
			now + MINIMUM_START_BUFFER_SECONDS + originalDuration
		);
		expect(display.wasTimeAdjusted).toBe(true);
	});

	it('preserves original duration when adjusting start time for past-start bid', () => {
		const now = Math.floor(Date.now() / 1000);
		vi.setSystemTime(now * 1000);

		// Bid started 1 hour ago, duration is 2 hours (7200s)
		const originalStart = now - 3600;
		const originalEnd = now + 3600;
		const originalDuration = originalEnd - originalStart; // 7200

		const bid = makeBidContent({
			startDateTime: String(originalStart),
			endDateTime: String(originalEnd)
		});

		const { params, display } = deriveContractCreationParams(bid, 100000);

		expect(params.estimatedStartTime).toBe(now + MINIMUM_START_BUFFER_SECONDS);
		expect(params.estimatedCompletionTime).toBe(
			now + MINIMUM_START_BUFFER_SECONDS + originalDuration
		);
		expect(display.wasTimeAdjusted).toBe(true);
	});

	it('preserves original duration when completion time is within buffer of adjusted start', () => {
		const now = Math.floor(Date.now() / 1000);
		vi.setSystemTime(now * 1000);

		// Start is in the past, end is only 2 minutes from now (short window)
		// Without duration preservation, this would throw
		const originalStart = now - 60;
		const originalEnd = now + 120;
		const originalDuration = originalEnd - originalStart; // 180s

		const bid = makeBidContent({
			startDateTime: String(originalStart),
			endDateTime: String(originalEnd)
		});

		const { params, display } = deriveContractCreationParams(bid, 100000);

		// Should NOT throw — duration is preserved
		expect(params.estimatedStartTime).toBe(now + MINIMUM_START_BUFFER_SECONDS);
		expect(params.estimatedCompletionTime).toBe(
			now + MINIMUM_START_BUFFER_SECONDS + originalDuration
		);
		expect(display.wasTimeAdjusted).toBe(true);
	});

	it('adjusts startTime when it is in the past', () => {
		const now = Math.floor(Date.now() / 1000);
		vi.setSystemTime(now * 1000);

		const bid = makeBidContent({
			startDateTime: String(now - 3600),
			endDateTime: String(now + 3600)
		});

		const { params, display } = deriveContractCreationParams(bid, 100000);

		expect(params.estimatedStartTime).toBe(now + MINIMUM_START_BUFFER_SECONDS);
		expect(display.wasTimeAdjusted).toBe(true);
	});
});

describe('assertValidCreatePaymentContractParams — start time buffer', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('rejects start time within the safety buffer', () => {
		const now = Math.floor(Date.now() / 1000);
		vi.setSystemTime(now * 1000);

		const params = {
			taskee: '0x64bF4b77D21e1849C42165F8558d681857933994',
			estimatedStartTime: now + 60, // within 900s buffer
			estimatedCompletionTime: now + 7200,
			taskerFeeTier: 1,
			taskeeFeeTier: 1,
			cancellationFee: 0n,
			upfrontDeposit: 0n,
			totalValueWei: ethers.parseEther('0.01'),
			baseAmountWei: ethers.parseEther('0.009'),
			taskerFeeWei: ethers.parseEther('0.001'),
			taskeeFeeWei: ethers.parseEther('0.001')
		};

		expect(() => assertValidCreatePaymentContractParams(params)).toThrow(/at least 900 seconds/);
	});

	it('accepts start time beyond the safety buffer', () => {
		const now = Math.floor(Date.now() / 1000);
		vi.setSystemTime(now * 1000);

		const params = {
			taskee: '0x64bF4b77D21e1849C42165F8558d681857933994',
			estimatedStartTime: now + 1200, // 20 min — beyond 900s buffer
			estimatedCompletionTime: now + 7200,
			taskerFeeTier: 1,
			taskeeFeeTier: 1,
			cancellationFee: 0n,
			upfrontDeposit: 0n,
			totalValueWei: ethers.parseEther('0.01'),
			baseAmountWei: ethers.parseEther('0.009'),
			taskerFeeWei: ethers.parseEther('0.001'),
			taskeeFeeWei: ethers.parseEther('0.001')
		};

		expect(() => assertValidCreatePaymentContractParams(params)).not.toThrow();
	});

	it('accepts start time that is exactly at the buffer boundary', () => {
		const now = Math.floor(Date.now() / 1000);
		vi.setSystemTime(now * 1000);

		const params = {
			taskee: '0x64bF4b77D21e1849C42165F8558d681857933994',
			estimatedStartTime: now + MINIMUM_START_BUFFER_SECONDS, // exactly at buffer — passes (<)
			estimatedCompletionTime: now + 7200,
			taskerFeeTier: 1,
			taskeeFeeTier: 1,
			cancellationFee: 0n,
			upfrontDeposit: 0n,
			totalValueWei: ethers.parseEther('0.01'),
			baseAmountWei: ethers.parseEther('0.009'),
			taskerFeeWei: ethers.parseEther('0.001'),
			taskeeFeeWei: ethers.parseEther('0.001')
		};

		expect(() => assertValidCreatePaymentContractParams(params)).not.toThrow();
	});
});

describe('MINIMUM_START_BUFFER_SECONDS', () => {
	it('is 900 seconds (15 minutes)', () => {
		expect(MINIMUM_START_BUFFER_SECONDS).toBe(900);
	});
});

describe('deriveContractCreationParams — nowSeconds parameter', () => {
	it('uses nowSeconds when provided instead of Date.now()', () => {
		const blockTimestamp = 1700000000;
		const bid = makeBidContent({
			startDateTime: String(blockTimestamp + 60), // 60s after block — within buffer
			endDateTime: String(blockTimestamp + 7200)
		});

		const { params, display } = deriveContractCreationParams(bid, 100000, blockTimestamp);

		// startTime should be adjusted to blockTimestamp + 300 (buffer)
		expect(params.estimatedStartTime).toBe(blockTimestamp + MINIMUM_START_BUFFER_SECONDS);
		expect(display.wasTimeAdjusted).toBe(true);
	});

	it('does NOT adjust startTime when it is beyond the buffer from nowSeconds', () => {
		const blockTimestamp = 1700000000;
		const bid = makeBidContent({
			startDateTime: String(blockTimestamp + 1200), // 20 min — beyond 900s buffer
			endDateTime: String(blockTimestamp + 7200)
		});

		const { params, display } = deriveContractCreationParams(bid, 100000, blockTimestamp);

		expect(params.estimatedStartTime).toBe(blockTimestamp + 1200);
		expect(display.wasTimeAdjusted).toBe(false);
	});

	it('falls back to Date.now() when nowSeconds is not provided', () => {
		const now = Math.floor(Date.now() / 1000);
		vi.setSystemTime(now * 1000);

		const bid = makeBidContent({
			startDateTime: String(now + 30),
			endDateTime: String(now + 3600)
		});

		const { params } = deriveContractCreationParams(bid, 100000);

		expect(params.estimatedStartTime).toBe(now + MINIMUM_START_BUFFER_SECONDS);
	});
});
