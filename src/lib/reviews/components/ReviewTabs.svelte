<script lang="ts">
	import type { ReviewTab } from '$lib/reviews';
	import { t } from 'svelte-i18n';

	let {
		activeTab,
		pendingCount = 0,
		givenCount = 0,
		receivedCount = 0,
		onTabChange = () => {}
	} = $props<{
		activeTab: ReviewTab;
		pendingCount?: number;
		givenCount?: number;
		receivedCount?: number;
		onTabChange?: (tab: ReviewTab) => void;
	}>();
</script>

<div class="tabs tabs-boxed bg-base-200 inline-flex min-w-full flex-nowrap gap-1 p-1">
	<button
		type="button"
		class={`tab h-auto shrink-0 px-3 py-2 ${activeTab === 'pending' ? 'tab-active' : ''}`}
		onclick={() => onTabChange('pending')}
	>
		{$t('reviews.tabs.pending')}
		{#if pendingCount > 0}
			<span class="badge badge-warning badge-sm ml-2">{pendingCount}</span>
		{/if}
	</button>
	<button
		type="button"
		class={`tab h-auto shrink-0 px-3 py-2 ${activeTab === 'given' ? 'tab-active' : ''}`}
		onclick={() => onTabChange('given')}
	>
		{$t('reviews.tabs.given')}
		{#if givenCount > 0}
			<span class="badge badge-sm ml-2">{givenCount}</span>
		{/if}
	</button>
	<button
		type="button"
		class={`tab h-auto shrink-0 px-3 py-2 ${activeTab === 'received' ? 'tab-active' : ''}`}
		onclick={() => onTabChange('received')}
	>
		{$t('reviews.tabs.received')}
		{#if receivedCount > 0}
			<span class="badge badge-sm ml-2">{receivedCount}</span>
		{/if}
	</button>
</div>
