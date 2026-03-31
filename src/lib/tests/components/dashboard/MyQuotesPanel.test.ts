import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, waitFor, within } from '@testing-library/svelte';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import MyQuotesPanel from '$lib/components/dashboard/quotes/MyQuotesPanel.svelte';
import type { ServiceQuoteTimelineEntry } from '$lib/types/service-quote';
import { normalizeServiceContractSchedule } from '$lib/utils/service-contract/schedule';
import { ServicePricingTypeEnum } from '$lib/utils/enums/service.enum';

const {
	applyTaskerStatus,
	acceptTaskerProposal,
	deleteTaskerRequest,
	goto,
	findServiceByUniqueId,
	mockGetCurrentPrice,
	mockInitializeWallet,
	mockLoadAssets,
	mockPreflightServiceContractCreation,
	showErrorToast,
	showInfoToast,
	showSuccessToast,
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
		npub: 'd'.repeat(64),
		status: 'active',
		title: 'Managed Migration Service',
		pricing: {
			type: 'INQUIRY_REQUIRED',
			currency: 'USD',
			tiers: [
				{ id: 'premium', name: 'Premium Plan', price: 250 },
				{ id: 'standard', name: 'Standard Plan', price: 150 }
			]
		}
	}),
	mockGetCurrentPrice: vi.fn().mockResolvedValue(50_000),
	mockInitializeWallet: vi.fn().mockResolvedValue(undefined),
	mockLoadAssets: vi.fn().mockResolvedValue(undefined),
	mockPreflightServiceContractCreation: vi.fn().mockResolvedValue({
		ok: true,
		totalRequired: '0.00257250'
	}),
	showErrorToast: vi.fn(),
	showInfoToast: vi.fn(),
	showSuccessToast: vi.fn(),
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

const mockAllAssetsStore = vi.hoisted(() => ({
	value: [
		{
			assetId: 'rbtc',
			usdValue: 250
		}
	],
	subscribers: new Set<(value: Array<{ assetId: string; usdValue: number }>) => void>(),
	subscribe(run: (value: Array<{ assetId: string; usdValue: number }>) => void) {
		run(this.value);
		this.subscribers.add(run);
		return () => this.subscribers.delete(run);
	},
	set(next: Array<{ assetId: string; usdValue: number }>) {
		this.value = next;
		this.subscribers.forEach((run) => run(this.value));
	}
}));

const mockTotalBalancesStore = vi.hoisted(() => ({
	value: {
		sats: 500_000,
		rbtc: 0.005
	},
	subscribers: new Set<(value: { sats: number; rbtc: number }) => void>(),
	subscribe(run: (value: { sats: number; rbtc: number }) => void) {
		run(this.value);
		this.subscribers.add(run);
		return () => this.subscribers.delete(run);
	},
	set(next: { sats: number; rbtc: number }) {
		this.value = next;
		this.subscribers.forEach((run) => run(this.value));
	}
}));

const mockWalletStore = vi.hoisted(() => ({
	value: {
		rsk: {
			connected: true,
			connecting: false,
			error: null,
			address: '0x1111111111111111111111111111111111111111',
			wallet: {},
			provider: {}
		}
	},
	subscribers: new Set<
		(value: {
			rsk: {
				connected: boolean;
				connecting: boolean;
				error: null;
				address: string;
				wallet: object;
				provider: object;
			};
		}) => void
	>(),
	subscribe(
		run: (value: {
			rsk: {
				connected: boolean;
				connecting: boolean;
				error: null;
				address: string;
				wallet: object;
				provider: object;
			};
		}) => void
	) {
		run(this.value);
		this.subscribers.add(run);
		return () => this.subscribers.delete(run);
	},
	set(next: {
		rsk: {
			connected: boolean;
			connecting: boolean;
			error: null;
			address: string;
			wallet: object;
			provider: object;
		};
	}) {
		this.value = next;
		this.subscribers.forEach((run) => run(this.value));
	}
}));

vi.mock('$app/navigation', () => ({
	goto
}));

vi.mock('$lib/stores/app.store', () => ({
	appStore: {
		showErrorToast,
		showInfoToast,
		showSuccessToast
	}
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

vi.mock('$lib/api/services/crypto-price.service', () => ({
	default: {
		getCurrentPrice: mockGetCurrentPrice
	}
}));

vi.mock('$lib/utils/service-contract/preflight', () => ({
	preflightServiceContractCreation: mockPreflightServiceContractCreation
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

vi.mock('$lib/stores/wallet.store', () => ({
	walletStore: mockWalletStore,
	allAssets: mockAllAssetsStore,
	totalBalances: mockTotalBalancesStore,
	formatSats: (value: number) => new Intl.NumberFormat('en-US').format(value),
	walletManager: {
		initialize: mockInitializeWallet,
		loadAssets: mockLoadAssets
	}
}));

vi.mock('$lib/components/user/UserInfoDisplay.svelte', async () => ({
	default: (await import('./__mocks__/UserInfoDisplay.mock.svelte')).default
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
			tierId: 'premium',
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

function createDeferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (reason?: unknown) => void;
	const promise = new Promise<T>((innerResolve, innerReject) => {
		resolve = innerResolve;
		reject = innerReject;
	});

	return { promise, resolve, reject };
}

function readDashboardLocale(locale: 'en' | 'es') {
	return JSON.parse(
		readFileSync(
			resolve(process.cwd(), 'static', 'locales', locale, 'dashboard', 'dashboard.json'),
			'utf8'
		)
	) as Record<string, unknown>;
}

function getNestedValue(source: Record<string, unknown>, path: string): unknown {
	return path.split('.').reduce<unknown>((current, segment) => {
		if (current && typeof current === 'object' && segment in current) {
			return (current as Record<string, unknown>)[segment];
		}

		return undefined;
	}, source);
}

describe('MyQuotesPanel', () => {
	const originalRequestAnimationFrame = window.requestAnimationFrame;
	const scrollHeightDescriptor = Object.getOwnPropertyDescriptor(
		HTMLElement.prototype,
		'scrollHeight'
	);
	const offsetWidthDescriptor = Object.getOwnPropertyDescriptor(
		HTMLElement.prototype,
		'offsetWidth'
	);

	beforeEach(() => {
		vi.clearAllMocks();
		window.requestAnimationFrame = ((callback: FrameRequestCallback) => {
			callback(0);
			return 0;
		}) as typeof window.requestAnimationFrame;
		findServiceByUniqueId.mockResolvedValue({
			id: 'service-event-1',
			uniqueId: 'service-unique-id',
			title: 'Managed Migration Service'
		});
		mockGetCurrentPrice.mockResolvedValue(50_000);
		mockPreflightServiceContractCreation.mockResolvedValue({
			ok: true,
			totalRequired: '0.00257250'
		});
		mockAllAssetsStore.set([
			{
				assetId: 'rbtc',
				usdValue: 250
			}
		]);
		mockTotalBalancesStore.set({
			sats: 500_000,
			rbtc: 0.005
		});
		mockWalletStore.set({
			rsk: {
				connected: true,
				connecting: false,
				error: null,
				address: '0x1111111111111111111111111111111111111111',
				wallet: {},
				provider: {}
			}
		});
		quoteUiStoreMock.set({ taskerDataFreshness: 'fresh' });
		window.history.replaceState({}, '', '/dashboard?tab=quotes&view=tasker');
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

	it('renders quote cards in a grid layout', () => {
		const { container, getByText, queryByText } = render(MyQuotesPanel, {
			timelines: [timeline],
			focusedRequestId: 'qr_valid123',
			isSyncing: false
		});

		const title = getByText('Need a migration');
		const card = title.closest('.card');
		expect(title).toBeTruthy();
		expect(card).toBeTruthy();
		expect(title.tagName).toBe('SPAN');
		expect(title.className).toContain('card-title');
		expect(title.className).toContain('text-lg');
		expect(title.className).toContain('font-semibold');
		expect(getByText('Move our docs and preserve redirects.')).toBeTruthy();
		expect(getByText(/1970/)).toBeTruthy();
		expect(getByText(/Estimated duration: 3 days/)).toBeTruthy();
		expect(within(card!).getByText('$125')).toBeTruthy();
		const statusBadge = within(card!).getByText('Proposal received');
		expect(statusBadge.className).toContain('badge-info');
		expect(statusBadge.className).not.toContain('truncate');
		const expirationHighlight = within(card!).getByText('Expires:').closest('div');
		expect(expirationHighlight).toBeTruthy();
		expect(expirationHighlight?.className).toContain('bg-primary/10');
		expect(expirationHighlight?.className).not.toContain('badge');
		expect(queryByText(/Requested:/)).toBeTruthy();
		expect(queryByText(/Request ID:/)).toBeNull();
		expect(queryByText(/Service:/)).toBeNull();
		expect(container.querySelector('.grid')).toBeTruthy();
	});

	it('renders card-level accept and decline actions alongside view', async () => {
		const { getByRole, queryByText } = render(MyQuotesPanel, {
			timelines: [timeline],
			focusedRequestId: 'qr_valid123',
			isSyncing: false
		});

		// Cards should keep quick actions for proposal decisions
		await waitFor(() => {
			expect(getByRole('button', { name: 'View' })).toBeTruthy();
			expect(getByRole('button', { name: 'Accept' })).toBeTruthy();
			expect(getByRole('button', { name: 'Decline' })).toBeTruthy();
		});
		expect(queryByText('Delete')).toBeNull();
	});

	it('renders the provider identity on request cards instead of the request owner', async () => {
		const providerTimeline = createTimeline({
			request: {
				...timeline.request,
				pubkey: '1'.repeat(64),
				content: {
					...timeline.request.content,
					quoteRequestId: 'qr_provider_card'
				}
			},
			latestProposal: {
				...timeline.latestProposal!,
				pubkey: '2'.repeat(64),
				content: {
					...timeline.latestProposal!.content,
					quoteRequestId: 'qr_provider_card',
					proposalId: 'pr_provider_card'
				}
			},
			proposals: [
				{
					...timeline.proposals[0],
					pubkey: '2'.repeat(64),
					content: {
						...timeline.proposals[0].content,
						quoteRequestId: 'qr_provider_card',
						proposalId: 'pr_provider_card'
					}
				}
			]
		});

		const { getByTestId } = render(MyQuotesPanel, {
			timelines: [providerTimeline],
			focusedRequestId: 'qr_provider_card',
			isSyncing: false
		});

		await waitFor(() => {
			expect(getByTestId('quote-card-user')).toHaveTextContent('2'.repeat(64));
		});
		expect(getByTestId('quote-card-user')).not.toHaveTextContent('1'.repeat(64));
	});

	it('renders a task-style request status filter card and refresh control', async () => {
		const onRetry = vi.fn().mockResolvedValue(undefined);
		const { getByText, queryByText, getByRole } = render(MyQuotesPanel, {
			timelines: [timeline],
			focusedRequestId: 'qr_valid123',
			isSyncing: false,
			onRetry
		});

		expect(getByText('Filter by request status')).toBeTruthy();
		expect(queryByText('Focus on the service requests that need your next action.')).toBeNull();

		await fireEvent.click(getByRole('button', { name: 'Refresh' }));
		expect(onRetry).toHaveBeenCalledTimes(1);
	});

	it('does not auto-open the request drawer from focusedRequestId unless restoration is enabled', () => {
		const { queryByTestId } = render(MyQuotesPanel, {
			timelines: [timeline],
			focusedRequestId: 'qr_valid123',
			isSyncing: false
		});

		expect(queryByTestId('service-request-drawer')).toBeNull();
	});

	it('restores the focused request drawer when route restoration is enabled', async () => {
		const { getByTestId } = render(MyQuotesPanel, {
			timelines: [timeline],
			focusedRequestId: 'qr_valid123',
			restoreFocusedRequest: true,
			isSyncing: false
		});

		await waitFor(() => {
			expect(getByTestId('service-request-drawer')).toBeTruthy();
		});
	});

	it('truncates long inquiry descriptions in the request drawer and expands them on demand', async () => {
		Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
			configurable: true,
			get() {
				if (
					this instanceof HTMLElement &&
					this.dataset.testid === 'service-request-drawer-inquiry-description'
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
					this.dataset.testid === 'service-request-drawer-inquiry-description'
				) {
					return 320;
				}

				return offsetWidthDescriptor?.get?.call(this) ?? 320;
			}
		});

		const longDescription =
			'We need a full migration plan with redirect mapping, analytics preservation, stakeholder review, and launch support. ' +
			'Please include rollback planning, QA checkpoints, and post-launch verification steps for the handoff.';

		const { getByRole, getByTestId } = render(MyQuotesPanel, {
			timelines: [
				createTimeline({
					requestId: 'qr_long_inquiry',
					description: longDescription
				})
			],
			focusedRequestId: 'qr_long_inquiry',
			restoreFocusedRequest: true,
			isSyncing: false
		});

		const description = await waitFor(() =>
			getByTestId('service-request-drawer-inquiry-description')
		);
		const toggle = await waitFor(() => getByRole('button', { name: 'See More' }));

		expect(description.className).toContain('line-clamp-3');
		await fireEvent.click(toggle);
		expect(description.className).not.toContain('line-clamp-3');
		expect(getByRole('button', { name: 'See Less' })).toBeTruthy();
	});

	it('clears invalid focused requests after loading completes', async () => {
		const onInvalidFocusedRequest = vi.fn();

		render(MyQuotesPanel, {
			timelines: [timeline],
			focusedRequestId: 'qr_missing99',
			isSyncing: false,
			hasLoaded: true,
			onInvalidFocusedRequest
		});

		await waitFor(() => expect(onInvalidFocusedRequest).toHaveBeenCalledTimes(1));
	});

	it('does not clear focused requests before the initial tasker load completes', async () => {
		const onInvalidFocusedRequest = vi.fn();

		render(MyQuotesPanel, {
			timelines: [timeline],
			focusedRequestId: 'qr_missing99',
			isSyncing: false,
			hasLoaded: false,
			onInvalidFocusedRequest
		});

		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(onInvalidFocusedRequest).not.toHaveBeenCalled();
	});

	it('clears a restored focused request when it disappears after rerender', async () => {
		const onInvalidFocusedRequest = vi.fn();
		const { rerender } = render(MyQuotesPanel, {
			timelines: [timeline],
			focusedRequestId: 'qr_valid123',
			restoreFocusedRequest: true,
			isSyncing: false,
			hasLoaded: true,
			onInvalidFocusedRequest
		});

		await rerender({
			timelines: [],
			focusedRequestId: 'qr_valid123',
			restoreFocusedRequest: true,
			isSyncing: false,
			hasLoaded: true,
			onInvalidFocusedRequest
		});

		await waitFor(() => expect(onInvalidFocusedRequest).toHaveBeenCalledTimes(1));
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
				requestId: 'qr_proposal_received',
				title: 'Proposal received request',
				hasProposal: true,
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
		expect(queryByText('Proposal received request')).toBeNull();
		expect(queryByText('Failed request')).toBeNull();
		expect(queryByText('Unknown request')).toBeNull();
		expect(queryByText('Contract request')).toBeNull();

		await fireEvent.click(getByRole('button', { name: 'Proposal received' }));
		expect(queryByText('Proposal received request')).toBeTruthy();
		expect(queryByText('Awaiting request')).toBeNull();

		await fireEvent.click(getByRole('button', { name: 'All' }));
		expect(queryByText('Awaiting request')).toBeTruthy();
		expect(queryByText('Proposal received request')).toBeTruthy();

		const filterAssertions: Array<{ label: string; visible: string; hidden: string }> = [
			{ label: 'Needs attention', visible: 'Failed request', hidden: 'Awaiting request' },
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

	it('confirms and submits request deletion from the drawer actions', async () => {
		const { getByRole, getByText, queryByText } = render(MyQuotesPanel, {
			timelines: [timeline],
			focusedRequestId: 'qr_valid123',
			isSyncing: false
		});

		await fireEvent.click(getByRole('button', { name: 'View' }));
		const drawer = getByRole('dialog');
		await waitFor(() => {
			expect(within(drawer).getByRole('button', { name: 'Delete' })).toBeEnabled();
		});
		await fireEvent.click(within(drawer).getByRole('button', { name: 'Delete' }));

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
		expect(within(drawer).getByText(/Received Proposal/)).toBeTruthy();
		expect(within(drawer).getByText('$125')).toBeTruthy();
		expect(within(drawer).getByText(/Scope of work/i)).toBeTruthy();
		expect(within(drawer).getByText(/Migration plus redirect validation\./)).toBeTruthy();
		expect(within(drawer).getByText(/Your Inquiry/)).toBeTruthy();
		expect(within(drawer).getAllByText(/Need a migration/).length).toBeGreaterThan(0);
		await waitFor(() => {
			expect(findServiceByUniqueId).toHaveBeenCalledWith('service-unique-id');
			expect(within(dialog).getByText(/Managed Migration Service/)).toBeTruthy();
			expect(queryByText('Loading service details...')).toBeNull();
			expect(within(drawer).getByRole('button', { name: 'Accept' })).toBeEnabled();
			expect(within(drawer).getByRole('button', { name: 'Decline' })).toBeEnabled();
			expect(within(drawer).getByRole('button', { name: 'Delete' })).toBeEnabled();
		});
	});

	it('opens the acceptance drawer from the card accept action', async () => {
		const { getByRole, getByTestId, queryByText } = render(MyQuotesPanel, {
			timelines: [timeline],
			focusedRequestId: 'qr_valid123',
			isSyncing: false
		});

		await waitFor(() => {
			expect(getByRole('button', { name: 'Accept' })).toBeEnabled();
		});
		await fireEvent.click(getByRole('button', { name: 'Accept' }));

		const acceptanceDrawer = getByTestId('service-request-acceptance-drawer');
		const normalizedSchedule = normalizeServiceContractSchedule(1_700_000_000, 1_700_259_200);
		expect(acceptanceDrawer).toBeTruthy();
		expect(queryByText('Confirm Accept')).toBeNull();

		await waitFor(() => {
			expect(mockInitializeWallet).toHaveBeenCalledTimes(1);
			expect(mockLoadAssets).toHaveBeenCalledTimes(1);
			expect(mockGetCurrentPrice).toHaveBeenCalledWith('BTC');
			expect(mockPreflightServiceContractCreation).toHaveBeenCalledWith(
				{
					freelancerAddress: '0x1111111111111111111111111111111111111111',
					freelancerPubkey: 'f'.repeat(64),
					amountUsdt: '125.00',
					estimatedStartTime: normalizedSchedule.estimatedStartTime,
					estimatedCompletionTime: normalizedSchedule.estimatedCompletionTime,
					freelancerFeeTier: 1
				},
				50_000
			);
		});

		expect(within(acceptanceDrawer).getByTestId('contract-funding-wallet-card')).toBeTruthy();
		expect(within(acceptanceDrawer).getByText('Wallet balance')).toBeTruthy();
		expect(within(acceptanceDrawer).getByText('Available balance')).toBeTruthy();
		expect(within(acceptanceDrawer).getByText('Required for this contract')).toBeTruthy();
		expect(
			within(acceptanceDrawer).getByText('Your available balance covers this service contract.')
		).toBeTruthy();
		expect(
			within(acceptanceDrawer).getByText(
				'The quoted start time has already passed. The contract will use a start time about one hour from now and keep the quoted duration.'
			)
		).toBeTruthy();

		await fireEvent.click(getByRole('button', { name: 'Accept Proposal' }));

		expect(acceptTaskerProposal).toHaveBeenCalledWith({
			quoteRequestId: 'qr_valid123',
			proposalId: 'pr_valid123'
		});
	});

	it('prevents duplicate accept submissions and switches into contract progress after success', async () => {
		const deferredAccept = createDeferred<{ success: boolean; transactionHash: string }>();
		acceptTaskerProposal.mockImplementationOnce(() => deferredAccept.promise);

		const { getByRole, getByTestId, queryByRole } = render(MyQuotesPanel, {
			timelines: [timeline],
			focusedRequestId: 'qr_valid123',
			isSyncing: false
		});

		await waitFor(() => {
			expect(getByRole('button', { name: 'Accept' })).toBeEnabled();
		});
		await fireEvent.click(getByRole('button', { name: 'Accept' }));
		const confirmButton = getByRole('button', {
			name: 'Accept Proposal'
		}) as HTMLButtonElement;
		await fireEvent.click(confirmButton);

		await waitFor(() => expect(confirmButton).toBeDisabled());
		expect(acceptTaskerProposal).toHaveBeenCalledTimes(1);

		await fireEvent.click(confirmButton);
		expect(acceptTaskerProposal).toHaveBeenCalledTimes(1);

		deferredAccept.resolve({ success: true, transactionHash: '0xservicehash' });

		await waitFor(() => {
			expect(getByTestId('service-request-acceptance-contract-progress')).toBeTruthy();
		});
		expect(queryByRole('button', { name: 'Accept Proposal' })).toBeNull();
		expect(getByTestId('service-request-acceptance-contract-status')).toBeTruthy();
	});

	it('allows closing acceptance progress and completes in the background with a toast', async () => {
		acceptTaskerProposal.mockResolvedValueOnce({
			success: true,
			transactionHash: '0xservicehash'
		});

		const { getByRole, queryByTestId, rerender } = render(MyQuotesPanel, {
			timelines: [timeline],
			focusedRequestId: 'qr_valid123',
			isSyncing: false
		});

		await waitFor(() => {
			expect(getByRole('button', { name: 'Accept' })).toBeEnabled();
		});
		await fireEvent.click(getByRole('button', { name: 'Accept' }));
		await fireEvent.click(getByRole('button', { name: 'Accept Proposal' }));

		await waitFor(() => {
			expect(getByRole('heading', { name: 'Creating your secure payment contract' })).toBeTruthy();
		});

		await fireEvent.click(getByRole('button', { name: 'common.components.drawer.close' }));

		await waitFor(() => {
			expect(queryByTestId('service-request-acceptance-drawer')).toBeNull();
		});

		await rerender({
			timelines: [
				createTimeline({
					requestId: 'qr_valid123',
					resolvedStatus: 'accepted',
					linkedEscrowId: 'escrow_456'
				})
			],
			focusedRequestId: 'qr_valid123',
			isSyncing: false
		});

		await waitFor(() => {
			expect(showSuccessToast).toHaveBeenCalledWith(
				'Proposal accepted. Your service contract is ready in Contracts.'
			);
		});
		expect(goto).not.toHaveBeenCalled();
	});

	it('opens the contract without racing the request-clear navigation when acceptance finishes in-place', async () => {
		acceptTaskerProposal.mockResolvedValueOnce({
			success: true,
			transactionHash: '0xservicehash'
		});
		const onRequestClear = vi.fn().mockResolvedValue(undefined);

		const { getByRole, rerender } = render(MyQuotesPanel, {
			timelines: [timeline],
			focusedRequestId: 'qr_valid123',
			isSyncing: false,
			onRequestClear
		});

		await waitFor(() => {
			expect(getByRole('button', { name: 'Accept' })).toBeEnabled();
		});
		await fireEvent.click(getByRole('button', { name: 'Accept' }));
		await fireEvent.click(getByRole('button', { name: 'Accept Proposal' }));

		await waitFor(() => {
			expect(getByRole('heading', { name: 'Creating your secure payment contract' })).toBeTruthy();
		});

		await rerender({
			timelines: [
				createTimeline({
					requestId: 'qr_valid123',
					resolvedStatus: 'accepted',
					linkedEscrowId: 'escrow_789'
				})
			],
			focusedRequestId: 'qr_valid123',
			isSyncing: false
		});

		await waitFor(() => {
			expect(showSuccessToast).toHaveBeenCalledWith(
				'Proposal accepted. Opening your service contract.'
			);
		});
		expect(goto).toHaveBeenCalledTimes(1);
		expect(onRequestClear).not.toHaveBeenCalled();
	});

	it('keeps the acceptance progress drawer mounted during a partial timeline refresh', async () => {
		acceptTaskerProposal.mockResolvedValueOnce({
			success: true,
			transactionHash: '0xservicehash'
		});

		const { getByRole, getByTestId, rerender } = render(MyQuotesPanel, {
			timelines: [timeline],
			focusedRequestId: 'qr_valid123',
			isSyncing: false
		});

		await waitFor(() => {
			expect(getByRole('button', { name: 'Accept' })).toBeEnabled();
		});
		await fireEvent.click(getByRole('button', { name: 'Accept' }));
		await fireEvent.click(getByRole('button', { name: 'Accept Proposal' }));

		await waitFor(() => {
			expect(getByTestId('service-request-acceptance-contract-progress')).toBeTruthy();
		});

		await rerender({
			timelines: [],
			focusedRequestId: 'qr_valid123',
			isSyncing: true
		});

		expect(getByTestId('service-request-acceptance-drawer')).toBeTruthy();
		expect(getByTestId('service-request-acceptance-contract-progress')).toBeTruthy();
	});

	it('opens an acceptance drawer before accepting a proposal', async () => {
		const { getByRole, getByTestId, getByText, queryByText } = render(MyQuotesPanel, {
			timelines: [timeline],
			focusedRequestId: 'qr_valid123',
			isSyncing: false
		});

		await fireEvent.click(getByRole('button', { name: 'View' }));
		const drawer = getByTestId('service-request-drawer');
		await waitFor(() => {
			expect(within(drawer).getByRole('button', { name: 'Accept' })).toBeEnabled();
		});
		await fireEvent.click(within(drawer).getByRole('button', { name: 'Accept' }));

		const acceptanceDrawer = getByTestId('service-request-acceptance-drawer');
		expect(acceptanceDrawer).toBeTruthy();
		expect(queryByText('Your Inquiry')).toBeNull();
		expect(within(acceptanceDrawer).getByText('Managed Migration Service')).toBeTruthy();
		expect(within(acceptanceDrawer).getByText('Base Amount')).toBeTruthy();
		expect(within(acceptanceDrawer).getByText('$125.00')).toBeTruthy();
		expect(within(acceptanceDrawer).getByText('Total payment')).toBeTruthy();
		expect(within(acceptanceDrawer).getByText('$128.63')).toBeTruthy();
		expect(within(acceptanceDrawer).getByText('Proposal expires')).toBeTruthy();
		expect(within(acceptanceDrawer).getByText('Included scope')).toBeTruthy();
		await waitFor(() => {
			expect(within(acceptanceDrawer).getByTestId('contract-funding-wallet-card')).toBeTruthy();
		});
		expect(
			within(acceptanceDrawer).getByText(
				'The quoted start time has already passed. The contract will use a start time about one hour from now and keep the quoted duration.'
			)
		).toBeTruthy();
		expect(
			getByText(
				'Accepting this proposal will create a service contract using the received quote details.'
			)
		).toBeTruthy();

		await fireEvent.click(getByRole('button', { name: 'Accept Proposal' }));

		expect(acceptTaskerProposal).toHaveBeenCalledWith({
			quoteRequestId: 'qr_valid123',
			proposalId: 'pr_valid123'
		});
	});

	it('requires confirmation before declining a proposal from the drawer', async () => {
		const { getByRole, getByText, getByTestId } = render(MyQuotesPanel, {
			timelines: [timeline],
			focusedRequestId: 'qr_valid123',
			isSyncing: false
		});

		await fireEvent.click(getByRole('button', { name: 'View' }));
		const drawer = getByTestId('service-request-drawer');
		await waitFor(() => {
			expect(within(drawer).getByRole('button', { name: 'Decline' })).toBeEnabled();
		});
		await fireEvent.click(within(drawer).getByRole('button', { name: 'Decline' }));

		expect(getByText('Decline proposal')).toBeTruthy();
		expect(getByText('This will mark the current proposal as declined.')).toBeTruthy();

		await fireEvent.click(getByRole('button', { name: 'Confirm Decline' }));

		expect(applyTaskerStatus).toHaveBeenCalledWith({
			quoteRequestId: 'qr_valid123',
			proposalId: 'pr_valid123',
			status: 'declined'
		});
	});

	it('rebinds decline confirmation to the latest proposal after timeline refresh', async () => {
		const { getAllByRole, getByRole, rerender } = render(MyQuotesPanel, {
			timelines: [timeline],
			focusedRequestId: 'qr_valid123',
			isSyncing: false
		});

		await waitFor(() => {
			expect(getAllByRole('button', { name: 'Decline' })[0]).toBeEnabled();
		});
		await fireEvent.click(getAllByRole('button', { name: 'Decline' })[0]);
		expect(getByRole('button', { name: 'Confirm Decline' })).toBeTruthy();

		const refreshedTimeline = createTimeline({
			requestId: 'qr_valid123',
			latestProposal: {
				...timeline.latestProposal!,
				id: 'proposal-event-2',
				content: {
					...timeline.latestProposal!.content,
					proposalId: 'pr_valid456',
					quoteRequestId: 'qr_valid123'
				}
			},
			proposals: [
				{
					...timeline.proposals[0],
					id: 'proposal-event-2',
					content: {
						...timeline.proposals[0].content,
						proposalId: 'pr_valid456',
						quoteRequestId: 'qr_valid123'
					}
				}
			]
		});

		await rerender({
			timelines: [refreshedTimeline],
			focusedRequestId: 'qr_valid123',
			isSyncing: false
		});
		await fireEvent.click(getByRole('button', { name: 'Confirm Decline' }));

		expect(applyTaskerStatus).toHaveBeenCalledWith({
			quoteRequestId: 'qr_valid123',
			proposalId: 'pr_valid456',
			status: 'declined'
		});
	});

	it('locks other request actions while a decline is submitting', async () => {
		const deferredDecline = createDeferred<{ success: boolean }>();
		applyTaskerStatus.mockReturnValueOnce(deferredDecline.promise);

		const firstTimeline = createTimeline({
			requestId: 'qr_first',
			title: 'First request'
		});
		const secondTimeline = createTimeline({
			requestId: 'qr_second',
			title: 'Second request'
		});

		const { getAllByRole, getByRole, getByText } = render(MyQuotesPanel, {
			timelines: [firstTimeline, secondTimeline],
			focusedRequestId: 'qr_first',
			isSyncing: false
		});

		await waitFor(() => {
			expect(getAllByRole('button', { name: 'Decline' })[0]).toBeEnabled();
		});
		await fireEvent.click(getAllByRole('button', { name: 'Decline' })[0]);
		await fireEvent.click(getByRole('button', { name: 'Confirm Decline' }));

		const secondCard = getByText('Second request').closest('.card');
		expect(secondCard).toBeTruthy();
		expect(within(secondCard!).getByRole('button', { name: 'Accept' })).toBeDisabled();
		expect(within(secondCard!).getByRole('button', { name: 'Decline' })).toBeDisabled();
		expect(within(secondCard!).getByRole('button', { name: 'View' })).toBeDisabled();

		deferredDecline.resolve({ success: true });
		await waitFor(() => {
			expect(applyTaskerStatus).toHaveBeenCalledWith({
				quoteRequestId: 'qr_first',
				proposalId: 'pr_qr_first',
				status: 'declined'
			});
		});
	});

	it('keeps request actions disabled while service availability is still loading', async () => {
		const pendingLookup = createDeferred<{
			id: string;
			uniqueId: string;
			title: string;
		} | null>();
		findServiceByUniqueId.mockReturnValueOnce(pendingLookup.promise);

		const { getByRole } = render(MyQuotesPanel, {
			timelines: [timeline],
			focusedRequestId: 'qr_valid123',
			isSyncing: false
		});

		await waitFor(() => {
			expect(findServiceByUniqueId).toHaveBeenCalledWith('service-unique-id');
		});
		expect(getByRole('button', { name: 'Accept' })).toBeDisabled();
		expect(getByRole('button', { name: 'Decline' })).toBeDisabled();

		pendingLookup.resolve({
			id: 'service-event-1',
			uniqueId: 'service-unique-id',
			title: 'Managed Migration Service'
		});
	});

	it('does not re-trigger the service lookup effect after hydrating lookup state', async () => {
		const pendingLookup = createDeferred<{
			id: string;
			uniqueId: string;
			title: string;
		} | null>();
		findServiceByUniqueId.mockReturnValueOnce(pendingLookup.promise);

		render(MyQuotesPanel, {
			timelines: [timeline],
			focusedRequestId: 'qr_valid123',
			isSyncing: false
		});

		await waitFor(() => {
			expect(findServiceByUniqueId).toHaveBeenCalledTimes(1);
		});

		pendingLookup.resolve({
			id: 'service-event-1',
			uniqueId: 'service-unique-id',
			title: 'Managed Migration Service'
		});

		await waitFor(() => {
			expect(findServiceByUniqueId).toHaveBeenCalledTimes(1);
		});
	});

	it('shows preflight recovery copy and blocks acceptance when wallet verification fails', async () => {
		mockPreflightServiceContractCreation.mockResolvedValueOnce({
			ok: false,
			errorCode: 'wallet_not_connected',
			error: 'Connect your wallet before continuing.'
		});

		const { getByRole, getByTestId } = render(MyQuotesPanel, {
			timelines: [timeline],
			focusedRequestId: 'qr_valid123',
			isSyncing: false
		});

		await waitFor(() => {
			expect(getByRole('button', { name: 'Accept' })).toBeEnabled();
		});
		await fireEvent.click(getByRole('button', { name: 'Accept' }));

		const acceptanceDrawer = await waitFor(() => getByTestId('service-request-acceptance-drawer'));
		await waitFor(() => {
			expect(
				within(acceptanceDrawer).getByTestId('contract-funding-wallet-message')
			).toHaveTextContent('Connect your wallet before continuing.');
			expect(getByTestId('contract-initiation-error-hint')).toHaveTextContent(
				'Connect your wallet, then retry the contract creation.'
			);
		});
		expect(getByRole('button', { name: 'Accept Proposal' })).toBeDisabled();
		expect(acceptTaskerProposal).not.toHaveBeenCalled();
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

		// For accepted quotes with escrow, the card should not expose drawer-only actions
		expect(queryByText('Accept')).toBeNull();
		expect(queryByText('Delete')).toBeNull();
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

	it('keeps expired proposals read-only in the request drawer', async () => {
		const expiredTimeline = createTimeline({
			requestId: 'qr_expired_readonly',
			title: 'Expired proposal request',
			resolvedStatus: 'expired',
			isExpired: true
		});

		const { getByRole, getByTestId } = render(MyQuotesPanel, {
			timelines: [expiredTimeline],
			focusedRequestId: 'qr_expired_readonly',
			isSyncing: false
		});

		await fireEvent.click(getByRole('button', { name: 'View' }));

		const drawer = getByTestId('service-request-drawer');
		expect(within(drawer).getByText('Expired proposal request')).toBeTruthy();
		expect(within(drawer).queryByRole('button', { name: 'Accept' })).toBeNull();
		expect(within(drawer).queryByRole('button', { name: 'Decline' })).toBeNull();
	});

	it('warns when service details cannot be refreshed and keeps actions read-only', async () => {
		findServiceByUniqueId.mockRejectedValue(new Error('relay timeout'));

		const { getByRole, getByTestId, queryByText } = render(MyQuotesPanel, {
			timelines: [timeline],
			focusedRequestId: 'qr_valid123',
			isSyncing: false
		});

		await waitFor(() => {
			expect(getByTestId('my-quotes-service-lookup-alert')).toBeTruthy();
			expect(queryByText('Accept')).toBeNull();
			expect(queryByText('Decline')).toBeNull();
		});

		await fireEvent.click(getByRole('button', { name: 'View' }));
		await waitFor(() => {
			expect(getByTestId('service-request-drawer')).toHaveTextContent(
				'Some service details could not be refreshed.'
			);
		});
	});

	it('exposes the mobile status filter with listbox semantics and expanded state', async () => {
		const { getAllByRole, getByRole } = render(MyQuotesPanel, {
			timelines: [timeline],
			focusedRequestId: 'qr_valid123',
			isSyncing: false
		});

		const filterTrigger = getAllByRole('button', { name: 'Proposal received' })[0];
		expect(filterTrigger.getAttribute('aria-haspopup')).toBe('listbox');
		expect(filterTrigger.getAttribute('aria-expanded')).toBe('false');

		await fireEvent.click(filterTrigger);

		expect(filterTrigger.getAttribute('aria-expanded')).toBe('true');
		expect(
			getByRole('listbox', {
				name: 'Filter by request status'
			})
		).toBeTruthy();
	});

	it('moves focus through the mobile status filter with keyboard controls', async () => {
		const { getAllByRole, getByRole } = render(MyQuotesPanel, {
			timelines: [timeline],
			focusedRequestId: 'qr_valid123',
			isSyncing: false
		});

		const filterTrigger = getAllByRole('button', { name: 'Proposal received' })[0];
		filterTrigger.focus();

		await fireEvent.keyDown(filterTrigger, { key: ' ' });

		const listbox = getByRole('listbox', { name: 'Filter by request status' });
		const options = within(listbox).getAllByRole('option');
		await waitFor(() => expect(options[0]).toHaveFocus());

		await fireEvent.keyDown(options[0], { key: 'ArrowDown' });
		await waitFor(() => expect(options[1]).toHaveFocus());

		await fireEvent.keyDown(options[1], { key: 'Escape' });
		await waitFor(() => expect(filterTrigger).toHaveFocus());
		expect(filterTrigger.getAttribute('aria-expanded')).toBe('false');
	});

	it('closes the mobile status filter when clicking outside', async () => {
		const { getAllByRole, getByRole, queryByRole } = render(MyQuotesPanel, {
			timelines: [timeline],
			focusedRequestId: 'qr_valid123',
			isSyncing: false
		});

		const filterTrigger = getAllByRole('button', { name: 'Proposal received' })[0];
		await fireEvent.click(filterTrigger);
		expect(getByRole('listbox', { name: 'Filter by request status' })).toBeTruthy();

		await fireEvent.click(document.body);

		await waitFor(() => {
			expect(queryByRole('listbox', { name: 'Filter by request status' })).toBeNull();
		});
	});

	it('updates the mobile filter active state after selecting a different status', async () => {
		const { getAllByRole, getByRole, queryByRole } = render(MyQuotesPanel, {
			timelines: [timeline],
			focusedRequestId: 'qr_valid123',
			isSyncing: false
		});

		const filterTrigger = getAllByRole('button', { name: 'Proposal received' })[0];
		await fireEvent.click(filterTrigger);

		const declinedOption = getByRole('option', { name: 'Declined' });
		expect(declinedOption.getAttribute('aria-selected')).toBe('false');

		await fireEvent.click(declinedOption);

		expect(queryByRole('listbox', { name: 'Filter by request status' })).toBeNull();
		expect(getAllByRole('button', { name: 'Declined' })[0]?.getAttribute('aria-expanded')).toBe(
			'false'
		);
	});

	it('exposes the active desktop status filter via aria-pressed', async () => {
		const { getAllByRole } = render(MyQuotesPanel, {
			timelines: [timeline],
			focusedRequestId: 'qr_valid123',
			isSyncing: false
		});

		const desktopProposalReceivedFilter = getAllByRole('button', {
			name: 'Proposal received'
		}).at(-1);
		expect(desktopProposalReceivedFilter?.getAttribute('aria-pressed')).toBe('true');
	});

	it('hides delete for requests with acceptance in progress or ambiguous acceptance', () => {
		const acceptingTimeline = createTimeline({
			requestId: 'qr_accepting',
			title: 'Accepting request',
			resolvedStatus: 'accepting'
		});
		const ambiguousTimeline = createTimeline({
			requestId: 'qr_unknown',
			title: 'Unknown request',
			resolvedStatus: 'accept_unknown'
		});

		const { queryAllByRole } = render(MyQuotesPanel, {
			timelines: [acceptingTimeline, ambiguousTimeline],
			focusedRequestId: 'qr_accepting',
			isSyncing: false
		});

		expect(queryAllByRole('button', { name: 'Delete' })).toHaveLength(0);
	});

	it('disables other request-card actions while an acceptance mutation is in flight', async () => {
		const deferredAccept = createDeferred<{ success: boolean; transactionHash: string }>();
		acceptTaskerProposal.mockImplementationOnce(() => deferredAccept.promise);

		const secondTimeline = createTimeline({
			requestId: 'qr_second_request',
			title: 'Second request'
		});

		const { getAllByRole, getByRole } = render(MyQuotesPanel, {
			timelines: [timeline, secondTimeline],
			focusedRequestId: 'qr_valid123',
			isSyncing: false
		});

		await waitFor(() => {
			expect(getAllByRole('button', { name: 'Accept' })[0]).toBeEnabled();
		});
		await fireEvent.click(getAllByRole('button', { name: 'Accept' })[0]);
		await fireEvent.click(getByRole('button', { name: 'Accept Proposal' }));

		await waitFor(() => {
			const viewButtons = getAllByRole('button', { name: 'View' }) as HTMLButtonElement[];
			expect(viewButtons.every((button) => button.disabled)).toBe(true);
		});

		deferredAccept.resolve({ success: true, transactionHash: '0xservicehash' });

		await waitFor(() => {
			const viewButtons = getAllByRole('button', { name: 'View' }) as HTMLButtonElement[];
			expect(viewButtons.some((button) => !button.disabled)).toBe(true);
		});
	});

	it('ships the service request translations needed by the Hiring page flow in English and Spanish', () => {
		const requiredPaths = [
			'dashboard.service_requests.confirm.decline_title',
			'dashboard.service_requests.confirm.decline_message',
			'dashboard.service_requests.confirm.decline_confirm',
			'dashboard.service_requests.errors.accept',
			'dashboard.service_requests.errors.decline',
			'dashboard.service_requests.errors.delete',
			'dashboard.service_requests.accept_drawer.title',
			'dashboard.service_requests.accept_drawer.confirm',
			'dashboard.service_requests.accept_drawer.expires',
			'dashboard.service_requests.accept_drawer.warning',
			'dashboard.service_requests.accept_drawer.start_time_adjusted_warning',
			'dashboard.service_requests.accept_drawer.prepare_error',
			'dashboard.service_requests.messages.acceptance_complete',
			'dashboard.service_requests.messages.acceptance_complete_background',
			'dashboard.service_requests.drawer.proposal_title',
			'dashboard.service_requests.drawer.proposal_start',
			'dashboard.service_requests.drawer.proposal_end',
			'dashboard.service_requests.drawer.scope_of_work',
			'dashboard.service_requests.drawer.cover_letter',
			'dashboard.service_requests.filters.all',
			'dashboard.service_requests.filters.proposal_received',
			'dashboard.service_requests.filters.needs_attention',
			'dashboard.service_requests.alerts.service_lookup_failed'
		];

		for (const locale of ['en', 'es'] as const) {
			const localeJson = readDashboardLocale(locale);

			for (const path of requiredPaths) {
				expect(getNestedValue(localeJson, path)).toEqual(expect.any(String));
			}
		}
	});
});
