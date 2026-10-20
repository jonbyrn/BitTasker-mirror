<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { t } from 'svelte-i18n';
	import Tabs from '$lib/components/Tabs.svelte';

	let { children } = $props();

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
	<meta
		name="description"
		content={translateOrFallback(
			'dashboard.hiring.page_description',
			'Manage your tasks, contracts, and service requests'
		)}
	/>
</svelte:head>

<div class="mx-auto flex w-full max-w-5xl flex-col gap-4 p-3 sm:p-6">
	<div class="flex min-w-0 flex-wrap items-center justify-between gap-3">
		<div class="min-w-0">
			<h2 class="text-2xl font-semibold sm:text-3xl">
				{translateOrFallback('dashboard.hiring.title', 'Hiring')}
			</h2>
		</div>
		<a
			href={activeTab.buttonHref}
			class="btn btn-primary btn-sm sm:btn-md w-full whitespace-normal sm:w-auto"
		>
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

	<Tabs {tabs} activeTab={activeTabId} onTabChange={handleTabChange} />

	{@render children?.()}
</div>
