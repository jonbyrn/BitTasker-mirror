import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, waitFor, within } from '@testing-library/svelte';
import ServiceQuotesInbox from '$lib/components/service/quotes/ServiceQuotesInbox.svelte';
import type { Service } from '$lib/types/service.d';
import type { ServiceQuoteTimelineEntry } from '$lib/types/service-quote';
import { ServicePricingTypeEnum } from '$lib/utils/enums/service.enum';
import { init } from 'svelte-i18n';

vi.mock('$lib/utils/portal', () => ({
	teleport: () => ({})
}));

vi.mock('$lib/utils/helpers/modalScrollLock', () => ({
	acquireScheduleModalScrollLock: () => () => {}
}));

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

vi.mock('$lib/components/user/UserInfoDisplay.svelte', () => ({
	default: () => ({
		$$render: () => '<div data-testid="provider-request-user">User info</div>'
	})
}));

vi.mock('$lib/nostr/profile', () => ({
	fetchContractProfile: vi.fn().mockResolvedValue({
		averageRating: 4.5,
		tasksCompleted: 12
	})
}));

vi.mock('$lib/stores/service-quote-ui.store', () => ({
	buildServiceAddress: (service: Service) =>
		`30402:${service.npub}:${service.uniqueId ?? service.id}`,
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
		currency: 'USD',
		tiers: [
			{
				id: 'premium',
				name: 'Premium Plan',
				description: 'Full premium',
				price: 250,
				features: []
			},
			{
				id: 'standard',
				name: 'Standard Plan',
				description: 'Basic standard',
				price: 150,
				features: []
			}
		]
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

function createTimeline(
	index: number,
	overrides: Partial<ServiceQuoteTimelineEntry> = {}
): ServiceQuoteTimelineEntry {
	return {
		...baseTimeline,
		request: {
			...baseTimeline.request,
			id: `request-event-${index}`,
			created_at: index,
			content: {
				...baseTimeline.request.content,
				quoteRequestId: `qr_valid_${index}`,
				inquiry: {
					...baseTimeline.request.content.inquiry,
					title: `Need a site audit ${index}`
				}
			}
		},
		...overrides
	};
}

describe('ServiceQuotesInbox', () => {
	const originalRequestAnimationFrame = window.requestAnimationFrame;
	const scrollHeightDescriptor = Object.getOwnPropertyDescriptor(
		HTMLElement.prototype,
		'scrollHeight'
	);
	const offsetWidthDescriptor = Object.getOwnPropertyDescriptor(
		HTMLElement.prototype,
		'offsetWidth'
	);

	function setNavigatorOnline(online: boolean) {
		Object.defineProperty(window.navigator, 'onLine', {
			value: online,
			configurable: true
		});
	}

	beforeEach(() => {
		vi.clearAllMocks();
		window.requestAnimationFrame = ((callback: FrameRequestCallback) => {
			callback(0);
			return 0;
		}) as typeof window.requestAnimationFrame;
		quoteUiStoreMock.set({ providerDataFreshnessByService: {} });
		setNavigatorOnline(true);
		init({ fallbackLocale: 'en', initialLocale: 'en' });
		window.history.replaceState({}, '', '/earning/my-services?view=quotes');
	});

	afterEach(() => {
		window.requestAnimationFrame = originalRequestAnimationFrame;

		if (scrollHeightDescriptor) {
			Object.defineProperty(HTMLElement.prototype, 'scrollHeight', scrollHeightDescriptor);
		}

		if (offsetWidthDescriptor) {
			Object.defineProperty(HTMLElement.prototype, 'offsetWidth', offsetWidthDescriptor);
		}
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

	it('shows the service tier name instead of the raw tier id on request cards and proposal drawers', async () => {
		const { getAllByText, getByRole, queryByText } = render(ServiceQuotesInbox, {
			service: mockService,
			services: [mockService],
			timelines: [baseTimeline],
			walletReady: true,
			feeTierReady: true,
			onSendProposal: vi.fn().mockResolvedValue({ success: true })
		});

		expect(getAllByText('Premium Plan').length).toBeGreaterThan(0);
		expect(queryByText(/^premium$/i)).toBeNull();

		await fireEvent.click(getByRole('button', { name: /^Send$/ }));

		await waitFor(() => {
			expect(getAllByText('Premium Plan').length).toBeGreaterThan(1);
		});
		expect(queryByText(/^premium$/i)).toBeNull();
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

	it('opens the proposal drawer for the selected request thread', async () => {
		const onRequestFocusChange = vi.fn();
		const { getAllByRole, queryByText, getByRole } = render(ServiceQuotesInbox, {
			service: mockService,
			timelines: [baseTimeline],
			focusedRequestId: null,
			isSyncing: false,
			walletReady: true,
			feeTierReady: true,
			onRequestFocusChange
		});

		await fireEvent.click(getAllByRole('button', { name: 'Send' })[0]);
		expect(onRequestFocusChange).toHaveBeenCalledWith('qr_valid123');
		await waitFor(() => expect(getByRole('dialog')).toBeTruthy());
		expect(within(getByRole('dialog')).queryByText('Need a site audit')).toBeNull();
		expect(within(getByRole('dialog')).queryByText('12 reviews')).toBeNull();
		expect(queryByText('Pending requests')).toBeNull();
	});

	it('does not block proposal entry when wallet information is missing', async () => {
		const { queryByTestId, getAllByRole, getByRole, queryByText, getByTestId } = render(
			ServiceQuotesInbox,
			{
				service: mockService,
				timelines: [baseTimeline],
				focusedRequestId: null,
				isSyncing: false,
				walletReady: false,
				feeTierReady: true
			}
		);

		expect(queryByTestId('service-quotes-prerequisite-alert')).toBeNull();
		expect(getByRole('button', { name: 'Send' })).toBeEnabled();

		await fireEvent.click(getAllByRole('button', { name: 'Send' })[0]);
		await waitFor(() => expect(getByRole('dialog')).toBeTruthy());
		await waitFor(() => expect(getByTestId('service-proposal-composer')).toBeTruthy());
		expect(
			within(getByTestId('service-proposal-composer')).getByRole('button', {
				name: 'Send Proposal'
			})
		).toBeEnabled();
		expect(queryByText('Connect your wallet before sending a proposal.')).toBeNull();
	});

	it('shows an inline fee-tier prerequisite alert and disables proposal actions until a fee tier is available', () => {
		const { getByTestId, getByRole } = render(ServiceQuotesInbox, {
			service: mockService,
			timelines: [baseTimeline],
			focusedRequestId: null,
			isSyncing: false,
			walletReady: true,
			feeTierReady: false
		});

		expect(getByTestId('service-quotes-prerequisite-alert')).toBeTruthy();
		expect(getByRole('button', { name: 'Send' })).toBeDisabled();
	});

	it('shows a proposal viewer instead of the composer once a proposal exists', async () => {
		const proposalEvent = {
			id: 'proposal-event-1',
			kind: 6421 as const,
			pubkey: 'a'.repeat(64),
			created_at: 2,
			tags: [
				['e', 'request-event-1'],
				['p', 'c'.repeat(64)]
			],
			content: {
				type: 'service-proposal' as const,
				proposalId: 'pr_valid123',
				quoteRequestId: 'qr_valid123',
				serviceId: baseTimeline.request.content.serviceId,
				serviceAddress: baseTimeline.request.content.serviceAddress,
				paymentType: 'FIXED' as const,
				amountUsdt: '225.00',
				description: 'Technical SEO audit with prioritized fixes.',
				estimatedDuration: '4 days and 9 hours',
				estimatedStartTime: 1_700_000_000,
				estimatedEndTime: 1_700_259_200,
				expirationDays: 5,
				expirationHours: 0,
				expirationTimestamp: 1_700_300_000,
				freelancerRskAddress: '0x1111111111111111111111111111111111111111',
				freelancerFeeTier: 1 as const,
				pricingSnapshot: {
					serviceVersionRef: 'service-event-1'
				},
				timestamp: 2,
				version: 'v1' as const
			},
			sig: ''
		};
		const timelineWithProposal = {
			...baseTimeline,
			proposals: [proposalEvent],
			latestProposal: proposalEvent,
			resolvedStatus: 'pending' as const
		};
		const onDeleteProposal = vi.fn().mockResolvedValue({ success: true });
		const { getByRole, queryByRole, getByText, queryByTestId } = render(ServiceQuotesInbox, {
			service: mockService,
			timelines: [timelineWithProposal],
			focusedRequestId: null,
			isSyncing: false,
			walletReady: true,
			feeTierReady: true,
			onDeleteProposal
		});

		expect(queryByRole('button', { name: 'Send' })).toBeNull();
		await fireEvent.click(getByRole('button', { name: 'View' }));
		await waitFor(() => expect(getByRole('dialog')).toBeTruthy());
		expect(queryByTestId('service-proposal-composer')).toBeNull();
		expect(getByText('Technical SEO audit with prioritized fixes.')).toBeTruthy();
		await fireEvent.click(getByRole('button', { name: 'Delete Proposal' }));
		await waitFor(() =>
			expect(onDeleteProposal).toHaveBeenCalledWith('qr_valid123', 'pr_valid123')
		);
	});

	it('keeps deleted-service proposals viewable but read-only', async () => {
		const timelineWithProposal = {
			...baseTimeline,
			latestProposal: {
				...baseTimeline.request,
				kind: 6421 as const,
				content: {
					type: 'service-proposal' as const,
					proposalId: 'pr_deleted123',
					quoteRequestId: 'qr_valid123',
					serviceId: baseTimeline.request.content.serviceId,
					serviceAddress: baseTimeline.request.content.serviceAddress,
					paymentType: 'FIXED' as const,
					amountUsdt: '225.00',
					description: 'Technical SEO audit with prioritized fixes.',
					estimatedDuration: '4 days and 9 hours',
					estimatedStartTime: 1_700_000_000,
					estimatedEndTime: 1_700_259_200,
					expirationDays: 5,
					expirationHours: 0,
					expirationTimestamp: 1_700_300_000,
					freelancerRskAddress: '0x1111111111111111111111111111111111111111',
					freelancerFeeTier: 1 as const,
					pricingSnapshot: {
						serviceVersionRef: 'service-event-1'
					},
					timestamp: 2,
					version: 'v1' as const
				},
				sig: ''
			},
			resolvedStatus: 'pending' as const
		};

		const { getByRole, queryByRole } = render(ServiceQuotesInbox, {
			service: null,
			serviceUnavailable: true,
			timelines: [timelineWithProposal],
			focusedRequestId: null,
			isSyncing: false,
			walletReady: true,
			feeTierReady: true,
			onDeleteProposal: vi.fn()
		});

		await fireEvent.click(getByRole('button', { name: 'View' }));
		await waitFor(() => expect(getByRole('dialog')).toBeTruthy());
		expect(queryByRole('button', { name: 'Delete Proposal' })).toBeNull();
	});

	it('keeps the proposal drawer open while the focused thread re-syncs after opening', async () => {
		const proposalEvent = {
			id: 'proposal-event-1',
			kind: 6421 as const,
			pubkey: 'a'.repeat(64),
			created_at: 2,
			tags: [
				['e', 'request-event-1'],
				['p', 'c'.repeat(64)]
			],
			content: {
				type: 'service-proposal' as const,
				proposalId: 'pr_valid123',
				quoteRequestId: 'qr_valid123',
				serviceId: baseTimeline.request.content.serviceId,
				serviceAddress: baseTimeline.request.content.serviceAddress,
				paymentType: 'FIXED' as const,
				amountUsdt: '225.00',
				description: 'Technical SEO audit with prioritized fixes.',
				estimatedDuration: '4 days and 9 hours',
				estimatedStartTime: 1_700_000_000,
				estimatedEndTime: 1_700_259_200,
				expirationDays: 5,
				expirationHours: 0,
				expirationTimestamp: 1_700_300_000,
				freelancerRskAddress: '0x1111111111111111111111111111111111111111',
				freelancerFeeTier: 1 as const,
				pricingSnapshot: {
					serviceVersionRef: 'service-event-1'
				},
				timestamp: 2,
				version: 'v1' as const
			},
			sig: ''
		};
		const timelineWithProposal = {
			...baseTimeline,
			proposals: [proposalEvent],
			latestProposal: proposalEvent,
			resolvedStatus: 'pending' as const
		};

		const rerenderInboxRef: {
			current?: (props: Record<string, unknown>) => Promise<void>;
		} = {};
		const onRequestFocusChange = vi.fn((requestId: string | null) => {
			if (requestId === 'qr_valid123' && rerenderInboxRef.current) {
				void rerenderInboxRef.current({
					service: mockService,
					timelines: [],
					focusedRequestId: requestId,
					isSyncing: true,
					walletReady: true,
					feeTierReady: true,
					onRequestFocusChange
				});
			}
		});

		const { getByRole, getByText, rerender } = render(ServiceQuotesInbox, {
			service: mockService,
			timelines: [timelineWithProposal],
			focusedRequestId: null,
			isSyncing: false,
			walletReady: true,
			feeTierReady: true,
			onRequestFocusChange
		});
		rerenderInboxRef.current = rerender;

		await fireEvent.click(getByRole('button', { name: 'View' }));

		await waitFor(() => expect(getByRole('dialog')).toBeTruthy());
		expect(getByText('Technical SEO audit with prioritized fixes.')).toBeTruthy();
	});

	it('truncates long inquiry descriptions in the proposal drawer and expands them on demand', async () => {
		Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
			configurable: true,
			get() {
				if (
					this instanceof HTMLElement &&
					this.dataset.testid === 'service-proposal-drawer-inquiry-description'
				) {
					return 120;
				}

				return scrollHeightDescriptor?.get?.call(this) ?? 0;
			}
		});

		Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
			configurable: true,
			get() {
				if (
					this instanceof HTMLElement &&
					this.dataset.testid === 'service-proposal-drawer-inquiry-description'
				) {
					return 320;
				}

				return offsetWidthDescriptor?.get?.call(this) ?? 320;
			}
		});

		const { getAllByRole, getByRole, getByTestId } = render(ServiceQuotesInbox, {
			service: mockService,
			timelines: [
				{
					...baseTimeline,
					request: {
						...baseTimeline.request,
						content: {
							...baseTimeline.request.content,
							inquiry: {
								...baseTimeline.request.content.inquiry,
								description:
									'Please review search visibility, technical debt, competitor gaps, conversion blockers, and analytics attribution. Include a rollout plan, implementation sequencing, success metrics, and stakeholder-ready recommendations.'
							}
						}
					}
				}
			],
			focusedRequestId: null,
			isSyncing: false,
			walletReady: true,
			feeTierReady: true
		});

		await fireEvent.click(getAllByRole('button', { name: 'Send' })[0]);
		await waitFor(() => expect(getByRole('dialog')).toBeTruthy());

		const description = await waitFor(() =>
			getByTestId('service-proposal-drawer-inquiry-description')
		);
		const toggle = await waitFor(() => getByRole('button', { name: 'See More' }));

		expect(description.className).toContain('line-clamp-3');
		await fireEvent.click(toggle);
		expect(description.className).not.toContain('line-clamp-3');
		expect(getByRole('button', { name: 'See Less' })).toBeTruthy();
	});

	it('renders proposal composer with SchedulePeriodPicker when Send is clicked', async () => {
		const onSendProposal = vi.fn().mockResolvedValue({ success: true });
		const { getByLabelText, getAllByRole, getByRole, getByTestId } = render(ServiceQuotesInbox, {
			service: mockService,
			timelines: [baseTimeline],
			focusedRequestId: null,
			isSyncing: false,
			walletReady: true,
			feeTierReady: true,
			onSendProposal
		});

		await fireEvent.click(getAllByRole('button', { name: 'Send' })[0]);
		await waitFor(() => expect(getByRole('dialog')).toBeTruthy());
		await waitFor(() => expect(getByTestId('service-proposal-composer')).toBeTruthy());

		await fireEvent.input(getByLabelText('Scope of work'), {
			target: { value: 'Technical SEO audit with prioritized fixes.' }
		});
		await fireEvent.input(getByLabelText('Amount (USD)'), {
			target: { value: '225.00' }
		});
		// SchedulePeriodPicker renders trigger buttons — verify they're present
		expect(
			getByLabelText(/common\.components\.schedule_picker\.date_accessibility_start/)
		).toBeInTheDocument();
		expect(
			getByLabelText(/common\.components\.schedule_picker\.date_accessibility_end/)
		).toBeInTheDocument();

		await fireEvent.input(getByLabelText('Expiration Days'), {
			target: { value: '5' }
		});
		await fireEvent.input(getByLabelText('Expiration Hours'), {
			target: { value: '6' }
		});
		await fireEvent.input(getByLabelText('Cover Letter'), {
			target: { value: 'I can start this week.' }
		});

		// Verify the composer rendered with SchedulePeriodPicker trigger buttons
		expect(getByTestId('service-proposal-composer')).toBeTruthy();
		expect(getByRole('button', { name: 'Send Proposal' })).toBeTruthy();
	});

	it('routes converted threads to the linked service contract while keeping the proposal viewer available', async () => {
		const proposalEvent = {
			id: 'proposal-event-contract-view',
			kind: 6421 as const,
			pubkey: 'a'.repeat(64),
			created_at: 2,
			tags: [
				['e', 'request-event-1'],
				['p', 'c'.repeat(64)]
			],
			content: {
				type: 'service-proposal' as const,
				proposalId: 'pr_contract_view123',
				quoteRequestId: 'qr_valid123',
				serviceId: baseTimeline.request.content.serviceId,
				serviceAddress: baseTimeline.request.content.serviceAddress,
				paymentType: 'FIXED' as const,
				amountUsdt: '225.00',
				description: 'Technical SEO audit with prioritized fixes.',
				estimatedDuration: '4 days and 9 hours',
				estimatedStartTime: 1_700_000_000,
				estimatedEndTime: 1_700_259_200,
				expirationDays: 5,
				expirationHours: 0,
				expirationTimestamp: 1_700_300_000,
				freelancerRskAddress: '0x1111111111111111111111111111111111111111',
				freelancerFeeTier: 1 as const,
				pricingSnapshot: {
					serviceVersionRef: 'service-event-1'
				},
				timestamp: 2,
				version: 'v1' as const
			},
			sig: ''
		};
		const { getByRole, findByRole, queryByRole } = render(ServiceQuotesInbox, {
			service: mockService,
			timelines: [
				{
					...baseTimeline,
					resolvedStatus: 'accepted',
					linkedEscrowId: 'escrow_987',
					proposals: [proposalEvent],
					latestProposal: proposalEvent
				}
			],
			focusedRequestId: 'qr_valid123',
			isSyncing: false,
			walletReady: true,
			feeTierReady: true
		});

		expect(queryByRole('button', { name: 'Send' })).toBeNull();
		expect(getByRole('button', { name: 'View' })).toBeTruthy();

		await fireEvent.click(getByRole('button', { name: 'Contract' }));

		expect(goto).toHaveBeenCalledWith(
			'/earning/my-services?tab=contracts&type=services&highlight=escrow_987'
		);

		await fireEvent.click(getByRole('button', { name: 'View' }));
		expect(await findByRole('dialog')).toBeTruthy();
	});

	it('upgrades provider continuity from accept_unknown back to the linked service contract view', async () => {
		const { getAllByRole, getByRole, queryAllByRole, queryByRole, rerender } = render(
			ServiceQuotesInbox,
			{
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
			}
		);

		expect(getAllByRole('button', { name: 'Send' }).length).toBeGreaterThan(0);
		expect(queryByRole('button', { name: 'Contract' })).toBeNull();

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

		expect(queryAllByRole('button', { name: 'Send' })).toHaveLength(0);
		expect(getByRole('button', { name: 'Contract' })).toBeTruthy();
	});

	it('shows contract syncing as a neutral state while still exposing the linked contract', async () => {
		const { getByRole, getByText, queryAllByRole } = render(ServiceQuotesInbox, {
			service: mockService,
			timelines: [
				{
					...baseTimeline,
					resolvedStatus: 'contract_sync_pending',
					linkedEscrowId: 'escrow_syncing'
				}
			],
			focusedRequestId: 'qr_valid123',
			isSyncing: false,
			walletReady: true,
			feeTierReady: true
		});

		expect(queryAllByRole('button', { name: 'Send' })).toHaveLength(0);
		expect(getByText('Contract syncing')).toBeTruthy();
		await fireEvent.click(getByRole('button', { name: 'Contract' }));

		expect(goto).toHaveBeenCalledWith(
			'/earning/my-services?tab=contracts&type=services&highlight=escrow_syncing'
		);
	});

	it('keeps expired quote requests visible as read-only rows and hides the proposal action', () => {
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

		expect(
			getByText(
				'This quote request is now read-only. Wait for the buyer to send a new request before replying again.'
			)
		).toBeTruthy();
		expect(queryByRole('button', { name: 'Send' })).toBeNull();
	});

	it('keeps deleted-service requests visible as read-only rows and hides the proposal action', () => {
		const { getByText, queryByRole } = render(ServiceQuotesInbox, {
			service: null,
			serviceUnavailable: true,
			timelines: [baseTimeline],
			focusedRequestId: 'qr_valid123',
			isSyncing: false,
			walletReady: true,
			feeTierReady: true
		});

		expect(
			getByText(
				'This service was deleted by the provider. Keep this request for reference, but no new proposals can be sent.'
			)
		).toBeTruthy();
		expect(queryByRole('button', { name: 'Send' })).toBeNull();
	});

	it('renders retry UI and disables proposal sending in the drawer when provider timeline loading fails', async () => {
		const onRetry = vi.fn();
		const { getByRole, getAllByRole, getByText, getByTestId } = render(ServiceQuotesInbox, {
			service: mockService,
			timelines: [baseTimeline],
			focusedRequestId: null,
			isSyncing: false,
			loadError: 'provider query failed',
			walletReady: true,
			feeTierReady: true,
			onRetry
		});

		await fireEvent.click(getAllByRole('button', { name: 'Send' })[0]);
		await waitFor(() => expect(getByRole('dialog')).toBeTruthy());
		await waitFor(() => expect(getByTestId('service-proposal-composer')).toBeTruthy());
		expect(
			within(getByTestId('service-proposal-composer')).getByRole('button', {
				name: 'Send Proposal'
			})
		).toBeDisabled();
		await fireEvent.click(getByRole('button', { name: 'Retry' }));
		expect(onRetry).toHaveBeenCalledTimes(1);
		expect(getByText('provider query failed')).toBeTruthy();
	});

	it('keeps the requests workspace visible when a service has no quote requests yet', () => {
		const { getByTestId, getByText, queryByText } = render(ServiceQuotesInbox, {
			service: mockService,
			timelines: [],
			focusedRequestId: null,
			isSyncing: false,
			hasLoaded: true,
			walletReady: false,
			feeTierReady: false
		});

		expect(getByTestId('service-quotes-filtered-empty-state')).toBeTruthy();
		expect(getByText('No service requests yet.')).toBeTruthy();
		expect(queryByText('Quote Inbox')).toBeNull();
		expect(queryByText('Select a service to review incoming requests.')).toBeNull();
	});

	it('keeps stale provider data blocked in-context while cached provider data is stale', async () => {
		quoteUiStoreMock.set({
			providerDataFreshnessByService: {
				[baseTimeline.request.content.serviceAddress]: 'stale'
			}
		});

		const { getByRole, getAllByRole, queryByTestId, queryByText, getByTestId } = render(
			ServiceQuotesInbox,
			{
				service: mockService,
				timelines: [baseTimeline],
				focusedRequestId: null,
				isSyncing: false,
				walletReady: true,
				feeTierReady: true
			}
		);

		await fireEvent.click(getAllByRole('button', { name: 'Send' })[0]);
		await waitFor(() => expect(getByRole('dialog')).toBeTruthy());
		await waitFor(() => expect(getByTestId('service-proposal-composer')).toBeTruthy());
		expect(queryByTestId('service-quotes-stale-alert')).toBeNull();
		expect(queryByText('Showing stale quote data. Refresh before sending a proposal.')).toBeNull();
		expect(
			within(getByTestId('service-proposal-composer')).getByRole('button', {
				name: 'Send Proposal'
			})
		).toBeDisabled();
	});

	it('keeps partial-sync blocking in-context while thread data is incomplete', async () => {
		quoteUiStoreMock.set({
			providerDataFreshnessByService: {
				[baseTimeline.request.content.serviceAddress]: 'partial'
			}
		});

		const { getByRole, getAllByRole, queryByTestId, queryByText, getByTestId } = render(
			ServiceQuotesInbox,
			{
				service: mockService,
				timelines: [baseTimeline],
				focusedRequestId: null,
				isSyncing: false,
				walletReady: true,
				feeTierReady: true
			}
		);

		await fireEvent.click(getAllByRole('button', { name: 'Send' })[0]);
		await waitFor(() => expect(getByRole('dialog')).toBeTruthy());
		await waitFor(() => expect(getByTestId('service-proposal-composer')).toBeTruthy());
		expect(queryByTestId('service-quotes-partial-alert')).toBeNull();
		expect(
			queryByText(
				'Quote data is still propagating across relays. Sending is disabled until the latest request thread is fully synced.'
			)
		).toBeNull();
		expect(
			within(getByTestId('service-proposal-composer')).getByRole('button', {
				name: 'Send Proposal'
			})
		).toBeDisabled();
	});

	it('keeps the provider composer blocked in-context while offline', async () => {
		const { getAllByRole, getByRole, queryByTestId, queryByText, getByTestId } = render(
			ServiceQuotesInbox,
			{
				service: mockService,
				timelines: [baseTimeline],
				focusedRequestId: null,
				isSyncing: false,
				walletReady: true,
				feeTierReady: true
			}
		);

		await fireEvent.click(getAllByRole('button', { name: 'Send' })[0]);
		await waitFor(() => expect(getByRole('dialog')).toBeTruthy());
		await waitFor(() => expect(getByTestId('service-proposal-composer')).toBeTruthy());

		setNavigatorOnline(false);
		window.dispatchEvent(new Event('offline'));

		await waitFor(() => {
			expect(queryByTestId('service-quotes-offline-alert')).toBeNull();
			expect(
				within(getByTestId('service-proposal-composer')).getByRole('button', {
					name: 'Send Proposal'
				})
			).toBeDisabled();
			expect(queryByText('You are offline. Reconnect before sending a proposal.')).toBeNull();
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

	it('exposes the mobile status filter with listbox semantics and expanded state', async () => {
		const { getAllByRole, getByRole } = render(ServiceQuotesInbox, {
			service: mockService,
			timelines: [baseTimeline],
			focusedRequestId: null,
			isSyncing: false,
			walletReady: true,
			feeTierReady: true
		});

		const filterTrigger = getAllByRole('button', { name: 'All Statuses' })[0];
		expect(filterTrigger.getAttribute('aria-haspopup')).toBe('listbox');
		expect(filterTrigger.getAttribute('aria-expanded')).toBe('false');

		await fireEvent.click(filterTrigger);

		expect(filterTrigger.getAttribute('aria-expanded')).toBe('true');
		expect(getByRole('listbox')).toBeTruthy();
	});

	it.skip('moves focus through the mobile status filter with keyboard controls', async () => {
		const { getAllByRole, getByRole } = render(ServiceQuotesInbox, {
			service: mockService,
			timelines: [baseTimeline],
			focusedRequestId: null,
			isSyncing: false,
			walletReady: true,
			feeTierReady: true
		});

		const filterTrigger = getAllByRole('button', { name: 'All Statuses' })[0];
		filterTrigger.focus();

		await fireEvent.keyDown(filterTrigger, { key: ' ' });

		const listbox = getByRole('listbox');
		const options = within(listbox).getAllByRole('button');
		await waitFor(() => expect(options[0]).toHaveFocus());

		await fireEvent.keyDown(options[0], { key: 'ArrowDown' });
		await waitFor(() => expect(options[1]).toHaveFocus());

		await fireEvent.keyDown(options[1], { key: 'Escape' });
		await waitFor(() => expect(filterTrigger).toHaveFocus());
		expect(filterTrigger.getAttribute('aria-expanded')).toBe('false');
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
		const { getAllByText, getByRole, queryByRole } = render(ServiceQuotesInbox, {
			service: mockService,
			timelines: [
				{
					...baseTimeline,
					latestProposal: {
						...baseTimeline.request,
						kind: 6421 as const,
						content: {
							type: 'service-proposal',
							proposalId: 'pr_valid123',
							quoteRequestId: 'qr_valid123',
							serviceId: baseTimeline.request.content.serviceId,
							serviceAddress: baseTimeline.request.content.serviceAddress,
							paymentType: 'FIXED',
							amountUsdt: '225.00',
							description: 'Technical SEO audit with prioritized fixes.',
							estimatedDuration: '4 days and 9 hours',
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
		expect(getByRole('button', { name: 'View' })).toBeTruthy();
		expect(queryByRole('button', { name: 'Send' })).toBeNull();
	});

	it('uses the dedicated clear callback when the drawer closes', async () => {
		const onRequestFocusChange = vi.fn();
		const onRequestClear = vi.fn();
		const { getAllByRole, getByLabelText, getByRole, getByTestId } = render(ServiceQuotesInbox, {
			service: mockService,
			timelines: [baseTimeline],
			focusedRequestId: null,
			isSyncing: false,
			walletReady: true,
			feeTierReady: true,
			onRequestFocusChange,
			onRequestClear
		});

		await fireEvent.click(getAllByRole('button', { name: 'Send' })[0]);
		await waitFor(() => expect(getByRole('dialog')).toBeTruthy());
		await waitFor(() => expect(getByTestId('service-proposal-composer')).toBeTruthy());
		await fireEvent.click(getByLabelText('common.components.drawer.close'));

		expect(onRequestFocusChange).toHaveBeenCalledTimes(1);
		expect(onRequestFocusChange).toHaveBeenCalledWith('qr_valid123');
		expect(onRequestClear).toHaveBeenCalledTimes(1);
	});

	it('renders terminal proposal status copy inside the drawer', async () => {
		const proposalTimeline = {
			...baseTimeline,
			latestProposal: {
				...baseTimeline.request,
				kind: 6421 as const,
				content: {
					type: 'service-proposal' as const,
					proposalId: 'pr_declined123',
					quoteRequestId: 'qr_valid123',
					serviceId: baseTimeline.request.content.serviceId,
					serviceAddress: baseTimeline.request.content.serviceAddress,
					paymentType: 'FIXED' as const,
					amountUsdt: '225.00',
					description: 'Technical SEO audit with prioritized fixes.',
					estimatedDuration: '4 days and 9 hours',
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
					version: 'v1' as const
				},
				sig: ''
			},
			resolvedStatus: 'declined' as const
		} as unknown as ServiceQuoteTimelineEntry;

		const { getByRole, getAllByText } = render(ServiceQuotesInbox, {
			service: mockService,
			timelines: [proposalTimeline],
			focusedRequestId: 'qr_valid123',
			isSyncing: false,
			walletReady: true,
			feeTierReady: true
		});

		await fireEvent.click(getByRole('button', { name: 'View' }));
		await waitFor(() => expect(getByRole('dialog')).toBeTruthy());
		expect(getAllByText('Declined').length).toBeGreaterThan(0);
	});

	it('does not render the removed provider request summary card', () => {
		const { queryByTestId } = render(ServiceQuotesInbox, {
			service: mockService,
			timelines: [baseTimeline],
			focusedRequestId: null,
			isSyncing: false,
			walletReady: true,
			feeTierReady: true
		});

		expect(queryByTestId('service-quotes-summary-card')).toBeNull();
	});

	it('shows all same-service requests by default even when they span multiple statuses', () => {
		const timelineWithProposal = {
			...createTimeline(2),
			latestProposal: {
				...baseTimeline.request,
				id: 'proposal-event-2',
				kind: 6421 as const,
				content: {
					type: 'service-proposal' as const,
					proposalId: 'pr_valid_2',
					quoteRequestId: 'qr_valid_2',
					serviceId: baseTimeline.request.content.serviceId,
					serviceAddress: baseTimeline.request.content.serviceAddress,
					paymentType: 'FIXED' as const,
					amountUsdt: '150',
					description: 'Follow-up audit proposal.',
					estimatedDuration: '2 days',
					estimatedStartTime: 1_700_000_000,
					estimatedEndTime: 1_700_172_800,
					expirationDays: 3,
					expirationHours: 0,
					expirationTimestamp: 1_700_259_200,
					freelancerRskAddress: '0x1111111111111111111111111111111111111111',
					freelancerFeeTier: 1 as const,
					pricingSnapshot: {
						serviceVersionRef: 'service-event-1'
					},
					timestamp: 2,
					version: 'v1' as const
				},
				sig: ''
			},
			resolvedStatus: 'pending' as const
		};
		const { getByText } = render(ServiceQuotesInbox, {
			services: [mockService],
			selectedServiceAddress: baseTimeline.request.content.serviceAddress,
			service: mockService,
			timelines: [baseTimeline, timelineWithProposal],
			focusedRequestId: null,
			isSyncing: false,
			walletReady: true,
			feeTierReady: true
		});

		expect(getByText('Need a site audit')).toBeTruthy();
		expect(getByText('Need a site audit 2')).toBeTruthy();
	});

	it('keeps the chosen status filter stable when focus changes', async () => {
		const timelineWithProposal = {
			...createTimeline(2),
			latestProposal: {
				...baseTimeline.request,
				id: 'proposal-event-2',
				kind: 6421 as const,
				content: {
					type: 'service-proposal' as const,
					proposalId: 'pr_valid_2',
					quoteRequestId: 'qr_valid_2',
					serviceId: baseTimeline.request.content.serviceId,
					serviceAddress: baseTimeline.request.content.serviceAddress,
					paymentType: 'FIXED' as const,
					amountUsdt: '150',
					description: 'Follow-up audit proposal.',
					estimatedDuration: '2 days',
					estimatedStartTime: 1_700_000_000,
					estimatedEndTime: 1_700_172_800,
					expirationDays: 3,
					expirationHours: 0,
					expirationTimestamp: 1_700_259_200,
					freelancerRskAddress: '0x1111111111111111111111111111111111111111',
					freelancerFeeTier: 1 as const,
					pricingSnapshot: {
						serviceVersionRef: 'service-event-1'
					},
					timestamp: 2,
					version: 'v1' as const
				},
				sig: ''
			},
			resolvedStatus: 'pending' as const
		};
		const { getAllByRole, getByRole, queryByText, rerender } = render(ServiceQuotesInbox, {
			services: [mockService],
			selectedServiceAddress: baseTimeline.request.content.serviceAddress,
			service: mockService,
			timelines: [baseTimeline, timelineWithProposal],
			focusedRequestId: null,
			isSyncing: false,
			walletReady: true,
			feeTierReady: true
		});

		const statusDropdownTrigger = getAllByRole('button', { name: 'All Statuses' })[0];
		await fireEvent.click(statusDropdownTrigger);
		const statusListbox = getByRole('listbox');
		const statusOptions = within(statusListbox).getAllByRole('option');
		await fireEvent.click(statusOptions[0]);

		expect(queryByText('Need a site audit')).toBeTruthy();
		expect(queryByText('Need a site audit 2')).toBeTruthy();

		await rerender({
			services: [mockService],
			selectedServiceAddress: baseTimeline.request.content.serviceAddress,
			service: mockService,
			timelines: [baseTimeline, timelineWithProposal],
			focusedRequestId: 'qr_valid_2',
			isSyncing: false,
			walletReady: true,
			feeTierReady: true
		});

		expect(queryByText('Need a site audit')).toBeTruthy();
		expect(queryByText('Need a site audit 2')).toBeTruthy();
	});

	it.skip('shows a filtered empty state and clears the filter back to all requests', async () => {
		const { getAllByRole, getByRole, getByTestId, queryByText } = render(ServiceQuotesInbox, {
			services: [mockService],
			selectedServiceAddress: baseTimeline.request.content.serviceAddress,
			service: mockService,
			timelines: [baseTimeline],
			focusedRequestId: null,
			isSyncing: false,
			walletReady: true,
			feeTierReady: true
		});

		const statusDropdownTrigger = getAllByRole('button', { name: 'All Statuses' })[0];
		await fireEvent.click(statusDropdownTrigger);
		const statusListbox = getByRole('listbox');
		const statusOptions = within(statusListbox).getAllByRole('option');
		await fireEvent.click(statusOptions[2]);

		expect(getByTestId('service-quotes-filtered-empty-state')).toBeTruthy();
		expect(queryByText('Need a site audit')).toBeNull();

		await fireEvent.click(getByRole('button', { name: 'Clear Filters' }));

		await waitFor(() => {
			expect(queryByText('Need a site audit')).toBeTruthy();
		});
	});

	it('paginates provider request cards after the first ten requests', async () => {
		const timelines = Array.from({ length: 11 }, (_, index) => createTimeline(index + 1));
		const { container, getByRole, queryByText } = render(ServiceQuotesInbox, {
			services: [mockService],
			selectedServiceAddress: baseTimeline.request.content.serviceAddress,
			service: mockService,
			timelines,
			focusedRequestId: null,
			isSyncing: false,
			walletReady: true,
			feeTierReady: true
		});

		expect(container.querySelectorAll('[data-testid^="service-request-card-"]')).toHaveLength(10);
		expect(queryByText('Need a site audit 11')).toBeTruthy();
		expect(queryByText('Need a site audit 1')).toBeNull();

		await fireEvent.click(getByRole('button', { name: 'Next' }));

		await waitFor(() => {
			expect(container.querySelectorAll('[data-testid^="service-request-card-"]')).toHaveLength(1);
			expect(queryByText('Need a site audit 1')).toBeTruthy();
		});
	});

	it('surfaces a focused deep-linked request on the page that contains it', async () => {
		const timelines = Array.from({ length: 11 }, (_, index) => createTimeline(index + 1));
		const { container, queryByText } = render(ServiceQuotesInbox, {
			services: [mockService],
			selectedServiceAddress: baseTimeline.request.content.serviceAddress,
			service: mockService,
			timelines,
			focusedRequestId: 'qr_valid_1',
			isSyncing: false,
			walletReady: true,
			feeTierReady: true
		});

		await waitFor(() => {
			expect(container.querySelectorAll('[data-testid^="service-request-card-"]')).toHaveLength(1);
			expect(queryByText('Need a site audit 1')).toBeTruthy();
			expect(queryByText('Need a site audit 11')).toBeNull();
		});
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
		expect(queryByRole('button', { name: 'Send' })).toBeNull();
	});
});
