import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, waitFor } from '@testing-library/svelte';
import { readable, writable } from 'svelte/store';

const hoisted = vi.hoisted(() => {
	let contractCreationValue: unknown = null;
	const subscribers = new Set<(value: unknown) => void>();
	const contractCreationStore = {
		subscribe(run: (value: unknown) => void) {
			run(contractCreationValue);
			subscribers.add(run);
			return () => subscribers.delete(run);
		},
		set(value: unknown) {
			contractCreationValue = value;
			subscribers.forEach((run) => run(contractCreationValue));
		}
	};
	return {
		page: {
			url: new URL(
				'http://localhost/dashboard?tab=contracts&context=services&highlight=svc-replay-123'
			)
		},
		goto: vi.fn(),
		parseDashboardQuery: vi.fn(() => ({
			state: {
				tab: 'contracts',
				view: 'default',
				context: 'services',
				serviceAddress: null,
				requestId: null,
				highlight: 'svc-replay-123'
			},
			changed: false,
			searchParams: new URLSearchParams('tab=contracts&context=services&highlight=svc-replay-123'),
			messageCode: null
		})),
		loadTaskerTimelines: vi.fn().mockResolvedValue(undefined),
		setNonBlockingMessage: vi.fn(),
		retryPendingServiceAcceptanceByEscrowId: vi.fn().mockResolvedValue({ status: 'accepted' }),
		reverifyPublishedServiceAcceptanceByEscrowId: vi.fn().mockResolvedValue({ status: 'confirmed' }),
		contractCreationStore
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
	serviceQuoteUiStore: {
		subscribe(run: (value: any) => void) {
			run({
				loadingTasker: false,
				taskerLoadError: null,
				taskerLoaded: true,
				nonBlockingMessageCode: null
			});
			return () => {};
		},
		parseDashboardQuery: (...args: Parameters<typeof hoisted.parseDashboardQuery>) =>
			hoisted.parseDashboardQuery(...args),
		loadTaskerTimelines: (...args: Parameters<typeof hoisted.loadTaskerTimelines>) =>
			hoisted.loadTaskerTimelines(...args),
		setNonBlockingMessage: (...args: Parameters<typeof hoisted.setNonBlockingMessage>) =>
			hoisted.setNonBlockingMessage(...args)
	},
	createDashboardUrl: (url: URL) => new URL(url.toString()),
	getTaskerTimelines: () => [],
	isRequestSyncActive: () => false
}));

vi.mock('$lib/utils/escrow/v1/escrowEvents', () => ({
	contractCreationStore: hoisted.contractCreationStore,
	retryPendingServiceAcceptanceByEscrowId: (
		...args: Parameters<typeof hoisted.retryPendingServiceAcceptanceByEscrowId>
	) => hoisted.retryPendingServiceAcceptanceByEscrowId(...args)
	,
	reverifyPublishedServiceAcceptanceByEscrowId: (
		...args: Parameters<typeof hoisted.reverifyPublishedServiceAcceptanceByEscrowId>
	) => hoisted.reverifyPublishedServiceAcceptanceByEscrowId(...args)
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
vi.mock('$lib/components/task/DashboardSavedSearchesPanel.svelte', () => ({
	default: () => null
}));
vi.mock('$lib/components/bidding/DashboardBidsPanel.svelte', () => ({ default: () => null }));
vi.mock('$lib/components/contracts/DashboardContractsPanel.svelte', () => ({
	default: () => null
}));
vi.mock('$lib/components/service/DashboardMyServicesPanel.svelte', () => ({
	default: () => null
}));
vi.mock('$lib/components/dashboard/quotes/MyQuotesPanel.svelte', () => ({
	default: () => null
}));

describe('dashboard service acceptance replay', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		hoisted.contractCreationStore.set(null);
		hoisted.page.url = new URL(
			'http://localhost/dashboard?tab=contracts&context=services&highlight=svc-replay-123'
		);
		hoisted.parseDashboardQuery.mockReturnValue({
			state: {
				tab: 'contracts',
				view: 'default',
				context: 'services',
				serviceAddress: null,
				requestId: null,
				highlight: 'svc-replay-123'
			},
			changed: false,
			searchParams: new URLSearchParams('tab=contracts&context=services&highlight=svc-replay-123'),
			messageCode: null
		});
	});

	it(
		'retries deferred service acceptance when opening a highlighted service contract',
		async () => {
		const { unmount } = render(
			(await import('../../../../routes/(protected)/dashboard/+page.svelte')).default
		);

			await waitFor(
				() => {
					expect(hoisted.retryPendingServiceAcceptanceByEscrowId).toHaveBeenCalledWith(
						'svc-replay-123'
					);
				},
				{ timeout: 10_000 }
			);
			expect(hoisted.retryPendingServiceAcceptanceByEscrowId).toHaveBeenCalledTimes(1);
			unmount();
		},
		15_000
	);

	it(
		'reverifies due published service accepts on dashboard startup',
		async () => {
			const acceptanceLedgerModule = await import(
				'$lib/utils/service-quote/acceptance-ledger'
			);
			vi.mocked(
				acceptanceLedgerModule.getAcceptanceConfirmedMonitorEntriesDueForReverify
			).mockReturnValue([
				{
					escrowId: 'svc-monitor-123',
					proposalId: 'proposal-monitor-123',
					proposalEventId: 'proposal-event-id-monitor',
					quoteRequestId: 'request-monitor-123',
					serviceId: '30402:pub:dtag',
					serviceAddress: '30402:pub:dtag',
					counterpartyPubkey: 'npub1freelancer',
					transactionHash: '0xservice-monitor',
					createdAtMs: Date.now() - 60_000,
					lastUpdatedAtMs: Date.now() - 60_000,
					lastVerifiedAtMs: Date.now() - 60_000,
					attemptCount: 1,
					acceptanceSnapshot: {
						clientRskAddress: '0x3333333333333333333333333333333333333333',
						clientFeeTier: 1,
						freelancerRskAddress: '0x2222222222222222222222222222222222222222',
						freelancerFeeTier: 1,
						chainId: 31,
						contractAddress: '0x4444444444444444444444444444444444444444',
						conversionFormulaVersion: 'v1',
						conversionSnapshotId: 'snapshot-123',
						btcUsdRateMicros: 100_000_000_000,
						sourceTimestamp: 1_763_000_000,
						requiredConfirmations: 3,
						finalityPolicyVersion: 'rsk_rootstock_default_v1',
						sats: '100000',
						weiAmount: '1000000000000000',
						confirmationsAtVerification: 3,
						verificationRpc: 'rsk:testnet'
					}
				}
			]);

			const { unmount } = render(
				(await import('../../../../routes/(protected)/dashboard/+page.svelte')).default
			);

			await waitFor(
				() => {
					expect(hoisted.reverifyPublishedServiceAcceptanceByEscrowId).toHaveBeenCalledWith(
						'svc-monitor-123'
					);
				},
				{ timeout: 10_000 }
			);
			unmount();
		},
		15_000
	);
});
