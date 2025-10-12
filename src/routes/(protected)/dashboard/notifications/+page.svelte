<script lang="ts">
	import { notificationStore, NOTIFICATION_CATEGORIES } from '$lib/stores/notification.store';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import type { Notification } from '$lib/stores/notification.store';

	let notifications = $state<Notification[]>([]);
	let filteredNotifications = $state<Notification[]>([]);
	let selectedFilter = $state<string>('all');
	let isLoading = $state(false);
	let searchQuery = $state('');

	// Subscribe to notification store
	$effect(() => {
		const store = $notificationStore;
		notifications = store.notifications;
		isLoading = store.isLoading;
		applyFilters();
	});

	// Apply filters when notifications or filter changes
	$effect(() => {
		applyFilters();
	});

	onMount(async () => {
		// Load notifications from backend
		//await notificationService.loadNotifications();
	});

	function applyFilters() {
		let filtered = [...notifications];

		// Apply type filter
		if (selectedFilter !== 'all') {
			filtered = filtered.filter(n => n.type === selectedFilter);
		}

		// Apply search filter
		if (searchQuery.trim()) {
			const query = searchQuery.toLowerCase();
			filtered = filtered.filter(n => 
				n.title.toLowerCase().includes(query) ||
				n.body.toLowerCase().includes(query) ||
				(n.data?.taskTitle && n.data.taskTitle.toLowerCase().includes(query))
			);
		}

		// Sort by creation date (newest first)
		filtered.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

		filteredNotifications = filtered;
	}

	function handleNotificationClick(notification: Notification) {
		// Mark as read
		//notificationService.markAsRead(notification.id);

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
					console.log('Function call:', notification.action.payload);
					break;
			}
		}
	}

	function removeNotification(notificationId: string) {
		//notificationService.removeNotification(notificationId);
	}

	function markAllAsRead() {
		//notificationService.markAllAsRead();
	}

	function clearAllNotifications() {
		//notificationService.clearAll();
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
			case 'urgent': return 'text-red-600 bg-red-50 border-red-200';
			case 'high': return 'text-orange-600 bg-orange-50 border-orange-200';
			case 'normal': return 'text-blue-600 bg-blue-50 border-blue-200';
			case 'low': return 'text-gray-600 bg-gray-50 border-gray-200';
			default: return 'text-gray-600 bg-gray-50 border-gray-200';
		}
	}

	function getTypeIcon(type: Notification['type']): string {
		switch (type) {
			case 'bid_response': return '💰';
			case 'contract_event': return '📋';
			case 'payment': return '💳';
			case 'task_update': return '📝';
			case 'message': return '💬';
			case 'system': return '⚙️';
			case 'security': return '🔒';
			default: return '🔔';
		}
	}

	function getTypeLabel(type: Notification['type']): string {
		switch (type) {
			case 'bid_response': return 'Bid Responses';
			case 'contract_event': return 'Contract Events';
			case 'payment': return 'Payments';
			case 'task_update': return 'Task Updates';
			case 'message': return 'Messages';
			case 'system': return 'System';
			case 'security': return 'Security';
			default: return 'Other';
		}
	}

	const filterOptions = [
		{ value: 'all', label: 'All Notifications' },
		{ value: NOTIFICATION_CATEGORIES.BID_RESPONSE, label: 'Bid Responses' },
		{ value: NOTIFICATION_CATEGORIES.CONTRACT_EVENT, label: 'Contract Events' },
		{ value: NOTIFICATION_CATEGORIES.PAYMENT, label: 'Payments' },
		{ value: NOTIFICATION_CATEGORIES.TASK_UPDATE, label: 'Task Updates' },
		{ value: NOTIFICATION_CATEGORIES.MESSAGE, label: 'Messages' },
		{ value: NOTIFICATION_CATEGORIES.SYSTEM, label: 'System' },
		{ value: NOTIFICATION_CATEGORIES.SECURITY, label: 'Security' }
	];
</script>

<svelte:head>
	<title>Notifications - BitTasker</title>
</svelte:head>

<div class="min-h-screen bg-gray-50">
	<div class="max-w-4xl mx-auto px-4 py-8">
		<!-- Header -->
		<div class="mb-8">
			<div class="flex items-center justify-between">
				<div>
					<h1 class="text-3xl font-bold text-gray-900">Notifications</h1>
					<p class="mt-2 text-gray-600">
						Stay updated with your tasks, bids, and payments
					</p>
				</div>
				
				<div class="flex items-center space-x-3">
					{#if notifications.length > 0}
						<button
							onclick={markAllAsRead}
							class="px-4 py-2 text-sm font-medium text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg transition-colors"
						>
							Mark all as read
						</button>
						<button
							onclick={clearAllNotifications}
							class="px-4 py-2 text-sm font-medium text-red-600 hover:text-red-800 hover:bg-red-50 rounded-lg transition-colors"
						>
							Clear all
						</button>
					{/if}
				</div>
			</div>
		</div>

		<!-- Filters and Search -->
		<div class="mb-6 bg-white rounded-lg shadow-sm border border-gray-200 p-4">
			<div class="flex flex-col sm:flex-row gap-4">
				<!-- Search -->
				<div class="flex-1">
					<div class="relative">
						<input
							bind:value={searchQuery}
							type="text"
							placeholder="Search notifications..."
							class="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
						>
						<div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
							<svg class="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
							</svg>
						</div>
					</div>
				</div>

				<!-- Filter Dropdown -->
				<div class="sm:w-48">
					<select
						bind:value={selectedFilter}
						class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
					>
						{#each filterOptions as option}
							<option value={option.value}>{option.label}</option>
						{/each}
					</select>
				</div>
			</div>
		</div>

		<!-- Notifications List -->
		<div class="bg-white rounded-lg shadow-sm border border-gray-200">
			{#if isLoading}
				<div class="p-8 text-center">
					<div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
					<p class="mt-4 text-gray-500">Loading notifications...</p>
				</div>
			{:else if filteredNotifications.length === 0}
				<div class="p-12 text-center">
					<svg class="w-16 h-16 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-5 5-5-5h5v-5a7.5 7.5 0 1 0-15 0v5h5l-5 5-5-5h5v-5a7.5 7.5 0 1 0 15 0v5z" />
					</svg>
					<h3 class="text-lg font-medium text-gray-900 mb-2">
						{searchQuery || selectedFilter !== 'all' ? 'No matching notifications' : 'No notifications'}
					</h3>
					<p class="text-gray-500">
						{searchQuery || selectedFilter !== 'all' 
							? 'Try adjusting your search or filter criteria.' 
							: 'You\'re all caught up! New notifications will appear here.'}
					</p>
				</div>
			{:else}
				{#each filteredNotifications as notification (notification.id)}
					<div
						class="p-4 border-b border-gray-100 hover:bg-gray-50 transition-colors {notification.read ? 'opacity-75' : 'bg-blue-50'} relative"
					>
						<div class="flex items-start space-x-4">
							<!-- Icon -->
							<div class="flex-shrink-0">
								<span class="text-2xl">{getTypeIcon(notification.type)}</span>
							</div>

							<!-- Content -->
							<div class="flex-1 min-w-0">
								<div class="flex items-center justify-between mb-2">
									<h3 class="text-lg font-medium text-gray-900">
										{notification.title}
									</h3>
									<div class="flex items-center space-x-2">
										<!-- Priority Badge -->
										<span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium {getPriorityColor(notification.priority)}">
											{notification.priority}
										</span>
										<!-- Time -->
										<span class="text-sm text-gray-500">
											{formatTimeAgo(notification.createdAt)}
										</span>
									</div>
								</div>

								<p class="text-gray-600 mb-3">
									{notification.body}
								</p>

								<!-- Additional Data -->
								{#if notification.data && Object.keys(notification.data).length > 0}
									<div class="flex flex-wrap gap-2">
										{#if notification.data.taskTitle}
											<span class="inline-block bg-gray-100 text-gray-800 text-sm px-3 py-1 rounded-full">
												📝 {notification.data.taskTitle}
											</span>
										{/if}
										{#if notification.data.amount}
											<span class="inline-block bg-green-100 text-green-800 text-sm px-3 py-1 rounded-full">
												💰 {notification.data.amount} {notification.data.currency || 'USD'}
											</span>
										{/if}
										{#if notification.data.bidderName}
											<span class="inline-block bg-blue-100 text-blue-800 text-sm px-3 py-1 rounded-full">
												👤 {notification.data.bidderName}
											</span>
										{/if}
										{#if notification.data.participantName}
											<span class="inline-block bg-purple-100 text-purple-800 text-sm px-3 py-1 rounded-full">
												👤 {notification.data.participantName}
											</span>
										{/if}
									</div>
								{/if}
							</div>

							<!-- Action Buttons -->
							<div class="flex-shrink-0 flex items-center space-x-2">
								<!-- View Button -->
								<button
									onclick={() => handleNotificationClick(notification)}
									class="text-blue-600 hover:text-blue-800 p-2"
									aria-label="View notification"
								>
									<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
									</svg>
								</button>
								<!-- Remove Button -->
								<button
									onclick={() => removeNotification(notification.id)}
									class="text-gray-400 hover:text-gray-600 p-2"
									aria-label="Remove notification"
								>
									<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
									</svg>
								</button>
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

		<!-- Stats -->
		{#if notifications.length > 0}
			<div class="mt-6 text-center text-sm text-gray-500">
				Showing {filteredNotifications.length} of {notifications.length} notifications
			</div>
		{/if}
	</div>
</div>
