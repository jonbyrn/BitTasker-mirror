<script lang="ts">
	import { locale } from 'svelte-i18n';
	import CategoryTileGrid from '$lib/components/categories/CategoryTileGrid.svelte';
	import { categoryCopy } from '$lib/search/taxonomy.js';

	const copy = $derived(categoryCopy(String($locale || 'en')));
</script>

<svelte:head>
	<title>{copy.seeAll} · BitTasker</title>
</svelte:head>

<CategoryTileGrid />
