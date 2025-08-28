<script lang="ts">
    import IconCheck from '~icons/mdi/check-circle-outline';
	import type { AccountRecoveryData } from '$lib/types/auth';
	import { nip19 } from 'nostr-tools';
	import { appStore } from '$lib/stores/app.store';
	import { authState } from '$lib/stores/auth.store';
	import { encryptNsec, encryptRecoveryNsec } from '$lib/utils/helpers/auth';
	import { bytesToHex } from '$lib/utils/helpers/encoding';
	import { generateSecretKey, getPublicKey } from 'nostr-tools/pure';
	import { setWebBiometricKey } from '$lib/utils/helpers/webBiometrics';
	import {
		createUserDeviceShortName,
		getDeviceIdentifier
	} from '$lib/utils/helpers/deviceIdentity';
	import { checkBiometricAvailability, setBiometricKey } from '$lib/utils/helpers/biometrics';
	import authService from '$lib/api/services/auth.service';
	import { t } from 'svelte-i18n';

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
	let error = $state('');
	let isSetupComplete = $state(false);

	async function generateKeyPair() {
		const sk = generateSecretKey();
		const npub = getPublicKey(sk);
		const nsec = bytesToHex(sk);
		return { npub, nsec };
	}

	/**
	 * Register a new user with biometric authentication
	 */
	async function register(username: string, npub: string, nsec: string) {
		try {
			const deviceId = await getDeviceIdentifier();

			// Encrypt the private key with device ID as the password
			const { encrypted, salt, exportedKey, iterations } = await encryptNsec(nsec, deviceId);

			// Check available authentication methods
			const isMobileBiometrics = await checkBiometricAvailability();

			const deviceName = await createUserDeviceShortName(npub);

			// Register device with server
			let credentialId = '';
			if (isMobileBiometrics) {
				credentialId = await setBiometricKey(npub, exportedKey, 'biometrics', deviceName);
			} else {
				credentialId = await setWebBiometricKey(npub, exportedKey, deviceName);
			}

			if (!credentialId) {
				throw new Error('Failed to get credential ID');
			}

			// Register with server
			await authService
				.registerWithNostr({
					username,
					publicKey: npub,
					encryptedPrivateKey: encrypted.data,
					iv: encrypted.iv,
					salt: salt,
					authTag: encrypted.authTag,
					iterations,
					authMethod: 'passkey',
					deviceId
				})
				.then(async () => {
					await authService.registerPasskeyDevice(npub, deviceId, deviceName, credentialId);
				});

			const response = await authService.loginWithPasskey(npub, deviceId);
			if (response && response.access_token) {
				const biometricData = {
					username: npub,
					password: JSON.stringify({
						key: exportedKey,
						data: encrypted.data,
						iv: encrypted.iv,
						authTag: encrypted.authTag,
						salt
					}),
					server: deviceId
				};
				authState.setupAuthData(
					response.access_token,
					'biometrics',
					npub,
					response.user,
					biometricData,
					false
				);
			}
		} catch (err: unknown) {
			console.error('Registration failed:', err);
			error = err instanceof Error ? err.message : $t('onboarding_auth.form.passkey_setup.errors.setup_failed');
			throw new Error(error);
		}
	}

	async function setupAccRecovery(npub: string, nsec: string, password: string, email: string) {
		try {
			const { encrypted } = await encryptRecoveryNsec(nsec, password);

			const data: AccountRecoveryData = {
				publicKey: npub,
				recoveryPrivateKey: encrypted,
				email
			};

			await authService.setupAccountRecoveryPassword(data);
		} catch (err: unknown) {
			appStore.showErrorToast(
				err instanceof Error ? err.message : 'Failed to setup account recovery'
			);
		}
	}

	async function handlePasskeySetup() {
		try {
			isLoading = true;
			error = '';

			let pubKey: string;
			let privKey: string;

			// Use existing key or generate new one
			if (userData.hasNostrKey && userData.nsec) {
				// Convert nsec to hex format
				const { type, data } = nip19.decode(userData.nsec);
				if (type !== 'nsec') {
					throw new Error('Invalid nsec format');
				}
				// Convert Uint8Array to hex
				privKey = bytesToHex(data);
				// Get public key
				pubKey = getPublicKey(data);
			} else {
				// Generate key pair
				({ npub: pubKey, nsec: privKey } = await generateKeyPair());
			}

            console.log(userData)
			// Register with passkey
			await register(userData.username, pubKey, privKey);

			// Setup recovery if enabled
			if (userData.hasRecovery && userData.recoveryEmail && userData.recoveryPassword) {
				await setupAccRecovery(pubKey, privKey, userData.recoveryPassword, userData.recoveryEmail);
			}

			isSetupComplete = true;

			// Small delay before proceeding to next step
			setTimeout(() => nextStep(), 1500);
		} catch (err: unknown) {
			console.error('Passkey setup failed:', err);
			error = err instanceof Error ? err.message : $t('onboarding_auth.form.passkey_setup.errors.setup_failed');
		} finally {
			isLoading = false;
		}
	}
</script>

<div class="card bg-base-100 w-full shadow-xl">
	<div class="card-body">
		<!-- Educational Header -->
		<div class="education-header mb-6 text-center">
			<div class="step-indicator text-primary mb-2 text-sm font-medium text-end">
				{$t('onboarding_auth.form.passkey_setup.step')} {currentStep + 1} {$t('onboarding_auth.form.passkey_setup.of')} {totalSteps}
			</div>
			<h3 class="step-title mb-3 mt-4">{$t('onboarding_auth.form.passkey_setup.title')}</h3>
            <h5 class="mb-3">{$t('onboarding_auth.form.passkey_setup.subtitle')}</h5>
            <p class="step-description text-base-content mb-6 text-lg max-w-lg mx-auto">
                {@html $t('onboarding_auth.form.passkey_setup.description')}
            </p>

			<!-- Features List -->
            <div class="features-list mb-6 space-y-2 text-left mx-auto w-fit">
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
                <div class="feature-item flex items-center justify-start gap-2 text-lg mb-6">
                    <IconCheck class="text-primary min-w-[1.5em]" />
                    <span>{@html $t('onboarding_auth.form.passkey_setup.features.easy')}</span>
                </div>

				<p class="text-primary mb-6 text-lg font-medium text-center">{$t('onboarding_auth.form.passkey_setup.next_gen_login')}</p>

				{#if error}
					<div class="alert alert-error alert-outline mb-6 max-w-lg mx-auto">
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
						<span class="whitespace-normal">{error}</span>
					</div>
				{/if}

				{#if isSetupComplete}
					<div class="alert alert-success alert-outline mb-6 max-w-lg mx-auto">
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
				<button type="button" class="btn btn-primary" onclick={nextStep}> {$t('onboarding_auth.form.passkey_setup.continue')} </button>
			{/if}
		</div>
	</div>
</div>
