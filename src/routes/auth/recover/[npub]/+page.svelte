<script lang="ts">
	import type { NostrRecoveryData } from '$lib/types/auth';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { user } from '$lib/stores/user.store';
	import { authState } from '$lib/stores/auth.store';
	import { Preferences } from '@capacitor/preferences';
	import { StorageKeys } from '$lib/utils/constants/storage';
	import { signLoginChallenge } from '$lib/utils/helpers/auth';
	import { validatePassword } from '$lib/utils/helpers/validators';
	import { getDeviceIdentifier } from '$lib/utils/helpers/deviceIdentity';
	import { decryptNsecWithPassword, encryptNsec } from '$lib/utils/helpers/auth';
	import { checkBiometricAvailability, setBiometricKey } from '$lib/utils/helpers/biometrics';
	import {
		checkWebBiometricAvailability,
		setWebBiometricKey
	} from '$lib/utils/helpers/webBiometrics';
	import authService from '$lib/api/services/auth.service';

	const npub = page.params.npub;

	let recoveryCode = $state('');
	let currentPassword = $state('');
	let newPassword = $state('');
	let confirmPassword = $state('');
	let privateKey = $state('');
	let isLoading = $state(false);
	let error = $state('');
	let passwordError = $state('');
	let step = $state(1); // 1: Current Password, 2: New Password
	let recoveryData = $state<NostrRecoveryData>();
	let showCurrentPassword = $state(false);
	let showNewPassword = $state(false);
	let authMethods = $state({
		biometric: false,
		webAuthn: false
	});

	onMount(async () => {
		try {
			// Fetch recovery data for this npub
			recoveryData = await authService.getNostrRecoveryData(npub);
			authMethods.biometric = await checkBiometricAvailability();
			authMethods.webAuthn = await checkWebBiometricAvailability();
		} catch (err) {
			console.error('Failed to fetch recovery data:', err);
			error = 'Failed to load recovery data';
		}
	});

	async function decryptPrivateKey(event: Event) {
		event.preventDefault();

		try {
			isLoading = true;
			error = '';

			if (!currentPassword || !recoveryData) {
				error = 'Current password is required';
				return;
			}

			// Decrypt private key with current password
			try {
				privateKey = await decryptNsecWithPassword({
					encryptedPrivateKey: recoveryData.recoveryPrivateKey,
					iv: recoveryData.iv,
					authTag: recoveryData.authTag,
					password: currentPassword,
					salt: recoveryData.salt,
					iterations: recoveryData.iterations
				});
				step = 2;
			} catch (err: any) {
				console.error('Detailed decryption error:', err);
				error = err.message || 'Invalid password or encryption data';
			}
		} catch (err: any) {
			error = err.message || 'Failed to decrypt private key';
		} finally {
			isLoading = false;
		}
	}

	const setNewBiometricKey = async (npub: string, nsec: string) => {
		const deviceId = await getDeviceIdentifier();
		const { encrypted, salt, exportedKey, iterations } = await encryptNsec(nsec, deviceId);

		if (authMethods.biometric) {
			await setBiometricKey(npub, {
				key: exportedKey,
				iv: encrypted.iv,
				authTag: encrypted.authTag,
				data: encrypted.data,
				salt
			});
		} else if (authMethods.webAuthn) {
			await setWebBiometricKey(npub, {
				key: exportedKey,
				iv: encrypted.iv,
				authTag: encrypted.authTag,
				data: encrypted.data,
				salt
			});
		}
	};

	async function completeRecovery(event: Event) {
		event.preventDefault();

		try {
			isLoading = true;
			error = '';
			passwordError = '';

			if (!newPassword || !confirmPassword || !recoveryCode) {
				error = 'All fields are required';
				return;
			}

			if (newPassword !== confirmPassword) {
				passwordError = 'Passwords do not match';
				return;
			}

			const passwordValidation = validatePassword(newPassword);
			if (!passwordValidation.isValid) {
				passwordError = passwordValidation.error!;
				return;
			}

			// Encrypt private key with new password
			const { encrypted, salt, iterations } = await encryptNsec(privateKey, newPassword);

			// Complete recovery
			await authService.completeNostrRecovery({
				publicKey: npub,
				otp: recoveryCode,
				recoveryPrivateKey: encrypted.data,
				iv: encrypted.iv,
				authTag: encrypted.authTag,
				salt,
				iterations
			});

			// Set new biometric key encrypted with device ID
			await setNewBiometricKey(npub, privateKey);

			// Try to login
			const { challenge } = await authService.getLoginChallenge();
			// Sign challenge with private key
			const signedChallenge = await signLoginChallenge(challenge, privateKey);

			if (!signedChallenge) {
				throw new Error('Failed to sign login challenge');
			}

			const loginResponse = await authService.loginWithNostr(npub, challenge, signedChallenge);

			await Preferences.set({
				key: StorageKeys.ACCESS_TOKEN,
				value: loginResponse.access_token
			});

			user.updateProfile(loginResponse.user);
			authState.login();

			goto('/dashboard');
		} catch (err: any) {
			error = err.message || 'Recovery failed';
		} finally {
			isLoading = false;
		}
	}
</script>

<div
	class="bg-base-200 flex flex-grow flex-col items-center justify-center gap-4 px-4 py-10 md:pt-20"
>
	<div class="card bg-base-100 w-full max-w-md shadow-xl">
		<div class="card-body">
			<h2 class="card-title mb-6 justify-center text-2xl font-bold">Account Recovery</h2>

			{#if step === 1}
				<form onsubmit={decryptPrivateKey} class="space-y-4">
					<div class="form-control">
						<label class="label" for="currentPassword">
							<span class="label-text">Current Recovery Password</span>
						</label>
						<div class="relative">
							<input
								type={showCurrentPassword ? 'text' : 'password'}
								id="currentPassword"
								bind:value={currentPassword}
								placeholder="Enter your current recovery password"
								class="input input-bordered w-full pr-10"
								required
							/>
							<button
								type="button"
								class="absolute inset-y-0 right-0 flex items-center pr-3"
								onclick={() => (showCurrentPassword = !showCurrentPassword)}
							>
								{#if showCurrentPassword}
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
					</div>

					<button type="submit" class="btn btn-primary w-full" disabled={isLoading}>
						{#if isLoading}
							<span class="loading loading-spinner"></span>
						{:else}
							Continue
						{/if}
					</button>
					<button
						type="button"
						class="btn btn-soft w-full"
						disabled={isLoading}
						onclick={() => goto('/auth/recover/send')}
					>
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
								d="M10 19l-7-7m0 0l7-7m-7 7h18"
							/>
						</svg>
						Back to account recovery
					</button>
				</form>
			{:else if step === 2}
				<form onsubmit={completeRecovery} class="space-y-4">
					<div class="form-control">
						<label class="label" for="recoveryCode">
							<span class="label-text">Recovery Code</span>
						</label>
						<input
							type="text"
							id="recoveryCode"
							bind:value={recoveryCode}
							placeholder="Enter recovery code from your email"
							class="input input-bordered w-full"
							required
						/>
					</div>

					<div class="form-control">
						<label class="label" for="newPassword">
							<span class="label-text">New Recovery Password</span>
						</label>
						<div class="relative">
							<input
								type={showNewPassword ? 'text' : 'password'}
								id="newPassword"
								bind:value={newPassword}
								placeholder="Enter new password"
								class="input input-bordered w-full {passwordError ? 'input-error' : ''} pr-10"
								required
							/>
							<button
								type="button"
								class="absolute inset-y-0 right-0 flex items-center pr-3"
								onclick={() => (showNewPassword = !showNewPassword)}
							>
								{#if showNewPassword}
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
					</div>

					<div class="form-control">
						<label class="label" for="confirmPassword">
							<span class="label-text">Confirm New Password</span>
						</label>
						<input
							type={showNewPassword ? 'text' : 'password'}
							id="confirmPassword"
							bind:value={confirmPassword}
							placeholder="Confirm new password"
							class="input input-bordered w-full {passwordError ? 'input-error' : ''}"
							required
						/>
						{#if passwordError}
							<span class="text-error text-sm">{passwordError}</span>
						{/if}
					</div>

					<div class="alert alert-info">
						<div class="flex items-start gap-3">
							<ul class="list-inside list-disc text-sm">
								<li>Use at least 8 characters</li>
								<li>Include numbers and special characters</li>
								<li>Avoid using personal information</li>
							</ul>
						</div>
					</div>

					<button type="submit" class="btn btn-primary w-full" disabled={isLoading}>
						{#if isLoading}
							<span class="loading loading-spinner"></span>
						{:else}
							Reset Password
						{/if}
					</button>
					<button
						type="button"
						class="btn btn-soft w-full"
						disabled={isLoading}
						onclick={() => goto('/auth/recover/send')}
					>
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
								d="M10 19l-7-7m0 0l7-7m-7 7h18"
							/>
						</svg>
						Back to account recovery
					</button>
				</form>
			{/if}

			{#if error}
				<div class="alert alert-error mt-4">
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
				</div>
			{/if}
		</div>
	</div>
</div>
