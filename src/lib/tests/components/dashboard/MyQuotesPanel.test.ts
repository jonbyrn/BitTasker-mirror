import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import MyQuotesPanel from '$lib/components/dashboard/quotes/MyQuotesPanel.svelte';
import type { ServiceQuoteTimelineEntry } from '$lib/types/service-quote';
import { ServicePricingTypeEnum } from '$lib/utils/enums/service.enum';

const { applyTaskerStatus, acceptTaskerProposal, goto, quoteUiStoreMock } = vi.hoisted(() => ({
	applyTaskerStatus: vi.fn().mockResolvedValue({ success: true }),
	acceptTaskerProposal: vi
		.fn()
		.mockResolvedValue({ success: true, transactionHash: '0xservicehash' }),
	goto: vi.fn(),
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

vi.mock('$lib/stores/service-quote-ui.store', () => ({
	getTaskerDataFreshness: (state: { taskerDataFreshness: 'fresh' | 'stale' | 'partial' }) =>
		state.taskerDataFreshness,
	serviceQuoteUiStore: {
		subscribe: (run: (value: { taskerDataFreshness: 'fresh' | 'stale' | 'partial' }) => void) =>
			quoteUiStoreMock.subscribe(run),
		applyTaskerStatus,
		acceptTaskerProposal
	}
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

describe('MyQuotesPanel', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		quoteUiStoreMock.set({ taskerDataFreshness: 'fresh' });
		window.history.replaceState({}, '', '/dashboard?tab=quotes&view=tasker');
	});

	it('renders quote cards in a grid layout', () => {
		const { container, getByText } = render(MyQuotesPanel, {
			timelines: [timeline],
			focusedRequestId: 'qr_valid123',
			isSyncing: false
		});

		expect(getByText('Need a migration')).toBeTruthy();
		expect(getByText('Move our docs and preserve redirects.')).toBeTruthy();
		expect(container.querySelector('.grid')).toBeTruthy();
	});

	it('renders action buttons on each quote card', async () => {
		const { getByText } = render(MyQuotesPanel, {
			timelines: [timeline],
			focusedRequestId: 'qr_valid123',
			isSyncing: false
		});

		// Cards should have View, Accept, and Decline buttons
		expect(getByText('View')).toBeTruthy();
		expect(getByText('Accept')).toBeTruthy();
		expect(getByText('Decline')).toBeTruthy();
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
		const { getByText, getByRole, queryByRole } = render(MyQuotesPanel, {
			timelines: [],
			focusedRequestId: null,
			isSyncing: false,
			hasLoaded: true
		});

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

		const { getByText } = render(MyQuotesPanel, {
			timelines: [pendingTimeline],
			focusedRequestId: 'qr_valid123',
			isSyncing: false
		});

		expect(getByText('Awaiting proposal')).toBeTruthy();
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
});
