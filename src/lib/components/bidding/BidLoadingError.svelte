<script lang="ts">
	import { t } from 'svelte-i18n';

	interface Props {
		error: string;
		onRetry?: () => void;
	}

	let { error, onRetry }: Props = $props();
</script>

<div class="py-12 text-center">
	<svg
		xmlns="http://www.w3.org/2000/svg"
		class="text-error mx-auto h-16 w-16"
		fill="none"
		viewBox="0 0 24 24"
		stroke="currentColor"
	>
		<path
			stroke-linecap="round"
			stroke-linejoin="round"
			stroke-width="1.5"
			d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
		/>
	</svg>
	<h3 class="text-error mt-4 text-xl font-semibold">
		{$t('dashboard.bids.bid_acceptance.error_loading_bids')}
	</h3>
	<p class="text-base-content/60 mt-2 mb-4">
		{error}
	</p>
	{#if onRetry}
		<button class="btn btn-primary mt-4" onclick={onRetry}>
			{$t('dashboard.bids.bid_acceptance.retry')}
		</button>
	{:else}
		<div class="text-base-content/60 text-sm">
			{$t('dashboard.bids.bid_acceptance.retry')}
		</div>
	{/if}
</div>
