<script lang="ts">
	import { onMount } from 'svelte';
	import { t } from 'svelte-i18n';
	import { pushNotificationService } from '$lib/api/services/push-notification.service';
	import IconBell from '~icons/mdi/bell';
	import IconClose from '~icons/mdi/close';

	type PermissionState = 'granted' | 'denied' | 'prompt' | 'unsupported' | 'loading';

	let permissionStatus = $state<PermissionState>('loading');
	let isRequesting = $state(false);

	// Show the banner only when permission has not been decided yet
	let showBanner = $derived(permissionStatus === 'prompt');

	async function refreshStatus() {
		permissionStatus = await pushNotificationService.checkPermissionStatus();
		return permissionStatus;
	}

	onMount(async () => {
		await refreshStatus();
	});

	async function enableNotifications() {
		isRequesting = true;
		try {
			await pushNotificationService.init();
			permissionStatus = 'granted';
		} catch {
			// User denied or an error occurred — re-check so we reflect the real state
			await refreshStatus();
		} finally {
			isRequesting = false;
		}
	}

	function dismissBanner() {
		// Treat dismiss as a soft "not now" — hide banner for this session
		permissionStatus = 'denied';
	}
</script>

{#if showBanner}
	<div
		class="fixed inset-x-3 z-50 mx-auto max-w-none sm:inset-x-4 md:inset-x-auto md:right-4 md:max-w-sm"
		style="top: max(0.75rem, env(safe-area-inset-top, 0px))"
	>
		<div
			class="bg-primary text-primary-content border-primary-content/20 rounded-xl border p-3 shadow-2xl sm:p-4 md:p-5"
		>
			<!-- Header -->
			<div class="mb-2 flex items-center justify-between gap-2 sm:mb-3 sm:gap-3">
				<div class="flex items-center gap-2 sm:gap-3">
					<div class="shrink-0">
						<IconBell class="h-5 w-5 sm:h-6 sm:w-6" />
					</div>
					<h4 class="text-sm font-semibold sm:text-base md:text-lg">
						{$t('notifications.permissions.banner.title')}
					</h4>
				</div>
				<button
					onclick={dismissBanner}
					class="text-primary-content/60 hover:text-primary-content/90 shrink-0 p-1 transition-colors duration-200"
					aria-label={$t('notifications.permissions.banner.close_aria')}
				>
					<IconClose class="h-5 w-5 sm:h-6 sm:w-6" />
				</button>
			</div>

			<!-- Description -->
			<p class="mb-3 text-xs leading-relaxed opacity-90 sm:mb-4 sm:text-sm md:mb-5">
				{$t('notifications.permissions.banner.description')}
			</p>

			<!-- Actions -->
			<div class="flex flex-row gap-2">
				<button
					onclick={enableNotifications}
					disabled={isRequesting}
					class="btn btn-sm text-primary sm:btn-md flex-1 font-semibold transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
					style="background-color: var(--color-primary-content, white); border-color: transparent;"
				>
					{#if isRequesting}
						<span class="loading loading-spinner loading-xs"></span>
					{/if}
					{$t('notifications.permissions.banner.enable_button')}
				</button>
				<button
					onclick={dismissBanner}
					disabled={isRequesting}
					class="btn btn-outline btn-sm border-primary-content/40 text-primary-content hover:border-primary-content/60 hover:bg-primary-content/10 sm:btn-md flex-1 border-2 bg-transparent font-medium transition-all duration-200 active:scale-[0.98]"
				>
					{$t('notifications.permissions.banner.later_button')}
				</button>
			</div>
		</div>
	</div>
{/if}
