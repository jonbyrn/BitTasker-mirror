<script lang="ts">
	import { localNotificationService } from '$lib/services/local-notification.service';
	import { onMount } from 'svelte';
	import IconBell from '~icons/mdi/bell';
	import IconClose from '~icons/mdi/close';

	let showBanner = $state(false);
	let permissionStatus = $state<NotificationPermission | 'unsupported'>('unsupported');

	onMount(() => {
		// Check permission status
		permissionStatus = localNotificationService.getNotificationPermissionStatus();
		
		// Show banner if permission is not granted and not unsupported
		if (permissionStatus !== 'granted' && permissionStatus !== 'unsupported') {
			showBanner = true;
		}
	});

	async function requestPermission() {
		try {
			if ('Notification' in window) {
				const permission = await Notification.requestPermission();
				permissionStatus = permission;
				
				if (permission === 'granted') {
					showBanner = false;
					// Show success message
					console.log('Notification permission granted');
				} else {
					// Show error message
					console.warn('Notification permission denied');
				}
			}
		} catch (error) {
			console.error('Error requesting notification permission:', error);
		}
	}

	function dismissBanner() {
		showBanner = false;
	}
</script>

{#if showBanner}
	<div class="fixed top-4 right-4 z-50 max-w-sm bg-primary text-primary-content rounded-lg shadow-lg border border-primary-content/20 p-4">
		<div class="flex items-start space-x-3">
			<div class="flex-shrink-0">
				<IconBell class="w-5 h-5" />
			</div>
			<div class="flex-1 min-w-0">
				<h4 class="text-sm font-medium">Enable Notifications</h4>
				<p class="mt-1 text-sm opacity-90">
					Get notified about new bids, contract updates, and payments even when the app is closed.
				</p>
				<div class="mt-3 flex space-x-2">
					<button
						onclick={requestPermission}
						class="btn btn-sm btn-primary-content text-primary"
					>
						Enable
					</button>
					<button
						onclick={dismissBanner}
						class="btn btn-sm btn-ghost text-primary-content/70 hover:text-primary-content"
					>
						Later
					</button>
				</div>
			</div>
			<button
				onclick={dismissBanner}
				class="flex-shrink-0 text-primary-content/40 hover:text-primary-content/60"
				aria-label="Close banner"
			>
				<IconClose class="w-4 h-4" />
			</button>
		</div>
	</div>
{/if}

