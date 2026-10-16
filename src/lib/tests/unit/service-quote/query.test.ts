import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const queryNostrEvents = vi.fn();
const getPublishedRelaySet = vi.fn();
const validateServiceQuoteRequestEvent = vi.fn();
const validateServiceProposalStatusEvent = vi.fn();
const validateServiceProposalEvent = vi.fn();
const resolveServiceQuoteThreads = vi.fn();
let queryModule: typeof import('$lib/utils/service-quote/query');

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
	beforeAll(async () => {
		queryModule = await import('$lib/utils/service-quote/query');
	}, 60_000);

	beforeEach(() => {
		vi.resetAllMocks();
		queryNostrEvents.mockResolvedValue([]);
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
				proposals: proposals.map((proposal: { content?: { expirationTimestamp?: number } }) => ({
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
		queryNostrEvents.mockResolvedValueOnce([]);

		const result = await queryModule.queryServiceQuoteRequestsForService(
			serviceAddress,
			taskeePubkey,
			25
		);

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

	it('filters quote requests that have been deleted with NIP-09 events', async () => {
		const taskerPubkey = 'b'.repeat(64);
		const keepEvent = {
			id: 'request-keep',
			pubkey: taskerPubkey,
			created_at: 2,
			tags: [],
			content: {}
		};
		const deletedEvent = {
			id: 'request-deleted',
			pubkey: taskerPubkey,
			created_at: 3,
			tags: [],
			content: {}
		};

		queryNostrEvents.mockResolvedValueOnce([keepEvent, deletedEvent]).mockResolvedValueOnce([
			{
				id: 'delete-event-1',
				created_at: 4,
				tags: [['e', 'request-deleted']],
				content: 'deleted'
			}
		]);

		const result = await queryModule.queryServiceQuoteRequestsByAuthor(taskerPubkey, 25);

		expect(queryNostrEvents).toHaveBeenNthCalledWith(
			2,
			expect.objectContaining({
				kinds: [5],
				authors: [taskerPubkey],
				'#e': expect.arrayContaining(['request-keep', 'request-deleted']),
				limit: 100
			}),
			undefined,
			undefined,
			expect.any(Array)
		);
		expect(result).toEqual([keepEvent]);
	});

	it('marks tasker query results as partial when delete lookups hit their relay cap', async () => {
		const taskerPubkey = 'b'.repeat(64);
		const requests = Array.from({ length: 2 }, (_, index) => ({
			id: `request-${index}`,
			pubkey: taskerPubkey,
			created_at: index + 1,
			tags: [],
			content: {
				quoteRequestId: `qr_valid_${index}`,
				serviceAddress: 'service-address',
				serviceId: 'service-address'
			}
		}));
		const deleteEvents = Array.from({ length: 100 }, (_, index) => ({
			id: `delete-${index}`,
			created_at: index + 10,
			tags: [['e', requests[index % requests.length].id]],
			content: 'deleted'
		}));

		queryNostrEvents
			.mockResolvedValueOnce(requests)
			.mockResolvedValueOnce(deleteEvents)
			.mockResolvedValueOnce([])
			.mockResolvedValueOnce([]);

		const result = await queryModule.queryServiceQuotesForTasker(taskerPubkey, 25);

		expect(result.isPartial).toBe(true);
	});

	it('queries proposal statuses with proposal ids, author filters, and published relay hints', async () => {
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

		const result = await queryModule.queryStatusesForProposals(
			[proposal as never],
			['a'.repeat(64)]
		);

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

	it('filters proposals that have been deleted with NIP-09 events', async () => {
		const keepProposal = {
			id: 'proposal-keep',
			pubkey: 'a'.repeat(64),
			created_at: 5,
			tags: [['e', 'request-event-id']],
			content: {
				proposalId: 'pr_keep123',
				expirationTimestamp: 1000
			}
		};
		const deletedProposal = {
			id: 'proposal-deleted',
			pubkey: 'a'.repeat(64),
			created_at: 6,
			tags: [['e', 'request-event-id']],
			content: {
				proposalId: 'pr_delete123',
				expirationTimestamp: 1000
			}
		};

		queryNostrEvents.mockResolvedValueOnce([keepProposal, deletedProposal]).mockResolvedValueOnce([
			{
				id: 'delete-proposal-event',
				created_at: 7,
				tags: [['e', 'proposal-deleted']],
				content: 'deleted'
			}
		]);

		const result = await queryModule.queryServiceProposalsByRequestIds(['request-event-id'], 25);

		expect(queryNostrEvents).toHaveBeenNthCalledWith(
			2,
			expect.objectContaining({
				kinds: [5],
				authors: ['a'.repeat(64)],
				'#e': expect.arrayContaining(['proposal-keep', 'proposal-deleted'])
			}),
			undefined,
			undefined,
			expect.any(Array)
		);
		expect(result).toEqual([keepProposal]);
	});

	it('builds tasker timelines and quote query results from canonical request filters', async () => {
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
			.mockResolvedValueOnce([])
			.mockResolvedValueOnce([proposal])
			.mockResolvedValueOnce([])
			.mockResolvedValueOnce([status])
			.mockResolvedValueOnce([request])
			.mockResolvedValueOnce([])
			.mockResolvedValueOnce([proposal])
			.mockResolvedValueOnce([])
			.mockResolvedValueOnce([status])
			.mockResolvedValueOnce([request])
			.mockResolvedValueOnce([])
			.mockResolvedValueOnce([proposal])
			.mockResolvedValueOnce([])
			.mockResolvedValueOnce([status]);

		const threads = await queryModule.queryTaskerServiceQuoteThreads({
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

		const queryResult = await queryModule.queryServiceQuotesForTasker('b'.repeat(64), 25);
		expect(queryResult.requests).toEqual([request]);
		expect(queryResult.proposals).toEqual([proposal]);
		expect(queryResult.statusEvents).toEqual([status]);
		expect(queryResult.timelines).toHaveLength(1);

		const timelineResult = await queryModule.findServiceQuoteTimelineByRequestId(
			'qr_valid123',
			'b'.repeat(64)
		);
		expect(timelineResult.requests).toEqual([request]);
	});

	it('builds taskee timelines and short-circuits proposal/status queries for empty request sets', async () => {
		const serviceAddress = `30402:${'a'.repeat(64)}:service-1234`;
		const quoteRequestId = 'qr_valid123';
		const requestDTag = `sqr:sa=${encodeURIComponent(serviceAddress)}:qr=${quoteRequestId}`;
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
			.mockResolvedValueOnce([])
			.mockResolvedValueOnce([proposal])
			.mockResolvedValueOnce([])
			.mockResolvedValueOnce([]);

		const threads = await queryModule.queryTaskeeServiceQuoteThreads({
			taskeePubkey: 'a'.repeat(64),
			serviceAddress,
			quoteRequestId,
			limit: 10
		});

		expect(threads).toHaveLength(1);
		expect(queryNostrEvents).toHaveBeenCalledWith(
			expect.objectContaining({
				kinds: [6420],
				'#a': [serviceAddress],
				'#p': ['a'.repeat(64)],
				'#d': [requestDTag],
				limit: 10
			}),
			undefined,
			undefined,
			expect.any(Array)
		);

		queryNostrEvents
			.mockResolvedValueOnce([request])
			.mockResolvedValueOnce([])
			.mockResolvedValueOnce([proposal])
			.mockResolvedValueOnce([])
			.mockResolvedValueOnce([]);

		const queryResult = await queryModule.queryServiceQuotesForTaskee(
			serviceAddress,
			'a'.repeat(64),
			10,
			quoteRequestId
		);

		expect(queryResult.requests).toEqual([request]);

		await expect(queryModule.queryServiceProposalsByRequestIds([], 10)).resolves.toEqual([]);
	});

	it('marks quote query results as partial when relay reads hit truncation limits', async () => {
		const serviceAddress = `30402:${'a'.repeat(64)}:service-1234`;
		const requestEvents = Array.from({ length: 100 }, (_, index) => ({
			id: `request-${index}`,
			pubkey: 'b'.repeat(64),
			created_at: index + 1,
			tags: [],
			content: {
				quoteRequestId: `qr_valid_${index}`,
				serviceAddress,
				serviceId: serviceAddress
			}
		}));
		const proposalEvents = Array.from({ length: 100 }, (_, index) => ({
			id: `proposal-${index}`,
			pubkey: 'a'.repeat(64),
			created_at: index + 1,
			tags: [['e', `request-${index}`]],
			content: {
				proposalId: `pr_valid_${index}`,
				expirationTimestamp: 1_000 + index
			}
		}));
		const statusEvents = Array.from({ length: 500 }, (_, index) => ({
			id: `status-${index}`,
			created_at: index + 1,
			tags: [['e', `proposal-${index % 100}`]],
			content: {
				proposalId: `pr_valid_${index % 100}`
			}
		}));

		queryNostrEvents
			.mockResolvedValueOnce(requestEvents)
			.mockResolvedValueOnce([])
			.mockResolvedValueOnce(proposalEvents)
			.mockResolvedValueOnce([])
			.mockResolvedValueOnce(statusEvents);

		const result = await queryModule.queryServiceQuotesForTaskee(
			serviceAddress,
			'a'.repeat(64),
			100
		);

		expect(result.isPartial).toBe(true);
	});
});
