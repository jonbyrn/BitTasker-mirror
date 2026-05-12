<script lang="ts">
	import { onMount, tick } from 'svelte';
	import type { Component } from 'svelte';
	import type { NDKFilter, NDKSubscription, NDKSubscriptionOptions } from '@nostr-dev-kit/ndk';
	import type { Service } from '$lib/types/service.d';
	import type { ContractWithEvents } from '$lib/types/contract';
	import type { ServiceQuoteTimelineEntry } from '$lib/types/service-quote';
	import { ServicePricingTypeEnum } from '$lib/utils/enums/service.enum';
	import { EscrowStatus } from '$lib/utils/escrow/v1/escrow.enum';
	import { ContractStatus, type SecurePaymentLegacy } from '$lib/utils/contract/types';

	type HarnessResult = Record<string, unknown>;

	let output = $state('');
	let error = $state<string | null>(null);
	let ready = $state(false);
	let surfaceComponent = $state<Component<Record<string, unknown>> | null>(null);
	let surfaceProps = $state<Record<string, unknown>>({});
	/** Route-local stale banner for NDK contracts harness (not part of production contracts UI). */
	let contractsHarnessStaleBanner = $state(false);
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
				status: EscrowStatus.Funded
			} as unknown as ContractWithEvents['escrowData'],
			status: EscrowStatus.Funded,
			isClient: true,
			isPending: false,
			blockchainStatus: EscrowStatus.Funded,
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
					status: EscrowStatus.Funded,
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

	type BittaskerContractsHarnessGlobals = {
		ndk: (typeof import('$lib/nostr/ndk'))['ndk'];
		PaymentContractRune: typeof import('$lib/runes/contractRune.svelte').PaymentContractRune;
		origSubscribe: (filters: NDKFilter | NDKFilter[], opts: NDKSubscriptionOptions) => unknown;
		origRuneStart: (
			this: import('$lib/runes/contractRune.svelte').PaymentContractRune
		) => Promise<void>;
		synthetic30006: import('$lib/nostr/events/contract').NDKPaymentContract[];
		chainByPaymentId: Record<string, SecurePaymentLegacy>;
	};

	function getContractsHarnessGlobals(): BittaskerContractsHarnessGlobals | undefined {
		return (
			globalThis as unknown as { __bittaskerContractsHarness?: BittaskerContractsHarnessGlobals }
		).__bittaskerContractsHarness;
	}

	function setContractsHarnessGlobals(next: BittaskerContractsHarnessGlobals | undefined): void {
		(
			globalThis as unknown as { __bittaskerContractsHarness?: BittaskerContractsHarnessGlobals }
		).__bittaskerContractsHarness = next;
	}

	async function buildHarnessNdkPaymentContract(args: {
		authorSk: Uint8Array;
		taskerPubkeyHex: string;
		taskeePubkeyHex: string;
	}): Promise<import('$lib/nostr/events/contract').NDKPaymentContract> {
		const { ndk } = await import('$lib/nostr/ndk');
		const { NDKEvent } = await import('@nostr-dev-kit/ndk');
		const { NDKPaymentContract } = await import('$lib/nostr/events/contract');
		const { getPublicKey } = await import('nostr-tools/pure');
		const template = createHarnessServiceContract().contractEvent.content;
		const legacy: Record<string, unknown> = {
			type: 'contract',
			escrowId: template.escrowId,
			contextType: template.contextType,
			contextTitle: template.contextTitle,
			contextDescription: template.contextDescription,
			clientPubkey: args.taskerPubkeyHex,
			freelancerPubkey: args.taskeePubkeyHex,
			taskTitle: template.taskTitle,
			taskDescription: template.taskDescription,
			amount: template.amount,
			purchaseMode: template.purchaseMode,
			quoteRequestId: template.quoteRequestId,
			proposalId: template.proposalId,
			selectedTierId: template.selectedTierId,
			estimatedStartTime: template.estimatedStartTime,
			estimatedCompletionTime: template.estimatedCompletionTime,
			agreementSnapshot: template.agreementSnapshot,
			pricingSnapshot: template.pricingSnapshot,
			status: template.status,
			currency: template.currency,
			network: import.meta.env.VITE_RSK_NETWORK || 'testnet',
			contractAddress: `0x${'b'.repeat(40)}`,
			version: 'v2'
		};
		delete legacy.taskId;
		const authorPk = getPublicKey(args.authorSk);
		const raw = new NDKEvent(ndk, {
			kind: 30006,
			pubkey: authorPk,
			created_at: 1_700_000_000,
			tags: [['n', String(import.meta.env.VITE_RSK_NETWORK || 'testnet')]],
			content: JSON.stringify(legacy),
			id: 'ef'.repeat(32),
			sig: 'ab'.repeat(64)
		});
		const parsed = await NDKPaymentContract.from(raw);
		if (!parsed) {
			throw new Error('Harness could not parse Kind 30006 payment contract');
		}
		return parsed;
	}

	async function installNdkContractsHarnessPlugins(
		synthetic30006: import('$lib/nostr/events/contract').NDKPaymentContract[],
		chainByPaymentId: Record<string, SecurePaymentLegacy>
	): Promise<void> {
		const ndkMod = await import('$lib/nostr/ndk');
		const runeMod = await import('$lib/runes/contractRune.svelte');
		const { ndk } = ndkMod;
		const { PaymentContractRune } = runeMod;

		const existing = getContractsHarnessGlobals();
		const origSubscribe = existing?.origSubscribe ?? ndk.subscribe.bind(ndk);
		const origRuneStart =
			existing?.origRuneStart ??
			(PaymentContractRune.prototype.start as (
				this: InstanceType<typeof PaymentContractRune>
			) => Promise<void>);

		const bag: BittaskerContractsHarnessGlobals = {
			ndk,
			PaymentContractRune,
			origSubscribe,
			origRuneStart,
			synthetic30006,
			chainByPaymentId
		};
		setContractsHarnessGlobals(bag);

		ndk.subscribe = ((filters: NDKFilter | NDKFilter[], subOpts: NDKSubscriptionOptions) => {
			const list = Array.isArray(filters) ? filters : [filters];
			const kindsRaw = list.flatMap((f) => [...(f.kinds ?? [])] as number[]);
			const noopSub = {} as NDKSubscription;
			if (kindsRaw.includes(30006) && bag.synthetic30006.length > 0) {
				queueMicrotask(() => {
					if (subOpts.onEvents) {
						subOpts.onEvents(bag.synthetic30006);
					} else {
						for (const ev of bag.synthetic30006) {
							subOpts.onEvent?.(ev);
						}
					}
					subOpts.onEose?.(noopSub);
				});
				return { stop: () => {}, start: () => {} };
			}
			if (kindsRaw.includes(31006)) {
				queueMicrotask(() => {
					subOpts.onEvents?.([]);
					subOpts.onEose?.(noopSub);
				});
				return { stop: () => {}, start: () => {} };
			}
			return bag.origSubscribe(filters, subOpts);
		}) as typeof ndk.subscribe;

		PaymentContractRune.prototype.start = async function (
			this: import('$lib/runes/contractRune.svelte').PaymentContractRune
		) {
			await bag.origRuneStart.call(this);
			const pid = this.paymentId?.trim();
			const snap = pid ? bag.chainByPaymentId[pid] : undefined;
			if (snap) {
				this.blockchainData = snap;
				this.error = null;
			}
		};
	}

	function harnessChainTaskerAccept(): SecurePaymentLegacy {
		return {
			tasker: '0x1111111111111111111111111111111111111111',
			taskee: '0x2222222222222222222222222222222222222222',
			amount: '1000000',
			estimatedStartTime: 0,
			estimatedCompletionTime: 2_000_000_000,
			timelockEnd: 0,
			createdAt: 0,
			taskerFeeTier: 1,
			taskeeFeeTier: 1,
			state: ContractStatus.Completed,
			noShowMarked: false
		};
	}

	function harnessChainTaskeeComplete(): SecurePaymentLegacy {
		return {
			tasker: '0x1111111111111111111111111111111111111111',
			taskee: '0x2222222222222222222222222222222222222222',
			amount: '1000000',
			estimatedStartTime: 0,
			estimatedCompletionTime: 2_000_000_000,
			timelockEnd: 0,
			createdAt: 0,
			taskerFeeTier: 1,
			taskeeFeeTier: 1,
			state: ContractStatus.Funded,
			noShowMarked: false
		};
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
						freelancerRskAddress: '0x1111111111111111111111111111111111111111',
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
		contractsHarnessStaleBanner = false;

		try {
			let result: HarnessResult;

			switch (scenario) {
				case 'tasker-quotes': {
					const { emptyDashboardRouteContext, parseServiceQuoteDashboardQuery } = await import(
						'$lib/utils/service-quote/dashboard-route'
					);
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
					const { parseServiceQuoteDashboardQuery } = await import(
						'$lib/utils/service-quote/dashboard-route'
					);
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
					const { parseServiceQuoteDashboardQuery } = await import(
						'$lib/utils/service-quote/dashboard-route'
					);
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
					const { emptyDashboardRouteContext, parseServiceQuoteDashboardQuery } = await import(
						'$lib/utils/service-quote/dashboard-route'
					);
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
					const { parseServiceQuoteDashboardQuery } = await import(
						'$lib/utils/service-quote/dashboard-route'
					);
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
					const { default: MyQuotesPanel } = await import(
						'$lib/components/dashboard/quotes/MyQuotesPanel.svelte'
					);

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
					const { default: ServiceQuotesInbox } = await import(
						'$lib/components/service/quotes/ServiceQuotesInbox.svelte'
					);

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
					const { default: DashboardMyServicesPanel } = await import(
						'$lib/components/service/DashboardMyServicesPanel.svelte'
					);
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
						loadContractsContinuity: async () => undefined,
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
					const { default: DashboardMyServicesPanel } = await import(
						'$lib/components/service/DashboardMyServicesPanel.svelte'
					);
					const service = createHarnessService({
						uniqueId: 'service-123',
						title: 'Brand Identity Sprint',
						description: 'Logo, color palette, and social avatar pack.'
					});
					const serviceAddress = `30402:${service.npub}:${service.uniqueId}`;
					const contract = createHarnessServiceContract({
						escrowData: {
							id: 'svc-escrow-live',
							status: EscrowStatus.Funded
						} as unknown as ContractWithEvents['escrowData'],
						status: EscrowStatus.Funded,
						blockchainStatus: EscrowStatus.Funded,
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
						loadContractsContinuity: async () => undefined,
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
					const { default: ServiceQuotesInbox } = await import(
						'$lib/components/service/quotes/ServiceQuotesInbox.svelte'
					);
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
					const url = createDashboardUrl(new URL('https://bittasker.test/dashboard?tab=tasks'), {
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
					const { emptyDashboardRouteContext, parseServiceQuoteDashboardQuery } = await import(
						'$lib/utils/service-quote/dashboard-route'
					);
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
							`https://bittasker.test/dashboard?tab=my-services&view=quotes&service=${encodeURIComponent(
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
							'https://bittasker.test/dashboard?tab=service-requests&view=tasker&request=qr_valid123'
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
						? createDashboardUrl(new URL('https://bittasker.test/dashboard?tab=contracts'), {
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
				case 'contracts-surface-highlighted-service': {
					const { default: DashboardContractsPanelNDK } = await import(
						'$lib/components/contracts/DashboardContractsPanelNDK.svelte'
					);
					const { generateSecretKey, getPublicKey } = await import('nostr-tools/pure');
					const { applyNdkSignerFromNsec } = await import('$lib/nostr/ndk');

					const taskerSk = generateSecretKey();
					const taskeeSk = generateSecretKey();
					const taskerPk = getPublicKey(taskerSk);
					const taskeePk = getPublicKey(taskeeSk);

					await applyNdkSignerFromNsec(taskerSk);
					const paymentContract = await buildHarnessNdkPaymentContract({
						authorSk: taskerSk,
						taskerPubkeyHex: taskerPk,
						taskeePubkeyHex: taskeePk
					});
					const pid = paymentContract.paymentId || 'svc-escrow_123';
					const chain = harnessChainTaskerAccept();
					const chainByPaymentId: Record<string, SecurePaymentLegacy> = {
						[pid]: chain,
						'svc-escrow_123': chain
					};
					await installNdkContractsHarnessPlugins([paymentContract], chainByPaymentId);

					surfaceComponent = DashboardContractsPanelNDK;
					surfaceProps = {
						initialType: 'services',
						highlightEscrowId: 'svc-escrow_123'
					};

					await waitForSurfaceReady(() => {
						const root = document.querySelector('[data-testid="service-harness-surface"]');
						if (!root?.textContent?.includes('Premium Logo Package')) return false;
						const txt = root.textContent ?? '';
						return (
							txt.includes('Approve') ||
							txt.includes('Approve Service') ||
							txt.includes('Accept Service')
						);
					});

					const body = document.body.textContent ?? '';
					result = {
						serviceCardPresent: Boolean(
							document
								.querySelector('[data-testid="service-harness-surface"]')
								?.textContent?.includes('Premium Logo Package')
						),
						serviceScopePresent: body.includes('Logo system and brand guide'),
						quotedServiceBadgePresent:
							body.includes('Quoted Service') ||
							body.includes('Quote request') ||
							body.includes('qr_valid123'),
						actionLabelPresent:
							body.includes('Accept Service') ||
							body.includes('Approve Service') ||
							/\bApprove\b/.test(body)
					};
					break;
				}
				case 'contracts-surface-stale-data': {
					const { default: DashboardContractsPanelNDK } = await import(
						'$lib/components/contracts/DashboardContractsPanelNDK.svelte'
					);
					const { generateSecretKey, getPublicKey } = await import('nostr-tools/pure');
					const { applyNdkSignerFromNsec } = await import('$lib/nostr/ndk');

					const taskerSk = generateSecretKey();
					const taskeeSk = generateSecretKey();
					const taskerPk = getPublicKey(taskerSk);
					const taskeePk = getPublicKey(taskeeSk);

					await applyNdkSignerFromNsec(taskerSk);
					const paymentContract = await buildHarnessNdkPaymentContract({
						authorSk: taskerSk,
						taskerPubkeyHex: taskerPk,
						taskeePubkeyHex: taskeePk
					});
					const pid = paymentContract.paymentId || 'svc-escrow_123';
					const chain = harnessChainTaskerAccept();
					const chainByPaymentId: Record<string, SecurePaymentLegacy> = {
						[pid]: chain,
						'svc-escrow_123': chain
					};
					await installNdkContractsHarnessPlugins([paymentContract], chainByPaymentId);

					contractsHarnessStaleBanner = true;
					surfaceComponent = DashboardContractsPanelNDK;
					surfaceProps = {
						initialType: 'services'
					};

					await waitForSurfaceReady(() => {
						return Boolean(
							document.querySelector(
								'[data-testid="service-harness-surface"] [data-testid="contracts-panel-stale-alert"]'
							)
						);
					});

					const body = document.body.textContent ?? '';
					result = {
						staleAlertPresent: Boolean(
							document.querySelector(
								'[data-testid="service-harness-surface"] [data-testid="contracts-panel-stale-alert"]'
							)
						),
						serviceCardPresent: Boolean(
							document
								.querySelector('[data-testid="service-harness-surface"]')
								?.textContent?.includes('Premium Logo Package')
						),
						staleMessagePresent: body.includes('Showing last known contract data.')
					};
					break;
				}
				case 'contracts-surface-completable-service': {
					const { default: DashboardContractsPanelNDK } = await import(
						'$lib/components/contracts/DashboardContractsPanelNDK.svelte'
					);
					const { generateSecretKey, getPublicKey } = await import('nostr-tools/pure');
					const { applyNdkSignerFromNsec } = await import('$lib/nostr/ndk');

					const taskerSk = generateSecretKey();
					const taskeeSk = generateSecretKey();
					const taskerPk = getPublicKey(taskerSk);
					const taskeePk = getPublicKey(taskeeSk);

					await applyNdkSignerFromNsec(taskeeSk);
					const paymentContract = await buildHarnessNdkPaymentContract({
						authorSk: taskeeSk,
						taskerPubkeyHex: taskerPk,
						taskeePubkeyHex: taskeePk
					});
					const pid = paymentContract.paymentId || 'svc-escrow_123';
					const chain = harnessChainTaskeeComplete();
					const chainByPaymentId: Record<string, SecurePaymentLegacy> = {
						[pid]: chain,
						'svc-escrow_123': chain
					};
					await installNdkContractsHarnessPlugins([paymentContract], chainByPaymentId);

					surfaceComponent = DashboardContractsPanelNDK;
					surfaceProps = {
						initialType: 'services',
						highlightEscrowId: 'svc-escrow_123'
					};

					await waitForSurfaceReady(() => {
						const root = document.querySelector('[data-testid="service-harness-surface"]');
						if (!root?.textContent?.includes('Premium Logo Package')) return false;
						return Array.from(root.querySelectorAll('button')).some((btn) => {
							const label = (btn.textContent ?? '').replace(/\s+/g, ' ').trim();
							return label === 'Complete' || label.includes('Mark Service Complete');
						});
					});

					const body = document.body.textContent ?? '';
					const surfaceRoot = document.querySelector('[data-testid="service-harness-surface"]');
					const completeActionPresent = surfaceRoot
						? Array.from(surfaceRoot.querySelectorAll('button')).some((btn) => {
								const label = (btn.textContent ?? '').replace(/\s+/g, ' ').trim();
								return label === 'Complete' || label.includes('Mark Service Complete');
							})
						: false;
					result = {
						serviceCardPresent: Boolean(surfaceRoot?.textContent?.includes('Premium Logo Package')),
						highlightedDrawerPresent: Boolean(
							document.querySelector(
								'[data-testid="service-harness-surface"] [role="dialog"][aria-modal="true"]'
							)
						),
						serviceScopePresent: body.includes('Logo system and brand guide'),
						quotedServiceBadgePresent:
							body.includes('Quoted Service') ||
							body.includes('Quote request') ||
							body.includes('qr_valid123'),
						completeActionPresent,
						agreementSchedulePresent: body.includes('Agreement schedule')
					};
					break;
				}
				case 'instant-buy': {
					const { createInstantBuySnapshot } = await import(
						'$lib/utils/service-instant-buy/create'
					);
					const { getInstantBuyEligibility } = await import(
						'$lib/utils/service-instant-buy/eligibility'
					);
					const { deriveServiceInstantBuySchedule } = await import(
						'$lib/utils/service-instant-buy/time-derivation'
					);

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
				case 'instant-buy-contract-mapping': {
					const { createInstantBuySnapshot } = await import(
						'$lib/utils/service-instant-buy/create'
					);
					const { createServiceContractFromSnapshot } = await import(
						'$lib/utils/service-contract/create-from-snapshot'
					);
					const { buildServiceAddress } = await import('$lib/utils/service-quote/protocol');

					const service = {
						id: 'service-event-1',
						uniqueId: 'service-123',
						npub: 'a'.repeat(64),
						status: 'active',
						instantBuyLeadHours: 24,
						pricing: {
							type: 'FIXED',
							amount: 150,
							deliveryTime: { value: 3, unit: 'day' }
						}
					} as const;

					const snapshot = createInstantBuySnapshot({
						service,
						nowSeconds: 1_700_000_000
					});

					const contract = createServiceContractFromSnapshot({
						escrowId: snapshot.purchaseKey,
						freelancerPubkey: service.npub,
						amount: '0.00150000',
						estimatedStartTime: snapshot.estimatedStartTime,
						estimatedCompletionTime: snapshot.estimatedEndTime,
						serviceId: service.uniqueId,
						serviceAddress: buildServiceAddress(service),
						serviceTitle: 'Brand Identity Sprint',
						contextVersionRef: service.id,
						purchaseMode: 'instant_buy',
						instantOrderId: snapshot.instantOrderId,
						pricingSnapshot: {
							serviceVersionRef: service.id
						}
					});

					result = {
						contextType: contract.contextType,
						contextId: contract.contextId,
						purchaseMode: contract.purchaseMode,
						instantOrderId: contract.instantOrderId
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
		{#if contractsHarnessStaleBanner}
			<div
				class="alert alert-outline alert-warning mb-4"
				data-testid="contracts-panel-stale-alert"
				role="status"
			>
				<span>
					Showing last known contract data. Retry refresh to load the latest contracts from relays.
				</span>
			</div>
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
