<!-- 
  NotificationSettings.svelte
  Component for managing notification preferences for saved searches
-->
<script lang="ts">
	import type { NotificationPreferences } from '$lib/types/saved-search';
	import savedSearchesService from '$lib/api/services/saved-searches.service';
	import { Preferences } from '@capacitor/preferences';
	import { LocalNotifications } from '@capacitor/local-notifications';

	// Props
	let { savedSearchId = null } = $props<{ savedSearchId: string | null }>();

	// State
	let preferences = $state<NotificationPreferences>({
		enabled: true,
		frequency: 'immediate',
		emailNotifications: true,
		pushNotifications: true,
		quietHours: {
			enabled: false,
			start: '22:00',
			end: '08:00'
		}
	});

	let isLoading = $state(true);
	let error = $state<string | null>(null);
	let saveSuccess = $state(false);
	let hasNotificationPermission = $state(false);

	// Load notification preferences
	async function loadPreferences() {
		if (!savedSearchId) {
			// Load global preferences from device storage
			try {
				isLoading = true;

				const { value } = await Preferences.get({ key: 'notification_preferences' });

				if (value) {
					preferences = JSON.parse(value);
				}

				// Check notification permission status
				if (window.Capacitor?.isNativePlatform()) {
					const permissionStatus = await LocalNotifications.checkPermissions();
					hasNotificationPermission = permissionStatus.display === 'granted';
				}
			} catch (err) {
				console.error('Error loading notification preferences:', err);
				error = 'Failed to load notification preferences.';
			} finally {
				isLoading = false;
			}
		} else {
			// Load saved search specific preferences
			try {
				isLoading = true;

				const savedSearch = await savedSearchesService.getSavedSearchById(savedSearchId);

				// Map saved search preferences to our format
				preferences = {
					enabled: savedSearch.notificationsEnabled,
					frequency: savedSearch.notificationFrequency,
					emailNotifications: true, // Default value
					pushNotifications: true, // Default value
					quietHours: {
						enabled: false,
						start: '22:00',
						end: '08:00'
					}
				};
			} catch (err) {
				console.error('Error loading notification preferences:', err);
				error = 'Failed to load notification preferences.';
			} finally {
				isLoading = false;
			}
		}
	}

	// Save notification preferences
	async function savePreferences() {
		try {
			error = null;
			saveSuccess = false;

			if (!savedSearchId) {
				// Save global preferences to device storage
				await Preferences.set({
					key: 'notification_preferences',
					value: JSON.stringify(preferences)
				});
			} else {
				// Save saved search specific preferences
				await savedSearchesService.updateNotificationPreferences(
					savedSearchId,
					preferences.enabled,
					preferences.frequency
				);
			}

			saveSuccess = true;

			// Hide success message after 3 seconds
			setTimeout(() => {
				saveSuccess = false;
			}, 3000);
		} catch (err) {
			console.error('Error saving notification preferences:', err);
			error = 'Failed to save notification preferences.';
		}
	}

	// Request notification permissions
	async function requestNotificationPermission() {
		if (!window.Capacitor?.isNativePlatform()) {
			return;
		}

		try {
			const permissionStatus = await LocalNotifications.requestPermissions();
			hasNotificationPermission = permissionStatus.display === 'granted';
		} catch (err) {
			console.error('Error requesting notification permission:', err);
		}
	}

	// Load preferences on component mount
	loadPreferences();
</script>

<div class="bg-base-200 rounded-lg p-4">
	<h2 class="mb-4 text-xl font-bold">
		{savedSearchId ? 'Search Notification Settings' : 'Notification Settings'}
	</h2>

	{#if isLoading}
		<div class="flex justify-center p-6">
			<div class="loading loading-spinner loading-lg"></div>
		</div>
	{:else}
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
			</div>
		{/if}

		{#if saveSuccess}
			<div class="alert alert-success mb-4">
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
						d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
					/>
				</svg>
				<span>Settings saved successfully!</span>
			</div>
		{/if}

		{#if !hasNotificationPermission && window.Capacitor?.isNativePlatform()}
			<div class="alert alert-warning mb-4">
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
						d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
					/>
				</svg>
				<div>
					<h3 class="font-bold">Permission required</h3>
					<div class="text-sm">Enable notifications to receive alerts about new tasks.</div>
				</div>
				<button class="btn btn-sm btn-primary" onclick={requestNotificationPermission}>
					Enable
				</button>
			</div>
		{/if}

		<!-- Notification Settings Form -->
		<div class="space-y-4">
			<!-- Enable/Disable Notifications -->
			<div class="form-control">
				<label class="label cursor-pointer justify-start gap-2">
					<input type="checkbox" class="toggle toggle-primary" bind:checked={preferences.enabled} />
					<span class="label-text">Enable Notifications</span>
				</label>
			</div>

			{#if preferences.enabled}
				<!-- Notification Frequency -->
				<div class="form-control">
					<label class="label" for="notification-frequency">
						<span class="label-text font-medium">Notification Frequency</span>
					</label>
					<select class="select select-bordered w-full" bind:value={preferences.frequency}>
						<option value="immediate">Immediate</option>
						<option value="daily">Daily Digest</option>
						<option value="weekly">Weekly Digest</option>
					</select>
					<label class="label" for="notification-frequency">
						<span class="label-text-alt"
							>How often you'll receive notifications about new matching tasks</span
						>
					</label>
				</div>

				<!-- Notification Methods -->
				<div class="form-control">
					<label class="label" for="notification-methods">
						<span class="label-text font-medium">Notification Methods</span>
					</label>
					<div class="flex flex-col gap-2">
						<label class="label cursor-pointer justify-start gap-2">
							<input
								type="checkbox"
								class="checkbox checkbox-primary"
								bind:checked={preferences.pushNotifications}
							/>
							<span class="label-text">Push Notifications</span>
						</label>
						<label class="label cursor-pointer justify-start gap-2">
							<input
								type="checkbox"
								class="checkbox checkbox-primary"
								bind:checked={preferences.emailNotifications}
							/>
							<span class="label-text">Email Notifications</span>
						</label>
					</div>
				</div>

				<!-- Quiet Hours -->
				<div class="form-control">
					<label class="label cursor-pointer justify-start gap-2">
						<input
							type="checkbox"
							class="checkbox checkbox-primary"
							bind:checked={preferences.quietHours.enabled}
						/>
						<span class="label-text font-medium">Enable Quiet Hours</span>
					</label>

					{#if preferences.quietHours.enabled}
						<div class="mt-2 ml-6 grid grid-cols-2 gap-4">
							<div class="form-control">
								<label class="label" for="quiet-hours-start">
									<span class="label-text">From</span>
								</label>
								<input
									type="time"
									class="input input-bordered w-full"
									bind:value={preferences.quietHours.start}
								/>
							</div>
							<div class="form-control">
								<label class="label" for="quiet-hours-end">
									<span class="label-text">To</span>
								</label>
								<input
									type="time"
									class="input input-bordered w-full"
									bind:value={preferences.quietHours.end}
								/>
							</div>
						</div>
						<p class="mt-1 ml-6 text-xs text-gray-500">
							No notifications will be sent during quiet hours.
						</p>
					{/if}
				</div>
			{/if}

			<!-- Save Button -->
			<div class="pt-4">
				<button class="btn btn-primary" onclick={savePreferences}> Save Settings </button>
			</div>
		</div>
	{/if}
</div>
