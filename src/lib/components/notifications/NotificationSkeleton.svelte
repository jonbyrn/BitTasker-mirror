<script lang="ts">
	let { count = 3, compact = false }: { count?: number; compact?: boolean } = $props();
</script>

<div class="divide-base-200 divide-y">
	{#each Array(count) as _, i (i)}
		<div class="flex items-start gap-3 {compact ? 'px-4 py-2' : 'px-4 py-3'} animate-pulse">
			<div class="skeleton h-5 w-5 shrink-0 rounded-full"></div>
			<div class="min-w-0 flex-1 space-y-2">
				<div class="skeleton h-4 w-3/4 rounded"></div>
				<div class="skeleton h-3 w-full rounded"></div>
				<div class="skeleton h-3 w-1/2 rounded"></div>
			</div>
			<div class="skeleton h-3 w-10 shrink-0 rounded"></div>
		</div>
	{/each}
</div>
