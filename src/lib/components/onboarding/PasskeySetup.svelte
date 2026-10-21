<script lang="ts">
	import type { BiometricPlatform } from '$lib/utils/helpers/biometricErrorHandler';
	import type { ErrorType } from '$lib/components/ErrorTroubleshootingModal.svelte';
	import { t, locale } from 'svelte-i18n';
	import { get } from 'svelte/store';
	import { onMount } from 'svelte';
	import { Buffer } from 'buffer';
	import { nip19 } from 'nostr-tools';
	import { authState } from '$lib/stores/auth.store';
	import { encryptMasterKeyData } from '$lib/utils/helpers/auth';
	import { getErrorModalData } from '$lib/utils/helpers/showErrorModal';
	import { detectErrorType } from '$lib/utils/helpers/errorTypeDetector';
	import { copyToClipboard } from '$lib/utils/helpers/clipboard';
	import { hexToBytes } from '$lib/utils/helpers/encoding';
	import { rememberChosenUsername } from '$lib/utils/helpers/account-username';
	import {
		prefetchPasskeyChallenge,
		setBiometricKey,
		takePasskeyChallenge
	} from '$lib/utils/helpers/biometrics';
	import { isUnavailablePasskeyError } from '$lib/utils/helpers/passkey-prompt';
	import { cancelWebAuthnCreate, passkeySetupFailure } from '$lib/utils/helpers/webauthn-create';
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
		prevStep,
		openBackup = false
	}: {
		username: string;
		npub: string;
		nsec: string;
		nextStep: () => void;
		prevStep: () => void;
		/** Open the key backup on this step. It is not behind a flag. */
		openBackup?: boolean;
	} = $props();

	// Status indicators
	let isLoading = $state(false);
	let isSetupComplete = $state(false);
	let error = $state('');
	let errorType = $state<ErrorType | undefined>(undefined);
	let showLearnMoreModal = $state(false);
	let canSkipPasskey = $state(false);
	let passkeyAttempt = 0;
	let backupChoice = $state<boolean | null>(null);
	const backupOpen = $derived(backupChoice ?? openBackup);
	let backupSaved = $state(false);
	let prepared = $state<PreparedAccount | null>(null);

	type PreparedAccount = {
		deviceId: string;
		deviceName: string;
		encryptedData: Awaited<ReturnType<typeof encryptMasterKeyData>>['encryptedData'];
		exportedKey: string;
	};

	const backupKey = $derived.by(() => {
		try {
			return nip19.nsecEncode(hexToBytes(nsec));
		} catch {
			return '';
		}
	});

	function leavePasskeyStep() {
		passkeyAttempt += 1;
		cancelWebAuthnCreate();
		prevStep();
	}

	function noAuthenticatorMessage(): string {
		return $t('onboarding_auth.form.passkey_setup.errors.no_authenticator');
	}

	/** Sign the account in with the Nostr key when this device has no authenticator. */
	async function continueWithoutPasskey() {
		rememberChosenUsername(username);
		const mnemonic = await deriveWalletFromNostr(nsec);
		const deviceId = await getDeviceIdentifier();
		const deviceName = await createUserDeviceShortName(npub);
		const { encryptedData } = await encryptMasterKeyData(nsec, mnemonic, nsec);
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
	}

	async function prepareAccount(): Promise<PreparedAccount> {
		const mnemonic = await deriveWalletFromNostr(nsec);
		const deviceId = await getDeviceIdentifier();
		const deviceName = await createUserDeviceShortName(npub);
		const { encryptedData, exportedKey } = await encryptMasterKeyData(nsec, mnemonic, nsec);
		return { deviceId, deviceName, encryptedData, exportedKey };
	}

	onMount(() => {
		prefetchPasskeyChallenge();
		void prepareAccount()
			.then((value) => {
				prepared = value;
			})
			.catch(() => {
				canSkipPasskey = true;
			});
	});

	function copyBackupKey() {
		if (!backupKey) return;
		copyToClipboard(backupKey);
	}

	function toggleBackup() {
		backupChoice = !backupOpen;
		if (!backupChoice) return;
		passkeyAttempt += 1;
		cancelWebAuthnCreate();
		isLoading = false;
	}

	/**
	 * Register a new user with master key biometric authentication (Nostr + Wallet).
	 * credentials.create has to start in this click, so the account keys are prepared first.
	 */
	function handlePasskeySetup() {
		const attempt = ++passkeyAttempt;
		isLoading = true;
		error = '';
		errorType = undefined;

		if (typeof window !== 'undefined' && '__PLAYWRIGHT_TEST__' in window) {
			void continueWithoutPasskey()
				.catch((err: unknown) => {
					if (attempt !== passkeyAttempt) return;
					error =
						err instanceof Error
							? err.message
							: $t('onboarding_auth.form.passkey_setup.errors.setup_failed');
				})
				.finally(() => {
					if (attempt === passkeyAttempt) isLoading = false;
				});
			return;
		}

		if (typeof Buffer === 'undefined') {
			error = 'Buffer is not defined';
			isLoading = false;
			return;
		}

		if (!prepared) {
			void waitForAccountPrep(attempt);
			return;
		}

		const challenge = takePasskeyChallenge();
		if (!challenge) {
			prefetchPasskeyChallenge();
			canSkipPasskey = true;
			error = $t('onboarding_auth.form.passkey_setup.errors.tap_again');
			isLoading = false;
			return;
		}

		const ready = prepared;
		const credentialPromise = setBiometricKey({
			npub,
			exportedKey: ready.exportedKey,
			username,
			challenge
		});
		void finishPasskey(attempt, ready, credentialPromise);
	}

	async function waitForAccountPrep(attempt: number) {
		try {
			const ready = await prepareAccount();
			if (attempt !== passkeyAttempt) return;
			prepared = ready;
			prefetchPasskeyChallenge();
			canSkipPasskey = true;
			error = $t('onboarding_auth.form.passkey_setup.errors.tap_again');
		} catch (err: unknown) {
			if (attempt !== passkeyAttempt) return;
			error =
				err instanceof Error
					? err.message
					: $t('onboarding_auth.form.passkey_setup.errors.setup_failed');
			canSkipPasskey = true;
		} finally {
			if (attempt === passkeyAttempt) isLoading = false;
		}
	}

	async function finishPasskey(
		attempt: number,
		ready: PreparedAccount,
		credentialPromise: ReturnType<typeof setBiometricKey>
	) {
		const { encryptedData, exportedKey, deviceId, deviceName } = ready;
		try {
			let credentialData = {
				credentialId: '',
				passkeyPubkey: '',
				clientDataJSON: '',
				attestationObject: '',
				challenge: ''
			};

			try {
				credentialData = await credentialPromise;
			} catch (biometricError: unknown) {
				if (attempt !== passkeyAttempt) return;
				console.error('Passkey setup failed:', biometricError);
				const failure = passkeySetupFailure(biometricError);
				canSkipPasskey = true;
				if (failure !== 'setup_failed') {
					error = $t(`onboarding_auth.form.passkey_setup.errors.${failure}`);
					return;
				}
				const platform: BiometricPlatform = 'mobile-native';
				const { errorMessage: msg, errorType: type } = await getErrorModalData({
					error: biometricError,
					platform
				});
				if (attempt !== passkeyAttempt) return;
				error = msg || $t('onboarding_auth.form.passkey_setup.errors.setup_failed');
				errorType = type;
				return;
			}

			if (attempt !== passkeyAttempt) return;

			if (
				!credentialData.credentialId ||
				!credentialData.passkeyPubkey ||
				!credentialData.clientDataJSON ||
				!credentialData.attestationObject
			) {
				error = noAuthenticatorMessage();
				canSkipPasskey = true;
				return;
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
				platform: 'web',
				challenge: credentialData.challenge,
				clientDataJSON: credentialData.clientDataJSON,
				attestationObject: credentialData.attestationObject,
				appVersion: __APP_VERSION__,
				timezoneOffset: new Date().getTimezoneOffset(),
				lang: get(locale) || 'en'
			});

			if (response && response.access_token) {
				rememberChosenUsername(username);
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
			if (attempt !== passkeyAttempt) return;
			console.error('Passkey setup failed:', err);
			if (isUnavailablePasskeyError(err)) {
				error = noAuthenticatorMessage();
				canSkipPasskey = true;
			} else if (!error) {
				error =
					err instanceof Error
						? err.message
						: $t('onboarding_auth.form.passkey_setup.errors.setup_failed');
				errorType = detectErrorType(error);
			}
		} finally {
			if (attempt === passkeyAttempt) isLoading = false;
		}
	}

	async function createAccountWithKey() {
		if (!backupSaved || !backupKey) return;
		isLoading = true;
		error = '';
		errorType = undefined;
		try {
			const ready = prepared ?? (await prepareAccount());
			prepared = ready;
			const { challenge } = await authService.getChallenge();
			rememberChosenUsername(username);
			const response = await authService.register({
				username,
				publicKey: npub,
				encryptedData: ready.encryptedData,
				authMethod: 'nsec',
				deviceId: ready.deviceId,
				deviceName: ready.deviceName,
				credentialId: '',
				passkeyPubkey: '',
				platform: 'web',
				challenge,
				clientDataJSON: '',
				attestationObject: '',
				appVersion: __APP_VERSION__,
				timezoneOffset: new Date().getTimezoneOffset(),
				lang: get(locale) || 'en'
			});
			if (!response?.access_token) {
				throw new Error($t('onboarding_auth.form.passkey_setup.errors.setup_failed'));
			}
			await authState.setupAuthData(
				response.access_token,
				'nsec',
				npub,
				{ ...response.user, username },
				undefined,
				false,
				response.refresh_token
			);
			await authState.login({ ...response.user, username });
			isSetupComplete = true;
			setTimeout(() => nextStep(), 1500);
		} catch (err: unknown) {
			error =
				err instanceof Error
					? err.message
					: $t('onboarding_auth.form.passkey_setup.errors.setup_failed');
			canSkipPasskey = true;
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
						autoOpenModal={!canSkipPasskey}
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
		<div class="flex flex-wrap justify-between gap-2">
			<button
				type="button"
				class="btn btn-outline"
				data-testid="passkey-setup-back"
				onclick={leavePasskeyStep}
			>
				{$t('onboarding_auth.form.passkey_setup.back')}
			</button>
			{#if !isSetupComplete}
				<div class="mx-auto flex w-full max-w-lg flex-col gap-3">
					{#if backupOpen}
						<div
							class="border-base-300 rounded-xl border p-4 text-left"
							data-testid="passkey-setup-backup-panel"
						>
							<p class="mb-2 text-sm font-semibold">
								{$t('onboarding_auth.form.passkey_setup.backup_title')}
							</p>
							<p class="text-base-content/80 mb-3 text-sm">
								{$t('onboarding_auth.form.passkey_setup.backup_body')}
							</p>
							<textarea
								class="textarea textarea-bordered w-full font-mono text-xs"
								rows="3"
								readonly
								value={backupKey}
								data-testid="passkey-setup-nsec"
							></textarea>
							<button type="button" class="btn btn-outline btn-sm mt-2" onclick={copyBackupKey}>
								{$t('onboarding_auth.form.passkey_setup.backup_copy')}
							</button>
							<label class="mt-3 flex items-start gap-2 text-sm">
								<input
									type="checkbox"
									class="checkbox checkbox-sm mt-0.5"
									bind:checked={backupSaved}
									data-testid="passkey-setup-backup-saved"
								/>
								<span>{$t('onboarding_auth.form.passkey_setup.backup_saved')}</span>
							</label>
							<button
								type="button"
								class="btn btn-primary mt-3 w-full"
								data-testid="passkey-setup-backup-confirm"
								onclick={() => void createAccountWithKey()}
								disabled={!backupSaved || isLoading || !backupKey}
							>
								{$t('onboarding_auth.form.passkey_setup.backup_confirm')}
							</button>
						</div>
					{/if}
				</div>
				<button
					type="button"
					class="btn btn-outline mt-2 w-full"
					data-testid="passkey-setup-backup"
					onclick={toggleBackup}
				>
					{$t('onboarding_auth.form.passkey_setup.create_key_backup')}
				</button>
				<div class="flex flex-wrap justify-end gap-2">
					{#if canSkipPasskey}
						<button
							type="button"
							class="btn btn-outline"
							data-testid="passkey-setup-skip"
							onclick={async () => {
								isLoading = true;
								error = '';
								try {
									await continueWithoutPasskey();
								} catch (err: unknown) {
									error =
										err instanceof Error
											? err.message
											: $t('onboarding_auth.form.passkey_setup.errors.setup_failed');
								} finally {
									isLoading = false;
								}
							}}
							disabled={isLoading}
						>
							{$t('onboarding_auth.form.passkey_setup.continue_without_passkey')}
						</button>
					{/if}
					<button
						type="button"
						class="btn btn-primary"
						data-testid="passkey-setup-button"
						onclick={handlePasskeySetup}
						disabled={isLoading || !prepared}
					>
						{#if isLoading}
							<span class="loading loading-spinner"></span>
							{$t('onboarding_auth.form.passkey_setup.setting_up')}
						{:else if error}
							{$t('onboarding_auth.form.passkey_setup.retry')}
						{:else}
							{$t('onboarding_auth.form.passkey_setup.set_up_passkey')}
						{/if}
					</button>
				</div>
			{:else}
				<button type="button" class="btn btn-primary" onclick={nextStep}>
					{$t('onboarding_auth.form.passkey_setup.continue')}
				</button>
			{/if}
		</div>
	</div>
</div>
