<script lang="ts">
	import { onMount } from 'svelte';
	import { t } from 'svelte-i18n';
	import { fetchCatalog, mapCatalogShift } from '$lib/search/catalog-client';

	let shifts = $state<ReturnType<typeof mapCatalogShift>[]>([]);
	let loaded = $state(false);

	onMount(async () => {
		const catalog = await fetchCatalog('shift', '');
		shifts = (catalog?.hits ?? []).map(mapCatalogShift);
		loaded = true;
	});
</script>

<main id="browse-staff" class="mx-auto w-full max-w-6xl px-4 py-6">
	<h1 class="text-2xl font-semibold">{$t('common.catalog.staff_title')}</h1>
	{#if loaded && shifts.length === 0}
		<p class="mt-4">{$t('common.catalog.staff_empty')}</p>
	{:else if loaded}
		<p class="mt-2">{$t('common.catalog.staff_count', { values: { count: shifts.length } })}</p>
		<ul class="mt-4 grid gap-4">
			{#each shifts as shift (shift.id)}
				<li class="bg-base-100 rounded-box p-4">
					<h2 class="font-medium">{shift.title}</h2>
					{#if shift.description}
						<p class="mt-1">{shift.description}</p>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</main>
