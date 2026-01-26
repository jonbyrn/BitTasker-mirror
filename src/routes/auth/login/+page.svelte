<script lang="ts">
	import Logo from '$lib/components/Logo.svelte';
	import type { Credentials, MasterKeyEncryptedData } from '$lib/types/auth';
	import type { NostrEvent } from '$lib/types/nostr';
	import { onMount } from 'svelte';
	import { nip19 } from 'nostr-tools';
	import { goto } from '$app/navigation';
	import { t } from 'svelte-i18n';
	import { authState } from '$lib/stores/auth.store';
	import {
		createUserDeviceShortName,
		getDeviceIdentifier,
		getNpubShortId
	} from '$lib/utils/helpers/deviceIdentity';
	import { fetchProfileMetadata } from '$lib/utils/nostr-message';
	import { validateNostrPrivateKey } from '$lib/utils/helpers/validators';
	import {
		decryptNsecWithBiometrics,
		encryptMasterKeyData,
		signLoginChallenge
	} from '$lib/utils/helpers/auth';
	import { generateMnemonic } from 'bip39';
	import {
		checkBiometricAvailability,
		getBiometricData,
		setBiometricKey
	} from '$lib/utils/helpers/biometrics';
	import { finalizeEvent, getPublicKey, validateEvent } from 'nostr-tools/pure';
	import {
		checkWebBiometricAvailability,
		getWebBiometricData,
		setWebBiometricKey,
		getWebAuthnProviderDescription
	} from '$lib/utils/helpers/webBiometrics';
	import { handleBiometricError } from '$lib/utils/helpers/biometricErrorHandler';
	import { Capacitor } from '@capacitor/core';
	import authService from '$lib/api/services/auth.service';
	import { fly } from 'svelte/transition';
	import { linear } from 'svelte/easing';
	import { Buffer } from 'buffer';
	import QrCodeScanner from '$lib/components/QrCodeScanner.svelte';
	import LoginQrCodeScannerModal from '$lib/components/LoginQrCodeScannerModal.svelte';
	import type { Barcode } from '@capacitor-mlkit/barcode-scanning';
	import ErrorAlertWithModal from '$lib/components/ErrorAlertWithModal.svelte';

	// Polyfill Buffer
	if (typeof window !== 'undefined') {
		(globalThis as any).Buffer = Buffer;
	}

	let error = $state('');
	let isLoading = $state(false);
	let isNostrLogin = $state(false);
	let showNsec = $state(false);
	let nsec = $state('');
	let webAuthnProvider = $state('');
	let authMethods = $state({
		biometric: false,
		webAuthn: false
	});
	let isPasskeyError = $state(false);
	let lastAuthMethod = $state<'biometrics' | 'passkey' | null>(null);
	let lastAction = $state<'authenticate' | 'nsecLogin' | null>(null);
	let qrScannerModal: LoginQrCodeScannerModal | null = $state(null);
	let isQrScannerError = $state(false);

	onMount(async () => {
		try {
			// Check available authentication methods
			authMethods.biometric = await checkBiometricAvailability();
			authMethods.webAuthn = await checkWebBiometricAvailability();
			webAuthnProvider = getWebAuthnProviderDescription();
		} catch (err) {
			console.error('Error checking authentication methods:', err);
		}
	});

	/**
	 * Login with biometric authentication
	 */
	async function login(biometricData: Credentials, deviceId: string, authMethod: string) {
		const pubKey = biometricData.username;
		const encryptedData = biometricData.password;

		// Get login challenge from server
		const { challenge } = await authService.getLoginChallenge();

		// Decrypt private key using biometrics
		const privateKey = await decryptNsecWithBiometrics(encryptedData);

		// migrate to master key format if legacy format
		if (biometricData.isLegacyFormat) {
			// Generate wallet mnemonic for both new and existing users
			const walletMnemonic = generateMnemonic();

			const masterKeyData = await encryptMasterKeyData(privateKey, walletMnemonic, deviceId);

			await authService.migrateToMasterKey(pubKey, deviceId, masterKeyData);

			biometricData.password = JSON.stringify({
				key: masterKeyData.exportedMasterKey,
				masterKeyData: masterKeyData,
				data: masterKeyData.nostr.encrypted.data,
				iv: masterKeyData.nostr.encrypted.iv,
				authTag: masterKeyData.nostr.encrypted.authTag,
				salt: masterKeyData.nostr.salt
			});
		}

		// Sign the challenge with the private key
		const signedChallenge = await signLoginChallenge(challenge, privateKey);
		if (!signedChallenge) {
			throw new Error($t('login.errors.challenge_signing'));
		}

		// Login with passkey
		const response = await authService.loginWithPasskey(pubKey, deviceId);

		if (!response.access_token) {
			throw new Error($t('login.errors.no_token'));
		}

		await authState.setupAuthData(
			response.access_token,
			authMethod,
			pubKey,
			response.user,
			biometricData
		);
	}

	async function authenticate(authMethod: 'biometrics' | 'passkey') {
		try {
			isLoading = true;
			error = '';
			isPasskeyError = false;
			lastAuthMethod = authMethod; // Track which method was attempted
			lastAction = 'authenticate'; // Track which action was attempted

			const deviceId = await getDeviceIdentifier();
			let biometricData = null;

			if (authMethods.biometric) {
				biometricData = await getBiometricData(authMethod);
			} else if (authMethods.webAuthn) {
				biometricData = await getWebBiometricData();
			}

			if (biometricData) {
				await login(biometricData, deviceId, authMethod);
			} else {
				error = $t('login.errors.no_account');
				isPasskeyError = true;
			}
		} catch (err: unknown) {
			console.error('Authentication failed:', err);

			// Handle specific WebAuthn cancellation error
			if (err instanceof Error) {
				// Silently ignore "A request is already pending" errors
				if (
					err.message.includes('A request is already pending') ||
					err.message.includes('request is already pending') ||
					err.message === ''
				) {
					// Don't show error for pending requests
					error = '';
					isPasskeyError = false;
				} else {
					// Use biometric error handler to translate error messages
					const platform = Capacitor.getPlatform() === 'web' ? 'web' : 'mobile-webauthn';
					error = await handleBiometricError(err, platform);
					// Check if error is related to passkeys/biometrics
					isPasskeyError =
						error !== '' &&
						(err.message.toLowerCase().includes('passkey') ||
							err.message.toLowerCase().includes('biometric') ||
							err.message.toLowerCase().includes('webauthn') ||
							err.message.toLowerCase().includes('authentication') ||
							err.name === 'NotAllowedError' ||
							err.name === 'NotSupportedError' ||
							err.name === 'SecurityError' ||
							err.name === 'TimeoutError');
				}
			} else {
				error = $t('login.errors.failed');
				isPasskeyError = false;
			}
		} finally {
			isLoading = false;
		}
	}

	// Login with Nostr private key
	async function handleNsecLogin() {
		try {
			isLoading = true;
			error = '';
			isPasskeyError = false;
			lastAction = 'nsecLogin'; // Track which action was attempted

			// Only run in browser environment to avoid Buffer issues
			if (typeof Buffer === 'undefined') {
				throw new Error('Buffer is not defined');
			}

			const { challenge } = await authService.getLoginChallenge();

			const validation = validateNostrPrivateKey(nsec);
			if (!validation.isValid) {
				error = validation.error!;
				return;
			}

			let npub = '';
			let privateKey: Uint8Array<ArrayBufferLike>;

			try {
				// Convert nsec to hex format
				const { type, data } = nip19.decode(nsec);
				if (type !== 'nsec') {
					error = 'Invalid nsec format';
					return;
				}
				// Convert Uint8Array to hex
				privateKey = data;
				// Get public key
				npub = getPublicKey(data);
			} catch (err) {
				error = 'Invalid private key';
				return;
			}

			if (!npub) {
				error = 'Invalid private key';
				return;
			}

			const event: NostrEvent = {
				kind: 22242,
				created_at: Math.floor(Date.now() / 1000),
				content: challenge,
				tags: [
					['relay', window.location.origin],
					['challenge', challenge]
				],
				pubkey: npub
			};

			const signedEvent = finalizeEvent(event, privateKey);
			if (!validateEvent(signedEvent)) {
				throw new Error('Invalid event');
			}

			let deviceId = await getDeviceIdentifier();

			// Use legacy login first to check if user exists and get isNewUser flag
			// TODO: To be removed once all users are migrated to master key format

			const walletMnemonic = generateMnemonic();
			let masterKeyData: MasterKeyEncryptedData = await encryptMasterKeyData(
				nsec,
				walletMnemonic,
				deviceId
			);

			// Login with nostr, register user if it does not exist
			const res = await authService.loginWithNostr({
				event: signedEvent,
				challenge,
				authMethod: 'passkey',
				deviceId,
				masterKeyData
			});

			if (res.access_token) {
				// Determine passkey name with priority: username → display name → npub short ID
				let passkeyName: string;
				
				// Priority 1: Username from API response
				if (res.user.username?.trim()) {
					passkeyName = res.user.username.trim();
				} else {
					// Convert hex npub to npub format once for both profile fetch and short ID
					const npubFormatted = nip19.npubEncode(npub);
					
					// Priority 2: Fetch display name from Nostr profile
					let nostrDisplayName: string | undefined;
					try {
						const profile = await fetchProfileMetadata(npubFormatted);
						nostrDisplayName = profile.name?.trim();
					} catch (err) {
						console.warn('Could not fetch Nostr profile for passkey name:', err);
						// Continue with fallback
					}
					
					if (nostrDisplayName) {
						passkeyName = nostrDisplayName;
					} else {
						// Priority 3: First 6 characters after "npub" from npub
						const npubShortId = getNpubShortId(npubFormatted);
						passkeyName = npubShortId || await createUserDeviceShortName(npub);
					}
				}
				
				const deviceName = await createUserDeviceShortName(npub);
				let credentialId = '';

				// Check if we're in a test environment (E2E tests)
				const isTestEnvironment =
					typeof window !== 'undefined' && (window as any).__PLAYWRIGHT_TEST__;

				if (!res.isNewUser) {
					if (
						res.user.nostrKey &&
						res.user.nostrKey?.keyDerivationMethod === 'master-key' &&
						res.user.nostrKey?.masterKeyEncrypted
					) {
						masterKeyData = {
							nostr: res.user.nostrKey?.masterKeyEncrypted.nostr,
							wallet: res.user.nostrKey?.masterKeyEncrypted.wallet,
							masterSalt: res.user.nostrKey?.masterSalt,
							exportedMasterKey: res.user.nostrKey?.exportedMasterKey
						};

						// Store master key data in biometrics (skip in test environments to avoid passkey prompts)
						if (!isTestEnvironment) {
							if (authMethods.biometric) {
								credentialId = await setBiometricKey(
									npub,
									masterKeyData.exportedMasterKey,
									'biometrics',
									passkeyName
								);
							} else if (authMethods.webAuthn) {
								credentialId = await setWebBiometricKey(
									npub,
									masterKeyData.exportedMasterKey,
									passkeyName
								);
							}
						}
					} else {
						await authService.migrateToMasterKey(npub, deviceId, masterKeyData);
					}
				}

				// Store master key data in biometrics for new users or users who just migrated
				// Only create passkey if it wasn't already created above
				if (!isTestEnvironment && !credentialId) {
					if (authMethods.biometric) {
						credentialId = await setBiometricKey(
							npub,
							masterKeyData.exportedMasterKey,
							'biometrics',
							passkeyName
						);
					} else if (authMethods.webAuthn) {
						credentialId = await setWebBiometricKey(
							npub,
							masterKeyData.exportedMasterKey,
							passkeyName
						);
					}

					if (!credentialId) throw new Error('Failed to set biometric key');
				}

				// Register passkey device with backend (only if credentialId was created)
				if (credentialId && !isTestEnvironment) {
					await authService.registerPasskeyDevice(npub, deviceId, deviceName, credentialId);
				} else if (isTestEnvironment) {
					// In test environments, skip passkey creation to avoid browser prompts
					console.log('[E2E] Skipping passkey creation in test environment');
				}

				const biometricData = {
					username: npub,
					password: JSON.stringify({
						key: masterKeyData.exportedMasterKey,
						masterKeyData: masterKeyData,
						// Legacy compatibility fields
						data: masterKeyData.nostr.encrypted.data,
						iv: masterKeyData.nostr.encrypted.iv,
						authTag: masterKeyData.nostr.encrypted.authTag,
						salt: masterKeyData.nostr.salt
					}),
					server: res.user.nostrKey?.deviceId!,
					isLegacyFormat: masterKeyData ? false : true
				};

				authState
					.setupAuthData(res.access_token, 'biometrics', npub, res.user, biometricData, false)
					.then(() => {
						if (res.isNewUser) goto('/auth/onboarding');
						else goto('/dashboard');
					});
			}
		} catch (err) {
			console.error('Error:', err);
			error = err instanceof Error ? err.message : $t('login.errors.failed');
			// Check if error is related to passkeys/biometrics (nsec login can involve passkey setup)
			if (err instanceof Error) {
				isPasskeyError =
					err.message.toLowerCase().includes('passkey') ||
					err.message.toLowerCase().includes('biometric') ||
					err.message.toLowerCase().includes('webauthn') ||
					err.message.toLowerCase().includes('authentication') ||
					err.name === 'NotAllowedError' ||
					err.name === 'NotSupportedError' ||
					err.name === 'SecurityError';
			} else {
				isPasskeyError = false;
			}
		} finally {
			isLoading = false;
		}
	}

	function handleLoginWithQrCode(barcode: Barcode) {
		nsec = barcode.displayValue;
		handleNsecLogin();
	}

	function handleQrCodeScan(scannedText: string) {
		// Clear any previous errors
		error = '';
		isPasskeyError = false;
		isQrScannerError = false;

		// Trim whitespace from scanned text (extra safety check)
		const trimmedText = scannedText.trim();
		console.log('[Login] Processing QR scan - original:', scannedText);
		console.log('[Login] Processing QR scan - trimmed:', trimmedText);

		// Validate that the scanned text is an nsec
		const validation = validateNostrPrivateKey(trimmedText);
		if (!validation.isValid) {
			console.error('[Login] QR code validation failed:', validation.error);
			console.error('[Login] Scanned text details:', {
				original: scannedText,
				trimmed: trimmedText,
				length: trimmedText.length,
				startsWithNsec: trimmedText.startsWith('nsec1'),
				firstChars: trimmedText.substring(0, 10)
			});
			error =
				validation.error ||
				'Invalid nsec QR code. Please ensure you are scanning a valid Nostr private key (nsec1...)';
			isQrScannerError = true;
			return;
		}

		console.log('[Login] QR code validated successfully, proceeding with login');
		// Set nsec and trigger login
		nsec = trimmedText;
		handleNsecLogin();
	}

	function openQrScanner() {
		// Clear any previous errors when opening scanner
		error = '';
		isPasskeyError = false;
		isQrScannerError = false;

		if (qrScannerModal) {
			qrScannerModal.open();
		}
	}
</script>

<div class="mx-auto flex w-full max-w-2xl grow flex-col items-center justify-center px-4 py-8">
	<div class="card bg-base-100 w-full shadow-xl">
		<div class="card-body">
			<div class="mb-8 flex flex-col items-center justify-center">
				<Logo />
				<h3 class="mt-2 text-center font-bold">{$t('login.title')}</h3>
				<br />
				<p class="text-base-content mb-4 text-center text-base">
					{$t('login.subtitle')}
				</p>
				<p class="text-base-content text-center text-base">
					{$t('login.passkey_info')}
				</p>
			</div>
			<div class="flex flex-col gap-4">
				{#if !isNostrLogin}
					<div
						class="flex flex-col gap-4"
						in:fly={{
							duration: 200,
							easing: linear,
							y: 0,
							x: isNostrLogin ? 20 : -20
						}}
					>
						<div class="flex flex-col gap-2">
							<button
								class="btn btn-primary"
								onclick={() => authenticate('passkey')}
								disabled={isLoading}
							>
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
								{isLoading ? $t('common.processing') + '...' : $t('login.continue_passkey')}
							</button>
							{#if authMethods.biometric}
								<p class="text-base-content/60 text-start text-xs">
									{$t('login.passkey_description')}: {webAuthnProvider}
								</p>
							{/if}
						</div>

						<button
							class="btn btn-secondary btn-sm md:btn-md w-full py-5"
							onclick={openQrScanner}
							disabled={isLoading}
						>
							<svg xmlns="http://www.w3.org/2000/svg" class="size-6" viewBox="0 0 16 16">
								<path
									fill="none"
									stroke="currentColor"
									stroke-linejoin="round"
									d="M6 2.5H2.5V6M10 2.5h3.5V6M10 13.5h3.5V10M6 13.5H2.5V10M2 8h12"
									stroke-width="1"
								/>
							</svg>
							{$t('login.login_with_qr_code')}
						</button>

						<button
							class="btn btn-secondary btn-sm md:btn-md w-full py-5"
							onclick={() => {
								error = '';
								isPasskeyError = false;
								isNostrLogin = true;
							}}
							disabled={isLoading}
						>
							<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" class="size-6"
								><path
									fill="#fff"
									d="M231.2 159.5c0 20.7 0 31.1-3.5 42.2-4.4 12.2-14 21.8-26.2 26.2-11.1 3.5-21.5 3.5-42.2 3.5H96.8c-20.7 0-31.1 0-42.2-3.5-12.2-4.4-21.8-14-26.2-26.2-3.5-11.1-3.5-21.5-3.5-42.2V97c0-20.7 0-31.1 3.5-42.2 4.4-12.2 14-21.8 26.2-26.2 11.2-3.5 21.5-3.5 42.2-3.5h62.5c20.7 0 31.1 0 42.2 3.5 12.2 4.4 21.8 14 26.2 26.2 3.5 11.2 3.5 21.5 3.5 42.2v62.5Z"
								/><path
									fill="#662482"
									d="M210.8 199.4c0 3.1-2.5 5.7-5.7 5.7h-68c-3.1 0-5.7-2.5-5.7-5.7v-15.5c.3-19 2.3-37.2 6.5-45.5 2.5-5 6.7-7.7 11.5-9.1 9.1-2.7 24.9-.9 31.7-1.2 0 0 20.4.8 20.4-10.7s-9.1-8.6-9.1-8.6c-10 .3-17.7-.4-22.6-2.4-8.3-3.3-8.6-9.2-8.6-11.2-.4-23.1-34.5-25.9-64.5-20.1-32.8 6.2.4 53.3.4 116.1v8.4c0 3.1-2.6 5.6-5.7 5.6H57.7c-3.1 0-5.7-2.5-5.7-5.7v-144c0-3.1 2.5-5.7 5.7-5.7h31.7c3.1 0 5.7 2.5 5.7 5.7 0 4.7 5.2 7.2 9 4.5 11.4-8.2 26-12.5 42.4-12.5 36.6 0 64.4 21.4 64.4 68.7v83.2ZM150 99.3c0-6.7-5.4-12.1-12.1-12.1s-12.1 5.4-12.1 12.1 5.4 12.1 12.1 12.1S150 106 150 99.3Z"
								/></svg
							>
							{$t('login.login_with_nsec')}
						</button>
					</div>
				{:else}
					<div
						class="flex flex-col gap-3"
						in:fly={{
							duration: 200,
							easing: linear,
							y: 0,
							x: isNostrLogin ? 20 : -20
						}}
					>
						<div class="relative">
							<input
								type={showNsec ? 'text' : 'password'}
								id="privateKey"
								bind:value={nsec}
								class="input input-bordered w-full pr-10 {error ? 'input-error' : ''}"
								placeholder={$t('login.nostr_private_key_placeholder')}
								required
							/>
							<button
								type="button"
								class="absolute inset-y-0 right-0 flex items-center pr-3"
								onclick={() => (showNsec = !showNsec)}
							>
								{#if showNsec}
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
											d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
										/>
									</svg>
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
											d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
										/>
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											stroke-width="2"
											d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
										/>
									</svg>
								{/if}
							</button>
						</div>
						<button
							class="btn btn-block btn-primary"
							onclick={handleNsecLogin}
							disabled={isLoading}
						>
							{isLoading ? $t('common.processing') + '...' : $t('login.login_button')}
						</button>
						<!-- QR Code login - Only for mobile -->
						{#if authMethods.biometric}
							<QrCodeScanner onScan={handleLoginWithQrCode}>
								{#snippet scanBtn({ disabled, onStartScan })}
									<button
										class="btn btn-secondary btn-sm md:btn-md py-5"
										onclick={onStartScan}
										{disabled}
									>
										<svg xmlns="http://www.w3.org/2000/svg" class="size-6" viewBox="0 0 16 16">
											<path
												fill="none"
												stroke="currentColor"
												stroke-linejoin="round"
												d="M6 2.5H2.5V6M10 2.5h3.5V6M10 13.5h3.5V10M6 13.5H2.5V10M2 8h12"
												stroke-width="1"
											/>
										</svg>
										{$t('login.login_with_qr_code')}
									</button>
								{/snippet}
							</QrCodeScanner>
						{/if}
						<button
							class="btn btn-block btn-secondary"
							onclick={() => {
								error = '';
								isPasskeyError = false;
								isNostrLogin = false;
								nsec = '';
							}}
							disabled={isLoading}
						>
							{$t('login.cancel_button')}
						</button>
					</div>
				{/if}

				{#if error}
					{#if isQrScannerError}
						<!-- QR Scanner errors - simple alert, no passkey retry -->
						<div class="alert alert-outline alert-error mt-2">
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
							<button
								class="btn btn-sm btn-ghost"
								onclick={() => {
									error = '';
									isQrScannerError = false;
								}}
							>
								{$t('common.close')}
							</button>
						</div>
					{:else}
						<!-- Passkey/biometric errors - use ErrorAlertWithModal -->
						<ErrorAlertWithModal
							{error}
							{isPasskeyError}
							autoOpenModal={isPasskeyError}
							onRetry={async () => {
								// Close modal and clear error state
								error = '';
								isPasskeyError = false;
								// Retry the last action that was attempted
								if (lastAction === 'nsecLogin') {
									await handleNsecLogin();
								} else if (lastAction === 'authenticate' && lastAuthMethod) {
									await authenticate(lastAuthMethod);
								} else if (authMethods.webAuthn) {
									// Default to passkey if available
									await authenticate('passkey');
								} else if (authMethods.biometric) {
									// Fallback to biometrics if available
									await authenticate('biometrics');
								}
							}}
							class="mt-2"
						/>
					{/if}
				{/if}

				<div class="divider my-1">{$t('common.or')}</div>

				<button onclick={() => goto('/auth/signup')} class="btn btn-outline btn-primary w-full">
					{$t('login.create_account')}
				</button>

				<div class="mt-2 text-center">
					<a href="/auth/recover/send" class="link link-primary text-sm">
						{$t('login.recover_account')}
					</a>
				</div>
			</div>
		</div>
	</div>

	<!-- QR Code Scanner Modal -->
	<LoginQrCodeScannerModal
		bind:this={qrScannerModal}
		onScan={handleQrCodeScan}
		onError={(err) => {
			error = err;
			isQrScannerError = true;
			isPasskeyError = false;
		}}
		onClose={() => {
			// Clear QR scanner errors when modal closes
			if (isQrScannerError) {
				error = '';
				isQrScannerError = false;
			}
		}}
	/>
</div>
