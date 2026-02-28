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
	import authService from '$lib/api/services/auth.service';
	import { resolveHandle } from '$lib/utils/helpers/handleResolver';
	import ErrorAlertWithModal from '$lib/components/ErrorAlertWithModal.svelte';
	import ErrorTroubleshootingModal from '$lib/components/ErrorTroubleshootingModal.svelte';
	import IconInformation from '~icons/mdi/information';

	// Polyfill Buffer
	if (typeof window !== 'undefined') {
		(globalThis as typeof globalThis & { Buffer: typeof Buffer }).Buffer = Buffer;
	}

	// currentStep/totalSteps accepted for parent API but not used in this step
	let {
		nextStep,
		prevStep,
		userData,
		currentStep: _currentStep,
		totalSteps: _totalSteps
	}: {
		nextStep: () => void;
		prevStep: () => void;
		userData: {
			displayName: string;
			nsec: string;
			hasNostrKey: boolean;
		};
		currentStep: number;
		totalSteps: number;
	} = $props();
	void _currentStep;
	void _totalSteps;

	// Status indicators
	let isLoading = $state(false);
	let isSetupComplete = $state(false);
	let error = $state('');
	let errorType = $state<ErrorType | undefined>(undefined);
	let showLearnMoreModal = $state(false);

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
			} else {
				try {
					credentialData = await setWebBiometricKey({ npub, exportedKey, username });
				} catch (biometricError: unknown) {
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
				await authState.setupAuthData(
					response.access_token,
					'passkey',
					npub,
					response.user,
					biometricData,
					false,
					credentialData.credentialId
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

			let npubHex: string;
			let nsec: string;

			// Use existing key or generate new one (npubHex is public key in hex)
			if (userData.hasNostrKey && userData.nsec) {
				const { type, data } = nip19.decode(userData.nsec);
				if (type !== 'nsec') {
					error = 'Invalid nsec format';
					errorType = detectErrorType(error);
					throw new Error(error);
				}
				nsec = bytesToHex(data);
				npubHex = getPublicKey(data);
			} else {
				const pair = await generateKeyPair();
				npubHex = pair.npub;
				nsec = pair.nsec;
			}

			// Derive handle invisibly (NIP-05 + email compatible; uniqueness via npub suffix)
			const checkAvailable = (handle: string): Promise<boolean> =>
				(
					authService as { checkUsernameAvailability: (username: string) => Promise<boolean> }
				).checkUsernameAvailability(handle);
			const handle = await resolveHandle(userData.displayName, npubHex, checkAvailable);

			const walletMnemonic = await deriveWalletFromNostr(nsec);

			// Register with passkey using derived handle as username
			await register(handle, npubHex, nsec, walletMnemonic);

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
