import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ethers } from 'ethers';

vi.mock('$lib/utils/debug', () => ({
	createDebug: () => ({
		log: vi.fn(),
		warn: vi.fn(),
		error: vi.fn()
	})
}));

vi.mock('$lib/nostr/ndk', () => ({
	ndk: {
		activeUser: { pubkey: 'tasker-pk' },
		signer: { user: vi.fn().mockResolvedValue({ pubkey: 'tasker-pk' }) }
	}
}));

vi.mock('$lib/utils/contract/v2/blockchainWrites', () => ({
	completeTask: vi.fn().mockResolvedValue({ tx: { hash: '0xtx' } }),
	acceptTask: vi.fn().mockResolvedValue({ tx: { hash: '0xtx' } }),
	refundTasker: vi.fn().mockResolvedValue({ tx: { hash: '0xtx' } }),
	cancelPaymentContract: vi.fn().mockResolvedValue({ tx: { hash: '0xtx' } }),
	markNoShow: vi.fn().mockResolvedValue({ tx: { hash: '0xtx' } }),
	markWorkInProgress: vi.fn().mockResolvedValue({ tx: { hash: '0xtx' } }),
	claimNoShowRefund: vi.fn().mockResolvedValue({ tx: { hash: '0xtx' } }),
	disputeTask: vi.fn().mockResolvedValue({ tx: { hash: '0xtx' } }),
	proposeResolution: vi.fn().mockResolvedValue({ tx: { hash: '0xtx' } }),
	acceptProposal: vi.fn().mockResolvedValue({ tx: { hash: '0xtx' } }),
	resolveAfterTimelock: vi.fn().mockResolvedValue({ tx: { hash: '0xtx' } })
}));

vi.mock('$lib/utils/contract/v2/creation', () => ({
	publishTaskCompletedForEscrow: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('$lib/utils/contract', () => ({
	getProvider: vi.fn().mockResolvedValue({
		waitForTransaction: vi.fn().mockResolvedValue({ status: 1, blockNumber: 2 }),
		getTransactionReceipt: vi.fn().mockResolvedValue({ status: 1, blockNumber: 2 })
	})
}));

vi.mock('$lib/utils/contract/v2/loadPaymentContractDetailsV2', () => ({
	loadPaymentContractDetailsV2: vi.fn().mockResolvedValue({
		state: 'InDispute',
		amount: '0.01',
		timelockEnd: Math.floor(Date.now() / 1000) + 86400,
		estimatedCompletionTime: Math.floor(Date.now() / 1000) + 3600
	})
}));

vi.mock('$lib/utils/contract/v2/disputeProjectionFromStatus', () => ({
	buildDisputeProjectionForPayment: vi.fn().mockReturnValue({
		latestProposal: null,
		proposalCount: 0
	}),
	nextProposeResolutionProposalNumberFromStatusEvents: vi.fn().mockReturnValue(1)
}));

vi.mock('$lib/utils/contract/lifecycle/v2Preflight', () => ({
	runV2Preflight: vi.fn().mockResolvedValue(undefined)
}));

const mockEnrich = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock('$lib/api/services/notificationCenter.service', () => ({
	notificationCenterService: {
		enrich: (...args: unknown[]) => mockEnrich(...args)
	}
}));

import { ContractStatus } from '$lib/utils/contract/types';
import type { PaymentContractRuneLike } from '$lib/utils/contract/lifecycle/types';
import type { SecurePaymentLegacy } from '$lib/utils/contract/types';
import type { NDKPaymentContract } from '$lib/nostr/events/contract';
import type { NDKContractStatus } from '$lib/nostr/events/contractStatus';
import type { NDKTask } from '$lib/nostr/events/task';

function makeRune(overrides: Partial<PaymentContractRuneLike> = {}): PaymentContractRuneLike {
	const now = Math.floor(Date.now() / 1000);
	return {
		contract: {
			taskeePubkey: 'taskee-pk',
			contractAddress: '0xcontract'
		} as unknown as NDKPaymentContract,
		paymentId: '42',
		version: 'v2',
		isPending: false,
		isFailed: false,
		blockchainData: {
			state: ContractStatus.Funded,
			amount: '0.01',
			timelockEnd: now + 7 * 86400,
			noShowMarked: false,
			createdAt: now - 3600,
			estimatedStartTime: now + 1800,
			estimatedCompletionTime: now + 86400,
			taskerFeeTier: 1,
			taskeeFeeTier: 1
		} as SecurePaymentLegacy,
		isTasker: true,
		contractAddress: '0xcontract',
		parentEventId: 'parent-evt-1',
		taskerPubkey: 'tasker-pk',
		taskTitle: 'Build landing page',
		task: null as unknown as NDKTask,
		statusEventsByNewest: [] as NDKContractStatus[],
		completionAttachments: [],
		completionText: '',
		effectiveEstimatedStartTime: now + 1800,
		effectiveEstimatedCompletionTime: now + 86400,
		...overrides
	};
}

describe('buildEnrichment via v2 lifecycle', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('task_completed enrichment includes taskTitle and amount', () => {
		it('includes taskTitle from rune', async () => {
			const { markTaskCompleteV2 } = await import('$lib/utils/contract/lifecycle/v2');
			const rune = makeRune();

			await markTaskCompleteV2(rune);

			expect(mockEnrich).toHaveBeenCalledWith(
				expect.objectContaining({
					action: 'task_completed',
					escrowId: '42',
					taskTitle: 'Build landing page'
				})
			);
		});

		it('includes amount from blockchainData', async () => {
			const { markTaskCompleteV2 } = await import('$lib/utils/contract/lifecycle/v2');
			const rune = makeRune();

			await markTaskCompleteV2(rune);

			expect(mockEnrich).toHaveBeenCalledWith(
				expect.objectContaining({
					amount: '0.01'
				})
			);
		});

		it('includes timelockDuration as remaining seconds', async () => {
			const { markTaskCompleteV2 } = await import('$lib/utils/contract/lifecycle/v2');
			const rune = makeRune();

			await markTaskCompleteV2(rune);

			const call = mockEnrich.mock.calls[0][0];
			expect(call.timelockDuration).toBeGreaterThan(0);
			expect(call.timelockDuration).toBeLessThanOrEqual(7 * 86400);
		});
	});

	describe('work_started enrichment includes taskTitle and amount', () => {
		it('includes taskTitle and estimatedCompletionTime', async () => {
			const { markWorkInProgressV2 } = await import('$lib/utils/contract/lifecycle/v2');
			const rune = makeRune({
				isTasker: false,
				blockchainData: {
					state: ContractStatus.NoShow,
					amount: '0.05',
					timelockEnd: Math.floor(Date.now() / 1000) + 86400,
					noShowMarked: true,
					createdAt: Math.floor(Date.now() / 1000) - 3600,
					estimatedStartTime: 0,
					estimatedCompletionTime: Math.floor(Date.now() / 1000) + 3 * 86400,
					taskerFeeTier: 1,
					taskeeFeeTier: 1
				} as SecurePaymentLegacy
			});

			await markWorkInProgressV2(rune);

			expect(mockEnrich).toHaveBeenCalledWith(
				expect.objectContaining({
					action: 'work_started',
					escrowId: '42',
					taskTitle: 'Build landing page',
					amount: '0.05',
					estimatedCompletionTime: expect.any(Number)
				})
			);
		});
	});

	describe('dispute_raised enrichment includes taskTitle and amount', () => {
		it('includes taskTitle from rune', async () => {
			const { disputeTaskV2 } = await import('$lib/utils/contract/lifecycle/v2');
			const rune = makeRune({
				blockchainData: {
					state: ContractStatus.WorkInProgress,
					amount: '0.02',
					timelockEnd: Math.floor(Date.now() / 1000) + 2 * 86400,
					noShowMarked: false,
					createdAt: Math.floor(Date.now() / 1000) - 3600,
					estimatedStartTime: 0,
					estimatedCompletionTime: 0,
					taskerFeeTier: 1,
					taskeeFeeTier: 1
				} as SecurePaymentLegacy
			});

			await disputeTaskV2(rune);

			expect(mockEnrich).toHaveBeenCalledWith(
				expect.objectContaining({
					action: 'dispute_raised',
					escrowId: '42',
					taskTitle: 'Build landing page',
					amount: '0.02'
				})
			);
		});
	});

	describe('no_show_marked enrichment includes taskTitle and amount', () => {
		it('includes taskTitle from rune', async () => {
			const { markNoShowV2 } = await import('$lib/utils/contract/lifecycle/v2');
			const rune = makeRune({
				blockchainData: {
					state: ContractStatus.Funded,
					amount: '0.03',
					timelockEnd: Math.floor(Date.now() / 1000) + 86400,
					noShowMarked: false,
					createdAt: Math.floor(Date.now() / 1000) - 3600,
					estimatedStartTime: Math.floor(Date.now() / 1000) - 100,
					estimatedCompletionTime: Math.floor(Date.now() / 1000) + 3600,
					taskerFeeTier: 1,
					taskeeFeeTier: 1
				} as SecurePaymentLegacy
			});

			await markNoShowV2(rune);

			expect(mockEnrich).toHaveBeenCalledWith(
				expect.objectContaining({
					action: 'no_show_marked',
					escrowId: '42',
					taskTitle: 'Build landing page',
					amount: '0.03',
					responseDeadline: expect.any(Number)
				})
			);
		});
	});

	describe('acceptTask (funds_released) enrichment', () => {
		it('fires enrichment with action funds_released', async () => {
			const { acceptTaskV2 } = await import('$lib/utils/contract/lifecycle/v2');
			const rune = makeRune({
				blockchainData: {
					state: ContractStatus.Completed,
					amount: '0.01',
					timelockEnd: 0,
					noShowMarked: false,
					createdAt: Math.floor(Date.now() / 1000) - 3600,
					estimatedStartTime: 0,
					estimatedCompletionTime: 0,
					taskerFeeTier: 1,
					taskeeFeeTier: 1
				} as SecurePaymentLegacy,
				isTasker: true
			});

			await acceptTaskV2(rune);

			expect(mockEnrich).toHaveBeenCalledWith(
				expect.objectContaining({
					action: 'funds_released',
					escrowId: '42',
					taskTitle: 'Build landing page',
					amount: '0.01'
				})
			);
		});
	});

	describe('refundTasker enrichment', () => {
		it('fires enrichment with action refunded', async () => {
			const { refundTaskerV2 } = await import('$lib/utils/contract/lifecycle/v2');
			const rune = makeRune({
				blockchainData: {
					state: ContractStatus.Funded,
					amount: '0.01',
					timelockEnd: 0,
					noShowMarked: false,
					createdAt: Math.floor(Date.now() / 1000) - 3600,
					estimatedStartTime: 0,
					estimatedCompletionTime: 0,
					taskerFeeTier: 1,
					taskeeFeeTier: 1
				} as SecurePaymentLegacy,
				isTasker: false
			});

			await refundTaskerV2(rune);

			expect(mockEnrich).toHaveBeenCalledWith(
				expect.objectContaining({
					action: 'refunded',
					escrowId: '42',
					taskTitle: 'Build landing page',
					amount: '0.01'
				})
			);
		});
	});

	describe('cancelPaymentContract enrichment', () => {
		it('fires enrichment with action cancelled', async () => {
			const { cancelPaymentContractV2 } = await import('$lib/utils/contract/lifecycle/v2');
			const rune = makeRune({
				blockchainData: {
					state: ContractStatus.Funded,
					amount: '0.01',
					timelockEnd: 0,
					noShowMarked: false,
					createdAt: Math.floor(Date.now() / 1000) - 3600,
					estimatedStartTime: 0,
					estimatedCompletionTime: 0,
					taskerFeeTier: 1,
					taskeeFeeTier: 1
				} as SecurePaymentLegacy
			});

			await cancelPaymentContractV2(rune);

			expect(mockEnrich).toHaveBeenCalledWith(
				expect.objectContaining({
					action: 'cancelled',
					escrowId: '42',
					taskTitle: 'Build landing page',
					amount: '0.01'
				})
			);
		});
	});

	describe('claimNoShowRefund enrichment', () => {
		it('fires enrichment with action no_show_refund_claimed', async () => {
			const { claimNoShowRefundV2 } = await import('$lib/utils/contract/lifecycle/v2');
			const rune = makeRune({
				blockchainData: {
					state: ContractStatus.NoShow,
					amount: '0.01',
					timelockEnd: Math.floor(Date.now() / 1000) - 100,
					noShowMarked: true,
					createdAt: Math.floor(Date.now() / 1000) - 3600,
					estimatedStartTime: 0,
					estimatedCompletionTime: 0,
					taskerFeeTier: 1,
					taskeeFeeTier: 1
				} as SecurePaymentLegacy
			});

			await claimNoShowRefundV2(rune);

			expect(mockEnrich).toHaveBeenCalledWith(
				expect.objectContaining({
					action: 'no_show_refund_claimed',
					escrowId: '42',
					taskTitle: 'Build landing page',
					amount: '0.01'
				})
			);
		});
	});

	describe('acceptProposal enrichment', () => {
		it('fires enrichment with action dispute_resolved', async () => {
			const { acceptProposalV2 } = await import('$lib/utils/contract/lifecycle/v2');
			const rune = makeRune({
				blockchainData: {
					state: ContractStatus.InDispute,
					amount: '0.01',
					timelockEnd: Math.floor(Date.now() / 1000) + 86400,
					noShowMarked: false,
					createdAt: Math.floor(Date.now() / 1000) - 3600,
					estimatedStartTime: 0,
					estimatedCompletionTime: 0,
					taskerFeeTier: 1,
					taskeeFeeTier: 1
				} as SecurePaymentLegacy
			});

			await acceptProposalV2(rune);

			expect(mockEnrich).toHaveBeenCalledWith(
				expect.objectContaining({
					action: 'dispute_resolved',
					escrowId: '42',
					taskTitle: 'Build landing page',
					amount: '0.01'
				})
			);
		});
	});

	describe('proposeResolution enrichment', () => {
		it('fires enrichment with action resolution_proposed', async () => {
			const { proposeResolutionV2 } = await import('$lib/utils/contract/lifecycle/v2');
			const rune = makeRune({
				blockchainData: {
					state: ContractStatus.InDispute,
					amount: '0.01',
					timelockEnd: Math.floor(Date.now() / 1000) + 86400,
					noShowMarked: false,
					createdAt: Math.floor(Date.now() / 1000) - 3600,
					estimatedStartTime: 0,
					estimatedCompletionTime: 0,
					taskerFeeTier: 1,
					taskeeFeeTier: 1
				} as SecurePaymentLegacy
			});

			const taskeeAmountWei = ethers.parseEther('0.003');
			await proposeResolutionV2(rune, taskeeAmountWei);

			expect(mockEnrich).toHaveBeenCalledWith(
				expect.objectContaining({
					action: 'resolution_proposed',
					escrowId: '42',
					taskTitle: 'Build landing page',
					amount: '0.01'
				})
			);
		});
	});

	describe('resolveAfterTimelock enrichment', () => {
		it('fires enrichment with action timelock_resolved', async () => {
			const { resolveAfterTimelockV2 } = await import('$lib/utils/contract/lifecycle/v2');
			const rune = makeRune({
				blockchainData: {
					state: ContractStatus.InDispute,
					amount: '0.01',
					timelockEnd: Math.floor(Date.now() / 1000) - 100,
					noShowMarked: false,
					createdAt: Math.floor(Date.now() / 1000) - 3600,
					estimatedStartTime: 0,
					estimatedCompletionTime: 0,
					taskerFeeTier: 1,
					taskeeFeeTier: 1
				} as SecurePaymentLegacy,
				isTasker: true
			});

			await resolveAfterTimelockV2(rune);

			expect(mockEnrich).toHaveBeenCalledWith(
				expect.objectContaining({
					action: 'timelock_resolved',
					escrowId: '42',
					taskTitle: 'Build landing page',
					amount: '0.01'
				})
			);
		});
	});

	describe('enrichment is skipped when blockchainData is null', () => {
		it('does not call enrich for task_completed when blockchainData is null', async () => {
			const { markTaskCompleteV2 } = await import('$lib/utils/contract/lifecycle/v2');
			const rune = makeRune({ blockchainData: null });

			await markTaskCompleteV2(rune);

			expect(mockEnrich).not.toHaveBeenCalled();
		});
	});

	describe('enrichment uses rune taskTitle fallback', () => {
		it('uses fallback Task when contract has no taskTitle', async () => {
			const { markTaskCompleteV2 } = await import('$lib/utils/contract/lifecycle/v2');
			const rune = makeRune({ taskTitle: 'Task' });

			await markTaskCompleteV2(rune);

			expect(mockEnrich).toHaveBeenCalledWith(
				expect.objectContaining({
					taskTitle: 'Task'
				})
			);
		});
	});
});
