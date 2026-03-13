import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ethers } from 'ethers';

import type { NostrEventWithFollowup } from '$lib/types/bid';
import type { Event as NostrEvent } from 'nostr-tools';

const { mockGet, registerPendingContractByTxHash, updateTask, createEscrow, ensureEscrowReady } =
	vi.hoisted(() => ({
		mockGet: vi.fn(),
		registerPendingContractByTxHash: vi.fn(),
		updateTask: vi.fn(),
		createEscrow: vi.fn(),
		ensureEscrowReady: vi.fn()
	}));

vi.mock('$lib/stores/wallet.store', () => ({
	walletStore: {
		subscribe: vi.fn((callback) => {
			callback({
				rsk: {
					connected: true,
					balance: ethers.parseEther('10.0').toString(),
					wallet: null,
					provider: null
				},
				bsc: { connected: false, balance: null, wallet: null, provider: null }
			});
			return () => {};
		})
	}
}));

vi.mock('svelte/store', async () => {
	const actual = await vi.importActual<typeof import('svelte/store')>('svelte/store');
	return {
		...actual,
		get: (store: unknown) => {
			if (store && typeof store === 'object' && 'subscribe' in (store as Record<string, unknown>)) {
				return actual.get(store as Parameters<typeof actual.get>[0]);
			}
			return mockGet(store);
		}
	};
});

vi.mock('@bittasker/wallet-core', () => ({
	FEE_TIERS: {
		1: { percentage: 250, label: '2.5%' }
	},
	normalizeRskAddress: vi.fn((addr: string) => addr?.toLowerCase() ?? '')
}));

vi.mock('$lib/utils/escrow/v2/escrowEvents', () => ({
	registerPendingContractByTxHash,
	cleanupPendingContractByTxHash: vi.fn()
}));

vi.mock('$lib/nostr/task', () => ({
	updateTask
}));

vi.mock('$lib/utils/escrow/v2/escrow', () => ({
	escrow: {
		createEscrow,
		ensureEscrowReady
	}
}));

vi.mock('$lib/utils/wallet/contractErrorHandler', () => ({
	extractContractError: vi.fn((error) => ({
		userMessage: error instanceof Error ? error.message : 'Unknown error'
	}))
}));

import { TaskStatusEnum } from '$lib/utils/enums/task.enum';
import { acceptBidAndCreateEscrow } from '$lib/utils/escrow/v2/escrowBid';

describe('v2 escrowBid submit-time task updates', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockGet.mockReturnValue({
			rsk: {
				connected: true,
				balance: ethers.parseEther('10.0').toString(),
				contractConnected: true
			},
			bsc: { connected: false, balance: null }
		});
		ensureEscrowReady.mockResolvedValue({});
		createEscrow.mockResolvedValue({ hash: '0x123', status: 'pending' });
	});

	it('updates the task to IN_PROGRESS as soon as createEscrow returns a tx hash', async () => {
		const bid = {
			id: 'bid-1',
			content: {
				amount: 100,
				bidderId: 'npub1taskee',
				bidderWalletAddress: '0x2222222222222222222222222222222222222222',
				startDateTime: '2026-03-12T10:00',
				endDateTime: '2026-03-12T12:00'
			},
			pubkey: 'npub1taskee',
			created_at: Math.floor(Date.now() / 1000),
			kind: 1,
			sig: 'sig',
			tags: []
		} as unknown as NostrEventWithFollowup;

		const task = {
			id: 'task-1',
			content: JSON.stringify({
				id: 'task-1',
				title: 'Test task',
				description: 'Test description',
				dateRange: {
					start: new Date(Date.now() + 3600000).toISOString(),
					end: new Date(Date.now() + 7200000).toISOString()
				}
			}),
			pubkey: 'npub1tasker',
			created_at: Math.floor(Date.now() / 1000),
			kind: 1,
			sig: 'sig',
			tags: []
		} as unknown as NostrEvent;

		const result = await acceptBidAndCreateEscrow(bid, task, 50000);

		expect(result.success).toBe(true);
		expect(registerPendingContractByTxHash).toHaveBeenCalled();
		expect(updateTask).toHaveBeenCalledWith('task-1', {
			status: TaskStatusEnum.IN_PROGRESS
		});
	});
});
