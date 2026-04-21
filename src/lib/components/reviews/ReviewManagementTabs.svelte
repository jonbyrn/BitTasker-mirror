<script lang="ts">
	import { t } from 'svelte-i18n';
	import type { ReviewViewTab } from './reviewTypes';

	let {
		activeTab,
		receivedCount = 0,
		givenCount = 0,
		pendingCount = 0,
		isCurrentUser = false,
		idPrefix = 'reviews',
		onTabChange
	} = $props<{
		activeTab: ReviewViewTab;
		receivedCount?: number;
		givenCount?: number;
		pendingCount?: number;
		isCurrentUser?: boolean;
		idPrefix?: string;
		onTabChange?: (tab: ReviewViewTab) => void;
	}>();

	const visibleTabs = $derived(
		isCurrentUser
			? (['pending', 'received', 'given'] as ReviewViewTab[])
			: (['received'] as ReviewViewTab[])
	);

	function handleTabClick(tab: ReviewViewTab) {
		onTabChange?.(tab);
	}

	function focusTab(tab: ReviewViewTab) {
		const element = document.getElementById(`${idPrefix}-tab-${tab}`) as HTMLButtonElement | null;
		element?.focus();
	}

	function handleTabKeydown(event: KeyboardEvent, tab: ReviewViewTab) {
		const currentIndex = visibleTabs.indexOf(tab);
		if (currentIndex === -1) return;

		if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
			event.preventDefault();
			const direction = event.key === 'ArrowRight' ? 1 : -1;
			const nextIndex = (currentIndex + direction + visibleTabs.length) % visibleTabs.length;
			const nextTab = visibleTabs[nextIndex];
			handleTabClick(nextTab);
			focusTab(nextTab);
			return;
		}

		if (event.key === 'Home') {
			event.preventDefault();
			handleTabClick(visibleTabs[0]);
			focusTab(visibleTabs[0]);
			return;
		}

		if (event.key === 'End') {
			event.preventDefault();
			const lastTab = visibleTabs[visibleTabs.length - 1];
			handleTabClick(lastTab);
			focusTab(lastTab);
		}
	}
</script>

<div class="overflow-x-auto pb-1">
	<div
		class="tabs tabs-bordered border-base-300 inline-flex min-w-full flex-nowrap rounded-2xl"
		role="tablist"
		aria-label={$t('reviews.management.title')}
		aria-orientation="horizontal"
	>
		{#if isCurrentUser}
			<button
				id={`${idPrefix}-tab-pending`}
				type="button"
				class={`tab reviews-tab h-auto shrink-0 px-3 py-2 whitespace-nowrap ${
					activeTab === 'pending' ? 'tab-active' : ''
				}`}
				role="tab"
				aria-selected={activeTab === 'pending'}
				aria-controls={`${idPrefix}-panel-pending`}
				tabindex={activeTab === 'pending' ? 0 : -1}
				onclick={() => handleTabClick('pending')}
				onkeydown={(event) => handleTabKeydown(event, 'pending')}
			>
				<span>{$t('reviews.tabs.pending')}</span>
				{#if pendingCount > 0}
					<span class="badge badge-sm badge-warning ml-2 shrink-0">{pendingCount}</span>
				{/if}
			</button>
		{/if}

		<button
			id={`${idPrefix}-tab-received`}
			type="button"
			class={`tab reviews-tab h-auto shrink-0 px-3 py-2 whitespace-nowrap ${
				activeTab === 'received' ? 'tab-active' : ''
			}`}
			role="tab"
			aria-selected={activeTab === 'received'}
			aria-controls={`${idPrefix}-panel-received`}
			tabindex={activeTab === 'received' ? 0 : -1}
			onclick={() => handleTabClick('received')}
			onkeydown={(event) => handleTabKeydown(event, 'received')}
		>
			<span>{$t('reviews.tabs.received')}</span>
			{#if receivedCount > 0}
				<span class="badge badge-primary badge-sm ml-2 shrink-0">{receivedCount}</span>
			{/if}
		</button>

		{#if isCurrentUser}
			<button
				id={`${idPrefix}-tab-given`}
				type="button"
				class={`tab reviews-tab h-auto shrink-0 px-3 py-2 whitespace-nowrap ${
					activeTab === 'given' ? 'tab-active' : ''
				}`}
				role="tab"
				aria-selected={activeTab === 'given'}
				aria-controls={`${idPrefix}-panel-given`}
				tabindex={activeTab === 'given' ? 0 : -1}
				onclick={() => handleTabClick('given')}
				onkeydown={(event) => handleTabKeydown(event, 'given')}
			>
				<span>{$t('reviews.tabs.given')}</span>
				{#if givenCount > 0}
					<span class="badge badge-primary badge-sm ml-2 shrink-0">{givenCount}</span>
				{/if}
			</button>
		{/if}
	</div>
</div>

<style>
	.reviews-tab.tab-active {
		position: relative;
	}

	.reviews-tab.tab-active::after {
		content: '';
		position: absolute;
		right: 0;
		bottom: 0;
		left: 0;
		height: 2px;
		background-color: var(--color-primary, oklch(var(--p)));
		border-radius: 9999px;
	}
</style>
