<script lang="ts">
	import type { TaskTemplate, ServicePackage } from '$lib/types/recurring-tasks';
	import { onMount } from 'svelte';
	import { TASKSTATUS } from '$lib/utils/enums/recurringTask.enums';
	import recurringTasksService from '$lib/api/services/recurring-tasks.service';
	import servicePackageService from '$lib/api/services/service-package.service';
	import TaskTemplateCard from '$lib/components/task/TaskTemplateCard.svelte';

	let activeView = $state<'templates' | 'packages'>('templates');
	let templates = $state<TaskTemplate[]>([]);
	let packages = $state<ServicePackage[]>([]);
	let publicPackages = $state<ServicePackage[]>([]);
	let isLoading = $state(true);
	let error = $state<string | null>(null);

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
		}
	}

	// Handle template deletion
	async function handleDeleteTemplate(templateId: string) {
		if (
			confirm(
				'Are you sure you want to delete this template? All future recurring tasks will be cancelled.'
			)
		) {
			try {
				await recurringTasksService.deleteTemplate(templateId);
				templates = templates.filter((template) => template.id !== templateId);
			} catch (err) {
				error = 'Failed to delete template. Please try again.';
				console.error('Error deleting template:', err);
			}
		}
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
		<div class="flex h-40 items-center justify-center">
			<div class="loading loading-spinner loading-lg"></div>
		</div>
	{:else}
		<!-- Templates View -->
		<div class="mb-4 flex items-center justify-between">
			<h3 class="text-lg font-semibold">Recurring Task Templates</h3>
		</div>

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
					/>
				{/each}
			</div>
		{/if}
	{/if}
</div>
