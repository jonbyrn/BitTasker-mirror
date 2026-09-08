<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { t } from 'svelte-i18n';
	import Tabs from '$lib/components/Tabs.svelte';

	let { children } = $props();

	let width = $state(375);

	function translateOrFallback(key: string, fallback: string): string {
		const translated = $t(key);
		return translated === key ? fallback : translated;
	}

	/**
	 * Tab configuration for the hiring section.
	 * Each tab maps to a sub-route under /hiring/.
	 */
	const tabs = $derived([
		{
			id: 'my-tasks',
			label: translateOrFallback('dashboard.tabs.tasks', 'My Tasks'),
			buttonLabel: translateOrFallback('dashboard.create_task', 'Create Task'),
			buttonHref: '/create-task',
			icon: 'plus'
		},
		{
			id: 'contracts',
			label: translateOrFallback('dashboard.tabs.contracts', 'Contracts'),
			buttonLabel: translateOrFallback('dashboard.create_task', 'Create Task'),
			buttonHref: '/create-task',
			icon: 'plus'
		},
		{
			id: 'service-requests',
			label: translateOrFallback('dashboard.tabs.quotes', 'Service Requests'),
			buttonLabel: translateOrFallback('dashboard.find_services', 'Find Services'),
			buttonHref: '/services',
			icon: 'search'
		}
	]);

	/**
	 * Determine active tab from the current URL path.
	 * Matches /hiring/my-tasks, /hiring/contracts, /hiring/service-requests.
	 * Defaults to 'my-tasks' if no match.
	 */
	let activeTabId = $derived.by(() => {
		const path = page.url.pathname;
		const match = path.match(/\/hiring\/([\w-]+)/);
		const tabFromPath = match?.[1];
		if (tabFromPath && tabs.some((t) => t.id === tabFromPath)) {
			return tabFromPath;
		}
		return 'my-tasks';
	});

	const activeTab = $derived.by(() => tabs.find((tab) => tab.id === activeTabId) || tabs[0]);

	/**
	 * Navigate to the selected tab's route.
	 * Preserves existing query params (type, highlight, status, etc.)
	 */
	function handleTabChange(tabId: string) {
		const nextUrl = new URL(`/hiring/${tabId}`, page.url.origin);
		// Carry over relevant query params for backward compatibility
		for (const [key, value] of page.url.searchParams) {
			nextUrl.searchParams.set(key, value);
		}
		goto(nextUrl.toString(), { replaceState: true, keepFocus: true, noScroll: true });
	}
</script>

<svelte:head>
	<title>{translateOrFallback('dashboard.hiring.page_title', 'Hiring')} - BitTasker</title>
	<meta name="description" content={translateOrFallback('dashboard.hiring.page_description', 'Manage your tasks, contracts, and service requests')} />
</svelte:head>

<svelte:window bind:innerWidth={width} />

<div
	class="bg-base-200 dashboard-layout mx-auto flex h-full min-h-0 w-full flex-col overflow-hidden md:py-4"
>
	<div class="flex min-h-0 flex-1 flex-row gap-8 overflow-hidden">
		<!-- Main Content -->
		<div class="min-h-0 w-full flex-1 overflow-hidden">
			<div class="mx-auto h-full max-w-6xl py-4 md:px-0 md:py-0">
				<!-- Hiring Header -->
				<div class="mb-2 flex items-center justify-between gap-3 md:mb-6">
					<div class="min-w-0">
						<h3 class="font-bold">
							{translateOrFallback('dashboard.hiring.title', 'Hiring')}
						</h3>
					</div>
					<a href={activeTab.buttonHref} class="btn btn-primary btn-sm sm:btn-md whitespace-nowrap">
						{#if activeTab.icon === 'search'}
							<svg
								xmlns="http://www.w3.org/2000/svg"
								class="mr-1 h-4 w-4 sm:mr-2 sm:h-5 sm:w-5"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
								aria-label={translateOrFallback('dashboard.page.search_icon_alt', 'Search')}
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
								/>
							</svg>
						{:else}
							<svg
								xmlns="http://www.w3.org/2000/svg"
								class="mr-1 h-4 w-4 sm:mr-2 sm:h-5 sm:w-5"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
								aria-label={translateOrFallback('dashboard.page.plus_icon_alt', 'Create')}
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

				<!-- Hiring Tabs -->
				<Tabs {tabs} activeTab={activeTabId} onTabChange={handleTabChange} />

				{@render children?.()}
			</div>
		</div>
	</div>
</div>

<style>
	/* Ensure dashboard layout fills available space without causing scroll */
	.dashboard-layout {
		height: 100%;
		max-height: 100%;
		overflow: hidden;
		flex: 1;
		min-height: 0;
	}
</style>
