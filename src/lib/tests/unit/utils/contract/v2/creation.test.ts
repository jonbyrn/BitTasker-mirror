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
	} as Parameters<typeof deriveContractCreationParams>[0];
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

		// Set startDateTime to 10 minutes from now — beyond the 180s buffer
		const farFuture = (now + 600).toString();
		const bid = makeBidContent({
			startDateTime: farFuture,
			endDateTime: String(now + 7200)
		});

		const { params, display } = deriveContractCreationParams(bid, 100000);

		expect(params.estimatedStartTime).toBe(now + 600);
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

	it('does NOT adjust completionTime when startTime is adjusted', () => {
		const now = Math.floor(Date.now() / 1000);
		vi.setSystemTime(now * 1000);

		const originalCompletion = now + 3600;
		const bid = makeBidContent({
			startDateTime: String(now + 30),
			endDateTime: String(originalCompletion)
		});

		const { params } = deriveContractCreationParams(bid, 100000);

		// completionTime should be unchanged
		expect(params.estimatedCompletionTime).toBe(originalCompletion);
		// startTime should be adjusted to now + buffer
		expect(params.estimatedStartTime).toBe(now + MINIMUM_START_BUFFER_SECONDS);
	});

	it('throws when adjusted startTime >= completionTime', () => {
		const now = Math.floor(Date.now() / 1000);
		vi.setSystemTime(now * 1000);

		// completionTime is only 60 seconds from now, buffer pushes start past it
		const bid = makeBidContent({
			startDateTime: String(now + 30),
			endDateTime: String(now + 60)
		});

		expect(() => deriveContractCreationParams(bid, 100000)).toThrow(
			/Completion time must be after start time/
		);
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
			estimatedStartTime: now + 30, // within buffer
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

		expect(() => assertValidCreatePaymentContractParams(params)).toThrow(/at least 180 seconds/);
	});

	it('accepts start time beyond the safety buffer', () => {
		const now = Math.floor(Date.now() / 1000);
		vi.setSystemTime(now * 1000);

		const params = {
			taskee: '0x64bF4b77D21e1849C42165F8558d681857933994',
			estimatedStartTime: now + 600, // 10 min — beyond buffer
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
	it('is 180 seconds (3 minutes)', () => {
		expect(MINIMUM_START_BUFFER_SECONDS).toBe(180);
	});
});
