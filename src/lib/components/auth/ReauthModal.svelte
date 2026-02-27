<script lang="ts">
	import { t } from 'svelte-i18n';
	import { goto } from '$app/navigation';
	import { Capacitor } from '@capacitor/core';
	import { authState } from '$lib/stores/auth.store';
	import authService from '$lib/api/services/auth.service';
	import { getWebBiometricData } from '$lib/utils/helpers/webBiometrics';
	import { getBiometricData } from '$lib/utils/helpers/biometrics';
	import { getDeviceIdentifier, createUserDeviceShortName } from '$lib/utils/helpers/deviceIdentity';

	let { allowCredentialIds, currentPath }: { allowCredentialIds: string[]; currentPath: string } =
		$props();

	let verifying = $state(false);
	let error = $state('');

	async function handleReauth() {
		verifying = true;
		error = '';
		try {
			const credentials = Capacitor.isNativePlatform()
				? await getBiometricData(true, allowCredentialIds)
				: await getWebBiometricData(true, allowCredentialIds);

			if (!credentials) {
				error = $t('auth.login.errors.cancelled');
				verifying = false;
				return;
			}

			const deviceId = await getDeviceIdentifier();
			const deviceName = await createUserDeviceShortName(credentials.npub);

			const response = await authService.passkeyLogin({
				npub: credentials.npub,
				challenge: credentials.challenge,
				credentialId: credentials.credentialId,
				deviceId,
				deviceName,
				platform: Capacitor.isNativePlatform() ? 'mobile' : 'web',
				response: credentials.response,
				appVersion: __APP_VERSION__
			});

			if (!response.access_token) {
				throw new Error($t('auth.login.errors.no_token'));
			}

			const biometricData = {
				npub: credentials.npub,
				exportedKey: credentials.exportedKey,
				encryptedData: response.encryptedData
			};

			await authState.setupAuthData(
				response.access_token,
				'passkey',
				credentials.npub,
				response.user,
				biometricData,
				false,
				credentials.credentialId
			);

			goto(currentPath);
		} catch (err) {
			const message = err instanceof Error ? err.message : $t('auth.login.errors.failed');
			error = message;
			verifying = false;
		}
	}

	function handleCancel() {
		authState.logout();
		goto('/auth/login');
	}
</script>

<div class="fixed inset-0 z-50 flex flex-col items-center justify-center bg-base-100 p-6" role="dialog" aria-modal="true" aria-labelledby="reauth-title">
	<div class="card w-full max-w-md bg-base-200 shadow-xl">
		<div class="card-body">
			<h2 id="reauth-title" class="card-title">{$t('auth.reauth.title')}</h2>
			<p class="text-base-content/80">{$t('auth.reauth.message')}</p>
			{#if error}
				<div class="alert alert-outline alert-error">
					<span>{error}</span>
				</div>
			{/if}
			<div class="card-actions mt-4 justify-end gap-2">
				<button
					type="button"
					class="btn btn-ghost"
					disabled={verifying}
					onclick={handleCancel}
				>
					{$t('auth.reauth.cancel')}
				</button>
				<button
					type="button"
					class="btn btn-primary"
					disabled={verifying}
					onclick={handleReauth}
				>
					{#if verifying}
						<span class="loading loading-spinner loading-sm"></span>
						{$t('auth.reauth.verifying')}
					{:else}
						{$t('auth.login.continue_passkey')}
					{/if}
				</button>
			</div>
		</div>
	</div>
</div>
