<script lang="ts">
	import { onMount } from 'svelte';
	import { notificationCenterStore, sandboxPagesHost } from '$lib/stores/notificationCenter.store';
	import { clickOutside } from '$lib/utils/clickOutside';
	import { page } from '$app/state';
	import { t } from 'svelte-i18n';
	import NotificationDropdown from './NotificationDropdown.svelte';
	import IconBell from '~icons/mdi/bell';
	import IconBellBadge from '~icons/mdi/bell-badge';

	let showDropdown = $state(false);
	let unreadCount = $derived($notificationCenterStore.unreadCount);
	let hasUnread = $derived(unreadCount > 0);

	onMount(() => {
		notificationCenterStore.fetchUnreadCount();
		if (!sandboxPagesHost()) return;
		const timer = setInterval(() => {
			notificationCenterStore.fetchUnreadCount();
		}, 30_000);
		return () => clearInterval(timer);
	});

	function toggleDropdown() {
		if (page.url.pathname === '/notifications') return;
		showDropdown = !showDropdown;
		if (showDropdown) {
			const state = $notificationCenterStore;
			if (!state.initialized || (state.notifications.length === 0 && state.unreadCount > 0)) {
				notificationCenterStore.fetchNotifications(true);
			}
		}
	}

	function closeDropdown() {
		showDropdown = false;
	}
</script>

<div class="relative" use:clickOutside={{ callback: closeDropdown }}>
	<button
		class="btn btn-ghost btn-sm hover:bg-base-200 p-2 transition-colors"
		onclick={toggleDropdown}
		aria-label={$t('notifications.aria_labels.notifications')}
		aria-expanded={showDropdown}
		aria-haspopup="true"
	>
		{#if hasUnread}
			<IconBellBadge class="text-primary h-5 w-5" />
		{:else}
			<IconBell class="text-base-content/70 h-5 w-5" />
		{/if}
		{#if hasUnread}
			<span
				class="badge badge-sm badge-primary absolute -top-1 -right-1 h-[18px] min-w-[18px] px-1 text-[10px]"
			>
				{unreadCount > 99 ? '99+' : unreadCount}
			</span>
		{/if}
		<span aria-live="polite" class="sr-only">
			{unreadCount} unread notifications
		</span>
	</button>

	{#if showDropdown}
		<NotificationDropdown onclose={closeDropdown} />
	{/if}
</div>
