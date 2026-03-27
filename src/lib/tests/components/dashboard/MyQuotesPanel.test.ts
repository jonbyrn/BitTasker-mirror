import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, waitFor, within } from '@testing-library/svelte';
import MyQuotesPanel from '$lib/components/dashboard/quotes/MyQuotesPanel.svelte';
import type { ServiceQuoteTimelineEntry } from '$lib/types/service-quote';
import { ServicePricingTypeEnum } from '$lib/utils/enums/service.enum';

const {
	applyTaskerStatus,
	acceptTaskerProposal,
	deleteTaskerRequest,
	goto,
	findServiceByUniqueId,
	quoteUiStoreMock
} = vi.hoisted(() => ({
	applyTaskerStatus: vi.fn().mockResolvedValue({ success: true }),
	acceptTaskerProposal: vi
		.fn()
		.mockResolvedValue({ success: true, transactionHash: '0xservicehash' }),
	deleteTaskerRequest: vi.fn().mockResolvedValue({ success: true }),
	goto: vi.fn(),
	findServiceByUniqueId: vi.fn().mockResolvedValue({
		id: 'service-event-1',
		uniqueId: 'service-unique-id',
		title: 'Managed Migration Service'
	}),
	quoteUiStoreMock: {
		value: {
			taskerDataFreshness: 'fresh'
		},
		subscribers: new Set<(value: { taskerDataFreshness: 'fresh' | 'stale' | 'partial' }) => void>(),
		subscribe(run: (value: { taskerDataFreshness: 'fresh' | 'stale' | 'partial' }) => void) {
			run(this.value);
			this.subscribers.add(run);
			return () => this.subscribers.delete(run);
		},
		set(next: { taskerDataFreshness: 'fresh' | 'stale' | 'partial' }) {
			this.value = next;
			this.subscribers.forEach((run) => run(this.value));
		}
	}
}));

vi.mock('$app/navigation', () => ({
	goto
}));

vi.mock('svelte-i18n', async () => {
	const { readable } = await import('svelte/store');
	return {
		t: readable((key: string) => key),
		locale: readable('en')
	};
});

vi.mock('$lib/nostr/service', () => ({
	findServiceByUniqueId
}));

vi.mock('$lib/stores/service-quote-ui.store', () => ({
	getTaskerDataFreshness: (state: { taskerDataFreshness: 'fresh' | 'stale' | 'partial' }) =>
		state.taskerDataFreshness,
	serviceQuoteUiStore: {
		subscribe: (run: (value: { taskerDataFreshness: 'fresh' | 'stale' | 'partial' }) => void) =>
			quoteUiStoreMock.subscribe(run),
		applyTaskerStatus,
		deleteTaskerRequest,
		acceptTaskerProposal
	}
}));

vi.mock('$lib/components/user/UserInfoDisplay.svelte', () => ({
	default: () => ({
		$$render: () => '<div data-testid="quote-card-user">User info</div>'
	})
}));

vi.mock('$lib/components/service/ServiceTab.svelte', () => ({
	default: () => ({
		$$render: (_result: unknown, props: { service?: { title?: string } | null }) =>
			`<div data-testid="service-tab-mock">${props.service?.title ?? 'No service'}</div>`
	})
}));

const serviceAddress = `30402:${'d'.repeat(64)}:service-unique-id`;

const timeline: ServiceQuoteTimelineEntry = {
	request: {
		id: 'request-event-1',
		kind: 6420,
		pubkey: 'e'.repeat(64),
		created_at: 1,
		tags: [],
		content: {
			type: 'service-quote-request',
			quoteRequestId: 'qr_valid123',
			serviceId: serviceAddress,
			serviceAddress,
			pricingType: ServicePricingTypeEnum.INQUIRY_REQUIRED,
			inquiry: {
				title: 'Need a migration',
				description: 'Move our docs and preserve redirects.'
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
			pubkey: 'f'.repeat(64),
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
		pubkey: 'f'.repeat(64),
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
			timestamp: 2,
			version: 'v1'
		},
		sig: ''
	},
	resolvedStatus: 'pending',
	resolvedTerminalEvent: undefined,
	expirationTimestamp: 1_700_300_000,
	isExpired: false,
	linkedEscrowId: undefined
};

function createTimeline(
	overrides: Partial<ServiceQuoteTimelineEntry> & {
		title?: string;
		description?: string;
		requestId?: string;
		resolvedStatus?: ServiceQuoteTimelineEntry['resolvedStatus'];
		hasProposal?: boolean;
		linkedEscrowId?: string;
	} = {}
): ServiceQuoteTimelineEntry {
	const requestId = overrides.requestId ?? `qr_${Math.random().toString(36).slice(2, 10)}`;
	const title = overrides.title ?? 'Request';
	const description = overrides.description ?? 'Description';
	const hasProposal = overrides.hasProposal ?? true;
	const proposalId = `pr_${requestId}`;

	return {
		...timeline,
		request: {
			...timeline.request,
			id: `${requestId}_event`,
			content: {
				...timeline.request.content,
				quoteRequestId: requestId,
				inquiry: {
					...timeline.request.content.inquiry,
					title,
					description
				}
			}
		},
		proposals: hasProposal
			? [
					{
						...timeline.proposals[0],
						id: `${proposalId}_event`,
						content: {
							...timeline.proposals[0].content,
							proposalId,
							quoteRequestId: requestId
						}
					}
				]
			: [],
		latestProposal: hasProposal
			? {
					...timeline.latestProposal!,
					id: `${proposalId}_event`,
					content: {
						...timeline.latestProposal!.content,
						proposalId,
						quoteRequestId: requestId
					}
				}
			: undefined,
		resolvedStatus: overrides.resolvedStatus ?? 'pending',
		linkedEscrowId: overrides.linkedEscrowId,
		...overrides
	};
}

describe('MyQuotesPanel', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		findServiceByUniqueId.mockResolvedValue({
			id: 'service-event-1',
			uniqueId: 'service-unique-id',
			title: 'Managed Migration Service'
		});
		quoteUiStoreMock.set({ taskerDataFreshness: 'fresh' });
		window.history.replaceState({}, '', '/dashboard?tab=quotes&view=tasker');
	});

	it('renders quote cards in a grid layout', () => {
		const { container, getByText, queryByText } = render(MyQuotesPanel, {
			timelines: [timeline],
			focusedRequestId: 'qr_valid123',
			isSyncing: false
		});

		const title = getByText('Need a migration');
		expect(title).toBeTruthy();
		expect(title.tagName).toBe('SPAN');
		expect(title.className).toContain('card-title');
		expect(title.className).toContain('text-lg');
		expect(title.className).toContain('font-semibold');
		expect(getByText('Move our docs and preserve redirects.')).toBeTruthy();
		expect(getByText(/1970/)).toBeTruthy();
		expect(getByText(/Estimated duration: 3 days/)).toBeTruthy();
		expect(getByText('Pending')).toBeTruthy();
		expect(queryByText(/Requested:/)).toBeNull();
		expect(queryByText(/Request ID:/)).toBeNull();
		expect(queryByText(/Service:/)).toBeNull();
		expect(container.querySelector('.grid')).toBeTruthy();
	});

	it('renders action buttons on each quote card', async () => {
		const { getByText } = render(MyQuotesPanel, {
			timelines: [timeline],
			focusedRequestId: 'qr_valid123',
			isSyncing: false
		});

		// Cards should have View, Accept, Decline, and Delete buttons
		expect(getByText('View')).toBeTruthy();
		expect(getByText('Accept')).toBeTruthy();
		expect(getByText('Decline')).toBeTruthy();
		expect(getByText('Delete')).toBeTruthy();
	});

	it('renders a task-style request status filter card and refresh control', async () => {
		const onRetry = vi.fn().mockResolvedValue(undefined);
		const { getByText, getAllByText, getByRole } = render(MyQuotesPanel, {
			timelines: [timeline],
			focusedRequestId: 'qr_valid123',
			isSyncing: false,
			onRetry
		});

		expect(getByText('Filter by request status')).toBeTruthy();
		expect(getAllByText('Filter the requests you sent to services you want to hire.').length).toBe(
			2
		);

		await fireEvent.click(getByRole('button', { name: 'Refresh' }));
		expect(onRetry).toHaveBeenCalledTimes(1);
	});

	it('filters service requests across every supported status bucket', async () => {
		const timelines = [
			createTimeline({
				requestId: 'qr_awaiting',
				title: 'Awaiting request',
				hasProposal: false,
				resolvedStatus: 'pending'
			}),
			createTimeline({
				requestId: 'qr_contract',
				title: 'Contract request',
				hasProposal: true,
				resolvedStatus: 'accepted',
				linkedEscrowId: 'escrow_456'
			}),
			createTimeline({
				requestId: 'qr_declined',
				title: 'Declined request',
				hasProposal: true,
				resolvedStatus: 'declined'
			}),
			createTimeline({
				requestId: 'qr_withdrawn',
				title: 'Withdrawn request',
				hasProposal: true,
				resolvedStatus: 'withdrawn'
			}),
			createTimeline({
				requestId: 'qr_expired',
				title: 'Expired request',
				hasProposal: true,
				resolvedStatus: 'expired'
			}),
			createTimeline({
				requestId: 'qr_failed',
				title: 'Failed request',
				hasProposal: true,
				resolvedStatus: 'accept_failed'
			}),
			createTimeline({
				requestId: 'qr_unknown',
				title: 'Unknown request',
				hasProposal: true,
				resolvedStatus: 'accept_unknown'
			})
		];

		const { getByRole, queryByText } = render(MyQuotesPanel, {
			timelines,
			focusedRequestId: 'qr_awaiting',
			isSyncing: false
		});

		expect(queryByText('Awaiting request')).toBeTruthy();
		expect(queryByText('Failed request')).toBeTruthy();
		expect(queryByText('Unknown request')).toBeTruthy();
		expect(queryByText('Contract request')).toBeNull();

		const filterAssertions: Array<{ label: string; visible: string; hidden: string }> = [
			{ label: 'Contract created', visible: 'Contract request', hidden: 'Awaiting request' },
			{ label: 'Declined', visible: 'Declined request', hidden: 'Contract request' },
			{ label: 'Withdrawn', visible: 'Withdrawn request', hidden: 'Declined request' },
			{ label: 'Expired', visible: 'Expired request', hidden: 'Withdrawn request' }
		];

		for (const assertion of filterAssertions) {
			await fireEvent.click(getByRole('button', { name: assertion.label }));
			expect(queryByText(assertion.visible)).toBeTruthy();
			expect(queryByText(assertion.hidden)).toBeNull();
		}
	});

	it('shows a clear-filters empty state when the active request status has no results', async () => {
		const { getByRole, getByTestId, getByText, queryByText } = render(MyQuotesPanel, {
			timelines: [timeline],
			focusedRequestId: 'qr_valid123',
			isSyncing: false
		});

		await fireEvent.click(getByRole('button', { name: 'Declined' }));

		expect(getByTestId('my-quotes-filtered-empty-state')).toBeTruthy();
		expect(getByText('No service requests match this status yet.')).toBeTruthy();
		expect(getByRole('button', { name: 'Clear Filters' })).toBeTruthy();

		await fireEvent.click(getByRole('button', { name: 'Clear Filters' }));
		expect(queryByText('Need a migration')).toBeTruthy();
	});

	it('confirms and submits request deletion from the card actions', async () => {
		const { getByRole, getByText, queryByText } = render(MyQuotesPanel, {
			timelines: [timeline],
			focusedRequestId: 'qr_valid123',
			isSyncing: false
		});

		await fireEvent.click(getByRole('button', { name: 'Delete' }));

		expect(getByText('Delete service request')).toBeTruthy();
		expect(
			getByText('This will permanently remove this service request from your dashboard history.')
		).toBeTruthy();

		await fireEvent.click(getByRole('button', { name: 'Confirm Delete' }));

		expect(deleteTaskerRequest).toHaveBeenCalledWith({
			quoteRequestId: 'qr_valid123'
		});
		await waitFor(() => {
			expect(queryByText('Delete service request')).toBeNull();
		});
	});

	it('opens the primary view button in a local request drawer', async () => {
		const { getByRole, getByTestId, queryByText } = render(MyQuotesPanel, {
			timelines: [timeline],
			focusedRequestId: 'qr_valid123',
			isSyncing: false
		});

		await fireEvent.click(getByRole('button', { name: 'View' }));

		const drawer = getByTestId('service-request-drawer');
		const dialog = getByRole('dialog');
		expect(goto).not.toHaveBeenCalled();
		expect(drawer).toBeTruthy();
		expect(within(drawer).getByText(/Your request details/)).toBeTruthy();
		expect(within(drawer).getAllByText(/Need a migration/).length).toBeGreaterThan(0);
		await waitFor(() => {
			expect(findServiceByUniqueId).toHaveBeenCalledWith('service-unique-id');
			expect(within(dialog).getByText(/Managed Migration Service/)).toBeTruthy();
			expect(queryByText('Loading service details...')).toBeNull();
		});
	});

	it('renders a retry action when timeline loading fails', async () => {
		const onRetry = vi.fn();
		const { getByText } = render(MyQuotesPanel, {
			timelines: [],
			focusedRequestId: null,
			isSyncing: false,
			loadError: 'tasker query failed',
			onRetry
		});

		await fireEvent.click(getByText('Retry'));
		expect(onRetry).toHaveBeenCalledTimes(1);
		expect(getByText('Retry to load your service requests.')).toBeTruthy();
	});

	it('shows a stale-data warning', () => {
		quoteUiStoreMock.set({ taskerDataFreshness: 'stale' });

		const { getByTestId, getByText } = render(MyQuotesPanel, {
			timelines: [timeline],
			focusedRequestId: 'qr_valid123',
			isSyncing: false
		});

		expect(getByTestId('my-quotes-stale-alert')).toBeTruthy();
		expect(
			getByText(
				'Showing your last known quote data. Refresh before acting on proposals because the latest relay sync did not complete.'
			)
		).toBeTruthy();
	});

	it('shows a partial-sync warning while the latest thread is still propagating', () => {
		quoteUiStoreMock.set({ taskerDataFreshness: 'partial' });

		const { getByTestId } = render(MyQuotesPanel, {
			timelines: [timeline],
			focusedRequestId: 'qr_valid123',
			isSyncing: false
		});

		expect(getByTestId('my-quotes-partial-alert')).toBeTruthy();
	});

	it('renders a loading placeholder instead of the empty state before timelines load', () => {
		const { getByText, queryByText } = render(MyQuotesPanel, {
			timelines: [],
			focusedRequestId: null,
			isSyncing: true,
			hasLoaded: false
		});

		expect(getByText('Loading your service requests...')).toBeTruthy();
		expect(queryByText('No service requests have been submitted yet.')).toBeNull();
	});

	it('renders an empty state when no quote requests exist', () => {
		const { getByTestId, getByText, getByRole, queryByRole } = render(MyQuotesPanel, {
			timelines: [],
			focusedRequestId: null,
			isSyncing: false,
			hasLoaded: true
		});

		expect(getByTestId('my-quotes-empty-state')).toBeTruthy();
		expect(getByText('No service requests have been submitted yet.')).toBeTruthy();
		expect(getByRole('link', { name: 'Find Services' })).toHaveAttribute('href', '/services');
		expect(queryByRole('button', { name: 'Find Services' })).toBeNull();
	});

	it('hides the find services CTA when service requests are present', () => {
		const { queryByRole } = render(MyQuotesPanel, {
			timelines: [timeline],
			focusedRequestId: 'qr_valid123',
			isSyncing: false,
			hasLoaded: true
		});

		expect(queryByRole('link', { name: 'Find Services' })).toBeNull();
	});

	it('renders a waiting state when no provider proposal exists yet', () => {
		const pendingTimeline: ServiceQuoteTimelineEntry = {
			...timeline,
			proposals: [],
			latestProposal: undefined
		};

		const { getAllByText } = render(MyQuotesPanel, {
			timelines: [pendingTimeline],
			focusedRequestId: 'qr_valid123',
			isSyncing: false
		});

		expect(getAllByText('Awaiting proposal').length).toBeGreaterThan(0);
	});

	it('does not render the standalone syncing alert while data is syncing', () => {
		const { queryByText } = render(MyQuotesPanel, {
			timelines: [timeline],
			focusedRequestId: 'qr_valid123',
			isSyncing: true,
			hasLoaded: true
		});

		expect(queryByText('Syncing your latest quote request…')).toBeNull();
	});

	it('shows a partial-data alert while the exact tasker thread is still syncing', () => {
		const { getByTestId } = render(MyQuotesPanel, {
			timelines: [],
			focusedRequestId: 'qr_valid123',
			isSyncing: true,
			hasLoaded: true
		});

		expect(getByTestId('my-quotes-partial-alert')).toBeTruthy();
	});

	it('renders view contract button for accepted quotes', () => {
		const acceptedTimeline: ServiceQuoteTimelineEntry = {
			...timeline,
			resolvedStatus: 'accepted',
			linkedEscrowId: 'escrow_123'
		};

		const { queryByText } = render(MyQuotesPanel, {
			timelines: [acceptedTimeline],
			focusedRequestId: 'qr_valid123',
			isSyncing: false
		});

		// For accepted quotes with escrow, should not have Accept button
		expect(queryByText('Accept')).toBeNull();
		// But should have View Contract button
		expect(queryByText('View Contract')).toBeTruthy();
	});

	it('keeps deleted-service requests visible as read-only history', async () => {
		findServiceByUniqueId.mockResolvedValue(null);

		const { getByTestId, queryByText } = render(MyQuotesPanel, {
			timelines: [timeline],
			focusedRequestId: 'qr_valid123',
			isSyncing: false
		});

		await waitFor(() => {
			expect(findServiceByUniqueId).toHaveBeenCalled();
			expect(getByTestId('my-quotes-unavailable-alert')).toBeTruthy();
			expect(queryByText('Accept')).toBeNull();
			expect(queryByText('Decline')).toBeNull();
			expect(queryByText(/Service:/)).toBeNull();
		});
	});
});
