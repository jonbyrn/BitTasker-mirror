<script lang="ts">
	let {
		tags = [],
		onchange,
		label = 'Tags',
		placeholder = 'Add a tag and press Enter'
	}: {
		tags?: string[];
		onchange: (tags: string[]) => void;
		label?: string;
		placeholder?: string;
	} = $props();

	let draft = $state('');

	function commit() {
		const value = draft.trim().replace(/\s+/g, ' ');
		if (
			!value ||
			tags.some((tag) => tag.toLowerCase() === value.toLowerCase()) ||
			tags.length >= 8
		) {
			draft = '';
			return;
		}
		onchange([...tags, value]);
		draft = '';
	}

	function remove(tag: string) {
		onchange(tags.filter((item) => item !== tag));
	}
</script>

<div class="form-control w-full">
	<label class="label" for="listing-tags">
		<span class="label-text">{label}</span>
		<span class="label-text-alt">{tags.length}/8</span>
	</label>
	<div class="mb-2 flex flex-wrap gap-1.5">
		{#each tags as tag (tag)}
			<button type="button" class="badge badge-outline gap-1" onclick={() => remove(tag)}>
				{tag}
				<span aria-hidden="true">×</span>
			</button>
		{/each}
	</div>
	<input
		id="listing-tags"
		class="input input-bordered w-full"
		{placeholder}
		bind:value={draft}
		onkeydown={(event) => {
			if (event.key === 'Enter') {
				event.preventDefault();
				commit();
			}
		}}
	/>
	<p class="text-base-content/60 mt-1 text-xs">Shown on the card and used in search.</p>
</div>
