<script lang="ts">
	import { browser, dev } from '$app/environment';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { get } from 'svelte/store';
	import { slide } from 'svelte/transition';
	import { t } from 'svelte-i18n';
	import Tabs from '$lib/components/Tabs.svelte';
	import DashboardBidsPanel from '$lib/components/bidding/DashboardBidsPanel.svelte';
	import DashboardContractsPanel from '$lib/components/contracts/DashboardContractsPanel.svelte';
	import DashboardSavedSearchesPanel from '$lib/components/task/DashboardSavedSearchesPanel.svelte';
	import DashboardMyServicesPanel from '$lib/components/service/DashboardMyServicesPanel.svelte';
	import DashboardServiceRequestsPanel from '$lib/components/service/DashboardServiceRequestsPanel.svelte';
	import type { Service } from '$lib/types/service.d';
	import { buildServiceAddress, serviceQuoteUiStore } from '$lib/stores/service-quote-ui.store';
	import {
		buildEarningQueryUrl,
		parseEarningQuery,
		type DashboardContractsType,
		type EarningTab
	} from '$lib/utils/dashboardQuery';

	function translateOrFallback(
		translate: (key: string) => string,
		key: string,
		fallback: string
	): string {
		const translated = translate(key);
		return translated === key ? fallback : translated;
	}

	const tabs = $derived.by(() => {
		const translate = $t;

		return [
			{
				id: 'bids',
				label: translateOrFallback(translate, 'dashboard.tabs.bids', 'Bids'),
				buttonLabel: translateOrFallback(translate, 'dashboard.find_task', 'Find Tasks'),
				buttonHref: '/tasks',
				icon: 'search'
			},
			{
				id: 'requests',
				label: translateOrFallback(translate, 'dashboard.tabs.requests', 'Requests'),
				buttonLabel: translateOrFallback(
					translate,
					'dashboard.services.my_services.create_service',
					'Create Service'
				),
				buttonHref: '/dashboard/create-service',
				icon: 'plus'
			},
			{
				id: 'contracts',
				label: translateOrFallback(translate, 'dashboard.tabs.contracts', 'Contracts'),
				buttonLabel: translateOrFallback(translate, 'dashboard.find_task', 'Find Tasks'),
				buttonHref: '/tasks',
				icon: 'search'
			},
			{
				id: 'my-services',
				label: translateOrFallback(translate, 'dashboard.tabs.my_services', 'My Services'),
				buttonLabel: translateOrFallback(
					translate,
					'dashboard.services.my_services.create_service',
					'Create Service'
				),
				buttonHref: '/dashboard/create-service',
				icon: 'plus'
			},
			{
				id: 'saved-searches',
				label: translateOrFallback(translate, 'dashboard.tabs.saved_searches', 'Alerts'),
				buttonLabel: translateOrFallback(translate, 'dashboard.find_task', 'Find Tasks'),
				buttonHref: '/tasks',
				icon: 'search'
			}
		];
	});

	let activeTabId = $state<EarningTab>('bids');
	const activeTab = $derived.by(() => tabs.find((tab) => tab.id === activeTabId) || tabs[0]);
	let contractsType = $state<DashboardContractsType>('all');
	let currentContractsHighlight = $state<string | null>(null);
	let selectedServiceAddress = $state<string | null>(null);
	let focusedRequestId = $state<string | null>(null);
	let activeStatus = $state<string | null>(null);
	let nonBlockingMessageCode = $state<string | null>(null);

	function logRequestsDebug(event: string, details: Record<string, unknown>) {
		if (!browser || !dev) {
			return;
		}

		console.info('[Earning Requests]', event, details);
	}

	function clearRequestsRouteMessage() {
		if (get(serviceQuoteUiStore).nonBlockingMessageCode !== null) {
			serviceQuoteUiStore.setNonBlockingMessage(null);
		}
	}

	function syncRouteState() {
		const parsed = parseEarningQuery(page.url);
		activeTabId = parsed.tab;
		contractsType = parsed.type ?? 'all';
		currentContractsHighlight = parsed.highlight ?? null;
		selectedServiceAddress = parsed.service ?? null;
		focusedRequestId = parsed.request ?? null;
		activeStatus = parsed.status ?? parsed.bidStatus ?? null;
		nonBlockingMessageCode = null;

		const canonicalUrl = new URL(
			buildEarningQueryUrl(page.url, {
				tab: parsed.tab,
				type: parsed.type,
				highlight: parsed.highlight,
				service: parsed.service,
				request: parsed.request,
				status: parsed.tab !== 'bids' ? activeStatus : undefined,
				bidStatus: parsed.tab === 'bids' ? activeStatus : undefined
			})
		);

		if (parsed.tab === 'requests') {
			logRequestsDebug('route-sync', {
				url: `${page.url.pathname}${page.url.search}`,
				tab: parsed.tab,
				service: parsed.service ?? null,
				request: parsed.request ?? null,
				status: activeStatus,
				canonicalSearch: canonicalUrl.search
			});
		}

		if (canonicalUrl.search !== page.url.search) {
			goto(canonicalUrl.toString(), {
				replaceState: true,
				keepFocus: true,
				noScroll: true
			});
		}
	}

	$effect(() => {
		page.url.searchParams.toString();
		syncRouteState();
	});

	function navigateToEarning(
		updates: Partial<{
			tab: EarningTab;
			type: DashboardContractsType;
			highlight: string | null;
			service: string | null;
			request: string | null;
			status: string | null;
		}>
	) {
		const nextUrl = new URL(
			buildEarningQueryUrl(page.url, {
				tab: updates.tab ?? activeTabId,
				type: updates.type ?? contractsType,
				highlight: updates.highlight ?? null,
				service: updates.service ?? null,
				request: updates.request ?? null,
				status:
					(updates.tab ?? activeTabId) !== 'bids' ? (updates.status ?? activeStatus) : undefined,
				bidStatus:
					(updates.tab ?? activeTabId) === 'bids' ? (updates.status ?? activeStatus) : undefined
			})
		);

		goto(nextUrl.toString(), { replaceState: true, keepFocus: true, noScroll: true });
	}

	function handleTabChange(tabId: string) {
		const nextTab = tabId as EarningTab;
		if (!tabs.some((tab) => tab.id === nextTab)) {
			return;
		}

		nonBlockingMessageCode = null;
		clearRequestsRouteMessage();

		if (nextTab === 'requests') {
			logRequestsDebug('tab-change', {
				fromTab: activeTabId,
				toTab: nextTab,
				preservedService: selectedServiceAddress,
				clearedRequest: true
			});
			navigateToEarning({
				tab: 'requests',
				service: selectedServiceAddress,
				request: null
			});
			return;
		}

		if (nextTab === 'contracts') {
			navigateToEarning({
				tab: 'contracts',
				type: contractsType,
				highlight: null,
				service: selectedServiceAddress
			});
			return;
		}

		navigateToEarning({
			tab: nextTab,
			service: null,
			request: null,
			highlight: null
		});
	}

	function handleProviderRouteUpdate(
		update:
			| {
					type: 'service';
					serviceAddress: string;
					requestId?: string | null;
					status?: string | null;
			  }
			| { type: 'reset'; status?: string | null }
			| { type: 'request'; requestId: string | null; status?: string | null }
	) {
		logRequestsDebug('provider-route-update', {
			update,
			currentService: selectedServiceAddress,
			currentRequest: focusedRequestId
		});

		if (update.type === 'reset') {
			nonBlockingMessageCode = null;
			clearRequestsRouteMessage();
			navigateToEarning({
				tab: 'requests',
				service: null,
				request: null,
				status: update.status ?? activeStatus
			});
			return;
		}

		if (update.type === 'request') {
			const pendingMessageCode = get(serviceQuoteUiStore).nonBlockingMessageCode;
			nonBlockingMessageCode =
				update.requestId === null && pendingMessageCode === 'service_quotes_request_not_found'
					? 'service_quotes_request_not_found'
					: null;
			if (pendingMessageCode !== null) {
				serviceQuoteUiStore.setNonBlockingMessage(null);
			}
			navigateToEarning({
				tab: 'requests',
				service: selectedServiceAddress,
				request: update.requestId,
				status: update.status ?? activeStatus
			});
			return;
		}

		nonBlockingMessageCode = null;
		clearRequestsRouteMessage();
		navigateToEarning({
			tab: 'requests',
			service: update.serviceAddress,
			request: update.requestId ?? null,
			status: update.status ?? activeStatus
		});
	}

	function handleOpenServiceQuotes(service: Service) {
		nonBlockingMessageCode = null;
		clearRequestsRouteMessage();
		handleProviderRouteUpdate({
			type: 'service',
			serviceAddress: buildServiceAddress(service),
			requestId: null
		});
	}

	function handleContractsHighlightConsumed() {
		navigateToEarning({
			tab: 'contracts',
			type: contractsType,
			highlight: null,
			service: selectedServiceAddress
		});
	}

	function handleContractsHighlightMissing() {
		nonBlockingMessageCode = 'contracts_highlight_not_found';
		handleContractsHighlightConsumed();
	}

	function handleContractsServiceFilterChange(serviceAddress: string | null) {
		nonBlockingMessageCode = null;
		navigateToEarning({
			tab: 'contracts',
			type: serviceAddress ? 'services' : contractsType,
			highlight: null,
			service: serviceAddress
		});
	}

	function handleContractsFiltersReset() {
		nonBlockingMessageCode = null;
		navigateToEarning({
			tab: 'contracts',
			type: 'all',
			highlight: null,
			service: null
		});
	}
</script>

<div class="mx-auto h-full max-w-6xl px-2 py-6 md:px-0 md:py-0">
	<div class="mb-6 flex items-center justify-between gap-3">
		<div class="min-w-0">
			<h3 class="font-bold">{translateOrFallback($t, 'dashboard.earning.title', 'Earning')}</h3>
		</div>
		<a href={activeTab.buttonHref} class="btn btn-primary btn-sm sm:btn-md whitespace-nowrap">
			{#if activeTab.icon === 'search'}
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="mr-1 h-4 w-4 sm:mr-2 sm:h-5 sm:w-5"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
					aria-label={$t('dashboard.page.search_icon_alt')}
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
					/>
				</svg>
			{:else if activeTab.icon === 'wallet'}
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="mr-1 h-4 w-4 sm:mr-2 sm:h-5 sm:w-5"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
					aria-label={$t('dashboard.page.wallet_icon_alt')}
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
					/>
				</svg>
			{:else}
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="mr-1 h-4 w-4 sm:mr-2 sm:h-5 sm:w-5"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
					aria-label={$t('dashboard.page.plus_icon_alt')}
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M12 4v16m8-8H4"
					/>
				</svg>
			{/if}
			<span>{activeTab.buttonLabel}</span>
		</a>
	</div>

	<Tabs {tabs} activeTab={activeTabId} onTabChange={handleTabChange} />

	{#if nonBlockingMessageCode === 'contracts_highlight_not_found'}
		<div class="alert alert-info my-4 text-sm">
			<span>
				{translateOrFallback(
					$t,
					'dashboard.earning.messages.contracts_highlight_not_found',
					'The requested contract highlight could not be found.'
				)}
			</span>
		</div>
	{:else if nonBlockingMessageCode === 'service_quotes_request_not_found'}
		<div class="alert alert-info my-4 text-sm">
			<span>
				{translateOrFallback(
					$t,
					'dashboard.earning.messages.service_quotes_request_not_found',
					'The selected service quote thread could not be found.'
				)}
			</span>
		</div>
	{/if}

	{#if activeTabId === 'bids'}
		<div
			id="panel-bids"
			role="tabpanel"
			aria-labelledby="tab-bids"
			transition:slide={{ duration: 300 }}
		>
			<DashboardBidsPanel status={activeStatus} />
		</div>
	{:else if activeTabId === 'requests'}
		<div
			id="panel-requests"
			role="tabpanel"
			aria-labelledby="tab-requests"
			transition:slide={{ duration: 300 }}
		>
			<DashboardServiceRequestsPanel
				status={activeStatus}
				{selectedServiceAddress}
				{focusedRequestId}
				onResolveQuotesRoute={handleProviderRouteUpdate}
			/>
		</div>
	{:else if activeTabId === 'contracts'}
		<div
			id="panel-contracts"
			role="tabpanel"
			aria-labelledby="tab-contracts"
			transition:slide={{ duration: 300 }}
		>
			<DashboardContractsPanel
				initialType={contractsType}
				initialStatus={activeStatus as string | null}
				showRoleFilters={false}
				fixedRole="freelancer"
				showServiceFilter={true}
				{selectedServiceAddress}
				onServiceFilterChange={handleContractsServiceFilterChange}
				onClearFilters={handleContractsFiltersReset}
				emptyStateActionLabel={translateOrFallback($t, 'dashboard.find_task', 'Find Tasks')}
				emptyStateActionHref="/tasks"
				highlightEscrowId={currentContractsHighlight}
				onHighlightConsumed={handleContractsHighlightConsumed}
				onHighlightMissing={handleContractsHighlightMissing}
			/>
		</div>
	{:else if activeTabId === 'my-services'}
		<div
			id="panel-my-services"
			role="tabpanel"
			aria-labelledby="tab-my-services"
			transition:slide={{ duration: 300 }}
		>
			<DashboardMyServicesPanel
				status={activeStatus}
				onOpenServiceQuotes={handleOpenServiceQuotes}
			/>
		</div>
	{:else if activeTabId === 'saved-searches'}
		<div
			id="panel-saved-searches"
			role="tabpanel"
			aria-labelledby="tab-saved-searches"
			transition:slide={{ duration: 300 }}
		>
			<DashboardSavedSearchesPanel fixedFilter="tasks" />
		</div>
	{/if}
</div>
