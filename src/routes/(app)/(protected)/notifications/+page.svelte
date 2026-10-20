<script lang="ts">
	import { onMount } from 'svelte';
	import { t } from 'svelte-i18n';
	import { notificationCenterStore } from '$lib/stores/notificationCenter.store';
	import NotificationCard from '$lib/components/notifications/NotificationCard.svelte';
	import NotificationEmptyState from '$lib/components/notifications/NotificationEmptyState.svelte';
	import NotificationSkeleton from '$lib/components/notifications/NotificationSkeleton.svelte';
	import ConfirmModal from '$lib/components/ConfirmModal.svelte';
	import { browserNetworkStatus } from '$lib/utils/network-status';
	import { createSingleFlight } from '$lib/utils/ui/single-flight';
	import ActionButton from '$lib/components/design/ActionButton.svelte';
	import ListRegion from '$lib/components/design/ListRegion.svelte';

	const filterTabs = ['all', 'unread', 'read'];

	let activeFilter = $derived($notificationCenterStore.activeFilter);
	let notifications = $derived($notificationCenterStore.notifications);
	let loading = $derived($notificationCenterStore.loading);
	let loadingMore = $derived($notificationCenterStore.loadingMore);
	let hasMore = $derived($notificationCenterStore.hasMore);
	let total = $derived($notificationCenterStore.total);
	let unreadCount = $derived($notificationCenterStore.unreadCount);
	let isOffline = $derived(!$browserNetworkStatus.online);
	let loadError = $derived($notificationCenterStore.error);
	let showClearConfirm = $state(false);
	let pendingAction = $state<'' | 'read' | 'clear' | 'more' | 'retry'>('');
	const actionFlight = createSingleFlight();

	onMount(() => {
		notificationCenterStore.refresh();
	});

	function handleFilterChange(filter: string) {
		notificationCenterStore.setFilter(filter);
	}

	function handleLoadMore() {
		void actionFlight.run(async () => {
			pendingAction = 'more';
			try {
				await notificationCenterStore.loadMore();
			} finally {
				pendingAction = '';
			}
		});
	}

	function handleMarkAllRead() {
		void actionFlight.run(async () => {
			pendingAction = 'read';
			try {
				await notificationCenterStore.markAllRead();
			} finally {
				pendingAction = '';
			}
		});
	}

	function handleClearAll() {
		showClearConfirm = true;
	}

	async function confirmClearAll() {
		showClearConfirm = false;
		await actionFlight.run(async () => {
			pendingAction = 'clear';
			try {
				await notificationCenterStore.clearAll();
			} finally {
				pendingAction = '';
			}
		});
	}

	function retryLoad() {
		void actionFlight.run(async () => {
			pendingAction = 'retry';
			try {
				await notificationCenterStore.refresh();
			} finally {
				pendingAction = '';
			}
		});
	}
</script>

<svelte:head>
	<title>{$t('notifications.page_title')}</title>
</svelte:head>

<div class="mx-auto h-full w-full max-w-3xl min-w-0 px-2 py-6 md:px-0">
	<div class="mb-6">
		<div>
			<h3>{$t('notifications.title')}</h3>
			<p class="text-base-content/70 text-sm">{$t('notifications.subtitle')}</p>
		</div>
		<div class="mt-2 flex justify-end gap-2">
			{#if unreadCount > 0}
				<ActionButton
					variant="ghost"
					class="text-primary"
					onclick={handleMarkAllRead}
					pending={pendingAction === 'read'}
					pendingLabel={$t('notifications.working')}
				>
					{$t('notifications.mark_all_read')}
				</ActionButton>
			{/if}
			{#if notifications.length > 0}
				<button class="btn btn-ghost btn-sm text-error" onclick={handleClearAll}>
					{$t('notifications.clear_all')}
				</button>
			{/if}
		</div>
	</div>

	{#if isOffline}
		<div class="alert alert-warning mb-4 text-sm">
			<span>{$t('notifications.offline_indicator')}</span>
		</div>
	{/if}

	<div class="mb-4 flex gap-2 overflow-x-auto pb-2">
		{#each filterTabs as tab (tab)}
			<button
				class="btn btn-sm {activeFilter === tab ? 'btn-primary' : 'btn-ghost'}"
				aria-pressed={activeFilter === tab}
				onclick={() => handleFilterChange(tab)}
			>
				{$t(`notifications.filters.${tab}`)}
				{#if tab === 'unread' && unreadCount > 0}
					<span class="badge badge-xs">{unreadCount}</span>
				{/if}
			</button>
		{/each}
	</div>

	{#if loadError}
		<div class="mb-4">
			<ListRegion
				status="error"
				title={$t('notifications.load_failed_title')}
				message={loadError}
				actionLabel={$t('notifications.retry')}
				pending={pendingAction === 'retry'}
				onAction={retryLoad}
			/>
		</div>
	{/if}

	{#if loading}
		<div class="border-base-300 bg-base-100 divide-base-200 divide-y rounded-xl border">
			<NotificationSkeleton count={5} />
		</div>
	{:else if notifications.length === 0 && !loadError}
		<NotificationEmptyState />
	{:else if notifications.length > 0}
		<div class="divide-base-200 border-base-300 bg-base-100 divide-y rounded-xl border">
			{#each notifications as notification (notification.id)}
				<NotificationCard {notification} />
			{/each}
		</div>

		{#if hasMore}
			<div class="mt-4 text-center">
				<ActionButton
					variant="outline"
					onclick={handleLoadMore}
					disabled={loadingMore}
					pending={loadingMore || pendingAction === 'more'}
					pendingLabel={$t('notifications.working')}
				>
					{$t('notifications.show_all')}
				</ActionButton>
			</div>
		{/if}

		<div class="text-base-content/50 mt-4 text-center text-xs">
			{$t('notifications.stats.showing')}
			{notifications.length}
			{$t('notifications.stats.of')}
			{total}
			{$t('notifications.stats.notifications')}
		</div>
	{/if}
</div>

<ConfirmModal
	isOpen={showClearConfirm}
	title={$t('notifications.clear_all_confirm_title')}
	message={$t('notifications.clear_all_confirm_message')}
	confirmText={$t('notifications.clear_all')}
	confirmButtonClass="btn-error"
	onConfirm={confirmClearAll}
	onCancel={() => (showClearConfirm = false)}
/>
