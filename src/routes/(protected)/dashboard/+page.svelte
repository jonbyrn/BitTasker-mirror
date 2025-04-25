<script lang="ts">
	import { onMount } from 'svelte';
	import { slide } from 'svelte/transition';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import Tabs from '$lib/components/Tabs.svelte';
	import TaskDrawer from '$lib/components/task/TaskDrawer.svelte';
	import DashboardBidsPanel from '$lib/components/bidding/DashboardBidsPanel.svelte';
	import RecurringTasksPanel from '$lib/components/task/RecurringTasksPanel.svelte';
	import DashboardTasksPanel from '$lib/components/task/DashboardTasksPanel.svelte';

	// Tab management
	let availableTabs = $state([
		{ id: 'tasks', label: 'My Tasks' },
		{ id: 'bids', label: 'My Bids' },
		{ id: 'recurring', label: 'Recurring Tasks' }
	]);
	let activeTab = $state('');

	// Task drawer state
	let selectedTaskId = $state<number | null>(null);
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
	const openTaskDrawer = (taskId: number, tab: string = 'details') => {
		selectedTaskId = taskId;
		drawerInitialTab = tab;
		drawerOpen = true;
	};

	const closeTaskDrawer = () => (drawerOpen = false);
</script>

<div class="mb-6">
	<!-- Dashboard Header -->
	<div class="mb-6 flex items-center justify-between">
		<h2 class="text-2xl font-bold">My Dashboard</h2>
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
			Create Task
		</a>
	</div>

	<!-- Dashboard Tabs -->
	<Tabs tabs={availableTabs} {activeTab} onTabChange={handleTabChange} />

	<!-- Tasks Panel -->
	{#if activeTab === 'tasks'}
		<div
			id="panel-tasks"
			role="tabpanel"
			aria-labelledby="tab-tasks"
			class="card bg-base-100 shadow-xl"
			transition:slide={{ duration: 300 }}
		>
			<DashboardTasksPanel {openTaskDrawer} />
		</div>
	{:else if activeTab === 'bids'}
		<!-- Bids Panel -->
		<div
			id="panel-bids"
			role="tabpanel"
			aria-labelledby="tab-bids"
			class="card bg-base-100 shadow-xl"
			transition:slide={{ duration: 300 }}
		>
			<div class="card-body">
				<DashboardBidsPanel />
			</div>
		</div>
	{:else if activeTab === 'recurring'}
		<!-- Recurring Tasks Panel -->
		<div
			id="panel-recurring"
			role="tabpanel"
			aria-labelledby="tab-recurring"
			class="card bg-base-100 shadow-xl"
			transition:slide={{ duration: 300 }}
		>
			<div class="card-body">
				<RecurringTasksPanel />
			</div>
		</div>
	{/if}
</div>

<!-- Task Drawer -->
<TaskDrawer
	taskId={selectedTaskId}
	isOpen={drawerOpen}
	activeTab={drawerInitialTab}
	onClose={closeTaskDrawer}
/>
