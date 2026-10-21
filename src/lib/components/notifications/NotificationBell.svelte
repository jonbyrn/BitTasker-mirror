<script lang="ts">
	import { onMount } from 'svelte';
	import { notificationCenterStore, sandboxPagesHost } from '$lib/stores/notificationCenter.store';
	import { clickOutside } from '$lib/utils/clickOutside';
	import { page } from '$app/state';
	import { t } from 'svelte-i18n';
	import NotificationDropdown from './NotificationDropdown.svelte';
	import IconBell from '~icons/mdi/bell';

	let showDropdown = $state(false);
	let unreadCount = $derived($notificationCenterStore.unreadCount);
	let shownUnread = $state(0);

	// A relay refresh can dip to zero and bounce back. Keep the badge steady through that dip.
	$effect(() => {
		const next = unreadCount;
		if (next >= shownUnread) {
			shownUnread = next;
			return;
		}
		const timer = setTimeout(() => {
			shownUnread = unreadCount;
		}, 1200);
		return () => clearTimeout(timer);
	});

	let hasUnread = $derived(shownUnread > 0);

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
		<IconBell class="text-base-content/70 h-5 w-5" />
		{#if hasUnread}
			<span
				class="badge badge-sm badge-primary absolute -top-1 -right-1 h-[18px] min-w-[18px] px-1 text-[10px]"
			>
				{shownUnread > 99 ? '99+' : shownUnread}
			</span>
		{/if}
		<span aria-live="polite" class="sr-only">
			{$t('notifications.aria_labels.unread_count', { values: { count: shownUnread } })}
		</span>
	</button>

	{#if showDropdown}
		<NotificationDropdown onclose={closeDropdown} />
	{/if}
</div>
