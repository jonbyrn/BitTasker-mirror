<script lang="ts">
	import { localNotificationService } from '$lib/services/local-notification.service';
	import { onMount } from 'svelte';
	import { authState } from '$lib/stores/auth.store';
	import { t } from 'svelte-i18n';
	import IconBell from '~icons/mdi/bell';
	import IconClose from '~icons/mdi/close';

	let showBanner = $state(false);
	let permissionStatus = $state<NotificationPermission | 'unsupported'>('unsupported');
	
	// Get authentication state
	let isLoggedIn = $derived($authState.isAuthenticated);

	function checkNotificationPermission() {
		// Only show banner if user is logged in
		if (!isLoggedIn) {
			showBanner = false;
			return;
		}
		
		// Check permission status
		permissionStatus = localNotificationService.getNotificationPermissionStatus();
		
		// Show banner if permission is not granted and not unsupported
		if (permissionStatus !== 'granted' && permissionStatus !== 'unsupported') {
			showBanner = true;
		} else {
			showBanner = false;
		}
	}

	onMount(() => {
		checkNotificationPermission();
	});

	// React to authentication state changes
	$effect(() => {
		if (isLoggedIn !== undefined) {
			checkNotificationPermission();
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

{#if showBanner && isLoggedIn}
	<div class="fixed inset-x-4 top-4 z-50 mx-auto max-w-md md:inset-x-auto md:right-4 md:max-w-sm">
		<div class="bg-primary text-primary-content rounded-lg shadow-lg border border-primary-content/20 p-4 md:p-5">
			<div class="flex items-start gap-3 md:gap-4">
				<div class="shrink-0">
					<IconBell class="w-5 h-5 md:w-6 md:h-6" />
				</div>
				<div class="grow min-w-0">
					<h4 class="text-sm font-medium md:text-base">{$t('notifications.permissions.banner.title')}</h4>
					<p class="mt-1 text-xs opacity-90 md:text-sm">
						{$t('notifications.permissions.banner.description')}
					</p>
					<div class="mt-3 flex flex-col gap-2 sm:flex-row sm:gap-2">
						<button
							onclick={requestPermission}
							class="btn btn-sm btn-primary-content text-primary font-medium transition-all duration-200 hover:scale-105 md:btn-md"
						>
							{$t('notifications.permissions.banner.enable_button')}
						</button>
						<button
							onclick={dismissBanner}
							class="btn btn-sm btn-outline border-primary-content/30 text-primary-content bg-transparent hover:bg-primary-content/10 hover:border-primary-content/50 transition-all duration-200 md:btn-md"
						>
							{$t('notifications.permissions.banner.later_button')}
						</button>
					</div>
				</div>
				<button
					onclick={dismissBanner}
					class="shrink-0 text-primary-content/40 hover:text-primary-content/80 transition-colors duration-200"
					aria-label={$t('notifications.permissions.banner.close_aria')}
				>
					<IconClose class="w-4 h-4 md:w-5 md:h-5" />
				</button>
			</div>
		</div>
	</div>
{/if}

