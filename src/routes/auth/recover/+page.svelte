<script lang="ts">
	import type { AccountRecoveryData, NostrRegistrationData } from '$lib/types/auth';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { bytesToHex } from '@noble/hashes/utils';
	import { validateNostrPrivateKey, validatePassword } from '$lib/utils/helpers/validators';
	import { generateSecretKey, getPublicKey } from 'nostr-tools/pure';
	import { encryptNsec } from '$lib/utils/helpers/auth';
	import { NDKNip07Signer } from '@nostr-dev-kit/ndk';
	import { Preferences } from '@capacitor/preferences';
	import { user } from '$lib/stores/user.store';
	import { authState } from '$lib/stores/auth.store';
	import { getDeviceIdentifier } from '$lib/utils/helpers/deviceIdentity';
	import { StorageKeys } from '$lib/utils/constants/storage';
	import authService from '$lib/api/services/auth.service';

	const provider = page.url.searchParams.get('provider') || '';
	let npub = $state(page.url.searchParams.get('npub') || '');
	let token = $state(page.url.searchParams.get('token') || '');
	let nsec = $state('');
	let password = $state('');
	let confirmPassword = $state('');
	let isLoading = $state(false);
	let error = $state('');
	let passwordError = $state('');
	let showPassword = $state(false);
	let showNsec = $state(false);

	// Fetch nsec using the token
	$effect.pre(() => {
		if (token) {
			void (async () => {
				const storedNsec = await Preferences.get({ key: token });
				if (storedNsec.value) {
					nsec = storedNsec.value;
					await Preferences.remove({ key: token });
				} else {
					error = 'Recovery token expired or invalid';
					goto('/auth');
				}
			})();
		}
	});

	async function handleSubmit(event: Event) {
		event.preventDefault();

		try {
			isLoading = true;
			error = '';
			passwordError = '';

			if (!password || !confirmPassword) {
				error = 'All fields are required';
				return;
			}

			if (password !== confirmPassword) {
				passwordError = 'Passwords do not match';
				return;
			}

			const passwordValidation = validatePassword(password);
			if (!passwordValidation.isValid) {
				passwordError = passwordValidation.error!;
				return;
			}

			if (provider === 'alby') {
				const validateNsec = validateNostrPrivateKey(nsec);
				if (!validateNsec.isValid) {
					error = validateNsec.error!;
					return;
				}
			}

			if (!npub || !nsec) {
				// Generate Nostr keypair
				const sk = generateSecretKey();
				const npriv = bytesToHex(sk);
				nsec = npriv;
				npub = getPublicKey(sk);
			}

			const { encrypted, salt, iterations } = await encryptNsec(nsec, password);

			const data: AccountRecoveryData = {
				publicKey: npub,
				recoveryPrivateKey: encrypted.data,
				iv: encrypted.iv,
				authTag: encrypted.authTag,
				salt: salt,
				iterations: iterations
			};
			// if (provider === 'passkey') data.authMethod = 'passkey';

			const res = await authService.setupAccountRecoveryPassword(data);

			if (res.publicKey) {
				let accessToken: string | null = null;
				if (provider === 'alby') {
					const { challenge } = await authService.getLoginChallenge();
					const signer = new NDKNip07Signer();
					const signerUser = await signer.user();
					if (!signerUser) {
						throw new Error('No user returned from Nostr');
					}
					const event = {
						kind: 22242,
						created_at: Math.floor(Date.now() / 1000),
						content: challenge,
						tags: [],
						pubkey: signerUser.pubkey
					};
					const signedEvent = await signer.sign(event);

					const res = await authService.loginWithNostr(signerUser.pubkey, challenge, signedEvent);
					if (res.access_token) accessToken = res.access_token;
				} else if (provider === 'passkey') {
					const deviceId = await getDeviceIdentifier();
					const res = await authService.loginWithPasskey(npub, deviceId);
					if (res.access_token) accessToken = res.access_token;
				}

				if (accessToken) {
					await Preferences.set({
						key: StorageKeys.ACCESS_TOKEN,
						value: accessToken
					});
					// user.updateProfile(res.user);
					authState.login();
					goto('/onboarding');
				}
			}
		} catch (err: any) {
			error = err.message || 'Registration failed';
		} finally {
			isLoading = false;
		}
	}
</script>

<div class="bg-base-200 flex flex-col items-center justify-center gap-4 px-4 py-10 md:pt-20">
	<div class="alert alert-warning w-full max-w-md">
		<svg
			xmlns="http://www.w3.org/2000/svg"
			class="inline-block h-6 w-6 shrink-0 stroke-current"
			fill="none"
			viewBox="0 0 24 24"
			><path
				stroke-linecap="round"
				stroke-linejoin="round"
				stroke-width="2"
				d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
			/></svg
		>
		<div class="inline-block">
			<h3 class="font-bold">Important Security Notice</h3>
			<p class="text-sm">
				This password will be used to encrypt your account recovery key. If you lose this password,
				there will be no way to recover your account. Please store it securely.
			</p>
		</div>
	</div>

	<div class="card bg-base-100 w-full max-w-md shadow-xl">
		<div class="card-body">
			<h2 class="card-title mb-6 justify-center text-2xl font-bold">Complete Registration</h2>

			<form onsubmit={handleSubmit} class="space-y-4">
				<div class="form-control space-y-1">
					<label class="label" for="nsec">
						<span class="label-text">Private key</span>
					</label>
					<div class="relative">
						<input
							type={showNsec ? 'text' : 'password'}
							id="nsec"
							bind:value={nsec}
							placeholder="Enter your private nostr key"
							class="input input-bordered w-full pr-10"
							readonly={provider === 'passkey'}
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
					{#if provider === 'passkey'}
						<span class="text-info text-xs">
							This key was generated using {provider} authentication
						</span>
					{/if}
				</div>

				<div class="form-control space-y-1">
					<label class="label" for="password">
						<span class="label-text">Recovery Password</span>
					</label>
					<div class="relative">
						<input
							type={showPassword ? 'text' : 'password'}
							id="password"
							bind:value={password}
							placeholder="Enter a strong password"
							class="input input-bordered w-full pr-10 {passwordError ? 'input-error' : ''}"
							required
						/>
						<button
							type="button"
							class="absolute inset-y-0 right-0 flex items-center pr-3"
							onclick={() => (showPassword = !showPassword)}
						>
							{#if showPassword}
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

				<div class="form-control space-y-1">
					<label class="label" for="confirmPassword">
						<span class="label-text">Confirm Recovery Password</span>
					</label>
					<div class="relative">
						<input
							type={showPassword ? 'text' : 'password'}
							id="confirmPassword"
							bind:value={confirmPassword}
							placeholder="Confirm your password"
							class="input input-bordered w-full {passwordError ? 'input-error' : ''}"
							required
						/>
					</div>
					{#if passwordError}
						<span class="text-error text-sm">{passwordError}</span>
					{/if}
				</div>

				<div class="alert alert-info">
					<div class="flex items-start gap-3">
						<ul class="list-inside list-disc text-sm whitespace-nowrap">
							<li>Use at least 8 characters</li>
							<li>Include numbers and special characters</li>
							<li>Avoid using personal information</li>
							<li>Store this password in a secure place</li>
						</ul>
					</div>
				</div>

				<button type="submit" class="btn btn-primary w-full" disabled={isLoading}>
					{#if isLoading}
						<span class="loading loading-spinner"></span>
					{:else}
						Set Recovery Password
					{/if}
				</button>
			</form>

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
