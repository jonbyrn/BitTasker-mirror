<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { slide } from 'svelte/transition';
	import { t } from 'svelte-i18n';
	import Tabs from '$lib/components/Tabs.svelte';
	import DashboardBidsPanel from '$lib/components/bidding/DashboardBidsPanel.svelte';
	import DashboardContractsPanel from '$lib/components/contracts/DashboardContractsPanel.svelte';
	import DashboardSavedSearchesPanel from '$lib/components/task/DashboardSavedSearchesPanel.svelte';
	import DashboardMyServicesPanel from '$lib/components/service/DashboardMyServicesPanel.svelte';
	import type { Service } from '$lib/types/service.d';
	import { buildServiceAddress } from '$lib/stores/service-quote-ui.store';
	import {
		buildEarningQueryUrl,
		parseEarningQuery,
		type DashboardContractsContext,
		type EarningTab
	} from '$lib/utils/dashboardQuery';

	function translateOrFallback(key: string, fallback: string): string {
		const translated = $t(key);
		return translated === key ? fallback : translated;
	}

	const tabs = $derived([
		{
			id: 'bids',
			label: translateOrFallback('dashboard.tabs.bids', 'Bids Sent'),
			buttonLabel: translateOrFallback('dashboard.find_task', 'Find Tasks'),
			buttonHref: '/tasks',
			icon: 'search'
		},
		{
			id: 'requests',
			label: translateOrFallback('dashboard.tabs.requests', 'Requests'),
			buttonLabel: translateOrFallback(
				'dashboard.services.my_services.create_service',
				'Create Service'
			),
			buttonHref: '/dashboard/create-service',
			icon: 'plus'
		},
		{
			id: 'contracts',
			label: translateOrFallback('dashboard.tabs.contracts', 'Contracts'),
			buttonLabel: translateOrFallback('dashboard.manage_wallet', 'Manage Wallet'),
			buttonHref: '/dashboard/wallet',
			icon: 'wallet'
		},
		{
			id: 'my-services',
			label: translateOrFallback('dashboard.tabs.my_services', 'My Services'),
			buttonLabel: translateOrFallback(
				'dashboard.services.my_services.create_service',
				'Create Service'
			),
			buttonHref: '/dashboard/create-service',
			icon: 'plus'
		},
		{
			id: 'saved-searches',
			label: translateOrFallback('dashboard.tabs.saved_searches', 'Saved Searches'),
			buttonLabel: translateOrFallback('dashboard.find_task', 'Find Tasks'),
			buttonHref: '/tasks',
			icon: 'search'
		}
	]);

	let activeTabId = $state<EarningTab>('bids');
	const activeTab = $derived(tabs.find((tab) => tab.id === activeTabId) || tabs[0]);
	let contractsContext = $state<DashboardContractsContext>('all');
	let currentContractsHighlight = $state<string | null>(null);
	let selectedServiceAddress = $state<string | null>(null);
	let focusedRequestId = $state<string | null>(null);
	let nonBlockingMessageCode = $state<string | null>(null);

	function syncRouteState() {
		const parsed = parseEarningQuery(page.url);
		activeTabId = parsed.tab;
		contractsContext = parsed.context ?? 'all';
		currentContractsHighlight = parsed.highlight ?? null;
		selectedServiceAddress = parsed.service ?? null;
		focusedRequestId = parsed.request ?? null;

		const canonicalUrl = new URL(
			buildEarningQueryUrl(page.url, {
				tab: parsed.tab,
				context: parsed.context,
				highlight: parsed.highlight,
				service: parsed.service,
				request: parsed.request
			})
		);

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
			context: DashboardContractsContext;
			highlight: string | null;
			service: string | null;
			request: string | null;
		}>
	) {
		const nextUrl = new URL(
			buildEarningQueryUrl(page.url, {
				tab: updates.tab ?? activeTabId,
				context: updates.context ?? contractsContext,
				highlight: updates.highlight ?? null,
				service: updates.service ?? null,
				request: updates.request ?? null
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

		if (nextTab === 'requests') {
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
				context: contractsContext,
				highlight: null
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
			| { type: 'service'; serviceAddress: string; requestId?: string | null }
			| { type: 'reset' }
			| { type: 'request'; requestId: string | null }
	) {
		if (update.type === 'reset') {
			nonBlockingMessageCode = null;
			navigateToEarning({
				tab: 'requests',
				service: null,
				request: null
			});
			return;
		}

		if (update.type === 'request') {
			nonBlockingMessageCode =
				update.requestId === null ? 'service_quotes_request_not_found' : null;
			navigateToEarning({
				tab: 'requests',
				service: selectedServiceAddress,
				request: update.requestId
			});
			return;
		}

		nonBlockingMessageCode = null;
		navigateToEarning({
			tab: 'requests',
			service: update.serviceAddress,
			request: update.requestId ?? null
		});
	}

	function handleOpenServiceQuotes(service: Service) {
		nonBlockingMessageCode = null;
		handleProviderRouteUpdate({
			type: 'service',
			serviceAddress: buildServiceAddress(service),
			requestId: null
		});
	}

	function handleContractsHighlightConsumed() {
		navigateToEarning({
			tab: 'contracts',
			context: contractsContext,
			highlight: null
		});
	}

	function handleContractsHighlightMissing() {
		nonBlockingMessageCode = 'contracts_highlight_not_found';
		handleContractsHighlightConsumed();
	}
</script>

<div class="mx-auto h-full max-w-6xl px-2 py-6 md:px-0 md:py-0">
	<div class="mb-6 flex items-center justify-between">
		<div>
			<h3 class="font-bold">{translateOrFallback('dashboard.earning.title', 'Earning')}</h3>
			<p class="text-base-content/70">
				{translateOrFallback(
					'dashboard.earning.description',
					'Track your bids, requests, contracts, and service listings.'
				)}
			</p>
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
					aria-label="Wallet icon"
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

	{#if nonBlockingMessageCode}
		<div class="alert alert-info my-4 text-sm">
			<span>
				{#if nonBlockingMessageCode === 'service_quotes_request_not_found'}
					The selected service quote thread could not be found.
				{:else if nonBlockingMessageCode === 'contracts_highlight_not_found'}
					The requested contract highlight could not be found.
				{/if}
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
			<DashboardBidsPanel />
		</div>
	{:else if activeTabId === 'requests'}
		<div
			id="panel-requests"
			role="tabpanel"
			aria-labelledby="tab-requests"
			transition:slide={{ duration: 300 }}
		>
			<DashboardMyServicesPanel
				view="quotes"
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
				initialContext={contractsContext}
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
			<DashboardMyServicesPanel view="default" onOpenServiceQuotes={handleOpenServiceQuotes} />
		</div>
	{:else if activeTabId === 'saved-searches'}
		<div
			id="panel-saved-searches"
			role="tabpanel"
			aria-labelledby="tab-saved-searches"
			transition:slide={{ duration: 300 }}
		>
			<DashboardSavedSearchesPanel />
		</div>
	{/if}
</div>
