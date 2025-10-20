<script lang="ts">
	import { notificationStore, unreadNotifications, hasUnreadNotifications, incomingNotificationsCount, initializeNotificationService } from '$lib/stores/notification.store';
	import { localNotificationService } from '$lib/services/local-notification.service';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { t } from 'svelte-i18n';
	import type { Notification } from '$lib/stores/notification.store';
	
	// MDI Icons
	import IconBell from '~icons/mdi/bell';
	import IconBellOutline from '~icons/mdi/bell-outline';
	import IconClose from '~icons/mdi/close';
	import IconDelete from '~icons/mdi/delete';
	import IconBellAlert from '~icons/mdi/bell-alert';
	import IconCurrencyUsd from '~icons/mdi/currency-usd';
	import IconFileDocumentOutline from '~icons/mdi/file-document-outline';
	import IconCreditCard from '~icons/mdi/credit-card';
	import IconPencil from '~icons/mdi/pencil';
	import IconChat from '~icons/mdi/chat';
	import IconCog from '~icons/mdi/cog';
	import IconShield from '~icons/mdi/shield';
	import IconLoading from '~icons/mdi/loading';

	let isOpen = $state(false);
	let notifications = $state<Notification[]>([]);
	let unreadCount = $state(0);
	let incomingCount = $state(0);
	let isLoading = $state(false);

	// Subscribe to notification store
	$effect(() => {
		const store = $notificationStore;
		notifications = store.notifications;
		unreadCount = store.unreadCount;
		incomingCount = store.incomingCount;
		isLoading = store.isLoading;
	});

	onMount(async () => {
		// Initialize notification service
		await initializeNotificationService();
	});

	function toggleNotificationCenter() {
		isOpen = !isOpen;
		if (isOpen) {
			// Mark all notifications as read when opening
			localNotificationService.markAllAsRead();
			// Reset incoming count when opening
			localNotificationService.resetIncomingCount();
		}
	}

	function handleNotificationClick(notification: Notification) {
		// Mark as read
		localNotificationService.markAsRead(notification.id);

		// Handle action
		if (notification.action) {
			switch (notification.action.type) {
				case 'navigation':
					goto(notification.action.payload);
					break;
				case 'external_link':
					window.open(notification.action.payload, '_blank');
					break;
				case 'function_call':
					// Handle function call if needed
					console.log('Function call:', notification.action.payload);
					break;
			}
		}

		// Close notification center
		isOpen = false;
	}

	function removeNotification(notificationId: string, event?: Event) {
		if (event) {
			event.stopPropagation();
		}
		localNotificationService.removeNotification(notificationId);
	}

	function clearAllNotifications() {
		// Actually clear all notifications
		localNotificationService.clearAll();
	}

	function formatTimeAgo(timestamp: Date): string {
		const now = new Date();
		const diff = now.getTime() - timestamp.getTime();
		const seconds = Math.floor(diff / 1000);
		const minutes = Math.floor(seconds / 60);
		const hours = Math.floor(minutes / 60);
		const days = Math.floor(hours / 24);
		const weeks = Math.floor(days / 7);
		const months = Math.floor(days / 30);
		const years = Math.floor(days / 365);

		if (years > 0) return $t('notifications.years_ago', { values: { count: years } });
		if (months > 0) return $t('notifications.months_ago', { values: { count: months } });
		if (weeks > 0) return $t('notifications.weeks_ago', { values: { count: weeks } });
		if (days > 0) return $t('notifications.days_ago', { values: { count: days } });
		if (hours > 0) return $t('notifications.hours_ago', { values: { count: hours } });
		if (minutes > 0) return $t('notifications.minutes_ago', { values: { count: minutes } });
		return $t('notifications.just_now');
	}


	function getTitleSize(notification: Notification): string {
		switch (notification.type) {
			case 'bid_response':
				return 'text-xs sm:text-sm font-medium'; // Smaller for bid notifications, responsive
			case 'payment':
				return 'text-xs sm:text-sm font-medium'; // Smaller for payment notifications, responsive
			case 'message':
				return 'text-sm font-medium'; // Normal size for messages
			case 'task_update':
				return 'text-sm font-medium'; // Normal size for task updates
			case 'contract_event':
				return 'text-sm font-medium'; // Normal size for contracts
			case 'system':
				return 'text-xs sm:text-sm font-medium'; // Smaller for system notifications, responsive
			case 'security':
				return 'text-sm font-semibold'; // Slightly larger for security
			default:
				return 'text-sm font-medium'; // Default size
		}
	}

	function getTranslatedTitle(notification: Notification): string {
		// If notification is already translated, return as-is
		if (notification.data?.isTranslated) {
			return notification.title;
		}
		
		// Check if notification has translation keys
		if (notification.data?.titleKey) {
			return $t(notification.data.titleKey);
		}
		
		// Fallback to direct translation of the title
		return $t(notification.title) || notification.title;
	}

	function getTranslatedBody(notification: Notification): string {
		// If notification is already translated, return as-is
		if (notification.data?.isTranslated) {
			return notification.body;
		}
		
		// Check if notification has translation keys
		if (notification.data?.bodyKey) {
			const translation = $t(notification.data.bodyKey as any);
			// Replace {senderName} placeholder with actual sender name
			return translation.replace('{senderName}', notification.data.senderName || 'Usuario');
		}
		
		// Fallback to direct translation of the body
		const translation = $t(notification.body as any) || notification.body;
		// Replace {senderName} placeholder with actual sender name
		return translation.replace('{senderName}', notification.data?.senderName || 'Usuario');
	}

</script>

<div class="relative">
	<!-- Notification Bell Button -->
	<button
		onclick={toggleNotificationCenter}
		class="relative btn btn-ghost btn-sm p-2 hover:bg-base-200 transition-colors"
		aria-label="Notifications"
	>
		{#if unreadCount > 0 || incomingCount > 0}
			<IconBellAlert class="w-5 h-5 text-primary" />
		{:else}
			<IconBellOutline class="w-5 h-5 text-base-content/70" />
		{/if}
		
		<!-- Unread Badge -->
		{#if unreadCount > 0 || incomingCount > 0}
			<span class="absolute -top-1 -right-1 bg-error text-error-content text-xs rounded-full h-5 w-5 flex items-center justify-center font-bold shadow-sm">
				{unreadCount + incomingCount > 99 ? '99+' : unreadCount + incomingCount}
			</span>
		{/if}
	</button>

	<!-- Notification Dropdown -->
	{#if isOpen}
		<div class="absolute right-2 sm:right-0 mt-2 w-80 sm:w-96 bg-base-100 rounded-lg shadow-lg border border-base-300 z-50 max-h-96 overflow-hidden">
			<!-- Header -->
			<div class="px-3 sm:px-4 py-3 border-b border-base-300 flex items-center justify-between">
				<div class="flex items-center space-x-2">
					{#if incomingCount > 0}
						<span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-primary text-primary-content">
							{incomingCount} {$t('notifications.new')}
						</span>
					{/if}
				</div>
				<div class="flex items-center space-x-1 sm:space-x-2">
					{#if notifications.length > 0}
						<button
							onclick={clearAllNotifications}
							class="text-xs sm:text-sm text-base-content/60 hover:text-base-content/80"
						>
							{$t('notifications.clear_all')}
						</button>
					{/if}
					<button
						onclick={() => isOpen = false}
						class="text-base-content/40 hover:text-base-content/60 p-1"
						aria-label="Close notifications"
					>
						<IconClose class="w-4 h-4 sm:w-5 sm:h-5" />
					</button>
				</div>
			</div>

			<!-- Notifications List -->
			<div class="max-h-80 overflow-y-auto">
				{#if isLoading}
					<div class="p-4 text-center text-base-content/60">
						<IconLoading class="w-6 h-6 animate-spin text-primary mx-auto" />
						<p class="mt-2">{$t('notifications.loading')}</p>
					</div>
				{:else if notifications.length === 0}
					<div class="p-8 text-center text-base-content/60">
						<IconBellOutline class="w-12 h-12 mx-auto mb-4 text-base-content/30" />
						<p class="text-lg font-medium">{$t('notifications.no_notifications')}</p>
						<p class="text-sm">{$t('notifications.no_notifications_message')}</p>
					</div>
				{:else}
					{#each notifications as notification (notification.id)}
						<div
							onclick={() => handleNotificationClick(notification)}
							onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleNotificationClick(notification); } }}
							role="button"
							tabindex="0"
							class="px-3 sm:px-4 py-3 border-b border-base-300 hover:bg-base-200 transition-colors cursor-pointer {notification.read ? 'opacity-75' : 'bg-primary/5'} relative"
						>
							<div class="flex items-start space-x-2 sm:space-x-3">
								<!-- Icon -->
								<div class="flex-shrink-0">
									{#if notification.type === 'bid_response'}
										<IconCurrencyUsd class="w-5 h-5 text-primary" />
									{:else if notification.type === 'contract_event'}
										<IconFileDocumentOutline class="w-5 h-5 text-primary" />
									{:else if notification.type === 'payment'}
										<IconCreditCard class="w-5 h-5 text-primary" />
									{:else if notification.type === 'task_update'}
										<IconPencil class="w-5 h-5 text-primary" />
									{:else if notification.type === 'message'}
										<IconChat class="w-5 h-5 text-primary" />
									{:else if notification.type === 'system'}
										<IconCog class="w-5 h-5 text-primary" />
									{:else if notification.type === 'security'}
										<IconShield class="w-5 h-5 text-primary" />
									{:else}
										<IconBell class="w-5 h-5 text-primary" />
									{/if}
								</div>

								<!-- Content -->
								<div class="flex-1 min-w-0">
									<div class="flex items-start justify-between">
										<div class="flex-1 min-w-0">
											<h4 class="{getTitleSize(notification)} text-base-content truncate">
												{getTranslatedTitle(notification)}
											</h4>
											<p class="mt-1 text-sm text-base-content/80 line-clamp-2">
												{getTranslatedBody(notification)}
											</p>
										</div>
										<!-- Time and Remove Button -->
										<div class="flex items-center space-x-1 ml-2">
											<span class="text-xs text-base-content/60 whitespace-nowrap">
												{formatTimeAgo(notification.createdAt)}
											</span>
											<button
												onclick={(e) => removeNotification(notification.id, e)}
												class="text-base-content/40 hover:text-base-content/60 p-1 flex-shrink-0"
												aria-label="Remove notification"
											>
												<IconDelete class="w-4 h-4" />
											</button>
										</div>
									</div>
									
									<!-- Additional Data -->
									{#if notification.data && Object.keys(notification.data).length > 0}
										<div class="mt-2 text-xs text-base-content/60">
											{#if notification.data.taskTitle}
												<span class="inline-block bg-base-200 px-2 py-1 rounded text-xs">
													{notification.data.taskTitle}
												</span>
											{/if}
											{#if notification.data.amount}
												<div class="flex gap-1 mt-1">
													{#if notification.data.bitcoinAmount}
														<span class="inline-block bg-primary/20 text-primary px-2 py-1 rounded text-xs">
															{notification.data.bitcoinAmount} sats
														</span>
													{/if}
													<span class="inline-block bg-success/20 text-success px-2 py-1 rounded text-xs">
														{notification.data.amount} {notification.data.currency || 'USD'}
													</span>
												</div>
											{/if}
										</div>
									{/if}
								</div>
							</div>

							<!-- Unread Indicator -->
							{#if !notification.read}
								<div class="absolute left-0 top-0 bottom-0 w-1 bg-blue-500 rounded-r"></div>
							{/if}
						</div>
					{/each}
				{/if}
			</div>

			<!-- Footer -->
			{#if notifications.length > 0}
				<div class="px-3 sm:px-4 py-3 border-t border-base-300 bg-base-200">
					<button
						onclick={() => goto('/dashboard/notifications')}
						class="w-full text-center text-xs sm:text-sm text-primary hover:text-primary-focus font-medium"
					>
						{$t('notifications.view_all')}
					</button>
				</div>
			{/if}
		</div>
	{/if}
</div>

<style>
	.line-clamp-2 {
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
</style>
