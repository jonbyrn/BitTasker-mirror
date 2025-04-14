<script lang="ts">
	import type { TaskTemplate, ServicePackage } from '$lib/types/recurring-tasks';
	import { onMount } from 'svelte';
	import { TASKSTATUS } from '$lib/utils/enums/recurringTask.enums';
	import recurringTasksService from '$lib/api/services/recurring-tasks.service';
	import servicePackageService from '$lib/api/services/service-package.service';
	import TaskTemplateCard from '$lib/components/task/TaskTemplateCard.svelte';
	import RecurrencePattern from '$lib/components/task/RecurrencePattern.svelte';
	import { appStore } from '$lib/stores/app.store';

	let activeView = $state<'templates' | 'packages'>('templates');
	let templates = $state<TaskTemplate[]>([]);
	let packages = $state<ServicePackage[]>([]);
	let publicPackages = $state<ServicePackage[]>([]);
	let isLoading = $state(true);
	let error = $state<string | null>(null);

	// Handle updating template recurrence pattern
	let selectedTemplate = $state<TaskTemplate | null>(null);
	let showRecurrenceEditor = $state(false);
	let updateError = $state('');

	// Fetch data on mount
	async function fetchData() {
		isLoading = true;
		error = null;

		try {
			if (activeView === 'templates') {
				templates = await recurringTasksService.getTemplates();
			} else {
				packages = await servicePackageService.getPackages();
				publicPackages = await servicePackageService.getPublicPackages();
			}
		} catch (err) {
			error = 'Failed to load data. Please try again.';
			console.error('Error fetching recurring task data:', err);
		} finally {
			isLoading = false;
		}
	}

	// Handle template status change
	async function handleStatusChange(templateId: string, newStatus: TASKSTATUS) {
		try {
			isLoading = true;
			if (newStatus === TASKSTATUS.PAUSED) {
				await recurringTasksService.pauseTemplate(templateId);
			} else if (newStatus === TASKSTATUS.ACTIVE) {
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
		try {
			isLoading = true;
			await recurringTasksService.deleteTemplate(templateId);
			templates = templates.filter((template) => template.id !== templateId);
		} catch (err) {
			error = 'Failed to delete template. Please try again.';
			console.error('Error deleting template:', err);
		} finally {
			isLoading = false;
		}
	}

	function handleUpdateTemplate(templateId: string) {
		selectedTemplate = templates.find((t) => t.id === templateId) || null;
		showRecurrenceEditor = true;
	}

	async function updateRecurrencePattern() {
		if (!selectedTemplate) return;

		// Clear previous modal errors
		updateError = '';

		try {
			// Update template with new recurrence pattern
			await recurringTasksService.updateTemplate(selectedTemplate.id, {
				recurrencePattern: selectedTemplate.recurrencePattern
			});

			// Update local state
			templates = templates.map((template) =>
				template.id === selectedTemplate?.id ? selectedTemplate : template
			);

			showRecurrenceEditor = false;
			selectedTemplate = null;
			appStore.showSuccessToast('Recurrence pattern updated successfully');
		} catch (err) {
			// Set error for the modal instead of the global error
			updateError = 'Failed to update recurrence pattern. Please try again.';
			console.error('Error updating recurrence pattern:', err);
		}
	}

	function closeRecurrenceEditor() {
		showRecurrenceEditor = false;
		selectedTemplate = null;
	}

	onMount(() => {
		fetchData();
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
	{:else}
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
							pattern={selectedTemplate.recurrencePattern}
							isEditing
							onPatternChange={(pattern) => (selectedTemplate!.recurrencePattern = pattern)}
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
								disabled={isLoading}
							>
								{#if isLoading}
									<span class="loading loading-spinner loading-xs"></span>
								{/if}
								Save Changes
							</button>
						</div>
					</div>
				</div>
			</div>
		{/if}

		{#if templates.length === 0}
			<div class="card bg-base-200 p-6 text-center">
				<h3 class="mb-2 text-lg">You don't have any recurring task templates yet</h3>
				<p class="mb-4">Create a template to automate your regular tasks</p>
				<a class="btn btn-primary mx-auto" href="/dashboard/create-task"> Create Template </a>
			</div>
		{:else}
			<div class="grid grid-cols-1 gap-4">
				{#each templates as template (template.id)}
					<TaskTemplateCard
						{template}
						onStatusChange={(status) => handleStatusChange(template.id, status)}
						onDelete={() => handleDeleteTemplate(template.id)}
						onUpdate={handleUpdateTemplate}
					/>
				{/each}
			</div>
		{/if}
	{/if}
</div>
