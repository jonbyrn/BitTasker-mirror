<script lang="ts">
	import ListingControls from '$lib/components/listing/ListingControls.svelte';

	let {
		searchQuery = $bindable(),
		searchInputClass,
		searchPlaceholder,
		onSearchInput,
		onFilterClick,
		onSaveSearch,
		canSaveSearch,
		viewMode,
		onToggleViewMode,
		user,
		drawersLoaded,
		loadDrawerComponents,
		translationNamespace = 'find_tasks',
		filterLabelKey = 'filters'
	} = $props<{
		searchQuery: string;
		searchInputClass: string;
		searchPlaceholder: string;
		onSearchInput: (e: Event) => void;
		onFilterClick: () => void;
		onSaveSearch: () => Promise<void>;
		canSaveSearch: boolean;
		viewMode: 'list' | 'map';
		onToggleViewMode: () => void;
		user: { npub?: string } | null;
		drawersLoaded: boolean;
		loadDrawerComponents: () => Promise<void>;
		translationNamespace?: string;
		filterLabelKey?: string;
	}>();
</script>

<ListingControls
	bind:searchQuery
	{searchInputClass}
	{searchPlaceholder}
	{onSearchInput}
	{onFilterClick}
	{onSaveSearch}
	{canSaveSearch}
	{viewMode}
	{onToggleViewMode}
	{user}
	{drawersLoaded}
	{loadDrawerComponents}
	{translationNamespace}
	{filterLabelKey}
/>
