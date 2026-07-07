import { describe, it, expect } from 'vitest';
import { computeDisplayStatusV2 } from '$lib/utils/contract/lifecycle/v2';
import { computeDisplayStatusV1 } from '$lib/utils/contract/lifecycle/v1';
import { ContractStatus, DisplayOnlyStatus } from '$lib/utils/contract/types';
import type { PaymentContractRuneLike } from '$lib/utils/contract/lifecycle/types';
import type { NDKPaymentContract } from '$lib/nostr/events/contract';

/**
 * Tests for the contract display status when blockchain data is missing.
 *
 * BUG: When blockchainData is null (RPC failure, paymentId missing, etc.),
 * both v1 and v2 default to ContractStatus.Funded. This causes:
 * - "In Progress" display when estimatedStartTime has passed
 * - No actions available (permission check returns all false)
 * - User sees dates from Nostr tags but no way to interact
 *
 * The correct behavior: when blockchainData is null, the state is UNKNOWN.
 * The UI should show a loading/error state, not pretend the contract is Funded.
 */
describe('computeDisplayStatus when blockchainData is null', () => {
	const now = Math.floor(Date.now() / 1000);

	function makeRune(overrides: Partial<PaymentContractRuneLike> = {}): PaymentContractRuneLike {
		return {
			contract: {
				taskeePubkey: 'taskee-pk',
				contractAddress: '0xcontract',
				taskerPubkey: 'tasker-pk',
				created_at: now - 86400
			} as unknown as NDKPaymentContract,
			paymentId: '42',
			version: 'v2',
			isPending: false,
			isFailed: false,
			blockchainData: null,
			isTasker: true,
			contractAddress: '0xcontract',
			parentEventId: 'parent-evt-1',
			taskerPubkey: 'tasker-pk',
			taskTitle: 'Test task',
			task: null,
			statusEventsByNewest: [],
			completionAttachments: [],
			completionText: '',
			effectiveEstimatedStartTime: now - 86400,
			effectiveEstimatedCompletionTime: now - 3600,
			...overrides
		};
	}

	describe('v2 computeDisplayStatusV2', () => {
		it('returns Funded (not InProgress) when blockchainData is null and start time has passed', () => {
			const rune = makeRune({
				blockchainData: null,
				effectiveEstimatedStartTime: now - 86400,
				effectiveEstimatedCompletionTime: now - 3600
			});
			const status = computeDisplayStatusV2(rune);
			// BUG: defaults to Funded, then applyFundedStartedInProgressDisplay converts to InProgress
			// FIX: should return Funded without applying the InProgress override when blockchainData is null
			expect(status).not.toBe(DisplayOnlyStatus.InProgress);
		});

		it('returns Funded when blockchainData is null and start time is in the future', () => {
			const rune = makeRune({
				blockchainData: null,
				effectiveEstimatedStartTime: now + 86400,
				effectiveEstimatedCompletionTime: now + 172800
			});
			const status = computeDisplayStatusV2(rune);
			expect(status).toBe(ContractStatus.Funded);
		});

		it('returns actual state when blockchainData is available', () => {
			const rune = makeRune({
				blockchainData: {
					tasker: 't',
					taskee: 'ta',
					amount: '1',
					estimatedStartTime: now - 86400,
					estimatedCompletionTime: now - 3600,
					timelockEnd: 0,
					createdAt: now - 172800,
					taskerFeeTier: 0,
					taskeeFeeTier: 0,
					state: ContractStatus.Completed,
					noShowMarked: false
				},
				effectiveEstimatedStartTime: now - 86400,
				effectiveEstimatedCompletionTime: now - 3600
			});
			const status = computeDisplayStatusV2(rune);
			expect(status).toBe(ContractStatus.Completed);
		});

		it('returns Failed when isFailed is true regardless of blockchainData', () => {
			const rune = makeRune({
				isFailed: true,
				blockchainData: null,
				effectiveEstimatedStartTime: now - 86400,
				effectiveEstimatedCompletionTime: now - 3600
			});
			const status = computeDisplayStatusV2(rune);
			expect(status).toBe(DisplayOnlyStatus.Failed);
		});

		it('returns Failed when isFailed is true even with blockchainData', () => {
			const rune = makeRune({
				isFailed: true,
				blockchainData: {
					tasker: 't',
					taskee: 'ta',
					amount: '1',
					estimatedStartTime: now - 86400,
					estimatedCompletionTime: now - 3600,
					timelockEnd: 0,
					createdAt: now - 172800,
					taskerFeeTier: 0,
					taskeeFeeTier: 0,
					state: ContractStatus.Funded,
					noShowMarked: false
				},
				effectiveEstimatedStartTime: now - 86400,
				effectiveEstimatedCompletionTime: now - 3600
			});
			const status = computeDisplayStatusV2(rune);
			expect(status).toBe(DisplayOnlyStatus.Failed);
		});

		it('returns InProgress when blockchainData is Funded and start time has passed', () => {
			const rune = makeRune({
				blockchainData: {
					tasker: 't',
					taskee: 'ta',
					amount: '1',
					estimatedStartTime: now - 86400,
					estimatedCompletionTime: now + 86400,
					timelockEnd: 0,
					createdAt: now - 172800,
					taskerFeeTier: 0,
					taskeeFeeTier: 0,
					state: ContractStatus.Funded,
					noShowMarked: false
				},
				effectiveEstimatedStartTime: now - 86400,
				effectiveEstimatedCompletionTime: now + 86400
			});
			const status = computeDisplayStatusV2(rune);
			expect(status).toBe(DisplayOnlyStatus.InProgress);
		});
	});

	describe('v1 computeDisplayStatusV1', () => {
		it('returns Funded (not InProgress) when blockchainData is null and start time has passed', () => {
			const rune = makeRune({
				version: 'v1',
				blockchainData: null,
				effectiveEstimatedStartTime: now - 86400,
				effectiveEstimatedCompletionTime: now - 3600
			});
			const status = computeDisplayStatusV1(rune);
			expect(status).not.toBe(DisplayOnlyStatus.InProgress);
		});
	});
});
