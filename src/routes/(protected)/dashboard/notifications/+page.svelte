<script lang="ts">
	import { notificationStore, NOTIFICATION_CATEGORIES, initializeNotificationService } from '$lib/stores/notification.store';
	import { localNotificationService } from '$lib/services/local-notification.service';
	import { goto } from '$app/navigation';
	import { onMount, onDestroy } from 'svelte';
	import { t } from 'svelte-i18n';
	import type { Notification } from '$lib/stores/notification.store';
	
	// MDI Icons
	import IconBell from '~icons/mdi/bell';
	import IconCurrencyUsd from '~icons/mdi/currency-usd';
	import IconFileDocumentOutline from '~icons/mdi/file-document-outline';
	import IconCreditCard from '~icons/mdi/credit-card';
	import IconPencil from '~icons/mdi/pencil';
	import IconChat from '~icons/mdi/chat';
	import IconCog from '~icons/mdi/cog';
	import IconShield from '~icons/mdi/shield';

	let notifications = $state<Notification[]>([]);
	let filteredNotifications = $state<Notification[]>([]);
	let selectedFilter = $state<string>('all');
	let isLoading = $state(false);
	let searchQuery = $state('');

	// Function to apply filters
	function applyFilters() {
		let filtered = [...notifications];

		// Apply type filter
		if (selectedFilter !== 'all') {
			filtered = filtered.filter((n) => n.type === selectedFilter);
		}

		// Apply search filter
		if (searchQuery.trim()) {
			const query = searchQuery.toLowerCase();
			filtered = filtered.filter(
				(n) =>
					n.title.toLowerCase().includes(query) ||
					n.body.toLowerCase().includes(query) ||
					(n.data?.taskTitle && n.data.taskTitle.toLowerCase().includes(query))
			);
		}

		// Sort by creation date (newest first)
		filtered.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

		filteredNotifications = filtered;
	}

	let unsubscribe: (() => void) | null = null;

	onMount(async () => {
		// Load notifications from backend
		try {
			await initializeNotificationService();
			
			// Subscribe to notification store manually
			unsubscribe = notificationStore.subscribe((store) => {
				notifications = store.notifications;
				isLoading = store.isLoading;
				applyFilters(); // Apply filters when notifications change
			});
		} catch (error) {
			console.error('❌ Error initializing notification service:', error);
		}
	});

	// Cleanup on destroy
	onDestroy(() => {
		if (unsubscribe) {
			unsubscribe();
		}
	});


	function handleNotificationClick(notification: Notification) {
		// Mark as read
		localNotificationService.markAsRead(notification.id);

		// Handle action with proper navigation
		if (notification.action) {
			switch (notification.action.type) {
				case 'navigation':
					// Use goto for internal navigation
					goto(notification.action.payload);
					break;
				case 'external_link':
					window.open(notification.action.payload, '_blank');
					break;
				case 'function_call':
					// Handle function call if needed
					break;
			}
		}
	}

	function removeNotification(notificationId: string) {
		localNotificationService.removeNotification(notificationId);
	}

	function markAllAsRead() {
		localNotificationService.markAllAsRead();
	}

	function clearAllNotifications() {
		localNotificationService.clearAll();
	}

	function handleSearchChange() {
		applyFilters();
	}

	function handleFilterChange() {
		applyFilters();
	}

	function formatTimeAgo(timestamp: Date): string {
		const now = new Date();
		const diff = now.getTime() - timestamp.getTime();
		const seconds = Math.floor(diff / 1000);
		const minutes = Math.floor(seconds / 60);
		const hours = Math.floor(minutes / 60);
		const days = Math.floor(hours / 24);

		if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
		if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
		if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
		return 'Just now';
	}

	function getPriorityColor(priority: Notification['priority']): string {
		switch (priority) {
			case 'urgent':
				return 'text-red-600 bg-red-50 border-red-200';
			case 'high':
				return 'text-orange-600 bg-orange-50 border-orange-200';
			case 'normal':
				return 'text-blue-600 bg-blue-50 border-blue-200';
			case 'low':
				return 'text-gray-600 border-gray-200';
			default:
				return 'text-gray-600 border-gray-200';
		}
	}

	function getTypeIcon(type: Notification['type']): string {
		switch (type) {
			case 'bid_response':
				return 'bid';
			case 'contract_event':
				return 'contract';
			case 'payment':
				return 'payment';
			case 'task_update':
				return 'task';
			case 'message':
				return 'message';
			case 'system':
				return 'system';
			case 'security':
				return 'security';
			default:
				return 'notification';
		}
	}

	function getTypeLabel(type: Notification['type']): string {
		switch (type) {
			case 'bid_response':
				return $t('notifications.types.bid_response');
			case 'contract_event':
				return $t('notifications.types.contract_event');
			case 'payment':
				return $t('notifications.types.payment');
			case 'task_update':
				return $t('notifications.types.task_update');
			case 'message':
				return $t('notifications.types.message');
			case 'system':
				return $t('notifications.types.system');
			case 'security':
				return $t('notifications.types.security');
			default:
				return $t('notifications.types.other');
		}
	}


	const filterOptions = [
		{ value: 'all', label: $t('notifications.filters.all') },
		{ value: NOTIFICATION_CATEGORIES.BID_RESPONSE, label: $t('notifications.types.bid_response') },
		{ value: NOTIFICATION_CATEGORIES.CONTRACT_EVENT, label: $t('notifications.types.contract_event') },
		{ value: NOTIFICATION_CATEGORIES.PAYMENT, label: $t('notifications.types.payment') },
		{ value: NOTIFICATION_CATEGORIES.TASK_UPDATE, label: $t('notifications.types.task_update') },
		{ value: NOTIFICATION_CATEGORIES.MESSAGE, label: $t('notifications.types.message') },
		{ value: NOTIFICATION_CATEGORIES.SYSTEM, label: $t('notifications.types.system') },
		{ value: NOTIFICATION_CATEGORIES.SECURITY, label: $t('notifications.types.security') }
	];
</script>

<svelte:head>
	<title>{$t('notifications.page_title')} - BitTasker</title>
</svelte:head>

<div class="min-h-screen bg-base-100">
	<div class="container mx-auto px-4 py-6">
		<!-- Header -->
		<div class="mb-6">
			<div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
				<div>
					<span class="text-2xl font-bold text-base-content">{$t('notifications.title')}</span>
					<p class="mt-1 text-base-content/70">{$t('notifications.subtitle')}</p>
				</div>

				<div class="flex items-center gap-2">
					{#if notifications.length > 0}
						<button
							onclick={markAllAsRead}
							class="btn btn-sm btn-primary"
						>
							{$t('notifications.notifications_actions.mark_all_read')}
						</button>
						<button
							onclick={clearAllNotifications}
							class="btn btn-sm btn-error"
						>
							{$t('notifications.notifications_actions.clear_all')}
						</button>
					{/if}
				</div>
			</div>
		</div>

		<!-- Filters and Search -->
		<div class="mb-6">
			<div class="flex flex-col gap-4 sm:flex-row">
				<!-- Search -->
				<div class="flex-1">
					<div class="form-control">
						<div class="relative">
							<input
								bind:value={searchQuery}
								oninput={handleSearchChange}
								type="text"
								placeholder={$t('notifications.search_placeholder')}
								class="input input-bordered w-full pl-10"
							/>
							<div class="absolute inset-y-0 left-0 flex items-center pl-3">
								<svg
									class="h-5 w-5 text-base-content/50"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
									/>
								</svg>
							</div>
						</div>
					</div>
				</div>

				<!-- Filter Dropdown -->
				<div class="sm:w-48">
					<div class="form-control">
						<select
							bind:value={selectedFilter}
							onchange={handleFilterChange}
							class="select select-bordered w-full"
						>
							{#each filterOptions as option}
								<option value={option.value}>{option.label}</option>
							{/each}
						</select>
					</div>
				</div>
			</div>
		</div>

		<!-- Notifications List -->
		<div>
			{#if isLoading}
				<div class="flex justify-center items-center py-12">
					<span class="loading loading-spinner loading-lg"></span>
					<span class="ml-3 text-base-content/70">{$t('notifications.loading')}</span>
				</div>
			{:else if filteredNotifications.length === 0}
				<div class="text-center py-12">
					<svg
						class="mx-auto mb-4 h-16 w-16 text-base-content/30"
						fill="none"
						stroke="currentColor"
						viewBox="0 0 24 24"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M15 17h5l-5 5-5-5h5v-5a7.5 7.5 0 1 0-15 0v5h5l-5 5-5-5h5v-5a7.5 7.5 0 1 0 15 0v5z"
						/>
					</svg>
					<span class="text-lg font-medium text-base-content">
						{searchQuery || selectedFilter !== 'all'
							? $t('notifications.no_matching')
							: $t('notifications.no_notifications')}
					</span>
					<p class="mt-2 text-base-content/70">
						{searchQuery || selectedFilter !== 'all'
							? $t('notifications.adjust_search')
							: $t('notifications.all_caught_up')}
					</p>
				</div>
			{:else}
				<div class="space-y-4">
					{#each filteredNotifications as notification (notification.id)}
						<div
							class="card bg-base-100 hover:bg-base-200 transition-colors {notification.read
								? 'opacity-75'
								: 'ring-2 ring-primary/20'} relative"
						>
							<div class="card-body p-4">
								<div class="flex items-start gap-4">
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
									<div class="min-w-0 flex-1">
										<div class="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
											<span class="text-base font-medium text-base-content">
												{notification.title}
											</span>
											<div class="flex items-center gap-2">
												<!-- Priority Badge -->
												<div class="badge badge-outline badge-sm">
													{notification.priority}
												</div>
												<!-- Time -->
												<span class="text-sm text-base-content/70">
													{formatTimeAgo(notification.createdAt)}
												</span>
											</div>
										</div>

										<p class="mb-3 text-base-content/80">
											{notification.body}
										</p>

										<!-- Additional Data -->
										{#if notification.data && Object.keys(notification.data).length > 0}
											<div class="flex flex-wrap gap-2">
												{#if notification.data.taskTitle}
													<div class="badge badge-secondary">
														{notification.data.taskTitle}
													</div>
												{/if}
												{#if notification.data.amount}
													<div class="badge badge-success">
														{notification.data.amount}
														{notification.data.currency || 'USD'}
													</div>
												{/if}
												{#if notification.data.bidderName}
													<div class="badge badge-info">
														{notification.data.bidderName}
													</div>
												{/if}
												{#if notification.data.participantName}
													<div class="badge badge-accent">
														{notification.data.participantName}
													</div>
												{/if}
											</div>
										{/if}
									</div>

									<!-- Action Buttons -->
									<div class="flex flex-shrink-0 items-center gap-2">
										<!-- View Button -->
										<button
											onclick={() => handleNotificationClick(notification)}
											class="btn btn-sm btn-primary btn-circle"
											aria-label={$t('notifications.notifications_actions.view')}
										>
											<svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
												<path
													stroke-linecap="round"
													stroke-linejoin="round"
													stroke-width="2"
													d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
												/>
												<path
													stroke-linecap="round"
													stroke-linejoin="round"
													stroke-width="2"
													d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
												/>
											</svg>
										</button>
										<!-- Remove Button -->
										<button
											onclick={() => removeNotification(notification.id)}
											class="btn btn-sm btn-error btn-circle"
											aria-label={$t('notifications.notifications_actions.remove')}
										>
											<svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
												<path
													stroke-linecap="round"
													stroke-linejoin="round"
													stroke-width="2"
													d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
												/>
											</svg>
										</button>
									</div>
								</div>

							</div>
						</div>
					{/each}
				</div>
			{/if}
		</div>

		<!-- Stats -->
		{#if notifications.length > 0}
			<div class="mt-6 text-center text-sm text-base-content/70">
				{$t('notifications.stats.showing')} {filteredNotifications.length} {$t('notifications.stats.of')} {notifications.length} {$t('notifications.stats.notifications')}
			</div>
		{/if}
	</div>
</div>
