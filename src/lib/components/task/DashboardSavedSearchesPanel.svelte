<script lang="ts">
	import { t } from 'svelte-i18n';
	import DashboardSavedTaskSearchesPanel from '$lib/components/task/DashboardSavedTaskSearchesPanel.svelte';
	import DashboardSavedServiceSearchesPanel from '$lib/components/service/DashboardSavedServiceSearchesPanel.svelte';
	import DashboardFilterBar from '$lib/components/shared/DashboardFilterBar.svelte';
	import DashboardDropdown from '$lib/components/shared/DashboardDropdown.svelte';
	import IconClipboardTextOutline from '~icons/mdi/clipboard-text-outline';
	import IconBriefcaseOutline from '~icons/mdi/briefcase-outline';

	type FilterType = 'tasks' | 'services';
	let { fixedFilter = null }: { fixedFilter?: FilterType | null } = $props();
	let filter = $state<FilterType>('tasks');

	$effect(() => {
		if (fixedFilter) {
			filter = fixedFilter;
		}
	});

	const filterOptions = $derived([
		{
			id: 'tasks' as const,
			label: $t('dashboard.saved_searches.tasks'),
			icon: IconClipboardTextOutline
		},
		{
			id: 'services' as const,
			label: $t('dashboard.saved_searches.services'),
			icon: IconBriefcaseOutline
		}
	]);
</script>

<div class="space-y-4">
	{#if !fixedFilter}
		<DashboardFilterBar>
			<DashboardDropdown
				options={filterOptions}
				value={filter}
				onSelect={(val) => (filter = val)}
				containerClass="col-span-2 sm:w-64"
			/>
		</DashboardFilterBar>
	{/if}

	{#if filter === 'tasks'}
		<div id="panel-saved-tasks" role="tabpanel" aria-labelledby="tab-saved-tasks" tabindex="0">
			<DashboardSavedTaskSearchesPanel />
		</div>
	{:else}
		<div
			id="panel-saved-services"
			role="tabpanel"
			aria-labelledby="tab-saved-services"
			tabindex="0"
		>
			<DashboardSavedServiceSearchesPanel />
		</div>
	{/if}
</div>
