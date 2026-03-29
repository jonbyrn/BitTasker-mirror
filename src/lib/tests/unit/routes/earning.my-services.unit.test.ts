import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/svelte';
import type { ContractWithEvents } from '$lib/types/contract';
import type { Service } from '$lib/types/service.d';
import { EscrowStatus } from '$lib/utils/escrow/v1/escrow.enum';
import { ServicePricingTypeEnum } from '$lib/utils/enums/service.enum';
import ContractsPanelStub from './fixtures/EarningContractsPanelStub.svelte';
import RequestsPanelStub from './fixtures/EarningRequestsPanelStub.svelte';
import ServiceCardStub from './fixtures/EarningServiceCardStub.svelte';
import SimplePanelStub from './fixtures/EarningSimplePanelStub.svelte';
import TabsStub from './fixtures/EarningTabsStub.svelte';
import { resetServiceDeleteUiState } from '$lib/stores/service-delete-ui.store';

const hoisted = vi.hoisted(() => {
	let currentUrl = new URL('https://example.test/earning?tab=my-services');

	return {
		get currentUrl() {
			return currentUrl;
		},
		setCurrentUrl(url: string) {
			currentUrl = new URL(url);
		},
		mockGoto: vi.fn(),
		mockFindMyServices: vi.fn(),
		mockUpdateService: vi.fn().mockResolvedValue(undefined),
		mockDeleteService: vi.fn().mockResolvedValue('deleted'),
		mockQueryTaskeeThreads: vi.fn().mockResolvedValue([]),
		mockGetCurrentPrice: vi.fn().mockResolvedValue(63_000),
		mockEscrowGetContracts: vi.fn().mockResolvedValue([]),
		mockLoadContracts: vi.fn().mockResolvedValue(undefined),
		mockShowSuccessToast: vi.fn(),
		mockShowErrorToast: vi.fn()
	};
});

vi.mock('svelte-i18n', async () => {
	const { readable } = await import('svelte/store');
	return {
		t: readable((key: string) => key)
	};
});

vi.mock('$app/environment', async () => {
	const actual = await vi.importActual<typeof import('$app/environment')>('$app/environment');
	return {
		...actual,
		browser: true,
		dev: false,
		building: false
	};
});

vi.mock('$app/navigation', () => ({
	goto: (...args: Parameters<typeof hoisted.mockGoto>) => hoisted.mockGoto(...args)
}));

vi.mock('$app/paths', () => ({
	resolve: (path: string) => path
}));

vi.mock('$app/state', () => ({
	get page() {
		return {
			url: hoisted.currentUrl
		};
	}
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

vi.mock('$lib/utils/service/media-cleanup', () => ({
	deleteServicePortfolioMedia: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('$lib/stores/contract.store', async () => {
	const { readable } = await import('svelte/store');
	return {
		contractStore: {
			subscribe: readable({ contracts: [] as ContractWithEvents[] }).subscribe,
			loadContracts: hoisted.mockLoadContracts
		}
	};
});

vi.mock('$lib/utils/escrow', async () => {
	const { EscrowStatus } = await import('$lib/utils/escrow/v1/escrow.enum');
	return {
		EscrowStatus,
		escrow: {
			contractOps: {
				getContracts: (...args: Parameters<typeof hoisted.mockEscrowGetContracts>) =>
					hoisted.mockEscrowGetContracts(...args)
			}
		}
	};
});

vi.mock('$lib/stores/app.store', async () => {
	const { readable } = await import('svelte/store');
	return {
		appStore: {
			subscribe: readable({}).subscribe,
			showSuccessToast: (...args: Parameters<typeof hoisted.mockShowSuccessToast>) =>
				hoisted.mockShowSuccessToast(...args),
			showErrorToast: (...args: Parameters<typeof hoisted.mockShowErrorToast>) =>
				hoisted.mockShowErrorToast(...args)
		}
	};
});

vi.mock('$lib/stores/service-quote-ui.store', () => ({
	buildServiceAddress: (service: { npub: string; uniqueId?: string; id: string }) =>
		`30402:${service.npub}:${service.uniqueId ?? service.id}`,
	serviceQuoteUiStore: {
		subscribe(run: (value: { nonBlockingMessageCode: string | null }) => void) {
			run({ nonBlockingMessageCode: null });
			return () => {};
		},
		setNonBlockingMessage: vi.fn()
	}
}));

vi.mock('$lib/components/Tabs.svelte', () => ({ default: TabsStub }));
vi.mock('$lib/components/bidding/DashboardBidsPanel.svelte', () => ({
	default: SimplePanelStub
}));
vi.mock('$lib/components/contracts/DashboardContractsPanel.svelte', () => ({
	default: ContractsPanelStub
}));
vi.mock('$lib/components/task/DashboardSavedSearchesPanel.svelte', () => ({
	default: SimplePanelStub
}));
vi.mock('$lib/components/service/DashboardServiceCard.svelte', () => ({
	default: ServiceCardStub
}));
vi.mock('$lib/components/service/DashboardServiceRequestsPanel.svelte', () => ({
	default: RequestsPanelStub
}));
vi.mock('$lib/components/Modal.svelte', () => ({
	default: () => null
}));
vi.mock('$lib/components/service/ServiceDrawer.svelte', () => ({
	default: () => null
}));
vi.mock('$lib/components/shared/DashboardEmptyState.svelte', () => ({
	default: () => null
}));
vi.mock('$lib/components/ErrorAlertWithModal.svelte', () => ({
	default: () => null
}));

function createService(overrides: Partial<Service> = {}): Service {
	return {
		id: 'service-event-1',
		uniqueId: 'service-123',
		npub: 'a'.repeat(64),
		status: 'active',
		title: 'Brand Identity Sprint',
		description: 'Logo, color palette, and social avatar pack.',
		portfolio: [],
		serviceLocationTypes: [],
		pricing: {
			type: ServicePricingTypeEnum.FIXED,
			currency: 'USDt',
			amount: 200
		},
		skills: [],
		categories: [],
		createdAt: 1_700_000_000,
		...overrides
	} as Service;
}

function createContract(service: Service, escrowId = 'escrow-123'): ContractWithEvents {
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
				status: EscrowStatus.Funded,
				estimatedStartTime: 1_700_010_000,
				estimatedCompletionTime: 1_700_020_000,
				type: 'contract',
				contextType: 'service',
				contextId: service.uniqueId,
				serviceId: service.uniqueId,
				serviceAddress: `30402:${service.npub}:${service.uniqueId ?? service.id}`,
				serviceTitle: service.title
			}
		},
		statusEvents: [],
		isClient: false,
		blockchainStatus: EscrowStatus.Funded,
		escrowData: { id: escrowId } as ContractWithEvents['escrowData'],
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

async function renderEarningPage() {
	const { default: EarningPage } = await import(
		'../../../../routes/(protected)/earning/+page.svelte'
	);
	return render(EarningPage);
}

describe('earning my-services integration', () => {
	beforeEach(() => {
		cleanup();
		resetServiceDeleteUiState();
		vi.clearAllMocks();
		hoisted.setCurrentUrl('https://example.test/earning?tab=my-services');
		hoisted.mockEscrowGetContracts.mockResolvedValue([]);
		hoisted.mockFindMyServices.mockResolvedValue({
			services: [createService()]
		});
	});

	it('routes the real my-services requests action to the earning requests tab', async () => {
		const service = createService();
		hoisted.mockFindMyServices.mockResolvedValueOnce({ services: [service] });

		const { findByRole } = await renderEarningPage();
		await fireEvent.click(await findByRole('button', { name: 'Requests' }));

		const serviceAddress = `30402:${service.npub}:${service.uniqueId ?? service.id}`;
		await waitFor(() => {
			expect(hoisted.mockGoto).toHaveBeenCalledWith(
				`https://example.test/earning?tab=requests&service=${encodeURIComponent(serviceAddress)}`,
				expect.objectContaining({
					replaceState: true,
					keepFocus: true,
					noScroll: true
				})
			);
		});
	}, 20_000);

	it('routes the real my-services contracts action to the earning contracts tab', async () => {
		const service = createService();
		hoisted.mockFindMyServices.mockResolvedValueOnce({ services: [service] });
		hoisted.mockEscrowGetContracts.mockResolvedValueOnce([createContract(service, 'escrow-live')]);

		const { findByRole } = await renderEarningPage();
		await fireEvent.click(await findByRole('button', { name: 'Contracts' }));

		const serviceAddress = `30402:${service.npub}:${service.uniqueId ?? service.id}`;
		await waitFor(() => {
			expect(hoisted.mockGoto).toHaveBeenCalledWith(
				`/earning?tab=contracts&context=services&highlight=escrow-live&service=${encodeURIComponent(serviceAddress)}`
			);
		});
	}, 20_000);
});
