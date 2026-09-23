<script lang="ts">
	import { type EarningTab } from '$lib/utils/dashboardQuery';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { t } from 'svelte-i18n';
	import Tabs from '$lib/components/Tabs.svelte';

	let { children } = $props();

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
				buttonHref: '/create-service',
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
				label: translateOrFallback(translate, 'dashboard.tabs.my_services', 'Services'),
				buttonLabel: translateOrFallback(
					translate,
					'dashboard.services.my_services.create_service',
					'Create Service'
				),
				buttonHref: '/create-service',
				icon: 'plus'
			},
			{
				id: 'alerts',
				label: translateOrFallback(translate, 'dashboard.tabs.saved_searches', 'Alerts'),
				buttonLabel: translateOrFallback(translate, 'dashboard.find_task', 'Find Tasks'),
				buttonHref: '/tasks',
				icon: 'search'
			}
		];
	});

	// Get current tab from URL path
	let activeTabId = $derived.by(() => {
		const path = page.url.pathname;
		const match = path.match(/\/earning\/([\w-]+)/);
		const tabFromPath = match?.[1];
		if (tabFromPath && tabs.some((t) => t.id === tabFromPath)) {
			return tabFromPath as EarningTab;
		}
		return 'bids';
	});

	const activeTab = $derived.by(() => tabs.find((tab) => tab.id === activeTabId) || tabs[0]);

	function handleTabChange(tabId: string) {
		goto(`/earning/${tabId}`, { replaceState: true, keepFocus: true, noScroll: true });
	}
</script>

<svelte:head>
	<title>{$t('dashboard.earning.page_title') || 'Earning'}</title>
</svelte:head>

<div class="mx-auto flex w-full max-w-5xl flex-col gap-4 p-3 sm:p-6">
	<div class="flex items-center justify-between gap-3">
		<div class="min-w-0">
			<h2 class="text-2xl font-semibold sm:text-3xl">
				{translateOrFallback($t, 'dashboard.earning.title', 'Earning')}
			</h2>
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

	{@render children?.()}
</div>
