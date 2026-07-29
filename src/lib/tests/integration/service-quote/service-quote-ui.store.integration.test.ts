import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Service } from '$lib/types/service.d';
import type { ServiceQuoteTimelineEntry } from '$lib/types/service-quote';
import { ServicePricingTypeEnum } from '$lib/utils/enums/service.enum';
import { writable } from 'svelte/store';

const queryServiceQuotesForTasker = vi.fn();
const queryServiceQuotesForTaskee = vi.fn();
const publishServiceQuoteRequest = vi.fn();
const publishServiceProposal = vi.fn();
const publishServiceProposalStatus = vi.fn();
const createServiceContract = vi.fn();
const waitForContractCreationByTransactionHash = vi.fn(() => new Promise(() => undefined));
const getContractCreationTimeoutReason = vi.fn().mockReturnValue('pending_timeout');
const getNpub = vi.fn().mockResolvedValue('f'.repeat(64));
const walletStore = writable({
	rsk: {
		address: '0x1234567890123456789012345678901234567890'
	}
});

vi.mock('$lib/utils/nostrKeys', () => ({
	getNpub
}));

vi.mock('$lib/utils/service-quote/query', () => ({
	queryServiceQuotesForTasker,
	queryServiceQuotesForTaskee
}));

vi.mock('$lib/utils/service-quote/publish', () => ({
	publishServiceQuoteRequest,
	publishServiceProposal,
	publishServiceProposalStatus
}));

vi.mock('$lib/utils/service-contract/create', () => ({
	createServiceContract
}));

vi.mock('$lib/utils/service-contract/await-contract-creation', () => ({
	CONTRACT_CREATION_SYNCING_MESSAGE:
		'The escrow transaction was submitted, but the contract confirmation is still syncing. Open Contracts to monitor it.',
	waitForContractCreationByTransactionHash,
	getContractCreationTimeoutReason
}));

vi.mock('$lib/stores/wallet.store', () => ({
	walletStore
}));

vi.mock('$lib/nostr/service', () => ({
	findServiceByUniqueId: vi.fn().mockResolvedValue({
		id: 'service-event-1',
		npub: 'a'.repeat(64),
		uniqueId: 'service-unique-id',
		status: 'active',
		active: true,
		title: 'Brand Design',
		description: 'Identity system design.',
		serviceLocationTypes: [],
		pricing: {
			type: ServicePricingTypeEnum.INQUIRY_REQUIRED,
			currency: 'USD'
		},
		skills: [],
		categories: [],
		createdAt: 1
	})
}));

const service: Service = {
	id: 'service-event-1',
	npub: 'a'.repeat(64),
	uniqueId: 'service-unique-id',

	status: 'active',
	title: 'Brand Design',
	description: 'Identity system design.',
	serviceLocationTypes: [],
	pricing: {
		type: ServicePricingTypeEnum.INQUIRY_REQUIRED,
		currency: 'USD'
	},
	skills: [],
	categories: [],
	createdAt: 1
};

const serviceAddress = `30402:${service.npub}:${service.uniqueId}`;
const storeModulePromise = import('$lib/stores/service-quote-ui.store');

async function loadStoreModule() {
	const module = await storeModulePromise;
	module.serviceQuoteUiStore.reset();
	return module;
}

function createTimeline(
	overrides: Partial<ServiceQuoteTimelineEntry> = {}
): ServiceQuoteTimelineEntry {
	return {
		request: {
			id: 'request-event-1',
			kind: 6420,
			pubkey: '1'.repeat(64),
			created_at: 1,
			tags: [],
			content: {
				type: 'service-quote-request',
				quoteRequestId: 'qr_valid123',
				serviceId: serviceAddress,
				serviceAddress,
				pricingType: ServicePricingTypeEnum.INQUIRY_REQUIRED,
				inquiry: {
					title: 'Need a refreshed brand system',
					description: 'Logo, palette, and typography guidance.'
				},
				timestamp: 1,
				version: 'v1'
			},
			sig: ''
		},
		proposals: [
			{
				id: 'proposal-event-1',
				kind: 6421,
				pubkey: '2'.repeat(64),
				created_at: 2,
				tags: [],
				content: {
					type: 'service-proposal',
					proposalId: 'pr_valid123',
					quoteRequestId: 'qr_valid123',
					serviceId: serviceAddress,
					serviceAddress,
					paymentType: 'FIXED',
					amountUsdt: '125.00',
					description: 'Full brand system refresh.',
					estimatedDuration: '3 days',
					estimatedStartTime: 1_700_000_000,
					estimatedEndTime: 1_700_259_200,
					expirationDays: 3,
					expirationHours: 0,
					expirationTimestamp: 1_700_300_000,
					freelancerRskAddress: '0x1111111111111111111111111111111111111111',
					freelancerFeeTier: 1,
					pricingSnapshot: {
						serviceVersionRef: service.id
					},
					timestamp: 2,
					version: 'v1'
				},
				sig: ''
			}
		],
		statusEventsByProposalId: {},
		latestProposal: {
			id: 'proposal-event-1',
			kind: 6421,
			pubkey: '2'.repeat(64),
			created_at: 2,
			tags: [],
			content: {
				type: 'service-proposal',
				proposalId: 'pr_valid123',
				quoteRequestId: 'qr_valid123',
				serviceId: serviceAddress,
				serviceAddress,
				paymentType: 'FIXED',
				amountUsdt: '125.00',
				description: 'Full brand system refresh.',
				estimatedDuration: '3 days',
				estimatedStartTime: 1_700_000_000,
				estimatedEndTime: 1_700_259_200,
				expirationDays: 3,
				expirationHours: 0,
				expirationTimestamp: 1_700_300_000,
				freelancerRskAddress: '0x1111111111111111111111111111111111111111',
				freelancerFeeTier: 1,
				pricingSnapshot: {
					serviceVersionRef: service.id
				},
				timestamp: 2,
				version: 'v1'
			},
			sig: ''
		},
		resolvedStatus: 'pending',
		resolvedTerminalEvent: undefined,
		expirationTimestamp: 1_700_300_000,
		isExpired: false,
		linkedEscrowId: undefined,
		...overrides
	};
}

describe('serviceQuoteUiStore route contract', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		queryServiceQuotesForTasker.mockResolvedValue({ timelines: [] });
		queryServiceQuotesForTaskee.mockResolvedValue({ timelines: [] });
		publishServiceQuoteRequest.mockResolvedValue({
			event: { id: 'request-event-1' }
		});
		publishServiceProposal.mockResolvedValue({
			event: { id: 'proposal-event-1' }
		});
		publishServiceProposalStatus.mockResolvedValue({
			event: { id: 'status-event-1' }
		});
		createServiceContract.mockResolvedValue({
			success: true,
			transactionHash: '0xservicehash'
		});
		walletStore.set({
			rsk: {
				address: '0x1234567890123456789012345678901234567890'
			}
		});
	});

	it('canonicalizes quotes routes and strips out-of-scope params', async () => {
		const { serviceQuoteUiStore } = await loadStoreModule();

		const parsed = serviceQuoteUiStore.parseDashboardQuery(
			new URLSearchParams(
				'tab=quotes&view=default&service=bad-service&request=bad!&highlight=abc&context=services'
			)
		);

		// Note: 'quotes' tab is normalized to 'service-requests' in the code
		expect(parsed.state).toEqual({
			tab: 'service-requests',
			view: 'tasker',
			type: 'all',
			serviceAddress: null,
			requestId: null,
			highlight: null,
			status: null
		});
		expect(parsed.changed).toBe(true);
		expect(parsed.searchParams.toString()).toBe('tab=service-requests&view=tasker');
		// The messageCode is 'service_requests_request_not_found' because 'quotes' is normalized to 'service-requests'
		expect(parsed.messageCode).toBe('service_requests_request_not_found');
	}, 30_000);

	it('keeps a freshly-submitted request focused during the sync window', async () => {
		const { serviceQuoteUiStore } = await loadStoreModule();

		const submit = await serviceQuoteUiStore.submitQuoteRequest({
			service,
			payload: {
				title: 'Need a logo package',
				description: 'Primary mark, icon, and color guide.'
			}
		});

		expect(submit.success).toBe(true);
		expect(submit.quoteRequestId).toBeTruthy();

		const parsed = serviceQuoteUiStore.parseDashboardQuery(
			new URLSearchParams(`tab=service-requests&view=tasker&request=${submit.quoteRequestId}`)
		);

		expect(parsed.state.requestId).toBe(submit.quoteRequestId);
		expect(parsed.messageCode).toBeNull();
	});

	it('clears missing tasker deep links after tasker threads finish loading', async () => {
		const { serviceQuoteUiStore } = await loadStoreModule();

		await serviceQuoteUiStore.loadTaskerTimelines('qr_valid123');

		const parsed = serviceQuoteUiStore.parseDashboardQuery(
			new URLSearchParams('tab=service-requests&view=tasker&request=qr_valid123')
		);

		expect(parsed.state.requestId).toBeNull();
		expect(parsed.searchParams.toString()).toBe('tab=service-requests&view=tasker');
		expect(parsed.messageCode).toBe('service_requests_request_not_found');
	});

	it('preserves provider service context while clearing missing focused requests', async () => {
		const { serviceQuoteUiStore } = await loadStoreModule();

		await serviceQuoteUiStore.loadProviderTimelines(serviceAddress, 'qr_valid123');

		const parsed = serviceQuoteUiStore.parseDashboardQuery(
			new URLSearchParams(
				`tab=my-services&view=service-requests&service=${encodeURIComponent(serviceAddress)}&request=qr_valid123`
			)
		);

		expect(parsed.state.serviceAddress).toBe(serviceAddress);
		expect(parsed.state.requestId).toBeNull();
		expect(parsed.messageCode).toBe('service_quotes_request_not_found');
	});

	it('exports deterministic dashboard URL and sync helpers', async () => {
		const {
			createDashboardUrl,
			getProviderTimelines,
			getTaskerTimelines,
			isProviderTimelineSyncing,
			isRequestSyncActive,
			isTaskerTimelineSyncing,
			serviceQuoteUiStore
		} = await loadStoreModule();

		const syncTarget = await serviceQuoteUiStore.submitQuoteRequest({
			service,
			payload: {
				title: 'Need icon updates',
				description: 'Refresh our app icon set.'
			}
		});
		const stateSnapshots: Array<Record<string, unknown>> = [];
		const unsubscribe = serviceQuoteUiStore.subscribe((value: Record<string, unknown>) =>
			stateSnapshots.push(value)
		);
		const latestState = stateSnapshots.at(-1)!;
		unsubscribe();

		// The service address is only encoded once (not double-encoded)
		expect(
			createDashboardUrl(new URL('https://bittasker.com/hiring/my-tasks'), {
				tab: 'my-services',
				view: 'service-requests',
				serviceAddress,
				requestId: 'qr_valid123'
			}).search
		).toBe(
			`?tab=my-services&view=service-requests&service=${encodeURIComponent(
				serviceAddress
			)}&request=qr_valid123`
		);
		expect(getTaskerTimelines(latestState as never)).toEqual([]);
		expect(getProviderTimelines(latestState as never, serviceAddress)).toEqual([]);
		expect(
			isRequestSyncActive(latestState as never, syncTarget.quoteRequestId, serviceAddress)
		).toBe(true);
		expect(isTaskerTimelineSyncing(latestState as never, syncTarget.quoteRequestId)).toBe(true);
		expect(
			isProviderTimelineSyncing(latestState as never, serviceAddress, syncTarget.quoteRequestId)
		).toBe(true);
		expect(isProviderTimelineSyncing(latestState as never, null, syncTarget.quoteRequestId)).toBe(
			false
		);
	});

	it('updates message state and clears focus sync state deterministically', async () => {
		const { serviceQuoteUiStore } = await loadStoreModule();

		await serviceQuoteUiStore.submitQuoteRequest({
			service,
			payload: {
				title: 'Need packaging concepts',
				description: 'Three retail-ready directions.'
			}
		});
		serviceQuoteUiStore.setNonBlockingMessage('service_requests_request_not_found');
		serviceQuoteUiStore.clearRecentSubmit();

		const snapshots: Array<Record<string, unknown>> = [];
		const unsubscribe = serviceQuoteUiStore.subscribe((value: Record<string, unknown>) =>
			snapshots.push(value)
		);
		const latestState = snapshots.at(-1)!;
		unsubscribe();

		expect(latestState.nonBlockingMessageCode).toBe('service_requests_request_not_found');
		expect(latestState.focusSync).toEqual({
			requestId: null,
			serviceAddress: null,
			expiresAt: null
		});
	});

	it('marks tasker and provider loads as complete when queries fail', async () => {
		const { serviceQuoteUiStore } = await loadStoreModule();

		queryServiceQuotesForTasker.mockRejectedValueOnce(new Error('tasker load failed'));
		queryServiceQuotesForTaskee.mockRejectedValueOnce(new Error('provider load failed'));

		await expect(serviceQuoteUiStore.loadTaskerTimelines('qr_valid123')).rejects.toThrow(
			'tasker load failed'
		);
		await expect(
			serviceQuoteUiStore.loadProviderTimelines(serviceAddress, 'qr_valid123')
		).rejects.toThrow('provider load failed');

		const snapshots: Array<Record<string, unknown>> = [];
		const unsubscribe = serviceQuoteUiStore.subscribe((value: Record<string, unknown>) =>
			snapshots.push(value)
		);
		const latestState = snapshots.at(-1)!;
		unsubscribe();

		expect(latestState.loadingTasker).toBe(false);
		expect(latestState.taskerLoaded).toBe(true);
		expect(latestState.taskerLoadError).toBe('tasker load failed');
		expect((latestState.loadingProviderByService as Record<string, boolean>)[serviceAddress]).toBe(
			false
		);
		// Note: providerLoadedByService is only set to true if there was cached data
		expect((latestState.providerLoadedByService as Record<string, boolean>)[serviceAddress]).toBe(
			false
		);
		expect(
			(latestState.providerLoadErrorByService as Record<string, string | null>)[serviceAddress]
		).toBe('provider load failed');
	});

	it('publishes provider proposals after loading the matching request timeline', async () => {
		const { serviceQuoteUiStore } = await loadStoreModule();
		queryServiceQuotesForTaskee.mockResolvedValueOnce({ timelines: [createTimeline()] });
		await serviceQuoteUiStore.loadProviderTimelines(serviceAddress, 'qr_valid123');

		await expect(
			serviceQuoteUiStore.sendLocalProposal({
				service,
				serviceAddress,
				quoteRequestId: 'qr_valid123',
				description: 'Proposal body',
				amountUsdt: '100.00',
				estimatedDuration: '2 days',
				estimatedStartTime: 1_700_000_000,
				estimatedEndTime: 1_700_086_400,
				expirationDays: 3,
				expirationHours: 0
			})
		).resolves.toEqual({
			success: true
		});
		expect(publishServiceProposal).toHaveBeenCalledWith(
			expect.objectContaining({
				taskerPubkey: '1'.repeat(64),
				content: expect.objectContaining({
					quoteRequestId: 'qr_valid123',
					freelancerFeeTier: 1
				})
			})
		);
	});

	it('fails gracefully when tasker status updates cannot locate or publish a proposal', async () => {
		const { serviceQuoteUiStore } = await loadStoreModule();

		await expect(
			serviceQuoteUiStore.applyTaskerStatus({
				quoteRequestId: 'qr_missing99',
				proposalId: 'pr_missing99',
				status: 'accepting'
			})
		).resolves.toEqual({
			success: false,
			error: 'Unable to locate the selected proposal.'
		});

		queryServiceQuotesForTasker.mockResolvedValueOnce({ timelines: [createTimeline()] });
		await serviceQuoteUiStore.loadTaskerTimelines('qr_valid123');
		publishServiceProposalStatus.mockRejectedValueOnce(new Error('status publish failed'));

		await expect(
			serviceQuoteUiStore.applyTaskerStatus({
				quoteRequestId: 'qr_valid123',
				proposalId: 'pr_valid123',
				status: 'accept_failed'
			})
		).resolves.toEqual({
			success: false,
			error: 'status publish failed'
		});
	});

	it('applies declined tasker statuses to the current timeline', async () => {
		const { getTaskerTimelines, serviceQuoteUiStore } = await loadStoreModule();

		queryServiceQuotesForTasker.mockResolvedValueOnce({ timelines: [createTimeline()] });
		await serviceQuoteUiStore.loadTaskerTimelines('qr_valid123');

		await expect(
			serviceQuoteUiStore.applyTaskerStatus({
				quoteRequestId: 'qr_valid123',
				proposalId: 'pr_valid123',
				status: 'declined',
				message: 'Budget changed'
			})
		).resolves.toEqual({ success: true });

		const snapshots: Array<Record<string, unknown>> = [];
		const unsubscribe = serviceQuoteUiStore.subscribe((value: Record<string, unknown>) =>
			snapshots.push(value)
		);
		const latestState = snapshots.at(-1)!;
		unsubscribe();
		const [updatedTimeline] = getTaskerTimelines(
			latestState as never
		) as Array<ServiceQuoteTimelineEntry>;

		expect(updatedTimeline.resolvedStatus).toBe('declined');
		expect(updatedTimeline.resolvedTerminalEvent?.content.message).toBe('Budget changed');
		expect(updatedTimeline.statusEventsByProposalId.pr_valid123).toHaveLength(1);
	});
});
