import { beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import type { ContractWithEvents } from '$lib/types/contract';
import { EscrowStatus } from '$lib/utils/escrow/v1/escrow.enum';

const mockGetContracts = vi.fn();
const mockHandleStatusEvent = vi.fn();
const mockHandleContractEvent = vi.fn();
const mockGetNpub = vi.fn();

let subscribeCallCount = 0;
const closeIncoming = vi.fn();
const closeOutgoing = vi.fn();
const closeContract = vi.fn();

const mockSubscribe = vi.fn(() => {
	subscribeCallCount += 1;
	if (subscribeCallCount === 1) {
		return { close: closeIncoming };
	}
	if (subscribeCallCount === 2) {
		throw new Error('subscribe failed');
	}
	if (subscribeCallCount === 3) {
		return { close: closeContract };
	}
	return { close: closeOutgoing };
});

vi.mock('$lib/utils/escrow', () => ({
	escrow: {
		contractOps: {
			getContracts: (...args: unknown[]) => mockGetContracts(...args),
			handleStatusEvent: (...args: unknown[]) => mockHandleStatusEvent(...args),
			handleContractEvent: (...args: unknown[]) => mockHandleContractEvent(...args)
		}
	}
}));

vi.mock('$lib/utils/nostrKeys', () => ({
	getNpub: (...args: unknown[]) => mockGetNpub(...args)
}));

vi.mock('nostr-tools', () => ({
	nip19: {
		decode: vi.fn(() => ({ data: 'hexpub' }))
	}
}));

vi.mock('$lib/stores/app.store', async () => {
	const { writable } = await import('svelte/store');
	return {
		appStore: writable({
			pool: {
				subscribe: (...args: unknown[]) => mockSubscribe(...args)
			},
			relays: ['wss://relay.example.com']
		})
	};
});

import { contractStore } from '$lib/stores/contract.store';

function createContract(escrowId: string, createdAt = 1000): ContractWithEvents {
	return {
		contractEvent: {
			id: `event-${escrowId}`,
			created_at: createdAt,
			pubkey: 'pubkey',
			kind: 1,
			content: {
				escrowId,
				taskId: `task-${escrowId}`,
				taskTitle: 'Task',
				taskDescription: 'Desc',
				freelancerPubkey: 'freelancer',
				clientPubkey: 'client',
				amount: '0.1',
				currency: 'RBTC',
				status: EscrowStatus.Funded,
				estimatedStartTime: 0,
				estimatedCompletionTime: 0,
				type: 'contract'
			},
			tags: [],
			sig: ''
		} as ContractWithEvents['contractEvent'],
		statusEvents: [],
		isClient: true,
		blockchainStatus: EscrowStatus.Funded,
		escrowData: {
			id: escrowId,
			client: 'client',
			freelancer: 'freelancer',
			baseAmount: '0.1',
			clientFee: '0',
			freelancerFee: '0',
			totalAmount: '0.1',
			status: EscrowStatus.Funded,
			estimatedStartTime: 0,
			estimatedCompletionTime: 0,
			completionTime: 0,
			timelockExpiry: 0,
			clientFeeTier: 1,
			freelancerFeeTier: 1,
			createdAt: Date.now(),
			lastUpdated: Date.now()
		},
		status: EscrowStatus.Funded,
		isPending: false,
		permissions: {
			canComplete: false,
			canAccept: false,
			canDispute: false,
			canPropose: false,
			canAcceptProposal: false,
			canCancel: false,
			canResolveTimelock: false,
			canDelete: false
		},
		disputeProposal: null,
		completionAttachments: null
	};
}

describe('contract.store', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		subscribeCallCount = 0;
		mockGetNpub.mockResolvedValue('npub1abc');
		contractStore.reset();
	});

	it('rolls back partial status subscription setup when second subscription fails', async () => {
		await contractStore.subscribeToStatusUpdates();
		expect(closeIncoming).toHaveBeenCalledTimes(1);
		expect(closeOutgoing).not.toHaveBeenCalled();
	});

	it('stops infinite pagination loop when duplicate-only pages are repeatedly fetched', async () => {
		const existing = createContract('escrow-1', 500);
		contractStore.set({
			contract: null,
			contracts: [existing],
			contractsMap: new Map([[existing.escrowData.id, 0]]),
			isLoading: false,
			error: null,
			isDrawerOpen: false,
			isResolutionFormOpen: false,
			hasMore: true,
			oldestTimestamp: 500,
			isSubscribed: false,
			isLoadingMore: false
		});

		const duplicateBatch = [createContract('escrow-1', 500)];
		mockGetContracts.mockResolvedValue(duplicateBatch);

		await contractStore.loadMoreContracts();
		let state = get(contractStore);
		expect(state.hasMore).toBe(true);
		expect(state.oldestTimestamp).toBe(499);

		await contractStore.loadMoreContracts();
		state = get(contractStore);
		expect(state.hasMore).toBe(false);
	});
});
