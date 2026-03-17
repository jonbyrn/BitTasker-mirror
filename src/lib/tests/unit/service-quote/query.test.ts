import { beforeEach, describe, expect, it, vi } from 'vitest';

const queryNostrEvents = vi.fn();
const getPublishedRelaySet = vi.fn();
const validateServiceQuoteRequestEvent = vi.fn();
const validateServiceProposalStatusEvent = vi.fn();
const validateServiceProposalEvent = vi.fn();
const resolveServiceQuoteThreads = vi.fn();

vi.mock('$lib/utils/nostr', () => ({
	queryNostrEvents
}));

vi.mock('$lib/utils/service-quote/publish', () => ({
	getPublishedRelaySet
}));

vi.mock('$lib/utils/service-quote/resolver', () => ({
	resolveServiceQuoteThreads
}));

vi.mock('$lib/utils/service-quote/protocol', async () => {
	const actual = await vi.importActual<typeof import('$lib/utils/service-quote/protocol')>(
		'$lib/utils/service-quote/protocol'
	);

	return {
		...actual,
		validateServiceQuoteRequestEvent,
		validateServiceProposalEvent,
		validateServiceProposalStatusEvent
	};
});

describe('service-quote query helpers', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		validateServiceQuoteRequestEvent.mockImplementation((event) => {
			if (event.id === 'invalid-event') {
				throw new Error('invalid request');
			}

			return event;
		});
		validateServiceProposalEvent.mockImplementation((event) => event);
		validateServiceProposalStatusEvent.mockImplementation((event) => event);
		getPublishedRelaySet.mockReturnValue(['wss://relay.example']);
		resolveServiceQuoteThreads.mockImplementation(({ requests, proposals, statuses }) => [
			{
				request: requests[0],
				proposals: proposals.map((proposal: any) => ({
					proposal,
					statusEvents: statuses,
					state: 'pending',
					expiresAt: proposal.content?.expirationTimestamp ?? 0,
					isExpired: false
				})),
				taskerPubkey: requests[0]?.pubkey ?? 'b'.repeat(64),
				taskeePubkey: proposals[0]?.pubkey ?? 'a'.repeat(64),
				serviceAddress: requests[0]?.content?.serviceAddress ?? 'service-address',
				serviceId: requests[0]?.content?.serviceId ?? 'service-address',
				latestProposal: proposals[0]
					? {
							proposal: proposals[0],
							statusEvents: statuses,
							state: 'pending',
							expiresAt: proposals[0].content?.expirationTimestamp ?? 0,
							isExpired: false
						}
					: undefined
			}
		]);
	});

	it('queries taskee-facing requests with canonical address filters, deduping invalid results', async () => {
		const { queryServiceQuoteRequestsForService } = await import('$lib/utils/service-quote/query');
		const serviceAddress = `30402:${'a'.repeat(64)}:service-1234`;
		const taskeePubkey = 'a'.repeat(64);
		const validEvent = {
			id: 'request-2',
			created_at: 2,
			tags: [],
			content: {}
		};

		queryNostrEvents.mockResolvedValueOnce([
			{ id: 'request-1', created_at: 1, tags: [], content: {} },
			validEvent,
			validEvent,
			{ id: 'invalid-event', created_at: 3, tags: [], content: {} }
		]);

		const result = await queryServiceQuoteRequestsForService(serviceAddress, taskeePubkey, 25);

		expect(queryNostrEvents).toHaveBeenCalledWith(
			expect.objectContaining({
				kinds: [6420],
				'#a': [serviceAddress],
				'#p': [taskeePubkey],
				limit: 25
			}),
			undefined,
			undefined,
			expect.any(Array)
		);
		expect(result).toEqual([validEvent, { id: 'request-1', created_at: 1, tags: [], content: {} }]);
	});

	it('queries proposal statuses with proposal ids, author filters, and published relay hints', async () => {
		const { queryStatusesForProposals } = await import('$lib/utils/service-quote/query');
		const proposal = {
			id: 'proposal-event-id',
			created_at: 5,
			pubkey: 'b'.repeat(64),
			tags: [],
			content: {}
		};
		const statusEvent = {
			id: 'status-event-id',
			created_at: 7,
			tags: [],
			content: {}
		};

		queryNostrEvents.mockResolvedValueOnce([statusEvent]);

		const result = await queryStatusesForProposals([proposal as never], ['a'.repeat(64)]);

		expect(queryNostrEvents).toHaveBeenCalledWith(
			expect.objectContaining({
				kinds: [6422],
				'#e': ['proposal-event-id'],
				authors: ['a'.repeat(64)],
				limit: 500
			}),
			undefined,
			undefined,
			expect.arrayContaining(['wss://relay.example'])
		);
		expect(result).toEqual([statusEvent]);
	});

	it('builds tasker timelines and quote query results from canonical request filters', async () => {
		const {
			queryTaskerServiceQuoteThreads,
			queryServiceQuotesForTasker,
			findServiceQuoteTimelineByRequestId
		} = await import('$lib/utils/service-quote/query');
		const request = {
			id: 'request-event-id',
			pubkey: 'b'.repeat(64),
			created_at: 2,
			tags: [],
			content: {
				quoteRequestId: 'qr_valid123',
				serviceAddress: 'service-address',
				serviceId: 'service-address'
			}
		};
		const proposal = {
			id: 'proposal-event-id',
			pubkey: 'a'.repeat(64),
			created_at: 3,
			tags: [['e', 'request-event-id']],
			content: {
				proposalId: 'pr_valid123',
				expirationTimestamp: 1000
			}
		};
		const status = {
			id: 'status-event-id',
			created_at: 4,
			tags: [['e', 'proposal-event-id']],
			content: {
				proposalId: 'pr_valid123'
			}
		};

		queryNostrEvents
			.mockResolvedValueOnce([request])
			.mockResolvedValueOnce([proposal])
			.mockResolvedValueOnce([status])
			.mockResolvedValueOnce([request])
			.mockResolvedValueOnce([proposal])
			.mockResolvedValueOnce([status])
			.mockResolvedValueOnce([request])
			.mockResolvedValueOnce([proposal])
			.mockResolvedValueOnce([status]);

		const threads = await queryTaskerServiceQuoteThreads({
			taskerPubkey: 'b'.repeat(64),
			quoteRequestId: 'qr_valid123',
			limit: 25
		});
		expect(resolveServiceQuoteThreads).toHaveBeenCalledWith({
			requests: [request],
			proposals: [proposal],
			statuses: [status]
		});
		expect(threads).toHaveLength(1);

		const queryResult = await queryServiceQuotesForTasker('b'.repeat(64), 25);
		expect(queryResult.requests).toEqual([request]);
		expect(queryResult.proposals).toEqual([proposal]);
		expect(queryResult.statusEvents).toEqual([status]);
		expect(queryResult.timelines).toHaveLength(1);

		const timelineResult = await findServiceQuoteTimelineByRequestId('qr_valid123', 'b'.repeat(64));
		expect(timelineResult.requests).toEqual([request]);
	});

	it('builds taskee timelines and short-circuits proposal/status queries for empty request sets', async () => {
		const { queryTaskeeServiceQuoteThreads, queryServiceProposalsByRequestIds } = await import(
			'$lib/utils/service-quote/query'
		);
		const serviceAddress = `30402:${'a'.repeat(64)}:service-1234`;
		const request = {
			id: 'request-event-id',
			pubkey: 'b'.repeat(64),
			created_at: 2,
			tags: [],
			content: {
				quoteRequestId: 'qr_valid123',
				serviceAddress,
				serviceId: serviceAddress
			}
		};
		const proposal = {
			id: 'proposal-event-id',
			pubkey: 'a'.repeat(64),
			created_at: 3,
			tags: [['e', 'request-event-id']],
			content: {
				proposalId: 'pr_valid123',
				expirationTimestamp: 1000
			}
		};

		queryNostrEvents
			.mockResolvedValueOnce([request])
			.mockResolvedValueOnce([proposal])
			.mockResolvedValueOnce([]);

		const threads = await queryTaskeeServiceQuoteThreads({
			taskeePubkey: 'a'.repeat(64),
			serviceAddress,
			quoteRequestId: 'qr_valid123',
			limit: 10
		});

		expect(threads).toHaveLength(1);
		expect(queryNostrEvents).toHaveBeenCalledWith(
			expect.objectContaining({
				kinds: [6420],
				'#a': [serviceAddress],
				'#p': ['a'.repeat(64)],
				limit: 10
			}),
			undefined,
			undefined,
			expect.any(Array)
		);

		await expect(queryServiceProposalsByRequestIds([], 10)).resolves.toEqual([]);
	});
});
