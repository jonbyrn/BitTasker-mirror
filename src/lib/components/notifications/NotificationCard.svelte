<script lang="ts">
	import type { NotificationCenterItem } from '$lib/types/notification';
	import { notificationCenterStore } from '$lib/stores/notificationCenter.store';
	import { timeAgo } from '$lib/utils/timeAgo';
	import { goto } from '$app/navigation';
	import { t } from 'svelte-i18n';
	import IconDelete from '~icons/mdi/delete-outline';
	import IconHandshake from '~icons/mdi/handshake';
	import IconGavel from '~icons/mdi/gavel';
	import IconChatOutline from '~icons/mdi/chat-outline';
	import IconStarOutline from '~icons/mdi/star-outline';
	import IconBitcoin from '~icons/mdi/bitcoin';
	import IconClipboardCheck from '~icons/mdi/clipboard-check';
	import IconShieldAlert from '~icons/mdi/shield-alert';
	import IconCog from '~icons/mdi/cog';
	import IconBell from '~icons/mdi/bell';
	import IconBriefcase from '~icons/mdi/briefcase';
	import IconMagnify from '~icons/mdi/magnify';
	import IconAccount from '~icons/mdi/account-circle';
	import IconClipboardText from '~icons/mdi/clipboard-text-outline';
	import IconPlusCircle from '~icons/mdi/plus-circle-outline';
	import IconStore from '~icons/mdi/store-outline';
	import IconWallet from '~icons/mdi/wallet-outline';
	import IconBellRing from '~icons/mdi/bell-ring-outline';
	import IconAlertCircle from '~icons/mdi/alert-circle-outline';
	import IconStar from '~icons/mdi/star';
	import IconCash from '~icons/mdi/cash';

	// Category → icon mapping, inlined to avoid a separate utility file
	// that would need its own type declarations for ~icons imports.
	const CATEGORY_ICONS: Record<string, typeof IconBell> = {
		contract: IconHandshake,
		bid: IconGavel,
		message: IconChatOutline,
		payment: IconBitcoin,
		task: IconClipboardCheck,
		review: IconStarOutline,
		security: IconShieldAlert,
		system: IconCog,
		wallet: IconBitcoin,
		service: IconBriefcase,
		discovery: IconMagnify,
		reengagement: IconBell,
		account: IconAccount,
		uncompleted_tasks: IconClipboardText,
		post_first_task: IconPlusCircle,
		place_first_bid: IconGavel,
		list_your_service: IconStore,
		fund_your_wallet: IconWallet,
		inactive_with_pending_bids: IconBellRing,
		inactive_with_active_contract: IconBellRing,
		new_task_broadcast: IconClipboardCheck,
		new_service_broadcast: IconBriefcase,
		new_service_match: IconMagnify,
		proposal_withdrawn: IconBriefcase,
		proposal_updated: IconBriefcase,
		service_expiring_soon: IconAlertCircle,
		service_expired: IconAlertCircle,
		service_review_received: IconStar,
		service_price_changed: IconCash,
		new_bid_on_task: IconGavel,
		bid_accepted: IconGavel,
		bid_rejected: IconGavel,
		escrow_connected: IconHandshake,
		escrow_funded: IconBitcoin,
		escrow_locked: IconHandshake,
		deliverable_submitted: IconClipboardCheck,
		approved: IconClipboardCheck,
		payment_requested: IconCash,
		paid: IconBitcoin,
		new_message: IconChatOutline,
		review_received: IconStarOutline,
		service_ordered: IconBriefcase
	};

	const CATEGORY_COLORS: Record<string, string> = {
		contract: 'text-primary',
		bid: 'text-secondary',
		message: 'text-info',
		payment: 'text-warning',
		task: 'text-success',
		review: 'text-accent',
		security: 'text-error',
		system: 'text-base-content/60',
		wallet: 'text-warning',
		service: 'text-info',
		discovery: 'text-success',
		reengagement: 'text-base-content/60',
		account: 'text-error',
		uncompleted_tasks: 'text-success',
		post_first_task: 'text-warning',
		place_first_bid: 'text-secondary',
		list_your_service: 'text-info',
		fund_your_wallet: 'text-warning',
		inactive_with_pending_bids: 'text-info',
		inactive_with_active_contract: 'text-info',
		new_task_broadcast: 'text-success',
		new_service_broadcast: 'text-info',
		new_service_match: 'text-success',
		proposal_withdrawn: 'text-warning',
		proposal_updated: 'text-info',
		service_expiring_soon: 'text-warning',
		service_expired: 'text-error',
		service_review_received: 'text-accent',
		service_price_changed: 'text-warning',
		new_bid_on_task: 'text-secondary',
		bid_accepted: 'text-secondary',
		bid_rejected: 'text-secondary',
		escrow_connected: 'text-primary',
		escrow_funded: 'text-warning',
		escrow_locked: 'text-primary',
		deliverable_submitted: 'text-success',
		approved: 'text-success',
		payment_requested: 'text-warning',
		paid: 'text-warning',
		new_message: 'text-info',
		review_received: 'text-accent',
		service_ordered: 'text-info'
	};

	let {
		notification,
		compact = false,
		onclose
	}: {
		notification: NotificationCenterItem;
		compact?: boolean;
		onclose?: () => void;
	} = $props();

	let CategoryIcon = $derived(CATEGORY_ICONS[notification.type] ?? IconBell);
	let iconColor = $derived(CATEGORY_COLORS[notification.type] ?? 'text-base-content/60');
	let isUnread = $derived(!notification.isRead);
	let displayTime = $derived(timeAgo(notification.createdAt));

	let priorityBorder = $derived.by(() => {
		switch (notification.priority) {
			case 'URGENT':
				return 'border-l-4 border-l-error';
			case 'HIGH':
				return 'border-l-4 border-l-warning';
			default:
				return '';
		}
	});

	$effect(() => {
		const interval = setInterval(() => {
			displayTime = timeAgo(notification.createdAt);
		}, 60_000);
		return () => clearInterval(interval);
	});

	async function handleClick() {
		if (isUnread) {
			await notificationCenterStore.markRead(notification.id);
		}

		const deepLink = notification.data?.deepLink as string | undefined;
		if (deepLink && deepLink.startsWith('/') && !deepLink.startsWith('//')) {
			onclose?.();
			await goto(deepLink);
		}
	}

	async function handleDelete(event: MouseEvent) {
		event.stopPropagation();
		await notificationCenterStore.deleteNotification(notification.id);
	}
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
	class="group hover:bg-base-200/50 flex w-full cursor-pointer items-start gap-3 px-4 text-left
		transition-colors {isUnread ? 'bg-base-200/30' : ''}
		{priorityBorder} {compact ? 'py-2' : 'py-3'}"
	onclick={handleClick}
	onkeydown={(e) => {
		if (e.key === 'Enter' || e.key === ' ') handleClick();
	}}
	role="listitem"
	aria-label={notification.title}
	tabindex={0}
>
	<div class="mt-0.5 shrink-0 {iconColor}">
		<CategoryIcon class="h-5 w-5" />
	</div>

	<div class="min-w-0 flex-1">
		<div class="flex items-start justify-between gap-2">
			<p class="text-sm {isUnread ? 'font-semibold' : 'font-medium'} truncate">
				{notification.title}
			</p>
			<div class="flex shrink-0 items-center gap-2">
				<span class="text-base-content/50 text-xs whitespace-nowrap">
					{displayTime}
				</span>
				{#if isUnread}
					<span
						class="bg-primary h-2 w-2 shrink-0 rounded-full"
						aria-label={$t('notifications.unread')}
					></span>
				{/if}
			</div>
		</div>
		<p class="text-base-content/60 mt-0.5 text-xs {compact ? 'line-clamp-1' : 'line-clamp-2'}">
			{notification.body}
		</p>
	</div>

	<button
		class="btn btn-ghost btn-xs shrink-0 self-center opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100"
		onclick={handleDelete}
		aria-label={$t('notifications.notifications_actions.remove')}
		tabindex={0}
	>
		<IconDelete class="text-base-content/40 h-3.5 w-3.5" />
	</button>
</div>
