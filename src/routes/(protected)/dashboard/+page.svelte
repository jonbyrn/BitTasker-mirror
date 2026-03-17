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
	import DashboardSavedSearchesPanel from '$lib/components/task/DashboardSavedSearchesPanel.svelte';
	import DashboardBidsPanel from '$lib/components/bidding/DashboardBidsPanel.svelte';
	import DashboardContractsPanel from '$lib/components/contracts/DashboardContractsPanel.svelte';
	import DashboardMyServicesPanel from '$lib/components/service/DashboardMyServicesPanel.svelte';
	import MyQuotesPanel from '$lib/components/dashboard/quotes/MyQuotesPanel.svelte';
	import {
		contractCreationStore,
		reverifyPublishedServiceAcceptanceByEscrowId,
		retryPendingServiceAcceptanceByEscrowId
	} from '$lib/utils/escrow/v1/escrowEvents';
	import {
		getAcceptanceConfirmedMonitorEntriesDueForReverify,
		getAcceptanceReplayEntriesDueForRetry,
		SERVICE_ACCEPTANCE_CONFIRMED_MONITOR_REVERIFY_INTERVAL_MS,
		SERVICE_ACCEPTANCE_REPLAY_RETRY_INTERVAL_MS
	} from '$lib/utils/service-quote/acceptance-ledger';
	import { consumePendingServiceContractNavigationForContractsPage } from '$lib/utils/service-contract/pending-navigation';
	import {
		createDashboardUrl,
		getTaskerTimelines,
		isRequestSyncActive,
		serviceQuoteUiStore,
		type DashboardContractsContext,
		type DashboardTab,
		type DashboardView
	} from '$lib/stores/service-quote-ui.store';

	function translateOrFallback(key: string, fallback: string): string {
		const translated = $t(key);
		return translated === key ? fallback : translated;
	}

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
			id: 'my-services',
			label: $t('dashboard.tabs.my_services'),
			buttonLabel: $t('dashboard.services.my_services.create_service'),
			buttonHref: '/dashboard/create-service',
			icon: 'plus'
		},
		{
			id: 'bids',
			label: $t('dashboard.tabs.bids'),
			buttonLabel: $t('dashboard.find_task'),
			buttonHref: '/tasks',
			icon: 'search'
		},
		{
			id: 'contracts',
			label: $t('dashboard.tabs.contracts'),
			buttonLabel: $t('dashboard.manage_wallet'),
			buttonHref: '/dashboard/wallet',
			icon: 'wallet'
		},
		{
			id: 'saved-searches',
			label: $t('dashboard.tabs.saved_searches'),
			buttonLabel: $t('dashboard.find_task'),
			buttonHref: '/tasks',
			icon: 'search'
		},
		{
			id: 'quotes',
			label: translateOrFallback('dashboard.tabs.quotes', 'Quotes'),
			buttonLabel: translateOrFallback('dashboard.find_services', 'Browse Services'),
			buttonHref: '/services',
			icon: 'search'
		}
	]);

	let activeTabId = $state('tasks');
	const activeTab = $derived(tabs.find((t) => t.id === activeTabId) || tabs[0]);
	let activeView = $state<DashboardView>('default');
	let contractsContext = $state<DashboardContractsContext>('all');
	let selectedServiceAddress = $state<string | null>(null);
	let focusedRequestId = $state<string | null>(null);
	let taskerTimelines = $state<ReturnType<typeof getTaskerTimelines>>([]);
	let nonBlockingMessageCode = $state<string | null>(null);
	let taskerQuotesStoreSyncing = $state(false);
	let serviceAcceptanceReplaySyncing = $state(false);
	const taskerQuotesSyncing = $derived(taskerQuotesStoreSyncing || serviceAcceptanceReplaySyncing);
	let taskerQuotesError = $state<string | null>(null);
	let taskerQuotesLoaded = $state(false);
	let currentContractsHighlight = $state<string | null>(null);
	const attemptedServiceAcceptanceReplays = new Set<string>();
	const inFlightServiceAcceptanceReplays = new Set<string>();

	// Task drawer state
	let selectedTask = $state<Task | null>(null);
	let drawerOpen = $state(false);
	let drawerInitialTab = $state('details');
	let activeTaskModal = $state<'edit' | 'delete' | null>(null);
	let isDeleting = $state(false);

	function syncRouteState() {
		const parsed = serviceQuoteUiStore.parseDashboardQuery(page.url.searchParams);
		activeTabId = parsed.state.tab;
		activeView = parsed.state.view;
		contractsContext = parsed.state.context;
		selectedServiceAddress = parsed.state.serviceAddress;
		focusedRequestId = parsed.state.requestId;
		nonBlockingMessageCode = parsed.messageCode;
		currentContractsHighlight = parsed.state.highlight;

		if (parsed.changed) {
			const nextUrl = new URL(page.url.toString());
			nextUrl.search = parsed.searchParams.toString();
			goto(nextUrl.toString(), { replaceState: true, keepFocus: true, noScroll: true });
		}
	}

	// Set active tab based on URL param
	onMount(() => {
		syncRouteState();

		let replayIntervalId: ReturnType<typeof setInterval> | null = null;

		const runServiceAcceptanceReplayCycle = async (
			options: {
				forcedEscrowId?: string | null;
				syncing?: boolean;
			} = {}
		) => {
			if (typeof window === 'undefined') {
				return;
			}

			const dueReplayEntries = getAcceptanceReplayEntriesDueForRetry(window.localStorage);
			const replayTargets = new Set<string>(
				dueReplayEntries
					.map((entry) => entry.escrowId)
					.filter((escrowId) => !inFlightServiceAcceptanceReplays.has(escrowId))
			);

			if (options.forcedEscrowId && !inFlightServiceAcceptanceReplays.has(options.forcedEscrowId)) {
				replayTargets.add(options.forcedEscrowId);
			}

			if (replayTargets.size === 0) {
				return;
			}

			if (options.syncing) {
				serviceAcceptanceReplaySyncing = true;
			}

			const targetIds = [...replayTargets];
			for (const escrowId of targetIds) {
				inFlightServiceAcceptanceReplays.add(escrowId);
			}

			try {
				await Promise.allSettled(
					targetIds.map(async (escrowId) => {
						await retryPendingServiceAcceptanceByEscrowId(escrowId);
					})
				);

				void serviceQuoteUiStore.loadTaskerTimelines(focusedRequestId).catch(() => {
					// The store exposes taskerQuotesError for inline retry UX.
				});
			} finally {
				for (const escrowId of targetIds) {
					inFlightServiceAcceptanceReplays.delete(escrowId);
				}

				if (options.syncing) {
					serviceAcceptanceReplaySyncing = false;
				}
			}
		};

		const runServiceAcceptanceReverifyCycle = async () => {
			if (typeof window === 'undefined') {
				return;
			}

			const dueMonitorEntries = getAcceptanceConfirmedMonitorEntriesDueForReverify(
				window.localStorage,
				Date.now(),
				{
					reverifyIntervalMs: SERVICE_ACCEPTANCE_CONFIRMED_MONITOR_REVERIFY_INTERVAL_MS
				}
			);
			if (dueMonitorEntries.length === 0) {
				return;
			}

			await Promise.allSettled(
				dueMonitorEntries.map((entry) =>
					reverifyPublishedServiceAcceptanceByEscrowId(entry.escrowId)
				)
			);
		};

		const unsubscribeServiceQuotes = serviceQuoteUiStore.subscribe((state) => {
			taskerTimelines = getTaskerTimelines(state);
			nonBlockingMessageCode = state.nonBlockingMessageCode;
			taskerQuotesError = state.taskerLoadError;
			taskerQuotesLoaded = state.taskerLoaded;
			taskerQuotesStoreSyncing =
				state.loadingTasker || isRequestSyncActive(state, focusedRequestId, selectedServiceAddress);
			syncRouteState();
		});

		const unsubscribeContractCreation = contractCreationStore.subscribe((event) => {
			if (typeof window === 'undefined') {
				return;
			}

			const highlightEscrowId = consumePendingServiceContractNavigationForContractsPage(
				window.sessionStorage,
				event ?? {},
				{
					activeTabId,
					contractsContext,
					highlightEscrowId: currentContractsHighlight
				}
			);
			if (!highlightEscrowId) {
				return;
			}

			const nextUrl = createDashboardUrl(page.url, {
				tab: 'contracts',
				context: 'services',
				highlight: highlightEscrowId
			});
			goto(nextUrl.toString(), { replaceState: true, keepFocus: true, noScroll: true });
		});

		void Promise.all([
			runServiceAcceptanceReplayCycle({ syncing: true }),
			runServiceAcceptanceReverifyCycle()
		]);
		replayIntervalId = window.setInterval(() => {
			void runServiceAcceptanceReplayCycle();
			void runServiceAcceptanceReverifyCycle();
		}, Math.min(
			SERVICE_ACCEPTANCE_REPLAY_RETRY_INTERVAL_MS,
			SERVICE_ACCEPTANCE_CONFIRMED_MONITOR_REVERIFY_INTERVAL_MS
		));

		return () => {
			unsubscribeServiceQuotes();
			unsubscribeContractCreation();
			if (replayIntervalId !== null) {
				window.clearInterval(replayIntervalId);
			}
		};
	});

	// Watch for URL changes and update active tab
	$effect(() => {
		page.url.searchParams.toString();
		syncRouteState();
	});

	$effect(() => {
		if (activeTabId !== 'quotes') {
			taskerQuotesError = null;
			return;
		}

		void serviceQuoteUiStore.loadTaskerTimelines(focusedRequestId).catch(() => {
			// The store exposes taskerQuotesError for inline retry UX.
		});
	});

	// Handle tab change
	function handleTabChange(tabId: string) {
		if (tabs.some((t) => t.id === tabId)) {
			serviceQuoteUiStore.setNonBlockingMessage(null);
			const nextUrl = createDashboardUrl(page.url, {
				tab: tabId as DashboardTab,
				view: tabId === 'quotes' ? 'tasker' : tabId === 'my-services' ? 'default' : 'default',
				context: tabId === 'contracts' ? contractsContext : 'all',
				serviceAddress: null,
				requestId: null,
				highlight: null
			});
			goto(nextUrl.toString(), { replaceState: true, keepFocus: true, noScroll: true });
		}
	}

	function handleMyServicesRouteResolve(
		update:
			| { type: 'service'; serviceAddress: string; requestId?: string | null }
			| { type: 'reset' }
			| { type: 'request'; requestId: string | null }
	) {
		if (update.type === 'reset') {
			serviceQuoteUiStore.setNonBlockingMessage(null);
			const nextUrl = createDashboardUrl(page.url, {
				tab: 'my-services',
				view: 'default',
				serviceAddress: null,
				requestId: null
			});
			goto(nextUrl.toString(), { replaceState: true, keepFocus: true, noScroll: true });
			return;
		}

		if (update.type === 'request') {
			serviceQuoteUiStore.setNonBlockingMessage(
				update.requestId === null ? 'service_quotes_request_not_found' : null
			);
			const nextUrl = createDashboardUrl(page.url, {
				tab: 'my-services',
				view: 'quotes',
				serviceAddress: selectedServiceAddress,
				requestId: update.requestId
			});
			goto(nextUrl.toString(), { replaceState: true, keepFocus: true, noScroll: true });
			return;
		}

		serviceQuoteUiStore.setNonBlockingMessage(null);
		const nextUrl = createDashboardUrl(page.url, {
			tab: 'my-services',
			view: 'quotes',
			serviceAddress: update.serviceAddress,
			requestId: update.requestId ?? null
		});
		goto(nextUrl.toString(), { replaceState: true, keepFocus: true, noScroll: true });
	}

	function handleTaskerRequestFocus(requestId: string | null) {
		serviceQuoteUiStore.setNonBlockingMessage(
			requestId === null ? 'quotes_request_not_found' : null
		);
		const nextUrl = createDashboardUrl(page.url, {
			tab: 'quotes',
			view: 'tasker',
			requestId
		});
		goto(nextUrl.toString(), { replaceState: true, keepFocus: true, noScroll: true });
	}

	function handleContractsHighlightConsumed() {
		const nextUrl = createDashboardUrl(page.url, {
			tab: 'contracts',
			context: contractsContext,
			highlight: null
		});
		goto(nextUrl.toString(), { replaceState: true, keepFocus: true, noScroll: true });
	}

	function handleContractsHighlightMissing() {
		serviceQuoteUiStore.setNonBlockingMessage('contracts_highlight_not_found');
		const nextUrl = createDashboardUrl(page.url, {
			tab: 'contracts',
			context: contractsContext,
			highlight: null
		});
		goto(nextUrl.toString(), { replaceState: true, keepFocus: true, noScroll: true });
	}

	$effect(() => {
		const highlightEscrowId = currentContractsHighlight;
		if (
			typeof window === 'undefined' ||
			activeTabId !== 'contracts' ||
			contractsContext !== 'services' ||
			!highlightEscrowId ||
			attemptedServiceAcceptanceReplays.has(highlightEscrowId)
		) {
			return;
		}

		attemptedServiceAcceptanceReplays.add(highlightEscrowId);
		void retryPendingServiceAcceptanceByEscrowId(highlightEscrowId);
	});

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

<div class="mx-auto h-full max-w-6xl px-2 py-6 md:px-0 md:py-0">
	<!-- Dashboard Header -->
	<div class="mb-6 flex items-center justify-between">
		<div>
			<h3 class="font-bold">{$t('dashboard.title')}</h3>
			<p class="text-base-content/70">{$t('dashboard.description')}</p>
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
				{#if nonBlockingMessageCode === 'quotes_request_not_found'}
					The requested quote thread could not be found.
				{:else if nonBlockingMessageCode === 'service_quotes_request_not_found'}
					The selected service quote thread could not be found.
				{:else if nonBlockingMessageCode === 'contracts_highlight_not_found'}
					The requested contract highlight could not be found.
				{:else}
					Service quote protocol wiring is pending; local UI state is being shown for now.
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
				openTaskDrawer={(task, tab = 'details') => setDrawerState(true, task, tab)}
			/>
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
	{:else if activeTabId === 'bids'}
		<div
			id="panel-bids"
			role="tabpanel"
			aria-labelledby="tab-bids"
			transition:slide={{ duration: 300 }}
		>
			<DashboardBidsPanel />
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
				highlightEscrowId={page.url.searchParams.get('highlight')}
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
				view={activeView === 'quotes' ? 'quotes' : 'default'}
				{selectedServiceAddress}
				focusedRequestId={focusedRequestId}
				onResolveQuotesRoute={handleMyServicesRouteResolve}
			/>
		</div>
	{:else if activeTabId === 'quotes'}
		<div
			id="panel-quotes"
			role="tabpanel"
			aria-labelledby="tab-quotes"
			transition:slide={{ duration: 300 }}
		>
				<MyQuotesPanel
					timelines={taskerTimelines}
					focusedRequestId={focusedRequestId}
					isSyncing={taskerQuotesSyncing}
					hasLoaded={taskerQuotesLoaded}
					loadError={taskerQuotesError}
					onRetry={() => serviceQuoteUiStore.loadTaskerTimelines(focusedRequestId).catch(() => {})}
					onRequestFocusChange={handleTaskerRequestFocus}
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
