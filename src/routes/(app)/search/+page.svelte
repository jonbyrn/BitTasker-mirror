<script lang="ts">
	import UnifiedSearch from '$lib/components/search/UnifiedSearch.svelte';
	import DocumentTitle from '$lib/components/seo/DocumentTitle.svelte';
</script>

<svelte:head>
	<DocumentTitle fallback="Search · BitTasker" />
</svelte:head>

<UnifiedSearch />
