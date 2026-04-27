<script lang="ts">
	// Earning routes layout
	import { resolve } from '$app/paths';
	import { devicePlatform } from '$lib/stores/device.store';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { t } from 'svelte-i18n';
	import Tabs from '$lib/components/Tabs.svelte';
	import { type EarningTab } from '$lib/utils/dashboardQuery';
	import { sections } from '$lib/utils/consts';
	import IconTrendingUp from '~icons/mdi/trending-up';
	import IconBriefcaseOutline from '~icons/mdi/briefcase-outline';
	import IconPlusCircleOutline from '~icons/mdi/plus-circle-outline';
	import IconMagnify from '~icons/mdi/magnify';
	import IconBriefcaseSearch from '~icons/mdi/briefcase-search';
	import IconWalletOutline from '~icons/mdi/wallet-outline';
	import IconAccount from '~icons/mdi/account';
	import IconChatOutline from '~icons/mdi/chat-outline';
	import IconCog from '~icons/mdi/cog';

	let { children } = $props();

	let width = $state(375);

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
				label: 'Services',
				buttonLabel: translateOrFallback(
					translate,
					'dashboard.services.my_services.create_service',
					'Create Service'
				),
				buttonHref: '/dashboard/create-service',
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

<svelte:window bind:innerWidth={width} />

<div
	class="bg-base-200 dashboard-layout mx-auto flex h-full min-h-0 w-full flex-col overflow-hidden px-2 md:py-4"
>
	<div class="flex min-h-0 flex-1 flex-row gap-8 overflow-hidden">
		{#if $devicePlatform !== 'ios' && $devicePlatform !== 'android' && width >= 1200}
			<!-- Fixed Sidebar - Desktop only -->
			<div class="w-full shrink-0 md:w-64">
				<div class="fixed top-24 left-8 z-10 w-64">
					<div class="card bg-base-100 rounded-xl shadow-xl">
						<div class="card-body p-4">
							<ul class="menu bg-base-100 rounded-box w-full">
								{#each sections as section (section.id)}
									<li class="my-1">
										<a
											data-sveltekit-reload="off"
											href={resolve(section.path)}
											class:menu-active={page.url.pathname + page.url.search === section.path ||
												page.url.pathname === section.path}
											class="flex items-center gap-3"
										>
											{#if section.icon === 'mdi:briefcase-outline'}
												<IconBriefcaseOutline class="text-primary" />
											{:else if section.icon === 'mdi:trending-up'}
												<IconTrendingUp class="text-primary" />
											{:else if section.icon === 'mdi:plus-circle-outline'}
												<IconPlusCircleOutline class="text-primary" />
											{:else if section.icon === 'mdi:magnify'}
												<IconMagnify class="text-primary" />
											{:else if section.icon === 'mdi:briefcase-search'}
												<IconBriefcaseSearch class="text-primary" />
											{:else if section.icon === 'mdi:wallet-outline'}
												<IconWalletOutline class="text-primary" />
											{:else if section.icon === 'mdi:account'}
												<IconAccount class="text-primary" />
											{:else if section.icon === 'mdi:chat-outline'}
												<IconChatOutline class="text-primary" />
											{:else if section.icon === 'mdi:cog'}
												<IconCog class="text-primary" />
											{:else}
												<IconTrendingUp class="text-primary" />
											{/if}
											{$t(section.label)}
										</a>
									</li>
								{/each}
							</ul>
						</div>
					</div>
				</div>
			</div>
		{/if}

		<!-- Main Content -->
		<div class="min-h-0 w-full flex-1 overflow-hidden">
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

				{@render children()}
			</div>
		</div>
	</div>
</div>

<style>
	.dashboard-layout {
		height: 100%;
		max-height: 100%;
		overflow: hidden;
		flex: 1;
		min-height: 0;
	}
</style>
