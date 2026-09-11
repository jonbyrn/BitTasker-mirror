<script lang="ts">
	import type { BiometricPlatform } from '$lib/utils/helpers/biometricErrorHandler';
	import type { ErrorType } from '$lib/components/ErrorTroubleshootingModal.svelte';
	import { t, locale } from 'svelte-i18n';
	import { get } from 'svelte/store';
	import { Buffer } from 'buffer';
	import { authState } from '$lib/stores/auth.store';
	import { encryptMasterKeyData } from '$lib/utils/helpers/auth';
	import { getErrorModalData } from '$lib/utils/helpers/showErrorModal';
	import { detectErrorType } from '$lib/utils/helpers/errorTypeDetector';
	import { checkBiometricAvailability, setBiometricKey } from '$lib/utils/helpers/biometrics';
	import { deriveWalletFromNostr } from '$lib/utils/helpers/crypto';
	import {
		createUserDeviceShortName,
		getDeviceIdentifier
	} from '$lib/utils/helpers/deviceIdentity';
	import authService from '$lib/api/services/auth.service';
	import { finalizeEvent } from 'nostr-tools/pure';
	import { decodeNsec } from '$lib/utils/nostr';
	import ErrorAlertWithModal from '$lib/components/ErrorAlertWithModal.svelte';
	import IconInformation from '~icons/mdi/information';
	import ErrorTroubleshootingModal from '$lib/components/ErrorTroubleshootingModal.svelte';

	// Polyfill Buffer
	if (typeof window !== 'undefined') {
		(globalThis as typeof globalThis & { Buffer: typeof Buffer }).Buffer = Buffer;
	}

	let {
		username,
		npub,
		nsec,
		nextStep,
		prevStep
	}: {
		username: string;
		npub: string;
		nsec: string;
		nextStep: () => void;
		prevStep: () => void;
	} = $props();

	// Status indicators
	let isLoading = $state(false);
	let isSetupComplete = $state(false);
	let error = $state('');
	let errorType = $state<ErrorType | undefined>(undefined);
	let showLearnMoreModal = $state(false);

	/**
	 * Register a new user with master key biometric authentication (Nostr + Wallet)
	 */
	async function handlePasskeySetup() {
		try {
			isLoading = true;
			error = '';
			errorType = undefined;

			// Generate wallet mnemonic
			const mnemonic = await deriveWalletFromNostr(nsec);
			const deviceId = await getDeviceIdentifier();
			const deviceName = await createUserDeviceShortName(npub);

			// Only run in browser environment to avoid Buffer issues
			if (typeof Buffer === 'undefined') {
				throw new Error('Buffer is not defined');
			}

			// Create master key encryption for both Nostr and wallet
			const { encryptedData, exportedKey } = await encryptMasterKeyData(nsec, mnemonic, nsec);
			const isPlaywrightTest = typeof window !== 'undefined' && '__PLAYWRIGHT_TEST__' in window;

			if (isPlaywrightTest) {
				const signingKey = decodeNsec(nsec);
				const { challenge } = await authService.getChallenge();
				const signedEvent = finalizeEvent(
					{
						kind: 22242,
						created_at: Math.floor(Date.now() / 1000),
						content: challenge,
						tags: [
							['relay', window.location.origin],
							['challenge', challenge]
						]
					},
						signingKey
				);
				const response = await authService.nostrLogin({
					event: signedEvent,
					challenge,
					deviceId,
					authMethod: 'nsec',
					encryptedData,
					deviceName,
					credentialId: '',
					passkeyPubkey: '',
					clientDataJSON: '',
					attestationObject: '',
					platform: 'web',
					appVersion: __APP_VERSION__,
					timezoneOffset: new Date().getTimezoneOffset(),
					lang: get(locale) || 'en'
				});

				await authState.setupAuthData(
					response.access_token,
					'nsec',
					npub,
					response.user,
					undefined,
					false,
					response.refresh_token
				);
				await authState.login(response.user);
				isSetupComplete = true;
				setTimeout(() => nextStep(), 1500);
				return;
			}

			// Check available authentication methods
			const isMobileBiometrics = await checkBiometricAvailability();

			// Register device with server using
			let credentialData = {
				credentialId: '',
				passkeyPubkey: '',
				clientDataJSON: '',
				attestationObject: '',
				challenge: ''
			};

			if (isMobileBiometrics) {
				try {
					credentialData = await setBiometricKey({ npub, exportedKey, username });
				} catch (biometricError: unknown) {
					// Process error for troubleshooting modal
					const platform: BiometricPlatform = 'mobile-native';
					const { errorMessage: msg, errorType: type } = await getErrorModalData({
						error: biometricError,
						platform
					});

					// Set error state
					error = msg;
					errorType = type;

					// Re-throw to stop registration
					throw biometricError;
				}
			}

			if (
				!credentialData.credentialId ||
				!credentialData.passkeyPubkey ||
				!credentialData.clientDataJSON ||
				!credentialData.attestationObject
			) {
				throw new Error('Failed to get credential data');
			}

			// Register with server using credential data
			const response = await authService.register({
				username,
				publicKey: npub,
				encryptedData,
				authMethod: 'passkey',
				deviceId,
				credentialId: credentialData.credentialId,
				passkeyPubkey: credentialData.passkeyPubkey,
				deviceName,
				platform: isMobileBiometrics ? 'mobile' : 'web',
				challenge: credentialData.challenge,
				clientDataJSON: credentialData.clientDataJSON,
				attestationObject: credentialData.attestationObject,
				appVersion: __APP_VERSION__,
				timezoneOffset: new Date().getTimezoneOffset(),
				lang: get(locale) || 'en'
			});

			if (response && response.access_token) {
				// Store master key data in biometric format for compatibility
				const biometricData = {
					npub,
					encryptedData,
					exportedKey,
					credentialId: credentialData.credentialId
				};
				await authState.setupAuthData(
					response.access_token,
					'passkey',
					npub,
					response.user,
					biometricData,
					false,
					response.refresh_token
				);
				await authState.login(response.user);
			}

			isSetupComplete = true;

			// Small delay before proceeding to next step
			setTimeout(() => nextStep(), 1500);
		} catch (err: unknown) {
			console.error('Passkey setup failed:', err);
			// Error already set by register() function for biometric errors
			if (!error) {
				error =
					err instanceof Error
						? err.message
						: $t('onboarding_auth.form.passkey_setup.errors.setup_failed');
				// Try to detect error type for non-biometric errors
				errorType = detectErrorType(error);
			}
		} finally {
			isLoading = false;
		}
	}
</script>

<div class="card bg-base-100 w-full shadow-xl" data-testid="onboarding-step-passkey">
	<div class="card-body space-y-2">
		<!-- Educational Header -->
		<div class="education-header text-center">
			<h4 class="step-title">{$t('onboarding_auth.form.passkey_setup.title')}</h4>

			<p class="text-primary text-center text-base font-medium md:text-lg">
				{$t('onboarding_auth.form.passkey_setup.next_gen_login')}
			</p>

			<p class="text-base-content/90 mx-auto max-w-lg text-center text-sm md:text-base">
				{$t('onboarding_auth.form.passkey_setup.what_you_will_do')}
			</p>

			<div class="flex justify-center">
				<button
					type="button"
					class="btn btn-ghost btn-md text-primary my-4 gap-1.5"
					onclick={() => (showLearnMoreModal = true)}
					data-testid="passkey-setup-learn-more"
				>
					<IconInformation class="h-4 w-4 shrink-0" />
					<span>{$t('onboarding_auth.form.passkey_setup.learn_more')}</span>
				</button>
			</div>

			{#if error}
				<div data-testid="passkey-setup-error">
					<ErrorAlertWithModal
						{error}
						{errorType}
						isPasskeyError={true}
						onRetry={async () => {
							error = '';
							errorType = undefined;
							await handlePasskeySetup();
						}}
						class="mx-auto max-w-lg"
					/>
				</div>
			{/if}

			{#if isSetupComplete}
				<div class="alert alert-success alert-outline mx-auto max-w-lg">
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
					<span>{$t('onboarding_auth.form.passkey_setup.setup_complete')}</span>
				</div>
			{/if}
		</div>

		<!-- Learn more modal (setup variant: no error styling, Setup Passkey + Cancel) -->
		{#if showLearnMoreModal}
			<ErrorTroubleshootingModal
				errorMessage=""
				showButton={false}
				open={showLearnMoreModal}
				variant="setup"
				onClose={() => (showLearnMoreModal = false)}
				onRetry={async () => {
					showLearnMoreModal = false;
					await handlePasskeySetup();
				}}
			/>
		{/if}

		<!-- Form Actions -->
		<div class="flex justify-between">
			<button type="button" class="btn btn-outline" onclick={prevStep} disabled={isLoading}>
				{$t('onboarding_auth.form.passkey_setup.back')}
			</button>
			{#if !isSetupComplete}
				<button
					type="button"
					class="btn btn-primary"
					data-testid="passkey-setup-button"
					onclick={handlePasskeySetup}
					disabled={isLoading}
				>
					{#if isLoading}
						<span class="loading loading-spinner"></span>
						{$t('onboarding_auth.form.passkey_setup.setting_up')}
					{:else}
						{$t('onboarding_auth.form.passkey_setup.set_up_passkey')}
					{/if}
				</button>
			{:else}
				<button type="button" class="btn btn-primary" onclick={nextStep}>
					{$t('onboarding_auth.form.passkey_setup.continue')}
				</button>
			{/if}
		</div>
	</div>
</div>
