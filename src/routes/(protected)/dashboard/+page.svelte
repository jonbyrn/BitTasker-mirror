<script lang="ts">
	import type { Task } from '$lib/types/task';
	import { onMount } from 'svelte';
	import { slide } from 'svelte/transition';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { t } from 'svelte-i18n';
	import Tabs from '$lib/components/Tabs.svelte';
	import TaskDrawer from '$lib/components/task/TaskDrawer.svelte';
	import DashboardTasksPanel from '$lib/components/task/DashboardTasksPanel.svelte';
	import DashboardSavedSearchesPanel from '$lib/components/task/DashboardSavedSearchesPanel.svelte';
	import DashboardBidsPanel from '$lib/components/bidding/DashboardBidsPanel.svelte';
	import DashboardContractsPanel from '$lib/components/contracts/DashboardContractsPanel.svelte';
	// Tab management - reactive to language changes
	const availableTabs = $derived([
		{ id: 'tasks', label: $t('dashboard.tabs.tasks') },
		{ id: 'bids', label: $t('dashboard.tabs.bids') },
		{ id: 'contracts', label: $t('dashboard.tabs.contracts') },
		{ id: 'saved-searches', label: $t('dashboard.tabs.saved_searches') }
		// { id: 'recurring', label: $t('dashboard.tabs.recurring') }
	]);
	let activeTab = $state('');

	// Task drawer state
	let selectedTask = $state<Task | null>(null);
	let drawerOpen = $state(false);
	let drawerInitialTab = $state('details');

	// Set active tab based on URL param
	onMount(() => {
		const tabParam = page.url.searchParams.get('tab');
		if (tabParam && availableTabs.some((tab) => tab.id === tabParam)) {
			activeTab = tabParam;
		} else if (!tabParam) {
			activeTab = 'tasks';
			// Set default tab in URL if not present
			updateUrlParam(activeTab);
		}
	});

	// Update URL when tab changes
	function updateUrlParam(tabId: string) {
		const url = new URL(window.location.href);
		url.searchParams.set('tab', tabId);
		goto(url.toString(), { replaceState: true, keepFocus: true, noScroll: true });
	}

	// Handle tab change
	function handleTabChange(tabId: string) {
		activeTab = tabId;
		updateUrlParam(tabId);
	}

	// Task drawer functions
	const openTaskDrawer = (task: Task, tab: string = 'details') => {
		selectedTask = task;
		drawerInitialTab = tab;
		drawerOpen = true;
	};

	const closeTaskDrawer = () => {
		selectedTask = null;
		drawerOpen = false;
	};
</script>

<div class="mx-auto h-full max-w-7xl px-2 py-6 md:px-0 md:py-0">
	<!-- Dashboard Header -->
	<div class="mb-6 flex items-center justify-between">
		<div>
			<h3 class="font-bold">{$t('dashboard.title')}</h3>
			<p class="text-base-content/70 px-1">{$t('dashboard.description')}</p>
		</div>
		<a
			href={activeTab === 'bids' || activeTab === 'saved-searches'
				? '/dashboard/find-tasks'
				: activeTab === 'contracts'
				? '/dashboard/wallet'
				: '/dashboard/create-task'}
			class="btn btn-primary btn-sm sm:btn-md whitespace-nowrap"
		>
			{#if activeTab === 'bids' || activeTab === 'saved-searches'}
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="mr-1 h-4 w-4 sm:mr-2 sm:h-5 sm:w-5"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
					aria-label={$t('dashboard.page.search_icon_alt')}
				>
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
				</svg>
			{:else if activeTab === 'contracts'}
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="mr-1 h-4 w-4 sm:mr-2 sm:h-5 sm:w-5"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
					aria-label="Wallet icon"
				>
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
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
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
				</svg>
			{/if}
			<span class="hidden sm:inline">
				{activeTab === 'bids' || activeTab === 'saved-searches'
					? $t('dashboard.find_task')
					: activeTab === 'contracts'
					? $t('dashboard.manage_wallet')
					: $t('dashboard.create_task')}
			</span>
			<span class="sm:hidden">
				{activeTab === 'bids' || activeTab === 'saved-searches'
					? $t('dashboard.find_task')
					: activeTab === 'contracts'
					? $t('dashboard.wallet')
					: $t('dashboard.create_task')}
			</span>
		</a>
	</div>

	<!-- Dashboard Tabs -->
	<Tabs tabs={availableTabs} {activeTab} onTabChange={handleTabChange} />

	{#if activeTab === 'tasks'}
		<!-- Tasks Panel -->
		<div
			id="panel-tasks"
			role="tabpanel"
			aria-labelledby="tab-tasks"
			transition:slide={{ duration: 300 }}
		>
			<DashboardTasksPanel {openTaskDrawer} />
		</div>
	{:else if activeTab === 'saved-searches'}
		<div
			id="panel-saved-searches"
			role="tabpanel"
			aria-labelledby="tab-saved-searches"
			transition:slide={{ duration: 300 }}
		>
			<DashboardSavedSearchesPanel />
		</div>
	{:else if activeTab === 'bids'}
		<div
			id="panel-bids"
			role="tabpanel"
			aria-labelledby="tab-bids"
			transition:slide={{ duration: 300 }}
		>
			<DashboardBidsPanel />
		</div>
	{:else if activeTab === 'contracts'}
		<div
			id="panel-contracts"
			role="tabpanel"
			aria-labelledby="tab-contracts"
			transition:slide={{ duration: 300 }}
		>
			<DashboardContractsPanel />
		</div>
	{/if}
</div>

<!-- Task Drawer -->
<TaskDrawer
	task={selectedTask}
	isOpen={drawerOpen}
	activeTab={drawerInitialTab}
	onClose={closeTaskDrawer}
/>
