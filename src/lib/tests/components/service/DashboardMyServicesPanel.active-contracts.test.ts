import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/svelte';
import type { Service } from '$lib/types/service.d';
import type { ContractWithEvents } from '$lib/types/contract';
import { EscrowStatus } from '$lib/utils/escrow';
import type { ServiceQuoteTimelineEntry } from '$lib/types/service-quote';
import { ServicePricingTypeEnum } from '$lib/utils/enums/service.enum';
import { resetServiceDeleteUiState } from '$lib/stores/service-delete-ui.store';

const hoisted = vi.hoisted(() => {
	function createStore<T>(initialValue: T) {
		let value = initialValue;
		const subscribers = new Set<(nextValue: T) => void>();

		return {
			get() {
				return value;
			},
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
		mockUpdateService: vi.fn().mockResolvedValue(undefined),
		mockDeleteService: vi.fn().mockResolvedValue('deleted'),
		mockDeleteFile: vi.fn().mockResolvedValue(undefined),
		mockQueryTaskeeThreads: vi.fn().mockResolvedValue([]),
		mockLoadContracts: vi.fn().mockResolvedValue(undefined),
		mockEscrowGetContracts: vi.fn().mockResolvedValue([]),
		mockLoadProviderTimelines: vi.fn().mockResolvedValue([]),
		mockGetCurrentPrice: vi.fn().mockResolvedValue(63_000),
		mockShowSuccessToast: vi.fn(),
		mockShowErrorToast: vi.fn(),
		contractStoreState: createStore({
			contracts: [] as ContractWithEvents[]
		}),
		serviceQuoteUiState: createStore({
			providerTimelinesByService: {} as Record<string, ServiceQuoteTimelineEntry[]>,
			loadingProviderByService: {} as Record<string, boolean>,
			providerLoadErrorByService: {} as Record<string, string | null>,
			providerLoadedByService: {} as Record<string, boolean>,
			providerDataFreshnessByService: {} as Record<string, 'fresh' | 'stale' | 'partial'>,
			focusSync: {
				requestId: null as string | null,
				serviceAddress: null as string | null,
				expiresAt: null as number | null
			}
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

vi.mock('$lib/components/user/UserInfoDisplay.svelte', () => ({
	default: () => ({
		$$render: () => '<div data-testid="provider-request-user">User info</div>'
	})
}));

vi.mock('$lib/utils/nostr-profile', () => ({
	fetchContractProfile: vi.fn().mockResolvedValue({
		averageRating: 4.5,
		tasksCompleted: 12
	})
}));

vi.mock('$lib/nostr/findServices', () => ({
	findMyServices: (...args: Parameters<typeof hoisted.mockFindMyServices>) =>
		hoisted.mockFindMyServices(...args)
}));

vi.mock('$lib/nostr/service', () => ({
	updateService: (...args: Parameters<typeof hoisted.mockUpdateService>) =>
		hoisted.mockUpdateService(...args),
	deleteService: (...args: Parameters<typeof hoisted.mockDeleteService>) =>
		hoisted.mockDeleteService(...args)
}));

vi.mock('$lib/api/services/upload.service', () => ({
	default: {
		deleteFile: (...args: Parameters<typeof hoisted.mockDeleteFile>) =>
			hoisted.mockDeleteFile(...args)
	}
}));

vi.mock('$lib/api/services/crypto-price.service', () => ({
	default: {
		getCurrentPrice: (...args: Parameters<typeof hoisted.mockGetCurrentPrice>) =>
			hoisted.mockGetCurrentPrice(...args)
	}
}));

vi.mock('$lib/utils/service-quote/query', () => ({
	queryTaskeeServiceQuoteThreads: (...args: Parameters<typeof hoisted.mockQueryTaskeeThreads>) =>
		hoisted.mockQueryTaskeeThreads(...args)
}));

vi.mock('$lib/stores/service-quote-ui.store', async () => ({
	buildServiceAddress: (service: Service) =>
		`30402:${service.npub}:${service.uniqueId ?? service.id}`,
	isRequestSyncActive: (
		state: {
			focusSync?: {
				requestId: string | null;
				serviceAddress: string | null;
				expiresAt: number | null;
			};
		},
		requestId: string | null | undefined,
		serviceAddress: string | null | undefined
	) => {
		if (!requestId || !state.focusSync?.requestId || state.focusSync.requestId !== requestId) {
			return false;
		}

		if (serviceAddress && state.focusSync.serviceAddress !== serviceAddress) {
			return false;
		}

		return true;
	},
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

vi.mock('$lib/utils/escrow', async (importOriginal) => {
	const actual = await importOriginal<typeof import('$lib/utils/escrow')>();
	return {
		...actual,
		escrow: {
			...actual.escrow,
			contractOps: {
				...actual.escrow.contractOps,
				getContracts: (...args: Parameters<typeof hoisted.mockEscrowGetContracts>) =>
					hoisted.mockEscrowGetContracts(...args)
			}
		}
	};
});

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
		showSuccessToast: (...args: Parameters<typeof hoisted.mockShowSuccessToast>) =>
			hoisted.mockShowSuccessToast(...args),
		showErrorToast: (...args: Parameters<typeof hoisted.mockShowErrorToast>) =>
			hoisted.mockShowErrorToast(...args)
	}
}));

vi.mock('$lib/utils/nostrKeys', () => ({
	getNpub: vi.fn().mockResolvedValue('a'.repeat(64))
}));

function createService(overrides: Partial<Service> = {}): Service {
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
		...overrides
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
		resetServiceDeleteUiState();
		Object.defineProperty(window, 'scrollTo', {
			value: vi.fn(),
			writable: true
		});
		const service = createService();
		hoisted.mockFindMyServices.mockResolvedValue({
			services: [service]
		});
		hoisted.contractStoreState.set({
			contracts: []
		});
		hoisted.mockEscrowGetContracts.mockImplementation(
			async (filter?: { limit?: number; until?: number }) => {
				const contracts = hoisted.contractStoreState.get().contracts;
				const limit = filter?.limit ?? contracts.length;
				if (typeof filter?.until !== 'number') {
					return contracts.slice(0, limit);
				}

				return contracts
					.filter((contract) => (contract.contractEvent.created_at ?? 0) <= filter.until!)
					.slice(0, limit);
			}
		);
		hoisted.serviceQuoteUiState.set({
			providerTimelinesByService: {},
			loadingProviderByService: {},
			providerLoadErrorByService: {},
			providerLoadedByService: {},
			providerDataFreshnessByService: {},
			focusSync: {
				requestId: null,
				serviceAddress: null,
				expiresAt: null
			}
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
		hoisted.mockUpdateService.mockResolvedValue(undefined);
		hoisted.mockDeleteService.mockResolvedValue('deleted');
		hoisted.mockQueryTaskeeThreads.mockResolvedValue([]);
	});

	afterEach(() => {
		cleanup();
	});

	it('opens the deterministically selected active service contract from the service card', async () => {
		window.history.replaceState({}, '', 'http://localhost:3000/earning');

		hoisted.contractStoreState.set({
			contracts: [
				createContract('escrow-old', EscrowStatus.Funded, 1_700_000_010),
				createContract('escrow-new', EscrowStatus.Completed, 1_700_000_020)
			]
		});

		const { default: DashboardMyServicesPanel } = await import(
			'$lib/components/service/DashboardMyServicesPanel.svelte'
		);
		const { getByText } = render(DashboardMyServicesPanel, {});

		await waitFor(() => expect(hoisted.mockFindMyServices).toHaveBeenCalled());
		await fireEvent.click(getByText('Contracts'));

		expect(hoisted.mockGoto).toHaveBeenCalledWith(
			`/earning?tab=contracts&context=services&highlight=escrow-new&service=${encodeURIComponent(
				`30402:${'a'.repeat(64)}:service-123`
			)}`
		);
	}, 45_000);

	it('uses the full contract snapshot when the store only contains the first contracts page', async () => {
		window.history.replaceState({}, '', 'http://localhost:3000/earning');

		const unrelatedContracts = Array.from({ length: 5 }, (_, index) => {
			const contract = createContract(
				`escrow-other-${index + 1}`,
				EscrowStatus.Funded,
				1_700_000_000 + index
			);
			return {
				...contract,
				contractEvent: {
					...contract.contractEvent,
					content: {
						...contract.contractEvent.content,
						contextId: `service-other-${index + 1}`,
						serviceId: `service-other-${index + 1}`,
						serviceAddress: `30402:${'a'.repeat(64)}:service-other-${index + 1}`,
						serviceTitle: `Other service ${index + 1}`
					}
				}
			} as ContractWithEvents;
		});
		const hiddenRelevantContract = createContract(
			'escrow-hidden',
			EscrowStatus.Funded,
			1_700_000_100
		);

		hoisted.contractStoreState.set({
			contracts: unrelatedContracts
		});
		hoisted.mockEscrowGetContracts.mockResolvedValueOnce([
			...unrelatedContracts,
			hiddenRelevantContract
		]);

		const { default: DashboardMyServicesPanel } = await import(
			'$lib/components/service/DashboardMyServicesPanel.svelte'
		);
		const { findByText } = render(DashboardMyServicesPanel, {});

		await waitFor(() => expect(hoisted.mockFindMyServices).toHaveBeenCalled());
		await fireEvent.click(await findByText('Contracts'));

		expect(hoisted.mockGoto).toHaveBeenCalledWith(
			`/earning?tab=contracts&context=services&highlight=escrow-hidden&service=${encodeURIComponent(
				`30402:${'a'.repeat(64)}:service-123`
			)}`
		);
	}, 45_000);

	it('routes the service card requests action to the services workspace quote inbox', async () => {
		const onOpenServiceQuotes = vi.fn();

		const { default: DashboardMyServicesPanel } = await import(
			'$lib/components/service/DashboardMyServicesPanel.svelte'
		);
		const { getByText } = render(DashboardMyServicesPanel, {
			onOpenServiceQuotes
		});

		await waitFor(() => expect(hoisted.mockFindMyServices).toHaveBeenCalled());
		await fireEvent.click(getByText('Requests'));

		expect(onOpenServiceQuotes).toHaveBeenCalledWith(
			expect.objectContaining({
				id: 'service-event-1',
				uniqueId: 'service-123'
			})
		);
	}, 45_000);

	it('falls back to the earning requests route when no open-quotes callback is provided', async () => {
		window.history.replaceState({}, '', 'http://localhost:3000/earning');

		const { default: DashboardMyServicesPanel } = await import(
			'$lib/components/service/DashboardMyServicesPanel.svelte'
		);
		const { getByText } = render(DashboardMyServicesPanel, {});

		await waitFor(() => expect(hoisted.mockFindMyServices).toHaveBeenCalled());
		await fireEvent.click(getByText('Requests'));

		expect(hoisted.mockGoto).toHaveBeenCalledWith(
			`/earning?tab=requests&service=${encodeURIComponent(`30402:${'a'.repeat(64)}:service-123`)}`
		);
	});

	it('toggles an active service to inactive and keeps the optimistic state after success', async () => {
		const { default: DashboardMyServicesPanel } = await import(
			'$lib/components/service/DashboardMyServicesPanel.svelte'
		);
		const { getByRole } = render(DashboardMyServicesPanel, {});

		await waitFor(() => expect(hoisted.mockFindMyServices).toHaveBeenCalled());
		const statusToggle = getByRole('checkbox') as HTMLInputElement;
		expect(statusToggle.checked).toBe(true);

		await fireEvent.click(statusToggle);

		await waitFor(() =>
			expect(hoisted.mockUpdateService).toHaveBeenCalledWith('service-123', {
				status: 'inactive'
			})
		);
		expect(statusToggle.checked).toBe(false);
		expect(hoisted.mockShowSuccessToast).toHaveBeenCalledWith(
			'dashboard.services.my_services.status_updated'
		);
		expect(hoisted.mockShowErrorToast).not.toHaveBeenCalled();
	});

	it('rolls an inactive service status toggle back to active when the update fails', async () => {
		hoisted.mockFindMyServices.mockResolvedValueOnce({
			services: [createService({ status: 'active' })]
		});
		hoisted.mockUpdateService.mockRejectedValueOnce(new Error('toggle failed'));

		const { default: DashboardMyServicesPanel } = await import(
			'$lib/components/service/DashboardMyServicesPanel.svelte'
		);
		const { getByRole } = render(DashboardMyServicesPanel, {});

		await waitFor(() => expect(hoisted.mockFindMyServices).toHaveBeenCalled());
		const statusToggle = getByRole('checkbox') as HTMLInputElement;
		expect(statusToggle.checked).toBe(true);

		await fireEvent.click(statusToggle);

		await waitFor(() =>
			expect(hoisted.mockUpdateService).toHaveBeenCalledWith('service-123', {
				status: 'inactive'
			})
		);
		await waitFor(() => expect(statusToggle.checked).toBe(true));
		expect(hoisted.mockShowErrorToast).toHaveBeenCalledWith(
			'dashboard.services.my_services.status_update_failed'
		);
		expect(hoisted.mockShowSuccessToast).not.toHaveBeenCalled();
	});

	it('uses the event id when toggling a service that does not have a unique id', async () => {
		hoisted.mockFindMyServices.mockResolvedValueOnce({
			services: [
				createService({
					id: 'service-event-no-unique-id',
					uniqueId: undefined
				})
			]
		});

		const { default: DashboardMyServicesPanel } = await import(
			'$lib/components/service/DashboardMyServicesPanel.svelte'
		);
		const { getByRole } = render(DashboardMyServicesPanel, {});

		await waitFor(() => expect(hoisted.mockFindMyServices).toHaveBeenCalled());
		await fireEvent.click(getByRole('checkbox'));

		await waitFor(() =>
			expect(hoisted.mockUpdateService).toHaveBeenCalledWith('service-event-no-unique-id', {
				status: 'inactive'
			})
		);
	}, 20_000);

	it('does not render a status toggle for sold services', async () => {
		hoisted.mockFindMyServices.mockResolvedValueOnce({
			services: [createService({ status: 'sold' })]
		});

		const { default: DashboardMyServicesPanel } = await import(
			'$lib/components/service/DashboardMyServicesPanel.svelte'
		);
		const { queryByRole, getByText } = render(DashboardMyServicesPanel, {});

		await waitFor(() => expect(hoisted.mockFindMyServices).toHaveBeenCalled());
		expect(queryByRole('checkbox')).toBeNull();
		expect(getByText('Sold')).toBeTruthy();
		expect(hoisted.mockUpdateService).not.toHaveBeenCalled();
	});

	it('shows the shared empty state with a create-service CTA when no services exist', async () => {
		hoisted.mockFindMyServices.mockResolvedValueOnce({
			services: []
		});

		const { default: DashboardMyServicesPanel } = await import(
			'$lib/components/service/DashboardMyServicesPanel.svelte'
		);
		const { getByTestId, getByRole } = render(DashboardMyServicesPanel, {});

		await waitFor(() => expect(hoisted.mockFindMyServices).toHaveBeenCalled());
		expect(getByTestId('dashboard-my-services-empty-state')).toBeTruthy();
		expect(
			getByRole('link', { name: 'dashboard.services.my_services.create_service' })
		).toHaveAttribute('href', '/dashboard/create-service');
	});

	it('defaults the status filter to all and lets you switch between active and inactive services', async () => {
		hoisted.mockFindMyServices.mockResolvedValueOnce({
			services: [
				createService({
					id: 'service-event-active',
					uniqueId: 'service-active',
					title: 'Active service',
					status: 'active'
				}),
				createService({
					id: 'service-event-inactive',
					uniqueId: 'service-inactive',
					title: 'Inactive service',
					status: 'inactive'
				})
			]
		});

		const { default: DashboardMyServicesPanel } = await import(
			'$lib/components/service/DashboardMyServicesPanel.svelte'
		);
		const { getByRole, queryByText } = render(DashboardMyServicesPanel, {});

		await waitFor(() => expect(hoisted.mockFindMyServices).toHaveBeenCalled());
		const statusFilter = getByRole('button', { name: 'Filter by status' });
		expect(statusFilter).toHaveTextContent('All');
		expect(queryByText('Active service')).toBeTruthy();
		expect(queryByText('Inactive service')).toBeTruthy();

		await fireEvent.click(statusFilter);
		await fireEvent.click(getByRole('option', { name: 'Active' }));
		expect(queryByText('Active service')).toBeTruthy();
		expect(queryByText('Inactive service')).toBeNull();

		await fireEvent.click(statusFilter);
		await fireEvent.click(getByRole('option', { name: 'Inactive' }));
		expect(queryByText('Active service')).toBeNull();
		expect(queryByText('Inactive service')).toBeTruthy();

		await fireEvent.click(statusFilter);
		await fireEvent.click(getByRole('option', { name: 'All' }));
		expect(queryByText('Active service')).toBeTruthy();
		expect(queryByText('Inactive service')).toBeTruthy();
	});

	it('shows a filtered empty state when the selected status has no matching services', async () => {
		hoisted.mockFindMyServices.mockResolvedValueOnce({
			services: [
				createService({
					id: 'service-event-active-only',
					uniqueId: 'service-active-only',
					title: 'Only active service',
					status: 'active'
				})
			]
		});

		const { default: DashboardMyServicesPanel } = await import(
			'$lib/components/service/DashboardMyServicesPanel.svelte'
		);
		const { getByRole, getByTestId, getByText, queryByText } = render(DashboardMyServicesPanel, {});

		await waitFor(() => expect(hoisted.mockFindMyServices).toHaveBeenCalled());
		await fireEvent.click(getByRole('button', { name: 'Filter by status' }));
		await fireEvent.click(getByRole('option', { name: 'Inactive' }));

		expect(getByTestId('dashboard-my-services-filtered-empty-state')).toBeTruthy();
		expect(getByText('No services match this filter.')).toBeTruthy();
		expect(queryByText('Only active service')).toBeNull();

		await fireEvent.click(getByRole('button', { name: 'Show all services' }));
		expect(queryByText('Only active service')).toBeTruthy();
	});

	it('paginates the my services list with numbered controls', async () => {
		hoisted.mockFindMyServices.mockResolvedValueOnce({
			services: Array.from({ length: 13 }, (_, index) =>
				createService({
					id: `service-event-${index + 1}`,
					uniqueId: `service-${index + 1}`,
					title: `Service ${index + 1}`,
					createdAt: 1_700_000_000 + index
				})
			)
		});

		const { default: DashboardMyServicesPanel } = await import(
			'$lib/components/service/DashboardMyServicesPanel.svelte'
		);
		const { getByRole, queryByText } = render(DashboardMyServicesPanel, {});

		await waitFor(() => expect(hoisted.mockFindMyServices).toHaveBeenCalled());
		expect(getByRole('button', { name: '2' })).toBeTruthy();
		expect(queryByText('Service 13')).toBeTruthy();
		expect(queryByText('Service 1')).toBeNull();

		await fireEvent.click(getByRole('button', { name: '2' }));
		expect(queryByText('Service 13')).toBeNull();
		expect(queryByText('Service 1')).toBeTruthy();
	});

	it('hides the shortcut when only terminal service contracts exist', async () => {
		hoisted.contractStoreState.set({
			contracts: [createContract('escrow-final', EscrowStatus.FundsReleased, 1_700_000_020)]
		});

		const { default: DashboardMyServicesPanel } = await import(
			'$lib/components/service/DashboardMyServicesPanel.svelte'
		);
		const { queryByText } = render(DashboardMyServicesPanel, {});

		await waitFor(() => expect(hoisted.mockFindMyServices).toHaveBeenCalled());
		expect(queryByText('View Active Contracts')).toBeNull();
	});

	it('keeps the provider proposal drawer unblocked in quotes view', async () => {
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
			providerLoadedByService: {
				[serviceAddress]: true
			},
			providerDataFreshnessByService: {
				[serviceAddress]: 'fresh'
			},
			focusSync: {
				requestId: null,
				serviceAddress: null,
				expiresAt: null
			}
		});

		const { default: DashboardServiceRequestsPanel } = await import(
			'$lib/components/service/DashboardServiceRequestsPanel.svelte'
		);
		const { getAllByRole, queryByText } = render(DashboardServiceRequestsPanel, {
			selectedServiceAddress: serviceAddress,
			focusedRequestId: 'qr_valid123'
		});

		await waitFor(() => expect(hoisted.mockFindMyServices).toHaveBeenCalled());
		await waitFor(() => expect(hoisted.mockLoadProviderTimelines).toHaveBeenCalled());
		expect(queryByText('Choose a freelancer fee tier before sending a proposal.')).toBeNull();
		expect(getAllByRole('button', { name: 'Send Proposal' }).length).toBeGreaterThan(0);
		expect(
			(getAllByRole('button', { name: 'Send Proposal' }).at(-1) as HTMLButtonElement).disabled
		).toBe(false);
	}, 20_000);

	it('does not reload provider timelines when the selected quotes route stays the same', async () => {
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
			providerLoadedByService: {
				[serviceAddress]: true
			},
			providerDataFreshnessByService: {
				[serviceAddress]: 'fresh'
			},
			focusSync: {
				requestId: null,
				serviceAddress: null,
				expiresAt: null
			}
		});

		const { default: DashboardServiceRequestsPanel } = await import(
			'$lib/components/service/DashboardServiceRequestsPanel.svelte'
		);
		const { rerender } = render(DashboardServiceRequestsPanel, {
			selectedServiceAddress: serviceAddress,
			focusedRequestId: 'qr_valid123'
		});

		await waitFor(() => expect(hoisted.mockLoadProviderTimelines).toHaveBeenCalled());
		const initialCallCount = hoisted.mockLoadProviderTimelines.mock.calls.length;

		await rerender({
			selectedServiceAddress: serviceAddress,
			focusedRequestId: 'qr_valid123'
		});

		await waitFor(() =>
			expect(hoisted.mockLoadProviderTimelines).toHaveBeenCalledTimes(initialCallCount)
		);
	}, 20_000);

	it('refetches the full selected-service inbox when a focused request is cleared', async () => {
		const service = createService();
		const serviceAddress = `30402:${service.npub}:${service.uniqueId ?? service.id}`;
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
			providerLoadedByService: {
				[serviceAddress]: true
			},
			providerDataFreshnessByService: {
				[serviceAddress]: 'fresh'
			},
			focusSync: {
				requestId: null,
				serviceAddress: null,
				expiresAt: null
			}
		});

		const { default: DashboardServiceRequestsPanel } = await import(
			'$lib/components/service/DashboardServiceRequestsPanel.svelte'
		);
		const { rerender } = render(DashboardServiceRequestsPanel, {
			selectedServiceAddress: serviceAddress,
			focusedRequestId: 'qr_valid123'
		});

		await waitFor(() => expect(hoisted.mockLoadProviderTimelines).toHaveBeenCalled());
		const initialCallCount = hoisted.mockLoadProviderTimelines.mock.calls.length;

		await rerender({
			selectedServiceAddress: serviceAddress,
			focusedRequestId: null
		});

		await waitFor(() =>
			expect(hoisted.mockLoadProviderTimelines).toHaveBeenCalledTimes(initialCallCount + 1)
		);
		expect(hoisted.mockLoadProviderTimelines.mock.calls.at(-1)).toEqual([serviceAddress, null]);
	}, 20_000);

	it('refetches the selected-service inbox when the focused request changes', async () => {
		const service = createService();
		const serviceAddress = `30402:${service.npub}:${service.uniqueId ?? service.id}`;
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
			providerLoadedByService: {
				[serviceAddress]: true
			},
			providerDataFreshnessByService: {
				[serviceAddress]: 'fresh'
			},
			focusSync: {
				requestId: null,
				serviceAddress: null,
				expiresAt: null
			}
		});

		const { default: DashboardServiceRequestsPanel } = await import(
			'$lib/components/service/DashboardServiceRequestsPanel.svelte'
		);
		const { rerender } = render(DashboardServiceRequestsPanel, {
			selectedServiceAddress: serviceAddress,
			focusedRequestId: 'qr_valid123'
		});

		await waitFor(() => expect(hoisted.mockLoadProviderTimelines).toHaveBeenCalled());
		const initialCallCount = hoisted.mockLoadProviderTimelines.mock.calls.length;

		await rerender({
			selectedServiceAddress: serviceAddress,
			focusedRequestId: 'qr_valid456'
		});

		await waitFor(() =>
			expect(hoisted.mockLoadProviderTimelines).toHaveBeenCalledTimes(initialCallCount + 2)
		);
		expect(hoisted.mockLoadProviderTimelines.mock.calls.slice(-2)).toEqual([
			[serviceAddress, 'qr_valid456'],
			[serviceAddress, null]
		]);
	}, 20_000);

	it('keeps the requests workspace visible when service discovery fails after provider timelines already exist', async () => {
		const service = createService();
		const serviceAddress = `30402:${service.npub}:${service.uniqueId ?? service.id}`;
		hoisted.mockFindMyServices.mockRejectedValueOnce(new Error('service lookup failed'));
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
			providerLoadedByService: {
				[serviceAddress]: true
			},
			providerDataFreshnessByService: {
				[serviceAddress]: 'fresh'
			},
			focusSync: {
				requestId: null,
				serviceAddress: null,
				expiresAt: null
			}
		});

		const { default: DashboardServiceRequestsPanel } = await import(
			'$lib/components/service/DashboardServiceRequestsPanel.svelte'
		);
		const { getByTestId, getByText } = render(DashboardServiceRequestsPanel, {
			selectedServiceAddress: serviceAddress,
			focusedRequestId: 'qr_valid123'
		});

		await waitFor(() => expect(hoisted.mockFindMyServices).toHaveBeenCalled());
		await waitFor(() =>
			expect(hoisted.mockLoadProviderTimelines).toHaveBeenCalledWith(serviceAddress, 'qr_valid123')
		);
		expect(getByText(/service lookup failed/i)).toBeTruthy();
		expect(getByTestId('service-quotes-summary-card')).toBeTruthy();
	}, 20_000);

	it('reloads a selected deleted-service timeline even when it is not returned by findMyServices', async () => {
		const service = createService();
		const serviceAddress = `30402:${service.npub}:${service.uniqueId ?? service.id}`;
		hoisted.mockFindMyServices.mockResolvedValueOnce({
			services: []
		});

		const { default: DashboardServiceRequestsPanel } = await import(
			'$lib/components/service/DashboardServiceRequestsPanel.svelte'
		);
		render(DashboardServiceRequestsPanel, {
			selectedServiceAddress: serviceAddress,
			focusedRequestId: 'qr_valid123'
		});

		await waitFor(() => expect(hoisted.mockFindMyServices).toHaveBeenCalled());
		await waitFor(() =>
			expect(hoisted.mockLoadProviderTimelines).toHaveBeenCalledWith(serviceAddress, 'qr_valid123')
		);
	}, 20_000);

	it('loads only the selected service timeline when multiple services are available', async () => {
		const primaryService = createService();
		const secondaryService = createService({
			id: 'service-event-2',
			uniqueId: 'service-456',
			title: 'Accessibility Review'
		});
		const primaryServiceAddress = `30402:${primaryService.npub}:${
			primaryService.uniqueId ?? primaryService.id
		}`;
		const secondaryServiceAddress = `30402:${secondaryService.npub}:${
			secondaryService.uniqueId ?? secondaryService.id
		}`;
		hoisted.mockFindMyServices.mockResolvedValueOnce({
			services: [primaryService, secondaryService]
		});

		const { default: DashboardServiceRequestsPanel } = await import(
			'$lib/components/service/DashboardServiceRequestsPanel.svelte'
		);
		render(DashboardServiceRequestsPanel, {
			selectedServiceAddress: secondaryServiceAddress,
			focusedRequestId: 'qr_valid123'
		});

		await waitFor(() =>
			expect(hoisted.mockLoadProviderTimelines).toHaveBeenCalledWith(
				secondaryServiceAddress,
				'qr_valid123'
			)
		);
		expect(
			hoisted.mockLoadProviderTimelines.mock.calls.some(
				([serviceAddress]) => serviceAddress === primaryServiceAddress
			)
		).toBe(false);
	}, 20_000);

	it('batches all-services provider loads to avoid full fan-out concurrency', async () => {
		const services = Array.from({ length: 7 }, (_, index) =>
			createService({
				id: `service-event-${index + 1}`,
				uniqueId: `service-${index + 1}`,
				title: `Service ${index + 1}`
			})
		);
		let activeLoads = 0;
		let maxConcurrentLoads = 0;

		hoisted.mockFindMyServices.mockResolvedValueOnce({ services });
		hoisted.mockLoadProviderTimelines.mockImplementation(async () => {
			activeLoads += 1;
			maxConcurrentLoads = Math.max(maxConcurrentLoads, activeLoads);
			await new Promise((resolve) => setTimeout(resolve, 0));
			activeLoads -= 1;
			return [];
		});

		const { default: DashboardServiceRequestsPanel } = await import(
			'$lib/components/service/DashboardServiceRequestsPanel.svelte'
		);
		render(DashboardServiceRequestsPanel, {
			selectedServiceAddress: null,
			focusedRequestId: null
		});

		await waitFor(() => expect(hoisted.mockLoadProviderTimelines).toHaveBeenCalledTimes(7));
		expect(maxConcurrentLoads).toBeLessThanOrEqual(5);
	}, 20_000);

	it('keeps the all-services workspace visible when one service fails after another loaded', async () => {
		const primaryService = createService();
		const secondaryService = createService({
			id: 'service-event-2',
			uniqueId: 'service-456',
			title: 'Accessibility Review'
		});
		const primaryServiceAddress = `30402:${primaryService.npub}:${
			primaryService.uniqueId ?? primaryService.id
		}`;
		const secondaryServiceAddress = `30402:${secondaryService.npub}:${
			secondaryService.uniqueId ?? secondaryService.id
		}`;
		hoisted.mockFindMyServices.mockResolvedValueOnce({
			services: [primaryService, secondaryService]
		});
		hoisted.serviceQuoteUiState.set({
			providerTimelinesByService: {
				[primaryServiceAddress]: [createTimeline(primaryService)],
				[secondaryServiceAddress]: []
			},
			loadingProviderByService: {
				[primaryServiceAddress]: false,
				[secondaryServiceAddress]: false
			},
			providerLoadErrorByService: {
				[primaryServiceAddress]: null,
				[secondaryServiceAddress]: 'provider query failed'
			},
			providerLoadedByService: {
				[primaryServiceAddress]: true,
				[secondaryServiceAddress]: false
			},
			providerDataFreshnessByService: {
				[primaryServiceAddress]: 'fresh',
				[secondaryServiceAddress]: 'fresh'
			},
			focusSync: {
				requestId: null,
				serviceAddress: null,
				expiresAt: null
			}
		});

		const { default: DashboardServiceRequestsPanel } = await import(
			'$lib/components/service/DashboardServiceRequestsPanel.svelte'
		);
		const { getByTestId, getByText, queryByText } = render(DashboardServiceRequestsPanel, {
			selectedServiceAddress: null,
			focusedRequestId: null
		});

		await waitFor(() => expect(hoisted.mockFindMyServices).toHaveBeenCalled());
		expect(getByTestId('service-quotes-summary-card')).toBeTruthy();
		expect(getByText('provider query failed')).toBeTruthy();
		expect(queryByText('Retry to load quote requests for this service.')).toBeNull();
	}, 20_000);

	it('renders a refresh button beside the service filter and forces a provider reload', async () => {
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
			providerLoadedByService: {
				[serviceAddress]: true
			},
			providerDataFreshnessByService: {
				[serviceAddress]: 'fresh'
			},
			focusSync: {
				requestId: null,
				serviceAddress: null,
				expiresAt: null
			}
		});

		const { default: DashboardServiceRequestsPanel } = await import(
			'$lib/components/service/DashboardServiceRequestsPanel.svelte'
		);
		const { getByTestId } = render(DashboardServiceRequestsPanel, {
			selectedServiceAddress: serviceAddress,
			focusedRequestId: 'qr_valid123'
		});

		await waitFor(() => expect(hoisted.mockLoadProviderTimelines).toHaveBeenCalled());
		hoisted.mockLoadProviderTimelines.mockClear();
		await fireEvent.click(getByTestId('service-request-refresh'));
		await waitFor(() =>
			expect(hoisted.mockLoadProviderTimelines).toHaveBeenCalledWith(
				serviceAddress,
				'qr_valid123',
				{ force: true }
			)
		);
	}, 20_000);

	it('defaults the quotes workspace to all services without forcing a route update', async () => {
		const onResolveQuotesRoute = vi.fn();

		hoisted.mockFindMyServices.mockResolvedValueOnce({
			services: [createService()]
		});

		const { default: DashboardServiceRequestsPanel } = await import(
			'$lib/components/service/DashboardServiceRequestsPanel.svelte'
		);
		const { getByRole } = render(DashboardServiceRequestsPanel, {
			selectedServiceAddress: null,
			focusedRequestId: null,
			onResolveQuotesRoute
		});

		await waitFor(() => expect(hoisted.mockFindMyServices).toHaveBeenCalled());
		expect(getByRole('combobox', { name: 'Filter by service' })).toHaveValue('');
		expect(onResolveQuotesRoute).not.toHaveBeenCalled();
	});

	it('filters the quotes workspace by the selected service from the dropdown', async () => {
		const primaryService = createService();
		const secondaryService = createService({
			id: 'service-event-2',
			uniqueId: 'service-456',
			title: 'Accessibility Review'
		});
		const secondaryServiceAddress = `30402:${secondaryService.npub}:${
			secondaryService.uniqueId ?? secondaryService.id
		}`;
		const onResolveQuotesRoute = vi.fn();

		hoisted.mockFindMyServices.mockResolvedValueOnce({
			services: [primaryService, secondaryService]
		});

		const { default: DashboardServiceRequestsPanel } = await import(
			'$lib/components/service/DashboardServiceRequestsPanel.svelte'
		);
		const { getByRole } = render(DashboardServiceRequestsPanel, {
			selectedServiceAddress: null,
			focusedRequestId: null,
			onResolveQuotesRoute
		});

		await waitFor(() => expect(hoisted.mockFindMyServices).toHaveBeenCalled());
		await fireEvent.change(getByRole('combobox', { name: 'Filter by service' }), {
			target: { value: secondaryServiceAddress }
		});

		expect(onResolveQuotesRoute).toHaveBeenCalledWith({
			type: 'service',
			serviceAddress: secondaryServiceAddress,
			requestId: null
		});
	});

	it('clears the service filter when the dropdown switches back to all services', async () => {
		const service = createService();
		const serviceAddress = `30402:${service.npub}:${service.uniqueId ?? service.id}`;
		const onResolveQuotesRoute = vi.fn();

		hoisted.mockFindMyServices.mockResolvedValueOnce({
			services: [service]
		});

		const { default: DashboardServiceRequestsPanel } = await import(
			'$lib/components/service/DashboardServiceRequestsPanel.svelte'
		);
		const { getByRole } = render(DashboardServiceRequestsPanel, {
			selectedServiceAddress: serviceAddress,
			focusedRequestId: 'qr_valid123',
			onResolveQuotesRoute
		});

		await waitFor(() => expect(hoisted.mockFindMyServices).toHaveBeenCalled());
		await fireEvent.change(getByRole('combobox', { name: 'Filter by service' }), {
			target: { value: '' }
		});

		expect(onResolveQuotesRoute).toHaveBeenCalledWith({ type: 'reset' });
	});

	it('keeps proposal entry available in the requests workspace when wallet information is missing', async () => {
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
			providerLoadedByService: {
				[serviceAddress]: true
			},
			providerDataFreshnessByService: {
				[serviceAddress]: 'fresh'
			},
			focusSync: {
				requestId: null,
				serviceAddress: null,
				expiresAt: null
			}
		});
		hoisted.walletStore.set({
			rsk: {
				address: null
			}
		});

		const { default: DashboardServiceRequestsPanel } = await import(
			'$lib/components/service/DashboardServiceRequestsPanel.svelte'
		);
		const { getAllByRole, queryByText } = render(DashboardServiceRequestsPanel, {
			selectedServiceAddress: serviceAddress,
			focusedRequestId: 'qr_valid123'
		});

		await waitFor(() => expect(hoisted.mockFindMyServices).toHaveBeenCalled());
		await waitFor(() => expect(hoisted.mockLoadProviderTimelines).toHaveBeenCalled());
		expect(queryByText('Connect your wallet before sending a proposal.')).toBeNull();
		expect(getAllByRole('button', { name: 'Send Proposal' }).length).toBeGreaterThan(0);
		expect(
			getAllByRole('button', { name: 'Send Proposal' }).some((button) => !button.disabled)
		).toBe(true);
	});

	it('warns about open quote threads but still allows deletion', async () => {
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
		const { getByRole, findByText, findByRole, queryByText } = render(DashboardMyServicesPanel, {});

		await waitFor(() => expect(hoisted.mockFindMyServices).toHaveBeenCalled());
		await fireEvent.click(getByRole('button', { name: 'Details' }));
		await fireEvent.click(await findByRole('button', { name: 'Delete Service' }));
		expect(await findByText(/This service still has 1 open request/i)).toBeTruthy();
		expect(queryByText(/Active service contracts are still attached to this service/i)).toBeNull();
	});

	it('blocks deletion when an active service contract exists outside the first store page', async () => {
		const unrelatedContracts = Array.from({ length: 5 }, (_, index) => {
			const contract = createContract(
				`escrow-other-${index + 1}`,
				EscrowStatus.Funded,
				1_700_000_000 + index
			);
			return {
				...contract,
				contractEvent: {
					...contract.contractEvent,
					content: {
						...contract.contractEvent.content,
						contextId: `service-other-${index + 1}`,
						serviceId: `service-other-${index + 1}`,
						serviceAddress: `30402:${'a'.repeat(64)}:service-other-${index + 1}`,
						serviceTitle: `Other service ${index + 1}`
					}
				}
			} as ContractWithEvents;
		});
		const hiddenRelevantContract = createContract(
			'escrow-hidden',
			EscrowStatus.Funded,
			1_700_000_100
		);

		hoisted.contractStoreState.set({
			contracts: unrelatedContracts
		});
		hoisted.mockEscrowGetContracts.mockImplementation(async () => [
			...unrelatedContracts,
			hiddenRelevantContract
		]);

		const { default: DashboardMyServicesPanel } = await import(
			'$lib/components/service/DashboardMyServicesPanel.svelte'
		);
		const { getByRole, findByRole, findByText, queryByRole } = render(DashboardMyServicesPanel, {});

		await waitFor(() => expect(hoisted.mockFindMyServices).toHaveBeenCalled());
		await fireEvent.click(getByRole('button', { name: 'Details' }));
		await fireEvent.click(await findByRole('button', { name: 'Delete Service' }));

		expect(
			await findByText(/Active service contracts are still attached to this service/i)
		).toBeTruthy();
		expect(
			queryByRole('button', {
				name: /Confirm Delete|dashboard\.services\.my_services\.delete_modal\.confirm_delete/
			})
		).toBeNull();
		expect(hoisted.mockDeleteService).not.toHaveBeenCalled();
	}, 20_000);

	it('confirms deletion when no blockers remain and refreshes the list', async () => {
		const { default: DashboardMyServicesPanel } = await import(
			'$lib/components/service/DashboardMyServicesPanel.svelte'
		);
		const { getByRole, findByRole } = render(DashboardMyServicesPanel, {});

		await waitFor(() => expect(hoisted.mockFindMyServices).toHaveBeenCalledTimes(1));
		await fireEvent.click(getByRole('button', { name: 'Details' }));
		await fireEvent.click(await findByRole('button', { name: 'Delete Service' }));
		const confirmDeleteButton = await findByRole('button', {
			name: /Confirm Delete|dashboard\.services\.my_services\.delete_modal\.confirm_delete/
		});
		expect(confirmDeleteButton).toBeTruthy();
		await fireEvent.click(confirmDeleteButton);

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
		expect(hoisted.mockDeleteFile).toHaveBeenCalledWith(
			expect.objectContaining({
				key: 'service-image-key',
				cloudflareId: 'service-image-key',
				type: 'image'
			})
		);
		await waitFor(() => expect(hoisted.mockFindMyServices).toHaveBeenCalledTimes(2));
	});

	it('keeps a just-deleted service hidden while stale refetches catch up', async () => {
		const service = createService();
		hoisted.mockFindMyServices
			.mockResolvedValueOnce({
				services: [service]
			})
			.mockResolvedValueOnce({
				services: [service]
			});

		const { default: DashboardMyServicesPanel } = await import(
			'$lib/components/service/DashboardMyServicesPanel.svelte'
		);
		const { getByRole, findByRole, queryByRole, queryByTestId, queryByText } = render(
			DashboardMyServicesPanel,
			{}
		);

		await waitFor(() => expect(hoisted.mockFindMyServices).toHaveBeenCalledTimes(1));
		await fireEvent.click(getByRole('button', { name: 'Details' }));
		await fireEvent.click(await findByRole('button', { name: 'Delete Service' }));
		await fireEvent.click(await findByRole('button', { name: 'Confirm Delete' }));

		await waitFor(() => expect(hoisted.mockDeleteService).toHaveBeenCalledTimes(1));
		await waitFor(() => expect(hoisted.mockFindMyServices).toHaveBeenCalledTimes(2));

		expect(queryByTestId('pending-service-delete-alert')).toBeNull();
		expect(queryByRole('button', { name: 'Details' })).toBeNull();
		expect(queryByText('Brand Identity Sprint')).toBeNull();
	}, 20_000);
});
