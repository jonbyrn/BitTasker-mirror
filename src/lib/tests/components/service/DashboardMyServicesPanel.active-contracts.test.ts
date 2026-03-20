import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/svelte';
import type { Service } from '$lib/types/service.d';
import type { ContractWithEvents } from '$lib/types/contract';
import { EscrowStatus } from '$lib/utils/escrow';
import type { ServiceQuoteTimelineEntry } from '$lib/types/service-quote';
import { createServicesWorkspaceUrl } from '$lib/utils/service-quote/services-workspace-route';
import { ServicePricingTypeEnum } from '$lib/utils/enums/service.enum';

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
		mockFindMyServices: vi.fn(),
		mockDeleteService: vi.fn().mockResolvedValue('deleted'),
		mockQueryTaskeeThreads: vi.fn().mockResolvedValue([]),
		mockLoadContracts: vi.fn().mockResolvedValue(undefined),
		mockLoadProviderTimelines: vi.fn().mockResolvedValue([]),
		mockGetCurrentPrice: vi.fn().mockResolvedValue(63_000),
		contractStoreState: createStore({
			contracts: [] as ContractWithEvents[]
		}),
		serviceQuoteUiState: createStore({
			providerTimelinesByService: {} as Record<string, ServiceQuoteTimelineEntry[]>,
			loadingProviderByService: {} as Record<string, boolean>,
			providerLoadErrorByService: {} as Record<string, string | null>,
			providerDataFreshnessByService: {} as Record<string, 'fresh' | 'stale' | 'partial'>
		}),
		walletStore: createStore({
			rsk: {
				address: '0x1111111111111111111111111111111111111111' as string | null
			}
		}),
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

vi.mock('$lib/nostr/findServices', () => ({
	findMyServices: (...args: Parameters<typeof hoisted.mockFindMyServices>) =>
		hoisted.mockFindMyServices(...args)
}));

vi.mock('$lib/nostr/service', () => ({
	updateService: vi.fn(),
	deleteService: (...args: Parameters<typeof hoisted.mockDeleteService>) =>
		hoisted.mockDeleteService(...args)
}));

vi.mock('$lib/api/services/crypto-price.service', () => ({
	default: {
		getCurrentPrice: (...args: Parameters<typeof hoisted.mockGetCurrentPrice>) =>
			hoisted.mockGetCurrentPrice(...args)
	}
}));

vi.mock('$lib/utils/service-quote/query', () => ({
	queryTaskeeServiceQuoteThreads: (
		...args: Parameters<typeof hoisted.mockQueryTaskeeThreads>
	) => hoisted.mockQueryTaskeeThreads(...args)
}));

vi.mock('$lib/stores/service-quote-ui.store', async () => ({
	buildServiceAddress: (service: Service) => `30402:${service.npub}:${service.uniqueId ?? service.id}`,
	getProviderTimelines: (
		state: { providerTimelinesByService: Record<string, ServiceQuoteTimelineEntry[]> },
		serviceAddress: string | null | undefined
	) => (serviceAddress ? state.providerTimelinesByService[serviceAddress] ?? [] : []),
	getProviderDataFreshness: (
		state: { providerDataFreshnessByService?: Record<string, 'fresh' | 'stale' | 'partial'> },
		serviceAddress: string | null | undefined
	) => (serviceAddress ? state.providerDataFreshnessByService?.[serviceAddress] ?? 'fresh' : 'fresh'),
	isProviderTimelineSyncing: (
		state: { loadingProviderByService: Record<string, boolean> },
		serviceAddress: string | null | undefined
	) => (serviceAddress ? state.loadingProviderByService[serviceAddress] === true : false),
	serviceQuoteUiStore: {
		subscribe: hoisted.serviceQuoteUiState.subscribe,
		loadProviderTimelines: (...args: Parameters<typeof hoisted.mockLoadProviderTimelines>) =>
			hoisted.mockLoadProviderTimelines(...args),
		setNonBlockingMessage: vi.fn(),
		sendLocalProposal: vi.fn()
	}
}));

vi.mock('$lib/stores/contract.store', () => ({
	contractStore: {
		subscribe: hoisted.contractStoreState.subscribe,
		loadContracts: hoisted.mockLoadContracts
	}
}));

vi.mock('$lib/stores/wallet.store', () => ({
	walletStore: hoisted.walletStore
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

vi.mock('$lib/stores/app.store', () => ({
	appStore: {
		subscribe: hoisted.appStoreState.subscribe,
		set: vi.fn(),
		update: vi.fn(),
		showSuccessToast: vi.fn(),
		showErrorToast: vi.fn()
	}
}));

vi.mock('$lib/utils/nostrKeys', () => ({
	getNpub: vi.fn().mockResolvedValue('a'.repeat(64))
}));

function createService(): Service {
	return {
		id: 'service-event-1',
		uniqueId: 'service-123',
		npub: 'a'.repeat(64),
		status: 'active',
		title: 'Brand Identity Sprint',
		description: 'Logo, color palette, and social avatar pack.',
		serviceLocationTypes: [],
		pricing: {
			type: 'FIXED',
			currency: 'USDt',
			amount: 200
		},
		skills: [],
		categories: [],
		createdAt: 1_700_000_000
	} as Service;
}

function createTimeline(service: Service): ServiceQuoteTimelineEntry {
	const serviceAddress = `30402:${service.npub}:${service.uniqueId ?? service.id}`;

	return {
		request: {
			id: 'request-event-1',
			kind: 6420,
			pubkey: 'b'.repeat(64),
			created_at: 1_700_000_000,
			tags: [],
			content: {
				type: 'service-quote-request',
				quoteRequestId: 'qr_valid123',
				serviceId: serviceAddress,
				serviceAddress,
				pricingType: ServicePricingTypeEnum.FIXED,
				inquiry: {
					title: 'Need a brand refresh',
					description: 'Please send a proposal for a full design pass.'
				},
				timestamp: 1_700_000_000,
				version: 'v1'
			},
			sig: ''
		},
		proposals: [],
		statusEventsByProposalId: {},
		latestProposal: undefined,
		resolvedStatus: 'pending',
		resolvedTerminalEvent: undefined,
		expirationTimestamp: undefined,
		isExpired: false,
		linkedEscrowId: undefined
	};
}

function createContract(
	escrowId: string,
	status: EscrowStatus,
	statusEventTimestamp: number
): ContractWithEvents {
	return {
		contractEvent: {
			id: `contract-${escrowId}`,
			created_at: 1_700_000_000,
			content: {
				escrowId,
				freelancerPubkey: 'b'.repeat(64),
				clientPubkey: 'c'.repeat(64),
				amount: '0.00100000',
				currency: 'RBTC',
				status,
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
		statusEvents: [
			{
				id: `status-${escrowId}`,
				created_at: statusEventTimestamp,
				content: {
					contractEventId: `contract-${escrowId}`,
					escrowId,
					action: status,
					timestamp: statusEventTimestamp,
					type: 'contract-status'
				}
			}
		],
		isClient: false,
		blockchainStatus: status,
		escrowData: { id: escrowId } as ContractWithEvents['escrowData'],
		status,
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

describe('DashboardMyServicesPanel active contracts shortcut', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		const service = createService();
		hoisted.mockFindMyServices.mockResolvedValue({
			services: [service]
		});
		hoisted.contractStoreState.set({
			contracts: []
		});
		hoisted.serviceQuoteUiState.set({
			providerTimelinesByService: {},
			loadingProviderByService: {},
			providerLoadErrorByService: {},
			providerDataFreshnessByService: {}
		});
		hoisted.walletStore.set({
			rsk: {
				address: '0x1111111111111111111111111111111111111111'
			}
		});
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
		hoisted.mockDeleteService.mockResolvedValue('deleted');
		hoisted.mockQueryTaskeeThreads.mockResolvedValue([]);
	});

	afterEach(() => {
		cleanup();
	});

	it(
		'opens the deterministically selected active service contract from the service card',
		async () => {
		hoisted.contractStoreState.set({
			contracts: [
				createContract('escrow-old', EscrowStatus.Funded, 1_700_000_010),
				createContract('escrow-new', EscrowStatus.Completed, 1_700_000_020)
			]
		});

		const { default: DashboardMyServicesPanel } = await import(
			'$lib/components/service/DashboardMyServicesPanel.svelte'
		);
		const { getByText } = render(DashboardMyServicesPanel, {
			view: 'default'
		});

		await waitFor(() => expect(hoisted.mockFindMyServices).toHaveBeenCalled());
		await fireEvent.click(getByText('Contracts'));

		expect(hoisted.mockGoto).toHaveBeenCalledWith(
			'http://localhost:3000/dashboard?tab=contracts&context=services&highlight=escrow-new'
		);
		},
		45_000
	);

	it(
		'routes the service card quotes action to the services workspace quote inbox',
		async () => {
			const service = createService();
			const serviceAddress = `30402:${service.npub}:${service.uniqueId ?? service.id}`;
			const expectedUrl = createServicesWorkspaceUrl(
				new URL('http://localhost:3000/services/manage'),
				{
					tab: 'quotes',
					serviceAddress,
					requestId: null
				}
			).toString();

			const { default: DashboardMyServicesPanel } = await import(
				'$lib/components/service/DashboardMyServicesPanel.svelte'
			);
			const { getByText } = render(DashboardMyServicesPanel, {
				view: 'default'
			});

			await waitFor(() => expect(hoisted.mockFindMyServices).toHaveBeenCalled());
			await fireEvent.click(getByText('Quotes'));

			expect(hoisted.mockGoto).toHaveBeenCalledWith(expectedUrl);
		},
		45_000
	);

	it('hides the shortcut when only terminal service contracts exist', async () => {
		hoisted.contractStoreState.set({
			contracts: [createContract('escrow-final', EscrowStatus.FundsReleased, 1_700_000_020)]
		});

		const { default: DashboardMyServicesPanel } = await import(
			'$lib/components/service/DashboardMyServicesPanel.svelte'
		);
		const { queryByText } = render(DashboardMyServicesPanel, {
			view: 'default'
		});

		await waitFor(() => expect(hoisted.mockFindMyServices).toHaveBeenCalled());
		expect(queryByText('View Active Contracts')).toBeNull();
	});

	it('keeps the provider proposal composer unblocked in quotes view', async () => {
		const service = createService();
		const serviceAddress = `30402:${service.npub}:${service.uniqueId ?? service.id}`;
		hoisted.mockFindMyServices.mockResolvedValueOnce({
			services: [service]
		});
		hoisted.serviceQuoteUiState.set({
			providerTimelinesByService: {
				[serviceAddress]: [createTimeline(service)]
			},
			loadingProviderByService: {
				[serviceAddress]: false
			},
			providerLoadErrorByService: {
				[serviceAddress]: null
			},
			providerDataFreshnessByService: {
				[serviceAddress]: 'fresh'
			}
		});

		const { default: DashboardMyServicesPanel } = await import(
			'$lib/components/service/DashboardMyServicesPanel.svelte'
		);
		const { getByRole, queryByText } = render(DashboardMyServicesPanel, {
			view: 'quotes',
			selectedServiceAddress: serviceAddress,
			focusedRequestId: 'qr_valid123'
		});

		await waitFor(() => expect(hoisted.mockFindMyServices).toHaveBeenCalled());
		await waitFor(() => expect(hoisted.mockLoadProviderTimelines).toHaveBeenCalled());
		expect(queryByText('Choose a freelancer fee tier before sending a proposal.')).toBeNull();
		expect((getByRole('button', { name: 'Send Proposal' }) as HTMLButtonElement).disabled).toBe(
			false
		);
	});

	it('keeps provider quote review in-context when the wallet prerequisite is missing', async () => {
		const service = createService();
		const serviceAddress = `30402:${service.npub}:${service.uniqueId ?? service.id}`;
		hoisted.mockFindMyServices.mockResolvedValueOnce({
			services: [service]
		});
		hoisted.serviceQuoteUiState.set({
			providerTimelinesByService: {
				[serviceAddress]: [createTimeline(service)]
			},
			loadingProviderByService: {
				[serviceAddress]: false
			},
			providerLoadErrorByService: {
				[serviceAddress]: null
			},
			providerDataFreshnessByService: {
				[serviceAddress]: 'fresh'
			}
		});
		hoisted.walletStore.set({
			rsk: {
				address: null
			}
		});

		const { default: DashboardMyServicesPanel } = await import(
			'$lib/components/service/DashboardMyServicesPanel.svelte'
		);
		const { getByRole, getByText } = render(DashboardMyServicesPanel, {
			view: 'quotes',
			selectedServiceAddress: serviceAddress,
			focusedRequestId: 'qr_valid123'
		});

		await waitFor(() => expect(hoisted.mockFindMyServices).toHaveBeenCalled());
		await waitFor(() => expect(hoisted.mockLoadProviderTimelines).toHaveBeenCalled());
		expect(getByText('Connect your wallet before sending a proposal.')).toBeTruthy();
		expect(getByRole('button', { name: 'Send Proposal' })).toBeTruthy();
	});

	it('blocks deletion when open quote threads remain', async () => {
		const service = createService();
		const serviceAddress = `30402:${service.npub}:${service.uniqueId ?? service.id}`;
		hoisted.mockQueryTaskeeThreads.mockResolvedValue([
			{
				request: createTimeline(service).request,
				proposals: [],
				taskerPubkey: 'b'.repeat(64),
				taskeePubkey: service.npub,
				serviceAddress,
				serviceId: serviceAddress
			}
		]);

	const { default: DashboardMyServicesPanel } = await import(
		'$lib/components/service/DashboardMyServicesPanel.svelte'
	);
	const { getByRole, findByText, findByRole } = render(DashboardMyServicesPanel, {
		view: 'default'
	});

	await waitFor(() => expect(hoisted.mockFindMyServices).toHaveBeenCalled());
	await fireEvent.click(getByRole('button', { name: 'task.actions.view_details' }));
	await fireEvent.click(await findByRole('button', { name: 'dashboard.services.detail.delete_service' }));
	const confirmDeleteModal = await findByRole('heading', {
		name: 'dashboard.services.detail.delete_service_confirm_title'
	});
	await fireEvent.click(
		within(confirmDeleteModal.closest('.modal-box') as HTMLElement).getByRole('button', {
			name: 'dashboard.services.detail.delete_service'
		})
	);

	expect(await findByText('Cannot delete service')).toBeTruthy();
	expect(await findByText(/Open quotes are still attached to this service/)).toBeTruthy();
	expect(hoisted.mockDeleteService).not.toHaveBeenCalled();
	});

	it('confirms deletion when no blockers remain and refreshes the list', async () => {
	const { default: DashboardMyServicesPanel } = await import(
		'$lib/components/service/DashboardMyServicesPanel.svelte'
	);
	const { getByRole, findByText, findByRole } = render(DashboardMyServicesPanel, {
		view: 'default'
	});

	await waitFor(() => expect(hoisted.mockFindMyServices).toHaveBeenCalledTimes(1));
	await fireEvent.click(getByRole('button', { name: 'task.actions.view_details' }));
	await fireEvent.click(await findByRole('button', { name: 'dashboard.services.detail.delete_service' }));
	const confirmDeleteModal = await findByRole('heading', {
		name: 'dashboard.services.detail.delete_service_confirm_title'
	});
	await fireEvent.click(
		within(confirmDeleteModal.closest('.modal-box') as HTMLElement).getByRole('button', {
			name: 'dashboard.services.detail.delete_service'
		})
	);
	expect(await findByText('Delete service')).toBeTruthy();
	await fireEvent.click(getByRole('button', { name: 'Confirm Delete' }));

		await waitFor(() => expect(hoisted.mockDeleteService).toHaveBeenCalledTimes(1));
		expect(hoisted.mockDeleteService).toHaveBeenCalledWith('service-event-1', {
			hasOpenQuotes: false,
			hasActiveContracts: false
		});
		await waitFor(() => expect(hoisted.mockFindMyServices).toHaveBeenCalledTimes(2));
	});
});
