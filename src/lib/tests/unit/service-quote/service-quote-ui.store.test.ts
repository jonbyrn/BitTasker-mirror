import { beforeEach, describe, expect, it, vi } from 'vitest';
import { get, writable } from 'svelte/store';
import type { Service } from '$lib/types/service.d';
import type { ServiceQuoteTimelineEntry } from '$lib/types/service-quote';

const publishServiceQuoteRequest = vi.fn();
const publishServiceQuoteRequestDeletion = vi.fn();
const publishServiceProposal = vi.fn();
const publishServiceProposalStatus = vi.fn();
const queryServiceQuotesForTasker = vi.fn();
const queryServiceQuotesForTaskee = vi.fn();
const getNpub = vi.fn();
const createServiceContract = vi.fn();
const waitForContractCreationByTransactionHash = vi.fn();
const getContractCreationTimeoutReason = vi.fn();
const walletStore = writable({
	rsk: {
		address: '0x1234567890123456789012345678901234567890'
	}
});

vi.mock('$lib/utils/service-quote/publish', () => ({
	publishServiceQuoteRequest: (...args: unknown[]) => publishServiceQuoteRequest(...args),
	publishServiceQuoteRequestDeletion: (...args: unknown[]) =>
		publishServiceQuoteRequestDeletion(...args),
	publishServiceProposal: (...args: unknown[]) => publishServiceProposal(...args),
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
	walletStore
}));

vi.mock('$lib/utils/service-contract/create', () => ({
	createServiceContract: (...args: unknown[]) => createServiceContract(...args)
}));

vi.mock('$lib/utils/service-contract/await-contract-creation', () => ({
	CONTRACT_CREATION_SYNCING_MESSAGE:
		'The escrow transaction was submitted, but the contract confirmation is still syncing. Open Contracts to monitor it.',
	waitForContractCreationByTransactionHash: (...args: unknown[]) =>
		waitForContractCreationByTransactionHash(...args),
	getContractCreationTimeoutReason: (...args: unknown[]) =>
		getContractCreationTimeoutReason(...args)
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
				pricingType: 'TIERED',
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
			...timeline.latestProposal,
			content: {
				...timeline.latestProposal.content,
				quoteRequestId
			}
		}
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
		vi.resetModules();
		vi.clearAllMocks();
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
		publishServiceProposalStatus.mockResolvedValue({
			event: { id: 'status-event-id' },
			relayResults: [],
			publishedRelaySet: []
		});
		createServiceContract.mockResolvedValue({
			success: true,
			transactionHash: '0xservicehash'
		});
		waitForContractCreationByTransactionHash.mockImplementation(() => new Promise(() => undefined));
		getContractCreationTimeoutReason.mockReturnValue('pending_timeout');
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
			new URLSearchParams(`tab=quotes&view=tasker&request=${requestId}`)
		);

		expect(parsed.state.requestId).toBe(requestId);
		expect(parsed.messageCode).toBeNull();
	});

	it('sanitizes invalid quote and contract params', async () => {
		const { serviceQuoteUiStore } = await import('$lib/stores/service-quote-ui.store');

		const quotesParsed = serviceQuoteUiStore.parseDashboardQuery(
			new URLSearchParams('tab=quotes&view=tasker&request=bad!')
		);
		expect(quotesParsed.state.requestId).toBeNull();
		expect(quotesParsed.messageCode).toBe('quotes_request_not_found');

		const contractsParsed = serviceQuoteUiStore.parseDashboardQuery(
			new URLSearchParams('tab=contracts&context=services&highlight=%%%')
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

	it('fails closed when provider proposal authoring cannot normalize the wallet', async () => {
		const { serviceQuoteUiStore } = await import('$lib/stores/service-quote-ui.store');
		walletStore.set({
			rsk: {
				address: 'not-an-address'
			}
		});

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
			success: false,
			error: 'Connect your wallet before sending a proposal.'
		});
		expect(publishServiceProposal).not.toHaveBeenCalled();
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
					quoteRequestId: 'qr_12345678'
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

	it('marks acceptance as unknown when escrow confirmation times out', async () => {
		const { serviceQuoteUiStore } = await import('$lib/stores/service-quote-ui.store');
		waitForContractCreationByTransactionHash.mockRejectedValueOnce(
			new Error(
				'The escrow transaction was submitted, but the contract confirmation is still syncing. Open Contracts to monitor it.'
			)
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
	});

	it('publishes accept_failed when contract creation fails after accepting', async () => {
		const { serviceQuoteUiStore } = await import('$lib/stores/service-quote-ui.store');
		createServiceContract.mockResolvedValueOnce({
			success: false,
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
		expect(publishServiceProposalStatus).toHaveBeenNthCalledWith(
			2,
			expect.objectContaining({
				content: expect.objectContaining({
					status: 'accept_failed',
					message: 'wallet not ready'
				})
			})
		);
		expect(get(serviceQuoteUiStore).taskerTimelines[0]?.resolvedStatus).toBe('accept_failed');
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
				['30402:' + 'a'.repeat(64) + ':service-1234']: true
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

		expect(queryServiceQuotesForTaskee).toHaveBeenCalledTimes(1);
		expect(getProviderDataFreshness(get(serviceQuoteUiStore), serviceAddress)).toBe('partial');
		expect(get(serviceQuoteUiStore).focusSync.requestId).toBe(requestId);
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
		queryServiceQuotesForTaskee.mockResolvedValueOnce({ timelines: [createTimeline()] });
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

	it('requires a wallet before sending a provider proposal', async () => {
		const { serviceQuoteUiStore } = await import('$lib/stores/service-quote-ui.store');
		walletStore.set({
			rsk: {
				address: ''
			}
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
			context: 'services',
			highlight: 'escrow_123'
		});

		expect(nextUrl.toString()).toBe(
			'https://bittasker.test/dashboard?tab=contracts&context=services&highlight=escrow_123'
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
