<script lang="ts">
	import { get } from 'svelte/store';
	import { onMount, tick } from 'svelte';
	import type { ContractWithEvents } from '$lib/types/contract';

	type HarnessResult = Record<string, unknown>;

	let output = $state('');
	let error = $state<string | null>(null);
	let ready = $state(false);
	let surfaceComponent = $state<unknown>(null);
	let surfaceProps = $state<Record<string, unknown>>({});

	function createHarnessServiceContract(
		overrides: Partial<ContractWithEvents> & {
			permissions?: Partial<ContractWithEvents['permissions']>;
			content?: Partial<ContractWithEvents['contractEvent']['content']>;
		} = {}
	): ContractWithEvents {
		const baseContract: ContractWithEvents = {
			escrowData: {
				id: 'svc-escrow_123',
				status: 'FUNDED'
			},
			status: 'FUNDED',
			isClient: true,
			isPending: false,
			blockchainStatus: 'FUNDED',
			statusEvents: [],
			completionAttachments: [],
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
				pubkey: 'f'.repeat(64),
				created_at: 1_700_000_000,
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
					}
				}
			}
		} as ContractWithEvents;

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

	async function waitForSurfaceReady(predicate: () => boolean, timeoutMs = 4_000): Promise<boolean> {
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
					const { emptyDashboardRouteContext, parseServiceQuoteDashboardQuery } = await import(
						'$lib/utils/service-quote/dashboard-route'
					);
					const parsed = parseServiceQuoteDashboardQuery(
						new URLSearchParams('tab=quotes&view=default&request=bad!')
						, emptyDashboardRouteContext
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
					const { buildServiceQuoteReentryUrl } = await import(
						'$lib/utils/service-quote/reentry'
					);
					const nextPath = buildServiceQuoteReentryUrl(
						`30402:${'a'.repeat(64)}:service-1234`,
						{
							openRequestQuote: true,
							tierId: 'standard',
							selectedAddOnIds: ['source-files']
						}
					);
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
						new URLSearchParams('tab=quotes&view=tasker&request=qr_valid123'),
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
						new URLSearchParams('tab=quotes&view=tasker&request=qr_valid123'),
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
				case 'contracts-highlight': {
					const {
						createDashboardUrl,
						emptyDashboardRouteContext,
						parseServiceQuoteDashboardQuery
					} = await import(
						'$lib/utils/service-quote/dashboard-route'
					);
					const parsed = parseServiceQuoteDashboardQuery(
						new URLSearchParams('tab=contracts&context=services&highlight=%25%25%25')
						, emptyDashboardRouteContext
					);
					const url = createDashboardUrl(
						new URL('https://bittasker.test/dashboard?tab=tasks'),
						{
							tab: 'contracts',
							context: 'services',
							highlight: null
						}
					);
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
						new URLSearchParams('tab=contracts&context=services&highlight=svc-escrow_123')
						, emptyDashboardRouteContext
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
					} = await import(
						'$lib/utils/service-quote/dashboard-route'
					);
					const serviceAddress = `30402:${'a'.repeat(64)}:service-1234`;
					const nextUrl = createDashboardUrl(
						new URL(
							`https://bittasker.test/dashboard?tab=my-services&view=quotes&service=${encodeURIComponent(
								serviceAddress
							)}&request=qr_valid123`
						),
						{
							tab: 'contracts',
							context: 'services',
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
						new URL('https://bittasker.test/dashboard?tab=quotes&view=tasker&request=qr_valid123'),
						{
							tab: 'contracts',
							context: 'services',
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

					const storage = (() => {
						const values = new Map<string, string>();
						return {
							getItem: (key: string) => values.get(key) ?? null,
							setItem: (key: string, value: string) => values.set(key, value),
							removeItem: (key: string) => values.delete(key)
						};
					})();

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
							contractsContext: 'services',
							highlightEscrowId: null
						},
						1_700_000_001_000
					);
					const nextUrl = highlightEscrowId
						? createDashboardUrl(new URL('https://bittasker.test/dashboard?tab=contracts'), {
								tab: 'contracts',
								context: 'services',
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

					const storage = (() => {
						const values = new Map<string, string>();
						return {
							getItem: (key: string) => values.get(key) ?? null,
							setItem: (key: string, value: string) => values.set(key, value),
							removeItem: (key: string) => values.delete(key)
						};
					})();

					writePendingServiceContractNavigation(storage, '0xAbC123', 1_700_000_000_000);
					const highlightEscrowId = consumePendingServiceContractNavigationForContractsPage(
						storage,
						{
							escrowId: 'svc-escrow-123',
							transactionHash: '0xabc123'
						},
						{
							activeTabId: 'contracts',
							contractsContext: 'services',
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
					const { default: DashboardContractsPanel } = await import(
						'$lib/components/contracts/DashboardContractsPanel.svelte'
					);
					const { contractStore } = await import('$lib/stores/contract.store');

					contractStore.loadContracts = async () => undefined;
					contractStore.loadMoreContracts = async () => undefined;
					contractStore.loadContractByEscrowId = async () => true;
					contractStore.unsubscribeFromStatusUpdates = () => {};
					contractStore.unsubscribeFromNewContracts = () => {};

					contractStore.set({
						contracts: [createHarnessServiceContract()],
						contract: null,
						contractsMap: new Map([['svc-escrow_123', 0]]),
						isLoading: false,
						error: null,
						isDrawerOpen: false,
						isResolutionFormOpen: false,
						hasMore: false,
						oldestTimestamp: 1_700_000_000,
						isSubscribed: false,
						isLoadingMore: false
					});

					surfaceComponent = DashboardContractsPanel;
					surfaceProps = {
						initialContext: 'services',
						highlightEscrowId: 'svc-escrow_123'
					};

					await waitForSurfaceReady(() => {
						return Boolean(
							document.querySelector(
								'[data-testid="service-harness-surface"] [data-contract-escrow-id="svc-escrow_123"]'
							)
						);
					});

					result = {
						serviceCardPresent: Boolean(
							document.querySelector(
								'[data-testid="service-harness-surface"] [data-contract-escrow-id="svc-escrow_123"]'
							)
						),
						serviceScopePresent:
							document.body.textContent?.includes('Logo system and brand guide') ?? false,
						quotedServiceBadgePresent: document.body.textContent?.includes('Quoted Service') ?? false,
						actionLabelPresent: document.body.textContent?.includes('Accept Service') ?? false
					};
					break;
				}
				case 'contracts-surface-stale-data': {
					const { default: DashboardContractsPanel } = await import(
						'$lib/components/contracts/DashboardContractsPanel.svelte'
					);
					const { contractStore } = await import('$lib/stores/contract.store');

					contractStore.loadContracts = async () => undefined;
					contractStore.loadMoreContracts = async () => undefined;
					contractStore.loadContractByEscrowId = async () => true;
					contractStore.unsubscribeFromStatusUpdates = () => {};
					contractStore.unsubscribeFromNewContracts = () => {};

					contractStore.set({
						contracts: [createHarnessServiceContract()],
						contract: null,
						contractsMap: new Map([['svc-escrow_123', 0]]),
						isLoading: false,
						error: 'contracts query failed',
						isDrawerOpen: false,
						isResolutionFormOpen: false,
						hasMore: false,
						oldestTimestamp: 1_700_000_000,
						isSubscribed: false,
						isLoadingMore: false
					});

					surfaceComponent = DashboardContractsPanel;
					surfaceProps = {
						initialContext: 'services'
					};

					await waitForSurfaceReady(() => {
						return Boolean(
							document.querySelector(
								'[data-testid="service-harness-surface"] [data-testid="contracts-panel-stale-alert"]'
							)
						);
					});

					result = {
						staleAlertPresent: Boolean(
							document.querySelector(
								'[data-testid="service-harness-surface"] [data-testid="contracts-panel-stale-alert"]'
							)
						),
						serviceCardPresent: Boolean(
							document.querySelector(
								'[data-testid="service-harness-surface"] [data-contract-escrow-id="svc-escrow_123"]'
							)
						),
						staleMessagePresent:
							document.body.textContent?.includes('Showing last known contract data.') ?? false
					};
					break;
				}
				case 'contracts-surface-completable-service': {
					const { default: DashboardContractsPanel } = await import(
						'$lib/components/contracts/DashboardContractsPanel.svelte'
					);
					const { contractStore } = await import('$lib/stores/contract.store');

					contractStore.loadContracts = async () => undefined;
					contractStore.loadMoreContracts = async () => undefined;
					contractStore.loadContractByEscrowId = async () => true;
					contractStore.unsubscribeFromStatusUpdates = () => {};
					contractStore.unsubscribeFromNewContracts = () => {};

					contractStore.set({
						contracts: [
							createHarnessServiceContract({
								isClient: false,
								permissions: {
									canComplete: true,
									canAccept: false
								}
							})
						],
						contract: null,
						contractsMap: new Map([['svc-escrow_123', 0]]),
						isLoading: false,
						error: null,
						isDrawerOpen: false,
						isResolutionFormOpen: false,
						hasMore: false,
						oldestTimestamp: 1_700_000_000,
						isSubscribed: false,
						isLoadingMore: false
					});

					surfaceComponent = DashboardContractsPanel;
					surfaceProps = {
						initialContext: 'services',
						highlightEscrowId: 'svc-escrow_123'
					};

					await waitForSurfaceReady(() => {
						return Boolean(
							document.querySelector(
								'[data-testid="service-harness-surface"] [role="dialog"][aria-modal="true"]'
							) && document.body.textContent?.includes('Mark Service Complete')
						);
					});

					result = {
						serviceCardPresent: Boolean(
							document.querySelector(
								'[data-testid="service-harness-surface"] [data-contract-escrow-id="svc-escrow_123"]'
							)
						),
						highlightedDrawerPresent: Boolean(
							document.querySelector(
								'[data-testid="service-harness-surface"] [role="dialog"][aria-modal="true"]'
							)
						),
						serviceScopePresent:
							document.body.textContent?.includes('Logo system and brand guide') ?? false,
						quotedServiceBadgePresent: document.body.textContent?.includes('Quoted Service') ?? false,
						completeActionPresent:
							document.body.textContent?.includes('Mark Service Complete') ?? false,
						agreementSchedulePresent: document.body.textContent?.includes('Agreement schedule') ?? false
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
							deliveryTime: { min: 2, max: 3, unit: 'day' }
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
							deliveryTime: { min: 2, max: 3, unit: 'day' }
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

					const storage = (() => {
						const values = new Map<string, string>();
						return {
							getItem: (key: string) => values.get(key) ?? null,
							setItem: (key: string, value: string) => values.set(key, value),
							removeItem: (key: string) => values.delete(key)
						};
					})();

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
