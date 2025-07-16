<script lang="ts">
	import { onMount } from 'svelte';
	import { nip19 } from 'nostr-tools';
	import { getNostrKeyPair } from '$lib/utils/nostrKeys';
	import { authState } from '$lib/stores/auth.store';
	import { encryptRecoveryNsec } from '$lib/utils/helpers/auth';
	import { validateEmail, validatePassword } from '$lib/utils/helpers/validators';
	import { Preferences } from '@capacitor/preferences';
	import { StorageKeys } from '$lib/utils/constants/storage';
	import authService from '$lib/api/services/auth.service';

	let loading = $state(false);
	let error = $state('');
	let npub = $state('');
	let nsec = $state('');
	let showNsec = $state(false);
	let copySuccess = $state('');
	let authMethod = $state('');

	// Recovery setup state
	let recoveryLoading = $state(false);
	let recoveryError = $state('');
	let recoverySuccess = $state('');
	let recoveryEmail = $state('');
	let recoveryPassword = $state('');
	let confirmRecoveryPassword = $state('');
	let showRecoveryPassword = $state(false);
	let emailError = $state('');
	let passwordError = $state('');

	onMount(async () => {
		await loadKeys();
	});

	async function loadKeys() {
		try {
			loading = true;
			error = '';

			// Get the authentication method
			const { value: storedAuthMethod } = await Preferences.get({ key: StorageKeys.AUTH_METHOD });
			authMethod = storedAuthMethod || '';

			if (authMethod === 'alby') {
				// Handle Alby authentication
				if (!window?.nostr) {
					throw new Error('Alby extension not found. Please ensure Alby is installed and enabled.');
				}

				try {
					// Get public key from Alby
					const publicKey = await window.nostr.getPublicKey();
					if (!publicKey) {
						throw new Error('Unable to get public key from Alby extension.');
					}

					// Convert to npub format if it's hex
					if (publicKey.startsWith('npub')) {
						npub = publicKey;
					} else if (/^[0-9a-fA-F]{64}$/.test(publicKey)) {
						npub = nip19.npubEncode(publicKey);
					} else {
						throw new Error('Invalid public key format from Alby.');
					}

					// For Alby, we can't access the private key directly
					nsec = 'Private key managed by Alby extension';
				} catch (albyError) {
					throw new Error(
						`Alby error: ${albyError instanceof Error ? albyError.message : 'Unknown error'}`
					);
				}
			} else {
				// Handle passkey/biometric authentication
				const keyPair = await getNostrKeyPair();

				// Check if the public key is already in npub format
				if (keyPair.npub.startsWith('npub')) {
					npub = keyPair.npub;
				} else if (/^[0-9a-fA-F]{64}$/.test(keyPair.npub)) {
					// It's a hex string, convert to npub format
					npub = nip19.npubEncode(keyPair.npub);
				} else {
					throw new Error('Invalid public key format');
				}

				// Convert the private key (Uint8Array) to nsec format
				if (keyPair.nsec && keyPair.nsec instanceof Uint8Array) {
					try {
						nsec = nip19.nsecEncode(keyPair.nsec);
					} catch (err) {
						console.error('Error encoding nsec:', err);
						nsec = 'Error formatting private key';
					}
				} else {
					nsec = 'Invalid private key data';
				}
			}
		} catch (err) {
			console.error('Error loading keys:', err);
			error = err instanceof Error ? err.message : 'Failed to load keys';
		} finally {
			loading = false;
		}
	}

	async function copyToClipboard(text: string, type: 'npub' | 'nsec') {
		try {
			await navigator.clipboard.writeText(text);
			copySuccess = type;
			setTimeout(() => {
				copySuccess = '';
			}, 2000);
		} catch (err) {
			console.error('Failed to copy:', err);
		}
	}

	function toggleNsecVisibility() {
		showNsec = !showNsec;
	}

	function validateRecoveryForm(): boolean {
		emailError = '';
		passwordError = '';

		// Validate email using existing validator
		if (!recoveryEmail) {
			emailError = 'Recovery email is required';
			return false;
		}

		const emailValidation = validateEmail(recoveryEmail);
		if (!emailValidation.isValid) {
			emailError = emailValidation.error!;
			return false;
		}

		// Validate password using existing validator
		if (!recoveryPassword) {
			passwordError = 'Recovery password is required';
			return false;
		}

		if (recoveryPassword !== confirmRecoveryPassword) {
			passwordError = 'Passwords do not match';
			return false;
		}

		const passwordValidation = validatePassword(recoveryPassword);
		if (!passwordValidation.isValid) {
			passwordError = passwordValidation.error!;
			return false;
		}

		return true;
	}

	async function setupAccountRecovery(event: Event) {
		event.preventDefault();

		if (!validateRecoveryForm()) return;

		try {
			recoveryLoading = true;
			recoveryError = '';
			recoverySuccess = '';

			// Get current user's keys in proper format
			if (!nsec.startsWith('nsec') || !npub) {
				throw new Error('Invalid Nostr keys. Please refresh and try again.');
			}

			// Extract hex format from npub for API (remove npub prefix and decode)
			const { data: publicKeyHex } = nip19.decode(npub);

			// Encrypt the nsec with the recovery password
			const { encrypted } = await encryptRecoveryNsec(nsec, recoveryPassword);

			const data = {
				publicKey: publicKeyHex as string,
				recoveryPrivateKey: encrypted,
				email: recoveryEmail
			};

			await authService.setupAccountRecoveryPassword(data);

			recoverySuccess = 'Account recovery has been set up successfully!';

			// Clear the form
			recoveryEmail = '';
			recoveryPassword = '';
			confirmRecoveryPassword = '';
		} catch (err: unknown) {
			console.error('Failed to setup account recovery:', err);
			recoveryError =
				err instanceof Error ? err.message : 'Failed to setup account recovery. Please try again.';
		} finally {
			recoveryLoading = false;
		}
	}

	async function logout() {
		await authState.logout();
	}
</script>

<div class="container mx-auto max-w-4xl p-6">
	<div class="mb-8">
		<h1 class="text-base-content text-3xl font-bold">Settings</h1>
		<p class="text-base-content/70 mt-2">Manage your account settings and Nostr identity</p>
	</div>

	{#if loading}
		<div class="flex items-center justify-center py-12">
			<div class="loading loading-spinner loading-lg"></div>
		</div>
	{:else if error}
		<div class="alert alert-error mb-6">
			<div class="flex-1">
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
			<button class="btn btn-sm btn-outline btn-error" onclick={loadKeys} disabled={loading}>
				{#if loading}
					<span class="loading loading-spinner loading-sm"></span>
				{:else}
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-4 w-4"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
						/>
					</svg>
					Retry
				{/if}
			</button>
		</div>
	{:else}
		<!-- Nostr Identity Section -->
		<div class="card bg-base-100 mb-6 shadow-xl">
			<div class="card-body">
				<div class="mb-4 flex items-center gap-2">
					<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" class="h-6 w-6">
						<path
							fill="currentColor"
							d="M231.2 159.5c0 20.7 0 31.1-3.5 42.2-4.4 12.2-14 21.8-26.2 26.2-11.1 3.5-21.5 3.5-42.2 3.5H96.8c-20.7 0-31.1 0-42.2-3.5-12.2-4.4-21.8-14-26.2-26.2-3.5-11.1-3.5-21.5-3.5-42.2V97c0-20.7 0-31.1 3.5-42.2 4.4-12.2 14-21.8 26.2-26.2 11.2-3.5 21.5-3.5 42.2-3.5h62.5c20.7 0 31.1 0 42.2 3.5 12.2 4.4 21.8 14 26.2 26.2 3.5 11.2 3.5 21.5 3.5 42.2v62.5Z"
						/>
						<path
							fill="white"
							d="M210.8 199.4c0 3.1-2.5 5.7-5.7 5.7h-68c-3.1 0-5.7-2.5-5.7-5.7v-15.5c.3-19 2.3-37.2 6.5-45.5 2.5-5 6.7-7.7 11.5-9.1 9.1-2.7 24.9-.9 31.7-1.2 0 0 20.4.8 20.4-10.7s-9.1-8.6-9.1-8.6c-10 .3-17.7-.4-22.6-2.4-8.3-3.3-8.6-9.2-8.6-11.2-.4-23.1-34.5-25.9-64.5-20.1-32.8 6.2.4 53.3.4 116.1v8.4c0 3.1-2.6 5.6-5.7 5.6H57.7c-3.1 0-5.7-2.5-5.7-5.7v-144c0-3.1 2.5-5.7 5.7-5.7h31.7c3.1 0 5.7 2.5 5.7 5.7 0 4.7 5.2 7.2 9 4.5 11.4-8.2 26-12.5 42.4-12.5 36.6 0 64.4 21.4 64.4 68.7v83.2ZM150 99.3c0-6.7-5.4-12.1-12.1-12.1s-12.1 5.4-12.1 12.1 5.4 12.1 12.1 12.1S150 106 150 99.3Z"
						/>
					</svg>
					<h2 class="card-title">Nostr Identity</h2>
				</div>
				<p class="text-base-content/70 mb-6">
					Your decentralized identity on the Nostr network. Keep your private key secure!
				</p>

				<!-- Public Key (NPub) -->
				<div class="mb-6">
					<label class="label" for="npub">
						<span class="label-text font-semibold">Nostr Public Key</span>
					</label>
					<div class="flex gap-2">
						<input
							type="text"
							readonly
							value={npub}
							class="input input-bordered bg-base-200 flex-1 font-mono text-sm"
							placeholder="Loading..."
						/>
						<button
							class="btn btn-square btn-outline"
							onclick={() => copyToClipboard(npub, 'npub')}
							disabled={!npub}
						>
							{#if copySuccess === 'npub'}
								<svg
									xmlns="http://www.w3.org/2000/svg"
									class="text-success h-5 w-5"
									fill="none"
									viewBox="0 0 24 24"
									stroke="currentColor"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M5 13l4 4L19 7"
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
										d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
									/>
								</svg>
							{/if}
						</button>
					</div>
					<div class="label">
						<span class="label-text-alt text-base-content/60 whitespace-normal">
							This is your public identity on Nostr. Safe to share publicly.
						</span>
					</div>
				</div>

				<!-- Private Key (NSec) -->
				<div class="mb-4">
					<label class="label" for="nsec">
						<span class="label-text font-semibold">Nostr Private Key</span>
					</label>
					<div class="flex gap-2">
						<div class="relative flex-1">
							<input
								type={showNsec ? 'text' : 'password'}
								readonly
								value={nsec}
								class="input input-bordered bg-base-200 w-full pr-12 font-mono text-sm"
								placeholder="Loading..."
							/>
							{#if authMethod !== 'alby' && nsec !== 'Private key managed by Alby extension'}
								<button
									class="absolute inset-y-0 right-2 flex items-center"
									onclick={toggleNsecVisibility}
									disabled={!nsec}
								>
									{#if showNsec}
										<svg
											xmlns="http://www.w3.org/2000/svg"
											class="text-base-content/60 hover:text-base-content h-5 w-5"
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
											class="text-base-content/60 hover:text-base-content h-5 w-5"
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
							{/if}
						</div>
						{#if authMethod !== 'alby' && nsec !== 'Private key managed by Alby extension'}
							<button
								class="btn btn-square btn-outline"
								onclick={() => copyToClipboard(nsec, 'nsec')}
								disabled={!nsec}
							>
								{#if copySuccess === 'nsec'}
									<svg
										xmlns="http://www.w3.org/2000/svg"
										class="text-success h-5 w-5"
										fill="none"
										viewBox="0 0 24 24"
										stroke="currentColor"
									>
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											stroke-width="2"
											d="M5 13l4 4L19 7"
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
											d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
										/>
									</svg>
								{/if}
							</button>
						{/if}
					</div>
					<div class="label">
						{#if authMethod === 'alby'}
							<span class="label-text-alt text-info font-semibold whitespace-normal">
								ℹ️ Your private key is securely managed by the Alby extension and cannot be accessed
								directly.
							</span>
						{:else}
							<span class="label-text-alt text-warning font-semibold whitespace-normal">
								⚠️ Keep this private! Never share your private key with anyone.
							</span>
						{/if}
					</div>
				</div>

				<!-- Security Notice -->
				<div class="alert alert-warning mt-4 flex flex-col items-start gap-2 text-black">
					<div class="flex gap-2">
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
								d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.083 15.5c-.77.833.192 2.5 1.732 2.5z"
							/>
						</svg>
						<h3 class="font-bold">Security Reminder</h3>
					</div>
					<div class="text-sm">
						Your private key (nsec) gives full control over your Nostr identity. Store it safely and
						never share it with anyone.
					</div>
				</div>
			</div>
		</div>

		<!-- Account Recovery Section -->
		{#if authMethod !== 'alby'}
			<div class="card bg-base-100 mb-6 shadow-xl">
				<div class="card-body">
					<div class="mb-4 flex items-center gap-2">
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="h-6 w-6"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
							/>
						</svg>
						<h2 class="card-title">Account Recovery</h2>
					</div>
					<p class="text-base-content/70 mb-6">
						Set up email and password recovery to secure your account. This allows you to recover
						your account if you lose access to your primary login method.
					</p>

					<form onsubmit={setupAccountRecovery} class="space-y-4">
						<!-- Recovery Email Field -->
						<div class="form-control">
							<label class="label" for="recovery-email">
								<span class="label-text font-semibold">Recovery Email</span>
							</label>
							<input
								type="email"
								id="recovery-email"
								bind:value={recoveryEmail}
								class="input input-bordered w-full {emailError ? 'input-error' : ''}"
								placeholder="Enter your recovery email address"
								required
								disabled={recoveryLoading}
							/>
							{#if emailError}
								<label class="label" for="recovery-email">
									<span class="label-text-alt text-error">{emailError}</span>
								</label>
							{/if}
						</div>

						<!-- Recovery Password Field -->
						<div class="form-control">
							<label class="label" for="recovery-password">
								<span class="label-text font-semibold">Recovery Password</span>
							</label>
							<div class="relative">
								<input
									type={showRecoveryPassword ? 'text' : 'password'}
									id="recovery-password"
									bind:value={recoveryPassword}
									class="input input-bordered w-full pr-10 {passwordError ? 'input-error' : ''}"
									placeholder="Create a strong recovery password"
									required
									disabled={recoveryLoading}
								/>
								<button
									type="button"
									class="absolute inset-y-0 right-0 flex items-center pr-3"
									onclick={() => (showRecoveryPassword = !showRecoveryPassword)}
									disabled={recoveryLoading}
								>
									{#if showRecoveryPassword}
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

						<!-- Confirm Recovery Password Field -->
						<div class="form-control">
							<label class="label" for="confirm-recovery-password">
								<span class="label-text font-semibold">Confirm Recovery Password</span>
							</label>
							<input
								type={showRecoveryPassword ? 'text' : 'password'}
								id="confirm-recovery-password"
								bind:value={confirmRecoveryPassword}
								class="input input-bordered w-full {passwordError ? 'input-error' : ''}"
								placeholder="Confirm your recovery password"
								required
								disabled={recoveryLoading}
							/>
							{#if passwordError}
								<label class="label" for="confirm-recovery-password">
									<span class="label-text-alt text-error">{passwordError}</span>
								</label>
							{/if}
						</div>

						<!-- Password Guidelines -->
						{#if recoveryPassword}
							<div class="space-y-1 text-sm">
								<p class="font-medium">Password requirements:</p>
								<div class="flex flex-wrap gap-x-4 gap-y-1">
									<span
										class={recoveryPassword.length >= 8 ? 'text-success' : 'text-base-content/60'}
									>
										✓ 8+ characters
									</span>
									<span
										class={/[A-Z]/.test(recoveryPassword) ? 'text-success' : 'text-base-content/60'}
									>
										✓ Uppercase
									</span>
									<span
										class={/[a-z]/.test(recoveryPassword) ? 'text-success' : 'text-base-content/60'}
									>
										✓ Lowercase
									</span>
									<span
										class={/[0-9]/.test(recoveryPassword) ? 'text-success' : 'text-base-content/60'}
									>
										✓ Numbers
									</span>
									<span
										class={/[!@#$%^&*(),.?":{}|<>]/.test(recoveryPassword)
											? 'text-success'
											: 'text-base-content/60'}
									>
										✓ Special chars
									</span>
								</div>
							</div>
						{/if}

						<!-- Submit Button -->
						<div class="flex justify-end pt-4">
							<button
								type="submit"
								class="btn btn-primary"
								disabled={recoveryLoading ||
									!recoveryEmail ||
									!recoveryPassword ||
									!confirmRecoveryPassword}
							>
								{#if recoveryLoading}
									<span class="loading loading-spinner loading-sm"></span>
									Setting up recovery...
								{:else}
									Setup Account Recovery
								{/if}
							</button>
						</div>
					</form>

					{#if recoverySuccess}
						<div class="alert alert-success mb-4">
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
							<span>{recoverySuccess}</span>
						</div>
					{/if}

					{#if recoveryError}
						<div class="alert alert-error mb-4">
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
							<span>{recoveryError}</span>
						</div>
					{/if}

					<!-- Security Notice -->
					<div class="alert alert-info mt-4">
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
								d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
							/>
						</svg>
						<div class="text-sm">
							<p class="font-semibold">Important:</p>
							<p>
								Your recovery email and password will be used to restore access to your account if
								you lose your primary authentication method. Keep them secure and accessible.
							</p>
						</div>
					</div>
				</div>
			</div>
		{/if}

		<!-- Account Actions Section -->
		<div class="card bg-base-100 shadow-xl">
			<div class="card-body">
				<h2 class="card-title text-error">Account Actions</h2>
				<p class="text-base-content/70 mb-4">Manage your account settings and authentication.</p>

				<div class="flex flex-col gap-4">
					<button class="btn btn-error btn-outline" onclick={logout}>
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
								d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
							/>
						</svg>
						Logout
					</button>
				</div>
			</div>
		</div>
	{/if}
</div>
