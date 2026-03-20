<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { t, locale } from 'svelte-i18n';
	import Tabs from '$lib/components/Tabs.svelte';
	import DashboardMyServicesPanel from '$lib/components/service/DashboardMyServicesPanel.svelte';
	import ServiceQuotesInbox from '$lib/components/service/quotes/ServiceQuotesInbox.svelte';
	import type { Service } from '$lib/types/service.d';
	import { findMyServices } from '$lib/nostr/findServices';
	import {
		buildServiceAddress,
		isRequestSyncActive,
		getProviderTimelines,
		isProviderTimelineSyncing,
		serviceQuoteUiStore
	} from '$lib/stores/service-quote-ui.store';
	import { resolveProviderProposalAuthoring } from '$lib/utils/service-quote/provider-authoring';
	import { walletStore } from '$lib/stores/wallet.store';
	import { getServiceDisplayTitle } from '$lib/utils/serviceDisplayTranslation';
	import {
		createServicesWorkspaceUrl,
		parseServicesWorkspaceRouteQuery,
		type ServicesWorkspaceMessageCode,
		type ServicesWorkspaceRouteContext,
		type ServicesWorkspaceTab
	} from '$lib/utils/service-quote/services-workspace-route';
	import IconBriefcaseOutline from '~icons/mdi/briefcase-outline';
	import IconPlus from '~icons/mdi/plus';
	import IconArrowLeft from '~icons/mdi/arrow-left';

	let services = $state<Service[]>([]);
	let loading = $state(true);
	let loadError = $state<string | null>(null);
	let activeTabId = $state<ServicesWorkspaceTab>('listings');
	let selectedServiceAddress = $state<string | null>(null);
	let focusedRequestId = $state<string | null>(null);
	let nonBlockingMessageCode = $state<ServicesWorkspaceMessageCode | null>(null);
	let providerTimelines = $state<ReturnType<typeof getProviderTimelines>>([]);
	let providerQuotesSyncing = $state(false);
	let providerQuotesError = $state<string | null>(null);
	let providerQuotesLoaded = $state(false);
	let routeContext = $state<ServicesWorkspaceRouteContext>({
		providerTimelinesByService: {},
		providerLoadedByService: {},
		providerLoadErrorByService: {},
		focusSync: {
			requestId: null,
			serviceAddress: null,
			expiresAt: null
		}
	});

	const tabs = $derived([
		{ id: 'listings', label: $t('dashboard.tabs.my_services') || 'Listings' },
		{ id: 'quotes', label: 'Quote Inbox' }
	]);

	const providerAuthoring = $derived(resolveProviderProposalAuthoring($walletStore.rsk.address));
	const walletReady = $derived(providerAuthoring.ok);
	const feeTierReady = $derived(true);
	const sortedServices = $derived(
		[...services].sort((a, b) => {
			const statusOrder = { active: 0, inactive: 1, sold: 2 };
			const statusA = statusOrder[a.status] ?? 3;
			const statusB = statusOrder[b.status] ?? 3;
			if (statusA !== statusB) {
				return statusA - statusB;
			}
			return (b.createdAt ?? 0) - (a.createdAt ?? 0);
		})
	);
	const selectedService = $derived(
		services.find((service) => buildServiceAddress(service) === selectedServiceAddress) ?? null
	);
	const serviceAddresses = $derived(sortedServices.map((service) => buildServiceAddress(service)));
	const serviceTitleByAddress = $derived(
		Object.fromEntries(
			sortedServices.map((service) => [
				buildServiceAddress(service),
				getServiceDisplayTitle(service, $locale || 'en')
			])
		) as Record<string, string>
	);

	function sortTimelinesByNewest(
		left: (typeof providerTimelines)[number],
		right: (typeof providerTimelines)[number]
	): number {
		return (right.request.created_at ?? 0) - (left.request.created_at ?? 0);
	}

	function getVisibleProviderTimelines(
		state: Parameters<Parameters<typeof serviceQuoteUiStore.subscribe>[0]>[0]
	) {
		if (selectedServiceAddress) {
			return getProviderTimelines(state, selectedServiceAddress);
		}

		return serviceAddresses
			.flatMap((serviceAddress) => getProviderTimelines(state, serviceAddress))
			.sort(sortTimelinesByNewest);
	}

	function getProviderQuotesSyncing(
		state: Parameters<Parameters<typeof serviceQuoteUiStore.subscribe>[0]>[0]
	): boolean {
		if (selectedServiceAddress) {
			return isProviderTimelineSyncing(state, selectedServiceAddress, focusedRequestId);
		}

		return (
			serviceAddresses.some(
				(serviceAddress) => state.loadingProviderByService[serviceAddress] === true
			) || isRequestSyncActive(state, focusedRequestId, null)
		);
	}

	function getProviderQuotesError(
		state: Parameters<Parameters<typeof serviceQuoteUiStore.subscribe>[0]>[0]
	): string | null {
		if (selectedServiceAddress) {
			return state.providerLoadErrorByService?.[selectedServiceAddress] ?? null;
		}

		return serviceAddresses.find(
			(serviceAddress) => state.providerLoadErrorByService?.[serviceAddress] != null
		)
			? (state.providerLoadErrorByService[
					serviceAddresses.find(
						(serviceAddress) => state.providerLoadErrorByService?.[serviceAddress] != null
					) ?? ''
				] ?? null)
			: null;
	}

	function getProviderQuotesLoaded(
		state: Parameters<Parameters<typeof serviceQuoteUiStore.subscribe>[0]>[0]
	): boolean {
		if (selectedServiceAddress) {
			return state.providerLoadedByService?.[selectedServiceAddress] === true;
		}

		return serviceAddresses.length > 0
			? serviceAddresses.every(
					(serviceAddress) => state.providerLoadedByService?.[serviceAddress] === true
				)
			: false;
	}

	async function loadServices() {
		loading = true;
		loadError = null;
		try {
			const result = await findMyServices({ limit: 100 });
			services = result.services;
		} catch (error) {
			loadError = error instanceof Error ? error.message : 'Failed to load your services.';
			services = [];
		} finally {
			loading = false;
		}
	}

	function syncRouteState() {
		const parsed = parseServicesWorkspaceRouteQuery(page.url.searchParams, routeContext);
		activeTabId = parsed.state.tab;
		selectedServiceAddress = parsed.state.serviceAddress;
		focusedRequestId = parsed.state.requestId;
		nonBlockingMessageCode = parsed.messageCode;

		if (parsed.changed) {
			const nextSearch = parsed.searchParams.toString();
			const nextUrl = `${page.url.pathname}${nextSearch ? `?${nextSearch}` : ''}${page.url.hash}`;
			goto(nextUrl.toString(), { replaceState: true, keepFocus: true, noScroll: true });
		}
	}

	function navigateToWorkspace(
		updates: Partial<{
			tab: ServicesWorkspaceTab;
			serviceAddress: string | null;
			requestId: string | null;
		}>
	) {
		const nextUrl = createServicesWorkspaceUrl(page.url, updates);
		goto(nextUrl.toString(), { replaceState: true, keepFocus: true, noScroll: true });
	}

	function handleTabChange(tabId: string) {
		if (tabId === 'quotes') {
			navigateToWorkspace({
				tab: 'quotes',
				serviceAddress: selectedServiceAddress,
				requestId: null
			});
			return;
		}

		nonBlockingMessageCode = null;
		navigateToWorkspace({
			tab: 'listings',
			serviceAddress: null,
			requestId: null
		});
	}

	function handleOpenServiceQuotes(service: Service, requestId: string | null = null) {
		nonBlockingMessageCode = null;
		navigateToWorkspace({
			tab: 'quotes',
			serviceAddress: buildServiceAddress(service),
			requestId
		});
	}

	function handleServiceSelection(serviceAddress: string) {
		nonBlockingMessageCode = null;
		navigateToWorkspace({
			tab: 'quotes',
			serviceAddress: serviceAddress || null,
			requestId: null
		});
	}

	function handleRequestFocus(requestId: string | null) {
		nonBlockingMessageCode = requestId === null ? 'service_quotes_request_not_found' : null;
		navigateToWorkspace({
			tab: 'quotes',
			serviceAddress: selectedServiceAddress,
			requestId
		});
	}

	onMount(() => {
		syncRouteState();
		void loadServices();
	});

	$effect(() => {
		page.url.searchParams.toString();
		syncRouteState();
	});

	$effect(() => {
		const unsubscribe = serviceQuoteUiStore.subscribe((state) => {
			routeContext = {
				providerTimelinesByService: state.providerTimelinesByService,
				providerLoadedByService: state.providerLoadedByService,
				providerLoadErrorByService: state.providerLoadErrorByService,
				focusSync: state.focusSync
			};
			providerTimelines = getVisibleProviderTimelines(state);
			providerQuotesSyncing = getProviderQuotesSyncing(state);
			providerQuotesError = getProviderQuotesError(state);
			providerQuotesLoaded = getProviderQuotesLoaded(state);
		});

		return unsubscribe;
	});

	$effect(() => {
		if (activeTabId !== 'quotes') {
			providerQuotesError = null;
			return;
		}

		if (serviceAddresses.length === 0) {
			return;
		}

		if (selectedServiceAddress) {
			void serviceQuoteUiStore
				.loadProviderTimelines(selectedServiceAddress, focusedRequestId)
				.catch(() => {
					// Error state is exposed by the store.
				});
			return;
		}

		void Promise.allSettled(
			serviceAddresses.map((serviceAddress) =>
				serviceQuoteUiStore.loadProviderTimelines(serviceAddress)
			)
		);
	});

	$effect(() => {
		if (
			activeTabId !== 'quotes' ||
			!focusedRequestId ||
			providerQuotesSyncing ||
			!providerQuotesLoaded ||
			providerQuotesError
		) {
			return;
		}

		const hasFocusedRequest = providerTimelines.some(
			(timeline) => timeline.request.content.quoteRequestId === focusedRequestId
		);
		if (hasFocusedRequest) {
			return;
		}

		nonBlockingMessageCode = 'service_quotes_request_not_found';
		navigateToWorkspace({
			tab: 'quotes',
			serviceAddress: selectedServiceAddress,
			requestId: null
		});
	});
</script>

<svelte:head>
	<title>Services | BitTasker</title>
	<meta
		name="description"
		content="Manage your service listings and incoming quote requests on BitTasker."
	/>
</svelte:head>

<div class="mx-auto h-full max-w-6xl px-2 py-6 md:px-0 md:py-0">
	<div class="mb-6 flex flex-wrap items-center justify-between gap-3">
		<div>
			<div class="mb-2">
				<a href="/dashboard" class="btn btn-ghost btn-sm gap-2">
					<IconArrowLeft class="h-4 w-4" aria-hidden="true" />
					<span>{$t('navbar.panel') || 'Dashboard'}</span>
				</a>
			</div>
			<h3 class="font-bold">Services</h3>
			<p class="text-base-content/70">
				Manage your listings and respond to incoming service requests.
			</p>
		</div>
		<a href="/dashboard/create-service" class="btn btn-primary btn-sm sm:btn-md whitespace-nowrap">
			<IconPlus class="mr-1 h-4 w-4 sm:mr-2 sm:h-5 sm:w-5" aria-hidden="true" />
			<span>{$t('dashboard.services.my_services.create_service')}</span>
		</a>
	</div>

	<Tabs {tabs} activeTab={activeTabId} onTabChange={handleTabChange} />

	{#if nonBlockingMessageCode}
		<div class="alert alert-info my-4 text-sm">
			<span>
				{#if nonBlockingMessageCode === 'service_quotes_request_not_found'}
					The selected service quote thread could not be found.
				{/if}
			</span>
		</div>
	{/if}

	{#if activeTabId === 'listings'}
		<div id="panel-listings" role="tabpanel" aria-labelledby="tab-listings" class="mt-4">
			<DashboardMyServicesPanel onOpenServiceQuotes={handleOpenServiceQuotes} />
		</div>
	{:else}
		<div id="panel-quotes" role="tabpanel" aria-labelledby="tab-quotes" class="space-y-4 pt-4">
			{#if loading}
				<div class="flex flex-col items-center justify-center py-16">
					<span class="loading loading-spinner loading-lg text-primary"></span>
					<p class="text-base-content/70 mt-4">Loading your services...</p>
				</div>
			{:else if loadError}
				<div class="alert alert-error alert-outline">
					<span>{loadError}</span>
				</div>
				<button type="button" class="btn btn-primary btn-sm mt-4" onclick={loadServices}>
					Retry
				</button>
			{:else if sortedServices.length === 0}
				<div
					class="border-base-300 bg-base-200/50 flex flex-col items-center justify-center rounded-2xl border border-dashed px-6 py-16 text-center"
				>
					<IconBriefcaseOutline class="text-base-content/30 h-16 w-16" aria-hidden="true" />
					<h4 class="mt-4 text-lg font-semibold">No services yet</h4>
					<p class="text-base-content/70 mt-2 max-w-md">
						Create a service to start receiving quote requests in your inbox.
					</p>
					<a href="/dashboard/create-service" class="btn btn-primary mt-6">
						<IconPlus class="mr-2 h-5 w-5" aria-hidden="true" />
						{$t('dashboard.services.my_services.create_service')}
					</a>
				</div>
			{:else}
				<label class="form-control w-full max-w-md">
					<div class="label">
						<span class="label-text font-medium">Filter by service</span>
					</div>
					<select
						class="select select-bordered w-full"
						value={selectedServiceAddress ?? ''}
						onchange={(event) =>
							handleServiceSelection((event.currentTarget as HTMLSelectElement).value)}
					>
						<option value="">All Services</option>
						{#each sortedServices as service (service.id)}
							<option value={buildServiceAddress(service)}>
								{getServiceDisplayTitle(service, $locale || 'en')}
							</option>
						{/each}
					</select>
				</label>

				<ServiceQuotesInbox
					serviceLabel={selectedService
						? getServiceDisplayTitle(selectedService, $locale || 'en')
						: 'All Services'}
					showServiceTitles={selectedServiceAddress === null}
					{serviceTitleByAddress}
					timelines={providerTimelines}
					{focusedRequestId}
					isSyncing={providerQuotesSyncing}
					hasLoaded={providerQuotesLoaded}
					loadError={providerQuotesError}
					{walletReady}
					{feeTierReady}
					onRetry={async () => {
						if (serviceAddresses.length === 0) {
							return;
						}

						if (selectedServiceAddress) {
							await serviceQuoteUiStore
								.loadProviderTimelines(selectedServiceAddress, focusedRequestId, {
									force: true
								})
								.catch(() => {});
							return;
						}

						await Promise.allSettled(
							serviceAddresses.map((serviceAddress) =>
								serviceQuoteUiStore.loadProviderTimelines(serviceAddress, null, {
									force: true
								})
							)
						);
					}}
					onRequestFocusChange={handleRequestFocus}
					onInvalidFocusedRequest={() => handleRequestFocus(null)}
					onSendProposal={async (requestId, payload) => {
						const timeline = providerTimelines.find(
							(entry) => entry.request.content.quoteRequestId === requestId
						);
						const resolvedServiceAddress =
							selectedServiceAddress ?? timeline?.request.content.serviceAddress ?? null;
						const resolvedService =
							selectedService ??
							services.find((service) => buildServiceAddress(service) === resolvedServiceAddress) ??
							null;

						if (!resolvedService || !resolvedServiceAddress) {
							return { success: false, error: 'Select a service first.' };
						}
						return serviceQuoteUiStore.sendLocalProposal({
							service: resolvedService,
							serviceAddress: resolvedServiceAddress,
							quoteRequestId: requestId,
							...payload
						});
					}}
				/>
			{/if}
		</div>
	{/if}
</div>
