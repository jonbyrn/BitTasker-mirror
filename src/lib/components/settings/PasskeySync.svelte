<script lang="ts">
	import { onMount } from 'svelte';
	import { t } from 'svelte-i18n';
	import { appStore } from '$lib/stores/app.store';
	import authService from '$lib/api/services/auth.service';
	import { getBiometricData, setBiometricKey } from '$lib/utils/helpers/biometrics';
	import {
		getDeviceIdentifier,
		createUserDeviceShortName
	} from '$lib/utils/helpers/deviceIdentity';
	import { getWebAuthnProviderDescription } from '$lib/utils/helpers/webBiometrics';
	import { checkBiometricAvailability } from '$lib/utils/helpers/biometrics';

	let { authMethod }: { authMethod: string } = $props();

	// Passkey sync state
	let passkeyLoading = $state(false);
	let passkeyError = $state('');
	let passkeySuccess = $state('');
	let passkeyProvider = $state('');
	let hasPasskey = $state(false);
	let passkeyTestLoading = $state(false);
	let biometricsAvailable = $state(false);

	onMount(async () => {
		biometricsAvailable = await checkBiometricAvailability();
		passkeyProvider = getWebAuthnProviderDescription();
	});

	async function setupPasskey() {
		try {
			passkeyLoading = true;
			passkeyError = '';
			passkeySuccess = '';

			const biometricData = $appStore.biometricData;

			if (!biometricData) {
				throw new Error($t('settings.passkey.error.keys'));
			}

			// Parse the biometric data to get the keys
			const { key: exportedKey } = JSON.parse(biometricData.password);
			const publicKey = biometricData.username;

			// Create a custom name for the passkey
			const deviceId = await getDeviceIdentifier();
			const deviceName = await createUserDeviceShortName(publicKey);

			// Set up the WebAuthn passkey using the existing keys
			const credentialId = await setBiometricKey(publicKey, exportedKey, 'passkey', deviceName);
			// Device credential id will be updated in backend, so we need to register a new native passkey
			await setBiometricKey(publicKey, exportedKey, 'biometrics', deviceName, credentialId);

			// Register the passkey device with the backend
			await authService.registerPasskeyDevice(publicKey, deviceId, deviceName, credentialId);

			passkeySuccess = $t('settings.passkey.success');
			hasPasskey = true;
		} catch (err: unknown) {
			console.error('Failed to setup passkey:', err);
			passkeyError = err instanceof Error ? err.message : $t('settings.passkey.error.setup');
		} finally {
			passkeyLoading = false;
		}
	}

	async function testPasskey() {
		try {
			passkeyTestLoading = true;
			passkeyError = '';

			// Try to authenticate using the passkey
			const passkeyData = await getBiometricData('passkey', true);
			if (passkeyData) {
				passkeySuccess = $t('settings.passkey.test.success');
			} else {
				throw new Error($t('settings.passkey.test.error'));
			}
		} catch (err: unknown) {
			console.error('Passkey test failed:', err);
			passkeyError = err instanceof Error ? err.message : $t('settings.passkey.test.error');
		} finally {
			passkeyTestLoading = false;
		}
	}
</script>

<!-- Passkey Sync Section -->
{#if authMethod !== 'alby' && biometricsAvailable}
	<div class="card bg-base-100 mb-6 shadow-xl">
		<div class="card-body">
			<div class="mb-1 flex items-center gap-2">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					fill="none"
					viewBox="0 0 24 24"
					stroke-width="1.5"
					stroke="currentColor"
					class="size-5"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						d="M15.75 5.25a3 3 0 0 1 3 3m3 0a6 6 0 0 1-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1 1 21.75 8.25Z"
					/>
				</svg>
				<h4 class="card-title">{$t('settings.passkey.title')}</h4>
			</div>
			<!-- {#if hasPasskey}
						<div class="badge badge-success">
							<svg
								xmlns="http://www.w3.org/2000/svg"
								class="mr-1 h-4 w-4"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M5 13l4 4L19 7"
								/>
							</svg>
							{$t('settings.passkey.already.setup')}
						</div>
					{/if} -->

			<p class="text-base-content/70 mb-4">
				{$t('settings.passkey.description')}
			</p>

			{#if passkeyProvider}
				<p class="text-info mb-4 text-sm">
					{$t('settings.passkey.provider')}: {passkeyProvider}
				</p>
			{/if}

			<div class="mb-4 flex flex-col gap-4 sm:flex-row">
				{#if !hasPasskey}
					<button class="btn btn-primary" onclick={setupPasskey} disabled={passkeyLoading}>
						{#if passkeyLoading}
							<span class="loading loading-spinner loading-sm"></span>
							{$t('settings.passkey.setting')}
						{:else}
							<svg
								xmlns="http://www.w3.org/2000/svg"
								class="mr-2 h-5 w-5"
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
							{$t('settings.passkey.setup')}
						{/if}
					</button>
				{:else}
					<button class="btn btn-outline" onclick={testPasskey} disabled={passkeyTestLoading}>
						{#if passkeyTestLoading}
							<span class="loading loading-spinner loading-sm"></span>
						{:else}
							<svg
								xmlns="http://www.w3.org/2000/svg"
								class="mr-2 h-5 w-5"
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
						{/if}
						{$t('settings.passkey.test')}
					</button>
				{/if}
			</div>

			{#if passkeySuccess}
				<div class="alert alert-success alert-outline mb-4">
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
							d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
						/>
					</svg>
					<span>{passkeySuccess}</span>
				</div>
			{/if}

			{#if passkeyError}
				<div class="alert alert-error alert-outline mb-4 overflow-hidden">
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
					<span class="overflow-wrap-anywhere break-all whitespace-normal">{passkeyError}</span>
				</div>
			{/if}

			<!-- Information Notice -->
			<div class="alert alert-info alert-outline">
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
						d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
					/>
				</svg>
				<div class="text-sm">
					<p class="font-semibold">{$t('settings.passkey.notice.title')}</p>
					<p>
						{$t('settings.passkey.notice.description')}
					</p>
				</div>
			</div>
		</div>
	</div>
{/if}
