import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, waitFor } from '@testing-library/svelte';
import { readable } from 'svelte/store';
import type { ServiceQuoteTimelineEntry } from '$lib/types/service-quote';

const hoisted = vi.hoisted(() => {
	type StoreState = {
		loadingTasker: boolean;
		taskerLoadError: string | null;
		taskerLoaded: boolean;
		nonBlockingMessageCode: string | null;
		taskerTimelines: ServiceQuoteTimelineEntry[];
	};

	let storeState: StoreState = {
		loadingTasker: false,
		taskerLoadError: null,
		taskerLoaded: true,
		nonBlockingMessageCode: null,
		taskerTimelines: []
	};
	const subscribers = new Set<(value: StoreState) => void>();

	const serviceQuoteUiStore = {
		subscribe(run: (value: StoreState) => void) {
			run(storeState);
			subscribers.add(run);
			return () => subscribers.delete(run);
		},
		setState(next: Partial<StoreState>) {
			storeState = {
				...storeState,
				...next
			};
			subscribers.forEach((run) => run(storeState));
		},
		reset() {
			storeState = {
				loadingTasker: false,
				taskerLoadError: null,
				taskerLoaded: true,
				nonBlockingMessageCode: null,
				taskerTimelines: []
			};
			subscribers.forEach((run) => run(storeState));
		}
	};

	const page = {
		url: new URL('http://localhost/dashboard?tab=quotes&view=tasker&request=qr_valid123')
	};

	const timeline = {
		request: {
			id: 'request-event-id',
			kind: 6420,
			pubkey: 'e'.repeat(64),
			created_at: 1_700_000_000,
			tags: [],
			content: {
				type: 'service-quote-request',
				quoteRequestId: 'qr_valid123',
				serviceId: `30402:${'d'.repeat(64)}:service-unique-id`,
				serviceAddress: `30402:${'d'.repeat(64)}:service-unique-id`,
				pricingType: 'INQUIRY_REQUIRED',
				inquiry: {
					title: 'Need a migration',
					description: 'Move our docs and preserve redirects.'
				},
				timestamp: 1_700_000_000,
				version: 'v1'
			},
			sig: ''
		},
		proposals: [
			{
				id: 'proposal-event-id',
				kind: 6421,
				pubkey: 'f'.repeat(64),
				created_at: 1_700_000_100,
				tags: [],
				content: {
					type: 'service-proposal',
					proposalId: 'pr_valid123',
					quoteRequestId: 'qr_valid123',
					serviceId: `30402:${'d'.repeat(64)}:service-unique-id`,
					serviceAddress: `30402:${'d'.repeat(64)}:service-unique-id`,
					paymentType: 'FIXED',
					amountUsdt: '125.00',
					description: 'Migration plus redirect validation.',
					estimatedDuration: '3 days',
					estimatedStartTime: 1_700_000_000,
					estimatedEndTime: 1_700_259_200,
					expirationDays: 3,
					expirationHours: 0,
					expirationTimestamp: 1_700_300_000,
					freelancerRskAddress: '0x1111111111111111111111111111111111111111',
					freelancerFeeTier: 1,
					pricingSnapshot: {
						serviceVersionRef: 'service-event-1'
					},
					timestamp: 1_700_000_100,
					version: 'v1'
				},
				sig: ''
			}
		],
		statusEventsByProposalId: {},
		latestProposal: {
			id: 'proposal-event-id',
			kind: 6421,
			pubkey: 'f'.repeat(64),
			created_at: 1_700_000_100,
			tags: [],
			content: {
				type: 'service-proposal',
				proposalId: 'pr_valid123',
				quoteRequestId: 'qr_valid123',
				serviceId: `30402:${'d'.repeat(64)}:service-unique-id`,
				serviceAddress: `30402:${'d'.repeat(64)}:service-unique-id`,
				paymentType: 'FIXED',
				amountUsdt: '125.00',
				description: 'Migration plus redirect validation.',
				estimatedDuration: '3 days',
				estimatedStartTime: 1_700_000_000,
				estimatedEndTime: 1_700_259_200,
				expirationDays: 3,
				expirationHours: 0,
				expirationTimestamp: 1_700_300_000,
				freelancerRskAddress: '0x1111111111111111111111111111111111111111',
				freelancerFeeTier: 1,
				pricingSnapshot: {
					serviceVersionRef: 'service-event-1'
				},
				timestamp: 1_700_000_100,
				version: 'v1'
			},
			sig: ''
		},
		resolvedStatus: 'pending',
		expirationTimestamp: 1_700_300_000,
		isExpired: false,
		linkedEscrowId: undefined
	};

	return {
		page,
		timeline,
		goto: vi.fn((url: string) => {
			page.url = new URL(url, page.url.origin);
		}),
		parseDashboardQuery: vi.fn(),
		loadTaskerTimelines: vi.fn().mockResolvedValue([]),
		getTaskerDataFreshness: vi.fn().mockReturnValue('fresh'),
		getProviderDataFreshness: vi.fn().mockReturnValue('fresh'),
		findServiceByUniqueId: vi.fn().mockResolvedValue({
			id: 'service-event-1',
			uniqueId: 'service-unique-id',
			title: 'Managed Migration Service'
		}),
		setNonBlockingMessage: vi.fn((messageCode: string | null) => {
			serviceQuoteUiStore.setState({ nonBlockingMessageCode: messageCode });
		}),
		serviceQuoteUiStore
	};
});

function createDashboardUrl(
	baseUrl: URL,
	updates: {
		tab?: string;
		view?: string;
		requestId?: string | null;
		context?: string;
		highlight?: string | null;
	}
) {
	const nextUrl = new URL(baseUrl.toString());
	if (updates.tab) {
		nextUrl.searchParams.set('tab', updates.tab);
	}

	if (updates.view) {
		nextUrl.searchParams.set('view', updates.view);
	} else {
		nextUrl.searchParams.delete('view');
	}

	if (updates.context) {
		nextUrl.searchParams.set('context', updates.context);
	} else if (updates.tab !== 'contracts') {
		nextUrl.searchParams.delete('context');
	}

	if ('requestId' in updates) {
		if (updates.requestId) {
			nextUrl.searchParams.set('request', updates.requestId);
		} else {
			nextUrl.searchParams.delete('request');
		}
	}

	if ('highlight' in updates) {
		if (updates.highlight) {
			nextUrl.searchParams.set('highlight', updates.highlight);
		} else {
			nextUrl.searchParams.delete('highlight');
		}
	}

	return nextUrl;
}

vi.mock('$app/state', () => ({
	page: hoisted.page
}));

vi.mock('$app/navigation', () => ({
	goto: (...args: Parameters<typeof hoisted.goto>) => hoisted.goto(...args)
}));

vi.mock('svelte-i18n', async () => {
	const { readable } = await import('svelte/store');
	return {
		t: readable((key: string) => key),
		locale: readable('en')
	};
});

vi.mock('$lib/nostr/service', () => ({
	findServiceByUniqueId: (...args: Parameters<typeof hoisted.findServiceByUniqueId>) =>
		hoisted.findServiceByUniqueId(...args)
}));

vi.mock('$lib/api/services/crypto-price.service', () => ({
	default: {
		getCurrentPrice: vi.fn().mockResolvedValue(50_000)
	}
}));

vi.mock('$lib/utils/service-contract/preflight', () => ({
	preflightServiceContractCreation: vi.fn().mockResolvedValue({
		ok: true,
		totalRequired: '0.00257250'
	})
}));

vi.mock('$lib/stores/wallet.store', () => ({
	walletStore: readable({
		rsk: {
			connected: true,
			connecting: false,
			error: null,
			address: '0x1111111111111111111111111111111111111111',
			wallet: {},
			provider: {}
		}
	}),
	allAssets: readable([
		{
			assetId: 'rbtc',
			usdValue: 250
		}
	]),
	totalBalances: readable({
		sats: 500_000,
		rbtc: 0.005
	}),
	formatSats: (value: number) => new Intl.NumberFormat('en-US').format(value),
	walletManager: {
		initialize: vi.fn().mockResolvedValue(undefined),
		loadAssets: vi.fn().mockResolvedValue(undefined)
	}
}));

vi.mock('$lib/stores/service-quote-ui.store', () => ({
	serviceQuoteUiStore: {
		subscribe: hoisted.serviceQuoteUiStore.subscribe,
		parseDashboardQuery: (...args: Parameters<typeof hoisted.parseDashboardQuery>) =>
			hoisted.parseDashboardQuery(...args),
		loadTaskerTimelines: (...args: Parameters<typeof hoisted.loadTaskerTimelines>) =>
			hoisted.loadTaskerTimelines(...args),
		getTaskerDataFreshness: (...args: Parameters<typeof hoisted.getTaskerDataFreshness>) =>
			hoisted.getTaskerDataFreshness(...args),
		getProviderDataFreshness: (...args: Parameters<typeof hoisted.getProviderDataFreshness>) =>
			hoisted.getProviderDataFreshness(...args),
		setNonBlockingMessage: (...args: Parameters<typeof hoisted.setNonBlockingMessage>) =>
			hoisted.setNonBlockingMessage(...args)
	},
	createDashboardUrl,
	getTaskerDataFreshness: (...args: Parameters<typeof hoisted.getTaskerDataFreshness>) =>
		hoisted.getTaskerDataFreshness(...args),
	getTaskerTimelines: (state: { taskerTimelines: ServiceQuoteTimelineEntry[] }) =>
		state.taskerTimelines,
	isRequestSyncActive: () => false
}));

vi.mock('$lib/components/user/UserInfoDisplay.svelte', () => ({
	default: (_result: unknown, props: { pubkey?: string; username?: string }) => ({
		$$render: () =>
			`<div data-testid="quote-card-user">${props.username ?? ''}|${props.pubkey ?? 'User info'}</div>`
	})
}));

vi.mock('$lib/components/service/ServiceTab.svelte', () => ({
	default: () => ({
		$$render: (_result: unknown, props: { service?: { title?: string } | null }) =>
			`<div data-testid="service-tab-mock">${props.service?.title ?? 'No service'}</div>`
	})
}));

vi.mock('$lib/components/Tabs.svelte', () => ({ default: () => null }));
vi.mock('$lib/components/task/TaskDrawer.svelte', () => ({ default: () => null }));
vi.mock('$lib/components/task/DashboardTasksPanel.svelte', () => ({ default: () => null }));
vi.mock('$lib/components/contracts/DashboardContractsPanel.svelte', () => ({
	default: () => null
}));
vi.mock('$lib/components/dashboard/quotes/MyQuotesPanel.svelte', async () => {
	const { default: Stub } = await import('./fixtures/DashboardHiringMyQuotesPanelStub.svelte');
	return {
		default: Stub
	};
});

vi.mock('$lib/stores/task.store', () => ({
	taskStore: readable({}),
	myTasksStore: readable({ items: [], loading: false, error: null, currentPage: 1, hasMore: false })
}));

vi.mock('$lib/nostr/task', () => ({
	deleteTask: vi.fn()
}));

vi.mock('$lib/utils/escrow', () => ({
	escrow: {
		contractOps: {
			getContracts: vi.fn().mockResolvedValue([])
		}
	}
}));

vi.mock('$lib/stores/app.store', () => ({
	appStore: {
		showErrorToast: vi.fn(),
		showSuccessToast: vi.fn(),
		showInfoToast: vi.fn()
	}
}));

vi.mock('$lib/utils/service-contract/pending-navigation', () => ({
	consumePendingServiceContractNavigationForContractsPage: vi.fn().mockReturnValue(null)
}));

vi.mock('$lib/utils/escrow/v1/escrowEvents', () => ({
	contractCreationStore: readable(null),
	retryPendingServiceAcceptanceByEscrowId: vi.fn().mockResolvedValue({ status: 'accepted' }),
	reverifyPublishedServiceAcceptanceByEscrowId: vi.fn().mockResolvedValue({ status: 'confirmed' })
}));

vi.mock('$lib/utils/service-quote/acceptance-ledger', () => ({
	getAcceptanceReplayEntriesDueForRetry: vi.fn().mockReturnValue([]),
	getAcceptanceConfirmedMonitorEntriesDueForReverify: vi.fn().mockReturnValue([]),
	SERVICE_ACCEPTANCE_REPLAY_RETRY_INTERVAL_MS: 30_000,
	SERVICE_ACCEPTANCE_CONFIRMED_MONITOR_REVERIFY_INTERVAL_MS: 30_000
}));

describe('dashboard hiring service requests route', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		hoisted.serviceQuoteUiStore.reset();
		hoisted.page.url = new URL(
			'http://localhost/dashboard?tab=quotes&view=tasker&request=qr_valid123'
		);
		hoisted.parseDashboardQuery.mockReturnValue({
			state: {
				tab: 'quotes',
				view: 'tasker',
				context: 'all',
				serviceAddress: null,
				requestId: 'qr_valid123',
				highlight: null
			},
			changed: false,
			searchParams: new URLSearchParams('tab=quotes&view=tasker&request=qr_valid123'),
			messageCode: null
		});
	});

	it('loads tasker timelines for the focused service request on the quotes tab', async () => {
		hoisted.serviceQuoteUiStore.setState({
			taskerLoaded: false,
			taskerTimelines: []
		});

		const routeModule = await import('../../../../routes/(protected)/dashboard/+page.svelte');
		render(routeModule.default);

		await waitFor(() => {
			expect(hoisted.loadTaskerTimelines).toHaveBeenCalledWith('qr_valid123');
		});
	});

	it('rewrites invalid focused requests to the canonical quotes URL and surfaces the message', async () => {
		hoisted.page.url = new URL(
			'http://localhost/dashboard?tab=quotes&view=tasker&request=qr_missing99'
		);
		hoisted.parseDashboardQuery.mockReturnValue({
			state: {
				tab: 'quotes',
				view: 'tasker',
				context: 'all',
				serviceAddress: null,
				requestId: 'qr_missing99',
				highlight: null
			},
			changed: false,
			searchParams: new URLSearchParams('tab=quotes&view=tasker&request=qr_missing99'),
			messageCode: null
		});
		hoisted.serviceQuoteUiStore.setState({
			taskerLoaded: true,
			taskerTimelines: [hoisted.timeline],
			loadingTasker: false
		});

		const routeModule = await import('../../../../routes/(protected)/dashboard/+page.svelte');
		const { getByText } = render(routeModule.default);

		await waitFor(() => {
			expect(hoisted.setNonBlockingMessage).toHaveBeenCalledWith('quotes_request_not_found');
		});
		await waitFor(() => {
			expect(hoisted.goto).toHaveBeenCalledWith(
				'http://localhost/dashboard?tab=quotes&view=tasker',
				expect.objectContaining({
					replaceState: true,
					keepFocus: true,
					noScroll: true
				})
			);
		});
		await waitFor(() => {
			expect(getByText('The requested quote thread could not be found.')).toBeTruthy();
		});
	});

	it('wires the quotes panel with the focused request id from the route', async () => {
		hoisted.serviceQuoteUiStore.setState({
			taskerLoaded: true,
			taskerTimelines: [hoisted.timeline],
			loadingTasker: false
		});

		const routeModule = await import('../../../../routes/(protected)/dashboard/+page.svelte');
		const { getByTestId } = render(routeModule.default);

		await waitFor(() => {
			expect(getByTestId('my-quotes-panel')).toHaveTextContent('qr_valid123');
		});
	});
});
