import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EscrowStatus } from '$lib/utils/escrow';

const mockQueryNostrEvents = vi.fn();
const mockLoadEscrowDetails = vi.fn();

vi.mock('$lib/utils/nostrKeys', () => ({
	getNpub: vi.fn().mockResolvedValue('user-pub'),
	getNostrKeyPair: vi.fn()
}));

vi.mock('$lib/utils/nostr', () => ({
	queryNostrEvents: (...args: unknown[]) => mockQueryNostrEvents(...args),
	publishNostrEvent: vi.fn(),
	publishNostrEventWithProofOfWork: vi.fn(),
	getSignedEvent: vi.fn()
}));

vi.mock('$lib/utils/escrow/v1/escrow', () => ({
	escrow: {
		loadEscrowDetails: (...args: unknown[]) => mockLoadEscrowDetails(...args),
		getDisputeProposal: vi.fn()
	}
}));

vi.mock('$lib/stores/contract.store', () => ({
	contractStore: {
		update: vi.fn(),
		subscribe: vi.fn()
	}
}));

vi.mock('$lib/stores/app.store', async () => {
	const { writable } = await import('svelte/store');
	const store = writable({
		pool: {
			querySync: vi.fn().mockResolvedValue([]),
			publish: vi.fn().mockResolvedValue([Promise.resolve()]),
			subscribe: vi.fn(() => ({ close: vi.fn() })),
			close: vi.fn()
		},
		network: 'testnet',
		relays: [],
		biometricData: null
	});

	return {
		appStore: {
			...store,
			showInfoToast: vi.fn()
		}
	};
});

vi.mock('$lib/utils/escrow/v1/escrowEvents', async () => {
	const actual = await vi.importActual<typeof import('$lib/utils/escrow/v1/escrowEvents')>(
		'$lib/utils/escrow/v1/escrowEvents'
	);

	return {
		...actual,
		publishEscrowStatus: vi.fn()
	};
});

vi.mock('$lib/api/services/nostr/events', () => ({
	default: {
		deleteEvent: vi.fn()
	}
}));

vi.mock('$lib/utils/helpers/paymentContext', async () => {
	const actual = await vi.importActual<typeof import('$lib/utils/helpers/paymentContext')>(
		'$lib/utils/helpers/paymentContext'
	);

	return {
		...actual,
		getContractQueryNetworks: vi.fn(() => ['bsc-testnet', 'rsk-testnet']),
		getContractReference: vi.fn((escrowId: string, network: string) => `contract:${network}:${escrowId}`),
		normalizePaymentAsset: vi.fn((asset?: string) => asset ?? 'RBTC'),
		normalizePaymentNetwork: vi.fn((network?: string, asset?: string) => {
			if (network) return network;
			return asset === 'USDT' ? 'bsc-testnet' : 'rsk-testnet';
		})
	};
});

const baseContractEvent = {
	id: 'contract-event-1',
	pubkey: 'author-pub',
	created_at: 1_700_000_000,
	tags: [
		['d', 'contract:bsc-testnet:escrow-1'],
		['p', 'user-pub'],
		['p', 'other-pub'],
		['n', 'bsc-testnet']
	],
	content: {
		schemaVersion: 'contract.v2',
		contractRef: 'contract:bsc-testnet:escrow-1',
		escrowId: 'escrow-1',
		taskId: 'task-1',
		taskRef: 'task:task-1',
		taskTitle: 'BSC task',
		taskDescription: 'Read-only BSC contract',
		freelancerPubkey: 'other-pub',
		clientPubkey: 'user-pub',
		amount: '125.5',
		currency: 'USDT',
		paymentAsset: 'USDT',
		paymentNetwork: 'bsc-testnet',
		status: EscrowStatus.Funded,
		estimatedStartTime: 1_700_010_000,
		estimatedCompletionTime: 1_700_020_000,
		type: 'contract' as const
	}
};

describe('nostrContract BSC metadata-only contract reads', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('keeps BSC contracts readable and non-actionable without calling the RSK escrow reader', async () => {
		mockQueryNostrEvents.mockResolvedValue([
			{
				...baseContractEvent,
				statusEvents: [
					{
						id: 'status-1',
						pubkey: 'other-pub',
						created_at: 1_700_000_100,
						tags: [
							['e', 'contract-event-1'],
							['r', 'escrow-1'],
							['p', 'user-pub'],
							['n', 'bsc-testnet']
						],
						content: {
							schemaVersion: 'status.v2',
							contractEventId: 'contract-event-1',
							escrowId: 'escrow-1',
							contractRef: 'contract:bsc-testnet:escrow-1',
							parentRef: 'task:task-1',
							taskRef: 'task:task-1',
							action: EscrowStatus.Completed,
							timestamp: 1_700_000_100_000,
							type: 'contract-status' as const,
							paymentAsset: 'USDT',
							paymentNetwork: 'bsc-testnet'
						}
					}
				]
			}
		]);

		const { getContracts } = await import('$lib/utils/escrow/v1/nostrContract');
		const contracts = await getContracts({ limit: 5 });

		expect(mockLoadEscrowDetails).not.toHaveBeenCalled();
		expect(contracts).toHaveLength(1);
		expect(contracts[0].blockchainStatus).toBeNull();
		expect(contracts[0].status).toBe(EscrowStatus.Completed);
		expect(contracts[0].permissions).toEqual({
			canComplete: false,
			canAccept: false,
			canDispute: false,
			canPropose: false,
			canAcceptProposal: false,
			canCancel: false,
			canResolveTimelock: false,
			canDelete: false
		});
		expect(contracts[0].escrowData.id).toBe('escrow-1');
		expect(contracts[0].escrowData.baseAmount).toBe('125.5');
	});

	it('preserves unfunded BSC metadata-only contracts as read-only instead of deletable drafts', async () => {
		mockQueryNostrEvents.mockResolvedValue([{ ...baseContractEvent }]);

		const { getContracts } = await import('$lib/utils/escrow/v1/nostrContract');
		const contracts = await getContracts({ limit: 5 });

		expect(contracts).toHaveLength(1);
		expect(contracts[0].status).toBe(EscrowStatus.Funded);
		expect(contracts[0].permissions.canDelete).toBe(false);
		expect(contracts[0].permissions.canAccept).toBe(false);
		expect(contracts[0].permissions.canComplete).toBe(false);
	});
});
