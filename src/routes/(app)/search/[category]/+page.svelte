<script lang="ts">
	import { page } from '$app/state';
	import UnifiedSearch from '$lib/components/search/UnifiedSearch.svelte';

	let category = $derived(page.params.category || '');
</script>

<svelte:head>
	<title>Search · BitTasker</title>
</svelte:head>

{#key category}
	<UnifiedSearch {category} />
{/key}
