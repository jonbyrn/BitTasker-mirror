<script lang="ts">
	import { page } from '$app/stores';
	import { t } from 'svelte-i18n';
	import TaskDetailsView from '$lib/components/task/TaskDetailsView.svelte';

	// Get taskId from route params
	const taskId = $page.params.taskId;
</script>

<svelte:head>
	<title>{$t('dashboard.task_details_by_task.page_title')}</title>
	<meta
		name="description"
		content={$t('dashboard.task_details_by_task.page_description')}
	/>
</svelte:head>

<TaskDetailsView {taskId} showShareButton={true} />