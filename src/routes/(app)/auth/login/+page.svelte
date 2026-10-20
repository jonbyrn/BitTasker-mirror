<script lang="ts">
	import type { Barcode } from '@capacitor-mlkit/barcode-scanning';
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import { resolve } from '$app/paths';
	import { goto } from '$app/navigation';
	import { t, locale } from 'svelte-i18n';
	import { get } from 'svelte/store';
	import { authState } from '$lib/stores/auth.store';
	import {
		createUserDeviceShortName,
		getDeviceIdentifier
	} from '$lib/utils/helpers/deviceIdentity';
	import {
		deriveKeyFromPassword,
		deriveWalletFromNostr,
		exportKey
	} from '$lib/utils/helpers/crypto';
	import { base64ToBytes } from '$lib/utils/helpers/encoding';
	import {
		decryptMasterKeyDataFromBiometrics,
		encryptMasterKeyData
	} from '$lib/utils/helpers/auth';
	import {
		checkBiometricAvailability,
		checkNativePlatform,
		getBiometricData
	} from '$lib/utils/helpers/biometrics';
	import { finalizeEvent, getPublicKey } from 'nostr-tools/pure';
	import { handleBiometricError } from '$lib/utils/helpers/biometricErrorHandler';
	import { Capacitor } from '@capacitor/core';
	import { fly } from 'svelte/transition';
	import { linear } from 'svelte/easing';
	import { Buffer } from 'buffer';
	import { bytesToHex } from '@noble/hashes/utils';
	import { decodeNsec } from '$lib/utils/nostr';
	import { applyNdkSignerFromNsec } from '$lib/nostr/ndk';
	import { rememberLoginSeed } from '$lib/utils/helpers/mnemonic';
	import { appStore } from '$lib/stores/app.store';
	import authService from '$lib/api/services/auth.service';
	import QrCodeScanner from '$lib/components/QrCodeScanner.svelte';
	import ErrorAlertWithModal from '$lib/components/ErrorAlertWithModal.svelte';
	import Logo from '$lib/components/Logo.svelte';
	import migratePasskey, {
		passkeyMigration,
		resetMigration
	} from '$lib/utils/helpers/migratePasskey';
	import MigratePasskey from '$lib/components/MigratePasskey.svelte';
	import WebQrCodeScanner from '$lib/components/WebQrCodeScanner.svelte';

	// Polyfill Buffer
	if (typeof window !== 'undefined') {
		globalThis.Buffer = Buffer;
	}

	let error = $state('');
	let isLoading = $state(false);
	let isNostrLogin = $state(false);
	let showNsec = $state(false);
	let nsec = $state('');
	let isBiometricsAvailable = $state(false);
	let isNativePlatform = $state(false);
	let isPasskeyError = $state(false);
	let lastAction = $state<'authenticate' | 'nsecLogin' | null>(null);

	onMount(async () => {
		try {
			// Check available authentication methods
			isBiometricsAvailable = await checkBiometricAvailability();
			isNativePlatform = checkNativePlatform();
		} catch (err) {
			console.error('Error checking authentication methods:', err);
		}
	});

	async function authenticate() {
		if (!browser) return;
		try {
			isLoading = true;
			error = '';
			isPasskeyError = false;
			lastAction = 'authenticate'; // Track which action was attempted

			let credentails = null;

			if (isBiometricsAvailable) {
				credentails = await getBiometricData();
			}

			if (!credentails) {
				error = $t('login.errors.no_account');
				return (isPasskeyError = true);
			}

			let credentialId = credentails.credentialId;

			let exportedKey = credentails.exportedKey;

			const deviceId = await getDeviceIdentifier();
			const deviceName = await createUserDeviceShortName(credentails.npub);

			let response = await authService.passkeyLogin({
				npub: credentails.npub,
				challenge: credentails.challenge,
				credentialId,
				deviceId,
				deviceName,
				platform: isNativePlatform ? 'mobile' : 'web',
				response: credentails.response,
				appVersion: __APP_VERSION__,
				timezoneOffset: new Date().getTimezoneOffset(),
				lang: get(locale) || 'en'
			});

			let nsec = '';
			let mnemonic = '';

			if (response.isLegacy) {
				// @ts-expect-error - Legacy format to be removed in the future
				// TODO: Remove this once all users have migrated
				const _exportedKey = response.encryptedData.exportedMasterKey;
				const decryptedData = await decryptMasterKeyDataFromBiometrics(
					response.encryptedData,
					_exportedKey
				);
				nsec = decryptedData.nsec;
				mnemonic = decryptedData.mnemonic;

				const migrationResponse = await migratePasskey({
					npub: credentails.npub,
					decryptedData,
					deviceId,
					deviceName,
					username: response.user?.username ?? '',
					platform: checkNativePlatform() ? 'mobile' : 'web'
				});

				response = migrationResponse.response;
				exportedKey = migrationResponse.exportedKey;
				credentialId = migrationResponse.credentialId;
			} else {
				// decrypt nsec
				const decryptedData = await decryptMasterKeyDataFromBiometrics(
					response.encryptedData,
					credentails.exportedKey
				);
				nsec = decryptedData.nsec;
				mnemonic = decryptedData.mnemonic;
			}

			if (!nsec || !mnemonic) {
				error = $t('login.errors.failed');
				isPasskeyError = true;
				return;
			}

			const privateKeyBytes = decodeNsec(nsec);
			await applyNdkSignerFromNsec(privateKeyBytes);
			await rememberLoginSeed(mnemonic, nsec, credentails.npub);
			appStore.update((state) => ({
				...state,
				nostrKeys: {
					...state.nostrKeys,
					nsec: privateKeyBytes,
					npub: credentails.npub,
					mnemonic
				}
			}));

			if (!response.access_token) {
				throw new Error($t('login.errors.no_token'));
			}

			const biometricData = {
				npub: credentails.npub,
				exportedKey: exportedKey,
				encryptedData: response.encryptedData,
				credentialId
			};

			// If the account was pending deletion and the user just logged in,
			// the backend automatically cancels the deletion. Show a welcome-back toast.
			if (response.accountRestored) {
				appStore.showSuccessToast($t('login.account_restored_message'));
			}

			await authState.setupAuthData(
				response.access_token,
				'passkey',
				credentails.npub,
				response.user,
				biometricData,
				false,
				response.refresh_token
			);
			await authState.login(response.user);
			await goto(resolve('/wallet'));
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
		if (!browser) return;
		try {
			isLoading = true;
			error = '';
			isPasskeyError = false;
			lastAction = 'nsecLogin'; // Track which action was attempted

			// Only run in browser environment to avoid Buffer issues
			if (typeof Buffer === 'undefined') {
				throw new Error('Buffer is not defined');
			}
			// decode nsec includes validation of nsec
			const privateKey = decodeNsec(nsec);
			const npub = getPublicKey(privateKey);

			if (!privateKey && !npub) {
				error = 'Invalid nostr keys';
				return;
			}
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
				privateKey
			);

			const deviceId = await getDeviceIdentifier();
			const deviceName = await createUserDeviceShortName(npub);
			const isTestEnvironment =
				import.meta.env.VITE_SKIP_PASSKEY === 'true' ||
				import.meta.env.VITE_E2E_TEST === 'true' ||
				(typeof window !== 'undefined' &&
					'__PLAYWRIGHT_TEST__' in window &&
					(window as { __PLAYWRIGHT_TEST__?: boolean }).__PLAYWRIGHT_TEST__ === true);

			let mnemonic = '';

			const response = isTestEnvironment
				? undefined
				: await authService.encryptedNostrData({
						event: signedEvent,
						deviceId: deviceId,
						deviceName: deviceName,
						platform: isNativePlatform ? 'mobile' : 'web',
						appVersion: __APP_VERSION__
					});

			if (response && response.encryptedData) {
				// @ts-expect-error - Legacy format to be removed in the future
				const exportedMasterKey = response.encryptedData.exportedMasterKey;
				if (exportedMasterKey) {
					const decryptedData = await decryptMasterKeyDataFromBiometrics(
						response.encryptedData,
						exportedMasterKey
					);
					mnemonic = decryptedData.mnemonic;
				} else {
					// Account exists, decrypt wallet mnemonic
					const masterSalt = base64ToBytes(response.encryptedData.masterSalt);
					try {
						// try decryption with nsec hex format (...64 characters)
						let _nsec = nsec;
						if (nsec.startsWith('nsec1')) {
							_nsec = bytesToHex(privateKey);
						}
						const exportedMasterKey = await deriveKeyFromPassword(_nsec, masterSalt, 100000);
						const _exportedKey = await exportKey(exportedMasterKey);

						const decryptedData = await decryptMasterKeyDataFromBiometrics(
							response.encryptedData,
							_exportedKey
						);
						mnemonic = decryptedData.mnemonic;
					} catch {
						console.warn('Error decrypting in bech32 format, trying hex format');
						try {
							// try direct decryption with nsec bech32 format (nsec1...)
							const exportedMasterKey = await deriveKeyFromPassword(nsec, masterSalt, 100000);
							const _exportedKey = await exportKey(exportedMasterKey);
							const decryptedData = await decryptMasterKeyDataFromBiometrics(
								response.encryptedData,
								_exportedKey
							);
							mnemonic = decryptedData.mnemonic;
						} catch (error) {
							throw new Error(error instanceof Error ? error.message : 'Unknown error');
						}
					}
				}
			} else {
				const e2eMnemonic =
					typeof window !== 'undefined' ? window.localStorage.getItem('__E2E_MNEMONIC__') : null;
				const e2eWords = e2eMnemonic?.trim().split(/\s+/).filter(Boolean) ?? [];
				mnemonic =
					e2eMnemonic && !e2eMnemonic.trim().startsWith('nsec') && e2eWords.length >= 12
						? e2eMnemonic
						: await deriveWalletFromNostr(nsec);
			}

			const { encryptedData } = await encryptMasterKeyData(nsec, mnemonic, nsec);

			isNativePlatform = checkNativePlatform();

			// A valid nsec is the login. Do not open a passkey prompt after it.
			const credentialData = {
				credentialId: '',
				passkeyPubkey: '',
				clientDataJSON: '',
				attestationObject: '',
				challenge: ''
			};
			const loginChallenge = credentialData.challenge || challenge;
			const loginEventPayload = {
				kind: 22242,
				created_at: Math.floor(Date.now() / 1000),
				content: loginChallenge,
				tags: [
					['relay', window.location.origin],
					['challenge', loginChallenge]
				]
			};
			const newSignedEvent = finalizeEvent(loginEventPayload, privateKey);

			const res = await authService.nostrLogin({
				event: newSignedEvent,
				challenge: loginChallenge,
				authMethod: 'nsec',
				deviceId,
				encryptedData,
				deviceName,
				credentialId: credentialData.credentialId,
				passkeyPubkey: credentialData.passkeyPubkey,
				clientDataJSON: credentialData.clientDataJSON,
				attestationObject: credentialData.attestationObject,
				appVersion: __APP_VERSION__,
				platform: isNativePlatform ? 'mobile' : 'web',
				timezoneOffset: new Date().getTimezoneOffset(),
				lang: get(locale) || 'en'
			});

			if (res.isMigrated) {
				// Show modal info to user that passkey has been migrated and old passkeys for this account have been revoked
				// Wait for the modal to be closed by the user
				await new Promise((resolve, reject) => {
					let unsubscribe: (() => void) | undefined;
					let timeoutId: ReturnType<typeof setTimeout>;

					unsubscribe = passkeyMigration.subscribe((state) => {
						if (state.state === 'info') {
							clearTimeout(timeoutId);
							unsubscribe?.();
							resolve(true);
						}
					});

					// Timeout after 5 minutes
					timeoutId = setTimeout(
						() => {
							unsubscribe();
							reject(new Error('Timeout waiting for user action'));
						},
						5 * 60 * 1000
					);

					passkeyMigration.update((state) => ({
						...state,
						isOpen: true,
						state: 'migrated',
						error: null,
						shouldProceed: false,
						context: null
					}));
				});
			}

			if (res.access_token) {
				await authState.setupAuthData(
					res.access_token,
					'nsec',
					npub,
					res.user,
					undefined,
					false,
					res.refresh_token
				);
				await authState.login(res.user);
				await applyNdkSignerFromNsec(privateKey);
				await rememberLoginSeed(mnemonic, nsec, npub);
				appStore.update((state) => ({
					...state,
					nostrKeys: { ...state.nostrKeys, nsec: privateKey, npub, mnemonic }
				}));
				if (res.accountRestored) {
					appStore.showSuccessToast($t('login.account_restored_message'));
				}

				if (isTestEnvironment) {
					await goto(resolve('/create-task'));
				} else {
					await goto(resolve('/wallet'));
				}

				if ($passkeyMigration.isOpen) {
					resetMigration();
				}
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

	function handleLoginWithQrCode(barcode: Barcode | string) {
		nsec = typeof barcode === 'string' ? barcode : barcode.displayValue;
		handleNsecLogin();
	}
</script>

<div class="mx-auto flex w-full max-w-md grow flex-col justify-center p-3 sm:p-6">
	<div class="card bg-base-100 border-base-300 w-full border shadow-sm">
		<div class="card-body gap-4 p-5">
			{#if !$passkeyMigration.isOpen}
				<div class="flex flex-col items-center gap-2 text-center">
					<Logo class="mx-auto block w-28 sm:w-36" />
					<h2 class="text-2xl font-semibold">{$t('login.title')}</h2>
					<p class="text-base-content/70 text-sm">{$t('login.subtitle')}</p>
				</div>
				<div class="flex flex-col gap-3">
					{#if !isNostrLogin}
						<div
							class="flex flex-col gap-4"
							in:fly={{
								duration: 160,
								easing: linear,
								y: 4,
								x: 0
							}}
						>
							<div class="flex flex-col gap-2">
								<button
									class="btn btn-primary"
									data-testid="login-continue-passkey"
									onclick={authenticate}
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
							</div>

							<!-- QR Code login - Only for mobile -->
							{#if isNativePlatform}
								<QrCodeScanner onScan={handleLoginWithQrCode}>
									{#snippet scanBtn({ disabled, onStartScan })}
										<button class="btn btn-secondary w-full" onclick={onStartScan} {disabled}>
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
							{:else}
								<!-- mode="auto": fullscreen on mobile web, modal on desktop web -->
								<WebQrCodeScanner
									mode="auto"
									onScan={(result: string) => handleLoginWithQrCode(result)}
								>
									{#snippet scanBtn({ onStartScan })}
										<button class="btn btn-secondary w-full" onclick={onStartScan}>
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
								</WebQrCodeScanner>
							{/if}

							<button
								class="btn btn-secondary w-full"
								data-testid="login-with-nsec"
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
						<form
							class="flex flex-col gap-3"
							onsubmit={(event) => {
								event.preventDefault();
								void handleNsecLogin();
							}}
							in:fly={{
								duration: 160,
								easing: linear,
								y: 4,
								x: 0
							}}
						>
							<div class="relative">
								<input
									type={showNsec ? 'text' : 'password'}
									id="privateKey"
									data-testid="login-nsec-input"
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
							<div class="mt-2 flex gap-3">
								<button
									type="button"
									class="btn btn-secondary flex-1"
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
								<button
									type="submit"
									class="btn btn-primary flex-1"
									data-testid="login-submit"
									disabled={isLoading}
								>
									{isLoading ? $t('common.processing') + '...' : $t('login.login_button')}
								</button>
							</div>

							<!-- QR Code login - Only for mobile -->
							{#if isNativePlatform}
								<QrCodeScanner onScan={handleLoginWithQrCode}>
									{#snippet scanBtn({ disabled, onStartScan })}
										<button class="btn btn-secondary mt-2 w-full" onclick={onStartScan} {disabled}>
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
						</form>
					{/if}

					{#if error}
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
								} else if (lastAction === 'authenticate') {
									await authenticate();
								}
							}}
							class="mt-2"
						/>
					{/if}

					<div class="divider my-1">{$t('common.or')}</div>

					<button
						onclick={async () => await goto(resolve('/auth/signup'))}
						class="btn btn-outline btn-primary w-full"
					>
						{$t('login.create_account')}
					</button>

					<div class="mt-2 text-center">
						<a
							href={resolve('/auth/recover/send')}
							class="link link-primary text-sm"
							data-sveltekit-preload-data
						>
							{$t('login.recover_account')}
						</a>
					</div>
				</div>
			{:else}
				<!-- TODO: To be removed after all users have migrated their passkeys -->
				<MigratePasskey />
			{/if}
		</div>
	</div>
</div>
