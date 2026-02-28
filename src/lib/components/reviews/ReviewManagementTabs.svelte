<script lang="ts">
	import { t } from 'svelte-i18n';

	let {
		activeTab,
		receivedCount = 0,
		givenCount = 0,
		pendingCount = 0,
		isCurrentUser = false,
		onTabChange
	} = $props<{
		activeTab: 'received' | 'given' | 'pending';
		receivedCount?: number;
		givenCount?: number;
		pendingCount?: number;
		isCurrentUser?: boolean;
		onTabChange?: (tab: 'received' | 'given' | 'pending') => void;
	}>();

	function handleTabClick(tab: 'received' | 'given' | 'pending') {
		onTabChange?.(tab);
	}
</script>

<div class="tabs tabs-boxed bg-base-200">
	<button
		class="tab {activeTab === 'received' ? 'tab-active' : ''}"
		onclick={() => handleTabClick('received')}
	>
		{$t('reviews.tabs.received')}
		{#if receivedCount > 0}
			<span class="badge badge-sm badge-primary ml-2">{receivedCount}</span>
		{/if}
	</button>

	{#if isCurrentUser}
		<button
			class="tab {activeTab === 'given' ? 'tab-active' : ''}"
			onclick={() => handleTabClick('given')}
		>
			{$t('reviews.tabs.given')}
			{#if givenCount > 0}
				<span class="badge badge-sm badge-primary ml-2">{givenCount}</span>
			{/if}
		</button>

		<button
			class="tab {activeTab === 'pending' ? 'tab-active' : ''}"
			onclick={() => handleTabClick('pending')}
		>
			{$t('reviews.tabs.pending')}
			{#if pendingCount > 0}
				<span class="badge badge-sm badge-warning ml-2">{pendingCount}</span>
			{/if}
		</button>
	{/if}
</div>


