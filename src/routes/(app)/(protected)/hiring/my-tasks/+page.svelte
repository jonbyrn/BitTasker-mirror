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
	import { ndk } from '$lib/nostr/ndk';
	import KINDS from '$lib/utils/constants/kinds';
	import { appStore } from '$lib/stores/app.store';
	import TaskDrawer from '$lib/components/task/TaskDrawer.svelte';
	import DashboardTasksPanel from '$lib/components/task/DashboardTasksPanel.svelte';

	let activeStatus = $state<string | null>(null);

	onMount(() => {
		const statusParam = page.url.searchParams.get('status');
		activeStatus = statusParam || null;
	});

	$effect(() => {
		const statusParam = page.url.searchParams.get('status');
		activeStatus = statusParam || null;
	});

	let selectedTask = $state<Task | null>(null);
	let drawerOpen = $state(false);
	let drawerInitialTab = $state('details');
	let activeTaskModal = $state<'edit' | 'delete' | null>(null);
	let isDeleting = $state(false);

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

		try {
			const contracts = await ndk.fetchEvents(
				{ kinds: [KINDS.CONTRACT], '#t': [taskToEdit.id], limit: 1 },
				{ closeOnEose: true }
			);
			if (contracts.size > 0) {
				appStore.showErrorToast(
					$t('dashboard.task_details_by_task.cannot_edit_with_contract') ||
						'Cannot edit task: A contract has been created for this task.'
				);
				activeTaskModal = null;
				return;
			}
		} catch (error) {
			console.error('Error checking contracts before edit:', error);
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
		goto(`/create-task?edit=true`);
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

<div transition:slide={{ duration: 300 }}>
	<DashboardTasksPanel
		status={activeStatus}
		openTaskDrawer={(task, tab = 'details') => setDrawerState(true, task, tab)}
	/>
</div>

<TaskDrawer
	task={selectedTask}
	isOpen={drawerOpen}
	activeTab={drawerInitialTab}
	onClose={() => setDrawerState(false, null)}
	onRequestEditConfirm={() => setTaskModal('edit')}
	onRequestDeleteConfirm={() => setTaskModal('delete')}
	{isDeleting}
/>

{#if activeTaskModal === 'edit' && selectedTask}
	<div class="modal modal-open modal-middle" transition:fade={{ duration: 200 }}>
		<div class="modal-box max-w-md" transition:scale={{ duration: 200, start: 0.9 }}>
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

			<div class="space-y-4">
				<div class="bg-error/10 rounded-lg p-4">
					<p class="text-error mb-2 text-sm font-semibold">
						{$t('dashboard.task_details_by_task.edit_task_confirmation.warning')}
					</p>
					<p class="text-error text-sm">
						{$t('dashboard.task_details_by_task.edit_task_confirmation.details')}
					</p>
				</div>

				<div class="text-base-content/70 text-sm">
					<p>
						{$t('dashboard.task_details_by_task.edit_task_confirmation.message')}
					</p>
				</div>
			</div>

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

{#if activeTaskModal === 'delete' && selectedTask}
	<div class="modal modal-open modal-middle" transition:fade={{ duration: 200 }}>
		<div class="modal-box max-w-md" transition:scale={{ duration: 200, start: 0.9 }}>
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

			<div class="space-y-4">
				<div class="bg-error/10 rounded-lg p-4">
					<p class="text-error text-sm font-semibold">
						{$t('dashboard.task_details_by_task.delete_task_confirm_message')}
					</p>
				</div>
			</div>

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
