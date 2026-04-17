<script lang="ts">
	import { t } from 'svelte-i18n';

	interface Props {
		onRetry: () => void;
	}

	let { onRetry }: Props = $props();
</script>

<div class="py-12 text-center">
	<svg
		xmlns="http://www.w3.org/2000/svg"
		class="text-base-content/30 mx-auto h-16 w-16"
		fill="none"
		viewBox="0 0 24 24"
		stroke="currentColor"
	>
		<path
			stroke-linecap="round"
			stroke-linejoin="round"
			stroke-width="1.5"
			d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
		/>
	</svg>
	<h3 class="mt-4 text-xl font-semibold">{$t('task.drawer.no_bids')}</h3>
	<button class="btn btn-primary mt-4" onclick={onRetry}>
		{$t('dashboard.bids.bid_acceptance.retry')}
	</button>
</div>
