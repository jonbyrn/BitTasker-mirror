<script lang="ts">
	let {
		query = $bindable(''),
		placeholder,
		suggestions,
		onpick
	}: {
		query?: string;
		placeholder: string;
		suggestions: Array<{ id: string; label: string; categoryId: string }>;
		onpick: (categoryId: string) => void;
	} = $props();

	let open = $state(false);
	const showList = $derived(open && query.trim().length > 0 && suggestions.length > 0);

	function choose(categoryId: string) {
		onpick(categoryId);
		open = false;
	}

	function onKeydown(event: KeyboardEvent) {
		if (event.key !== 'Enter' || suggestions.length === 0) return;
		event.preventDefault();
		choose(suggestions[0].categoryId);
	}
</script>

<div data-testid="browse-search">
	<label class="mb-2 block text-sm" for="browse-query">{placeholder}</label>
	<input
		id="browse-query"
		class="input input-bordered w-full"
		type="search"
		{placeholder}
		bind:value={query}
		role="combobox"
		aria-expanded={showList}
		aria-controls="browse-suggestions"
		autocomplete="off"
		onfocus={() => (open = true)}
		onblur={() => (open = false)}
		onkeydown={onKeydown}
	/>
	{#if showList}
		<ul
			id="browse-suggestions"
			class="border-base-300 mt-2 rounded-lg border"
			data-testid="browse-suggestions"
		>
			{#each suggestions as item (item.id)}
				<li>
					<button
						type="button"
						class="hover:bg-base-200 w-full px-3 py-2 text-left"
						onmousedown={(event) => event.preventDefault()}
						onclick={() => choose(item.categoryId)}
					>
						{item.label}
					</button>
				</li>
			{/each}
		</ul>
	{/if}
</div>
