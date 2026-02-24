<script lang="ts">
	import { onMount } from 'svelte';	
	import { authState } from '$lib/stores/auth.store';
	import { page } from '$app/state';
	import { t } from 'svelte-i18n';
	import IconBell from '~icons/mdi/bell';
	import IconClose from '~icons/mdi/close';

	let showBanner = $state(false);
	let permissionStatus = $state<NotificationPermission | 'unsupported'>('unsupported');
	
	// Get authentication state
	
	// Check if we're in onboarding or auth routes
	let isOnboardingOrAuth = $derived.by(() => {
		const path = page.url.pathname;
		return path.includes('/onboarding') || path.includes('/auth/signup') || path.includes('/auth/login');
	});

	function checkNotificationPermission() {
		// Don't show banner during onboarding or auth flows
		if (isOnboardingOrAuth) {
			showBanner = false;
			return;
		}
		
		// Only show banner if user is logged in
		if (!$authState.isAuthenticated) {
			showBanner = false;
			return;
		}
		
		// Check permission status
		//permissionStatus = localNotificationService.getNotificationPermissionStatus();
		
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

	// React to authentication state changes and route changes
	$effect(() => {
		if ($authState.isAuthenticated !== undefined) {
			checkNotificationPermission();
		}
		// Also react to route changes
		page.url.pathname;
		checkNotificationPermission();
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

{#if showBanner && $authState.isAuthenticated && !isOnboardingOrAuth}
	<div class="fixed inset-x-3 top-3 z-50 mx-auto max-w-none sm:inset-x-4 sm:top-4 md:inset-x-auto md:right-4 md:max-w-sm md:top-4">
		<div class="bg-primary text-primary-content rounded-xl shadow-2xl border border-primary-content/20 p-3 sm:p-4 md:p-5">
			<!-- Header with icon, title and close button -->
			<div class="flex items-center justify-between gap-2 mb-2 sm:gap-3 sm:mb-3">
				<div class="flex items-center gap-2 sm:gap-3">
					<div class="shrink-0">
						<IconBell class="w-5 h-5 sm:w-6 sm:h-6" />
					</div>
					<h4 class="text-sm font-semibold sm:text-base md:text-lg">
						{$t('notifications.permissions.banner.title')}
					</h4>
				</div>
				<button
					onclick={dismissBanner}
					class="shrink-0 text-primary-content/60 hover:text-primary-content/90 transition-colors duration-200 p-1"
					aria-label={$t('notifications.permissions.banner.close_aria')}
				>
					<IconClose class="w-5 h-5 sm:w-6 sm:h-6" />
				</button>
			</div>

			<!-- Description -->
			<p class="text-xs leading-relaxed opacity-90 sm:text-sm mb-3 sm:mb-4 md:mb-5">
				{$t('notifications.permissions.banner.description')}
			</p>

			<!-- Action Buttons -->
			<div class="flex flex-col gap-2 sm:flex-row sm:gap-2">
				<button
					onclick={requestPermission}
					class="btn w-full btn-sm btn-primary-content text-primary font-semibold transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] sm:w-auto sm:btn-md"
				>
					{$t('notifications.permissions.banner.enable_button')}
				</button>
				<button
					onclick={dismissBanner}
					class="btn w-full btn-sm btn-outline border-2 border-primary-content/40 text-primary-content bg-transparent hover:bg-primary-content/10 hover:border-primary-content/60 transition-all duration-200 font-medium active:scale-[0.98] sm:w-auto sm:btn-md"
				>
					{$t('notifications.permissions.banner.later_button')}
				</button>
			</div>
		</div>
	</div>
{/if}

