import { beforeEach, describe, expect, it, vi } from 'vitest';
import { get, writable } from 'svelte/store';
import type { Service } from '$lib/types/service.d';
import type {
	ServiceProposalStatusEvent,
	ServiceQuoteTimelineEntry
} from '$lib/types/service-quote';
import { ServicePricingTypeEnum } from '$lib/utils/enums/service.enum';

const publishServiceQuoteRequest = vi.fn();
const publishServiceQuoteRequestDeletion = vi.fn();
const publishServiceProposal = vi.fn();
const publishServiceProposalDeletion = vi.fn();
const publishServiceProposalStatus = vi.fn();
const queryServiceQuotesForTasker = vi.fn();
const queryServiceQuotesForTaskee = vi.fn();
const getNpub = vi.fn();
const createServiceContract = vi.fn();
const recoverServiceQuoteAcceptanceContract = vi.fn();
const reconcileQuoteAcceptanceTimeline = vi.fn();
const waitForContractCreationByTransactionHash = vi.fn();
const getContractCreationTimeoutReason = vi.fn();
const retryPendingServiceAcceptanceByEscrowId = vi.fn();
const getRSKAddress = vi.fn();
const getContracts = vi.fn();
const findServiceByUniqueId = vi.fn();
const getExactServiceLocation = vi.fn();
const walletStore = writable({
	rsk: {
		address: '0x1234567890123456789012345678901234567890'
	}
});
const contractStoreState = writable({
	contracts: [] as unknown[]
});

vi.mock('$lib/utils/service-quote/publish', () => ({
	publishServiceQuoteRequest: (...args: unknown[]) => publishServiceQuoteRequest(...args),
	publishServiceQuoteRequestDeletion: (...args: unknown[]) =>
		publishServiceQuoteRequestDeletion(...args),
	publishServiceProposal: (...args: unknown[]) => publishServiceProposal(...args),
	publishServiceProposalDeletion: (...args: unknown[]) => publishServiceProposalDeletion(...args),
	publishServiceProposalStatus: (...args: unknown[]) => publishServiceProposalStatus(...args)
}));

vi.mock('$lib/utils/service-quote/query', () => ({
	queryServiceQuotesForTasker: (...args: unknown[]) => queryServiceQuotesForTasker(...args),
	queryServiceQuotesForTaskee: (...args: unknown[]) => queryServiceQuotesForTaskee(...args)
}));

vi.mock('$lib/utils/nostrKeys', () => ({
	getNpub: (...args: unknown[]) => getNpub(...args)
}));

vi.mock('$lib/stores/wallet.store', () => ({
	walletStore,
	getRSKAddress: (...args: unknown[]) => getRSKAddress(...args)
}));

vi.mock('$lib/utils/service-contract/create', () => ({
	createServiceContract: (...args: unknown[]) => createServiceContract(...args)
}));

vi.mock('$lib/utils/service-contract/recover-quote-acceptance', () => ({
	recoverServiceQuoteAcceptanceContract: (...args: unknown[]) =>
		recoverServiceQuoteAcceptanceContract(...args)
}));

vi.mock('$lib/utils/service-contract/reconcile-quote-acceptance', () => ({
	reconcileQuoteAcceptanceTimeline: (...args: unknown[]) =>
		reconcileQuoteAcceptanceTimeline(...args)
}));

vi.mock('$lib/utils/service-contract/await-contract-creation', () => ({
	CONTRACT_CREATION_SYNCING_MESSAGE:
		'The escrow transaction was submitted, but the contract confirmation is still syncing. Open Contracts to monitor it.',
	waitForContractCreationByTransactionHash: (...args: unknown[]) =>
		waitForContractCreationByTransactionHash(...args),
	getContractCreationTimeoutReason: (...args: unknown[]) =>
		getContractCreationTimeoutReason(...args)
}));

vi.mock('$lib/utils/escrow/v1/escrowEvents', () => ({
	retryPendingServiceAcceptanceByEscrowId: (...args: unknown[]) =>
		retryPendingServiceAcceptanceByEscrowId(...args)
}));

vi.mock('$lib/nostr/service', () => ({
	findServiceByUniqueId: (...args: unknown[]) => findServiceByUniqueId(...args)
}));

vi.mock('$lib/nostr/exact-location', () => ({
	getExactServiceLocation: (...args: unknown[]) => getExactServiceLocation(...args)
}));

vi.mock('$lib/stores/contract.store', () => ({
	contractStore: {
		subscribe: contractStoreState.subscribe,
		set: contractStoreState.set,
		update: contractStoreState.update
	}
}));

vi.mock('$lib/utils/escrow', () => ({
	escrow: {
		contractOps: {
			getContracts: (...args: unknown[]) => getContracts(...args)
		}
	}
}));

const service: Service = {
	id: 'service-event-id',
	npub: 'a'.repeat(64),
	uniqueId: 'service-1234',
	status: 'active',
	title: 'Logo design',
	description: 'A polished logo package',
	serviceLocationTypes: ['remote'],
	pricing: {
		type: 'TIERED',
		currency: 'USDt',
		tiers: [
			{
				id: 'standard',
				name: 'Standard',
				description: 'Standard package',
				price: 125,
				features: ['Logo concepts'],
				deliveryTime: { value: 3, unit: 'day', display: '3 days' }
			}
		],
		addOns: [{ id: 'source-files', name: 'Source files', price: 15 }]
	},
	skills: [],
	categories: [],
	createdAt: 1_700_000_000
} as Service;

function createTimeline(): ServiceQuoteTimelineEntry {
	const startTime = Math.floor(Date.now() / 1000) + 7200;
	const endTime = startTime + 3 * 86400;
	const expirationTimestamp = startTime + 5 * 86400;

	return {
		request: {
			id: 'request-event-id',
			kind: 6420,
			pubkey: 'b'.repeat(64),
			created_at: 1_700_000_000,
			tags: [
				['a', '30402:' + 'a'.repeat(64) + ':service-1234'],
				['p', 'a'.repeat(64)]
			],
			content: {
				type: 'service-quote-request',
				quoteRequestId: 'qr_12345678',
				serviceId: '30402:' + 'a'.repeat(64) + ':service-1234',
				serviceAddress: '30402:' + 'a'.repeat(64) + ':service-1234',
				pricingType: ServicePricingTypeEnum.TIERED,
				tierId: 'standard',
				selectedAddOns: ['source-files'],
				rushDelivery: false,
				inquiry: {
					title: 'Need a logo refresh',
					description: 'Please redesign our logo.'
				},
				timestamp: 1_700_000_000,
				version: 'v1'
			},
			sig: 'sig'
		},
		proposals: [
			{
				id: 'proposal-event-id',
				kind: 6421,
				pubkey: 'a'.repeat(64),
				created_at: 1_700_000_100,
				tags: [
					['e', 'request-event-id'],
					['p', 'b'.repeat(64)]
				],
				content: {
					type: 'service-proposal',
					proposalId: 'pr_12345678',
					quoteRequestId: 'qr_12345678',
					serviceId: '30402:' + 'a'.repeat(64) + ':service-1234',
					serviceAddress: '30402:' + 'a'.repeat(64) + ':service-1234',
					paymentType: 'FIXED',
					amountUsdt: '140.00',
					description: 'Three concepts and revisions',
					estimatedDuration: '3 days',
					estimatedStartTime: startTime,
					estimatedEndTime: endTime,
					expirationDays: 3,
					expirationHours: 0,
					expirationTimestamp,
					freelancerRskAddress: '0x1234567890123456789012345678901234567890',
					freelancerFeeTier: 1,
					pricingSnapshot: {
						serviceVersionRef: 'service-event-id',
						tierId: 'standard',
						selectedAddOns: ['source-files'],
						rushDelivery: false
					},
					timestamp: 1_700_000_100,
					version: 'v1'
				},
				sig: 'sig'
			}
		],
		statusEventsByProposalId: {},
		latestProposal: {
			id: 'proposal-event-id',
			kind: 6421,
			pubkey: 'a'.repeat(64),
			created_at: 1_700_000_100,
			tags: [
				['e', 'request-event-id'],
				['p', 'b'.repeat(64)]
			],
			content: {
				type: 'service-proposal',
				proposalId: 'pr_12345678',
				quoteRequestId: 'qr_12345678',
				serviceId: '30402:' + 'a'.repeat(64) + ':service-1234',
				serviceAddress: '30402:' + 'a'.repeat(64) + ':service-1234',
				paymentType: 'FIXED',
				amountUsdt: '140.00',
				description: 'Three concepts and revisions',
				estimatedDuration: '3 days',
				estimatedStartTime: startTime,
				estimatedEndTime: endTime,
				expirationDays: 3,
				expirationHours: 0,
				expirationTimestamp,
				freelancerRskAddress: '0x1234567890123456789012345678901234567890',
				freelancerFeeTier: 1,
				pricingSnapshot: {
					serviceVersionRef: 'service-event-id',
					tierId: 'standard',
					selectedAddOns: ['source-files'],
					rushDelivery: false
				},
				timestamp: 1_700_000_100,
				version: 'v1'
			},
			sig: 'sig'
		},
		resolvedStatus: 'pending',
		expirationTimestamp,
		isExpired: false
	};
}

function createTimelineWithRequestId(quoteRequestId: string): ServiceQuoteTimelineEntry {
	const timeline = createTimeline();
	return {
		...timeline,
		request: {
			...timeline.request,
			content: {
				...timeline.request.content,
				quoteRequestId
			}
		},
		proposals: timeline.proposals.map((proposal) => ({
			...proposal,
			content: {
				...proposal.content,
				quoteRequestId
			}
		})),
		latestProposal: {
			...timeline.latestProposal!,
			content: {
				...timeline.latestProposal!.content,
				quoteRequestId
			}
		}
	} as ServiceQuoteTimelineEntry;
}

function createAcceptanceSnapshot(overrides: Record<string, unknown> = {}) {
	return {
		clientRskAddress: '0x3333333333333333333333333333333333333333',
		clientFeeTier: 1,
		freelancerRskAddress: '0x1234567890123456789012345678901234567890',
		freelancerFeeTier: 1,
		chainId: 31,
		contractAddress: '0x2222222222222222222222222222222222222222',
		conversionFormulaVersion: 'v1',
		conversionSnapshotId: 'quote:pr_12345678',
		btcUsdRateMicros: 100_000_000_000,
		sourceTimestamp: 1_700_000_200,
		requiredConfirmations: 3,
		finalityPolicyVersion: 'rsk_rootstock_default_v1',
		sats: '125000',
		weiAmount: '1250000000000000',
		confirmationsAtVerification: 3,
		verificationRpc: 'rsk:testnet',
		...overrides
	};
}

function createStatusEvent(
	status: 'accepting' | 'accept_unknown' | 'contract_sync_pending' | 'accepted',
	overrides: Record<string, unknown> = {}
): ServiceProposalStatusEvent {
	const timestamp = Number(overrides.timestamp ?? 1_700_000_200);

	return {
		id: `status-${status}-${timestamp}`,
		kind: 6422,
		pubkey: 'b'.repeat(64),
		created_at: timestamp,
		tags: [],
		content: {
			type: 'service-proposal-status',
			proposalId: 'pr_12345678',
			quoteRequestId: 'qr_12345678',
			serviceId: '30402:' + 'a'.repeat(64) + ':service-1234',
			serviceAddress: '30402:' + 'a'.repeat(64) + ':service-1234',
			status,
			actorPubkey: 'b'.repeat(64),
			timestamp,
			version: 'v1',
			...overrides
		},
		sig: 'sig'
	} as unknown as ServiceProposalStatusEvent;
}

function createTimelineWithStatus(
	status: 'accepting' | 'accept_unknown' | 'contract_sync_pending' | 'accepted',
	overrides: Record<string, unknown> = {}
): ServiceQuoteTimelineEntry {
	const timeline = createTimeline();
	const statusEvent = createStatusEvent(status, overrides);
	return {
		...timeline,
		statusEventsByProposalId: {
			pr_12345678: [statusEvent]
		},
		resolvedStatus: status,
		resolvedTerminalEvent: statusEvent,
		linkedEscrowId:
			typeof overrides.escrowId === 'string' ? (overrides.escrowId as string) : undefined
	};
}

function createDeferred<T>() {
	let resolve!: (value: T | PromiseLike<T>) => void;
	const promise = new Promise<T>((res) => {
		resolve = res;
	});

	return { promise, resolve };
}

describe('serviceQuoteUiStore', () => {
	beforeEach(async () => {
		vi.clearAllMocks();
		getRSKAddress.mockResolvedValue('0x1234567890123456789012345678901234567890');
		getNpub.mockResolvedValue('b'.repeat(64));
		queryServiceQuotesForTasker.mockResolvedValue({ timelines: [createTimeline()] });
		queryServiceQuotesForTaskee.mockResolvedValue({ timelines: [createTimeline()] });
		publishServiceQuoteRequest.mockResolvedValue({
			event: { id: 'request-event-id' },
			relayResults: [],
			publishedRelaySet: []
		});
		publishServiceQuoteRequestDeletion.mockResolvedValue({
			event: { id: 'delete-event-id' },
			relayResults: [],
			publishedRelaySet: []
		});
		publishServiceProposal.mockResolvedValue({
			event: { id: 'proposal-event-id' },
			relayResults: [],
			publishedRelaySet: []
		});
		publishServiceProposalDeletion.mockResolvedValue({
			event: { id: 'proposal-delete-event-id' },
			relayResults: [],
			publishedRelaySet: []
		});
		publishServiceProposalStatus.mockResolvedValue({
			event: { id: 'status-event-id' },
			relayResults: [],
			publishedRelaySet: []
		});
		createServiceContract.mockResolvedValue({
			success: true,
			transactionHash: '0xservicehash',
			acceptanceSnapshot: createAcceptanceSnapshot({
				confirmationsAtVerification: 0
			})
		});
		recoverServiceQuoteAcceptanceContract.mockResolvedValue({
			status: 'failed',
			transactionHash: '0xservicehash',
			error: 'recovery unavailable'
		});
		reconcileQuoteAcceptanceTimeline.mockResolvedValue({
			status: 'no_change'
		});
		retryPendingServiceAcceptanceByEscrowId.mockResolvedValue(undefined);
		waitForContractCreationByTransactionHash.mockImplementation(() => new Promise(() => undefined));
		getContractCreationTimeoutReason.mockReturnValue('pending_timeout');
		getContracts.mockResolvedValue([]);
		findServiceByUniqueId.mockResolvedValue(service);
		getExactServiceLocation.mockResolvedValue(null);
		contractStoreState.set({ contracts: [] });
		walletStore.set({
			rsk: {
				address: '0x1234567890123456789012345678901234567890'
			}
		});

		const { serviceQuoteUiStore } = await import('$lib/stores/service-quote-ui.store');
		serviceQuoteUiStore.reset();
	}, 20_000);

	it('keeps a focused request while the recent-submit sync window is active', async () => {
		const { serviceQuoteUiStore, isTaskerTimelineSyncing } = await import(
			'$lib/stores/service-quote-ui.store'
		);

		await serviceQuoteUiStore.submitQuoteRequest({
			service,
			payload: {
				title: 'Need a logo refresh',
				description: 'Please redesign our logo.'
			}
		});

		const state = get(serviceQuoteUiStore);
		const requestId = state.focusSync.requestId;
		expect(requestId).toBeTruthy();
		expect(isTaskerTimelineSyncing(state, requestId)).toBe(true);

		const parsed = serviceQuoteUiStore.parseDashboardQuery(
			new URLSearchParams(`tab=service-requests&view=tasker&request=${requestId}`)
		);

		expect(parsed.state.requestId).toBe(requestId);
		expect(parsed.messageCode).toBeNull();
	});

	it('sanitizes invalid quote and contract params', async () => {
		const { serviceQuoteUiStore } = await import('$lib/stores/service-quote-ui.store');

		const quotesParsed = serviceQuoteUiStore.parseDashboardQuery(
			new URLSearchParams('tab=service-requests&view=tasker&request=bad!')
		);
		expect(quotesParsed.state.requestId).toBeNull();
		expect(quotesParsed.messageCode).toBe('service_requests_request_not_found');

		const contractsParsed = serviceQuoteUiStore.parseDashboardQuery(
			new URLSearchParams('tab=contracts&type=services&highlight=%%%')
		);
		expect(contractsParsed.state.highlight).toBeNull();
		expect(contractsParsed.messageCode).toBe('contracts_highlight_not_found');
	});

	it('publishes quote requests with tier/add-on selections merged into the payload', async () => {
		const { serviceQuoteUiStore } = await import('$lib/stores/service-quote-ui.store');

		const result = await serviceQuoteUiStore.submitQuoteRequest({
			service,
			payload: {
				title: 'Need a logo refresh',
				description: 'Please redesign our logo.'
			},
			tierId: 'standard',
			selectedAddOnIds: ['source-files'],
			rushDelivery: false
		});

		expect(result.success).toBe(true);
		expect(publishServiceQuoteRequest).toHaveBeenCalledTimes(1);
		expect(publishServiceQuoteRequest).toHaveBeenCalledWith(
			expect.objectContaining({
				service,
				payload: expect.objectContaining({
					tierId: 'standard',
					selectedAddOns: ['source-files']
				})
			})
		);
	});

	it("rejects quote requests on the user's own service", async () => {
		const { serviceQuoteUiStore } = await import('$lib/stores/service-quote-ui.store');
		getNpub.mockResolvedValue('a'.repeat(64));

		const result = await serviceQuoteUiStore.submitQuoteRequest({
			service,
			payload: {
				title: 'Need a logo refresh',
				description: 'Please redesign our logo.'
			}
		});

		expect(result).toEqual({
			success: false,
			error: "You can't request a quote on your own service."
		});
		expect(publishServiceQuoteRequest).not.toHaveBeenCalled();
	});

	it('publishes provider proposals using the selected request context', async () => {
		const { serviceQuoteUiStore } = await import('$lib/stores/service-quote-ui.store');

		await serviceQuoteUiStore.loadProviderTimelines(
			'30402:' + 'a'.repeat(64) + ':service-1234',
			'qr_12345678'
		);

		const result = await serviceQuoteUiStore.sendLocalProposal({
			service,
			serviceAddress: '30402:' + 'a'.repeat(64) + ':service-1234',
			quoteRequestId: 'qr_12345678',
			description: 'Three concepts and revisions',
			amountUsdt: '140.00',
			estimatedDuration: '3 days',
			estimatedStartTime: 1_700_001_000,
			estimatedEndTime: 1_700_260_200,
			expirationDays: 3,
			expirationHours: 0
		});

		expect(result.success).toBe(true);
		expect(publishServiceProposal).toHaveBeenCalledWith(
			expect.objectContaining({
				taskerPubkey: 'b'.repeat(64),
				content: expect.objectContaining({
					quoteRequestId: 'qr_12345678',
					paymentType: 'FIXED',
					freelancerRskAddress: '0x1234567890123456789012345678901234567890',
					freelancerFeeTier: 1
				})
			})
		);
	});

	it('passes focused provider request ids into the taskee query path', async () => {
		const { serviceQuoteUiStore } = await import('$lib/stores/service-quote-ui.store');
		const serviceAddress = '30402:' + 'a'.repeat(64) + ':service-1234';

		await serviceQuoteUiStore.loadProviderTimelines(serviceAddress, 'qr_12345678');

		expect(queryServiceQuotesForTaskee).toHaveBeenCalledWith(
			serviceAddress,
			'b'.repeat(64),
			undefined,
			'qr_12345678'
		);
	});

	it('does not reuse a request-scoped provider cache when hydrating the full service inbox', async () => {
		const { serviceQuoteUiStore } = await import('$lib/stores/service-quote-ui.store');
		const serviceAddress = '30402:' + 'a'.repeat(64) + ':service-1234';

		queryServiceQuotesForTaskee
			.mockResolvedValueOnce({
				timelines: [createTimelineWithRequestId('qr_12345678')]
			})
			.mockResolvedValueOnce({
				timelines: [
					createTimelineWithRequestId('qr_12345678'),
					createTimelineWithRequestId('qr_other123')
				]
			});

		await serviceQuoteUiStore.loadProviderTimelines(serviceAddress, 'qr_12345678');
		await serviceQuoteUiStore.loadProviderTimelines(serviceAddress, null);

		expect(queryServiceQuotesForTaskee).toHaveBeenNthCalledWith(
			1,
			serviceAddress,
			'b'.repeat(64),
			undefined,
			'qr_12345678'
		);
		expect(queryServiceQuotesForTaskee).toHaveBeenNthCalledWith(
			2,
			serviceAddress,
			'b'.repeat(64),
			undefined,
			undefined
		);
		expect(get(serviceQuoteUiStore).providerTimelinesByService[serviceAddress]).toHaveLength(2);
	});

	it('reuses a full provider cache for request focus changes when the request is already present', async () => {
		const { serviceQuoteUiStore } = await import('$lib/stores/service-quote-ui.store');
		const serviceAddress = '30402:' + 'a'.repeat(64) + ':service-1234';

		queryServiceQuotesForTaskee.mockResolvedValueOnce({
			timelines: [
				createTimelineWithRequestId('qr_12345678'),
				createTimelineWithRequestId('qr_other123')
			]
		});

		await serviceQuoteUiStore.loadProviderTimelines(serviceAddress, null);
		queryServiceQuotesForTaskee.mockClear();

		await serviceQuoteUiStore.loadProviderTimelines(serviceAddress, 'qr_12345678');

		expect(queryServiceQuotesForTaskee).not.toHaveBeenCalled();
		expect(get(serviceQuoteUiStore).providerTimelinesByService[serviceAddress]).toHaveLength(2);
	});

	it('deletes a provider proposal and refreshes the provider timelines', async () => {
		const { serviceQuoteUiStore } = await import('$lib/stores/service-quote-ui.store');
		const serviceAddress = '30402:' + 'a'.repeat(64) + ':service-1234';

		await serviceQuoteUiStore.loadProviderTimelines(serviceAddress, 'qr_12345678');
		queryServiceQuotesForTaskee.mockResolvedValueOnce({
			timelines: [
				{
					...createTimeline(),
					proposals: [],
					latestProposal: undefined
				}
			]
		});

		const result = await serviceQuoteUiStore.deleteLocalProposal({
			serviceAddress,
			quoteRequestId: 'qr_12345678',
			proposalId: 'pr_12345678'
		});

		expect(result).toEqual({ success: true });
		expect(publishServiceProposalDeletion).toHaveBeenCalledWith({
			proposalEventId: 'proposal-event-id',
			taskerPubkey: 'b'.repeat(64)
		});
		expect(
			get(serviceQuoteUiStore).providerTimelinesByService[serviceAddress][0]?.latestProposal
		).toBe(undefined);
	});

	it('falls back to resolving the provider wallet before sending a proposal', async () => {
		const { serviceQuoteUiStore } = await import('$lib/stores/service-quote-ui.store');
		walletStore.set({
			rsk: {
				address: ''
			}
		});
		getRSKAddress.mockResolvedValueOnce('0x9999999999999999999999999999999999999999');

		await serviceQuoteUiStore.loadProviderTimelines(
			'30402:' + 'a'.repeat(64) + ':service-1234',
			'qr_12345678'
		);

		const result = await serviceQuoteUiStore.sendLocalProposal({
			service,
			serviceAddress: '30402:' + 'a'.repeat(64) + ':service-1234',
			quoteRequestId: 'qr_12345678',
			description: 'Three concepts and revisions',
			amountUsdt: '140.00',
			estimatedDuration: '3 days',
			estimatedStartTime: 1_700_001_000,
			estimatedEndTime: 1_700_260_200,
			expirationDays: 3,
			expirationHours: 0
		});

		expect(result).toEqual({
			success: true
		});
		expect(getRSKAddress).toHaveBeenCalledTimes(1);
		expect(publishServiceProposal).toHaveBeenCalledWith(
			expect.objectContaining({
				content: expect.objectContaining({
					freelancerRskAddress: '0x9999999999999999999999999999999999999999'
				})
			})
		);
	});

	it('publishes tasker status updates against the selected proposal', async () => {
		const { serviceQuoteUiStore } = await import('$lib/stores/service-quote-ui.store');

		await serviceQuoteUiStore.loadTaskerTimelines('qr_12345678');
		const result = await serviceQuoteUiStore.applyTaskerStatus({
			quoteRequestId: 'qr_12345678',
			proposalId: 'pr_12345678',
			status: 'declined'
		});

		expect(result.success).toBe(true);
		expect(publishServiceProposalStatus).toHaveBeenCalledWith(
			expect.objectContaining({
				proposalEventId: 'proposal-event-id',
				content: expect.objectContaining({
					status: 'declined',
					quoteRequestId: 'qr_12345678'
				})
			})
		);
	});

	it('deletes a tasker quote request and removes it from local timelines', async () => {
		const { serviceQuoteUiStore } = await import('$lib/stores/service-quote-ui.store');

		await serviceQuoteUiStore.loadTaskerTimelines('qr_12345678');
		const result = await serviceQuoteUiStore.deleteTaskerRequest({
			quoteRequestId: 'qr_12345678'
		});

		expect(result).toEqual({ success: true });
		expect(publishServiceQuoteRequestDeletion).toHaveBeenCalledWith({
			requestEventId: 'request-event-id',
			taskerPubkey: 'b'.repeat(64)
		});
		expect(get(serviceQuoteUiStore).taskerTimelines).toEqual([]);
	});

	it('blocks tasker request deletion while contract acceptance is still resolving', async () => {
		const { serviceQuoteUiStore } = await import('$lib/stores/service-quote-ui.store');

		queryServiceQuotesForTasker.mockResolvedValueOnce({
			timelines: [
				{
					...createTimeline(),
					resolvedStatus: 'accept_unknown'
				}
			]
		});
		await serviceQuoteUiStore.loadTaskerTimelines('qr_12345678');

		const result = await serviceQuoteUiStore.deleteTaskerRequest({
			quoteRequestId: 'qr_12345678'
		});

		expect(result).toEqual({
			success: false,
			error:
				'This service request is currently resolving a contract acceptance and cannot be deleted.'
		});
		expect(publishServiceQuoteRequestDeletion).not.toHaveBeenCalled();
	});

	it('blocks tasker request deletion while contract acceptance is actively pending', async () => {
		const { serviceQuoteUiStore } = await import('$lib/stores/service-quote-ui.store');

		queryServiceQuotesForTasker.mockResolvedValueOnce({
			timelines: [
				{
					...createTimeline(),
					resolvedStatus: 'accepting'
				}
			]
		});
		await serviceQuoteUiStore.loadTaskerTimelines('qr_12345678');

		const result = await serviceQuoteUiStore.deleteTaskerRequest({
			quoteRequestId: 'qr_12345678'
		});

		expect(result).toEqual({
			success: false,
			error:
				'This service request is currently resolving a contract acceptance and cannot be deleted.'
		});
		expect(publishServiceQuoteRequestDeletion).not.toHaveBeenCalled();
	});

	it('blocks tasker request deletion while contract creation is still syncing', async () => {
		const { serviceQuoteUiStore } = await import('$lib/stores/service-quote-ui.store');

		queryServiceQuotesForTasker.mockResolvedValueOnce({
			timelines: [
				{
					...createTimeline(),
					resolvedStatus: 'contract_sync_pending'
				}
			]
		});
		await serviceQuoteUiStore.loadTaskerTimelines('qr_12345678');

		const result = await serviceQuoteUiStore.deleteTaskerRequest({
			quoteRequestId: 'qr_12345678'
		});

		expect(result).toEqual({
			success: false,
			error:
				'This service request is currently resolving a contract acceptance and cannot be deleted.'
		});
		expect(publishServiceQuoteRequestDeletion).not.toHaveBeenCalled();
	});

	it('creates a funded service contract when the tasker accepts a proposal', async () => {
		const { serviceQuoteUiStore } = await import('$lib/stores/service-quote-ui.store');

		await serviceQuoteUiStore.loadTaskerTimelines('qr_12345678');
		const result = await serviceQuoteUiStore.acceptTaskerProposal({
			quoteRequestId: 'qr_12345678',
			proposalId: 'pr_12345678'
		});

		expect(result).toEqual({
			success: true,
			transactionHash: '0xservicehash'
		});
		expect(publishServiceProposalStatus).toHaveBeenCalledWith(
			expect.objectContaining({
				content: expect.objectContaining({
					status: 'accepting',
					quoteRequestId: 'qr_12345678',
					transactionHash: '0xservicehash'
				}),
				proposalEventId: 'proposal-event-id'
			})
		);
		expect(createServiceContract).toHaveBeenCalledWith(
			expect.objectContaining({
				quoteRequestId: 'qr_12345678',
				proposalId: 'pr_12345678',
				proposalEventId: 'proposal-event-id',
				purchaseMode: 'quote',
				freelancerAddress: '0x1234567890123456789012345678901234567890'
			})
		);
		expect(get(serviceQuoteUiStore).taskerTimelines[0]?.resolvedStatus).toBe('accepting');
	});

	it('hydrates the acceptance contract snapshot with the exact encrypted service location keyed by the service d tag', async () => {
		const { serviceQuoteUiStore } = await import('$lib/stores/service-quote-ui.store');
		findServiceByUniqueId.mockResolvedValue({
			...service,
			serviceLocationTypes: ['taskee_location'],
			locationDetails: {
				taskeeLocation: {
					useGlobalLocation: false,
					locationDisplayName: 'Approximate Austin, TX',
					serviceRadius: 5,
					serviceLocation: {
						displayName: 'Approximate Austin, TX',
						latitude: 30.2701,
						longitude: -97.741,
						locationLoaded: true
					}
				}
			}
		});
		getExactServiceLocation.mockResolvedValue({
			taskeeLocation: {
				displayName: '123 Main St, Austin, TX',
				formattedAddress: '123 Main St, Austin, TX',
				latitude: 30.2672,
				longitude: -97.7431,
				locationLoaded: true
			}
		});

		await serviceQuoteUiStore.loadTaskerTimelines('qr_12345678');
		await serviceQuoteUiStore.acceptTaskerProposal({
			quoteRequestId: 'qr_12345678',
			proposalId: 'pr_12345678'
		});

		expect(findServiceByUniqueId).toHaveBeenCalledWith('service-1234');
		expect(getExactServiceLocation).toHaveBeenCalledWith('service-1234');
		expect(createServiceContract).toHaveBeenCalledWith(
			expect.objectContaining({
				agreementSnapshot: expect.objectContaining({
					serviceLocation: expect.objectContaining({
						mode: 'taskee_location',
						label: '123 Main St, Austin, TX',
						location: expect.objectContaining({
							formattedAddress: '123 Main St, Austin, TX',
							latitude: 30.2672,
							longitude: -97.7431
						})
					})
				})
			})
		);
	});

	it('omits the agreement location snapshot when the exact encrypted service location is unavailable', async () => {
		const { serviceQuoteUiStore } = await import('$lib/stores/service-quote-ui.store');
		findServiceByUniqueId.mockResolvedValue({
			...service,
			serviceLocationTypes: ['taskee_location'],
			locationDetails: {
				taskeeLocation: {
					useGlobalLocation: false,
					locationDisplayName: 'Approximate Austin, TX',
					serviceRadius: 5,
					serviceLocation: {
						displayName: 'Approximate Austin, TX',
						latitude: 30.2701,
						longitude: -97.741,
						locationLoaded: true,
						zipCode: ''
					}
				}
			}
		});
		getExactServiceLocation.mockResolvedValue(null);

		await serviceQuoteUiStore.loadTaskerTimelines('qr_12345678');
		await serviceQuoteUiStore.acceptTaskerProposal({
			quoteRequestId: 'qr_12345678',
			proposalId: 'pr_12345678'
		});

		expect(createServiceContract).toHaveBeenCalledWith(
			expect.objectContaining({
				agreementSnapshot: expect.objectContaining({
					serviceLocation: undefined
				})
			})
		);
	});

	it('omits the agreement location snapshot when loading the exact encrypted service location throws', async () => {
		const { serviceQuoteUiStore } = await import('$lib/stores/service-quote-ui.store');
		findServiceByUniqueId.mockResolvedValue({
			...service,
			serviceLocationTypes: ['taskee_location'],
			locationDetails: {
				taskeeLocation: {
					useGlobalLocation: false,
					locationDisplayName: 'Approximate Austin, TX',
					serviceRadius: 5,
					serviceLocation: {
						displayName: 'Approximate Austin, TX',
						latitude: 30.2701,
						longitude: -97.741,
						locationLoaded: true,
						zipCode: ''
					}
				}
			}
		});
		getExactServiceLocation.mockRejectedValue(new Error('relay unavailable'));

		await serviceQuoteUiStore.loadTaskerTimelines('qr_12345678');
		await serviceQuoteUiStore.acceptTaskerProposal({
			quoteRequestId: 'qr_12345678',
			proposalId: 'pr_12345678'
		});

		expect(createServiceContract).toHaveBeenCalledWith(
			expect.objectContaining({
				agreementSnapshot: expect.objectContaining({
					serviceLocation: undefined
				})
			})
		);
	});

	it('does not publish accepting until the funding transaction hash exists', async () => {
		const { serviceQuoteUiStore } = await import('$lib/stores/service-quote-ui.store');
		const deferredContractCreation = createDeferred<{
			success: true;
			transactionHash: string;
			acceptanceSnapshot: ReturnType<typeof createAcceptanceSnapshot>;
		}>();
		createServiceContract.mockImplementationOnce(() => deferredContractCreation.promise);

		await serviceQuoteUiStore.loadTaskerTimelines('qr_12345678');
		const acceptancePromise = serviceQuoteUiStore.acceptTaskerProposal({
			quoteRequestId: 'qr_12345678',
			proposalId: 'pr_12345678'
		});

		await Promise.resolve();
		expect(publishServiceProposalStatus).not.toHaveBeenCalled();
		expect(get(serviceQuoteUiStore).taskerTimelines[0]?.resolvedStatus).toBe('pending');

		deferredContractCreation.resolve({
			success: true,
			transactionHash: '0xservicehash',
			acceptanceSnapshot: createAcceptanceSnapshot({
				confirmationsAtVerification: 0
			})
		});

		await expect(acceptancePromise).resolves.toEqual({
			success: true,
			transactionHash: '0xservicehash'
		});
		expect(publishServiceProposalStatus).toHaveBeenCalledTimes(1);
		expect(publishServiceProposalStatus).toHaveBeenCalledWith(
			expect.objectContaining({
				content: expect.objectContaining({
					status: 'accepting',
					transactionHash: '0xservicehash'
				})
			})
		);
	});

	it('rejects tasker acceptance when the proposal has already expired', async () => {
		const { serviceQuoteUiStore } = await import('$lib/stores/service-quote-ui.store');
		const expiredTimestamp = Math.floor(Date.now() / 1000) - 1;
		const expiredTimeline = createTimeline();

		queryServiceQuotesForTasker.mockResolvedValueOnce({
			timelines: [
				{
					...expiredTimeline,
					proposals: expiredTimeline.proposals.map((proposal) => ({
						...proposal,
						content: {
							...proposal.content,
							expirationTimestamp: expiredTimestamp
						}
					})),
					latestProposal: {
						...expiredTimeline.latestProposal,
						content: {
							...expiredTimeline.latestProposal.content,
							expirationTimestamp: expiredTimestamp
						}
					},
					expirationTimestamp: expiredTimestamp
				}
			]
		});
		await serviceQuoteUiStore.loadTaskerTimelines('qr_12345678');

		const result = await serviceQuoteUiStore.acceptTaskerProposal({
			quoteRequestId: 'qr_12345678',
			proposalId: 'pr_12345678'
		});

		expect(result).toEqual({
			success: false,
			error: 'This proposal has already expired.'
		});
		expect(publishServiceProposalStatus).not.toHaveBeenCalled();
		expect(createServiceContract).not.toHaveBeenCalled();
	});

	it('rejects duplicate tasker acceptance when the proposal is already accepting', async () => {
		const { serviceQuoteUiStore } = await import('$lib/stores/service-quote-ui.store');

		queryServiceQuotesForTasker.mockResolvedValueOnce({
			timelines: [
				{
					...createTimeline(),
					resolvedStatus: 'accepting'
				}
			]
		});
		await serviceQuoteUiStore.loadTaskerTimelines('qr_12345678');

		const result = await serviceQuoteUiStore.acceptTaskerProposal({
			quoteRequestId: 'qr_12345678',
			proposalId: 'pr_12345678'
		});

		expect(result).toEqual({
			success: false,
			error:
				'This proposal acceptance is already in progress or still syncing. Open Contracts to monitor the service contract.'
		});
		expect(publishServiceProposalStatus).not.toHaveBeenCalled();
		expect(createServiceContract).not.toHaveBeenCalled();
	});

	it('rejects duplicate tasker acceptance when the proposal is still syncing to contracts', async () => {
		const { serviceQuoteUiStore } = await import('$lib/stores/service-quote-ui.store');

		queryServiceQuotesForTasker.mockResolvedValueOnce({
			timelines: [
				{
					...createTimeline(),
					resolvedStatus: 'contract_sync_pending'
				}
			]
		});
		await serviceQuoteUiStore.loadTaskerTimelines('qr_12345678');

		const result = await serviceQuoteUiStore.acceptTaskerProposal({
			quoteRequestId: 'qr_12345678',
			proposalId: 'pr_12345678'
		});

		expect(result).toEqual({
			success: false,
			error:
				'This proposal acceptance is already in progress or still syncing. Open Contracts to monitor the service contract.'
		});
		expect(publishServiceProposalStatus).not.toHaveBeenCalled();
		expect(createServiceContract).not.toHaveBeenCalled();
	});

	it('rejects tasker acceptance when the proposal is already accepted', async () => {
		const { serviceQuoteUiStore } = await import('$lib/stores/service-quote-ui.store');

		queryServiceQuotesForTasker.mockResolvedValueOnce({
			timelines: [
				{
					...createTimeline(),
					resolvedStatus: 'accepted'
				}
			]
		});
		await serviceQuoteUiStore.loadTaskerTimelines('qr_12345678');

		const result = await serviceQuoteUiStore.acceptTaskerProposal({
			quoteRequestId: 'qr_12345678',
			proposalId: 'pr_12345678'
		});

		expect(result).toEqual({
			success: false,
			error: 'This proposal is already linked to an active service contract.'
		});
		expect(publishServiceProposalStatus).not.toHaveBeenCalled();
		expect(createServiceContract).not.toHaveBeenCalled();
	});

	it('rejects tasker acceptance when the proposal already has a linked escrow', async () => {
		const { serviceQuoteUiStore } = await import('$lib/stores/service-quote-ui.store');

		queryServiceQuotesForTasker.mockResolvedValueOnce({
			timelines: [
				{
					...createTimeline(),
					linkedEscrowId: 'escrow-123'
				}
			]
		});
		await serviceQuoteUiStore.loadTaskerTimelines('qr_12345678');

		const result = await serviceQuoteUiStore.acceptTaskerProposal({
			quoteRequestId: 'qr_12345678',
			proposalId: 'pr_12345678'
		});

		expect(result).toEqual({
			success: false,
			error: 'This proposal is already linked to an active service contract.'
		});
		expect(publishServiceProposalStatus).not.toHaveBeenCalled();
		expect(createServiceContract).not.toHaveBeenCalled();
	});

	it('marks acceptance as unknown when escrow confirmation times out', async () => {
		const { serviceQuoteUiStore } = await import('$lib/stores/service-quote-ui.store');
		waitForContractCreationByTransactionHash.mockRejectedValueOnce(
			new Error(
				'The escrow transaction was submitted, but the contract confirmation is still syncing. Open Contracts to monitor it.'
			)
		);
		recoverServiceQuoteAcceptanceContract.mockRejectedValueOnce(
			new Error('relay reconciliation unavailable')
		);
		getContractCreationTimeoutReason.mockReturnValueOnce('pending_timeout');

		await serviceQuoteUiStore.loadTaskerTimelines('qr_12345678');
		const result = await serviceQuoteUiStore.acceptTaskerProposal({
			quoteRequestId: 'qr_12345678',
			proposalId: 'pr_12345678'
		});

		expect(result).toEqual({
			success: true,
			transactionHash: '0xservicehash'
		});

		await vi.waitFor(() => {
			expect(get(serviceQuoteUiStore).taskerTimelines[0]?.resolvedStatus).toBe('accept_unknown');
		});
		expect(publishServiceProposalStatus).toHaveBeenNthCalledWith(
			2,
			expect.objectContaining({
				content: expect.objectContaining({
					status: 'accept_unknown',
					reasonCode: 'pending_timeout',
					transactionHash: '0xservicehash'
				})
			})
		);
	});

	it('marks replacement-based ambiguity with the tx_replaced reason code', async () => {
		const { serviceQuoteUiStore } = await import('$lib/stores/service-quote-ui.store');
		waitForContractCreationByTransactionHash.mockRejectedValueOnce(
			new Error(
				'The escrow transaction was submitted, but the contract confirmation is still syncing. Open Contracts to monitor it.'
			)
		);
		recoverServiceQuoteAcceptanceContract.mockRejectedValueOnce(
			new Error('relay reconciliation unavailable')
		);
		getContractCreationTimeoutReason.mockReturnValueOnce('tx_replaced');

		await serviceQuoteUiStore.loadTaskerTimelines('qr_12345678');
		await serviceQuoteUiStore.acceptTaskerProposal({
			quoteRequestId: 'qr_12345678',
			proposalId: 'pr_12345678'
		});

		await vi.waitFor(() => {
			expect(get(serviceQuoteUiStore).taskerTimelines[0]?.resolvedStatus).toBe('accept_unknown');
		});
		expect(publishServiceProposalStatus).toHaveBeenNthCalledWith(
			2,
			expect.objectContaining({
				content: expect.objectContaining({
					status: 'accept_unknown',
					reasonCode: 'tx_replaced'
				})
			})
		);
	});

	it('keeps the acceptance in a contract syncing state when recovery finds an escrow that is not queryable yet', async () => {
		const { serviceQuoteUiStore } = await import('$lib/stores/service-quote-ui.store');
		waitForContractCreationByTransactionHash.mockRejectedValueOnce(
			new Error(
				'The escrow transaction was submitted, but the contract confirmation is still syncing. Open Contracts to monitor it.'
			)
		);
		recoverServiceQuoteAcceptanceContract.mockResolvedValueOnce({
			status: 'contract_sync_pending',
			transactionHash: '0xservicehash',
			escrowId: 'escrow-123'
		});

		await serviceQuoteUiStore.loadTaskerTimelines('qr_12345678');
		await serviceQuoteUiStore.acceptTaskerProposal({
			quoteRequestId: 'qr_12345678',
			proposalId: 'pr_12345678'
		});

		await vi.waitFor(() => {
			expect(get(serviceQuoteUiStore).taskerTimelines[0]?.resolvedStatus).toBe(
				'contract_sync_pending'
			);
		});
		expect(get(serviceQuoteUiStore).taskerTimelines[0]?.linkedEscrowId).toBe('escrow-123');
		expect(publishServiceProposalStatus).toHaveBeenNthCalledWith(
			2,
			expect.objectContaining({
				content: expect.objectContaining({
					status: 'contract_sync_pending',
					escrowId: 'escrow-123',
					transactionHash: '0xservicehash'
				})
			})
		);
	});

	it('replays the accepted status when recovery finds the created escrow by transaction hash', async () => {
		const { serviceQuoteUiStore } = await import('$lib/stores/service-quote-ui.store');
		waitForContractCreationByTransactionHash.mockRejectedValueOnce(
			new Error(
				'The escrow transaction was submitted, but the contract confirmation is still syncing. Open Contracts to monitor it.'
			)
		);
		recoverServiceQuoteAcceptanceContract.mockResolvedValueOnce({
			status: 'contract_ready',
			transactionHash: '0xservicehash',
			escrowId: 'escrow-123'
		});

		await serviceQuoteUiStore.loadTaskerTimelines('qr_12345678');
		await serviceQuoteUiStore.acceptTaskerProposal({
			quoteRequestId: 'qr_12345678',
			proposalId: 'pr_12345678'
		});

		await vi.waitFor(() => {
			expect(get(serviceQuoteUiStore).taskerTimelines[0]?.resolvedStatus).toBe('accepted');
		});
		expect(get(serviceQuoteUiStore).taskerTimelines[0]?.linkedEscrowId).toBe('escrow-123');
		expect(retryPendingServiceAcceptanceByEscrowId).toHaveBeenCalledWith('escrow-123');
	});

	it('reconciles accept_unknown tasker timelines into accepted and republishes the verified status', async () => {
		const { serviceQuoteUiStore } = await import('$lib/stores/service-quote-ui.store');
		const acceptanceSnapshot = createAcceptanceSnapshot({
			conversionSnapshotId: 'quote:pr_recovered'
		});

		queryServiceQuotesForTasker.mockResolvedValueOnce({
			timelines: [
				createTimelineWithStatus('accept_unknown', {
					transactionHash: '0xservicehash',
					reasonCode: 'pending_timeout'
				})
			]
		});
		reconcileQuoteAcceptanceTimeline.mockResolvedValueOnce({
			status: 'accepted',
			escrowId: 'escrow-123',
			transactionHash: '0xservicehash',
			acceptanceSnapshot,
			matchedContract: {} as never
		});

		await serviceQuoteUiStore.loadTaskerTimelines('qr_12345678');

		await vi.waitFor(() => {
			expect(get(serviceQuoteUiStore).taskerTimelines[0]?.resolvedStatus).toBe('accepted');
		});
		expect(get(serviceQuoteUiStore).taskerTimelines[0]?.linkedEscrowId).toBe('escrow-123');
		expect(publishServiceProposalStatus).toHaveBeenCalledWith(
			expect.objectContaining({
				proposalEventId: 'proposal-event-id',
				content: expect.objectContaining({
					status: 'accepted',
					escrowId: 'escrow-123',
					transactionHash: '0xservicehash',
					acceptanceSnapshot
				})
			})
		);
	});

	it('reconciles legacy bare accepting tasker timelines into accepted when deterministic contract healing succeeds', async () => {
		const { serviceQuoteUiStore } = await import('$lib/stores/service-quote-ui.store');
		const acceptanceSnapshot = createAcceptanceSnapshot({
			conversionSnapshotId: 'quote:pr_legacy_recovered'
		});

		queryServiceQuotesForTasker.mockResolvedValueOnce({
			timelines: [createTimelineWithStatus('accepting')]
		});
		reconcileQuoteAcceptanceTimeline.mockResolvedValueOnce({
			status: 'accepted',
			escrowId: 'escrow-legacy-123',
			transactionHash: '0xlegacyhash',
			acceptanceSnapshot,
			matchedContract: {} as never
		});

		await serviceQuoteUiStore.loadTaskerTimelines('qr_12345678');

		await vi.waitFor(() => {
			expect(get(serviceQuoteUiStore).taskerTimelines[0]?.resolvedStatus).toBe('accepted');
		});
		expect(get(serviceQuoteUiStore).taskerTimelines[0]?.linkedEscrowId).toBe('escrow-legacy-123');
		expect(publishServiceProposalStatus).toHaveBeenCalledWith(
			expect.objectContaining({
				proposalEventId: 'proposal-event-id',
				content: expect.objectContaining({
					status: 'accepted',
					escrowId: 'escrow-legacy-123',
					transactionHash: '0xlegacyhash',
					acceptanceSnapshot
				})
			})
		);
	});

	it('reconciles provisional tasker timelines into contract_sync_pending instead of leaving accept_unknown', async () => {
		const { serviceQuoteUiStore } = await import('$lib/stores/service-quote-ui.store');

		queryServiceQuotesForTasker.mockResolvedValueOnce({
			timelines: [
				createTimelineWithStatus('accept_unknown', {
					transactionHash: '0xservicehash',
					reasonCode: 'pending_timeout'
				})
			]
		});
		reconcileQuoteAcceptanceTimeline.mockResolvedValueOnce({
			status: 'contract_sync_pending',
			escrowId: 'escrow-sync-123',
			transactionHash: '0xservicehash'
		});

		await serviceQuoteUiStore.loadTaskerTimelines('qr_12345678');

		await vi.waitFor(() => {
			expect(get(serviceQuoteUiStore).taskerTimelines[0]?.resolvedStatus).toBe(
				'contract_sync_pending'
			);
		});
		expect(get(serviceQuoteUiStore).taskerTimelines[0]?.linkedEscrowId).toBe('escrow-sync-123');
		expect(publishServiceProposalStatus).toHaveBeenCalledWith(
			expect.objectContaining({
				content: expect.objectContaining({
					status: 'contract_sync_pending',
					escrowId: 'escrow-sync-123',
					transactionHash: '0xservicehash'
				})
			})
		);
	});

	it('reconciles recoverable accepting timelines into accept_failed when recovery proves the transaction failed', async () => {
		const { serviceQuoteUiStore } = await import('$lib/stores/service-quote-ui.store');

		queryServiceQuotesForTasker.mockResolvedValueOnce({
			timelines: [
				createTimelineWithStatus('accepting', {
					transactionHash: '0xservicehash'
				})
			]
		});
		reconcileQuoteAcceptanceTimeline.mockResolvedValueOnce({
			status: 'accept_failed',
			transactionHash: '0xservicehash',
			error: 'The service quote funding transaction did not complete successfully.'
		});

		await serviceQuoteUiStore.loadTaskerTimelines('qr_12345678');

		await vi.waitFor(() => {
			expect(get(serviceQuoteUiStore).taskerTimelines[0]?.resolvedStatus).toBe('accept_failed');
		});
		expect(publishServiceProposalStatus).toHaveBeenCalledWith(
			expect.objectContaining({
				content: expect.objectContaining({
					status: 'accept_failed',
					transactionHash: '0xservicehash',
					message: 'The service quote funding transaction did not complete successfully.'
				})
			})
		);
	});

	it('heals provider accept_unknown timelines locally without republishing tasker status events', async () => {
		const { serviceQuoteUiStore } = await import('$lib/stores/service-quote-ui.store');
		const serviceAddress = '30402:' + 'a'.repeat(64) + ':service-1234';
		const acceptanceSnapshot = createAcceptanceSnapshot({
			conversionSnapshotId: 'quote:pr_provider_recovered'
		});

		queryServiceQuotesForTaskee.mockResolvedValueOnce({
			timelines: [
				createTimelineWithStatus('accept_unknown', {
					transactionHash: '0xservicehash',
					reasonCode: 'pending_timeout'
				})
			]
		});
		reconcileQuoteAcceptanceTimeline.mockResolvedValueOnce({
			status: 'accepted',
			escrowId: 'escrow-provider-123',
			transactionHash: '0xservicehash',
			acceptanceSnapshot,
			matchedContract: {} as never
		});

		await serviceQuoteUiStore.loadProviderTimelines(serviceAddress, 'qr_12345678');

		await vi.waitFor(() => {
			expect(
				get(serviceQuoteUiStore).providerTimelinesByService[serviceAddress][0]?.resolvedStatus
			).toBe('accepted');
		});
		expect(
			get(serviceQuoteUiStore).providerTimelinesByService[serviceAddress][0]?.linkedEscrowId
		).toBe('escrow-provider-123');
		expect(publishServiceProposalStatus).not.toHaveBeenCalled();
	});

	it('upgrades the local timeline to accepted when escrow confirmation resolves', async () => {
		const { serviceQuoteUiStore } = await import('$lib/stores/service-quote-ui.store');
		waitForContractCreationByTransactionHash.mockResolvedValueOnce({
			escrowId: 'escrow-123',
			transactionHash: '0xservicehash'
		});

		await serviceQuoteUiStore.loadTaskerTimelines('qr_12345678');
		await serviceQuoteUiStore.acceptTaskerProposal({
			quoteRequestId: 'qr_12345678',
			proposalId: 'pr_12345678'
		});

		await vi.waitFor(() => {
			expect(get(serviceQuoteUiStore).taskerTimelines[0]?.resolvedStatus).toBe('accepted');
		});
		expect(get(serviceQuoteUiStore).taskerTimelines[0]?.linkedEscrowId).toBe('escrow-123');
		expect(retryPendingServiceAcceptanceByEscrowId).toHaveBeenCalledWith('escrow-123');
		expect(publishServiceProposalStatus).toHaveBeenNthCalledWith(
			2,
			expect.objectContaining({
				content: expect.objectContaining({
					status: 'accepted',
					escrowId: 'escrow-123',
					transactionHash: '0xservicehash',
					acceptanceSnapshot: expect.objectContaining({
						confirmationsAtVerification: 3
					})
				})
			})
		);
	});

	it('leaves the proposal actionable when contract creation fails before a transaction is submitted', async () => {
		const { serviceQuoteUiStore } = await import('$lib/stores/service-quote-ui.store');
		createServiceContract.mockResolvedValueOnce({
			success: false,
			state: 'funding_failed',
			error: 'wallet not ready',
			errorCode: 'wallet_not_ready'
		});

		await serviceQuoteUiStore.loadTaskerTimelines('qr_12345678');
		const result = await serviceQuoteUiStore.acceptTaskerProposal({
			quoteRequestId: 'qr_12345678',
			proposalId: 'pr_12345678'
		});

		expect(result).toEqual({
			success: false,
			error: 'wallet not ready',
			errorCode: 'wallet_not_ready'
		});
		expect(publishServiceProposalStatus).not.toHaveBeenCalled();
		expect(get(serviceQuoteUiStore).taskerTimelines[0]?.resolvedStatus).toBe('pending');
	});

	it('leaves the proposal actionable when contract creation throws before a transaction is submitted', async () => {
		const { serviceQuoteUiStore } = await import('$lib/stores/service-quote-ui.store');
		createServiceContract.mockRejectedValueOnce(new Error('rpc exploded'));

		await serviceQuoteUiStore.loadTaskerTimelines('qr_12345678');
		const result = await serviceQuoteUiStore.acceptTaskerProposal({
			quoteRequestId: 'qr_12345678',
			proposalId: 'pr_12345678'
		});

		expect(result).toEqual({
			success: false,
			error: 'rpc exploded'
		});
		expect(publishServiceProposalStatus).not.toHaveBeenCalled();
		expect(get(serviceQuoteUiStore).taskerTimelines[0]?.resolvedStatus).toBe('pending');
	});

	it('keeps the acceptance in progress when contract bookkeeping fails after broadcast', async () => {
		const { serviceQuoteUiStore } = await import('$lib/stores/service-quote-ui.store');
		waitForContractCreationByTransactionHash.mockRejectedValueOnce(
			new Error(
				'The escrow transaction was submitted, but the contract confirmation is still syncing. Open Contracts to monitor it.'
			)
		);
		recoverServiceQuoteAcceptanceContract.mockResolvedValueOnce({
			status: 'contract_sync_pending',
			transactionHash: '0xservicehash',
			escrowId: 'escrow-123'
		});

		createServiceContract.mockResolvedValueOnce({
			success: false,
			transactionHash: '0xservicehash',
			acceptanceSnapshot: createAcceptanceSnapshot({
				confirmationsAtVerification: 0
			}),
			error: 'snapshot registration failed'
		});
		await serviceQuoteUiStore.loadTaskerTimelines('qr_12345678');

		const result = await serviceQuoteUiStore.acceptTaskerProposal({
			quoteRequestId: 'qr_12345678',
			proposalId: 'pr_12345678'
		});

		expect(result).toEqual({
			success: true,
			transactionHash: '0xservicehash'
		});
		expect(publishServiceProposalStatus).toHaveBeenNthCalledWith(
			1,
			expect.objectContaining({
				content: expect.objectContaining({
					status: 'accepting',
					transactionHash: '0xservicehash'
				})
			})
		);
		await vi.waitFor(() => {
			expect(get(serviceQuoteUiStore).taskerTimelines[0]?.resolvedStatus).toBe(
				'contract_sync_pending'
			);
		});
	});

	it('updates non-blocking messages and clears recent submit focus state', async () => {
		const { serviceQuoteUiStore } = await import('$lib/stores/service-quote-ui.store');

		await serviceQuoteUiStore.submitQuoteRequest({
			service,
			payload: {
				title: 'Need a logo refresh',
				description: 'Please redesign our logo.'
			}
		});
		serviceQuoteUiStore.setNonBlockingMessage('service_quote_protocol_pending');

		expect(get(serviceQuoteUiStore).nonBlockingMessageCode).toBe('service_quote_protocol_pending');

		serviceQuoteUiStore.clearRecentSubmit();
		expect(get(serviceQuoteUiStore).focusSync).toEqual({
			requestId: null,
			serviceAddress: null,
			expiresAt: null
		});
	});

	it('resets loading state when tasker timeline loading fails', async () => {
		const { serviceQuoteUiStore } = await import('$lib/stores/service-quote-ui.store');
		queryServiceQuotesForTasker.mockRejectedValueOnce(new Error('tasker query failed'));

		await expect(serviceQuoteUiStore.loadTaskerTimelines('qr_12345678')).rejects.toThrow(
			'tasker query failed'
		);
		expect(get(serviceQuoteUiStore)).toMatchObject({
			loadingTasker: false,
			taskerLoaded: true,
			taskerLoadError: 'tasker query failed'
		});
	});

	it('marks cached tasker quote data as stale when a refresh fails after prior success', async () => {
		const { getTaskerDataFreshness, serviceQuoteUiStore } = await import(
			'$lib/stores/service-quote-ui.store'
		);

		await serviceQuoteUiStore.loadTaskerTimelines('qr_12345678');
		queryServiceQuotesForTasker.mockRejectedValueOnce(new Error('tasker query failed'));

		await expect(serviceQuoteUiStore.loadTaskerTimelines('qr_12345678')).rejects.toThrow(
			'tasker query failed'
		);

		expect(getTaskerDataFreshness(get(serviceQuoteUiStore))).toBe('stale');
		expect(get(serviceQuoteUiStore).taskerTimelines).toHaveLength(1);
	});

	it('marks tasker quote data as partial while an exact focused request is still syncing but not query-visible', async () => {
		const { getTaskerDataFreshness, serviceQuoteUiStore } = await import(
			'$lib/stores/service-quote-ui.store'
		);

		await serviceQuoteUiStore.submitQuoteRequest({
			service,
			payload: {
				title: 'Need a logo refresh',
				description: 'Please redesign our logo.'
			}
		});

		queryServiceQuotesForTasker.mockResolvedValueOnce({
			timelines: [createTimelineWithRequestId('qr_other123')]
		});

		const requestId = get(serviceQuoteUiStore).focusSync.requestId as string;
		await serviceQuoteUiStore.loadTaskerTimelines(requestId);

		expect(getTaskerDataFreshness(get(serviceQuoteUiStore))).toBe('partial');
		expect(get(serviceQuoteUiStore).focusSync.requestId).toBe(requestId);
	});

	it('resets loading state when provider timeline loading fails', async () => {
		const { serviceQuoteUiStore } = await import('$lib/stores/service-quote-ui.store');
		queryServiceQuotesForTaskee.mockRejectedValueOnce(new Error('provider query failed'));

		await expect(
			serviceQuoteUiStore.loadProviderTimelines(
				'30402:' + 'a'.repeat(64) + ':service-1234',
				'qr_12345678'
			)
		).rejects.toThrow('provider query failed');

		expect(get(serviceQuoteUiStore)).toMatchObject({
			loadingProviderByService: {
				['30402:' + 'a'.repeat(64) + ':service-1234']: false
			},
			providerLoadedByService: {
				['30402:' + 'a'.repeat(64) + ':service-1234']: false
			},
			providerLoadErrorByService: {
				['30402:' + 'a'.repeat(64) + ':service-1234']: 'provider query failed'
			}
		});
	});

	it('marks provider quote data as partial while an exact focused request is still syncing but not query-visible', async () => {
		const { buildServiceAddress, getProviderDataFreshness, serviceQuoteUiStore } = await import(
			'$lib/stores/service-quote-ui.store'
		);
		const serviceAddress = buildServiceAddress(service);

		await serviceQuoteUiStore.submitQuoteRequest({
			service,
			payload: {
				title: 'Need a logo refresh',
				description: 'Please redesign our logo.'
			}
		});

		queryServiceQuotesForTaskee.mockResolvedValueOnce({
			timelines: [createTimelineWithRequestId('qr_other123')]
		});

		const requestId = get(serviceQuoteUiStore).focusSync.requestId as string;
		await serviceQuoteUiStore.loadProviderTimelines(serviceAddress, requestId);

		expect(getProviderDataFreshness(get(serviceQuoteUiStore), serviceAddress)).toBe('partial');
		expect(get(serviceQuoteUiStore).focusSync.requestId).toBe(requestId);
	});

	it('does not treat an exact-request provider cache entry as a full-service cache hit', async () => {
		const { buildServiceAddress, serviceQuoteUiStore } = await import(
			'$lib/stores/service-quote-ui.store'
		);
		const serviceAddress = buildServiceAddress(service);

		queryServiceQuotesForTaskee
			.mockResolvedValueOnce({
				timelines: [createTimelineWithRequestId('qr_12345678')]
			})
			.mockResolvedValueOnce({
				timelines: [
					createTimelineWithRequestId('qr_12345678'),
					createTimelineWithRequestId('qr_87654321')
				]
			});

		await serviceQuoteUiStore.loadProviderTimelines(serviceAddress, 'qr_12345678');
		await serviceQuoteUiStore.loadProviderTimelines(serviceAddress, null);

		expect(queryServiceQuotesForTaskee).toHaveBeenNthCalledWith(
			1,
			serviceAddress,
			'b'.repeat(64),
			undefined,
			'qr_12345678'
		);
		expect(queryServiceQuotesForTaskee).toHaveBeenNthCalledWith(
			2,
			serviceAddress,
			'b'.repeat(64),
			undefined,
			undefined
		);
		expect(get(serviceQuoteUiStore).providerTimelinesByService[serviceAddress]).toHaveLength(2);
		expect(get(serviceQuoteUiStore).providerCacheKeyByService[serviceAddress]).toBe('*');
	});

	it('marks provider quote freshness as partial when the relay response reports truncation', async () => {
		const { buildServiceAddress, getProviderDataFreshness, serviceQuoteUiStore } = await import(
			'$lib/stores/service-quote-ui.store'
		);
		const serviceAddress = buildServiceAddress(service);

		queryServiceQuotesForTaskee.mockResolvedValueOnce({
			timelines: [createTimeline()],
			isPartial: true
		});

		await serviceQuoteUiStore.loadProviderTimelines(serviceAddress, null);

		expect(getProviderDataFreshness(get(serviceQuoteUiStore), serviceAddress)).toBe('partial');
	});

	it('reconciles exact request focus when a same-service provider load is already in flight', async () => {
		const { buildServiceAddress, getProviderDataFreshness, serviceQuoteUiStore } = await import(
			'$lib/stores/service-quote-ui.store'
		);
		const serviceAddress = buildServiceAddress(service);
		const deferred = createDeferred<{ timelines: ServiceQuoteTimelineEntry[] }>();

		await serviceQuoteUiStore.submitQuoteRequest({
			service,
			payload: {
				title: 'Need a logo refresh',
				description: 'Please redesign our logo.'
			}
		});

		const requestId = get(serviceQuoteUiStore).focusSync.requestId as string;
		queryServiceQuotesForTaskee.mockImplementationOnce(() => deferred.promise);

		const baseLoad = serviceQuoteUiStore.loadProviderTimelines(serviceAddress, null);
		const focusedLoad = serviceQuoteUiStore.loadProviderTimelines(serviceAddress, requestId);

		deferred.resolve({
			timelines: [createTimelineWithRequestId('qr_other123')]
		});

		await Promise.all([baseLoad, focusedLoad]);

		expect(queryServiceQuotesForTaskee).toHaveBeenCalledTimes(2);
		expect(getProviderDataFreshness(get(serviceQuoteUiStore), serviceAddress)).toBe('partial');
		expect(get(serviceQuoteUiStore).focusSync.requestId).toBe(requestId);
	});

	it('treats exact-request provider cache entries as incomplete once the request filter clears', async () => {
		const { buildServiceAddress, serviceQuoteUiStore } = await import(
			'$lib/stores/service-quote-ui.store'
		);
		const serviceAddress = buildServiceAddress(service);

		queryServiceQuotesForTaskee
			.mockResolvedValueOnce({
				timelines: [createTimelineWithRequestId('qr_12345678')]
			})
			.mockResolvedValueOnce({
				timelines: [
					createTimelineWithRequestId('qr_12345678'),
					createTimelineWithRequestId('qr_87654321')
				]
			});

		await serviceQuoteUiStore.loadProviderTimelines(serviceAddress, 'qr_12345678');
		await serviceQuoteUiStore.loadProviderTimelines(serviceAddress, null);

		expect(queryServiceQuotesForTaskee).toHaveBeenNthCalledWith(
			1,
			serviceAddress,
			'b'.repeat(64),
			undefined,
			'qr_12345678'
		);
		expect(queryServiceQuotesForTaskee).toHaveBeenNthCalledWith(
			2,
			serviceAddress,
			'b'.repeat(64),
			undefined,
			undefined
		);
		expect(get(serviceQuoteUiStore).providerTimelinesByService[serviceAddress]).toHaveLength(2);
	});

	it('marks provider quote data as partial when the taskee query reports truncation', async () => {
		const { buildServiceAddress, getProviderDataFreshness, serviceQuoteUiStore } = await import(
			'$lib/stores/service-quote-ui.store'
		);
		const serviceAddress = buildServiceAddress(service);

		queryServiceQuotesForTaskee.mockResolvedValueOnce({
			timelines: [createTimeline()],
			isPartial: true
		});

		await serviceQuoteUiStore.loadProviderTimelines(serviceAddress, null);

		expect(getProviderDataFreshness(get(serviceQuoteUiStore), serviceAddress)).toBe('partial');
	});

	it('starts a fresh provider query when force refresh is requested during an in-flight load', async () => {
		const { buildServiceAddress, serviceQuoteUiStore } = await import(
			'$lib/stores/service-quote-ui.store'
		);
		const serviceAddress = buildServiceAddress(service);
		const firstLoad = createDeferred<{ timelines: ServiceQuoteTimelineEntry[] }>();
		const forcedLoad = createDeferred<{ timelines: ServiceQuoteTimelineEntry[] }>();

		queryServiceQuotesForTaskee
			.mockImplementationOnce(() => firstLoad.promise)
			.mockImplementationOnce(() => forcedLoad.promise);

		const initialPromise = serviceQuoteUiStore.loadProviderTimelines(serviceAddress, 'qr_12345678');
		const forcedPromise = serviceQuoteUiStore.loadProviderTimelines(serviceAddress, 'qr_12345678', {
			force: true
		});

		await vi.waitFor(() => {
			expect(queryServiceQuotesForTaskee).toHaveBeenCalledTimes(2);
		});

		firstLoad.resolve({
			timelines: [createTimelineWithRequestId('qr_stale123')]
		});
		forcedLoad.resolve({
			timelines: [createTimelineWithRequestId('qr_12345678')]
		});

		await Promise.all([initialPromise, forcedPromise]);

		expect(
			get(serviceQuoteUiStore).providerTimelinesByService[serviceAddress][0]?.request.content
				.quoteRequestId
		).toBe('qr_12345678');
	});

	it('keeps provider timelines marked as loaded when a refresh fails after prior success', async () => {
		const { buildServiceAddress, serviceQuoteUiStore } = await import(
			'$lib/stores/service-quote-ui.store'
		);
		const serviceAddress = buildServiceAddress(service);

		await serviceQuoteUiStore.loadProviderTimelines(serviceAddress, 'qr_12345678');
		queryServiceQuotesForTaskee.mockRejectedValueOnce(new Error('provider query failed'));

		await expect(
			serviceQuoteUiStore.loadProviderTimelines(serviceAddress, 'qr_12345678', { force: true })
		).rejects.toThrow('provider query failed');

		expect(get(serviceQuoteUiStore)).toMatchObject({
			providerLoadedByService: {
				[serviceAddress]: true
			},
			providerLoadErrorByService: {
				[serviceAddress]: 'provider query failed'
			}
		});
	});

	it('clears quote timeline load errors after a successful retry', async () => {
		const { getProviderDataFreshness, getTaskerDataFreshness, serviceQuoteUiStore } = await import(
			'$lib/stores/service-quote-ui.store'
		);
		const serviceAddress = '30402:' + 'a'.repeat(64) + ':service-1234';

		queryServiceQuotesForTasker.mockRejectedValueOnce(new Error('tasker query failed'));
		await expect(serviceQuoteUiStore.loadTaskerTimelines('qr_12345678')).rejects.toThrow(
			'tasker query failed'
		);
		queryServiceQuotesForTasker.mockResolvedValueOnce({ timelines: [createTimeline()] });
		await serviceQuoteUiStore.loadTaskerTimelines('qr_12345678');

		queryServiceQuotesForTaskee.mockRejectedValueOnce(new Error('provider query failed'));
		await expect(
			serviceQuoteUiStore.loadProviderTimelines(serviceAddress, 'qr_12345678')
		).rejects.toThrow('provider query failed');
		queryServiceQuotesForTaskee.mockReset();
		queryServiceQuotesForTaskee.mockResolvedValue({ timelines: [createTimeline()] });
		await serviceQuoteUiStore.loadProviderTimelines(serviceAddress, 'qr_12345678');

		expect(get(serviceQuoteUiStore)).toMatchObject({
			taskerLoadError: null,
			providerLoadErrorByService: {
				[serviceAddress]: null
			}
		});
		expect(getTaskerDataFreshness(get(serviceQuoteUiStore))).toBe('fresh');
		expect(getProviderDataFreshness(get(serviceQuoteUiStore), serviceAddress)).toBe('fresh');
	});

	it('fails quote submission closed when publishing throws', async () => {
		const { serviceQuoteUiStore } = await import('$lib/stores/service-quote-ui.store');
		publishServiceQuoteRequest.mockRejectedValueOnce(new Error('publish failed'));

		await expect(
			serviceQuoteUiStore.submitQuoteRequest({
				service,
				payload: {
					title: 'Need a logo refresh',
					description: 'Please redesign our logo.'
				}
			})
		).resolves.toEqual({
			success: false,
			error: 'publish failed'
		});
	});

	it('fails provider proposal publishing when the request thread cannot be found', async () => {
		const { serviceQuoteUiStore } = await import('$lib/stores/service-quote-ui.store');
		queryServiceQuotesForTaskee.mockResolvedValueOnce({ timelines: [] });

		await expect(
			serviceQuoteUiStore.sendLocalProposal({
				service,
				serviceAddress: '30402:' + 'a'.repeat(64) + ':service-1234',
				quoteRequestId: 'qr_missing000',
				description: 'Three concepts and revisions',
				amountUsdt: '140.00',
				estimatedDuration: '3 days',
				estimatedStartTime: 1_700_001_000,
				estimatedEndTime: 1_700_260_200,
				expirationDays: 3,
				expirationHours: 0
			})
		).resolves.toEqual({
			success: false,
			error: 'Unable to locate the selected quote request.'
		});
	});

	it('fails provider proposal publishing for expired quote requests', async () => {
		const { serviceQuoteUiStore } = await import('$lib/stores/service-quote-ui.store');
		queryServiceQuotesForTaskee.mockResolvedValueOnce({
			timelines: [
				{
					...createTimeline(),
					resolvedStatus: 'expired',
					isExpired: true
				}
			]
		});

		await serviceQuoteUiStore.loadProviderTimelines(
			'30402:' + 'a'.repeat(64) + ':service-1234',
			'qr_12345678'
		);

		await expect(
			serviceQuoteUiStore.sendLocalProposal({
				service,
				serviceAddress: '30402:' + 'a'.repeat(64) + ':service-1234',
				quoteRequestId: 'qr_12345678',
				description: 'Three concepts and revisions',
				amountUsdt: '140.00',
				estimatedDuration: '3 days',
				estimatedStartTime: 1_700_001_000,
				estimatedEndTime: 1_700_260_200,
				expirationDays: 3,
				expirationHours: 0
			})
		).resolves.toEqual({
			success: false,
			error: 'This quote request has already expired.'
		});
		expect(publishServiceProposal).not.toHaveBeenCalled();
	});

	it('fails provider proposal publishing when the selected request already has a linked contract', async () => {
		const { serviceQuoteUiStore } = await import('$lib/stores/service-quote-ui.store');
		queryServiceQuotesForTaskee.mockResolvedValueOnce({
			timelines: [
				{
					...createTimeline(),
					resolvedStatus: 'accepted',
					linkedEscrowId: 'escrow-123'
				}
			]
		});

		await serviceQuoteUiStore.loadProviderTimelines(
			'30402:' + 'a'.repeat(64) + ':service-1234',
			'qr_12345678'
		);

		await expect(
			serviceQuoteUiStore.sendLocalProposal({
				service,
				serviceAddress: '30402:' + 'a'.repeat(64) + ':service-1234',
				quoteRequestId: 'qr_12345678',
				description: 'Three concepts and revisions',
				amountUsdt: '140.00',
				estimatedDuration: '3 days',
				estimatedStartTime: 1_700_001_000,
				estimatedEndTime: 1_700_260_200,
				expirationDays: 3,
				expirationHours: 0
			})
		).resolves.toEqual({
			success: false,
			error: 'This quote request has already been converted into an active service contract.'
		});
		expect(publishServiceProposal).not.toHaveBeenCalled();
	});

	it('returns a wallet error when provider proposal wallet resolution still fails', async () => {
		const { serviceQuoteUiStore } = await import('$lib/stores/service-quote-ui.store');
		walletStore.set({
			rsk: {
				address: ''
			}
		});
		getRSKAddress.mockResolvedValueOnce('');

		await serviceQuoteUiStore.loadProviderTimelines(
			'30402:' + 'a'.repeat(64) + ':service-1234',
			'qr_12345678'
		);

		await expect(
			serviceQuoteUiStore.sendLocalProposal({
				service,
				serviceAddress: '30402:' + 'a'.repeat(64) + ':service-1234',
				quoteRequestId: 'qr_12345678',
				description: 'Three concepts and revisions',
				amountUsdt: '140.00',
				estimatedDuration: '3 days',
				estimatedStartTime: 1_700_001_000,
				estimatedEndTime: 1_700_260_200,
				expirationDays: 3,
				expirationHours: 0
			})
		).resolves.toEqual({
			success: false,
			error: 'Connect your wallet before sending a proposal.'
		});
		expect(publishServiceProposal).not.toHaveBeenCalled();
	});

	it('returns publish errors from provider proposals and tasker status updates', async () => {
		const { serviceQuoteUiStore } = await import('$lib/stores/service-quote-ui.store');
		await serviceQuoteUiStore.loadProviderTimelines(
			'30402:' + 'a'.repeat(64) + ':service-1234',
			'qr_12345678'
		);
		await serviceQuoteUiStore.loadTaskerTimelines('qr_12345678');

		publishServiceProposal.mockRejectedValueOnce(new Error('proposal publish failed'));
		await expect(
			serviceQuoteUiStore.sendLocalProposal({
				service,
				serviceAddress: '30402:' + 'a'.repeat(64) + ':service-1234',
				quoteRequestId: 'qr_12345678',
				description: 'Three concepts and revisions',
				amountUsdt: '140.00',
				estimatedDuration: '3 days',
				estimatedStartTime: 1_700_001_000,
				estimatedEndTime: 1_700_260_200,
				expirationDays: 3,
				expirationHours: 0
			})
		).resolves.toEqual({
			success: false,
			error: 'proposal publish failed'
		});

		publishServiceProposalStatus.mockRejectedValueOnce(new Error('status publish failed'));
		await expect(
			serviceQuoteUiStore.applyTaskerStatus({
				quoteRequestId: 'qr_12345678',
				proposalId: 'pr_12345678',
				status: 'declined'
			})
		).resolves.toEqual({
			success: false,
			error: 'status publish failed'
		});
	});

	it('clears focused request sync state when matching timelines become visible', async () => {
		const { buildServiceAddress, serviceQuoteUiStore } = await import(
			'$lib/stores/service-quote-ui.store'
		);

		const submitResult = await serviceQuoteUiStore.submitQuoteRequest({
			service,
			payload: {
				title: 'Need a logo refresh',
				description: 'Please redesign our logo.'
			}
		});
		const requestId = submitResult.quoteRequestId as string;
		queryServiceQuotesForTasker.mockResolvedValueOnce({
			timelines: [createTimelineWithRequestId(requestId)]
		});
		await serviceQuoteUiStore.loadTaskerTimelines(requestId);
		expect(get(serviceQuoteUiStore).focusSync.requestId).toBeNull();

		await serviceQuoteUiStore.submitQuoteRequest({
			service,
			payload: {
				title: 'Need a logo refresh',
				description: 'Please redesign our logo.'
			}
		});
		const providerRequestId = get(serviceQuoteUiStore).focusSync.requestId as string;
		queryServiceQuotesForTaskee.mockResolvedValueOnce({
			timelines: [createTimelineWithRequestId(providerRequestId)]
		});
		await serviceQuoteUiStore.loadProviderTimelines(
			buildServiceAddress(service),
			providerRequestId
		);
		expect(get(serviceQuoteUiStore).focusSync.requestId).toBeNull();
	});

	it('exports dashboard and syncing helpers with defensive defaults', async () => {
		const {
			createDashboardUrl,
			getProviderTimelines,
			isProviderTimelineSyncing,
			isRequestSyncActive,
			isTaskerTimelineSyncing,
			serviceQuoteUiStore
		} = await import('$lib/stores/service-quote-ui.store');

		const nextUrl = createDashboardUrl(new URL('https://bittasker.test/dashboard?tab=tasks'), {
			tab: 'contracts',
			type: 'services',
			highlight: 'escrow_123'
		});

		expect(nextUrl.toString()).toBe(
			'https://bittasker.test/dashboard?tab=contracts&type=services&highlight=escrow_123'
		);
		expect(getProviderTimelines(get(serviceQuoteUiStore), null)).toEqual([]);

		const state = {
			loadingTasker: false,
			loadingProviderByService: {
				['30402:' + 'a'.repeat(64) + ':service-1234']: false
			},
			focusSync: {
				requestId: 'qr_syncing12',
				serviceAddress: '30402:' + 'a'.repeat(64) + ':service-1234',
				expiresAt: Date.now() + 10_000
			}
		};

		expect(
			isRequestSyncActive(state, 'qr_syncing12', '30402:' + 'a'.repeat(64) + ':service-1234')
		).toBe(true);
		expect(
			isRequestSyncActive(state, 'qr_syncing12', '30402:' + 'b'.repeat(64) + ':service-1234')
		).toBe(false);
		expect(isTaskerTimelineSyncing(state, 'qr_syncing12')).toBe(true);
		expect(
			isProviderTimelineSyncing(state, '30402:' + 'a'.repeat(64) + ':service-1234', 'qr_syncing12')
		).toBe(true);
		expect(isProviderTimelineSyncing(state, null, 'qr_syncing12')).toBe(false);
	});

	it('publishes hourly proposals and fails closed on invalid wallet addresses', async () => {
		const { serviceQuoteUiStore } = await import('$lib/stores/service-quote-ui.store');
		const serviceAddress = '30402:' + 'a'.repeat(64) + ':service-1234';
		const hourlyService = {
			...service,
			pricing: {
				type: 'HOURLY',
				currency: 'USDt',
				baseRate: 75
			}
		} as Service;

		await serviceQuoteUiStore.loadProviderTimelines(serviceAddress, 'qr_12345678');
		const result = await serviceQuoteUiStore.sendLocalProposal({
			service: hourlyService,
			serviceAddress,
			quoteRequestId: 'qr_12345678',
			description: 'Hourly support',
			amountUsdt: '75.00',
			estimatedDuration: '1 hour',
			estimatedStartTime: 1_700_001_000,
			estimatedEndTime: 1_700_004_600,
			expirationDays: 1,
			expirationHours: 0
		});

		expect(result.success).toBe(true);
		expect(publishServiceProposal).toHaveBeenLastCalledWith(
			expect.objectContaining({
				content: expect.objectContaining({
					paymentType: 'HOURLY',
					pricingSnapshot: expect.objectContaining({
						travelFeeUsdt: '0.00'
					})
				})
			})
		);

		walletStore.set({
			rsk: {
				address: 'not-an-address'
			}
		});
		getRSKAddress.mockResolvedValueOnce('still-not-an-address');
		await expect(
			serviceQuoteUiStore.sendLocalProposal({
				service,
				serviceAddress,
				quoteRequestId: 'qr_12345678',
				description: 'Three concepts and revisions',
				amountUsdt: '140.00',
				estimatedDuration: '3 days',
				estimatedStartTime: 1_700_001_000,
				estimatedEndTime: 1_700_260_200,
				expirationDays: 3,
				expirationHours: 0
			})
		).resolves.toEqual({
			success: false,
			error: 'Connect your wallet before sending a proposal.'
		});
	});

	it('fails tasker status updates closed when the selected proposal cannot be found', async () => {
		const { serviceQuoteUiStore } = await import('$lib/stores/service-quote-ui.store');

		await expect(
			serviceQuoteUiStore.applyTaskerStatus({
				quoteRequestId: 'qr_missing000',
				proposalId: 'pr_missing000',
				status: 'declined'
			})
		).resolves.toEqual({
			success: false,
			error: 'Unable to locate the selected proposal.'
		});
	});
});
