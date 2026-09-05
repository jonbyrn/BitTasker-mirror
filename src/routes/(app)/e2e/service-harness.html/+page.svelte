<script lang="ts">
	import { onMount, tick } from 'svelte';
	import type { Component } from 'svelte';
	import type { Service } from '$lib/types/service.d';
	import type { ContractWithEvents } from '$lib/types/contract';
	import type { ServiceQuoteTimelineEntry } from '$lib/types/service-quote';
	import { ServicePricingTypeEnum } from '$lib/utils/enums/service.enum';
	import { ContractStatus } from '$lib/utils/contract/types';

	type HarnessResult = Record<string, unknown>;

	let output = $state('');
	let error = $state<string | null>(null);
	let ready = $state(false);
	let surfaceComponent = $state<Component<Record<string, unknown>> | null>(null);
	let surfaceProps = $state<Record<string, unknown>>({});
	let requestsHarnessState = $state<{
		services: Service[];
		timelinesByService: Record<string, ServiceQuoteTimelineEntry[]>;
		selectedServiceAddress: string | null;
		focusedRequestId: string | null;
		partialFailure: boolean;
		loadedServiceAddress: string;
	} | null>(null);

	function createStorageMock() {
		const values: Record<string, string> = {};
		return {
			getItem: (key: string) => values[key] ?? null,
			setItem: (key: string, value: string) => {
				values[key] = value;
			},
			removeItem: (key: string) => {
				delete values[key];
			}
		};
	}

	function createHarnessServiceContract(
		overrides: Omit<Partial<ContractWithEvents>, 'permissions' | 'contractEvent'> & {
			permissions?: Partial<ContractWithEvents['permissions']>;
			contractEvent?: Partial<ContractWithEvents['contractEvent']>;
			content?: Partial<ContractWithEvents['contractEvent']['content']>;
		} = {}
	): ContractWithEvents {
		const baseContract = {
			escrowData: {
				id: 'svc-escrow_123',
				status: ContractStatus.Funded
			} as unknown as ContractWithEvents['escrowData'],
			status: ContractStatus.Funded,
			isClient: true,
			isPending: false,
			blockchainStatus: ContractStatus.Funded,
			statusEvents: [],
			completionAttachments: [],
			completionText: null,
			disputeProposal: null,
			permissions: {
				canComplete: false,
				canAccept: true,
				canDispute: false,
				canPropose: false,
				canAcceptProposal: false,
				canCancel: false,
				canResolveTimelock: false,
				canDelete: false
			},
			contractEvent: {
				id: 'service-contract-event-1',
				kind: 3000,
				pubkey: 'f'.repeat(64),
				created_at: 1_700_000_000,
				tags: [],
				sig: '',
				content: {
					escrowId: 'svc-escrow_123',
					contextType: 'service',
					contextTitle: 'Premium Logo Package',
					contextDescription: 'Logo system and brand guide',
					clientPubkey: 'c'.repeat(64),
					freelancerPubkey: 'd'.repeat(64),
					taskTitle: 'Premium Logo Package',
					taskDescription: 'Logo system and brand guide',
					amount: '0.01',
					purchaseMode: 'quote',
					quoteRequestId: 'qr_valid123',
					proposalId: 'proposal_valid123',
					selectedTierId: 'Tier 1',
					estimatedStartTime: 1_700_086_400,
					estimatedCompletionTime: 1_700_345_600,
					agreementSnapshot: {
						deliverables: 'Logo system and brand guide',
						priceSnapshotLabel: '$250.00',
						selectedAddOns: ['Source files'],
						inquiryAnswers: {
							Industry: 'Fintech'
						}
					},
					pricingSnapshot: {
						serviceVersionRef: 'service-event-1'
					},
					status: ContractStatus.Funded,
					type: 'contract',
					currency: 'RBTC'
				}
			} as unknown as ContractWithEvents['contractEvent']
		} satisfies Omit<ContractWithEvents, 'contractEvent' | 'escrowData'> & {
			contractEvent: ContractWithEvents['contractEvent'];
			escrowData: ContractWithEvents['escrowData'];
		};

		return {
			...baseContract,
			...overrides,
			permissions: {
				...baseContract.permissions,
				...(overrides.permissions ?? {})
			},
			contractEvent: {
				...baseContract.contractEvent,
				...(overrides.contractEvent ?? {}),
				content: {
					...baseContract.contractEvent.content,
					...(overrides.contractEvent?.content ?? {}),
					...(overrides.content ?? {})
				}
			}
		} as ContractWithEvents;
	}

	function createHarnessService(overrides: Partial<Service> = {}): Service {
		return {
			id: 'service-event-1',
			npub: 'a'.repeat(64),
			uniqueId: 'service-1234',
			status: 'active',
			title: 'Premium Logo Package',
			description: 'Logo system and brand guide',
			serviceLocationTypes: [],
			pricing: {
				type: ServicePricingTypeEnum.INQUIRY_REQUIRED,
				currency: 'USD'
			},
			skills: [],
			categories: [],
			createdAt: 1_700_000_000,
			...overrides
		} as Service;
	}

	type HarnessQuoteTimelineOptions = {
		requestId?: string;
		requestEventId?: string;
		inquiryTitle?: string;
		inquiryDescription?: string;
		requestTitle?: string;
		requestDescription?: string;
		createdAt?: number;
		withProposal?: boolean;
	};

	function createHarnessQuoteTimeline(
		service: Service,
		options: HarnessQuoteTimelineOptions = {}
	): ServiceQuoteTimelineEntry {
		const serviceAddress = `30402:${service.npub}:${service.uniqueId ?? service.id}`;
		const requestId = options.requestId ?? 'qr_valid123';
		const requestEventId = options.requestEventId ?? `request-event-${requestId}`;
		const inquiryTitle = options.inquiryTitle ?? options.requestTitle ?? 'Need a brand refresh';
		const createdAt = options.createdAt ?? 1_700_000_000;
		const proposalEvent = options.withProposal
			? {
					id: `proposal-${requestEventId}`,
					kind: 6421 as const,
					pubkey: service.npub,
					created_at: createdAt + 60,
					tags: [
						['e', requestEventId],
						['p', 'b'.repeat(64)]
					],
					content: {
						type: 'service-proposal' as const,
						proposalId: `pr_${requestId}`,
						quoteRequestId: requestId,
						serviceId: serviceAddress,
						serviceAddress,
						paymentType: 'FIXED' as const,
						amountUsdt: '225.00',
						description: `${inquiryTitle} proposal`,
						estimatedDuration: '4 days',
						estimatedStartTime: createdAt,
						estimatedEndTime: createdAt + 259_200,
						expirationDays: 5,
						expirationHours: 0,
						expirationTimestamp: createdAt + 300_000,
						freelancerFeeTier: 1 as const,
						pricingSnapshot: {
							serviceVersionRef: service.id
						},
						timestamp: createdAt + 60,
						version: 'v1' as const
					},
					sig: ''
				}
			: undefined;

		return {
			request: {
				id: requestEventId,
				kind: 6420,
				pubkey: 'b'.repeat(64),
				created_at: createdAt,
				tags: [],
				content: {
					type: 'service-quote-request',
					quoteRequestId: requestId,
					serviceId: serviceAddress,
					serviceAddress,
					pricingType: ServicePricingTypeEnum.INQUIRY_REQUIRED,
					tierId: 'premium',
					selectedAddOns: [],
					rushDelivery: false,
					inquiry: {
						title: inquiryTitle,
						description:
							options.inquiryDescription ?? options.requestDescription ?? `${inquiryTitle} details.`
					},
					timestamp: createdAt,
					version: 'v1'
				},
				sig: ''
			},
			proposals: proposalEvent ? [proposalEvent] : [],
			statusEventsByProposalId: {},
			latestProposal: proposalEvent,
			resolvedStatus: 'pending',
			resolvedTerminalEvent: undefined,
			expirationTimestamp: proposalEvent?.content.expirationTimestamp,
			isExpired: false,
			linkedEscrowId: undefined
		};
	}

	function buildRequestsHarnessStateSnapshot() {
		if (!requestsHarnessState) {
			return '';
		}

		const visibleTimelines = requestsHarnessState.selectedServiceAddress
			? (requestsHarnessState.timelinesByService[requestsHarnessState.selectedServiceAddress] ?? [])
			: requestsHarnessState.partialFailure
				? (requestsHarnessState.timelinesByService[requestsHarnessState.loadedServiceAddress] ?? [])
				: Object.values(requestsHarnessState.timelinesByService).flat();

		return JSON.stringify({
			selectedServiceAddress: requestsHarnessState.selectedServiceAddress,
			focusedRequestId: requestsHarnessState.focusedRequestId,
			loadError: requestsHarnessState.partialFailure ? 'provider query failed' : null,
			visibleRequestIds: visibleTimelines.map((timeline) => timeline.request.content.quoteRequestId)
		});
	}

	function syncRequestsHarnessSurface() {
		const harnessState = requestsHarnessState;
		if (!harnessState || !surfaceComponent) {
			return;
		}

		const serviceTitleByAddress = Object.fromEntries(
			harnessState.services.map((service) => [
				`30402:${service.npub}:${service.uniqueId ?? service.id}`,
				service.title
			])
		);
		const visibleTimelines = harnessState.selectedServiceAddress
			? (harnessState.timelinesByService[harnessState.selectedServiceAddress] ?? [])
			: harnessState.partialFailure
				? (harnessState.timelinesByService[harnessState.loadedServiceAddress] ?? [])
				: Object.values(harnessState.timelinesByService).flat();

		surfaceProps = {
			service:
				harnessState.services.find(
					(entry) =>
						`30402:${entry.npub}:${entry.uniqueId ?? entry.id}` ===
						harnessState.selectedServiceAddress
				) ?? null,
			services: harnessState.services,
			selectedServiceAddress: harnessState.selectedServiceAddress,
			showServiceTitles: harnessState.selectedServiceAddress === null,
			serviceTitleByAddress,
			timelines: visibleTimelines,
			focusedRequestId: harnessState.focusedRequestId,
			isSyncing: false,
			hasLoaded: true,
			loadError: harnessState.partialFailure ? 'provider query failed' : null,
			walletReady: true,
			feeTierReady: true,
			totalPendingRequestCount: visibleTimelines.filter(
				(timeline) => timeline.resolvedStatus === 'pending' && !timeline.latestProposal
			).length,
			onServiceFilterChange: (serviceAddress: string | null) => {
				requestsHarnessState = {
					...harnessState,
					selectedServiceAddress: serviceAddress,
					partialFailure: false
				};
				syncRequestsHarnessSurface();
			},
			onRequestFocusChange: (requestId: string | null) => {
				requestsHarnessState = {
					...harnessState,
					focusedRequestId: requestId
				};
				syncRequestsHarnessSurface();
			},
			onRequestClear: () => {
				requestsHarnessState = {
					...harnessState,
					focusedRequestId: null
				};
				syncRequestsHarnessSurface();
			},
			onSendProposal: async () => ({ success: true }),
			onDeleteProposal: async () => ({ success: true })
		};
	}

	function activateRequestsHarnessPartialFailure() {
		if (!requestsHarnessState) {
			return;
		}

		requestsHarnessState = {
			...requestsHarnessState,
			selectedServiceAddress: null,
			partialFailure: true,
			focusedRequestId: null
		};
		syncRequestsHarnessSurface();
	}

	async function waitForSurfaceReady(
		predicate: () => boolean,
		timeoutMs = 4_000
	): Promise<boolean> {
		const deadline = Date.now() + timeoutMs;

		while (Date.now() < deadline) {
			await tick();
			await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
			if (predicate()) {
				return true;
			}
			await new Promise((resolve) => setTimeout(resolve, 25));
		}

		return false;
	}

	onMount(async () => {
		const scenario = new URL(window.location.href).searchParams.get('case') ?? 'tasker-quotes';

		try {
			let result: HarnessResult;

			switch (scenario) {
				case 'tasker-quotes': {
					const { emptyDashboardRouteContext, parseServiceQuoteDashboardQuery } =
						await import('$lib/utils/service-quote/dashboard-route');
					const parsed = parseServiceQuoteDashboardQuery(
						new URLSearchParams('tab=service-requests&view=default&request=bad!'),
						emptyDashboardRouteContext
					);
					result = {
						state: parsed.state,
						search: parsed.searchParams.toString(),
						changed: parsed.changed,
						messageCode: parsed.messageCode
					};
					break;
				}
				case 'tasker-expired-reentry': {
					const { buildServiceQuoteReentryUrl } = await import('$lib/utils/service-quote/reentry');
					const nextPath = buildServiceQuoteReentryUrl(`30402:${'a'.repeat(64)}:service-1234`, {
						openRequestQuote: true,
						tierId: 'standard',
						selectedAddOnIds: ['source-files']
					});
					const nextUrl = new URL(`https://bittasker.test${nextPath}`);
					result = {
						pathname: nextUrl.pathname,
						search: nextUrl.searchParams.toString()
					};
					break;
				}
				case 'tasker-quotes-sync-active': {
					const { parseServiceQuoteDashboardQuery } =
						await import('$lib/utils/service-quote/dashboard-route');
					const parsed = parseServiceQuoteDashboardQuery(
						new URLSearchParams('tab=service-requests&view=tasker&request=qr_valid123'),
						{
							taskerTimelines: [],
							providerTimelinesByService: {},
							taskerLoaded: true,
							providerLoadedByService: {},
							focusSync: {
								requestId: 'qr_valid123',
								serviceAddress: null,
								expiresAt: Date.now() + 15_000
							}
						}
					);
					result = {
						state: parsed.state,
						search: parsed.searchParams.toString(),
						changed: parsed.changed,
						messageCode: parsed.messageCode
					};
					break;
				}
				case 'tasker-quotes-sync-expired': {
					const { parseServiceQuoteDashboardQuery } =
						await import('$lib/utils/service-quote/dashboard-route');
					const parsed = parseServiceQuoteDashboardQuery(
						new URLSearchParams('tab=service-requests&view=tasker&request=qr_valid123'),
						{
							taskerTimelines: [],
							providerTimelinesByService: {},
							taskerLoaded: true,
							providerLoadedByService: {},
							focusSync: {
								requestId: 'qr_valid123',
								serviceAddress: null,
								expiresAt: Date.now() - 1
							}
						}
					);
					result = {
						state: parsed.state,
						search: parsed.searchParams.toString(),
						changed: parsed.changed,
						messageCode: parsed.messageCode
					};
					break;
				}
				case 'taskee-quotes': {
					const { emptyDashboardRouteContext, parseServiceQuoteDashboardQuery } =
						await import('$lib/utils/service-quote/dashboard-route');
					const serviceAddress = `30402:${'a'.repeat(64)}:service-1234`;
					const parsed = parseServiceQuoteDashboardQuery(
						new URLSearchParams(
							`tab=my-services&view=quotes&service=${encodeURIComponent(serviceAddress)}&request=bad!`
						),
						emptyDashboardRouteContext
					);
					result = {
						state: parsed.state,
						search: parsed.searchParams.toString(),
						changed: parsed.changed,
						messageCode: parsed.messageCode
					};
					break;
				}
				case 'taskee-quotes-sync-active': {
					const { parseServiceQuoteDashboardQuery } =
						await import('$lib/utils/service-quote/dashboard-route');
					const serviceAddress = `30402:${'a'.repeat(64)}:service-1234`;
					const parsed = parseServiceQuoteDashboardQuery(
						new URLSearchParams(
							`tab=my-services&view=quotes&service=${encodeURIComponent(
								encodeURIComponent(serviceAddress)
							)}&request=qr_valid123`
						),
						{
							taskerTimelines: [],
							providerTimelinesByService: {
								[serviceAddress]: []
							},
							taskerLoaded: false,
							providerLoadedByService: {
								[serviceAddress]: true
							},
							focusSync: {
								requestId: 'qr_valid123',
								serviceAddress,
								expiresAt: Date.now() + 15_000
							}
						}
					);
					result = {
						state: parsed.state,
						search: parsed.searchParams.toString(),
						changed: parsed.changed,
						messageCode: parsed.messageCode
					};
					break;
				}
				case 'tasker-quotes-partial-surface': {
					const { default: MyQuotesPanel } =
						await import('$lib/components/dashboard/quotes/MyQuotesPanel.svelte');

					surfaceComponent = MyQuotesPanel;
					surfaceProps = {
						timelines: [],
						focusedRequestId: 'qr_valid123',
						isSyncing: true,
						hasLoaded: true
					};

					await waitForSurfaceReady(() =>
						Boolean(
							document.querySelector(
								'[data-testid="service-harness-surface"] [data-testid="my-quotes-partial-alert"]'
							)
						)
					);

					result = {
						partialAlertPresent: Boolean(
							document.querySelector(
								'[data-testid="service-harness-surface"] [data-testid="my-quotes-partial-alert"]'
							)
						),
						partialMessagePresent:
							document.body.textContent?.includes(
								'Latest quote thread data is still propagating across relays.'
							) ?? false
					};
					break;
				}
				case 'taskee-quotes-partial-surface': {
					const { default: ServiceQuotesInbox } =
						await import('$lib/components/service/quotes/ServiceQuotesInbox.svelte');

					surfaceComponent = ServiceQuotesInbox;
					surfaceProps = {
						service: {
							id: 'service-event-1',
							uniqueId: 'service-unique-id',
							title: 'Premium Logo Package',
							description: 'Logo system and brand guide',
							status: 'active',
							npub: 'a'.repeat(64),
							serviceLocationTypes: [],
							pricing: {
								type: 'INQUIRY_REQUIRED',
								currency: 'USD'
							},
							skills: [],
							categories: [],
							createdAt: 1_700_000_000
						},
						timelines: [],
						focusedRequestId: 'qr_valid123',
						isSyncing: true,
						hasLoaded: true,
						walletReady: true,
						feeTierReady: true
					};

					await waitForSurfaceReady(() =>
						Boolean(
							document.querySelector(
								'[data-testid="service-harness-surface"] [data-testid="service-quotes-partial-alert"]'
							)
						)
					);

					result = {
						partialAlertPresent: Boolean(
							document.querySelector(
								'[data-testid="service-harness-surface"] [data-testid="service-quotes-partial-alert"]'
							)
						),
						partialMessagePresent:
							document.body.textContent?.includes(
								'Latest request-thread data is still propagating across relays.'
							) ?? false
					};
					break;
				}
				case 'my-services-panel-requests': {
					const { default: DashboardMyServicesPanel } =
						await import('$lib/components/service/DashboardMyServicesPanel.svelte');
					const service = createHarnessService({
						uniqueId: 'service-123',
						title: 'Brand Identity Sprint',
						description: 'Logo, color palette, and social avatar pack.'
					});

					surfaceComponent = DashboardMyServicesPanel;
					surfaceProps = {
						loadMyServices: async () => ({
							services: [service],
							total: 1,
							hasMore: false
						}),
						loadContractsSnapshot: async () => [],
						queryProviderQuoteThreads: async () => [],
						deletePortfolioMedia: async () => undefined
					};

					await waitForSurfaceReady(() =>
						Boolean(
							document
								.querySelector('[data-testid="service-harness-surface"]')
								?.textContent?.includes('Brand Identity Sprint')
						)
					);

					result = {
						mounted: true,
						serviceAddress: `30402:${service.npub}:${service.uniqueId}`
					};
					break;
				}
				case 'my-services-panel-contracts': {
					const { default: DashboardMyServicesPanel } =
						await import('$lib/components/service/DashboardMyServicesPanel.svelte');
					const service = createHarnessService({
						uniqueId: 'service-123',
						title: 'Brand Identity Sprint',
						description: 'Logo, color palette, and social avatar pack.'
					});
					const serviceAddress = `30402:${service.npub}:${service.uniqueId}`;
					const contract = createHarnessServiceContract({
						escrowData: {
							id: 'svc-escrow-live',
							status: ContractStatus.Funded
						} as unknown as ContractWithEvents['escrowData'],
						status: ContractStatus.Funded,
						blockchainStatus: ContractStatus.Funded,
						content: {
							contextId: service.uniqueId,
							serviceId: service.uniqueId,
							serviceAddress,
							serviceTitle: service.title
						}
					});

					surfaceComponent = DashboardMyServicesPanel;
					surfaceProps = {
						loadMyServices: async () => ({
							services: [service],
							total: 1,
							hasMore: false
						}),
						loadContractsSnapshot: async () => [contract],
						queryProviderQuoteThreads: async () => [],
						deletePortfolioMedia: async () => undefined
					};

					await waitForSurfaceReady(() =>
						Boolean(
							Array.from(
								document.querySelectorAll('[data-testid="service-harness-surface"] button')
							).some((button) => button.textContent?.includes('Contracts'))
						)
					);

					result = {
						mounted: true,
						serviceAddress,
						escrowId: 'svc-escrow-live'
					};
					break;
				}
				case 'earning-requests-regression': {
					const { default: ServiceQuotesInbox } =
						await import('$lib/components/service/quotes/ServiceQuotesInbox.svelte');
					const primaryService = createHarnessService();
					const secondaryService = createHarnessService({
						id: 'service-event-2',
						uniqueId: 'service-456',
						title: 'Accessibility Review',
						description: 'Accessibility audit and remediation guidance'
					});
					const primaryServiceAddress = `30402:${primaryService.npub}:${
						primaryService.uniqueId ?? primaryService.id
					}`;
					const secondaryServiceAddress = `30402:${secondaryService.npub}:${
						secondaryService.uniqueId ?? secondaryService.id
					}`;

					requestsHarnessState = {
						services: [primaryService, secondaryService],
						timelinesByService: {
							[primaryServiceAddress]: [
								createHarnessQuoteTimeline(primaryService, {
									requestId: 'qr_focus_1',
									requestEventId: 'request-focus-1',
									inquiryTitle: 'Need a logo refresh',
									createdAt: 10,
									withProposal: true
								}),
								createHarnessQuoteTimeline(primaryService, {
									requestId: 'qr_focus_2',
									requestEventId: 'request-focus-2',
									inquiryTitle: 'Need a landing page refresh',
									createdAt: 9
								})
							],
							[secondaryServiceAddress]: [
								createHarnessQuoteTimeline(secondaryService, {
									requestId: 'qr_focus_3',
									requestEventId: 'request-focus-3',
									inquiryTitle: 'Need an accessibility audit',
									createdAt: 8
								})
							]
						},
						selectedServiceAddress: primaryServiceAddress,
						focusedRequestId: 'qr_focus_1',
						partialFailure: false,
						loadedServiceAddress: primaryServiceAddress
					};

					surfaceComponent = ServiceQuotesInbox;
					syncRequestsHarnessSurface();

					await waitForSurfaceReady(() =>
						Boolean(
							document.querySelector(
								'[data-testid="service-harness-surface"] [data-testid="service-request-card-qr_focus_1"]'
							)
						)
					);

					result = {
						ready: true,
						state: buildRequestsHarnessStateSnapshot()
					};
					break;
				}
				case 'contracts-highlight': {
					const {
						createDashboardUrl,
						emptyDashboardRouteContext,
						parseServiceQuoteDashboardQuery
					} = await import('$lib/utils/service-quote/dashboard-route');
					const parsed = parseServiceQuoteDashboardQuery(
						new URLSearchParams('tab=contracts&type=services&highlight=%25%25%25'),
						emptyDashboardRouteContext
					);
					const url = createDashboardUrl(new URL('https://bittasker.test/hiring/my-tasks'), {
						tab: 'contracts',
						type: 'services',
						highlight: null
					});
					result = {
						state: parsed.state,
						search: parsed.searchParams.toString(),
						messageCode: parsed.messageCode,
						nextUrl: url.toString()
					};
					break;
				}
				case 'contracts-highlight-valid': {
					const { emptyDashboardRouteContext, parseServiceQuoteDashboardQuery } =
						await import('$lib/utils/service-quote/dashboard-route');
					const parsed = parseServiceQuoteDashboardQuery(
						new URLSearchParams('tab=contracts&type=services&highlight=svc-escrow_123'),
						emptyDashboardRouteContext
					);
					result = {
						state: parsed.state,
						search: parsed.searchParams.toString(),
						changed: parsed.changed,
						messageCode: parsed.messageCode
					};
					break;
				}
				case 'contracts-from-provider-quotes': {
					const {
						createDashboardUrl,
						emptyDashboardRouteContext,
						parseServiceQuoteDashboardQuery
					} = await import('$lib/utils/service-quote/dashboard-route');
					const serviceAddress = `30402:${'a'.repeat(64)}:service-1234`;
					const nextUrl = createDashboardUrl(
						new URL(
							`https://bittasker.test/earning/my-services&view=quotes&service=${encodeURIComponent(
								serviceAddress
							)}&request=qr_valid123`
						),
						{
							tab: 'contracts',
							type: 'services',
							highlight: 'svc-escrow_123'
						}
					);
					const parsed = parseServiceQuoteDashboardQuery(
						nextUrl.searchParams,
						emptyDashboardRouteContext
					);
					result = {
						nextUrl: nextUrl.toString(),
						state: parsed.state,
						search: parsed.searchParams.toString(),
						changed: parsed.changed,
						messageCode: parsed.messageCode
					};
					break;
				}
				case 'contracts-from-tasker-quotes': {
					const {
						createDashboardUrl,
						emptyDashboardRouteContext,
						parseServiceQuoteDashboardQuery
					} = await import('$lib/utils/service-quote/dashboard-route');
					const nextUrl = createDashboardUrl(
						new URL(
							'https://bittasker.test/earning/my-service-requests&view=tasker&request=qr_valid123'
						),
						{
							tab: 'contracts',
							type: 'services',
							highlight: 'svc-escrow_123'
						}
					);
					const parsed = parseServiceQuoteDashboardQuery(
						nextUrl.searchParams,
						emptyDashboardRouteContext
					);
					result = {
						nextUrl: nextUrl.toString(),
						state: parsed.state,
						search: parsed.searchParams.toString(),
						changed: parsed.changed,
						messageCode: parsed.messageCode
					};
					break;
				}
				case 'contracts-pending-navigation-consumed': {
					const { createDashboardUrl } = await import('$lib/utils/service-quote/dashboard-route');
					const {
						consumePendingServiceContractNavigationForContractsPage,
						readPendingServiceContractNavigation,
						writePendingServiceContractNavigation
					} = await import('$lib/utils/service-contract/pending-navigation');

					const storage = createStorageMock();

					writePendingServiceContractNavigation(storage, '0xAbC123', 1_700_000_000_000);
					const highlightEscrowId = consumePendingServiceContractNavigationForContractsPage(
						storage,
						{
							escrowId: 'svc-escrow-123',
							transactionHash: '0xdef456',
							transactionHashes: ['0xabc123', '0xdef456']
						},
						{
							activeTabId: 'contracts',
							contractsType: 'services',
							highlightEscrowId: null
						},
						1_700_000_001_000
					);
					const nextUrl = highlightEscrowId
						? createDashboardUrl(new URL('https://bittasker.test/hiring/contracts'), {
								tab: 'contracts',
								type: 'services',
								highlight: highlightEscrowId
							}).toString()
						: null;

					result = {
						highlightEscrowId,
						nextUrl,
						remaining: readPendingServiceContractNavigation(storage, 1_700_000_001_500)
					};
					break;
				}
				case 'contracts-pending-navigation-preserved': {
					const {
						consumePendingServiceContractNavigationForContractsPage,
						readPendingServiceContractNavigation,
						writePendingServiceContractNavigation
					} = await import('$lib/utils/service-contract/pending-navigation');

					const storage = createStorageMock();

					writePendingServiceContractNavigation(storage, '0xAbC123', 1_700_000_000_000);
					const highlightEscrowId = consumePendingServiceContractNavigationForContractsPage(
						storage,
						{
							escrowId: 'svc-escrow-123',
							transactionHash: '0xabc123'
						},
						{
							activeTabId: 'contracts',
							contractsType: 'services',
							highlightEscrowId: 'svc-existing-999'
						},
						1_700_000_001_000
					);

					result = {
						highlightEscrowId,
						remaining: readPendingServiceContractNavigation(storage, 1_700_000_001_500)
					};
					break;
				}
				case 'instant-buy': {
					const { createInstantBuySnapshot } =
						await import('$lib/utils/service-instant-buy/create');
					const { getInstantBuyEligibility } =
						await import('$lib/utils/service-instant-buy/eligibility');
					const { deriveServiceInstantBuySchedule } =
						await import('$lib/utils/service-instant-buy/time-derivation');

					const service = {
						status: 'active',
						instantBuyLeadHours: 24,
						pricing: {
							type: 'FIXED',
							amount: 150,
							deliveryTime: { value: 3, unit: 'day' }
						}
					} as const;

					const eligibility = getInstantBuyEligibility(service);
					const schedule = deriveServiceInstantBuySchedule(service, undefined, 1_700_000_000);
					const snapshot = createInstantBuySnapshot({
						service,
						nowSeconds: 1_700_000_000
					});

					result = {
						eligibility,
						schedule,
						selectedTierId: snapshot.selectedTierId,
						instantOrderId: snapshot.instantOrderId,
						purchaseKeyLength: snapshot.purchaseKey.length
					};
					break;
				}
				case 'instant-buy-pending-navigation': {
					const {
						readPendingServiceContractNavigation,
						writePendingServiceContractNavigation,
						consumePendingServiceContractNavigation
					} = await import('$lib/utils/service-contract/pending-navigation');

					const storage = createStorageMock();

					writePendingServiceContractNavigation(storage, '0xAbC123', 1_700_000_000_000);
					const pending = readPendingServiceContractNavigation(storage, 1_700_000_000_500);
					const consumedEscrowId = consumePendingServiceContractNavigation(
						storage,
						{
							escrowId: 'svc-escrow-123',
							transactionHash: '0xabc123'
						},
						1_700_000_001_000
					);

					result = {
						pending,
						consumedEscrowId,
						remaining: readPendingServiceContractNavigation(storage, 1_700_000_001_500)
					};
					break;
				}
				default:
					throw new Error(`Unsupported harness scenario: ${scenario}`);
			}

			output = JSON.stringify(result);
		} catch (cause) {
			error = cause instanceof Error ? cause.message : 'Unknown harness failure';
		} finally {
			ready = true;
		}
	});
</script>

<svelte:head>
	<title>Service Harness</title>
</svelte:head>

{#if surfaceComponent}
	{@const SurfaceComponent = surfaceComponent}
	<div data-testid="service-harness-surface" class="min-h-screen p-4">
		{#if requestsHarnessState}
			<div class="mb-4 flex flex-wrap gap-2">
				<button
					type="button"
					class="btn btn-sm btn-outline"
					data-testid="requests-harness-partial-failure"
					onclick={activateRequestsHarnessPartialFailure}
				>
					Simulate partial provider failure
				</button>
			</div>
			<pre data-testid="requests-harness-state">{buildRequestsHarnessStateSnapshot()}</pre>
		{/if}
		<SurfaceComponent {...surfaceProps} />
	</div>
{/if}

{#if error}
	<pre data-testid="service-harness-error">{error}</pre>
{:else if ready}
	<pre data-testid="service-harness-output">{output}</pre>
{:else}
	<pre data-testid="service-harness-loading">Loading harness…</pre>
{/if}
