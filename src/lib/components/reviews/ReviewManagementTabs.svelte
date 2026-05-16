<script lang="ts">
	import { t } from 'svelte-i18n';

	let {
		activeTab,
		receivedCount = 0,
		givenCount = 0,
		pendingCount = 0,
		isCurrentUser = false,
		idPrefix = 'reviews',
		onTabChange
	} = $props<{
		activeTab: 'received' | 'given' | 'pending';
		receivedCount?: number;
		givenCount?: number;
		pendingCount?: number;
		isCurrentUser?: boolean;
		idPrefix?: string;
		onTabChange?: (tab: 'received' | 'given' | 'pending') => void;
	}>();

	function handleTabClick(tab: 'received' | 'given' | 'pending') {
		onTabChange?.(tab);
	}

	function getVisibleTabs(): Array<'received' | 'given' | 'pending'> {
		return isCurrentUser ? ['received', 'given', 'pending'] : ['received'];
	}

	function focusTab(tab: 'received' | 'given' | 'pending') {
		const element = document.getElementById(`${idPrefix}-tab-${tab}`) as HTMLButtonElement | null;
		element?.focus();
	}

	function handleTabKeydown(event: KeyboardEvent, tab: 'received' | 'given' | 'pending') {
		const tabs = getVisibleTabs();
		const currentIndex = tabs.indexOf(tab);

		if (currentIndex === -1) {
			return;
		}

		if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
			event.preventDefault();
			const direction = event.key === 'ArrowRight' ? 1 : -1;
			const nextIndex = (currentIndex + direction + tabs.length) % tabs.length;
			const nextTab = tabs[nextIndex];
			handleTabClick(nextTab);
			focusTab(nextTab);
			return;
		}

		if (event.key === 'Home') {
			event.preventDefault();
			handleTabClick(tabs[0]);
			focusTab(tabs[0]);
			return;
		}

		if (event.key === 'End') {
			event.preventDefault();
			const lastTab = tabs[tabs.length - 1];
			handleTabClick(lastTab);
			focusTab(lastTab);
		}
	}
</script>

{#if isCurrentUser}
	<div
		class="tabs tabs-bordered mb-4 grid w-full grid-cols-3"
		role="tablist"
		aria-label={$t('reviews.management.title')}
	>
		<button
			id={`${idPrefix}-tab-received`}
			type="button"
			class={`tab text-center ${activeTab === 'received' ? 'tab-active' : ''}`}
			role="tab"
			aria-selected={activeTab === 'received'}
			aria-controls={`${idPrefix}-panel-received`}
			tabindex={activeTab === 'received' ? 0 : -1}
			onclick={() => handleTabClick('received')}
			onkeydown={(event) => handleTabKeydown(event, 'received')}
		>
			{$t('reviews.tabs.received')} ({receivedCount})
		</button>
		<button
			id={`${idPrefix}-tab-given`}
			type="button"
			class={`tab text-center ${activeTab === 'given' ? 'tab-active' : ''}`}
			role="tab"
			aria-selected={activeTab === 'given'}
			aria-controls={`${idPrefix}-panel-given`}
			tabindex={activeTab === 'given' ? 0 : -1}
			onclick={() => handleTabClick('given')}
			onkeydown={(event) => handleTabKeydown(event, 'given')}
		>
			{$t('reviews.tabs.given')} ({givenCount})
		</button>
		<button
			id={`${idPrefix}-tab-pending`}
			type="button"
			class={`tab text-center ${activeTab === 'pending' ? 'tab-active' : ''}`}
			role="tab"
			aria-selected={activeTab === 'pending'}
			aria-controls={`${idPrefix}-panel-pending`}
			tabindex={activeTab === 'pending' ? 0 : -1}
			onclick={() => handleTabClick('pending')}
			onkeydown={(event) => handleTabKeydown(event, 'pending')}
		>
			{$t('reviews.tabs.pending')} ({pendingCount})
		</button>
	</div>
{:else}
	<div
		class="tabs tabs-bordered mb-4 w-full"
		role="tablist"
		aria-label={$t('reviews.management.title')}
	>
		<button
			id={`${idPrefix}-tab-received`}
			type="button"
			class={`tab text-center ${activeTab === 'received' ? 'tab-active' : ''}`}
			role="tab"
			aria-selected={activeTab === 'received'}
			aria-controls={`${idPrefix}-panel-received`}
			tabindex={activeTab === 'received' ? 0 : -1}
			onclick={() => handleTabClick('received')}
			onkeydown={(event) => handleTabKeydown(event, 'received')}
		>
			{$t('reviews.tabs.received')} ({receivedCount})
		</button>
	</div>
{/if}
