<script lang="ts">
	import type { Task } from '$lib/types/task';
	import { t } from 'svelte-i18n';
	import { onMount } from 'svelte';
	import { myTasksStore, TASKS_PER_PAGE } from '$lib/stores/task.store';
	import { TaskStatusEnum } from '$lib/utils/enums/task.enum';
	import cryptoPriceService from '$lib/api/services/crypto-price.service';
	import { findMyTasks } from '$lib/nostr/findMyTasks';
	import { goto } from '$app/navigation';
	import { appStore } from '$lib/stores/app.store';
	import DashboardTaskCard from './DashboardTaskCard.svelte';
	import DashboardEmptyState from '$lib/components/shared/DashboardEmptyState.svelte';
	import ErrorAlertWithModal from '$lib/components/ErrorAlertWithModal.svelte';
	import { detectErrorType } from '$lib/utils/helpers/errorTypeDetector';
	import DashboardFilterBar from '$lib/components/shared/DashboardFilterBar.svelte';
	import DashboardDropdown from '$lib/components/shared/DashboardDropdown.svelte';
	import { createDashboardUrl } from '$lib/utils/service-quote/dashboard-route';
	import { taskDetailsPath } from '$lib/utils/tasks/task-path';

	// MDI Icons for filters
	import IconClockOutline from '~icons/mdi/clock-outline';
	import IconLightningBolt from '~icons/mdi/lightning-bolt';
	import IconCheckCircle from '~icons/mdi/check-circle';
	import IconAlertCircleOutline from '~icons/mdi/alert-circle-outline';
	import IconClipboardTextOutline from '~icons/mdi/clipboard-text-outline';
	import IconCheckAll from '~icons/mdi/check-all';
	import IconPlus from '~icons/mdi/plus';
	import IconRefresh from '~icons/mdi/refresh';

	// Props
	let { openTaskDrawer: _openTaskDrawer, status = null } = $props<{
		openTaskDrawer: (task: Task, tab?: string) => void;
		status?: string | null;
	}>();

	// Task filter categories
	type TaskFilterCategory =
		| 'all'
		| 'open'
		| 'tasks_in_progress'
		| 'tasks_completed'
		| 'tasks_disputed'
		| 'tasks_cancelled';

	const VALID_FILTERS: TaskFilterCategory[] = [
		'all',
		'open',
		'tasks_in_progress',
		'tasks_completed',
		'tasks_disputed',
		'tasks_cancelled'
	];

	let activeFilter = $state<TaskFilterCategory>('all');

	$effect(() => {
		if (status && VALID_FILTERS.includes(status as TaskFilterCategory)) {
			activeFilter = status as TaskFilterCategory;
		}
	});

	let btcPrice = $state<number>(0);
	let isLoading = $state(true);
	let error = $state<string | null>(null);

	// Pagination state
	let currentPage = $state(1);
	let pageSize = $state(20);

	// Filter options - reactive to language changes
	const filterOptions = $derived([
		{
			id: 'all' as const,
			label: $t('dashboard.contracts.all_statuses'),
			icon: IconCheckAll
		},
		{
			id: 'open',
			label: $t('task.filters.open'),
			icon: IconClockOutline
		},
		{
			id: 'tasks_in_progress',
			label: $t('task.filters.in_progress'),
			icon: IconLightningBolt
		},
		{
			id: 'tasks_completed',
			label: $t('task.filters.completed'),
			icon: IconCheckCircle
		},
		{
			id: 'tasks_disputed',
			label: $t('task.filters.disputed'),
			icon: IconAlertCircleOutline
		},
		{
			id: 'tasks_cancelled',
			label: $t('task.filters.cancelled'),
			icon: IconClipboardTextOutline
		}
	] as const);

	/**
	 * Fetch current BTC price
	 */
	async function fetchBtcPrice(): Promise<void> {
		try {
			btcPrice = await cryptoPriceService.getCurrentPrice('BTC');
		} catch (error) {
			console.error('Error fetching BTC price:', error);
		}
	}

	let filteredTasks = $derived.by(() => {
		const items = $myTasksStore.items;
		switch (activeFilter) {
			case 'open':
				return items.filter((t) => t.status === TaskStatusEnum.OPEN);
			case 'tasks_in_progress':
				return items.filter(
					(t) =>
						t.status === TaskStatusEnum.IN_PROGRESS ||
						t.status === TaskStatusEnum.BID_ACCEPTED ||
						t.status === TaskStatusEnum.ESCROW_FUNDED ||
						t.status === TaskStatusEnum.RESCOPED ||
						t.status === TaskStatusEnum.RESCOPE_ACCEPTED
				);
			case 'tasks_completed':
				return items.filter((t) => t.status === TaskStatusEnum.COMPLETED);
			case 'tasks_disputed':
				return items.filter(
					(t) =>
						t.status === TaskStatusEnum.DISPUTED || t.status === TaskStatusEnum.DISPUTE_PROPOSAL
				);
			case 'tasks_cancelled':
				return items.filter(
					(t) => t.status === TaskStatusEnum.CANCELLED || t.status === TaskStatusEnum.REFUNDED
				);
			default:
				return items;
		}
	});
	const isPasskeyLoadError = $derived.by(
		() => Boolean(error) && detectErrorType(error ?? '') === 'biometric'
	);

	// Paginated tasks
	let totalTasks = $derived(filteredTasks.length);
	let totalPages = $derived(Math.ceil(totalTasks / pageSize));
	let paginatedTasks = $derived.by(() => {
		const start = (currentPage - 1) * pageSize;
		const end = start + pageSize;
		return filteredTasks.slice(start, end);
	});

	// Navigation functions
	function goToPage(page: number) {
		if (page >= 1 && page <= totalPages) {
			currentPage = page;
			// Scroll to top
			window.scrollTo({ top: 0, behavior: 'smooth' });
		}
	}

	function nextPage() {
		if (currentPage < totalPages) {
			goToPage(currentPage + 1);
		}
	}

	function prevPage() {
		if (currentPage > 1) {
			goToPage(currentPage - 1);
		}
	}

	function clearTaskFilters() {
		activeFilter = 'all';
		currentPage = 1;
	}

	// Reset to page 1 when filter changes
	$effect(() => {
		if (activeFilter) {
			currentPage = 1;
		}
	});

	/**
	 * Load tasks
	 */
	async function loadTasks() {
		try {
			isLoading = true;
			error = null;
			await findMyTasks({ page: 1, limit: TASKS_PER_PAGE });
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to load tasks';
			console.error('Error loading tasks:', err);
		} finally {
			isLoading = false;
		}
	}

	async function handleRefresh() {
		try {
			isLoading = true;
			error = null;
			await findMyTasks({ page: 1, limit: TASKS_PER_PAGE });
			// Show success message only if no error occurred
			if (!error) {
				appStore.showSuccessToast($t('dashboard.tasks.refresh_success'), 3000);
			} else {
				appStore.showErrorToast($t('dashboard.tasks.refresh_error'), 3000);
			}
		} catch (err) {
			console.error('Error refreshing tasks:', err);
			error = err instanceof Error ? err.message : 'Failed to refresh tasks';
			appStore.showErrorToast($t('dashboard.tasks.refresh_error'), 3000);
		} finally {
			isLoading = false;
		}
	}

	function handleStatusChange(nextStatus: TaskFilterCategory) {
		activeFilter = nextStatus;
		const nextUrl = createDashboardUrl(new URL(window.location.href), {
			tab: 'tasks',
			status: nextStatus
		});
		void goto(nextUrl.toString(), { replaceState: true, keepFocus: true, noScroll: true });
	}

	/**
	 * Get action buttons for each category
	 */
	function getActionButtons(task: Task, category: TaskFilterCategory) {
		// Basic details button - usually available for most statuses
		const detailsButton = {
			label: $t('task.actions.view_details'),
			class: 'btn-outline btn-sm',
			onclick: (e: MouseEvent | KeyboardEvent) => {
				e.stopPropagation();
				void goto(taskDetailsPath(task.id));
			},
			icon: 'view_details'
		};

		// Bids button - primarily for open tasks but can be useful for context
		const bidsButton = {
			label: $t('task.actions.view_bids'),
			class: 'btn-primary btn-sm',
			onclick: (e: MouseEvent | KeyboardEvent) => {
				e.stopPropagation();
				goto(`/task/${task.id}/bids`);
			},
			icon: 'view_bids'
		};

		// Status-specific logic
		const effectiveStatus = category === 'all' ? task.status : category;

		switch (effectiveStatus) {
			case 'open':
			case TaskStatusEnum.OPEN:
				return [detailsButton, bidsButton];

			case 'tasks_in_progress':
			case TaskStatusEnum.IN_PROGRESS:
			case TaskStatusEnum.BID_ACCEPTED:
			case TaskStatusEnum.ESCROW_FUNDED:
			case TaskStatusEnum.RESCOPED:
			case TaskStatusEnum.RESCOPE_ACCEPTED: {
				// For in-progress, prioritize Contract and Messages
				const inProgressButtons = [];

				// 1. Message Taskee (if we have a pubkey)
				if (task.acceptedBidMetadata?.pubkey) {
					inProgressButtons.push({
						label: $t('navbar.messages'),
						class: 'btn-outline btn-sm',
						onclick: (e: MouseEvent | KeyboardEvent) => {
							e.stopPropagation();
							goto(`/messages/to/${task.acceptedBidMetadata?.pubkey}`);
						},
						icon: 'message'
					});
				}

				// 2. View Contract (if we have an escrow ID)
				if (task.acceptedBidMetadata?.escrowId) {
					inProgressButtons.push({
						label: $t('dashboard.tabs.contracts'),
						class: 'btn-primary btn-sm',
						onclick: (e: MouseEvent | KeyboardEvent) => {
							e.stopPropagation();
							const nextUrl = createDashboardUrl(new URL(window.location.href), {
								tab: 'contracts',
								highlight: task.acceptedBidMetadata?.escrowId
							});
							void goto(nextUrl.toString());
						},
						icon: 'contract'
					});
				}

				// 3. Always show details
				inProgressButtons.push({ ...detailsButton, class: 'btn-outline btn-sm' });

				return inProgressButtons.length > 0 ? inProgressButtons : [detailsButton];
			}

			case 'tasks_completed':
			case TaskStatusEnum.COMPLETED:
			case 'tasks_disputed':
			case TaskStatusEnum.DISPUTED:
			case TaskStatusEnum.DISPUTE_PROPOSAL:
			case 'tasks_cancelled':
			case TaskStatusEnum.CANCELLED:
			case TaskStatusEnum.REFUNDED:
				// Final states - show Primary Details button
				return [{ ...detailsButton, class: 'btn-primary btn-sm' }];

			default:
				// Fallback for "All" or unknown statuses
				return [detailsButton];
		}
	}

	const pageNumbers = $derived.by(() =>
		Array.from({ length: totalPages }, (_, index) => index + 1)
	);

	onMount(async () => {
		// Load tasks and BTC price
		await loadTasks();
		await fetchBtcPrice();
	});
</script>

<div class="space-y-4">
	<DashboardFilterBar onRefresh={handleRefresh} isRefreshing={isLoading}>
		<DashboardDropdown
			options={filterOptions}
			value={activeFilter}
			onSelect={handleStatusChange}
			containerClass="col-span-2 sm:w-64"
		/>
	</DashboardFilterBar>

	<!-- Loading State -->
	{#if isLoading}
		<div class="flex justify-center py-12">
			<div class="flex items-center gap-3">
				<span class="loading loading-spinner loading-md"></span>
				<span>{$t('dashboard.tasks.loading')}</span>
			</div>
		</div>
	{/if}

	<!-- Error State -->
	{#if error}
		{#if isPasskeyLoadError}
			<ErrorAlertWithModal
				{error}
				isPasskeyError
				autoOpenModal={false}
				onRetry={loadTasks}
				class="w-full"
			/>
		{:else}
			<div class="alert alert-outline alert-error">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="h-6 w-6 shrink-0 stroke-current"
					fill="none"
					viewBox="0 0 24 24"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
					/>
				</svg>
				<div>
					<h3 class="font-bold">{$t('dashboard.tasks.error_title')}</h3>
					<div class="text-xs">{error}</div>
				</div>
				<button class="btn btn-sm btn-outline" onclick={loadTasks}>
					{$t('dashboard.tasks.retry')}
				</button>
			</div>
		{/if}
	{/if}

	<!-- Tasks List -->
	{#if !isLoading && !error}
		{#if filteredTasks.length === 0}
			<div class="card bg-base-100 rounded-xl p-4">
				<DashboardEmptyState
					icon={IconClipboardTextOutline}
					title={$myTasksStore.items.length === 0
						? $t('dashboard.tasks.no_tasks')
						: $t('dashboard.tasks.no_filtered_tasks')}
					description={$myTasksStore.items.length === 0
						? $t('dashboard.tasks.no_tasks_description')
						: $t('dashboard.tasks.try_different_filters')}
					actionLabel={$myTasksStore.items.length === 0
						? $t('dashboard.create_task')
						: $t('dashboard.contracts.clear_filters')}
					actionHref={$myTasksStore.items.length === 0 ? '/create-task' : null}
					actionIcon={$myTasksStore.items.length === 0 ? IconPlus : IconRefresh}
					onAction={$myTasksStore.items.length === 0 ? undefined : clearTaskFilters}
					testId="dashboard-tasks-empty-state"
				/>
			</div>
		{:else}
			<div class="grid grid-cols-1 gap-5">
				{#each paginatedTasks as task (task.id)}
					<DashboardTaskCard {task} {btcPrice} {activeFilter} {getActionButtons} />
				{/each}
			</div>

			<!-- Pagination Controls -->
			{#if totalPages > 1}
				<div class="flex items-center justify-center gap-2 py-6">
					<button class="btn btn-sm btn-ghost" onclick={prevPage} disabled={currentPage === 1}>
						{$t('common.pagination.previous')}
					</button>

					<div class="flex gap-1">
						{#each pageNumbers as page (page)}
							<button
								class="btn btn-sm {currentPage === page ? 'btn-primary' : 'btn-ghost'}"
								onclick={() => goToPage(page)}
							>
								{page}
							</button>
						{/each}
					</div>

					<button
						class="btn btn-sm btn-ghost"
						onclick={nextPage}
						disabled={currentPage === totalPages}
					>
						{$t('common.pagination.next')}
					</button>
				</div>
			{/if}
		{/if}
	{/if}
</div>
