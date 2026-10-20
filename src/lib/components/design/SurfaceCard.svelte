<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		children,
		class: className = '',
		labelledBy = undefined
	}: {
		children?: Snippet;
		class?: string;
		labelledBy?: string;
	} = $props();
</script>

<section
	class="card bg-base-100 border-base-300 border shadow-sm {className}"
	aria-labelledby={labelledBy}
>
	<div class="card-body gap-3 p-5">
		{@render children?.()}
	</div>
</section>
