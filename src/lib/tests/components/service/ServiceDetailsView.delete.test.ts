import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/svelte';
import type { Service } from '$lib/types/service.d';
import type { ContractWithEvents } from '$lib/types/contract';
import { EscrowStatus } from '$lib/utils/escrow';
import { resetServiceDeleteUiState } from '$lib/stores/service-delete-ui.store';

const hoisted = vi.hoisted(() => {
	function createStore<T>(initialValue: T) {
		let value = initialValue;
		const subscribers = new Set<(nextValue: T) => void>();

		return {
			set(nextValue: T) {
				value = nextValue;
				for (const subscriber of subscribers) {
					subscriber(value);
				}
			},
			subscribe(subscriber: (nextValue: T) => void) {
				subscriber(value);
				subscribers.add(subscriber);
				return () => subscribers.delete(subscriber);
			}
		};
	}

	return {
		mockGoto: vi.fn(),
		authStateStore: createStore({ isAuthenticated: true }),
		userStore: createStore({ npub: 'a'.repeat(64) }),
		contractStoreState: createStore({
			contracts: [] as ContractWithEvents[]
		}),
		mockLoadContracts: vi.fn().mockResolvedValue(undefined),
		mockQueryTaskeeThreads: vi.fn().mockResolvedValue([]),
		mockGetActiveContractsForService: vi.fn().mockReturnValue([]),
		mockDeleteService: vi.fn().mockResolvedValue('deleted'),
		mockDeleteFile: vi.fn().mockResolvedValue(undefined),
		mockShowSuccessToast: vi.fn(),
		mockShowErrorToast: vi.fn(),
		appStoreState: createStore({
			nostrKeys: {
				nsec: null,
				npub: 'a'.repeat(64),
				mnemonic: null
			},
			isLoading: false,
			error: null,
			toasts: [],
			biometricData: null,
			network: 'testnet',
			pool: null,
			relays: []
		}),
		walletStoreMock: createStore({
			isConnected: true,
			rsk: {
				address: '0x1111111111111111111111111111111111111111',
				wallet: {},
				provider: {}
			}
		})
	};
});

vi.mock('svelte-i18n', async () => {
	const { readable } = await import('svelte/store');
	return {
		t: readable((key: string) => key),
		locale: readable('en')
	};
});

vi.mock('$app/navigation', () => ({
	goto: (...args: Parameters<typeof hoisted.mockGoto>) => hoisted.mockGoto(...args)
}));

vi.mock('$lib/stores/auth.store', () => ({
	authState: hoisted.authStateStore
}));

vi.mock('$lib/stores/user.store', () => ({
	user: hoisted.userStore
}));

vi.mock('$lib/stores/contract.store', () => ({
	contractStore: {
		subscribe: hoisted.contractStoreState.subscribe,
		loadContracts: hoisted.mockLoadContracts
	}
}));

vi.mock('$lib/stores/wallet.store', () => ({
	walletStore: hoisted.walletStoreMock,
	walletManager: {
		initialize: vi.fn()
	}
}));

vi.mock('$lib/stores/task.store', async () => {
	const { writable } = await import('svelte/store');
	const store = writable({
		items: [],
		loading: false,
		error: null,
		currentPage: 1,
		hasMore: false
	});

	return {
		tasksStore: store,
		myTasksStore: store,
		taskStore: {},
		TASKS_PER_PAGE: 10,
		STEPS: writable([])
	};
});

vi.mock('$lib/utils/serviceDisplayTranslation', () => ({
	getServiceDisplayTitle: vi.fn((service: Service) => service.title),
	getServiceDisplayDescription: vi.fn((service: Service) => service.description),
	getServiceDisplayTiers: vi.fn((service: Service) => service.pricing?.tiers ?? []),
	getServiceDisplayAddOns: vi.fn(() => []),
	getServiceDisplayFaqs: vi.fn(() => []),
	getServiceDeliveryTimeDisplay: vi.fn(() => '2-3 days')
}));

vi.mock('$lib/utils/service-contract/active-contracts', () => ({
	getActiveServiceContractsForService: (
		...args: Parameters<typeof hoisted.mockGetActiveContractsForService>
	) => hoisted.mockGetActiveContractsForService(...args)
}));

vi.mock('$lib/stores/service-quote-ui.store', () => ({
	serviceQuoteUiStore: {
		submitQuoteRequest: vi.fn(),
		setNonBlockingMessage: vi.fn()
	}
}));

vi.mock('$lib/components/service/RequestQuoteModal.svelte', () => ({
	default: () => null
}));

vi.mock('$lib/components/service/ServiceInstantBuyModal.svelte', () => ({
	default: () => null
}));

vi.mock('$lib/stores/app.store', () => ({
	appStore: {
		subscribe: hoisted.appStoreState.subscribe,
		showSuccessToast: hoisted.mockShowSuccessToast,
		showErrorToast: hoisted.mockShowErrorToast,
		showInfoToast: vi.fn()
	}
}));

vi.mock('$lib/utils/service-quote/query', () => ({
	queryTaskeeServiceQuoteThreads: (...args: Parameters<typeof hoisted.mockQueryTaskeeThreads>) =>
		hoisted.mockQueryTaskeeThreads(...args)
}));

vi.mock('$lib/nostr/service', () => ({
	findServiceByUniqueId: vi.fn(),
	deleteService: (...args: Parameters<typeof hoisted.mockDeleteService>) =>
		hoisted.mockDeleteService(...args)
}));

vi.mock('$lib/api/services/upload.service', () => ({
	default: {
		deleteFile: (...args: Parameters<typeof hoisted.mockDeleteFile>) =>
			hoisted.mockDeleteFile(...args)
	}
}));

vi.mock('$lib/utils/service-contract/create', () => ({
	createServiceContract: vi.fn()
}));

vi.mock('$lib/utils/service-contract/await-contract-creation', () => ({
	waitForContractCreationByTransactionHash: vi.fn()
}));

vi.mock('$lib/utils/service-contract/pending-navigation', () => ({
	writePendingServiceContractNavigation: vi.fn(),
	clearPendingServiceContractNavigation: vi.fn()
}));

function createService(): Service {
	return {
		id: 'service-event-1',
		uniqueId: 'service-123',
		npub: 'a'.repeat(64),
		status: 'active',
		title: 'Brand Identity Sprint',
		description: 'Logo, color palette, and social avatar pack.',
		portfolio: [
			{
				url: 'https://cdn.example.com/service-image.webp',
				key: 'service-image-key',
				type: 'image/*',
				alt: 'Service image',
				size: 1234
			}
		],
		serviceLocationTypes: [],
		pricing: {
			type: 'FIXED',
			currency: 'USDt',
			amount: 200
		},
		skills: [],
		categories: [],
		createdAt: 1_700_000_000,
		creator: {
			username: 'Designer',
			avatar: ''
		}
	} as Service;
}

function createContract(): ContractWithEvents {
	return {
		contractEvent: {
			id: 'contract-escrow-1',
			created_at: 1_700_000_000,
			content: {
				escrowId: 'escrow-1',
				freelancerPubkey: 'b'.repeat(64),
				clientPubkey: 'c'.repeat(64),
				amount: '0.00100000',
				currency: 'RBTC',
				status: EscrowStatus.Funded,
				estimatedStartTime: 1_700_010_000,
				estimatedCompletionTime: 1_700_020_000,
				type: 'contract',
				contextType: 'service',
				contextId: 'service-123',
				serviceId: 'service-123',
				serviceAddress: `30402:${'a'.repeat(64)}:service-123`,
				serviceTitle: 'Brand Identity Sprint'
			}
		},
		statusEvents: [],
		isClient: false,
		blockchainStatus: EscrowStatus.Funded,
		escrowData: { id: 'escrow-1' } as ContractWithEvents['escrowData'],
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
	} as ContractWithEvents;
}

describe('ServiceDetailsView delete workflow', () => {
	async function renderView(service: Service) {
		const { default: ServiceDetailsView } = await import(
			'$lib/components/service/ServiceDetailsView.svelte'
		);
		return render(ServiceDetailsView, {
			service,
			serviceId: service.uniqueId ?? service.id
		});
	}

	beforeEach(() => {
		vi.clearAllMocks();
		resetServiceDeleteUiState();
		hoisted.appStoreState.set({
			nostrKeys: {
				nsec: null,
				npub: 'a'.repeat(64),
				mnemonic: null
			},
			isLoading: false,
			error: null,
			toasts: [],
			biometricData: null,
			network: 'testnet',
			pool: null,
			relays: []
		});
		hoisted.contractStoreState.set({
			contracts: []
		});
		hoisted.mockQueryTaskeeThreads.mockResolvedValue([]);
		hoisted.mockGetActiveContractsForService.mockReturnValue([]);
		hoisted.mockDeleteService.mockResolvedValue('deleted');
	});

	afterEach(() => {
		cleanup();
	});

	it('calls getActiveServiceContractsForService with contracts array and service object (not just service.id)', async () => {
		const service = createService();
		const contract = createContract();
		hoisted.contractStoreState.set({
			contracts: [contract]
		});
		hoisted.mockGetActiveContractsForService.mockReturnValue([contract]);

		const { getAllByText } = await renderView(service);

		await fireEvent.click(getAllByText('Delete')[0]);

		// Verify getActiveServiceContractsForService was called with (contracts, service) not just (service.id)
		expect(hoisted.mockGetActiveContractsForService).toHaveBeenCalledTimes(1);
		const [firstArg, secondArg] = hoisted.mockGetActiveContractsForService.mock.calls[0];

		// First argument should be an array (contracts), not a string (service.id)
		expect(Array.isArray(firstArg)).toBe(true);
		// Second argument should be the service object
		expect(secondArg).toEqual(service);
		// Should NOT be called with just a string
		expect(typeof firstArg).not.toBe('string');
	});

	it('blocks owner deletion when active contracts still exist', async () => {
		hoisted.contractStoreState.set({
			contracts: [createContract()]
		});
		hoisted.mockGetActiveContractsForService.mockReturnValue([createContract()]);

		const { getAllByText, findByText, findAllByText } = await renderView(createService());

		await fireEvent.click(getAllByText('Delete')[0]);

		expect(await findByText('Cannot delete service')).toBeTruthy();
		expect(
			await findAllByText(/Active service contracts are still attached to this service/)
		).toBeTruthy();
		expect(hoisted.mockDeleteService).not.toHaveBeenCalled();
	}, 20_000);

	it('warns about open requests but still allows deletion', async () => {
		hoisted.mockQueryTaskeeThreads.mockResolvedValue([
			{
				request: {
					id: 'request-event-1',
					kind: 6420,
					pubkey: 'b'.repeat(64),
					created_at: 1,
					tags: [],
					content: {
						type: 'service-quote-request',
						quoteRequestId: 'qr_valid123',
						serviceId: `30402:${'a'.repeat(64)}:service-123`,
						serviceAddress: `30402:${'a'.repeat(64)}:service-123`,
						pricingType: 'FIXED',
						inquiry: {
							title: 'Need a brand refresh',
							description: 'Please send a proposal for a full design pass.'
						},
						timestamp: 1,
						version: 'v1'
					}
				},
				proposals: [],
				taskerPubkey: 'b'.repeat(64),
				taskeePubkey: 'a'.repeat(64),
				serviceAddress: `30402:${'a'.repeat(64)}:service-123`,
				serviceId: `30402:${'a'.repeat(64)}:service-123`
			}
		]);

		const { getAllByText, findAllByText } = await renderView(createService());

		await fireEvent.click(getAllByText('Delete')[0]);
		expect(await findAllByText(/open requests/i)).toBeTruthy();
		await fireEvent.click(getAllByText('Confirm Delete')[0]);

		await waitFor(() => expect(hoisted.mockDeleteService).toHaveBeenCalledTimes(1));
		expect(hoisted.mockDeleteService).toHaveBeenCalledWith(
			'service-event-1',
			{
				hasOpenQuotes: true,
				hasActiveContracts: false
			},
			{
				uniqueId: 'service-123'
			}
		);
		expect(hoisted.mockDeleteFile).toHaveBeenCalledWith(
			expect.objectContaining({
				key: 'service-image-key',
				cloudflareId: 'service-image-key',
				type: 'image'
			})
		);
	}, 10_000);

	it('confirms owner deletion and returns to my services when no blockers remain', async () => {
		const { getAllByText, findByText } = await renderView(createService());

		await fireEvent.click(getAllByText('Delete')[0]);
		expect(await findByText('Delete service')).toBeTruthy();
		await fireEvent.click(getAllByText('Confirm Delete')[0]);

		await waitFor(() => expect(hoisted.mockDeleteService).toHaveBeenCalledTimes(1));
		expect(hoisted.mockDeleteService).toHaveBeenCalledWith(
			'service-event-1',
			{
				hasOpenQuotes: false,
				hasActiveContracts: false
			},
			{
				uniqueId: 'service-123'
			}
		);
		expect(hoisted.mockGoto).toHaveBeenCalledWith('/dashboard?tab=my-services');
	}, 10_000);
});
