<script lang="ts">
	import { notificationStore } from '$lib/stores/notification.store';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import type { Notification } from '$lib/stores/notification.store';
	
	// MDI Icons
	import IconCurrencyUsd from '~icons/mdi/currency-usd';
	import IconFileDocumentOutline from '~icons/mdi/file-document-outline';
	import IconCreditCard from '~icons/mdi/credit-card';
	import IconPencil from '~icons/mdi/pencil';
	import IconChat from '~icons/mdi/chat';
	import IconCog from '~icons/mdi/cog';
	import IconShield from '~icons/mdi/shield';
	import IconBell from '~icons/mdi/bell';
	import IconClose from '~icons/mdi/close';

	let toasts = $state<Notification[]>([]);
	let toastTimeouts = new Map<string, NodeJS.Timeout>();

	// Subscribe to notification store for new notifications
	$effect(() => {
		const store = $notificationStore;
		const newNotifications = store.notifications.filter(n => 
			!n.read && n.priority !== 'low' && n.delivered.inApp
		);

		// Add new notifications as toasts
		newNotifications.forEach(notification => {
			if (!toasts.find(t => t.id === notification.id)) {
				toasts = [...toasts, notification];
				
				// Auto-dismiss after 5 seconds
				const timeout = setTimeout(() => {
					dismissToast(notification.id);
				}, 5000);
				
				toastTimeouts.set(notification.id, timeout);
			}
		});
	});

	onMount(() => {
		// Clean up timeouts on unmount
		return () => {
			toastTimeouts.forEach(timeout => clearTimeout(timeout));
		};
	});

	function dismissToast(notificationId: string) {
		// Clear timeout
		const timeout = toastTimeouts.get(notificationId);
		if (timeout) {
			clearTimeout(timeout);
			toastTimeouts.delete(notificationId);
		}

		// Remove from toasts
		toasts = toasts.filter(t => t.id !== notificationId);
		
		// Mark as read
		//notificationService.markAsRead(notificationId);
	}

	function handleToastClick(notification: Notification) {
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

		dismissToast(notification.id);
	}


	function getToastColor(priority: Notification['priority']): string {
		switch (priority) {
			case 'urgent': return 'bg-error border-error-content';
			case 'high': return 'bg-primary border-primary-content';
			case 'normal': return 'bg-info border-info-content';
			case 'low': return 'bg-neutral border-neutral-content';
			default: return 'bg-neutral border-neutral-content';
		}
	}

	function getToastIconColor(priority: Notification['priority']): string {
		switch (priority) {
			case 'urgent': return 'text-error-content';
			case 'high': return 'text-primary-content';
			case 'normal': return 'text-info-content';
			case 'low': return 'text-neutral-content';
			default: return 'text-neutral-content';
		}
	}

	function getToastTitleSize(notification: Notification): string {
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

	function getTranslatedToastTitle(notification: Notification): string {
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

	function getTranslatedToastBody(notification: Notification): string {
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

<!-- Toast Container -->
<div class="fixed top-4 right-4 z-50 space-y-2">
	{#each toasts as toast (toast.id)}
		<div
			onclick={() => handleToastClick(toast)}
			onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleToastClick(toast); } }}
			class="max-w-sm w-full {getToastColor(toast.priority)} rounded-box shadow-lg border cursor-pointer transform transition-all duration-300 ease-in-out hover:scale-105"
			role="button"
			tabindex="0"
			aria-label="Notification: {toast.title}"
		>
			<div class="p-4">
				<div class="flex items-start">
					<!-- Icon -->
					<div class="flex-shrink-0">
						{#if toast.type === 'bid_response'}
							<IconCurrencyUsd class="w-5 h-5 {getToastIconColor(toast.priority)}" />
						{:else if toast.type === 'contract_event'}
							<IconFileDocumentOutline class="w-5 h-5 {getToastIconColor(toast.priority)}" />
						{:else if toast.type === 'payment'}
							<IconCreditCard class="w-5 h-5 {getToastIconColor(toast.priority)}" />
						{:else if toast.type === 'task_update'}
							<IconPencil class="w-5 h-5 {getToastIconColor(toast.priority)}" />
						{:else if toast.type === 'message'}
							<IconChat class="w-5 h-5 {getToastIconColor(toast.priority)}" />
						{:else if toast.type === 'system'}
							<IconCog class="w-5 h-5 {getToastIconColor(toast.priority)}" />
						{:else if toast.type === 'security'}
							<IconShield class="w-5 h-5 {getToastIconColor(toast.priority)}" />
						{:else}
							<IconBell class="w-5 h-5 {getToastIconColor(toast.priority)}" />
						{/if}
					</div>

					<!-- Content -->
					<div class="ml-3 flex-1">
						<h4 class="{getToastTitleSize(toast)} {getToastIconColor(toast.priority)}">
							{getTranslatedToastTitle(toast)}
						</h4>
						<p class="mt-1 text-sm {getToastIconColor(toast.priority)} opacity-90">
							{getTranslatedToastBody(toast)}
						</p>
						
						<!-- Additional Data -->
						{#if toast.data && Object.keys(toast.data).length > 0}
							<div class="mt-2 flex flex-wrap gap-1">
								{#if toast.data.taskTitle}
									<span class="inline-block bg-base-content bg-opacity-20 text-xs px-2 py-1 rounded">
										{toast.data.taskTitle}
									</span>
								{/if}
								{#if toast.data.amount}
									<span class="inline-block bg-base-content bg-opacity-20 text-xs px-2 py-1 rounded">
										{toast.data.amount} {toast.data.currency || 'USD'}
									</span>
								{/if}
							</div>
						{/if}
					</div>

					<!-- Close Button -->
					<button
						onclick={(e) => { e.stopPropagation(); dismissToast(toast.id); }}
						class="ml-3 flex-shrink-0 {getToastIconColor(toast.priority)} hover:opacity-75"
						aria-label="Dismiss notification"
					>
						<IconClose class="w-4 h-4" />
					</button>
				</div>
			</div>

			<!-- Progress Bar -->
			<div class="h-1 bg-base-content bg-opacity-20">
				<div class="h-full bg-base-content bg-opacity-40 animate-progress"></div>
			</div>
		</div>
	{/each}
</div>

<style>
	@keyframes progress {
		from {
			width: 100%;
		}
		to {
			width: 0%;
		}
	}

	.animate-progress {
		animation: progress 5s linear forwards;
	}
</style>
