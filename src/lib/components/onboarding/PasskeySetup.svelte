<script lang="ts">
	import type { BiometricPlatform } from '$lib/utils/helpers/biometricErrorHandler';
	import type { ErrorType } from '$lib/components/ErrorTroubleshootingModal.svelte';
	import { t } from 'svelte-i18n';
	import { Buffer } from 'buffer';
	import { nip19 } from 'nostr-tools';
	import { authState } from '$lib/stores/auth.store';
	import { bytesToHex } from '$lib/utils/helpers/encoding';
	import { encryptMasterKeyData } from '$lib/utils/helpers/auth';
	import { generateSecretKey, getPublicKey } from 'nostr-tools/pure';
	import { setWebBiometricKey } from '$lib/utils/helpers/webBiometrics';
	import { getErrorModalData } from '$lib/utils/helpers/showErrorModal';
	import { detectErrorType } from '$lib/utils/helpers/errorTypeDetector';
	import { checkBiometricAvailability, setBiometricKey } from '$lib/utils/helpers/biometrics';
	import { deriveWalletFromNostr } from '$lib/utils/helpers/crypto';
	import {
		createUserDeviceShortName,
		getDeviceIdentifier
	} from '$lib/utils/helpers/deviceIdentity';
	import IconCheck from '~icons/mdi/check-circle-outline';
	import authService from '$lib/api/services/auth.service';
	import ErrorAlertWithModal from '$lib/components/ErrorAlertWithModal.svelte';

	// Polyfill Buffer
	if (typeof window !== 'undefined') {
		(globalThis as any).Buffer = Buffer;
	}

	let {
		nextStep,
		prevStep,
		currentStep,
		totalSteps,
		userData
	}: {
		nextStep: () => void;
		prevStep: () => void;
		currentStep: number;
		totalSteps: number;
		userData: {
			username: string;
			nsec: string;
			hasNostrKey: boolean;
			recoveryEmail: string;
			recoveryPassword: string;
			hasRecovery: boolean;
		};
	} = $props();

	// Status indicators
	let isLoading = $state(false);
	let isSetupComplete = $state(false);
	let error = $state('');
	let errorType = $state<ErrorType | undefined>(undefined);

	async function generateKeyPair() {
		const sk = generateSecretKey();
		const npub = getPublicKey(sk);
		const nsec = bytesToHex(sk);
		return { npub, nsec };
	}

	/**
	 * Register a new user with master key biometric authentication (Nostr + Wallet)
	 */
	async function register(username: string, npub: string, nsec: string, mnemonic: string) {
		try {
			const deviceId = await getDeviceIdentifier();

			// Only run in browser environment to avoid Buffer issues
			if (typeof Buffer === 'undefined') {
				throw new Error('Buffer is not defined');
			}

			// Create master key encryption for both Nostr and wallet
			const { encryptedData, exportedKey } = await encryptMasterKeyData(nsec, mnemonic, nsec);

			// Check available authentication methods
			const isMobileBiometrics = await checkBiometricAvailability();

			const deviceName = await createUserDeviceShortName(npub);

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
				} catch (biometricError: any) {
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
			} else {
				try {
					credentialData = await setWebBiometricKey({ npub, exportedKey, username });
				} catch (biometricError: any) {
					// Process error for troubleshooting modal
					const platform: BiometricPlatform = 'web';
					const { errorMessage: msg, errorType: type } = await getErrorModalData({
						error: biometricError,
						platform
					});

					error = msg;
					errorType = type;

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
				appVersion: __APP_VERSION__
			});

			if (response && response.access_token) {
				// Store master key data in biometric format for compatibility
				const biometricData = {
					npub,
					deviceId,
					deviceName,
					encryptedData,
					exportedKey,
					credentialId: credentialData.credentialId,
					isLegacyFormat: false
				};
				authState.setupAuthData(
					response.access_token,
					'passkey',
					npub,
					response.user,
					biometricData,
					false
				);
			}
		} catch (err: unknown) {
			error =
				err instanceof Error
					? err.message
					: $t('onboarding_auth.form.passkey_setup.errors.setup_failed');
			throw new Error(error);
		}
	}

	async function handlePasskeySetup() {
		try {
			isLoading = true;
			error = '';
			errorType = undefined;

			let npub: string;
			let nsec: string;

			// Use existing key or generate new one
			if (userData.hasNostrKey && userData.nsec) {
				// Convert nsec to hex format
				const { type, data } = nip19.decode(userData.nsec);
				if (type !== 'nsec') {
					error = 'Invalid nsec format';
					errorType = detectErrorType(error);
					throw new Error(error);
				}
				// Convert Uint8Array to hex
				nsec = bytesToHex(data);
				// Get public key
				npub = getPublicKey(data);
			} else {
				// Generate key pair
				({ npub, nsec } = await generateKeyPair());
			}

			// Generate wallet mnemonic
			const walletMnemonic = await deriveWalletFromNostr(nsec);

			// Register with passkey
			await register(userData.username, npub, nsec, walletMnemonic);

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
	<div class="card-body">
		<!-- Educational Header -->
		<div class="education-header mb-6 text-center">
			<div class="step-indicator text-primary mb-2 text-end text-sm font-medium">
				{$t('onboarding_auth.form.passkey_setup.step')}
				{currentStep + 1}
				{$t('onboarding_auth.form.passkey_setup.of')}
				{totalSteps}
			</div>
			<h3 class="step-title mt-4 mb-3">{$t('onboarding_auth.form.passkey_setup.title')}</h3>
			<h5 class="mb-3">{$t('onboarding_auth.form.passkey_setup.subtitle')}</h5>
			<p class="step-description text-base-content mx-auto mb-6 max-w-lg text-lg">
				{@html $t('onboarding_auth.form.passkey_setup.description')}
			</p>

			<!-- Features List -->
			<div class="features-list mx-auto mb-6 w-fit space-y-2 text-left">
				<div class="feature-item flex items-center justify-start gap-2 text-lg">
					<IconCheck class="text-primary min-w-[1.5em]" />
					<span>{@html $t('onboarding_auth.form.passkey_setup.features.secure')}</span>
				</div>
				<div class="feature-item flex items-center justify-start gap-2 text-lg">
					<IconCheck class="text-primary min-w-[1.5em]" />
					<span>{@html $t('onboarding_auth.form.passkey_setup.features.encrypted')}</span>
				</div>
				<div class="feature-item flex items-center justify-start gap-2 text-lg">
					<IconCheck class="text-primary min-w-[1.5em]" />
					<span>{@html $t('onboarding_auth.form.passkey_setup.features.private')}</span>
				</div>
				<div class="feature-item mb-6 flex items-center justify-start gap-2 text-lg">
					<IconCheck class="text-primary min-w-[1.5em]" />
					<span>{@html $t('onboarding_auth.form.passkey_setup.features.easy')}</span>
				</div>

				<p class="text-primary mb-6 text-center text-lg font-medium">
					{$t('onboarding_auth.form.passkey_setup.next_gen_login')}
				</p>

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
							class="mx-auto mb-6 max-w-lg"
						/>
					</div>
				{/if}

				{#if isSetupComplete}
					<div class="alert alert-success alert-outline mx-auto mb-6 max-w-lg">
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
		</div>

		<!-- Form Actions -->
		<div class="mt-6 flex justify-between">
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
