<script lang="ts">
	import { getContext, onMount } from 'svelte';
	import { fly } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import { t } from 'svelte-i18n';
	import { nip19 } from 'nostr-tools';
	import { pushNotificationService } from '$lib/api/services/push-notification.service';
	import {
		createUserDeviceShortName,
		getDeviceIdentifier
	} from '$lib/utils/helpers/deviceIdentity';
	import Modal from '$lib/components/Modal.svelte';

	const settings = getContext<{ npub: string; keysReady: boolean; error: string }>('settings');

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
		userId?: string;
		currentDevice?: boolean;
	}

	const DEVICE_ICONS: Record<string, string> = {
		ANDROID:
			'<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z"/>',
		IOS: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z"/>',
		WEB: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>'
	};
	const DEFAULT_ICON =
		'<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z"/>';

	const PLATFORM_I18N: Record<string, string> = {
		ANDROID: 'common.components.devices.platforms.android',
		IOS: 'common.components.devices.platforms.ios',
		WEB: 'common.components.devices.platforms.web'
	};

	let devices = $state<UserDevice[]>([]);
	let loading = $state(true);
	let error = $state('');

	let showRevokeModal = $state(false);
	let deviceToRevoke = $state<UserDevice | null>(null);
	let revokeLoading = $state(false);
	let revokeError = $state('');

	let showRevokeAllModal = $state(false);
	let revokeAllLoading = $state(false);
	let revokeAllError = $state('');

	let inactiveExpanded = $state(false);

	let currentDevice = $derived(devices.find((d) => d.currentDevice) ?? null);
	let activeDevices = $derived(
		devices
			.filter((d) => !d.currentDevice && d.isActive)
			.sort((a, b) => {
				const aTime = a.lastUsedAt ? new Date(a.lastUsedAt).getTime() : 0;
				const bTime = b.lastUsedAt ? new Date(b.lastUsedAt).getTime() : 0;
				return bTime - aTime;
			})
	);
	let inactiveDevices = $derived(
		devices
			.filter((d) => !d.currentDevice && !d.isActive)
			.sort((a, b) => {
				const aTime = a.lastUsedAt ? new Date(a.lastUsedAt).getTime() : 0;
				const bTime = b.lastUsedAt ? new Date(b.lastUsedAt).getTime() : 0;
				return bTime - aTime;
			})
	);
	let otherDevices = $derived([...activeDevices, ...inactiveDevices]);

	onMount(() => {
		loadDevices();
	});

	async function loadDevices() {
		try {
			loading = true;
			error = '';
			const currentDeviceId = await getDeviceIdentifier();

			const deviceNameNpub = await createUserDeviceShortName(settings.npub);
			let deviceNameHex = '';

			if (settings.npub.startsWith('npub')) {
				const { data } = nip19.decode(settings.npub);
				deviceNameHex = await createUserDeviceShortName(data as string);
			}

			const items = await pushNotificationService.getMyDevices();

			devices = items.map((item) => {
				const isCurrentDevice =
					item.deviceId === currentDeviceId &&
					(item.deviceName === deviceNameNpub ||
						(deviceNameHex && item.deviceName === deviceNameHex));

				return { ...item, currentDevice: Boolean(isCurrentDevice) };
			});
		} catch (err) {
			console.error('Failed to load devices:', err);
			error = $t('settings.devices.error.loadFailed');
		} finally {
			loading = false;
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
		if (diffMins < 60)
			return `${diffMins} ${diffMins === 1 ? $t('common.devices.time_units.minute') : $t('common.devices.time_units.minutes')} ago`;
		if (diffHours < 24)
			return `${diffHours} ${diffHours === 1 ? $t('common.devices.time_units.hour') : $t('common.devices.time_units.hours')} ago`;
		if (diffDays < 7)
			return `${diffDays} ${diffDays === 1 ? $t('common.devices.time_units.day') : $t('common.devices.time_units.days')} ago`;

		return date.toLocaleDateString();
	}

	function getDeviceDisplayName(device: UserDevice): string {
		if (device.currentDevice) {
			return $t('settings.devices.thisDevice');
		}

		let deviceName =
			device.deviceName ||
			$t(
				PLATFORM_I18N[(device.platform || '').toUpperCase()] ||
					'common.components.devices.platforms.unknown'
			);

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

			const deviceName = getDeviceDisplayName(deviceToRevoke);
			const revocationMessage = `Your device "${deviceName}" has been revoked from your BitTasker account for security reasons. Please log in again if this was not intended.`;

			await pushNotificationService.revokeDevice(deviceToRevoke.deviceId, revocationMessage);

			await loadDevices();

			closeRevokeModal();
		} catch (err) {
			console.error('Failed to revoke device:', err);
			revokeError = $t('settings.devices.error.revokeFailed');
		} finally {
			revokeLoading = false;
		}
	}

	function openRevokeAllModal() {
		showRevokeAllModal = true;
		revokeAllError = '';
	}

	function closeRevokeAllModal() {
		showRevokeAllModal = false;
		revokeAllError = '';
	}

	async function confirmRevokeAll() {
		try {
			revokeAllLoading = true;
			revokeAllError = '';

			const message = `All other device access has been revoked from your BitTasker account for security reasons. Please log in again if this was not intended.`;

			for (const d of otherDevices) {
				await pushNotificationService.revokeDevice(d.deviceId, message);
			}

			await loadDevices();
			closeRevokeAllModal();
		} catch (err) {
			console.error('Failed to revoke all devices:', err);
			revokeAllError = $t('settings.devices.error.revokeAllFailed');
		} finally {
			revokeAllLoading = false;
		}
	}
</script>

<div in:fly={{ x: 300, duration: 250, easing: cubicOut }}>
	<div class="mb-4">
		<a href="/settings" class="btn btn-sm border-base-300 bg-base-200 gap-2 border">
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="h-4 w-4"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"><polyline points="15 18 9 12 15 6" /></svg
			>
			{$t('settings.back')}
		</a>
	</div>

	{#if settings.keysReady && !settings.error}
		<div class="settings-sub-content bg-base-100 rounded-xl p-4 shadow-lg">
			<div class="mb-6">
				<h4 class="border-base-300 mb-4 border-b pb-2 text-lg font-semibold">
					{$t('settings.devices.title')}
					{#if devices.length > 0}
						<span class="text-base-content/60 ml-1 text-sm font-normal">({devices.length})</span>
					{/if}
				</h4>
				<div>
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
						<div class="divide-base-300 -mx-2 divide-y">
							{#if currentDevice}
								<div class="bg-primary/5 border-primary/20 rounded-lg border px-3 py-3">
									{@render deviceRow?.(currentDevice)}
								</div>
							{/if}

							{#if otherDevices.length > 0}
								<div class="px-3 pt-3">
									<button
										class="btn btn-outline btn-error btn-sm w-full"
										onclick={openRevokeAllModal}
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
										{$t('settings.devices.revokeAll')}
									</button>
								</div>
							{/if}

							{#if activeDevices.length > 0}
								<div class="pt-2">
									<div
										class="text-base-content/60 mb-1 px-3 text-xs font-semibold tracking-wider uppercase"
									>
										{$t('settings.devices.sections.active')} ({activeDevices.length})
									</div>
									{#each activeDevices as device (device.id)}
										<div class="hover:bg-base-200/50 rounded-lg px-3 py-2 transition-colors">
											{@render deviceRow?.(device)}
										</div>
									{/each}
								</div>
							{/if}

							{#if inactiveDevices.length > 0}
								<div class="pt-2">
									<div
										class="collapse-arrow collapse rounded-lg"
										class:collapse-open={inactiveExpanded}
									>
										<button
											type="button"
											class="collapse-title flex items-center gap-2 px-3 py-3 text-sm font-medium"
											onclick={() => (inactiveExpanded = !inactiveExpanded)}
										>
											<svg
												xmlns="http://www.w3.org/2000/svg"
												class="text-base-content/40 h-4 w-4"
												fill="none"
												viewBox="0 0 24 24"
												stroke="currentColor"
											>
												<path
													stroke-linecap="round"
													stroke-linejoin="round"
													stroke-width="2"
													d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
												/>
											</svg>
											<span>{$t('settings.devices.sections.inactive')}</span>
											<span class="badge badge-outline badge-sm ml-1">{inactiveDevices.length}</span
											>
										</button>
										<div class="collapse-content px-0 pb-0">
											{#each inactiveDevices as device (device.id)}
												<div class="hover:bg-base-200/50 rounded-lg px-3 py-2 transition-colors">
													{@render deviceRow?.(device)}
												</div>
											{/each}
										</div>
									</div>
								</div>
							{/if}
						</div>
					{/if}

					<div class="mt-6 flex justify-center">
						<button class="btn btn-outline btn-sm" onclick={loadDevices} disabled={loading}>
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
									d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
								/>
							</svg>
							{$t('settings.devices.refresh')}
						</button>
					</div>
				</div>
			</div>
		</div>
	{/if}
</div>

{#snippet deviceRow(device: UserDevice)}
	<div class="flex items-center gap-3">
		<div
			class="bg-primary/10 text-primary flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="h-5 w-5"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
			>
				<!-- eslint-disable-next-line svelte/no-at-html-tags -->
				{@html DEVICE_ICONS[(device.platform || '').toUpperCase()] || DEFAULT_ICON}
			</svg>
		</div>

		<div class="min-w-0 flex-1">
			<div class="flex items-center gap-2">
				<span class="truncate text-sm font-semibold">
					{getDeviceDisplayName(device)}
				</span>
				{#if device.currentDevice}
					<span class="badge badge-primary badge-xs shrink-0"
						>{$t('settings.devices.currentDevice')}</span
					>
				{/if}
			</div>
			<div class="text-base-content/60 text-xs">
				{$t(
					PLATFORM_I18N[(device.platform || '').toUpperCase()] ||
						'common.components.devices.platforms.unknown'
				)}
				<span class="mx-1 opacity-50">&middot;</span>
				{$t('settings.devices.lastUsed.label')}: {formatLastUsed(device.lastUsedAt)}
			</div>
		</div>

		<div
			class="shrink-0"
			title={device.isActive
				? $t('settings.devices.status.active')
				: $t('settings.devices.status.inactive')}
		>
			{#if device.isActive}
				<span class="relative flex size-2.5">
					<span
						class="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75"
					></span>
					<span class="relative inline-flex size-2.5 rounded-full bg-green-500"></span>
				</span>
			{:else}
				<div class="size-2.5 rounded-full bg-red-500/60"></div>
			{/if}
		</div>

		<button
			class="btn btn-ghost btn-xs text-base-content/40 hover:text-error shrink-0"
			onclick={() => openRevokeModal(device)}
			disabled={device.currentDevice}
			title={device.currentDevice
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
		</button>
	</div>
{/snippet}

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
			<p class="text-base-content/70 mb-4 text-sm">
				{$t('settings.devices.revokeModal.warning')}
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
						<!-- eslint-disable-next-line svelte/no-at-html-tags -->
						{@html DEVICE_ICONS[(deviceToRevoke.platform || '').toUpperCase()] || DEFAULT_ICON}
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

	<div class="flex gap-3">
		<button class="btn btn-outline flex-1" onclick={closeRevokeModal} disabled={revokeLoading}>
			{$t('common.cancel')}
		</button>
		<button class="btn btn-error flex-1" onclick={confirmRevokeDevice} disabled={revokeLoading}>
			{#if revokeLoading}
				<span class="loading loading-spinner loading-sm"></span>
			{/if}
			{$t('settings.devices.revokeModal.confirm')}
		</button>
	</div>
</Modal>

<Modal
	isOpen={showRevokeAllModal}
	title={$t('settings.devices.revokeAllModal.title')}
	onClose={closeRevokeAllModal}
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
			{$t('settings.devices.revokeAllModal.confirmTitle')}
		</h3>

		<p class="text-base-content/70 mb-4 text-sm">
			{$t('settings.devices.revokeAllModal.warning', { values: { count: otherDevices.length } })}
		</p>

		{#if revokeAllError}
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
				<span>{revokeAllError}</span>
			</div>
		{/if}
	</div>

	<div class="flex gap-3">
		<button
			class="btn btn-outline flex-1"
			onclick={closeRevokeAllModal}
			disabled={revokeAllLoading}
		>
			{$t('common.cancel')}
		</button>
		<button class="btn btn-error flex-1" onclick={confirmRevokeAll} disabled={revokeAllLoading}>
			{#if revokeAllLoading}
				<span class="loading loading-spinner loading-sm"></span>
			{/if}
			{$t('settings.devices.revokeAllModal.confirm')}
		</button>
	</div>
</Modal>
