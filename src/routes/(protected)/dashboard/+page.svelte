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
	// Tab management
	let availableTabs = $state([
		{ id: 'tasks', label: $t('dashboard.tabs.tasks') },
		{ id: 'saved-searches', label: $t('dashboard.tabs.saved_searches') }
		// { id: 'recurring', label: $t('dashboard.tabs.recurring') }
	]);
	let activeTab = $state('');

	// Task drawer state
	let selectedTask = $state<Task | null>(null);
	let drawerOpen = $state(false);
	let drawerInitialTab = $state('details');
	let isLoading = $state(false);

	// Set active tab based on URL param
	onMount(() => {
		isLoading = true;
		const tabParam = page.url.searchParams.get('tab');
		if (tabParam && availableTabs.some((tab) => tab.id === tabParam)) {
			activeTab = tabParam;
		} else if (!tabParam) {
			activeTab = 'tasks';
			// Set default tab in URL if not present
			updateUrlParam(activeTab);
		}
		isLoading = false;
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
		isLoading = true;
		selectedTask = null;
		drawerOpen = false;
		setTimeout(() => {
			isLoading = false;
		}, 1000);
	};
</script>

<div class="h-full px-4 py-8">
	<!-- Dashboard Header -->
	<div class="mb-6 flex items-center justify-between">
		<h2 class="text-2xl font-bold">{$t('dashboard.title')}</h2>
		<a href="/dashboard/create-task" class="btn btn-primary">
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="mr-2 h-5 w-5"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
			>
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
			</svg>
			{$t('dashboard.create_task')}
		</a>
	</div>

	<!-- Dashboard Tabs -->
	<Tabs tabs={availableTabs} {activeTab} onTabChange={handleTabChange} />

	{#if isLoading}
		<div class="flex h-full justify-center">
			<span class="loading loading-spinner loading-lg"></span>
		</div>
	{:else if activeTab === 'tasks'}
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
	{/if}
</div>

<!-- Task Drawer -->
<TaskDrawer
	task={selectedTask}
	isOpen={drawerOpen}
	activeTab={drawerInitialTab}
	onClose={closeTaskDrawer}
/>
