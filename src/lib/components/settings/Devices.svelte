<script lang="ts">
	import { t } from 'svelte-i18n';
	import { onMount } from 'svelte';
	import { pushNotificationService } from '$lib/api/services/push-notification.service';
	import { getDeviceIdentifier } from '$lib/utils/helpers/deviceIdentity';
	import Modal from '$lib/components/Modal.svelte';

	// Types based on GraphQL schema
	interface UserDevice {
		id: string;
		deviceId: string;
		deviceName?: string | null;
		platform?: string | null;
		isActive: boolean;
		lastUsedAt?: string | null;
		createdAt?: string;
		appVersion?: string | null;
		fcmToken?: string | null;
		lastTokenRefresh?: string | null;
		credentialId?: string | null;
		pushToken?: string | null;
		revokedAt?: string | null;
		updatedAt?: string;
		userId?: number;
	}

	// Component state
	let devices = $state<UserDevice[]>([]);
	let loading = $state(true);
	let error = $state('');
	let currentDeviceId = $state<string | null>(null);

	// Modal state
	let showRevokeModal = $state(false);
	let deviceToRevoke = $state<UserDevice | null>(null);
	let revokeLoading = $state(false);
	let revokeError = $state('');

	onMount(async () => {
		await loadDevices();
		currentDeviceId = await getDeviceIdentifier();
	});

	async function loadDevices() {
		try {
			loading = true;
			error = '';
			devices = await pushNotificationService.getMyDevices();
		} catch (err) {
			console.error('Failed to load devices:', err);
			error = $t('settings.devices.error.loadFailed');
		} finally {
			loading = false;
		}
	}

	function getDeviceIcon(platform?: string | null): string {
		switch (platform?.toUpperCase()) {
			case 'ANDROID':
				return `
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z"/>
				`;
			case 'IOS':
				return `
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z"/>
				`;
			case 'WEB':
				return `
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
				`;
			default:
				return `
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z"/>
				`;
		}
	}

	function getDevicePlatformName(platform?: string | null): string {
		switch (platform?.toUpperCase()) {
			case 'ANDROID':
				return 'Android';
			case 'IOS':
				return 'iOS';
			case 'WEB':
				return 'Web Browser';
			default:
				return 'Unknown';
		}
	}

	function formatLastUsed(lastUsedAt?: string | null): string {
		if (!lastUsedAt) return $t('settings.devices.lastUsed.never');

		const date = new Date(lastUsedAt);
		const now = new Date();
		const diffMs = now.getTime() - date.getTime();
		const diffMins = Math.floor(diffMs / (1000 * 60));
		const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
		const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

		if (diffMins < 1) return $t('settings.devices.lastUsed.justNow');
		if (diffMins < 60) return `${diffMins} ${diffMins === 1 ? 'minute' : 'minutes'} ago`;
		if (diffHours < 24) return `${diffHours} ${diffHours === 1 ? 'hour' : 'hours'} ago`;
		if (diffDays < 7) return `${diffDays} ${diffDays === 1 ? 'day' : 'days'} ago`;

		return date.toLocaleDateString();
	}

	function isCurrentDevice(device: UserDevice): boolean {
		return device.deviceId === currentDeviceId;
	}

	function getDeviceDisplayName(device: UserDevice): string {
		if (isCurrentDevice(device)) {
			return $t('settings.devices.thisDevice');
		}

		let deviceName = device.deviceName || getDevicePlatformName(device.platform);

		// Remove the 8-character suffix from createUserDeviceShortName
		if (deviceName.includes('-') && deviceName.length > 8) {
			const lastDashIndex = deviceName.lastIndexOf('-');
			const suffix = deviceName.substring(lastDashIndex + 1);
			if (suffix.length === 8) {
				deviceName = deviceName.substring(0, lastDashIndex);
			}
		}

		return deviceName;
	}

	function openRevokeModal(device: UserDevice) {
		deviceToRevoke = device;
		showRevokeModal = true;
		revokeError = '';
	}

	function closeRevokeModal() {
		showRevokeModal = false;
		deviceToRevoke = null;
		revokeError = '';
	}

	async function confirmRevokeDevice() {
		if (!deviceToRevoke) return;

		try {
			revokeLoading = true;
			revokeError = '';

			// Call the revoke device API
			const deviceName = getDeviceDisplayName(deviceToRevoke);
			const revocationMessage = `Your device "${deviceName}" has been revoked from your BitTasker account for security reasons. Please log in again if this was not intended.`;

			await pushNotificationService.revokeDevice(deviceToRevoke.deviceId, revocationMessage);

			// Reload devices list
			await loadDevices();

			// Close modal
			closeRevokeModal();
		} catch (err) {
			console.error('Failed to revoke device:', err);
			revokeError = $t('settings.devices.error.revokeFailed');
		} finally {
			revokeLoading = false;
		}
	}
</script>

<!-- Devices Section -->
<div class="card bg-base-100 mb-6 shadow-xl">
	<div class="card-body">
		<div class="mb-1 flex items-center gap-2">
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="h-6 w-6"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
				/>
			</svg>
			<h4 class="card-title">{$t('settings.devices.title')}</h4>
		</div>
		<p class="text-base-content/70 mb-6">
			{$t('settings.devices.description')}
		</p>

		{#if loading}
			<div class="flex justify-center py-8">
				<span class="loading loading-spinner loading-md"></span>
			</div>
		{:else if error}
			<div class="alert alert-error alert-outline mb-4">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="h-6 w-6 shrink-0 stroke-current"
					fill="none"
					viewBox="0 0 24 24"
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
		{:else if devices.length === 0}
			<div class="py-8 text-center">
				<p class="text-base-content/70">{$t('settings.devices.noDevices')}</p>
			</div>
		{:else}
			<div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
				{#each devices as device (device.id)}
					<div class="card bg-base-200 border-base-300 relative border shadow-sm">
						<!-- Active/Inactive Status Indicator -->
						<div class="absolute top-3 right-3">
							{#if device.isActive}
								<span class="relative flex size-3" title={$t('settings.devices.status.active')}>
									<span
										class="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75"
									></span>
									<span class="relative inline-flex size-3 rounded-full bg-green-500"></span>
								</span>
							{:else}
								<div
									class="h-3 w-3 rounded-full bg-red-500"
									title={$t('settings.devices.status.inactive')}
								></div>
							{/if}
						</div>

						<div class="card-body p-4">
							<!-- Device Icon -->
							<div class="mb-3 flex justify-center">
								<div class="bg-primary/10 rounded-full p-3">
									<svg
										xmlns="http://www.w3.org/2000/svg"
										class="text-primary h-8 w-8"
										fill="none"
										viewBox="0 0 24 24"
										stroke="currentColor"
									>
										{@html getDeviceIcon(device.platform)}
									</svg>
								</div>
							</div>

							<!-- Device Name -->
							<h5 class="mb-1 text-center text-base font-semibold">
								{getDeviceDisplayName(device)}
							</h5>

							<!-- Platform -->
							<p class="text-base-content/60 mb-2 text-center text-sm">
								{getDevicePlatformName(device.platform)}
							</p>

							<!-- Last Used -->
							<p class="text-base-content/70 mb-4 text-center text-sm">
								{$t('settings.devices.lastUsed.label')}: {formatLastUsed(device.lastUsedAt)}
							</p>

							<!-- Revoke Button -->
							<div class="card-actions justify-center">
								<button
									class="btn btn-error btn-outline btn-sm"
									onclick={() => openRevokeModal(device)}
									disabled={isCurrentDevice(device)}
									title={isCurrentDevice(device)
										? $t('settings.devices.cannotRevokeCurrentDevice')
										: $t('settings.devices.revokeDevice')}
								>
									<svg
										xmlns="http://www.w3.org/2000/svg"
										class="h-4 w-4"
										fill="none"
										viewBox="0 0 24 24"
										stroke="currentColor"
									>
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											stroke-width="2"
											d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
										/>
									</svg>
									{$t('settings.devices.revoke')}
								</button>
							</div>
						</div>
					</div>
				{/each}
			</div>
		{/if}

		<!-- Refresh Button -->
		<div class="mt-6 flex justify-center">
			<button class="btn btn-outline" onclick={loadDevices} disabled={loading}>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="h-5 w-5"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
					/>
				</svg>
				{$t('settings.devices.refresh')}
			</button>
		</div>
	</div>
</div>

<!-- Revoke Device Confirmation Modal -->
<Modal
	isOpen={showRevokeModal}
	title={$t('settings.devices.revokeModal.title')}
	onClose={closeRevokeModal}
	size="md"
>
	<div class="text-center">
		<div class="mb-4">
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="text-warning mx-auto h-16 w-16"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
				/>
			</svg>
		</div>

		<h3 class="mb-2 text-lg font-bold">
			{$t('settings.devices.revokeModal.confirmTitle')}
		</h3>

		{#if deviceToRevoke}
			<p class="mb-4">
				{$t('settings.devices.revokeModal.confirmMessage')}
				{getDeviceDisplayName(deviceToRevoke)}
			</p>

			<div class="bg-base-200 mb-4 rounded-lg p-4">
				<div class="mb-2 flex items-center justify-center">
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="text-primary mr-2 h-6 w-6"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
					>
						{@html getDeviceIcon(deviceToRevoke.platform)}
					</svg>
					<span class="font-semibold">
						{getDeviceDisplayName(deviceToRevoke)}
					</span>
				</div>
				<p class="text-base-content/70 text-sm">
					{$t('settings.devices.lastUsed.label')}: {formatLastUsed(deviceToRevoke.lastUsedAt)}
				</p>
			</div>
		{/if}

		<p class="text-base-content/70 mb-6 text-sm">
			{$t('settings.devices.revokeModal.warning')}
		</p>

		{#if revokeError}
			<div class="alert alert-error alert-outline mb-4">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="h-6 w-6 shrink-0 stroke-current"
					fill="none"
					viewBox="0 0 24 24"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
					/>
				</svg>
				<span>{revokeError}</span>
			</div>
		{/if}
	</div>

	<button class="btn btn-outline" onclick={closeRevokeModal} disabled={revokeLoading}>
		{$t('common.cancel')}
	</button>
	<button class="btn btn-error" onclick={confirmRevokeDevice} disabled={revokeLoading}>
		{#if revokeLoading}
			<span class="loading loading-spinner loading-sm"></span>
		{:else}
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="h-5 w-5"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
				/>
			</svg>
		{/if}
		{$t('settings.devices.revokeModal.confirm')}
	</button>
</Modal>
