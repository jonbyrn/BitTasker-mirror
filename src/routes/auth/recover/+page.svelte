<script lang="ts">
	import type { AxiosError } from 'axios';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { bytesToHex } from '@noble/hashes/utils';
	import { registerWithNostr } from '$lib/services/auth.service';
	import { validatePassword } from '$lib/utils/helpers/validators';
	import { generateSecretKey, getPublicKey } from 'nostr-tools/pure';
	import { encryptNostrPrivateKeyWithPassword } from '$lib/utils/helpers/auth';
	
	const email = page.url.searchParams.get('email') || '';

	let name = $state('');
	let password = $state('');
	let confirmPassword = $state('');
	let isLoading = $state(false);
	let error = $state('');
	let passwordError = $state('');

	async function handleSubmit(event: Event) {
		event.preventDefault();

		try {
			isLoading = true;
			error = '';
			passwordError = '';

			if (password !== confirmPassword) {
				passwordError = 'Passwords do not match';
				return;
			}

			const passwordValidation = validatePassword(password);
			if (!passwordValidation.isValid) {
				passwordError = passwordValidation.error!;
				return;
			}

			// Generate Nostr keypair
			const sk = generateSecretKey();
			const pk = getPublicKey(sk);
			const npriv = bytesToHex(sk);
			const { encrypted, salt } = await encryptNostrPrivateKeyWithPassword(npriv, password);

			const res = await registerWithNostr({
				name,
				email,
				publicKey: pk,
				encryptedPrivateKey: encrypted.data,
				iv: encrypted.iv,
				salt: salt,
				authTag: 'auth-tag-data',
				iterations: 100000,
				useBiometrics: false // Password-based registration
			});

			goto('/dashboard');
		} catch (err: any) {
			error = err.response?.data?.message || 'Registration failed';
			console.error(err);
		} finally {
			isLoading = false;
		}
	}
</script>

<div class="bg-base-200 flex min-h-screen flex-col items-center justify-center gap-4 px-4">
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

			{#if error}
				<div class="alert alert-error">
					<svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 shrink-0 stroke-current" fill="none" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
					</svg>
					<span>{error}</span>
				</div>
			{/if}

			<form onsubmit={handleSubmit} class="space-y-4">
				<div class="form-control space-y-1">
					<label class="label" for="password">
						<span class="label-text">Recovery Password</span>
					</label>
					<input
						type="password"
						id="password"
						bind:value={password}
						placeholder="Enter a strong password"
						class="input input-bordered w-full {passwordError ? 'input-error' : ''}"
						required
					/>
				</div>

				<div class="form-control space-y-1">
					<label class="label" for="confirmPassword">
						<span class="label-text">Confirm Recovery Password</span>
					</label>
					<input
						type="password"
						id="confirmPassword"
						bind:value={confirmPassword}
						placeholder="Confirm your password"
						class="input input-bordered w-full {passwordError ? 'input-error' : ''}"
						required
					/>
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
		</div>
	</div>
</div>
