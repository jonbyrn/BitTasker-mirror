<script lang="ts">
	import { t } from 'svelte-i18n';
	import type { ServiceQuoteTimelineEntry } from '$lib/types/service-quote';

	let {
		timelines = [],
		focusedRequestId = null,
		isSyncing = false,
		hasLoaded = false
	}: {
		timelines?: ServiceQuoteTimelineEntry[];
		focusedRequestId?: string | null;
		isSyncing?: boolean;
		hasLoaded?: boolean;
	} = $props();

</script>

<div class="space-y-3" data-testid="my-quotes-panel">
	{#if isSyncing}
		<div class="alert alert-outline alert-warning text-sm" data-testid="my-quotes-partial-alert">
			<span>
				{$t(
					'dashboard.my_quotes.partial_sync',
					'Latest quote thread data is still propagating across relays. Showing partial results until the thread finishes syncing.'
				)}
			</span>
		</div>
	{/if}

	{#if timelines.length === 0}
		<p class="text-base-content/60 text-sm" data-testid="my-quotes-empty">
			{$t('dashboard.my_quotes.empty', 'No quote requests yet.')}
		</p>
	{:else}
		<ul class="space-y-2" data-testid="my-quotes-list">
			{#each timelines as timeline (timeline.request.id)}
				<li class="border-base-300 rounded-lg border p-3 text-sm">
					{timeline.request.content.quoteRequestId ?? timeline.request.id}
				</li>
			{/each}
		</ul>
	{/if}
</div>
