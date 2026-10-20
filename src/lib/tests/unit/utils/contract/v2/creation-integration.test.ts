import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ethers } from 'ethers';
import { MINIMUM_START_BUFFER_SECONDS } from '$lib/utils/contract/v2/types';
import { TaskStatusEnum } from '$lib/utils/enums/task.enum';

// ── mocks ──────────────────────────────────────────────────────────

const mockPublishReplaceable = vi.fn(() => Promise.resolve());
const mockPublish = vi.fn(() => Promise.resolve());
const mockTaskContent = {
	title: 'Test Task',
	description: 'A test task',
	taskType: 'remote',
	dateRange: { start: '', end: '' },
	budget: { amount: 1000, currency: 'USD' },
	skills: [],
	categories: []
};

function makeMockTask(overrides: Record<string, unknown> = {}) {
	return {
		id: 'task-123',
		author: { pubkey: 'tasker-pubkey' },
		tagValue: vi.fn((tag: string) => (tag === 'd' ? 'task-123' : undefined)),
		taskContent: { ...mockTaskContent, ...overrides },
		content: JSON.stringify({ ...mockTaskContent, ...overrides }),
		status: TaskStatusEnum.BID_ACCEPTED,
		acceptedBid: undefined as string | undefined,
		publishReplaceable: mockPublishReplaceable,
		ndk: {},
		tags: [] as string[][],
		removeTag: vi.fn(),
		push: Array.prototype.push
	};
}

function successReceipt(paymentId = 42) {
	const contractAddress = '0x10169472537Cc354D9E24Aebe221aF15827e6378';
	const iface = new ethers.Interface([
		'event PaymentContractCreated(uint32 indexed paymentContractId)'
	]);
	const eventFragment = iface.getEvent('PaymentContractCreated')!;
	const encodedData = iface.encodeEventLog(eventFragment, [paymentId]);
	return {
		status: 1,
		logs: [
			{
				address: contractAddress,
				topics: encodedData.topics as string[],
				data: encodedData.data
			}
		]
	};
}

function makeMockBid() {
	return {
		id: 'bid-456',
		author: {
			pubkey: 'taskee-pubkey',
			npub: 'npub1taskee'
		},
		bidContent: {
			amount: 100000,
			bidderWalletAddress: '0x64bF4b77D21e1849C42165F8558d681857933994',
			startDateTime: Math.floor(Date.now() / 1000) + 30, // 30s from now — within buffer
			endDateTime: Math.floor(Date.now() / 1000) + 7200,
			cancellationFee: 0,
			upfrontDeposit: 0
		}
	};
}

const mockTx = {
	hash: '0xabc123',
	wait: vi.fn()
};

const mockContractEvent = {
	publish: mockPublish,
	publishReplaceable: vi.fn(() => Promise.resolve()),
	author: null,
	dTag: '',
	taskId: '',
	taskeePubkey: '',
	network: '',
	version: '',
	status: '',
	messageType: '',
	taskTitle: '',
	taskDescription: '',
	amount: '',
	currency: '',
	estimatedStartTime: 0,
	estimatedCompletionTime: 0,
	transactionHash: '',
	contractAddress: '',
	ndk: {},
	tags: [] as string[][],
	id: 'event-id-789'
};

vi.mock('$lib/nostr/ndk', () => ({
	ndk: {
		signer: {
			user: vi.fn(() => Promise.resolve({ pubkey: 'tasker-pubkey' }))
		},
		subscribe: vi.fn(),
		fetchEvents: vi.fn(() => Promise.resolve(new Set()))
	}
}));

vi.mock('$lib/nostr/events/contract', () => {
	class MockNDKPaymentContract {
		publish = mockPublish;
		publishReplaceable = vi.fn(() => Promise.resolve());
		author = null;
		dTag = '';
		taskId = '';
		taskeePubkey = '';
		network = '';
		version = '';
		status = '';
		messageType = '';
		taskTitle = '';
		taskDescription = '';
		amount = '';
		currency = '';
		estimatedStartTime = 0;
		estimatedCompletionTime = 0;
		transactionHash = '';
		contractAddress = '';
		ndk = {};
		tags: string[][] = [];
		id = 'event-id-789';

		constructor(_ndk) {}

		static from = vi.fn(() =>
			Promise.resolve({
				...mockContractEvent,
				publishReplaceable: vi.fn(() => Promise.resolve())
			})
		);
	}
	return { NDKPaymentContract: MockNDKPaymentContract };
});

vi.mock('$lib/nostr/events/task', () => ({
	NDKTask: vi.fn()
}));

vi.mock('$lib/utils/contract/v2/blockchainWrites', () => ({
	createPaymentContract: vi.fn(() =>
		Promise.resolve({ tx: mockTx, estimatedCostFormatted: '0.001' })
	),
	estimateWrite: vi.fn(() =>
		Promise.resolve({
			success: true,
			estimatedGas: 100000n,
			estimatedCostWei: 1000000n,
			estimatedCostFormatted: '0.001'
		})
	)
}));

vi.mock('$lib/utils/contract/v2/contractAddress', () => ({
	getSecurePaymentContractAddress: vi.fn(() => '0x10169472537Cc354D9E24Aebe221aF15827e6378')
}));

vi.mock('$lib/utils/location/sendLocation', () => ({
	sendLocationsToTaskee: vi.fn(() => Promise.resolve())
}));

vi.mock('$lib/api/services/push-notification.service', () => ({
	pushNotificationService: { sendNotificationToNpubs: vi.fn(() => Promise.resolve()) }
}));

const mockSendBidStatusUpdate = vi.fn(() => Promise.resolve(true));
vi.mock('$lib/utils/nostr-bid', () => ({
	sendBidStatusUpdate: (...args: unknown[]) => mockSendBidStatusUpdate(...args),
	clearBidCache: vi.fn()
}));

vi.mock('@bittasker/wallet-core', () => ({
	FEE_TIERS: { 1: { percentage: 250 } },
	normalizeRskAddress: (addr: string) => addr
}));

// ── tests ──────────────────────────────────────────────────────────

import { createContract } from '$lib/utils/contract/v2/creation';
import { NDKPaymentContract } from '$lib/nostr/events/contract';
import { BidStatusEnum } from '$lib/utils/enums/bid.enum';

describe('Contract conflict fix — out-of-box verification', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.useFakeTimers();
		vi.setSystemTime(1_700_000_000_000);
		mockTx.wait.mockReset();
		mockPublishReplaceable.mockClear();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	describe('BUG 1: Task dateRange.start must be updated when time is adjusted', () => {
		it('publishTaskAcceptedBid should update task.dateRange.start when wasTimeAdjusted=true', async () => {
			const now = Math.floor(Date.now() / 1000);
			const task = makeMockTask({
				dateRange: {
					start: new Date((now + 30) * 1000).toISOString(),
					end: new Date((now + 7200) * 1000).toISOString()
				}
			});
			const bid = makeMockBid();

			// startDateTime is 30s from now → within buffer → will be adjusted to now + 180
			bid.bidContent.startDateTime = now + 30;
			bid.bidContent.endDateTime = now + 7200;

			mockTx.wait.mockResolvedValue({
				status: 1,
				logs: [
					{
						address: '0x10169472537Cc354D9E24Aebe221aF15827e6378',
						topics: [],
						data: '0x'
					}
				]
			});

			const result = await createContract(bid, task, 100000);

			if (!result.success) {
				throw new Error(`createContract failed: ${result.error}`);
			}

			await result.afterBroadcast;
			expect(task.status).not.toBe(TaskStatusEnum.IN_PROGRESS);
			await result.afterConfirmed(successReceipt());

			// Parse the task content that was stringified into content
			const publishedContent = JSON.parse(task.content);

			// BUG: The task's dateRange.start should reflect the adjusted start time
			// Expected: dateRange.start === new Date((now + 180) * 1000).toISOString()
			const expectedAdjustedStart = new Date(
				(now + MINIMUM_START_BUFFER_SECONDS) * 1000
			).toISOString();

			// This test EXPOSES the bug — the task dateRange.start is NOT updated
			// If this test fails with "expected !== received", the bug is confirmed:
			// the task's start time is never synced with the adjusted contract start time
			expect(publishedContent.dateRange?.start).toBe(expectedAdjustedStart);
		});

		it('does NOT touch dateRange.end when adjusting start time', async () => {
			const now = Math.floor(Date.now() / 1000);
			const originalEnd = new Date((now + 7200) * 1000).toISOString();
			const task = makeMockTask({
				dateRange: {
					start: new Date((now + 30) * 1000).toISOString(),
					end: originalEnd
				}
			});
			const bid = makeMockBid();
			bid.bidContent.startDateTime = now + 30;
			bid.bidContent.endDateTime = now + 7200;

			mockTx.wait.mockResolvedValue({
				status: 1,
				logs: [
					{
						address: '0x10169472537Cc354D9E24Aebe221aF15827e6378',
						topics: [],
						data: '0x'
					}
				]
			});

			const result = await createContract(bid, task, 100000);
			if (!result.success) throw new Error(result.error);
			await result.afterConfirmed(successReceipt());

			const publishedContent = JSON.parse(task.content);
			// end should remain unchanged
			expect(publishedContent.dateRange?.end).toBe(originalEnd);
		});
	});

	describe('BUG 2 & 3: afterFailed must revert task status to BID_ACCEPTED', () => {
		it('afterFailed republishes Kind 30006 with status=failed AND reverts task to BID_ACCEPTED', async () => {
			const now = Math.floor(Date.now() / 1000);
			const task = makeMockTask();
			const bid = makeMockBid();
			bid.bidContent.startDateTime = now + 600; // beyond buffer
			bid.bidContent.endDateTime = now + 7200;

			const result = await createContract(bid, task, 100000);
			if (!result.success) throw new Error(result.error);

			await result.afterBroadcast;
			expect(task.status).toBe(TaskStatusEnum.BID_ACCEPTED);

			await result.afterConfirmed(successReceipt());
			expect(task.status).toBe(TaskStatusEnum.IN_PROGRESS);

			await result.afterFailed('0xabc123');
			expect(task.status).toBe(TaskStatusEnum.BID_ACCEPTED);
		});

		it('afterFailed fires NDKPaymentContract.from() to republish contract event as failed', async () => {
			const now = Math.floor(Date.now() / 1000);
			const task = makeMockTask();
			const bid = makeMockBid();
			bid.bidContent.startDateTime = now + 600;
			bid.bidContent.endDateTime = now + 7200;

			const result = await createContract(bid, task, 100000);
			if (!result.success) throw new Error(result.error);
			await result.afterConfirmed(successReceipt());

			await result.afterFailed('0xabc123');

			// Verify NDKPaymentContract.from was called (to recreate + republish with 'failed')
			expect(NDKPaymentContract.from).toHaveBeenCalled();
		});
	});

	describe('BUG 4: afterConfirmed must throw on receipt.status === 0', () => {
		it('afterConfirmed throws when receipt.status is 0 (reverted)', async () => {
			const now = Math.floor(Date.now() / 1000);
			const task = makeMockTask();
			const bid = makeMockBid();
			bid.bidContent.startDateTime = now + 600;
			bid.bidContent.endDateTime = now + 7200;

			const result = await createContract(bid, task, 100000);
			if (!result.success) throw new Error(result.error);

			const revertedReceipt = {
				status: 0,
				logs: []
			};

			await expect(result.afterConfirmed(revertedReceipt)).rejects.toThrow(
				/Transaction reverted on-chain/
			);
		});

		it('afterConfirmed succeeds when receipt.status is 1', async () => {
			const now = Math.floor(Date.now() / 1000);
			const task = makeMockTask();
			const bid = makeMockBid();
			bid.bidContent.startDateTime = now + 600;
			bid.bidContent.endDateTime = now + 7200;

			const result = await createContract(bid, task, 100000);
			if (!result.success) throw new Error(result.error);

			// Build a proper receipt: paymentContractId is indexed (uint32) → goes into topics[1]
			const contractAddress = '0x10169472537Cc354D9E24Aebe221aF15827e6378';
			const iface = new ethers.Interface([
				'event PaymentContractCreated(uint32 indexed paymentContractId)'
			]);
			const eventFragment = iface.getEvent('PaymentContractCreated')!;
			const encodedData = iface.encodeEventLog(eventFragment, [42]);

			const successReceipt = {
				status: 1,
				logs: [
					{
						address: contractAddress,
						topics: encodedData.topics as string[],
						data: encodedData.data
					}
				]
			};

			const { paymentId } = await result.afterConfirmed(successReceipt);
			expect(paymentId).toBe(42);
		});
	});

	describe('End-to-end: full failure flow cleanup', () => {
		it('when tx.receipt fails, afterFailed should clean up both contract and task events', async () => {
			const now = Math.floor(Date.now() / 1000);
			const task = makeMockTask();
			const bid = makeMockBid();
			bid.bidContent.startDateTime = now + 600;
			bid.bidContent.endDateTime = now + 7200;

			const result = await createContract(bid, task, 100000);
			if (!result.success) throw new Error(result.error);

			await result.afterBroadcast;
			expect(task.status).toBe(TaskStatusEnum.BID_ACCEPTED);

			const revertedReceipt = { status: 0, logs: [] };
			await expect(result.afterConfirmed(revertedReceipt)).rejects.toThrow(
				/Transaction reverted on-chain/
			);
			expect(task.status).toBe(TaskStatusEnum.BID_ACCEPTED);

			await result.afterFailed(result.transactionHash);
			expect(task.status).toBe(TaskStatusEnum.BID_ACCEPTED);
		});
	});

	describe('Edge case: early return paths do not leave dangling state', () => {
		it('returns error when taskee pubkey is missing — no side effects', async () => {
			const task = makeMockTask();
			const bid = {
				...makeMockBid(),
				author: { pubkey: undefined, npub: undefined }
			};

			const result = await createContract(bid, task, 100000);
			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error).toContain('Taskee pubkey');
			}

			// Task should not have been modified
			expect(task.status).toBe(TaskStatusEnum.BID_ACCEPTED);
			expect(mockPublishReplaceable).not.toHaveBeenCalled();
		});

		it('returns error when time adjustment pushes start past completion — no side effects', async () => {
			const now = Math.floor(Date.now() / 1000);
			const task = makeMockTask();
			const bid = makeMockBid();
			// Start is within buffer, completion is only 60s away — buffer pushes start past completion
			bid.bidContent.startDateTime = now + 30;
			bid.bidContent.endDateTime = now + 60;

			const result = await createContract(bid, task, 100000);
			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error).toContain('Completion time must be after start time');
			}

			expect(task.status).toBe(TaskStatusEnum.BID_ACCEPTED);
		});
	});

	describe('BUG: bid status event (Kind 30008) must be broadcast when bid is accepted', () => {
		it('calls sendBidStatusUpdate with ACCEPTED status after confirmation', async () => {
			const now = Math.floor(Date.now() / 1000);
			const task = makeMockTask();
			const bid = makeMockBid();
			bid.bidContent.startDateTime = now + 600;
			bid.bidContent.endDateTime = now + 7200;

			mockSendBidStatusUpdate.mockClear();
			mockSendBidStatusUpdate.mockResolvedValue(true);

			const result = await createContract(bid, task, 100000);
			if (!result.success) throw new Error(result.error);

			await result.afterBroadcast;
			expect(mockSendBidStatusUpdate).not.toHaveBeenCalled();
			await result.afterConfirmed(successReceipt());

			expect(mockSendBidStatusUpdate).toHaveBeenCalledWith(
				'bid-456',
				'task-123',
				'taskee-pubkey',
				BidStatusEnum.ACCEPTED,
				undefined,
				undefined,
				'0xabc123'
			);
		});

		it('afterConfirmed still returns when sendBidStatusUpdate throws', async () => {
			const now = Math.floor(Date.now() / 1000);
			const task = makeMockTask();
			const bid = makeMockBid();
			bid.bidContent.startDateTime = now + 600;
			bid.bidContent.endDateTime = now + 7200;

			mockSendBidStatusUpdate.mockRejectedValue(new Error('Relay unavailable'));

			const result = await createContract(bid, task, 100000);
			if (!result.success) throw new Error(result.error);

			const confirmed = await result.afterConfirmed(successReceipt());
			expect(confirmed.paymentId).toBe(42);
			expect(mockSendBidStatusUpdate).toHaveBeenCalled();
		});
	});
});
