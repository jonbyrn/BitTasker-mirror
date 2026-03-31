<script lang="ts">
	import type { SearchTasksParams } from '$lib/types/task.d';

	let {
		onApply,
		initialFilters
	}: {
		onApply: (filters: SearchTasksParams) => void;
		initialFilters?: SearchTasksParams;
	} = $props();
</script>

<div data-testid="task-filter-drawer-stub">
	<button
		type="button"
		onclick={() =>
			onApply({
				search: '',
				categories: [],
				skills: [],
				budget: {
					tier: undefined,
					currency: undefined,
					type: undefined
				},
				taskType: undefined,
				location: undefined,
				radius: 1.5,
				deadline: undefined,
				dateRange: undefined,
				page: 1,
				limit: 20
			})}
	>
		Apply Empty Task Filters
	</button>
	{#if initialFilters}
		<div data-testid="task-filters-initial-location">{initialFilters.location ?? ''}</div>
	{/if}
</div>
