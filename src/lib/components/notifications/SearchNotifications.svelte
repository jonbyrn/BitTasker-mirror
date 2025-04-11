<!-- 
  SearchNotifications.svelte
  Component that displays notifications from saved searches
-->
<script lang="ts">
	import type { SavedSearch, SavedSearchNotification } from '$lib/types/saved-search';
	import savedSearchesService from '$lib/api/services/saved-searches.service';

	// Props
	const { savedSearchId, onTaskClick } = $props<{
		savedSearchId: string;
		onTaskClick: (taskId: string) => void;
	}>();

	// State
	let notifications = $state<SavedSearchNotification[]>([]);
	let savedSearch = $state<SavedSearch | null>(null);
	let isLoading = $state(true);
	let error = $state<string | null>(null);

	// Load notifications
	loadNotifications();

	async function loadNotifications() {
		try {
			isLoading = true;
			error = null;

			// Load the saved search and its notifications
			const [searchResult, notificationsResult] = await Promise.all([
				savedSearchesService.getSavedSearchById(savedSearchId),
				savedSearchesService.getNotifications(savedSearchId)
			]);

			savedSearch = searchResult;
			notifications = notificationsResult;
		} catch (err) {
			console.error('Error loading notifications:', err);
			error = 'Failed to load notifications. Please try again.';
		} finally {
			isLoading = false;
		}
	}

	// Format date for display
	function formatDate(dateString: string): string {
		const date = new Date(dateString);

		// If today, show time only
		const today = new Date();
		if (date.toDateString() === today.toDateString()) {
			return date.toLocaleTimeString('en-US', {
				hour: '2-digit',
				minute: '2-digit'
			});
		}

		// If this year, show month and day
		if (date.getFullYear() === today.getFullYear()) {
			return date.toLocaleDateString('en-US', {
				month: 'short',
				day: 'numeric'
			});
		}

		// Otherwise show full date
		return date.toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		});
	}

	// Mark all as read
	async function markAllAsRead() {
		try {
			await savedSearchesService.markNotificationsAsRead(savedSearchId);

			// Update local state
			notifications = notifications.map((notification) => ({
				...notification,
				isRead: true
			}));

			if (savedSearch) {
				savedSearch.unreadNotifications = 0;
			}
		} catch (err) {
			console.error('Error marking notifications as read:', err);
			error = 'Failed to mark notifications as read.';
		}
	}

	// Handle task click
	function handleTaskClick(notificationId: string, taskId: string) {
		// Mark the notification as read when task is clicked
		const notification = notifications.find((n) => n.id === notificationId);
		if (notification && !notification.isRead) {
			notification.isRead = true;

			// Decrease unread count if applicable
			if (savedSearch && savedSearch.unreadNotifications > 0) {
				savedSearch.unreadNotifications -= 1;
			}

			// Update on the server
			savedSearchesService
				.markNotificationsAsRead(savedSearchId, [notificationId])
				.catch((err) => console.error('Error marking notification as read:', err));
		}

		// Call the parent handler
		onTaskClick(taskId);
	}
</script>

<div>
	{#if error}
		<div class="alert alert-error mb-4">
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="h-6 w-6 shrink-0"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
				/>
			</svg>
			<span>{error}</span>
			<button class="btn btn-sm" onclick={loadNotifications}>Try Again</button>
		</div>
	{/if}

	{#if isLoading}
		<div class="flex justify-center p-6">
			<div class="loading loading-spinner loading-lg"></div>
		</div>
	{:else if savedSearch}
		<div class="mb-4 flex items-center justify-between">
			<h2 class="text-xl font-bold">
				Notifications: {savedSearch.name}
			</h2>

			{#if notifications.some((n) => !n.isRead)}
				<button class="btn btn-sm btn-ghost" onclick={markAllAsRead}> Mark All as Read </button>
			{/if}
		</div>

		{#if notifications.length === 0}
			<div class="py-8 text-center">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="text-primary mx-auto mb-3 h-12 w-12"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
					/>
				</svg>
				<p class="mb-1 text-lg font-medium">No new notifications</p>
				<p class="text-gray-500">
					You will be notified when new tasks matching your saved search criteria are posted.
				</p>
			</div>
		{:else}
			<div class="divide-y">
				{#each notifications as notification}
					<div
						role="button"
						tabindex="0"
						class="hover:bg-base-200 cursor-pointer rounded px-2 py-3 transition-colors"
						class:bg-base-200={!notification.isRead}
						onclick={() => handleTaskClick(notification.id, notification.taskId)}
						onkeydown={(e) => {
							if (e.key === 'Enter') {
								handleTaskClick(notification.id, notification.taskId);
							}
						}}
					>
						<div class="flex items-start justify-between">
							<div class="flex items-center gap-3">
								{#if !notification.isRead}
									<div class="badge badge-primary badge-xs"></div>
								{/if}
								<div>
									<h3 class="font-medium">
										{notification.task.title}
									</h3>
									<div class="mt-1 flex gap-3 text-sm">
										<span>{notification.task.taskType}</span>
										<span>{notification.task.budget} {notification.task.budgetType}</span>
									</div>
								</div>
							</div>

							<div class="text-xs text-gray-500">
								{formatDate(notification.createdAt)}
							</div>
						</div>
					</div>
				{/each}
			</div>
		{/if}
	{/if}
</div>
