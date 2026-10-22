<script lang="ts">
	import { page } from '$app/state';
	import UnifiedSearch from '$lib/components/search/UnifiedSearch.svelte';
	import DocumentTitle from '$lib/components/seo/DocumentTitle.svelte';

	let category = $derived(page.params.category || '');
</script>

<svelte:head>
	<DocumentTitle fallback="Search · BitTasker" />
</svelte:head>

{#key category}
	<UnifiedSearch {category} />
{/key}
