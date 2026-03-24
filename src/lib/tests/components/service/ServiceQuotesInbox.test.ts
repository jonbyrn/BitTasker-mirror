import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import ServiceQuotesInbox from '$lib/components/service/quotes/ServiceQuotesInbox.svelte';
import type { Service } from '$lib/types/service.d';
import type { ServiceQuoteTimelineEntry } from '$lib/types/service-quote';
import { ServicePricingTypeEnum } from '$lib/utils/enums/service.enum';

const { goto, quoteUiStoreMock } = vi.hoisted(() => ({
	goto: vi.fn(),
	quoteUiStoreMock: {
		value: {
			providerDataFreshnessByService: {}
		} as {
			providerDataFreshnessByService: Record<string, 'fresh' | 'stale' | 'partial'>;
		},
		subscribers: new Set<
			(value: {
				providerDataFreshnessByService: Record<string, 'fresh' | 'stale' | 'partial'>;
			}) => void
		>(),
		subscribe(
			run: (value: {
				providerDataFreshnessByService: Record<string, 'fresh' | 'stale' | 'partial'>;
			}) => void
		) {
			run(this.value);
			this.subscribers.add(run);
			return () => this.subscribers.delete(run);
		},
		set(next: { providerDataFreshnessByService: Record<string, 'fresh' | 'stale' | 'partial'> }) {
			this.value = next;
			this.subscribers.forEach((run) => run(this.value));
		}
	}
}));

vi.mock('$app/navigation', () => ({
	goto
}));

vi.mock('$lib/stores/service-quote-ui.store', () => ({
	getProviderDataFreshness: (
		state: {
			providerDataFreshnessByService: Record<string, 'fresh' | 'stale' | 'partial'>;
		},
		serviceAddress: string | null | undefined
	) =>
		serviceAddress ? (state.providerDataFreshnessByService[serviceAddress] ?? 'fresh') : 'fresh',
	serviceQuoteUiStore: {
		subscribe: (
			run: (value: {
				providerDataFreshnessByService: Record<string, 'fresh' | 'stale' | 'partial'>;
			}) => void
		) => quoteUiStoreMock.subscribe(run)
	}
}));

const mockService: Service = {
	id: 'service-event-1',
	npub: 'b'.repeat(64),
	uniqueId: 'service-unique-id',
	status: 'active',
	title: 'SEO Audit',
	description: 'Full technical review.',
	serviceLocationTypes: [],
	pricing: {
		type: ServicePricingTypeEnum.INQUIRY_REQUIRED,
		currency: 'USD'
	},
	skills: [],
	categories: [],
	createdAt: 1
};

const baseTimeline: ServiceQuoteTimelineEntry = {
	request: {
		id: 'request-event-1',
		kind: 6420,
		pubkey: 'c'.repeat(64),
		created_at: 1,
		tags: [],
		content: {
			type: 'service-quote-request',
			quoteRequestId: 'qr_valid123',
			serviceId: `30402:${'b'.repeat(64)}:service-unique-id`,
			serviceAddress: `30402:${'b'.repeat(64)}:service-unique-id`,
			pricingType: ServicePricingTypeEnum.INQUIRY_REQUIRED,
			tierId: 'premium',
			selectedAddOns: ['rush-audit'],
			inquiry: {
				title: 'Need a site audit',
				description: 'Please review search visibility and technical issues.',
				customFormResponses: {
					websiteSize: '250 pages'
				}
			},
			timestamp: 1,
			version: 'v1'
		},
		sig: ''
	},
	proposals: [],
	statusEventsByProposalId: {},
	latestProposal: undefined,
	resolvedStatus: 'pending',
	resolvedTerminalEvent: undefined,
	expirationTimestamp: undefined,
	isExpired: false,
	linkedEscrowId: undefined
};

describe('ServiceQuotesInbox', () => {
	function setNavigatorOnline(online: boolean) {
		Object.defineProperty(window.navigator, 'onLine', {
			value: online,
			configurable: true
		});
	}

	beforeEach(() => {
		vi.clearAllMocks();
		quoteUiStoreMock.set({ providerDataFreshnessByService: {} });
		setNavigatorOnline(true);
		window.history.replaceState({}, '', '/dashboard?tab=my-services&view=quotes');
	});

	it('clears invalid exact-focus requests after syncing completes', async () => {
		const onInvalidFocusedRequest = vi.fn();

		render(ServiceQuotesInbox, {
			service: mockService,
			timelines: [baseTimeline],
			focusedRequestId: 'qr_missing99',
			isSyncing: false,
			walletReady: false,
			feeTierReady: false,
			onInvalidFocusedRequest
		});

		await waitFor(() => expect(onInvalidFocusedRequest).toHaveBeenCalledTimes(1));
	});

	it('does not clear focused requests before the initial provider load completes', async () => {
		const onInvalidFocusedRequest = vi.fn();

		render(ServiceQuotesInbox, {
			service: mockService,
			timelines: [baseTimeline],
			focusedRequestId: 'qr_missing99',
			isSyncing: false,
			hasLoaded: false,
			walletReady: false,
			feeTierReady: false,
			onInvalidFocusedRequest
		});

		await Promise.resolve();
		expect(onInvalidFocusedRequest).not.toHaveBeenCalled();
	});

	it('emits focus changes for selected request threads', async () => {
		const onRequestFocusChange = vi.fn();
		const { getAllByRole } = render(ServiceQuotesInbox, {
			service: mockService,
			timelines: [baseTimeline],
			focusedRequestId: null,
			isSyncing: false,
			walletReady: false,
			feeTierReady: false,
			onRequestFocusChange
		});

		await fireEvent.click(getAllByRole('button')[0]);
		expect(onRequestFocusChange).toHaveBeenCalledWith('qr_valid123');
	});

	it('forwards proposal submissions through the selected request context', async () => {
		const onSendProposal = vi.fn().mockResolvedValue({ success: true });
		const { getByLabelText, getByRole } = render(ServiceQuotesInbox, {
			service: mockService,
			timelines: [baseTimeline],
			focusedRequestId: 'qr_valid123',
			isSyncing: false,
			walletReady: true,
			feeTierReady: true,
			onSendProposal
		});

		await fireEvent.input(getByLabelText('Scope'), {
			target: { value: 'Technical SEO audit with prioritized fixes.' }
		});
		await fireEvent.input(getByLabelText('Amount (USDT)'), {
			target: { value: '225.00' }
		});
		await fireEvent.input(getByLabelText('Estimated Duration'), {
			target: { value: '4 business days' }
		});
		await fireEvent.input(getByLabelText('Estimated Start'), {
			target: { value: '2026-03-20T09:00' }
		});
		await fireEvent.input(getByLabelText('Estimated End'), {
			target: { value: '2026-03-24T18:00' }
		});
		await fireEvent.input(getByLabelText('Expiration Days'), {
			target: { value: '5' }
		});
		await fireEvent.input(getByLabelText('Expiration Hours'), {
			target: { value: '6' }
		});
		await fireEvent.input(getByLabelText('Cover Letter'), {
			target: { value: 'I can start this week.' }
		});

		await fireEvent.click(getByRole('button', { name: 'Send Proposal' }));

		await waitFor(() =>
			expect(onSendProposal).toHaveBeenCalledWith('qr_valid123', {
				description: 'Technical SEO audit with prioritized fixes.',
				amountUsdt: '225.00',
				estimatedDuration: '4 business days',
				estimatedStartTime: Math.floor(new Date('2026-03-20T09:00').getTime() / 1000),
				estimatedEndTime: Math.floor(new Date('2026-03-24T18:00').getTime() / 1000),
				expirationDays: 5,
				expirationHours: 6,
				coverLetter: 'I can start this week.'
			})
		);
	});

	it('routes converted threads to the linked service contract and hides the proposal composer', async () => {
		const { getByRole, getByText, queryByRole } = render(ServiceQuotesInbox, {
			service: mockService,
			timelines: [
				{
					...baseTimeline,
					resolvedStatus: 'accepted',
					linkedEscrowId: 'escrow_987'
				}
			],
			focusedRequestId: 'qr_valid123',
			isSyncing: false,
			walletReady: true,
			feeTierReady: true
		});

		expect(
			getByText('This quote request has already been converted into an active service contract.')
		).toBeTruthy();
		expect(queryByRole('button', { name: 'Send Proposal' })).toBeNull();

		await fireEvent.click(getByRole('button', { name: 'View Contract' }));

		expect(goto).toHaveBeenCalledWith(
			'/dashboard?tab=contracts&context=services&highlight=escrow_987'
		);
	});

	it('upgrades provider continuity from accept_unknown back to the linked service contract view', async () => {
		const { getByRole, queryByRole, rerender } = render(ServiceQuotesInbox, {
			service: mockService,
			timelines: [
				{
					...baseTimeline,
					resolvedStatus: 'accept_unknown'
				}
			],
			focusedRequestId: 'qr_valid123',
			isSyncing: false,
			walletReady: true,
			feeTierReady: true
		});

		expect(getByRole('button', { name: 'Send Proposal' })).toBeTruthy();
		expect(queryByRole('button', { name: 'View Contract' })).toBeNull();

		await rerender({
			service: mockService,
			timelines: [
				{
					...baseTimeline,
					resolvedStatus: 'accepted',
					linkedEscrowId: 'escrow_recovered'
				}
			],
			focusedRequestId: 'qr_valid123',
			isSyncing: false,
			walletReady: true,
			feeTierReady: true
		});

		expect(queryByRole('button', { name: 'Send Proposal' })).toBeNull();
		expect(getByRole('button', { name: 'View Contract' })).toBeTruthy();
	});

	it('keeps expired quote requests visible as read-only rows and hides the proposal composer', () => {
		const { getByText, queryByRole } = render(ServiceQuotesInbox, {
			service: mockService,
			timelines: [
				{
					...baseTimeline,
					resolvedStatus: 'expired',
					isExpired: true
				}
			],
			focusedRequestId: 'qr_valid123',
			isSyncing: false,
			walletReady: true,
			feeTierReady: true
		});

		expect(getByText('Request expired')).toBeTruthy();
		expect(
			getByText(
				'This quote request is now read-only. Wait for the buyer to send a new request before replying again.'
			)
		).toBeTruthy();
		expect(queryByRole('button', { name: 'Send Proposal' })).toBeNull();
	});

	it('keeps deleted-service requests visible as read-only rows and hides the proposal composer', () => {
		const { getByTestId, getByText, queryByRole } = render(ServiceQuotesInbox, {
			service: null,
			serviceUnavailable: true,
			timelines: [baseTimeline],
			focusedRequestId: 'qr_valid123',
			isSyncing: false,
			walletReady: true,
			feeTierReady: true
		});

		expect(getByTestId('service-quotes-unavailable-alert')).toBeTruthy();
		expect(
			getByText(
				'This service was deleted by the provider. Keep this request for reference, but no new proposals can be sent.'
			)
		).toBeTruthy();
		expect(queryByRole('button', { name: 'Send Proposal' })).toBeNull();
	});

	it('renders retry UI and disables the composer when provider timeline loading fails', async () => {
		const onRetry = vi.fn();
		const { getByRole, getByText } = render(ServiceQuotesInbox, {
			service: mockService,
			timelines: [baseTimeline],
			focusedRequestId: 'qr_valid123',
			isSyncing: false,
			loadError: 'provider query failed',
			walletReady: true,
			feeTierReady: true,
			onRetry
		});

		expect(getByRole('button', { name: 'Send Proposal' })).toBeDisabled();
		await fireEvent.click(getByRole('button', { name: 'Retry' }));
		expect(onRetry).toHaveBeenCalledTimes(1);
		expect(getByText('provider query failed')).toBeTruthy();
	});

	it('shows the shared empty state and create-service CTA when no quote requests exist', () => {
		const { getByTestId, getByRole, getByText, queryByText } = render(ServiceQuotesInbox, {
			service: mockService,
			timelines: [],
			focusedRequestId: null,
			isSyncing: false,
			hasLoaded: true,
			walletReady: false,
			feeTierReady: false
		});

		expect(getByTestId('service-quotes-empty-state')).toBeTruthy();
		expect(getByText('No service requests yet.')).toBeTruthy();
		expect(queryByText('Quote Inbox')).toBeNull();
		expect(queryByText('Select a service to review incoming requests.')).toBeNull();
		expect(getByRole('link', { name: 'Create Service' })).toHaveAttribute(
			'href',
			'/dashboard/create-service'
		);
	});

	it('keeps stale provider data blocked in-context while cached provider data is stale', () => {
		quoteUiStoreMock.set({
			providerDataFreshnessByService: {
				[baseTimeline.request.content.serviceAddress]: 'stale'
			}
		});

		const { getByText, getByRole, queryByTestId } = render(ServiceQuotesInbox, {
			service: mockService,
			timelines: [baseTimeline],
			focusedRequestId: 'qr_valid123',
			isSyncing: false,
			walletReady: true,
			feeTierReady: true
		});

		expect(queryByTestId('service-quotes-stale-alert')).toBeNull();
		expect(getByText('Showing stale quote data. Refresh before sending a proposal.')).toBeTruthy();
		expect(getByRole('button', { name: 'Send Proposal' })).toBeDisabled();
	});

	it('keeps partial-sync blocking in-context while thread data is incomplete', () => {
		quoteUiStoreMock.set({
			providerDataFreshnessByService: {
				[baseTimeline.request.content.serviceAddress]: 'partial'
			}
		});

		const { getByText, getByRole, queryByTestId } = render(ServiceQuotesInbox, {
			service: mockService,
			timelines: [baseTimeline],
			focusedRequestId: 'qr_valid123',
			isSyncing: false,
			walletReady: true,
			feeTierReady: true
		});

		expect(queryByTestId('service-quotes-partial-alert')).toBeNull();
		expect(
			getByText(
				'Quote data is still propagating across relays. Sending is disabled until the latest request thread is fully synced.'
			)
		).toBeTruthy();
		expect(getByRole('button', { name: 'Send Proposal' })).toBeDisabled();
	});

	it('keeps the provider composer blocked in-context while offline', () => {
		const { getByRole, getByText, queryByTestId } = render(ServiceQuotesInbox, {
			service: mockService,
			timelines: [baseTimeline],
			focusedRequestId: 'qr_valid123',
			isSyncing: false,
			walletReady: true,
			feeTierReady: true
		});

		setNavigatorOnline(false);
		window.dispatchEvent(new Event('offline'));

		return waitFor(() => {
			expect(queryByTestId('service-quotes-offline-alert')).toBeNull();
			expect(getByRole('button', { name: 'Send Proposal' })).toBeDisabled();
			expect(getByText('You are offline. Reconnect before sending a proposal.')).toBeTruthy();
		});
	});

	it('shows reconnect guidance after provider quotes recover from an offline state', async () => {
		const { getByTestId } = render(ServiceQuotesInbox, {
			service: mockService,
			timelines: [baseTimeline],
			focusedRequestId: 'qr_valid123',
			isSyncing: false,
			walletReady: true,
			feeTierReady: true
		});

		setNavigatorOnline(false);
		window.dispatchEvent(new Event('offline'));
		setNavigatorOnline(true);
		window.dispatchEvent(new Event('online'));

		await waitFor(() => {
			expect(getByTestId('service-quotes-reconnect-alert')).toBeTruthy();
		});
	});

	it('renders the pending status copy when no proposal has been sent yet', () => {
		const { getAllByText } = render(ServiceQuotesInbox, {
			service: mockService,
			timelines: [baseTimeline],
			focusedRequestId: 'qr_valid123',
			isSyncing: false,
			walletReady: true,
			feeTierReady: true
		});

		expect(getAllByText('Pending').length).toBeGreaterThan(0);
	});

	it('renders the proposal-sent status copy when a non-terminal proposal exists', () => {
		const { getAllByText } = render(ServiceQuotesInbox, {
			service: mockService,
			timelines: [
				{
					...baseTimeline,
					latestProposal: {
						...baseTimeline.request,
						kind: 6421,
						content: {
							type: 'service-proposal',
							proposalId: 'pr_valid123',
							quoteRequestId: 'qr_valid123',
							serviceId: baseTimeline.request.content.serviceId,
							serviceAddress: baseTimeline.request.content.serviceAddress,
							paymentType: 'FIXED',
							amountUsdt: '225.00',
							description: 'Technical SEO audit with prioritized fixes.',
							estimatedDuration: '4 business days',
							estimatedStartTime: 1_700_000_000,
							estimatedEndTime: 1_700_259_200,
							expirationDays: 5,
							expirationHours: 0,
							expirationTimestamp: 1_700_300_000,
							freelancerRskAddress: '0x1111111111111111111111111111111111111111',
							freelancerFeeTier: 1,
							pricingSnapshot: {
								serviceVersionRef: 'service-event-1'
							},
							timestamp: 1,
							version: 'v1'
						},
						sig: ''
					},
					resolvedStatus: 'pending'
				}
			],
			focusedRequestId: 'qr_valid123',
			isSyncing: false,
			walletReady: true,
			feeTierReady: true
		});

		expect(getAllByText('Proposal sent').length).toBeGreaterThan(0);
	});

	it('renders the shared proposal agreement summary when a latest proposal exists', () => {
		const { getByTestId, getByText } = render(ServiceQuotesInbox, {
			service: mockService,
			timelines: [
				{
					...baseTimeline,
					latestProposal: {
						...baseTimeline.request,
						kind: 6421,
						content: {
							type: 'service-proposal',
							proposalId: 'pr_valid123',
							quoteRequestId: 'qr_valid123',
							serviceId: baseTimeline.request.content.serviceId,
							serviceAddress: baseTimeline.request.content.serviceAddress,
							paymentType: 'FIXED',
							amountUsdt: '225.00',
							description: 'Technical SEO audit with prioritized fixes.',
							estimatedDuration: '4 business days',
							estimatedStartTime: 1_700_000_000,
							estimatedEndTime: 1_700_259_200,
							expirationDays: 5,
							expirationHours: 0,
							expirationTimestamp: 1_700_300_000,
							freelancerRskAddress: '0x1111111111111111111111111111111111111111',
							freelancerFeeTier: 1,
							pricingSnapshot: {
								serviceVersionRef: 'service-event-1',
								tierId: 'premium',
								selectedAddOns: ['rush-audit']
							},
							timestamp: 1,
							version: 'v1'
						},
						sig: ''
					},
					resolvedStatus: 'pending'
				}
			],
			focusedRequestId: 'qr_valid123',
			isSyncing: false,
			walletReady: true,
			feeTierReady: true
		});

		expect(getByTestId('service-agreement-summary')).toBeTruthy();
		expect(getByTestId('service-agreement-tier').textContent).toContain('premium');
		expect(getByTestId('service-agreement-price').textContent).toContain('225.00 USDT');
		expect(getByText('rush-audit')).toBeTruthy();
		expect(getByText(/websiteSize:/)).toBeTruthy();
		expect(getByText('Estimated duration: 4 business days')).toBeTruthy();
	});

	it('renders a loading placeholder instead of the empty state before provider timelines load', () => {
		const { getByText, queryByText } = render(ServiceQuotesInbox, {
			service: mockService,
			timelines: [],
			focusedRequestId: null,
			isSyncing: true,
			hasLoaded: false,
			walletReady: true,
			feeTierReady: true
		});

		expect(getByText('Loading quote requests for this service...')).toBeTruthy();
		expect(queryByText('No service requests yet.')).toBeNull();
	});

	it('does not render the request placeholder card while the exact provider thread is still syncing', () => {
		const { queryByText, queryByRole } = render(ServiceQuotesInbox, {
			service: mockService,
			timelines: [],
			focusedRequestId: 'qr_valid123',
			isSyncing: true,
			hasLoaded: true,
			walletReady: true,
			feeTierReady: true
		});

		expect(queryByText('Waiting for the selected quote thread to finish syncing.')).toBeNull();
		expect(
			queryByText('Select a request to review the full inquiry and compose a proposal.')
		).toBeNull();
		expect(queryByRole('button', { name: 'Send Proposal' })).toBeNull();
	});
});
