<script lang="ts">
	import type { SearchServicesParams } from '$lib/types/service.d';

	let {
		onApply,
		initialFilters
	}: {
		onApply: (filters: SearchServicesParams) => void;
		initialFilters?: SearchServicesParams;
	} = $props();
</script>

<div data-testid="service-search-filters-stub">
	<button
		type="button"
		onclick={() =>
			onApply({
				categories: [],
				skills: [],
				serviceLocationTypes: [],
				search: '',
				page: 1,
				limit: 20
			})}
	>
		Apply Empty Service Filters
	</button>
	{#if initialFilters}
		<div data-testid="service-filters-initial-location">
			{initialFilters.location ?? ''}
		</div>
	{/if}
</div>
