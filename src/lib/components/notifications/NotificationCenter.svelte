<script lang="ts">
	import { notificationStore, unreadNotifications, hasUnreadNotifications } from '$lib/stores/notification.store';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import type { Notification } from '$lib/stores/notification.store';
	
	// MDI Icons
	import IconBell from '~icons/mdi/bell';
	import IconBellOutline from '~icons/mdi/bell-outline';
	import IconClose from '~icons/mdi/close';
	import IconEye from '~icons/mdi/eye';
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
	let isLoading = $state(false);

	// Subscribe to notification store
	$effect(() => {
		const store = $notificationStore;
		notifications = store.notifications;
		unreadCount = store.unreadCount;
		isLoading = store.isLoading;
	});

	onMount(async () => {
		// Load notifications from backend
		//await notificationService.loadNotifications();
	});

	function toggleNotificationCenter() {
		isOpen = !isOpen;
		if (isOpen) {
			// Mark all notifications as read when opening
			//notificationService.markAllAsRead();
		}
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
		//notificationService.deleteNotification(notificationId);
	}

	function clearAllNotifications() {
		// Mark all as read instead of clearing (backend doesn't support bulk delete)
		//notificationService.markAllAsRead();
	}

	function formatTimeAgo(timestamp: Date): string {
		const now = new Date();
		const diff = now.getTime() - timestamp.getTime();
		const seconds = Math.floor(diff / 1000);
		const minutes = Math.floor(seconds / 60);
		const hours = Math.floor(minutes / 60);
		const days = Math.floor(hours / 24);

		if (days > 0) return `${days}d ago`;
		if (hours > 0) return `${hours}h ago`;
		if (minutes > 0) return `${minutes}m ago`;
		return 'Just now';
	}

	function getPriorityColor(priority: Notification['priority']): string {
		switch (priority) {
			case 'urgent': return 'text-error bg-error/10 border-error/20';
			case 'high': return 'text-primary bg-primary/10 border-primary/20';
			case 'normal': return 'text-info bg-info/10 border-info/20';
			case 'low': return 'text-neutral bg-neutral/10 border-neutral/20';
			default: return 'text-neutral bg-neutral/10 border-neutral/20';
		}
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
		// If title is already in Spanish, return as is
		if (notification.title.includes('Nueva') || notification.title.includes('Recibida') || 
			notification.title.includes('Oferta') || notification.title.includes('Pago')) {
			return notification.title;
		}

		// Translate common English titles to Spanish
		const translations: Record<string, string> = {
			'New Bid Received': 'Nueva Oferta Recibida',
			'Bid Accepted': 'Oferta Aceptada',
			'Bid Rejected': 'Oferta Rechazada',
			'Payment Received': 'Pago Recibido',
			'Payment Sent': 'Pago Enviado',
			'Task Updated': 'Tarea Actualizada',
			'New Message': 'Nuevo Mensaje',
			'System Maintenance': 'Mantenimiento del Sistema',
			'Security Alert': 'Alerta de Seguridad',
			'Contract Created': 'Contrato Creado',
			'Contract Completed': 'Contrato Completado',
			'Task Completed': 'Tarea Completada',
			'New Notification': 'Nueva Notificación'
		};

		return translations[notification.title] || notification.title;
	}

	function getTranslatedBody(notification: Notification): string {
		// If body is already in Spanish, return as is
		if (notification.body.includes('recibido') || notification.body.includes('enviado') || 
			notification.body.includes('tarea') || notification.body.includes('oferta')) {
			return notification.body;
		}

		// Translate common English body text to Spanish
		const bodyTranslations: Record<string, string> = {
			'You have received a new bid': 'Has recibido una nueva oferta',
			'Your bid has been accepted': 'Tu oferta ha sido aceptada',
			'Your bid has been rejected': 'Tu oferta ha sido rechazada',
			'Payment has been received': 'El pago ha sido recibido',
			'Payment has been sent': 'El pago ha sido enviado',
			'Task has been updated': 'La tarea ha sido actualizada',
			'You have a new message': 'Tienes un nuevo mensaje',
			'System maintenance scheduled': 'Mantenimiento del sistema programado',
			'Security alert detected': 'Alerta de seguridad detectada',
			'Contract has been created': 'El contrato ha sido creado',
			'Contract has been completed': 'El contrato ha sido completado',
			'Task has been completed': 'La tarea ha sido completada'
		};

		// Try to find a matching translation
		for (const [english, spanish] of Object.entries(bodyTranslations)) {
			if (notification.body.includes(english)) {
				return notification.body.replace(english, spanish);
			}
		}

		return notification.body;
	}

</script>

<div class="relative">
	<!-- Notification Bell Button -->
	<button
		onclick={toggleNotificationCenter}
		class="relative btn btn-ghost btn-sm p-2 hover:bg-base-200 transition-colors"
		aria-label="Notifications"
	>
		{#if unreadCount > 0}
			<IconBellAlert class="w-5 h-5 text-primary" />
		{:else}
			<IconBellOutline class="w-5 h-5 text-base-content/70" />
		{/if}
		
		<!-- Unread Badge -->
		{#if unreadCount > 0}
			<span class="absolute -top-1 -right-1 bg-error text-error-content text-xs rounded-full h-5 w-5 flex items-center justify-center font-bold shadow-sm">
				{unreadCount > 99 ? '99+' : unreadCount}
			</span>
		{/if}
	</button>

	<!-- Notification Dropdown -->
	{#if isOpen}
		<div class="absolute right-0 mt-2 w-96 bg-base-100 rounded-lg shadow-lg border border-base-300 z-50 max-h-96 overflow-hidden">
			<!-- Header -->
			<div class="px-4 py-3 border-b border-base-300 flex items-center justify-end">
				<div class="flex items-center space-x-2">
					{#if notifications.length > 0}
						<button
							onclick={clearAllNotifications}
							class="text-sm text-base-content/60 hover:text-base-content/80"
						>
							Clear all
						</button>
					{/if}
					<button
						onclick={() => isOpen = false}
						class="text-base-content/40 hover:text-base-content/60"
						aria-label="Close notifications"
					>
						<IconClose class="w-5 h-5" />
					</button>
				</div>
			</div>

			<!-- Notifications List -->
			<div class="max-h-80 overflow-y-auto">
				{#if isLoading}
					<div class="p-4 text-center text-base-content/60">
						<IconLoading class="w-6 h-6 animate-spin text-primary mx-auto" />
						<p class="mt-2">Loading notifications...</p>
					</div>
				{:else if notifications.length === 0}
					<div class="p-8 text-center text-base-content/60">
						<IconBellOutline class="w-12 h-12 mx-auto mb-4 text-base-content/30" />
						<p class="text-lg font-medium">No notifications</p>
						<p class="text-sm">You're all caught up!</p>
					</div>
				{:else}
					{#each notifications as notification (notification.id)}
						<div
							class="px-4 py-3 border-b border-base-300 hover:bg-base-200 transition-colors {notification.read ? 'opacity-75' : 'bg-primary/5'} relative"
						>
							<div class="flex items-start space-x-3">
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
									<div class="flex items-center justify-between">
									<h4 class="{getTitleSize(notification)} text-base-content truncate">
										{getTranslatedTitle(notification)}
									</h4>
										<div class="flex items-center space-x-2">
											<!-- Priority Badge -->
											<span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium {getPriorityColor(notification.priority)}">
												{notification.priority}
											</span>
											<!-- Time -->
											<span class="text-xs text-base-content/60">
												{formatTimeAgo(notification.createdAt)}
											</span>
										</div>
									</div>
									<p class="mt-1 text-sm text-base-content/80 line-clamp-2">
										{getTranslatedBody(notification)}
									</p>
									
									<!-- Additional Data -->
									{#if notification.data && Object.keys(notification.data).length > 0}
										<div class="mt-2 text-xs text-base-content/60">
											{#if notification.data.taskTitle}
												<span class="inline-block bg-base-200 px-2 py-1 rounded">
													{notification.data.taskTitle}
												</span>
											{/if}
											{#if notification.data.amount}
												<span class="inline-block bg-success/20 text-success px-2 py-1 rounded ml-1">
													{notification.data.amount} {notification.data.currency || 'USD'}
												</span>
											{/if}
										</div>
									{/if}
								</div>

								<!-- Action Buttons -->
								<div class="flex-shrink-0 flex items-center space-x-1">
									<!-- View Button -->
									<button
										onclick={() => handleNotificationClick(notification)}
										class="text-primary hover:text-primary-focus p-1"
										aria-label="View notification"
									>
										<IconEye class="w-4 h-4" />
									</button>
									<!-- Remove Button -->
									<button
										onclick={() => removeNotification(notification.id)}
										class="text-base-content/40 hover:text-base-content/60 p-1"
										aria-label="Remove notification"
									>
										<IconDelete class="w-4 h-4" />
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

			<!-- Footer -->
			{#if notifications.length > 0}
				<div class="px-4 py-3 border-t border-base-300 bg-base-200">
					<button
						onclick={() => goto('/dashboard/notifications')}
						class="w-full text-center text-sm text-primary hover:text-primary-focus font-medium"
					>
						View all notifications
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
