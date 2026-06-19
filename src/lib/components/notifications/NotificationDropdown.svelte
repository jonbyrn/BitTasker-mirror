<script lang="ts">
	import { tick } from 'svelte';
	import { fly } from 'svelte/transition';
	import { notificationCenterStore } from '$lib/stores/notificationCenter.store';
	import NotificationCard from './NotificationCard.svelte';
	import NotificationEmptyState from './NotificationEmptyState.svelte';
	import NotificationSkeleton from './NotificationSkeleton.svelte';
	import { goto } from '$app/navigation';
	import { t } from 'svelte-i18n';
	import IconCheckAll from '~icons/mdi/check-all';

	let { onclose }: { onclose: () => void } = $props();

	let dropdownEl = $state<HTMLDivElement | null>(null);

	let notifications = $derived($notificationCenterStore.notifications.slice(0, 10));
	let loading = $derived($notificationCenterStore.loading);
	let unreadCount = $derived($notificationCenterStore.unreadCount);

	async function handleMarkAllRead() {
		await notificationCenterStore.markAllRead();
	}

	async function handleViewAll() {
		onclose();
		await goto('/notifications');
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') onclose();
	}

	$effect(() => {
		if (dropdownEl) {
			tick().then(() => {
				const firstCard = dropdownEl?.querySelector('[role="listitem"]');
				if (firstCard instanceof HTMLElement) firstCard.focus();
			});
		}
	});
</script>

<div
	bind:this={dropdownEl}
	class="border-base-300 bg-base-100 fixed top-[56px] right-2 left-2
		z-50 mt-1 max-h-[80vh] rounded-xl border shadow-xl
		sm:absolute sm:top-full sm:right-0 sm:left-auto sm:mt-2 sm:max-h-[400px] sm:w-[400px]"
	role="dialog"
	aria-label={$t('notifications.aria_labels.notifications')}
	onkeydown={handleKeydown}
	transition:fly={{ y: -10, duration: 150 }}
	tabindex={-1}
>
	<div class="border-base-200 flex items-center justify-between border-b px-4 py-3">
		<h4 class="text-xs font-semibold sm:text-sm">{$t('notifications.title')}</h4>
		{#if unreadCount > 0}
			<button class="btn btn-ghost btn-xs text-primary gap-1" onclick={handleMarkAllRead}>
				<IconCheckAll class="h-3.5 w-3.5" />
				{$t('notifications.mark_all_read')}
			</button>
		{/if}
	</div>

	<div class="max-h-[400px] overflow-y-auto">
		{#if loading}
			<NotificationSkeleton count={3} compact />
		{:else if notifications.length === 0}
			<NotificationEmptyState compact />
		{:else}
			<div class="divide-base-200 divide-y">
				{#each notifications as notification (notification.id)}
					<NotificationCard {notification} compact {onclose} />
				{/each}
			</div>
		{/if}
	</div>

	{#if notifications.length > 0}
		<div class="border-base-200 border-t px-4 py-2 text-center">
			<button class="btn btn-ghost btn-sm text-primary w-full" onclick={handleViewAll}>
				{$t('notifications.view_all')}
			</button>
		</div>
	{/if}
</div>
