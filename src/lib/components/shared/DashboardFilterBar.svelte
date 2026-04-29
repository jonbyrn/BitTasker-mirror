<script lang="ts">
	import type { Snippet } from 'svelte';
	import IconRefresh from '~icons/mdi/refresh';

	let {
		onRefresh,
		isRefreshing = false,
		refreshDisabled = false,
		children
	}: {
		onRefresh?: () => void;
		isRefreshing?: boolean;
		refreshDisabled?: boolean;
		children?: Snippet;
	} = $props();
</script>

<div
	class="border-base-300/60 bg-base-100/40 flex flex-row items-center justify-between gap-2 rounded-2xl border p-2 pl-3 shadow-sm sm:items-center sm:gap-4 sm:p-2 sm:px-4"
>
	<div class="flex min-w-0 flex-1 items-center gap-3 sm:gap-4">
		<div class="grid flex-1 grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:gap-3">
			{@render children?.()}
		</div>
	</div>

	{#if onRefresh}
		<div class="sm:border-base-300/50 flex shrink-0 items-center sm:border-l sm:pl-4">
			<button
				type="button"
				class="btn btn-ghost btn-sm h-10 w-10 rounded-2xl p-0"
				onclick={onRefresh}
				disabled={refreshDisabled || isRefreshing}
				aria-label="Refresh"
			>
				{#if isRefreshing}
					<span class="loading loading-spinner loading-xs"></span>
				{:else}
					<IconRefresh class="h-5 w-5 opacity-70" />
				{/if}
			</button>
		</div>
	{/if}
</div>
