<script lang="ts">
	let {
		query = '',
		count = 0,
		loading = false
	}: {
		query?: string;
		count?: number;
		loading?: boolean;
	} = $props();

	const activeQuery = $derived(query.trim());
</script>

{#if activeQuery}
	<p class="text-base-content/70 px-1 pb-3 text-sm" role="status" aria-live="polite">
		{#if loading}
			Searching for “{activeQuery}”…
		{:else if count === 0}
			No results for “{activeQuery}”. Try a skill, category, or a shorter word.
		{:else}
			{count} {count === 1 ? 'result' : 'results'} for “{activeQuery}”
		{/if}
	</p>
{/if}
