<script lang="ts">
	let { count = 4 } = $props<{ count?: number }>();
</script>

<div class="space-y-3">
	{#each Array(count) as _}
		<div class="card bg-base-100 animate-pulse rounded-xl p-4 shadow-md">
			<div class="flex flex-col gap-3 md:flex-row md:items-center">
				<div class="bg-base-300 h-6 w-3/4 rounded"></div>
				<div class="bg-base-300 h-5 w-28 rounded"></div>
			</div>
			<div class="my-3 grid grid-cols-1 gap-3 md:grid-cols-3">
				<div class="bg-base-300 h-5 w-24 rounded"></div>
				<div class="bg-base-300 h-5 w-32 rounded"></div>
				<div class="bg-base-300 h-5 w-28 rounded"></div>
			</div>
			<div class="flex gap-2">
				<div class="bg-base-300 h-5 w-16 rounded"></div>
				<div class="bg-base-300 h-5 w-20 rounded"></div>
				<div class="bg-base-300 h-5 w-12 rounded"></div>
			</div>
			<div class="mt-3 flex items-center justify-between">
				<div class="bg-base-300 h-5 w-12 rounded"></div>
				<div class="bg-base-300 h-8 w-20 rounded"></div>
			</div>
		</div>
	{/each}
</div>
