<script lang="ts">
	import type { Task, TaskBody } from '$lib/types/task';
	import { onMount } from 'svelte';
	import { fade, scale, slide } from 'svelte/transition';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { t } from 'svelte-i18n';
	import { taskStore } from '$lib/stores/task.store';
	import { deleteTask } from '$lib/nostr/task';
	import { myTasksStore } from '$lib/stores/task.store';
	import { escrow } from '$lib/utils/escrow';
	import { appStore } from '$lib/stores/app.store';
	import Tabs from '$lib/components/Tabs.svelte';
	import TaskDrawer from '$lib/components/task/TaskDrawer.svelte';
	import DashboardTasksPanel from '$lib/components/task/DashboardTasksPanel.svelte';
	import DashboardContractsPanelNDK from '$lib/components/contracts/DashboardContractsPanelNDK.svelte';
	import MyQuotesPanel from '$lib/components/dashboard/quotes/MyQuotesPanel.svelte';
	import {
		createDashboardUrl,
		getTaskerTimelines,
		isRequestSyncActive,
		serviceQuoteUiStore,
		type DashboardContractsType,
		type DashboardTab
	} from '$lib/stores/service-quote-ui.store';
	import { buildEarningQueryUrl } from '$lib/utils/dashboardQuery';
	import type { DashboardContractTypeFilter } from '$lib/utils/helpers/dashboardContractFilters';

	function translateOrFallback(key: string, fallback: string): string {
		const translated = $t(key);
		return translated === key ? fallback : translated;
	}

	const HIRING_TABS = new Set<DashboardTab>(['tasks', 'service-requests', 'contracts']);

	// Tab configuration - reactive to language changes
	const tabs = $derived([
		{
			id: 'tasks',
			label: $t('dashboard.tabs.tasks'),
			buttonLabel: $t('dashboard.create_task'),
			buttonHref: '/dashboard/create-task',
			icon: 'plus'
		},
		{
			id: 'contracts',
			label: $t('dashboard.tabs.contracts'),
			buttonLabel: $t('dashboard.create_task'),
			buttonHref: '/dashboard/create-task',
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

	function getInitialRouteState(currentUrl: URL) {
		const parsed = serviceQuoteUiStore.parseDashboardQuery(currentUrl.searchParams);
		return {
			activeTabId: HIRING_TABS.has(parsed.state.tab) ? parsed.state.tab : 'tasks',
			contractsType: parsed.state.type ?? 'all',
			focusedRequestId: parsed.state.requestId,
			nonBlockingMessageCode: parsed.messageCode,
			currentContractsHighlight: parsed.state.highlight,
			activeStatus: parsed.state.status
		};
	}

	const initialRouteState = getInitialRouteState(page.url);

	let activeTabId = $state<DashboardTab>(initialRouteState.activeTabId);
	const activeTab = $derived(tabs.find((t) => t.id === activeTabId) || tabs[0]);
	let contractsType = $state<DashboardContractsType>(initialRouteState.contractsType);
	let focusedRequestId = $state<string | null>(initialRouteState.focusedRequestId);
	let activeStatus = $state<string | null>(initialRouteState.activeStatus);
	let taskerTimelines = $state<ReturnType<typeof getTaskerTimelines>>([]);
	let nonBlockingMessageCode = $state<string | null>(initialRouteState.nonBlockingMessageCode);
	let taskerQuotesStoreSyncing = $state(false);
	const taskerQuotesSyncing = $derived(taskerQuotesStoreSyncing);
	let taskerQuotesError = $state<string | null>(null);
	let taskerQuotesLoaded = $state(false);
	let currentContractsHighlight = $state<string | null>(
		initialRouteState.currentContractsHighlight
	);

	const contractsInitialType = $derived<DashboardContractTypeFilter>(() => {
		if (contractsType === 'services') return 'services';
		if (contractsType === 'tasks') return 'tasks';
		return 'all';
	});

	// Task drawer state
	let selectedTask = $state<Task | null>(null);
	let drawerOpen = $state(false);
	let drawerInitialTab = $state('details');
	let activeTaskModal = $state<'edit' | 'delete' | null>(null);
	let isDeleting = $state(false);

	function decodeLegacySearchParam(value: string | null): string | null {
		if (!value) {
			return null;
		}

		try {
			return decodeURIComponent(value);
		} catch {
			return value;
		}
	}

	function getLegacyEarningRedirectUrl(currentUrl: URL): URL | null {
		const rawTab = currentUrl.searchParams.get('tab');
		if (!rawTab) {
			return null;
		}

		const nextUrl = new URL('/earning', currentUrl.origin);

		if (rawTab === 'bids' || rawTab === 'saved-searches') {
			return new URL(
				buildEarningQueryUrl(nextUrl, {
					tab: rawTab
				})
			);
		}

		if (rawTab === 'my-services') {
			const view = currentUrl.searchParams.get('view');
			const service = currentUrl.searchParams.get('service');
			const request = currentUrl.searchParams.get('request');

			if (view === 'service-requests' || view === 'quotes' || service || request) {
				return new URL(
					buildEarningQueryUrl(nextUrl, {
						tab: 'requests',
						service: decodeLegacySearchParam(service),
						request
					})
				);
			}

			return new URL(
				buildEarningQueryUrl(nextUrl, {
					tab: 'my-services'
				})
			);
		}

		if (rawTab === 'requests') {
			return new URL(
				buildEarningQueryUrl(nextUrl, {
					tab: 'requests',
					service: decodeLegacySearchParam(currentUrl.searchParams.get('service')),
					request: currentUrl.searchParams.get('request')
				})
			);
		}

		return null;
	}

	function syncRouteState() {
		const earningRedirectUrl = getLegacyEarningRedirectUrl(page.url);
		if (earningRedirectUrl) {
			goto(earningRedirectUrl.toString(), {
				replaceState: true,
				keepFocus: true,
				noScroll: true
			});
			return;
		}

		const parsed = serviceQuoteUiStore.parseDashboardQuery(page.url.searchParams);
		activeTabId = HIRING_TABS.has(parsed.state.tab) ? parsed.state.tab : 'tasks';
		contractsType = parsed.state.type ?? 'all';
		focusedRequestId = parsed.state.requestId;
		nonBlockingMessageCode = parsed.messageCode;
		currentContractsHighlight = parsed.state.highlight;
		activeStatus = parsed.state.status ?? parsed.state.taskStatus ?? null;

		if (parsed.changed) {
			const nextSearch = parsed.searchParams.toString();
			const nextUrl = `${page.url.pathname}${nextSearch ? `?${nextSearch}` : ''}${page.url.hash}`;
			goto(nextUrl.toString(), { replaceState: true, keepFocus: true, noScroll: true });
		}
	}

	// Set active tab based on URL param
	onMount(() => {
		syncRouteState();

		const unsubscribeServiceQuotes = serviceQuoteUiStore.subscribe((state) => {
			taskerTimelines = getTaskerTimelines(state);
			nonBlockingMessageCode = state.nonBlockingMessageCode;
			taskerQuotesError = state.taskerLoadError;
			taskerQuotesLoaded = state.taskerLoaded;
			taskerQuotesStoreSyncing =
				state.loadingTasker || isRequestSyncActive(state, focusedRequestId, null);
			syncRouteState();
		});

		return () => {
			unsubscribeServiceQuotes();
		};
	});

	// Watch for URL changes and update active tab
	$effect(() => {
		page.url.searchParams.toString();
		syncRouteState();
	});

	$effect(() => {
		if (activeTabId !== 'service-requests') {
			taskerQuotesError = null;
			return;
		}

		void serviceQuoteUiStore.loadTaskerTimelines(focusedRequestId).catch(() => {
			// The store exposes taskerQuotesError for inline retry UX.
		});
	});

	// Handle tab change
	function handleTabChange(tabId: string) {
		if (!tabs.some((t) => t.id === tabId)) {
			return;
		}

		serviceQuoteUiStore.setNonBlockingMessage(null);
		const nextUrl = createDashboardUrl(page.url, {
			tab: tabId as DashboardTab,
			view: tabId === 'service-requests' ? 'tasker' : 'default',
			type: tabId === 'contracts' ? contractsType : 'all',
			serviceAddress: null,
			requestId: null,
			highlight: null,
			status: activeStatus
		});
		goto(nextUrl.toString(), { replaceState: true, keepFocus: true, noScroll: true });
	}

	function handleTaskerRequestFocus(requestId: string | null) {
		serviceQuoteUiStore.setNonBlockingMessage(
			requestId === null ? 'service_requests_request_not_found' : null
		);
		const nextUrl = createDashboardUrl(page.url, {
			tab: 'service-requests',
			view: 'tasker',
			requestId,
			status: activeStatus
		});
		goto(nextUrl.toString(), { replaceState: true, keepFocus: true, noScroll: true });
	}

	function handleTaskerRequestClear() {
		serviceQuoteUiStore.setNonBlockingMessage(null);
		const nextUrl = createDashboardUrl(page.url, {
			tab: 'service-requests',
			view: 'tasker',
			requestId: null,
			status: activeStatus
		});
		goto(nextUrl.toString(), { replaceState: true, keepFocus: true, noScroll: true });
	}

	function handleContractsHighlightConsumed() {
		const nextUrl = createDashboardUrl(page.url, {
			tab: 'contracts',
			type: contractsType,
			highlight: null
		});
		goto(nextUrl.toString(), { replaceState: true, keepFocus: true, noScroll: true });
	}

	function handleContractsHighlightMissing() {
		serviceQuoteUiStore.setNonBlockingMessage('contracts_highlight_not_found');
		const nextUrl = createDashboardUrl(page.url, {
			tab: 'contracts',
			type: contractsType,
			highlight: null
		});
		goto(nextUrl.toString(), { replaceState: true, keepFocus: true, noScroll: true });
	}

	// Task drawer functions
	const setDrawerState = (
		isOpen: boolean,
		task: Task | null = selectedTask,
		tab: string = drawerInitialTab
	) => {
		drawerOpen = isOpen;
		selectedTask = task;
		drawerInitialTab = tab;
		if (!isOpen) activeTaskModal = null;
	};

	const setTaskModal = (type: 'edit' | 'delete' | null) => {
		if (type && !selectedTask) return;
		activeTaskModal = type;
	};

	const confirmEditTask = async () => {
		const taskToEdit = selectedTask;
		if (!taskToEdit) return;

		// Check if task has contracts - prevent editing if contracts exist
		try {
			const contracts = await escrow.contractOps.getContracts({ taskIds: [taskToEdit.id] });
			if (contracts.length > 0) {
				appStore.showErrorToast(
					$t('dashboard.task_details_by_task.cannot_edit_with_contract') ||
						'Cannot edit task: A contract has been created for this task.'
				);
				activeTaskModal = null;
				return;
			}
		} catch (error) {
			console.error('Error checking contracts before edit:', error);
			// On error, be conservative and prevent editing
			appStore.showErrorToast(
				$t('dashboard.task_details_by_task.cannot_edit_error') ||
					'Unable to verify if task can be edited. Please try again.'
			);
			activeTaskModal = null;
			return;
		}

		const editTask: TaskBody = {
			title: taskToEdit.title,
			taskType: taskToEdit.taskType,
			description: taskToEdit.description,
			budget: taskToEdit.budget,
			deadline: taskToEdit.deadline ?? undefined,
			dateRange: taskToEdit.dateRange ?? undefined,
			pickupLocation: taskToEdit.pickupLocation ?? undefined,
			dropOffLocation: taskToEdit.dropOffLocation ?? undefined,
			skills: taskToEdit.skills,
			categories: taskToEdit.categories,
			attachments: taskToEdit.attachments,
			status: taskToEdit.status,
			translations: taskToEdit.translations
		};
		taskStore.saveEditTaskDraft(taskToEdit.id, taskToEdit.id, editTask);
		activeTaskModal = null;
		goto(`/dashboard/create-task?edit=true`);
	};

	const confirmDeleteTask = async () => {
		const taskToDelete = selectedTask;
		if (!taskToDelete) return;
		try {
			isDeleting = true;
			const eventId =
				'eventId' in taskToDelete
					? (taskToDelete as Task & { eventId?: string }).eventId
					: undefined;
			await deleteTask(taskToDelete.id, eventId);
			$myTasksStore.items = $myTasksStore.items.filter((t) => t.id !== taskToDelete.id);
			activeTaskModal = null;
			setDrawerState(false, null);
		} catch (error) {
			console.error('Failed to delete task:', error);
		} finally {
			isDeleting = false;
		}
	};
</script>

<div class="mx-auto h-full max-w-6xl py-6 md:px-0 md:py-0">
	<!-- Dashboard Header -->
	<div class="mb-6 flex items-center justify-between gap-3">
		<div class="min-w-0">
			<h3 class="font-bold">{translateOrFallback('dashboard.hiring.title', 'Hiring')}</h3>
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
			{:else if activeTab.icon === 'plus'}
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

	<!-- Dashboard Tabs -->
	<Tabs {tabs} activeTab={activeTabId} onTabChange={handleTabChange} />

	{#if nonBlockingMessageCode}
		<div class="alert alert-info my-4 text-sm">
			<span>
				{#if nonBlockingMessageCode === 'service_requests_request_not_found'}
					{translateOrFallback(
						'dashboard.hiring.messages.quotes_request_not_found',
						'The requested quote thread could not be found.'
					)}
				{:else if nonBlockingMessageCode === 'service_quotes_request_not_found'}
					{translateOrFallback(
						'dashboard.hiring.messages.service_quotes_request_not_found',
						'The selected service quote thread could not be found.'
					)}
				{:else if nonBlockingMessageCode === 'contracts_highlight_not_found'}
					{translateOrFallback(
						'dashboard.hiring.messages.contracts_highlight_not_found',
						'The requested contract highlight could not be found.'
					)}
				{:else}
					{translateOrFallback(
						'dashboard.hiring.messages.service_quote_protocol_pending',
						'Service quote protocol wiring is pending; local UI state is being shown for now.'
					)}
				{/if}
			</span>
		</div>
	{/if}

	{#if activeTabId === 'tasks'}
		<!-- Tasks Panel -->
		<div
			id="panel-tasks"
			role="tabpanel"
			aria-labelledby="tab-tasks"
			transition:slide={{ duration: 300 }}
		>
			<DashboardTasksPanel
				status={activeStatus}
				openTaskDrawer={(task, tab = 'details') => setDrawerState(true, task, tab)}
			/>
		</div>
	{:else if activeTabId === 'contracts'}
		<div
			id="panel-contracts"
			role="tabpanel"
			aria-labelledby="tab-contracts"
			transition:slide={{ duration: 300 }}
		>
			<DashboardContractsPanelNDK
				initialType={contractsInitialType()}
				showRoleFilters={false}
				fixedRole="client"
				highlightEscrowId={currentContractsHighlight}
				onHighlightConsumed={handleContractsHighlightConsumed}
				onHighlightMissing={handleContractsHighlightMissing}
			/>
		</div>
	{:else if activeTabId === 'service-requests'}
		<div
			id="panel-service-requests"
			role="tabpanel"
			aria-labelledby="tab-service-requests"
			transition:slide={{ duration: 300 }}
		>
			<MyQuotesPanel
				timelines={taskerTimelines}
				{focusedRequestId}
				status={activeStatus}
				restoreFocusedRequest={true}
				isSyncing={taskerQuotesSyncing}
				hasLoaded={taskerQuotesLoaded}
				loadError={taskerQuotesError}
				onRetry={() => serviceQuoteUiStore.loadTaskerTimelines(focusedRequestId).catch(() => {})}
				onRequestFocusChange={handleTaskerRequestFocus}
				onRequestClear={handleTaskerRequestClear}
				onInvalidFocusedRequest={() => handleTaskerRequestFocus(null)}
			/>
		</div>
	{/if}
</div>

<!-- Task Drawer -->
<TaskDrawer
	task={selectedTask}
	isOpen={drawerOpen}
	activeTab={drawerInitialTab}
	onClose={() => setDrawerState(false, null)}
	onRequestEditConfirm={() => setTaskModal('edit')}
	onRequestDeleteConfirm={() => setTaskModal('delete')}
	{isDeleting}
/>

<!-- Edit Task Confirmation Modal (outside drawer context) -->
{#if activeTaskModal === 'edit' && selectedTask}
	<div class="modal modal-open modal-middle" transition:fade={{ duration: 200 }}>
		<div class="modal-box max-w-md" transition:scale={{ duration: 200, start: 0.9 }}>
			<!-- Modal Header -->
			<div class="mb-6">
				<div class="mb-2 flex items-center gap-3">
					<div class="bg-error/10 flex h-10 w-10 items-center justify-center rounded-full">
						<svg class="text-error h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"
							/>
						</svg>
					</div>
					<div>
						<h4 class="text-sm font-semibold">
							{$t('dashboard.task_details_by_task.edit_task_confirmation.title')}
						</h4>
					</div>
				</div>
			</div>

			<!-- Content -->
			<div class="space-y-4">
				<!-- Main Warning Box -->
				<div class="bg-error/10 rounded-lg p-4">
					<p class="text-error mb-2 text-sm font-semibold">
						{$t('dashboard.task_details_by_task.edit_task_confirmation.warning')}
					</p>
					<p class="text-error text-sm">
						{$t('dashboard.task_details_by_task.edit_task_confirmation.details')}
					</p>
				</div>

				<!-- Additional Information -->
				<div class="text-base-content/70 text-sm">
					<p>
						{$t('dashboard.task_details_by_task.edit_task_confirmation.message')}
					</p>
				</div>
			</div>

			<!-- Action Buttons -->
			<div class="border-base-300 flex gap-3 pt-6">
				<button type="button" class="btn btn-ghost flex-1" onclick={() => setTaskModal(null)}>
					<svg class="mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M6 18L18 6M6 6l12 12"
						/>
					</svg>
					{$t('dashboard.task_details_by_task.edit_task_confirmation.cancel')}
				</button>
				<button type="button" class="btn btn-error" onclick={confirmEditTask}>
					<svg class="mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
						/>
					</svg>
					{$t('dashboard.task_details_by_task.edit_task_confirmation.confirm_edit')}
				</button>
			</div>
		</div>
		<button
			class="modal-backdrop"
			onclick={() => setTaskModal(null)}
			aria-label={$t('dashboard.task_details_by_task.edit_task_confirmation.title')}
		></button>
	</div>
{/if}

<!-- Delete Task Confirmation Modal (outside drawer context) -->
{#if activeTaskModal === 'delete' && selectedTask}
	<div class="modal modal-open modal-middle" transition:fade={{ duration: 200 }}>
		<div class="modal-box max-w-md" transition:scale={{ duration: 200, start: 0.9 }}>
			<!-- Modal Header -->
			<div class="mb-6">
				<div class="mb-2 flex items-center gap-3">
					<div class="bg-error/10 flex h-10 w-10 items-center justify-center rounded-full">
						<svg class="text-error h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
							/>
						</svg>
					</div>
					<div>
						<h4 class="text-sm font-semibold">
							{$t('dashboard.task_details_by_task.delete_task_confirm_title')}
						</h4>
					</div>
				</div>
			</div>

			<!-- Content -->
			<div class="space-y-4">
				<!-- Main Warning Box -->
				<div class="bg-error/10 rounded-lg p-4">
					<p class="text-error text-sm font-semibold">
						{$t('dashboard.task_details_by_task.delete_task_confirm_message')}
					</p>
				</div>
			</div>

			<!-- Action Buttons -->
			<div class="border-base-300 flex gap-3 pt-6">
				<button
					type="button"
					class="btn btn-ghost flex-1"
					onclick={() => setTaskModal(null)}
					disabled={isDeleting}
				>
					<svg class="mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M6 18L18 6M6 6l12 12"
						/>
					</svg>
					{$t('dashboard.task_details_by_task.cancel')}
				</button>
				<button
					type="button"
					class="btn btn-error flex-1 whitespace-nowrap"
					onclick={confirmDeleteTask}
					disabled={isDeleting}
				>
					{#if isDeleting}
						<span class="loading loading-spinner loading-sm"></span>
					{:else}
						<svg class="mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
							/>
						</svg>
					{/if}
					{$t('dashboard.task_details_by_task.delete_task')}
				</button>
			</div>
		</div>
		<button
			class="modal-backdrop"
			onclick={() => setTaskModal(null)}
			aria-label={$t('dashboard.task_details_by_task.delete_task_confirm_title')}
		></button>
	</div>
{/if}
