import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, waitFor } from '@testing-library/svelte';
import { readable } from 'svelte/store';

const hoisted = vi.hoisted(() => {
	let serviceQuoteState = {
		taskerTimelines: [] as Array<unknown>,
		loadingTasker: false,
		taskerLoadError: null as string | null,
		taskerLoaded: true,
		nonBlockingMessageCode: null as string | null
	};
	const serviceQuoteSubscribers = new Set<(value: typeof serviceQuoteState) => void>();
	const page = {
		url: new URL('http://localhost/dashboard?tab=service-requests&view=tasker&request=qr_missing99')
	};
	const goto = vi.fn(async (url: string | URL) => {
		page.url = new URL(url.toString(), page.url);
	});
	const serviceQuoteUiStore = {
		subscribe(run: (value: typeof serviceQuoteState) => void) {
			run(serviceQuoteState);
			serviceQuoteSubscribers.add(run);
			return () => serviceQuoteSubscribers.delete(run);
		},
		parseDashboardQuery: vi.fn((searchParams: URLSearchParams) => ({
			state: {
				tab: 'service-requests',
				view: 'tasker',
				context: 'all',
				serviceAddress: null,
				requestId: searchParams.get('request'),
				highlight: null
			},
			changed: false,
			searchParams: new URLSearchParams(searchParams.toString()),
			messageCode: serviceQuoteState.nonBlockingMessageCode
		})),
		loadTaskerTimelines: vi.fn().mockResolvedValue([]),
		setNonBlockingMessage: vi.fn((messageCode: string | null) => {
			serviceQuoteState = {
				...serviceQuoteState,
				nonBlockingMessageCode: messageCode
			};
			serviceQuoteSubscribers.forEach((run) => run(serviceQuoteState));
		}),
		__setState(next: Partial<typeof serviceQuoteState>) {
			serviceQuoteState = {
				...serviceQuoteState,
				...next
			};
			serviceQuoteSubscribers.forEach((run) => run(serviceQuoteState));
		}
	};

	return {
		page,
		goto,
		serviceQuoteUiStore,
		contractCreationStore: {
			subscribe(run: (value: unknown) => void) {
				run(null);
				return () => {};
			}
		}
	};
});

vi.mock('$app/state', () => ({
	page: hoisted.page
}));

vi.mock('$app/navigation', () => ({
	goto: (...args: Parameters<typeof hoisted.goto>) => hoisted.goto(...args)
}));

vi.mock('svelte-i18n', async () => {
	const { readable } = await import('svelte/store');
	return {
		t: readable((key: string) => key)
	};
});

vi.mock('$lib/stores/service-quote-ui.store', () => ({
	serviceQuoteUiStore: hoisted.serviceQuoteUiStore,
	createDashboardUrl: (
		baseUrl: URL,
		updates: { tab?: string; view?: string; requestId?: string | null; status?: string | null }
	) => {
		const nextUrl = new URL(baseUrl.toString());
		if (updates.tab) {
			nextUrl.searchParams.set('tab', updates.tab);
		}
		if (updates.view) {
			nextUrl.searchParams.set('view', updates.view);
		}
		if (updates.requestId !== undefined) {
			if (updates.requestId === null) {
				nextUrl.searchParams.delete('request');
			} else {
				nextUrl.searchParams.set('request', updates.requestId);
			}
		}
		if (updates.status !== undefined) {
			if (updates.status === null) {
				nextUrl.searchParams.delete('status');
			} else {
				nextUrl.searchParams.set('status', updates.status);
			}
		}
		return nextUrl;
	},
	getTaskerTimelines: (state: { taskerTimelines: Array<unknown> }) => state.taskerTimelines,
	getTaskerDataFreshness: () => 'fresh',
	isRequestSyncActive: () => false
}));

vi.mock('$lib/utils/escrow/v1/escrowEvents', () => ({
	contractCreationStore: hoisted.contractCreationStore,
	retryPendingServiceAcceptanceByEscrowId: vi.fn().mockResolvedValue({ status: 'accepted' }),
	reverifyPublishedServiceAcceptanceByEscrowId: vi.fn().mockResolvedValue({ status: 'confirmed' })
}));

vi.mock('$lib/utils/service-quote/acceptance-ledger', () => ({
	getAcceptanceReplayEntriesDueForRetry: vi.fn().mockReturnValue([]),
	getAcceptanceConfirmedMonitorEntriesDueForReverify: vi.fn().mockReturnValue([]),
	SERVICE_ACCEPTANCE_REPLAY_RETRY_INTERVAL_MS: 30_000,
	SERVICE_ACCEPTANCE_CONFIRMED_MONITOR_REVERIFY_INTERVAL_MS: 30_000
}));

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

vi.mock('$lib/components/Tabs.svelte', () => ({ default: () => null }));
vi.mock('$lib/components/task/TaskDrawer.svelte', () => ({ default: () => null }));
vi.mock('$lib/components/task/DashboardTasksPanel.svelte', () => ({ default: () => null }));
vi.mock('$lib/components/contracts/DashboardContractsPanel.svelte', () => ({
	default: () => null
}));

vi.mock('$lib/nostr/service', () => ({
	findServiceByUniqueId: vi.fn().mockResolvedValue(null)
}));

vi.mock('$lib/utils/network-status', async () => {
	const { readable } = await import('svelte/store');
	return {
		browserNetworkStatus: readable({
			online: true,
			lastTransition: 'online'
		})
	};
});

vi.mock('$lib/stores/wallet.store', async () => {
	const { readable } = await import('svelte/store');
	return {
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
		allAssets: readable([]),
		totalBalances: readable({ sats: 0, rbtc: 0 }),
		formatSats: (value: number) => String(value),
		walletManager: {
			initialize: vi.fn().mockResolvedValue(undefined),
			loadAssets: vi.fn().mockResolvedValue(undefined)
		}
	};
});

vi.mock('$lib/api/services/crypto-price.service', () => ({
	default: {
		getCurrentPrice: vi.fn().mockResolvedValue(50_000)
	}
}));

vi.mock('$lib/utils/service-contract/preflight', () => ({
	preflightServiceContractCreation: vi.fn().mockResolvedValue({
		ok: true,
		totalRequired: '0.001'
	})
}));

describe('dashboard service requests route shell', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		hoisted.page.url = new URL(
			'http://localhost/dashboard?tab=service-requests&view=tasker&request=qr_missing99'
		);
		hoisted.serviceQuoteUiStore.__setState({
			taskerTimelines: [],
			loadingTasker: false,
			taskerLoadError: null,
			taskerLoaded: true,
			nonBlockingMessageCode: null
		});
	});

	it('loads tasker timelines using the focused request id from the service-requests route', async () => {
		render((await import('../../../../routes/(protected)/dashboard/+page.svelte')).default);

		await waitFor(() => {
			expect(hoisted.serviceQuoteUiStore.loadTaskerTimelines).toHaveBeenCalledWith('qr_missing99');
		});
	}, 20_000);

	it.skip('clears invalid focused requests through the real service-requests panel wiring', async () => {
		const { getByText } = render(
			(await import('../../../../routes/(protected)/dashboard/+page.svelte')).default
		);

		await waitFor(() => {
			expect(hoisted.serviceQuoteUiStore.setNonBlockingMessage).toHaveBeenCalledWith(
				'service_requests_request_not_found'
			);
			expect(hoisted.goto).toHaveBeenCalledWith(
				'http://localhost/dashboard?tab=service-requests&view=tasker',
				expect.objectContaining({
					replaceState: true,
					keepFocus: true,
					noScroll: true
				})
			);
		});

		await waitFor(() => {
			expect(getByText('No service requests have been submitted yet.')).toBeTruthy();
		});
	}, 20_000);
});
