<script lang="ts">
	import IconCheck from '~icons/mdi/check-circle-outline';
	import type { AccountRecoveryData } from '$lib/types/auth';
	import { nip19 } from 'nostr-tools';
	import { appStore } from '$lib/stores/app.store';
	import { authState } from '$lib/stores/auth.store';
	import { encryptMasterKeyData } from '$lib/utils/helpers/auth';
	import { bytesToHex } from '$lib/utils/helpers/encoding';
	import { generateSecretKey, getPublicKey } from 'nostr-tools/pure';
	import { generateMnemonic } from 'bip39';
	import { setWebBiometricKey } from '$lib/utils/helpers/webBiometrics';
	import {
		createUserDeviceShortName,
		getDeviceIdentifier
	} from '$lib/utils/helpers/deviceIdentity';
	import { checkBiometricAvailability, setBiometricKey } from '$lib/utils/helpers/biometrics';
	import authService from '$lib/api/services/auth.service';
	import { t } from 'svelte-i18n';
	import { Buffer } from 'buffer';
	import ErrorTroubleshootingModal from '$lib/components/ErrorTroubleshootingModal.svelte';
	import { getErrorModalData } from '$lib/utils/helpers/showErrorModal';
	import { detectErrorType } from '$lib/utils/helpers/errorTypeDetector';
	import type { BiometricPlatform } from '$lib/utils/helpers/biometricErrorHandler';
	import type { ErrorType } from '$lib/components/ErrorTroubleshootingModal.svelte';
	import IconInformation from '~icons/mdi/information';

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
	let error = $state('');
	let isSetupComplete = $state(false);
	
	// Error modal state
	let showErrorModal = $state(false);
	let errorMessage = $state('');
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
				const errorMsg = 'Buffer is not defined';
				error = errorMsg;
				errorMessage = errorMsg;
				errorType = detectErrorType(errorMsg);
				throw new Error(errorMsg);
			}

			// Create master key encryption for both Nostr and wallet
			const masterKeyData = await encryptMasterKeyData(nsec, mnemonic, deviceId);

			// Check available authentication methods
			const isMobileBiometrics = await checkBiometricAvailability();

			const deviceName = await createUserDeviceShortName(npub);

			// Validate username and provide fallback to deviceName if invalid
			// This ensures we always have a valid name for the passkey
			const passkeyName = username?.trim() || deviceName;

			// Register device with server using master key
			// Use username for passkey naming so it appears in password managers
			let credentialId = '';
			if (isMobileBiometrics) {
				try {
					credentialId = await setBiometricKey(
						npub,
						masterKeyData.exportedMasterKey,
						'biometrics',
						passkeyName
					);
				} catch (biometricError: any) {
					// Process error for troubleshooting modal
					const platform: BiometricPlatform = 'mobile-native';
					const { errorMessage: msg, errorType: type } = await getErrorModalData({
						error: biometricError,
						platform
					});
					
					// Set error state
					error = msg;
					errorMessage = msg;
					errorType = type;
					
					// Auto-show modal for critical errors
					const criticalErrors: ErrorType[] = ['biometric', 'hardware', 'permission'];
					if (type && criticalErrors.includes(type)) {
						showErrorModal = true;
					}
					
					// Re-throw to stop registration
					throw biometricError;
				}
			} else {
				try {
					credentialId = await setWebBiometricKey(npub, masterKeyData.exportedMasterKey, passkeyName);
				} catch (biometricError: any) {
					// Process error for troubleshooting modal
					const platform: BiometricPlatform = 'web';
					const { errorMessage: msg, errorType: type } = await getErrorModalData({
						error: biometricError,
						platform
					});
					
					error = msg;
					errorMessage = msg;
					errorType = type;
					
					// Auto-show modal for critical errors
					const criticalErrors: ErrorType[] = ['biometric', 'hardware', 'permission'];
					if (type && criticalErrors.includes(type)) {
						showErrorModal = true;
					}
					
					throw biometricError;
				}
			}

			if (!credentialId) {
				const errorMsg = 'Failed to get credential ID';
				error = errorMsg;
				errorMessage = errorMsg;
				errorType = detectErrorType(errorMsg);
				throw new Error(errorMsg);
			}

			// Register with server using master key GraphQL mutation
			await authService
				.registerWithMasterKey({
					username,
					publicKey: npub,
					masterKeyData: masterKeyData,
					authMethod: 'passkey',
					deviceId
				})
				.then(async () => {
					// Register passkey device
					await authService.registerPasskeyDevice(npub, deviceId, deviceName, credentialId);
				});

			const response = await authService.loginWithPasskey(npub, deviceId);
			if (response && response.access_token) {
				// Store master key data in biometric format for compatibility
				const biometricData = {
					username: npub,
					password: JSON.stringify({
						key: masterKeyData.exportedMasterKey,
						masterKeyData: masterKeyData, // Store full master key structure
						// Legacy compatibility fields
						data: masterKeyData.nostr.encrypted.data,
						iv: masterKeyData.nostr.encrypted.iv,
						authTag: masterKeyData.nostr.encrypted.authTag,
						salt: masterKeyData.nostr.salt
					}),
					server: deviceId,
					isLegacyFormat: false
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
			// Only set generic error if not already set by biometric error handler
			if (!error) {
				const errorMsg = err instanceof Error
					? err.message
					: $t('onboarding_auth.form.passkey_setup.errors.setup_failed');
				error = errorMsg;
				// For non-biometric errors, also set errorMessage for modal
				if (!errorMessage) {
					errorMessage = errorMsg;
				}
			}
			throw new Error(error);
		}
	}

	async function setupAccRecovery(
		npub: string,
		nsec: string,
		walletMnemonic: string,
		password: string,
		email: string
	) {
		try {
			const recoveryData = await encryptMasterKeyData(nsec, walletMnemonic, password);

			const data: AccountRecoveryData = {
				publicKey: npub,
				recoveryData: {
					nostr: recoveryData.nostr,
					wallet: recoveryData.wallet,
					masterSalt: recoveryData.masterSalt
				},
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
			showErrorModal = false;
			errorMessage = '';
			errorType = undefined;

			let npub: string;
			let nsec: string;

			// Use existing key or generate new one
			if (userData.hasNostrKey && userData.nsec) {
				// Convert nsec to hex format
				const { type, data } = nip19.decode(userData.nsec);
				if (type !== 'nsec') {
					const errorMsg = 'Invalid nsec format';
					error = errorMsg;
					errorMessage = errorMsg;
					errorType = detectErrorType(errorMsg);
					throw new Error(errorMsg);
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
			const walletMnemonic = generateMnemonic();

			// Register with passkey
			await register(userData.username, npub, nsec, walletMnemonic);

			// Setup recovery if enabled
			if (userData.hasRecovery && userData.recoveryEmail && userData.recoveryPassword) {
				await setupAccRecovery(npub, nsec, walletMnemonic, userData.recoveryPassword, userData.recoveryEmail);
			}

			isSetupComplete = true;

			// Small delay before proceeding to next step
			setTimeout(() => nextStep(), 1500);
		} catch (err: unknown) {
			console.error('Passkey setup failed:', err);
			// Error already set by register() function for biometric errors
			if (!error) {
				const errorMsg = err instanceof Error
					? err.message
					: $t('onboarding_auth.form.passkey_setup.errors.setup_failed');
				error = errorMsg;
				// For non-biometric errors, also set errorMessage for modal
				if (!errorMessage) {
					errorMessage = errorMsg;
					// Try to detect error type for non-biometric errors
					errorType = detectErrorType(errorMsg);
				}
			}
		} finally {
			isLoading = false;
		}
	}
</script>

<div class="card bg-base-100 w-full shadow-xl">
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
					<div class="alert alert-outline alert-error mx-auto mb-6 max-w-lg">
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="h-4 w-4 sm:h-5 sm:w-5 shrink-0 stroke-current"
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
						<div class="flex-1 min-w-0">
							<h4 class="font-bold text-[10px] sm:text-xs whitespace-nowrap mb-1.5">
								{$t('onboarding_auth.form.passkey_setup.errors.title')}
							</h4>
							<div class="text-[10px] sm:text-xs whitespace-normal pr-2">{error}</div>
						</div>
						<div class="flex items-start shrink-0 ml-2">
							<!-- "Get Help" Button - Opens Troubleshooting Modal -->
							<button
								class="btn btn-sm btn-primary gap-1.5 sm:gap-2 shadow-sm hover:shadow-md active:scale-95 transition-all cursor-pointer"
								onclick={() => {
									if (errorMessage) {
										showErrorModal = true;
									} else {
										// If no errorMessage set, create one from error
										errorMessage = error;
										showErrorModal = true;
									}
								}}
								title={$t('common.components.error_troubleshooting_modal.button_title')}
								type="button"
							>
								<IconInformation class="h-4 w-4 shrink-0" />
								<span class="hidden sm:inline text-xs sm:text-sm font-medium">
									{$t('common.components.error_troubleshooting_modal.troubleshoot')}
								</span>
								<span class="sm:hidden text-xs font-medium">Help</span>
							</button>
						</div>
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

<!-- Error Troubleshooting Modal -->
{#if showErrorModal && errorMessage}
	<ErrorTroubleshootingModal
		{errorMessage}
		{errorType}
		showButton={false}
		open={showErrorModal}
		onClose={() => {
			showErrorModal = false;
		}}
	/>
{/if}
