<script lang="ts">
	import type { TaskTemplate } from '$lib/types/recurring-tasks';
	import { onMount } from 'svelte';
	import recurringTasksService from '$lib/api/services/recurring-tasks.service';
	import TaskTemplateCard from '$lib/components/task/TaskTemplateCard.svelte';
	import RecurrencePattern from '$lib/components/task/RecurrencePattern.svelte';
	import { appStore } from '$lib/stores/app.store';
	import {
		MyTaskTemplatesStore,
		UpdateTaskTemplateStore,
		DeleteTaskTemplateStore,
		type MyTaskTemplates$result,
		type UpdateTaskTemplate$input,
		type RecurrencePatternInput
	} from '$houdini';

	const taskTemplatesStore = new MyTaskTemplatesStore();

	const updateTaskTemplateStore = new UpdateTaskTemplateStore();

	const deleteTaskTemplateStore = new DeleteTaskTemplateStore();

	let templates = $state<TaskTemplate[]>([]);
	let isLoading = $state(true);
	let error = $state<string | null>(null);

	// Handle updating template recurrence pattern
	let selectedTemplate = $state<MyTaskTemplates$result['taskTemplates'][0] | null>(null);
	// Use a separate mutable state for editing the pattern in the modal
	let editablePattern = $state<RecurrencePatternInput | null>(null);
	let showRecurrenceEditor = $state(false);
	let updateError = $state('');
	let isUpdating = $state(false);

	// Handle template status change
	async function handleStatusChange(
		templateId: string,
		newStatus: MyTaskTemplates$result['taskTemplates'][0]['task']['status']
	) {
		try {
			isLoading = true;
			if (newStatus === 'CANCELLED') {
				await recurringTasksService.pauseTemplate(templateId);
			} else if (newStatus === 'OPEN') {
				await recurringTasksService.resumeTemplate(templateId);
			}

			// Update the templates list
			templates = templates.map((template) =>
				template.id === templateId ? { ...template, status: newStatus } : template
			);
		} catch (err) {
			error = 'Failed to update template status. Please try again.';
			console.error('Error updating template status:', err);
		} finally {
			isLoading = false;
		}
	}

	// Handle template deletion
	async function handleDeleteTemplate(templateId: string) {
		isLoading = true;
		error = null; // Clear previous errors
		try {
			const templateIdInt = parseInt(templateId);
			if (isNaN(templateIdInt)) {
				throw new Error('Invalid template ID for deletion');
			}

			await deleteTaskTemplateStore.mutate({ deleteTaskTemplateId: templateIdInt });

			// Refetch the list to reflect the deletion
			await taskTemplatesStore.fetch();
			appStore.showSuccessToast('Template deleted successfully');
		} catch (err: any) {
			// Need better error handling here, as graphql does not throw errors when the mutation fails
			const graphqlError = err.source?.errors?.[0]?.message;
			error = graphqlError || err.message || 'Failed to delete template. Please try again.';
			console.error('Error deleting template:', err);
		} finally {
			isLoading = false;
		}
	}

	function openUpdateTemplateModal(templateId: string) {
		selectedTemplate =
			$taskTemplatesStore.data?.taskTemplates.find((t) => t.id === templateId) || null;
		if (selectedTemplate?.recurrencePattern) {
			// Clone the pattern for editing
			editablePattern = { ...selectedTemplate.recurrencePattern };
		} else {
			// Initialize with default if no pattern exists (shouldn't happen for recurring)
			editablePattern = {
				frequency: 'WEEKLY', // Default or fetch from enums
				interval: 1,
				daysOfWeek: [1],
				dayOfMonth: null,
				endDate: null,
				maxOccurrences: 12
			};
		}
		showRecurrenceEditor = true;
	}

	// TODO: Currently not working as the backend is having issues with this particular mutation
	// Hours spent: 3 hours
	async function updateRecurrencePattern() {
		if (!selectedTemplate || !editablePattern) return;

		// Clear previous modal errors
		updateError = '';
		isUpdating = true;

		try {
			const input: UpdateTaskTemplate$input['input'] = {
				// Only include recurrencePattern in the input if it's being updated
				recurrencePattern: editablePattern
			};

			const templateIdInt = parseInt(selectedTemplate.id);
			if (isNaN(templateIdInt)) {
				throw new Error('Invalid template ID');
			}

			// Use the Houdini mutation
			await updateTaskTemplateStore.mutate({
				updateTaskTemplateId: templateIdInt,
				input
			});

			// Refetch the templates list to show the updated data
			await taskTemplatesStore.fetch();

			showRecurrenceEditor = false;
			selectedTemplate = null;
			editablePattern = null; // Clear editable pattern
			appStore.showSuccessToast('Recurrence pattern updated successfully');
		} catch (err: any) {
			// Set error for the modal instead of the global error
			// Try to extract the specific GraphQL error message
			const graphqlError = err.source?.errors?.[0]?.message;
			updateError =
				graphqlError || err.message || 'Failed to update recurrence pattern. Please try again.';
			console.error('Error updating recurrence pattern:', err);
		} finally {
			isUpdating = false;
		}
	}

	function closeRecurrenceEditor() {
		showRecurrenceEditor = false;
		selectedTemplate = null;
		editablePattern = null; // Clear editable pattern on close
	}

	$effect(() => {
		if ($taskTemplatesStore.fetching) {
			isLoading = true;
		} else {
			isLoading = false;
		}

		if ($taskTemplatesStore.errors) {
			error = $taskTemplatesStore.errors[0].message;
		}
	});

	onMount(() => {
		taskTemplatesStore.fetch();
	});
</script>

<div class="w-full">
	<!-- Error Message -->
	{#if error}
		<div class="alert alert-error mb-4">
			<span>{error}</span>
		</div>
	{/if}

	<!-- Loading State -->
	{#if isLoading}
		<div class="space-y-4">
			{#each Array(3) as _}
				<div class="card bg-base-100 animate-pulse shadow-md">
					<div class="card-body p-4">
						<div class="flex items-center justify-between">
							<div class="bg-base-300 h-6 w-48 rounded"></div>
							<div class="bg-base-300 h-6 w-16 rounded"></div>
						</div>
						<div class="my-2">
							<div class="bg-base-300 mb-1 h-4 w-24 rounded"></div>
							<div class="bg-base-300 h-5 w-40 rounded"></div>
						</div>
						<div class="my-2">
							<div class="bg-base-300 mb-1 h-4 w-20 rounded"></div>
							<div class="bg-base-300 h-5 w-32 rounded"></div>
						</div>
						<div class="card-actions mt-2 justify-end">
							<div class="bg-base-300 h-8 w-20 rounded"></div>
							<div class="bg-base-300 h-8 w-20 rounded"></div>
							<div class="bg-base-300 h-8 w-20 rounded"></div>
						</div>
					</div>
				</div>
			{/each}
		</div>
	{:else if !$taskTemplatesStore.fetching && !$taskTemplatesStore.errors && $taskTemplatesStore.data}
		<!-- Templates View -->
		<div class="mb-4 flex items-center justify-between">
			<h3 class="text-lg font-semibold">Recurring Task Templates</h3>
			<a href="/dashboard/create-task?recurring=true" class="btn btn-primary btn-sm">
				Create Template
			</a>
		</div>

		{#if showRecurrenceEditor && selectedTemplate}
			<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
				<div class="card bg-base-100 w-full max-w-2xl shadow-xl">
					<div class="card-body">
						<div class="mb-4 flex items-center justify-between">
							<h3 class="card-title">Update Recurrence Pattern</h3>
							<button
								class="btn btn-circle btn-ghost btn-sm"
								onclick={closeRecurrenceEditor}
								aria-label="Close dialog"
							>
								<svg
									xmlns="http://www.w3.org/2000/svg"
									class="h-6 w-6"
									fill="none"
									viewBox="0 0 24 24"
									stroke="currentColor"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M6 18L18 6M6 6l12 12"
									/>
								</svg>
							</button>
						</div>

						<p class="mb-4">
							Updating recurrence pattern for: <span class="font-semibold"
								>{selectedTemplate.name || selectedTemplate.task.title}</span
							>
						</p>

						<RecurrencePattern
							pattern={editablePattern}
							isEditing
							onPatternChange={(pattern) => (editablePattern = pattern)}
						/>

						{#if updateError}
							<div class="alert alert-error my-4">
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
								<span>{updateError}</span>
							</div>
						{/if}

						<div class="card-actions mt-6 justify-end">
							<button class="btn btn-ghost" onclick={closeRecurrenceEditor}>Cancel</button>
							<button
								class="btn btn-primary"
								onclick={updateRecurrencePattern}
								disabled={isUpdating}
							>
								{#if isUpdating}
									<span class="loading loading-spinner loading-xs"></span>
								{/if}
								Save Changes
							</button>
						</div>
					</div>
				</div>
			</div>
		{/if}

		{#if $taskTemplatesStore.data.taskTemplates.length === 0}
			<div class="card bg-base-200 p-6 text-center">
				<h3 class="mb-2 text-lg">You don't have any recurring task templates yet</h3>
				<p class="mb-4">Create a template to automate your regular tasks</p>
				<a class="btn btn-primary mx-auto" href="/dashboard/create-task"> Create Template </a>
			</div>
		{:else}
			<div class="grid grid-cols-1 gap-4">
				{#each $taskTemplatesStore.data?.taskTemplates as template (template.id)}
					<TaskTemplateCard
						{template}
						onStatusChange={(status) => handleStatusChange(template.id, status)}
						onDelete={() => handleDeleteTemplate(template.id)}
						onUpdate={openUpdateTemplateModal}
					/>
				{/each}
			</div>
		{/if}
	{/if}
</div>
